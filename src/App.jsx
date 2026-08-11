import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Board from './components/Board.jsx'
import NumberPad from './components/NumberPad.jsx'
import Toolbar from './components/Toolbar.jsx'
import StatusBar from './components/StatusBar.jsx'
import NewGameSheet from './components/NewGameSheet.jsx'
import HintSummary from './components/HintSummary.jsx'
import { Moon, Sun, Play, Plus, Trophy, Sparkles, Chart } from './components/Icons.jsx'
import StatsView from './components/StatsView.jsx'
import GameReview from './components/GameReview.jsx'
import * as gameLog from './lib/gameLog.js'
import * as backup from './lib/backup.js'
import { gameReducer, initialState, remainingCounts, currentLabel, highlightDigit } from './state/gameReducer.js'
import { candMaskAt } from './logic/topology.js'
import { hasMark } from './logic/marks.js'
import { techFor, tierForScore } from './logic/difficulty.js'
import { gradePuzzle, autoCompleteFills, hintPlacement } from './logic/grader.js'
import { explainPlacement } from './logic/explain.js'
import { GRADER_VERSION, TECHNIQUES } from './logic/techniques.js'
import { useTimer } from './hooks/useTimer.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useSettings } from './hooks/useSettings.js'
import { useGenerator } from './hooks/useGenerator.js'
import { KEYS, slotFor, getSync, set, requestPersistence } from './lib/storage.js'
import { fmtMs } from './lib/format.js'
import { dailyPlan, weekdayName, dailyStreak } from './logic/daily.js'
import SettingsView from './components/SettingsView.jsx'
import { Gear, Home } from './components/Icons.jsx'
import Dashboard from './components/Dashboard.jsx'
import ThemeMenu from './components/ThemeMenu.jsx'
import PracticeView from './components/PracticeView.jsx'
import * as sound from './lib/sound.js'

export default function App() {
  const [state, rawDispatch] = useReducer(gameReducer, initialState)
  const [settings, updateSettings] = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const [records, setRecords] = useState(() => getSync(KEYS.records) || {})
  const [showPicker, setShowPicker] = useState(false)
  const [newRecord, setNewRecord] = useState(false)
  // The record for the game that just ended, so the review can open straight
  // from the end screen instead of being hunted for in the statistics tab.
  const [lastGame, setLastGame] = useState(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [genError, setGenError] = useState(null)
  const [practicing, setPracticing] = useState(null)

  // The clock runs only while you are actually looking at the board. It used
  // to keep counting while you browsed the stats or sat on the dashboard,
  // because "playing" only meant "not paused". Leaving the tab was already
  // handled; leaving the game screen was not.
  const [view, setViewRaw] = useState('home')
  const setView = setViewRaw
  const timer = useTimer(state.status === 'playing' && view === 'game', 0)
  const generator = useGenerator()

  const stateRef = useRef(state)
  stateRef.current = state
  const timerRef = useRef(timer)
  timerRef.current = timer

  // Every action carries the elapsed game time, which is what the move log
  // records. It has to come from here rather than from inside the reducer,
  // because the reducer is pure and pure functions do not read a clock.
  // Elapsed rather than wall-clock, so it survives pauses and says something
  // about the solve rather than about the calendar.
  const dispatch = useCallback(action => {
    rawDispatch({ ...action, t: timerRef.current?.read?.() ?? 0 })
  }, [])

  const label = currentLabel(state)
  const tech = techFor(label)
  const counts = remainingCounts(state.board)
  const busy = state.status !== 'playing'

  // Auto-complete offers itself when the rest of the board falls to lone
  // candidates and few enough cells remain that it is mop-up. Recomputed on
  // each board change, which is cheap: it bails on the cell count before doing
  // any solving work.
  // Where the highlighted digit could legally still go. Answers the question
  // you actually ask when you pick up a digit, and it reads the board rather
  // than the pencil marks so it is right even if you have not pencilled.
  const canGo = useMemo(() => {
    if (!settings.candidateHints || !state.board || state.status !== 'playing') return null
    const d = highlightDigit(state)
    if (!d) return null
    const out = new Set()
    for (let i = 0; i < 81; i++) {
      if (state.board[i] !== 0) continue
      // A cell already showing this digit as a pencil mark is telling you the
      // same thing, and the mark is highlighted anyway. Ringing it too was
      // stating the fact twice and turned an auto-pencilled board into noise:
      // 33 rings, nearly all of them redundant. The ring now means "this digit
      // fits here and you have not noted it", which is the part worth seeing.
      if (hasMark(state.marks[i], d)) continue
      if (hasMark(candMaskAt(state.board, i), d)) out.add(i)
    }
    return out
  }, [state.board, state.marks, state.status, state.activeDigit, state.selected, settings.candidateHints])

  const autoFills = useMemo(
    () => (state.status === 'playing' && state.board ? autoCompleteFills(state.board) : null),
    [state.board, state.status]
  )

  // ---- persistence ----

  const persist = useCallback(() => {
    const s = stateRef.current
    if (!s.board || s.status === 'generating') return
    set(slotFor(s.mode), {
      puzzle: s.puzzle,
      solution: s.solution,
      board: s.board,
      marks: Array.from(s.marks),
      requested: s.requested,
      graded: s.graded,
      mode: s.mode,
      practice: s.practice,
      dayKey: s.dayKey,
      score: s.score,
      hardest: s.hardest,
      counts: s.counts,
      clues: s.clues,
      seed: s.seed,
      graderVersion: GRADER_VERSION,
      autoCompleted: s.autoCompleted,
      hintLog: s.hintLog,
      // Without this a game resumed after a reload loses its whole move log,
      // and the analytics for that game would be silently wrong rather than
      // missing, which is worse.
      moveLog: s.moveLog,
      // Undo used to die on reload. Capped at the last 50 states: a full stack
      // of board+marks snapshots runs to a few hundred KB over a long game,
      // which is not worth writing every ten seconds for undos nobody reaches.
      history: s.history.slice(-50).map(h => ({
        board: h.board,
        marks: Array.from(h.marks),
        mistakes: h.mistakes,
        stripped: h.stripped,
      })),
      stripped: s.stripped,
      checks: s.checks,
      bookmark: s.bookmark ? { ...s.bookmark, marks: Array.from(s.bookmark.marks) } : null,
      tints: s.tints,
      // Paused used to resume running on reload, with the clock going.
      status: s.status,
      mistakes: s.mistakes,
      hints: s.hints,
      startedAt: s.startedAt,
      elapsedMs: timerRef.current.read(),
      // Means "over, do not resume" rather than "won": a game you gave up on
      // must not come back as a game in progress.
      completed: s.status === 'won' || s.status === 'lost',
    })
  }, [])

  // Save whenever the position changes. Deliberately not keyed on the clock:
  // the timer is written by the ten-second interval below instead.
  //
  // Tints and the bookmark are in here because they are state the player
  // created: without them, tinting a run of cells and closing the app lost the
  // lot, since nothing else had changed to trigger a write.
  useEffect(() => {
    persist()
  }, [state.board, state.marks, state.status, state.mistakes, state.tints, state.bookmark, persist])

  useEffect(() => {
    if (state.status !== 'playing') return
    const id = setInterval(persist, 10000)
    return () => clearInterval(id)
  }, [state.status, persist])

  // ---- generation ----

  /**
   * Push to GitHub after a game ends, if it is switched on.
   *
   * Fire and forget, and deliberately silent: a backup that failed is worth
   * knowing about on the settings screen, not in the middle of the win
   * animation. The error is stored, and the dashboard says so if it persists.
   */
  const pushBackup = useCallback(() => {
    if (!backup.loadCfg().enabled) return
    gameLog.syncNow().catch(() => {})
  }, [])

  /**
   * Abandoning is a result. Recording only wins would make the win rate
   * meaningless. Switching to the daily does NOT abandon: that game keeps its
   * own slot and is still there when you come back.
   */
  const recordAbandon = useCallback(() => {
    const prev = stateRef.current
    if (prev.status === 'playing' && gameLog.worthRecording(prev)) {
      gameLog
        .record(prev, {
          completed: false,
          durationMs: timerRef.current.read(),
          endedAt: Date.now(),
        })
        .then(pushBackup)
    }
  }, [pushBackup])

  const startNew = useCallback(
    async tier => {
      setShowPicker(false)
      setNewRecord(false)
      setConfirmQuit(false)
      recordAbandon()
      updateSettings({ lastMode: 'casual' })
      dispatch({ type: 'generating', requested: tier })
      try {
        const made = await generator.request(tier)
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now(), mode: 'casual' })
      } catch (err) {
        setGenError(String(err.message || err))
      }
    },
    [generator, recordAbandon, updateSettings]
  )

  /**
   * A puzzle that requires a given technique.
   *
   * Not cached and not seeded: this is a request for one specific property, and
   * the rare rungs can take seconds, so the button says what it is doing rather
   * than pretending to be instant.
   */
  const startPractice = useCallback(
    async technique => {
      setPracticing(technique)
      setGenError(null)
      setNewRecord(false)
      recordAbandon()
      updateSettings({ lastMode: 'casual' })
      try {
        const made = await generator.practice(technique)
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now(), mode: 'casual', practice: technique })
        setView('game')
      } catch (err) {
        setGenError(String(err.message || err))
      } finally {
        setPracticing(null)
      }
    },
    [generator, recordAbandon, updateSettings]
  )

  /**
   * Today's puzzle. Seeded from the date, so it is the same on every device
   * with no server involved, and the same every time you come back to it.
   *
   * Its own save slot, so opening it never costs you a casual game in progress.
   */
  const startDaily = useCallback(
    async () => {
      setShowPicker(false)
      setNewRecord(false)
      const plan = dailyPlan()
      updateSettings({ lastMode: 'daily' })

      // Resume today's daily if it is already underway or finished.
      const saved = getSync(KEYS.daily)
      if (saved?.board && saved.dayKey === plan.key) {
        dispatch({ type: 'hydrate', saved })
        timerRef.current.reset(saved.elapsedMs || 0)
        return
      }

      dispatch({ type: 'generating', requested: plan.tier })
      try {
        const made = await generator.request(plan.tier, { seed: plan.seed })
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now(), mode: 'daily', dayKey: plan.key })
      } catch (err) {
        setGenError(String(err.message || err))
      }
    },
    [generator, updateSettings]
  )

  // ---- input mode ----
  //
  // Cell-first (the default): tap a cell, then a digit.
  // Quick input: tap a digit to arm it, then every cell you tap gets it.
  //
  // The keyboard stays cell-first in both modes. Digit keys place into the
  // selected cell, which is what someone at a keyboard expects, and arming a
  // brush only saves taps on a touchscreen anyway.

  const onPadDigit = useCallback(
    v => {
      if (settings.quickInput) dispatch({ type: 'setActiveDigit', value: v })
      else dispatch({ type: 'digit', value: v })
    },
    [settings.quickInput]
  )

  const onCellTap = useCallback(
    i => {
      // With nothing armed, quick input behaves exactly like cell-first, so
      // there is always a way to just look at a cell.
      if (settings.quickInput && stateRef.current.activeDigit) dispatch({ type: 'quickPlace', index: i })
      else dispatch({ type: 'select', index: i })
    },
    [settings.quickInput]
  )

  // One tap, one number. Computed on demand rather than on every render,
  // because unlike auto-complete this runs the whole ladder.
  /**
   * One tap, one number, unless you asked to be taught.
   *
   * With explanations on, the first press points at the pattern and fills
   * nothing in; the second press gives up the digit. Phase 3 settled that the
   * plain hint is the better default for flow and that still holds, so this is a
   * rung below it rather than a replacement. Practice mode forces it on: a
   * drill that hands you the answer is not a drill.
   */
  const onHint = useCallback(() => {
    const s = stateRef.current
    if (!s.board || s.status !== 'playing') return
    const hint = hintPlacement(s.board, s.solution)
    if (!hint) return

    const teaching = settingsRef.current.explainHints || Boolean(s.practice)
    if (teaching && !s.explain) {
      const ex = explainPlacement(s.board, hint.cell, hint.digit)
      // Nothing proves it, which in practice means a wrong digit is poisoning
      // the position. There is nothing honest to point at, so just place it.
      if (ex) {
        dispatch({ type: 'explain', explain: { ...ex, cell: hint.cell, digit: hint.digit } })
        return
      }
    }
    dispatch({ type: 'hint', hint })
  }, [])

  // "Check" flashes the wrong digits for a moment rather than marking them
  // permanently, so it stays a deliberate act you can count instead of an
  // always-on safety net. Recorded, because it is help.
  const [revealWrong, setRevealWrong] = useState(false)
  const revealTimer = useRef(null)
  const onCheck = useCallback(() => {
    if (stateRef.current.status !== 'playing') return
    dispatch({ type: 'check' })
    setRevealWrong(true)
    clearTimeout(revealTimer.current)
    revealTimer.current = setTimeout(() => setRevealWrong(false), 1600)
  }, [])
  useEffect(() => () => clearTimeout(revealTimer.current), [])

  const toggleQuick = useCallback(() => {
    updateSettings({ quickInput: !settings.quickInput })
    dispatch({ type: 'clearActiveDigit' })
  }, [settings.quickInput, updateSettings])

  /**
   * Giving up. A recorded result like any other, so the win rate stays honest,
   * and the board reveals itself afterwards because the only reason to give up
   * is wanting to know.
   */
  const forfeit = useCallback(() => {
    const prev = stateRef.current
    if (prev.status !== 'playing' && prev.status !== 'paused') return
    setConfirmQuit(false)
    dispatch({ type: 'forfeit' })
    if (!gameLog.worthRecording(prev)) return
    const rec = gameLog.buildRecord(
      { ...prev, forfeited: true },
      { completed: false, durationMs: timerRef.current.read(), endedAt: Date.now() }
    )
    gameLog.saveRecord(rec).then(pushBackup)
    setLastGame(rec)
  }, [pushBackup])

  const restart = useCallback(() => {
    setShowPicker(false)
    setNewRecord(false)
    timerRef.current.reset(0)
    dispatch({ type: 'restart', now: Date.now() })
  }, [])

  // ---- boot ----

  useEffect(() => {
    requestPersistence()
    // Come back to whichever slot you left, but never to yesterday's daily.
    const wantDaily = settings.lastMode === 'daily'
    const dailySave = getSync(KEYS.daily)
    const saved =
      wantDaily && dailySave?.dayKey === dailyPlan().key ? dailySave : getSync(KEYS.game)
    const tier = saved?.requested || 'Medium'
    // A game saved under an older grader carries a score and tier from a
    // scoring system that no longer exists. Regrade it rather than showing a
    // label nothing can reproduce.
    if (saved?.puzzle && saved.graderVersion !== GRADER_VERSION) {
      const re = gradePuzzle(saved.puzzle)
      saved.score = re.score
      saved.hardest = re.hardest
      saved.counts = re.counts
      saved.graded = tierForScore(re.score)?.name || 'Medium'
    }
    if (saved?.board && saved.puzzle && saved.solution && !saved.completed) {
      dispatch({ type: 'hydrate', saved })
      timerRef.current.reset(saved.elapsedMs || 0)
      // Start building the next one now, while there is a game to play.
      generator.prefetch(tier)
    } else {
      startNew(tier)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconcile with the other device whenever the app comes back. A full pass,
  // so a month this device has never seen still arrives: that is the whole
  // difference between a backup and a sync.
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== 'visible') return
      if (!backup.loadCfg().enabled) return
      gameLog.syncNow({ full: true }).catch(() => {})
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [])

  // ---- honest timing ----
  // Leaving the app pauses the game. Anything else would count time you were
  // not playing, and every statistic downstream inherits that.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) dispatch({ type: 'pause' })
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  // ---- daily ----
  //
  // Loaded when the sheet opens rather than on every render: it reads the
  // history out of IndexedDB and nothing else needs it.

  const [dailyInfo, setDailyInfo] = useState(() => {
    const p = dailyPlan()
    return { weekday: weekdayName(), tier: p.tier, done: false, inProgress: false, streak: 0, durationMs: 0 }
  })

  useEffect(() => {
    if (!showPicker && view !== 'home') return
    let alive = true
    const p = dailyPlan()
    gameLog.all().then(games => {
      if (!alive) return
      const streak = dailyStreak(games, p.key)
      const todays = games.find(g => g.daily && g.dayKey === p.key && g.completed)
      const saved = getSync(KEYS.daily)
      setDailyInfo({
        weekday: weekdayName(),
        tier: p.tier,
        done: Boolean(todays),
        inProgress: Boolean(saved?.board && saved.dayKey === p.key && !todays),
        streak: streak.current,
        durationMs: todays?.durationMs || 0,
      })
    })
    return () => { alive = false }
  }, [showPicker, view])

  // ---- sound ----

  useEffect(() => {
    sound.setEnabled(settings.sound)
  }, [settings.sound])

  // Driven off the move log rather than sprinkled through the handlers: the
  // log already knows exactly what just happened, including whether it was
  // right, so one effect covers every input path there is.
  const lastMoveRef = useRef(0)
  useEffect(() => {
    const log = state.moveLog
    if (log.length <= lastMoveRef.current) {
      lastMoveRef.current = log.length
      return
    }
    lastMoveRef.current = log.length
    const m = log[log.length - 1]
    if (!m || state.status === 'won') return
    // The wrong-digit sound gave the answer away even with mistake marking
    // turned off, and during a bookmarked branch, where the whole point is that
    // you are speculating. If the board is not telling you, neither is the
    // speaker.
    const tellingYou = settings.checkErrors && !state.bookmark
    if (m.kind === 'place') (m.correct === false && tellingYou ? sound.wrong : sound.place)()
    else if (m.kind === 'erase' || m.kind === 'clear') sound.erase()
    else if (m.kind === 'hint') sound.hint()
  }, [state.moveLog, state.status, settings.checkErrors, state.bookmark])

  // ---- win ----

  useEffect(() => {
    if (state.status !== 'won') return
    sound.win()
    const ms = timerRef.current.read()

    const rec = gameLog.buildRecord(stateRef.current, {
      completed: true,
      durationMs: ms,
      endedAt: Date.now(),
    })
    gameLog.saveRecord(rec).then(pushBackup)
    setLastGame(rec)

    const prev = records[label]
    if (prev === undefined || ms < prev) {
      const next = { ...records, [label]: ms }
      setRecords(next)
      set(KEYS.records, next)
      setNewRecord(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  // ---- keyboard ----

  useKeyboard(e => {
    // Game keys only reach the reducer on the game screen. Without this the
    // handler stays subscribed behind Stats and Settings, where pressing H
    // silently spends hints and A overwrites the player's pencil marks on a
    // board they cannot see. Hints count toward the "clean solve" figure, so a
    // stray keystroke on the wrong screen was quietly disqualifying games.
    if (view !== 'game') return

    if (showPicker) {
      if (e.key === 'Escape') setShowPicker(false)
      return
    }
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        // Shift-Cmd-Z is redo everywhere else, so it is redo here.
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      }
      return
    }
    const k = e.key
    // Quick input means the same thing on a keyboard as it does under a thumb:
    // a digit key arms the brush, it does not place. Filling stays with the
    // cell, whether you click it or press Enter on it.
    //
    // This reverses the Phase 3 decision, which kept the keyboard cell-first on
    // the grounds that arming only saves taps on a touchscreen. True, but it
    // made one setting mean two different things depending on what you were
    // typing on, which is worse than the efficiency it bought.
    if (k >= '1' && k <= '9') {
      if (settings.quickInput) dispatch({ type: 'setActiveDigit', value: Number(k) })
      else dispatch({ type: 'digit', value: Number(k) })
    } else if ((k === 'Enter' || k === ' ') && settings.quickInput && state.selected >= 0) {
      e.preventDefault()
      dispatch({ type: 'quickPlace', index: state.selected })
    }
    else if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); dispatch({ type: 'erase' }) }
    else if (k === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: -1 }) }
    else if (k === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: 1 }) }
    else if (k === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: -1, dy: 0 }) }
    else if (k === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 1, dy: 0 }) }
    else if (k.toLowerCase() === 'n') dispatch({ type: 'toggleNotes' })
    else if (k.toLowerCase() === 'a') dispatch({ type: 'autoPencil' })
    else if (k.toLowerCase() === 'u') dispatch({ type: 'undo' })
    else if (k.toLowerCase() === 'r') dispatch({ type: 'redo' })
    else if (k.toLowerCase() === 'p') dispatch({ type: 'togglePause' })
    else if (k.toLowerCase() === 'c' && autoFills) dispatch({ type: 'autoComplete', fills: autoFills })
    else if (k.toLowerCase() === 'q') toggleQuick()
    else if (k.toLowerCase() === 'h') onHint()
    else if (k.toLowerCase() === 'b') {
      dispatch({ type: e.shiftKey ? 'clearBookmark' : state.bookmark ? 'returnToBookmark' : 'bookmark' })
    }
    else if (k === 'Escape') dispatch({ type: 'clearActiveDigit' })
  })

  // ---- render ----

  const generating = state.status === 'generating'
  const paused = state.status === 'paused'
  const won = state.status === 'won'
  const lost = state.status === 'lost'
  const allFilledButWrong =
    state.board && !won && !lost && !state.board.includes(0)

  if (view === 'review' && lastGame) {
    return (
      <div className="app wide">
        <GameReview game={lastGame} onBack={() => setView('game')} onPractice={startPractice} />
      </div>
    )
  }

  if (view === 'stats') {
    return (
      <div className="app wide">
        <StatsView onClose={() => setView('home')} onPractice={startPractice} />
      </div>
    )
  }

  if (view === 'practice') {
    return (
      <div className="app wide">
        <PracticeView
          busyWith={practicing}
          error={genError}
          onPractice={startPractice}
          onClose={() => setView('home')}
        />
      </div>
    )
  }

  if (view === 'settings') {
    return (
      <div className="app wide">
        <SettingsView
          settings={settings}
          updateSettings={updateSettings}
          onClose={() => setView('home')}
        />
      </div>
    )
  }

  if (view === 'home') {
    return (
      <div className="app wide">
        <Dashboard
          inProgress={
            state.board && (state.status === 'playing' || state.status === 'paused')
              ? {
                  mode: state.mode,
                  graded: label,
                  tech,
                  elapsedMs: timer.ms,
                  empty: state.board.reduce((a, v) => a + (v ? 0 : 1), 0),
                }
              : null
          }
          daily={dailyInfo}
          records={records}
          theme={settings.theme}
          onTheme={th => updateSettings({ theme: th })}
          onResume={() => setView('game')}
          onPick={t => { startNew(t); setView('game') }}
          onDaily={() => { startDaily(); setView('game') }}
          onStats={() => setView('stats')}
          onPractice={() => setView('practice')}
          onSettings={() => setView('settings')}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <button className="iconBtn" aria-label="Home" onClick={() => setView('home')}>
          <Home size={17} />
        </button>
        <div className="brand">{state.mode === 'daily' ? 'DAILY' : 'ZSUDOKU'}</div>
        <div className="topBtns">
          <button className="iconBtn" aria-label="Statistics" onClick={() => setView('stats')}>
            <Chart size={17} />
          </button>
          <ThemeMenu theme={settings.theme} onPick={t => updateSettings({ theme: t })} />
          <button className="iconBtn" aria-label="Settings" onClick={() => setView('settings')}>
            <Gear size={17} />
          </button>
        </div>
      </header>

      <div className="play">
      <div className="playMain">
      <StatusBar
        graded={label}
        tech={tech}
        requested={state.requested}
        hardest={state.hardest}
        ms={timer.ms}
        paused={paused}
        canPause={Boolean(state.board) && !won && !lost && !generating}
        onTogglePause={() => dispatch({ type: 'togglePause' })}
      />

      <div className="boardWrap">
        <Board
          state={state}
          checkErrors={settings.checkErrors && !state.bookmark}
          reveal={lost}
          canGo={canGo}
          revealWrong={revealWrong}
          blurred={paused}
          onCellTap={onCellTap}
          onCellTint={i => dispatch({ type: 'cycleTint', index: i })}
        />

        {paused && (
          <div className="veil">
            <button className="bigBtn" onClick={() => dispatch({ type: 'resume' })}>
              <Play size={18} /> Resume
            </button>
          </div>
        )}

        {generating && (
          <div className="veil">
            <div className="gen">
              <div className="spinner" />
              {genError ? genError : `Crafting a ${state.requested} puzzle…`}
              {/* Diabolical genuinely takes a while: most grids cannot be dug
                  that hard while staying solvable by logic, so it keeps trying
                  until one is. Say so rather than looking hung. */}
              {state.requested === 'Diabolical' && !genError && (
                <span className="genSub">these are rare, it may take a moment</span>
              )}
            </div>
          </div>
        )}

        {lost && (
          <div className="veil lost">
            <div className="lostTitle">Gave up</div>
            <div className="winSub">
              {label} · {tech} · {fmtMs(timer.ms)}
            </div>
            <div className="lostBody">
              The rest of the grid is filled in below. It counts as a loss, which
              is the only way the win rate means anything.
            </div>
            <div className="winBtns">
              <button className="bigBtn" onClick={() => startNew(label)}>Play again</button>
              {lastGame && (
                <button className="bigBtn ghost" onClick={() => setView('review')}>Review</button>
              )}
              <button className="bigBtn ghost" onClick={() => setShowPicker(true)}>New game</button>
            </div>
          </div>
        )}

        {won && (
          <div className="veil win">
            <Trophy size={34} className="trophy" />
            <div className="winTime">{fmtMs(timer.ms)}</div>
            <div className="winSub">
              {label} · {tech}
              {newRecord
                ? ' · new best!'
                : records[label] !== undefined
                  ? ` · best ${fmtMs(records[label])}`
                  : ''}
            </div>
            <HintSummary hintLog={state.hintLog} mistakes={state.mistakes} />
            <div className="winBtns">
              <button className="bigBtn" onClick={() => startNew(label)}>Play again</button>
              {/* The review used to be buried in the statistics tab, which is
                  the one moment nobody goes looking for it. */}
              {lastGame && (
                <button className="bigBtn ghost" onClick={() => setView('review')}>Review</button>
              )}
              <button className="bigBtn ghost" onClick={() => setShowPicker(true)}>New game</button>
            </div>
          </div>
        )}
      </div>

      {state.explain && (
        <div className="explainBar">
          <div className="explainText">
            <span className="explainWhy">{state.explain.why}</span>
            {state.explain.technique && TECHNIQUES[state.explain.technique] && (
              <span className="explainTech">{TECHNIQUES[state.explain.technique].label}</span>
            )}
          </div>
          <div className="explainBtns">
            <button
              className="newBtn"
              onClick={() => {
                const s = stateRef.current
                dispatch({ type: 'hint', hint: hintPlacement(s.board, s.solution) })
              }}
            >
              Fill it in
            </button>
            <button className="linkBtn" onClick={() => dispatch({ type: 'clearExplain' })}>
              I see it
            </button>
          </div>
        </div>
      )}

      {autoFills && (
        <button className="autoDone" onClick={() => dispatch({ type: 'autoComplete', fills: autoFills })}>
          <Sparkles size={16} />
          Fill the last {autoFills.length}
          {/* Not "every cell is forced" any more: under the capped cascade rule
              the cells become forced in turn rather than all at once. */}
          <span className="autoDoneSub">only lone candidates left</span>
        </button>
      )}
      </div>

      <div className="playSide">
      <Toolbar
        canUndo={state.history.length > 0}
        canRedo={state.future.length > 0}
        notes={state.notes}
        quick={settings.quickInput}
        showCheck={!settings.checkErrors}
        hasBookmark={Boolean(state.bookmark)}
        onBookmark={() => dispatch({ type: state.bookmark ? 'returnToBookmark' : 'bookmark' })}
        disabled={busy}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onCheck={onCheck}
        onErase={() => dispatch({ type: 'erase' })}
        onToggleNotes={() => dispatch({ type: 'toggleNotes' })}
        onAutoPencil={() => dispatch({ type: 'autoPencil' })}
        onToggleQuick={toggleQuick}
        onHint={onHint}
      />

      <NumberPad
        counts={counts}
        notes={state.notes}
        quick={settings.quickInput}
        activeDigit={state.activeDigit}
        disabled={busy}
        onDigit={onPadDigit}
      />

      <div className="footRow">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.checkErrors}
            onChange={e => updateSettings({ checkErrors: e.target.checked })}
          />
          <span>Show mistakes</span>
        </label>
        <div className="footBtns">
          {!won && !lost && !generating && state.moveLog.length > 0 && (
            confirmQuit ? (
              <span className="quitAsk">
                Give up?
                <button className="linkBtn danger" onClick={forfeit}>yes</button>
                <button className="linkBtn" onClick={() => setConfirmQuit(false)}>no</button>
              </span>
            ) : (
              <button className="linkBtn" onClick={() => setConfirmQuit(true)}>Give up</button>
            )
          )}
          <button className="newBtn" onClick={() => setShowPicker(true)}>
            <Plus size={15} /> New game
          </button>
        </div>
      </div>

      {allFilledButWrong && (
        <div className="offMsg">All 81 filled, something is off. Keep looking.</div>
      )}

      <div className="hint">
        keys: {settings.quickInput ? '1–9 pick · Enter place' : '1–9 place'} · N notes · A auto · U undo · R redo · P pause · Q quick · H hint · B mark · arrows move
        {autoFills && ' · C complete'}
      </div>
      {settings.quickInput && (
        <div className="modeHint">
          Quick input: pick a number with the pad or the number keys, then tap cells (or press Enter) to fill them. Pick it again to put it down.
        </div>
      )}
      </div>
      </div>

      {showPicker && (
        <NewGameSheet
          records={records}
          canRestart={Boolean(state.puzzle)}
          daily={dailyInfo}
          onPick={startNew}
          onDaily={startDaily}
          onRestart={restart}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
