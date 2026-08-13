import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Board from './components/Board.jsx'
import NumberPad from './components/NumberPad.jsx'
import HandwritingPad from './components/HandwritingPad.jsx'
import VoiceButton from './components/VoiceButton.jsx'
import { actionsFor } from './lib/voice.js'
import Toolbar from './components/Toolbar.jsx'
import StatusBar from './components/StatusBar.jsx'
import NewGameSheet from './components/NewGameSheet.jsx'
import { recordKey } from './components/NewGameSheet.jsx'
import HintSummary from './components/HintSummary.jsx'
import { Moon, Sun, Play, Plus, Trophy, Sparkles, Chart } from './components/Icons.jsx'
import StatsView from './components/StatsView.jsx'
import GameReview from './components/GameReview.jsx'
import * as gameLog from './lib/gameLog.js'
import * as backup from './lib/backup.js'
import * as experiments from './stats/experiments.js'
import { gameReducer, initialState, remainingCounts, currentLabel, highlightDigit } from './state/gameReducer.js'
import { candMaskAt } from './logic/topology.js'
import { hasMark } from './logic/marks.js'
import { techFor, tierForScore, TIERS } from './logic/difficulty.js'
import { gradePuzzle, autoCompleteFills } from './logic/grader.js'
import { topologyFromRecord } from './logic/variants.js'
import { encodePuzzle, decodePuzzle } from './logic/share.js'
import { CAGE_TECHNIQUES, GRADER_VERSION, TECHNIQUES } from './logic/techniques.js'
import { useTimer } from './hooks/useTimer.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useSettings } from './hooks/useSettings.js'
import { useGenerator } from './hooks/useGenerator.js'
import { useHint } from './hooks/useHint.js'
import { useRace } from './hooks/useRace.js'
import { RaceOffer, RaceStrip } from './components/Race.jsx'
import { progressOf, raceState } from './stats/ghost.js'
import { KEYS, slotFor, getSync, set, requestPersistence } from './lib/storage.js'
import { fmtMs } from './lib/format.js'
import { dailyPlan, weekdayName, dailyStreak } from './logic/daily.js'
import SettingsView from './components/SettingsView.jsx'
import { Gear, Home } from './components/Icons.jsx'
import Dashboard from './components/Dashboard.jsx'
import ThemeMenu from './components/ThemeMenu.jsx'
import PracticeView from './components/PracticeView.jsx'
import Flashcards from './components/Flashcards.jsx'
import * as sound from './lib/sound.js'
import Companion from './components/Companion.jsx'
import { PLAIN, shortcutLine } from './logic/shortcuts.js'

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
    () => (state.status === 'playing' && state.board ? autoCompleteFills(state.board, { topo: state.topo }) : null),
    [state.board, state.status]
  )

  // ---- racing ----
  //
  // Auto-pencil writes a log entry the moment a board opens, so "the log is
  // empty" is not the same question as "nothing has been placed". Asking the
  // wrong one meant the offer never appeared at all with that setting on.
  const untouched = !state.moveLog.some(m => m.kind === 'place' || m.kind === 'hint')
  const race = useRace({
    puzzle: state.puzzle,
    topo: state.topo,
    elapsedMs: timer.ms,
    untouched: state.status === 'playing' && untouched,
    enabled: settings.raceOffers && state.status !== 'generating',
  })

  // Both of these are effectively free: 0.00ms each, measured over 2000 calls,
  // so they can run on every one of the timer's four ticks a second.
  const raceNow = useMemo(() => {
    if (!race.ghost || !state.board) return null
    return raceState(race.ghost, timer.ms, progressOf(state.board, state.puzzle, state.solution))
  }, [race.ghost, state.board, state.puzzle, state.solution, timer.ms])

  /**
   * Fill in every candidate the moment a board appears, if that is the setting.
   *
   * The setting has existed since Phase 6 and did nothing at all: it was in the
   * defaults, was never read anywhere, and was never even offered on the
   * settings screen. Found while wiring the experiment that varies it, which
   * would otherwise have spent thirty games measuring a switch connected to
   * nothing and reported "no difference" with a straight face.
   */
  const freshRef = useRef(null)
  useEffect(() => {
    if (state.status !== 'playing' || !state.board) return
    if (freshRef.current === state.seed) return
    freshRef.current = state.seed
    // Only on a board with nothing on it yet: resuming a saved game must not
    // overwrite the notes that were saved with it.
    if (settings.autoPencilOnStart && state.moveLog.length === 0) {
      dispatch({ type: 'autoPencil' })
    }
  }, [state.status, state.board, state.seed, state.moveLog.length, settings.autoPencilOnStart])

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
      variant: s.variant,
      regions: s.regions,
      cages: s.cages,
      practice: s.practice,
      experiment: s.experiment,
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

  /**
   * Hand the position in progress to the other device.
   *
   * Only on the way out of a game, not on every move: this writes a commit, and
   * one per placement would be absurd. Leaving the app, going home and finishing
   * a game are the moments the other device might pick it up.
   */
  const handOff = useCallback(() => {
    const s = stateRef.current
    if (!backup.loadCfg().enabled) return
    if (!s.board || s.status !== 'playing') return
    if (!(s.moveLog?.length > 0)) return
    backup
      .pushLive({
        puzzle: s.puzzle,
        solution: s.solution,
        board: s.board,
        marks: Array.from(s.marks),
        seed: s.seed,
        variant: s.variant,
        regions: s.regions,
        requested: s.requested,
        graded: s.graded,
        score: s.score,
        hardest: s.hardest,
        counts: s.counts,
        clues: s.clues,
        mode: s.mode,
        dayKey: s.dayKey,
        practice: s.practice,
        moveLog: s.moveLog,
        mistakes: s.mistakes,
        hints: s.hints,
        checks: s.checks,
        startedAt: s.startedAt,
        elapsedMs: timerRef.current.read(),
        savedAt: Date.now(),
      })
      .catch(() => {})
  }, [])

  // Leaving the tab is the commonest way a game is put down.
  useEffect(() => {
    const onHide = () => document.hidden && handOff()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [handOff])

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

  /**
   * If an experiment is running, decide which half this game belongs to and set
   * the assist accordingly before the board appears.
   *
   * Assigned per game rather than per session, and fixed for its duration: a
   * setting changed halfway through would produce a game belonging to neither
   * arm, which is worse than one belonging to the wrong one.
   */
  const enrolGame = useCallback(async () => {
    const state = experiments.load()
    const exp = state && experiments.EXPERIMENTS[state.id]
    if (!exp) return null
    const played = experiments.gamesFor(await gameLog.all(), exp.id)
    if (played.length >= exp.games) return null
    const arm = experiments.assignArm(played)
    updateSettings({ [exp.setting]: arm === 'on' })
    return { id: exp.id, arm }
  }, [updateSettings])

  const startNew = useCallback(
    async (tier, variant = settingsRef.current.variant || 'classic') => {
      setShowPicker(false)
      setNewRecord(false)
      setConfirmQuit(false)
      recordAbandon()
      updateSettings({ lastMode: 'casual', variant })
      dispatch({ type: 'generating', requested: tier, variant })
      try {
        const experiment = await enrolGame()
        const made = await generator.request(tier, { variant })
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now(), mode: 'casual', experiment })
      } catch (err) {
        setGenError(String(err.message || err))
      }
    },
    [generator, recordAbandon, updateSettings, enrolGame]
  )

  /** A deck of positions to drill one pattern against the clock. */
  const [cards, setCards] = useState(null)
  const startCards = useCallback(
    async technique => {
      setPracticing('cards:' + technique)
      setGenError(null)
      try {
        const made = await generator.deck(technique)
        setCards(made)
        setView('cards')
      } catch (err) {
        setGenError(String(err.message || err))
      } finally {
        setPracticing(null)
      }
    },
    [generator]
  )

  /**
   * A whole game built around this player's weak spots.
   *
   * The same shape as practice: it can genuinely fail, and says so rather than
   * quietly handing over an ordinary puzzle. A tailored puzzle that was not
   * tailored is worse than an honest failure.
   */
  const startTailored = useCallback(
    async wants => {
      setPracticing('tailored')
      setGenError(null)
      setNewRecord(false)
      recordAbandon()
      dispatch({ type: 'generating', requested: 'tailored' })
      setView('game')
      try {
        const made = await generator.tailored(wants, settingsRef.current.variant || 'classic')
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now(), mode: 'casual' })
      } catch (err) {
        setGenError(String(err.message || err))
      } finally {
        setPracticing(null)
      }
    },
    [generator, recordAbandon]
  )

  /**
   * A puzzle that requires a given technique.
   *
   * Not cached and not seeded: this is a request for one specific property, and
   * the rare rungs can take seconds, so the button says what it is doing rather
   * than pretending to be instant.
   */
  const startPractice = useCallback(
    async (technique, asked = 'classic') => {
      // A cage rung only exists on a killer board, so asking for one anywhere
      // else is a search that cannot succeed. The practice list no longer
      // offers them off killer, but the coach and the due card also land here
      // and neither of them picks a board, so the correction belongs at the one
      // point they all pass through.
      const variant = CAGE_TECHNIQUES.includes(technique) && asked !== 'killer' ? 'killer' : asked
      setPracticing(technique)
      setGenError(null)
      setNewRecord(false)
      recordAbandon()
      updateSettings({ lastMode: 'casual' })
      try {
        const made = await generator.practice(technique, variant)
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
        const made = await generator.request(plan.tier, { seed: plan.seed, variant: plan.variant })
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
      if (settings.quickInput) { sound.arm(); dispatch({ type: 'setActiveDigit', value: v }) }
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

  // The whole three-rung ladder, out in its own module because the sequence is
  // logic rather than layout and there was no way to test it inside a component.
  const hint = useHint({
    stateRef,
    settingsRef,
    dispatch,
    moveCount: state.moveLog.length,
    status: state.status,
    seed: state.seed,
    board: state.board,
  })
  const onHint = hint.press

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
   * A spoken move, as the actions a tap would have made.
   *
   * `actionsFor` decides the shape so the strip and the board cannot disagree
   * about what a sentence meant. Dispatching in order matters: a placement is a
   * select and then a digit, which is a tap on the cell and a press on the pad.
   */
  const onVoiceCommand = useCallback(cmd => {
    for (const action of actionsFor(cmd)) dispatch(action)
  }, [])

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

  /** Open a puzzle someone sent, from its code. */
  const startFromCode = useCallback(
    async code => {
      const p = decodePuzzle(code)
      if (!p) {
        setGenError('That does not look like a puzzle code.')
        return false
      }
      setShowPicker(false)
      setNewRecord(false)
      recordAbandon()
      dispatch({ type: 'generating', requested: p.tier, variant: p.variant })
      setView('game')
      try {
        const made = await generator.request(p.tier, { seed: p.seed, variant: p.variant })
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now(), mode: 'casual' })
        return true
      } catch (err) {
        setGenError(String(err.message || err))
        return false
      }
    },
    [generator, recordAbandon]
  )

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
      const re = gradePuzzle(saved.puzzle, {
        topo: topologyFromRecord({
          variant: saved.variant,
          regions: saved.regions,
          cages: saved.cages,
          seed: saved.seed,
        }),
      })
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

  /**
   * A position another device left, offered rather than applied.
   *
   * Never taken silently: the rule that the longer log wins is right nearly
   * always, and "nearly always" is not good enough when being wrong means
   * overwriting a game someone is in the middle of.
   */
  const [handoff, setHandoff] = useState(null)
  useEffect(() => {
    if (!backup.loadCfg().enabled) return
    let alive = true
    backup.pullLive().then(remote => {
      if (!alive || !remote) return
      const mine = getSync(slotFor('casual'))
      const verdict = backup.compareSaves(mine, remote.save)
      if (verdict.take === 'mine') return
      setHandoff({ ...remote, verdict })
    })
    return () => { alive = false }
  }, [])

  const takeHandoff = useCallback(() => {
    if (!handoff?.save) return
    set(slotFor(handoff.save.mode || 'casual'), handoff.save)
    dispatch({ type: 'hydrate', saved: handoff.save })
    timerRef.current.reset(handoff.save.elapsedMs || 0)
    setHandoff(null)
    setView('game')
  }, [handoff])

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

  // The finished-game history, for anything that predicts from it. Refreshed
  // whenever the picker or the dashboard is about to be looked at.
  const [allGames, setAllGames] = useState([])

  const [dailyInfo, setDailyInfo] = useState(() => {
    const p = dailyPlan()
    return { weekday: weekdayName(), tier: p.tier, variant: p.variant, done: false, inProgress: false, streak: 0, durationMs: 0 }
  })

  useEffect(() => {
    if (!showPicker && view !== 'home') return
    let alive = true
    const p = dailyPlan()
    gameLog.all().then(games => {
      if (!alive) return
      setAllGames(games)
      const streak = dailyStreak(games, p.key)
      const todays = games.find(g => g.daily && g.dayKey === p.key && g.completed)
      const saved = getSync(KEYS.daily)
      setDailyInfo({
        weekday: weekdayName(),
        tier: p.tier,
        // Which board today is, so the card can say so rather than surprising
        // you with an unfamiliar grid after you have tapped it.
        variant: p.variant,
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
    if (m.kind === 'place') {
      const empties = state.board ? state.board.reduce((a, v) => a + (v ? 0 : 1), 0) : 1
      if (m.correct === false && tellingYou) sound.wrong()
      else if (empties === 0) sound.lastCell()
      else sound.place()
      // Finishing a row, column or region is the small satisfaction the game
      // runs on, and until now only the animation acknowledged it.
      if (m.correct !== false && state.flash?.length) sound.unitDone()
    } else if (m.kind === 'erase' || m.kind === 'clear') sound.erase()
    else if (m.kind === 'hint') sound.hint()
    else if (m.kind === 'undo' || m.kind === 'redo') sound.undo()
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

    const key = recordKey(stateRef.current.variant || 'classic', label)
    const prev = records[key]
    if (prev === undefined || ms < prev) {
      const next = { ...records, [key]: ms }
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
    // Every shortcut that is nothing more than "dispatch this action" comes off
    // the same table the badges and the summary line are drawn from, so those
    // three cannot disagree about what a key does.
    else if (PLAIN[k.toLowerCase()]) dispatch({ type: PLAIN[k.toLowerCase()] })
    else if (k.toLowerCase() === 'c' && autoFills) dispatch({ type: 'autoComplete', fills: autoFills })
    else if (k.toLowerCase() === 'q') toggleQuick()
    // Hint moved off 'h' when hjkl arrived: movement is the whole point of
    // those four keys, and a hint is occasional. '?' is what asks for help
    // nearly everywhere else.
    else if (k === '?' || k === '/') onHint()
    else if (k.toLowerCase() === 'b') {
      dispatch({ type: e.shiftKey ? 'clearBookmark' : state.bookmark ? 'returnToBookmark' : 'bookmark' })
    }
    else if (k === 'Escape') dispatch({ type: 'clearActiveDigit' })
    // Vim keys alongside the arrows, so a hand never leaves the home row.
    else if (k === 'h') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: -1, dy: 0 }) }
    else if (k === 'j') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: 1 }) }
    else if (k === 'k') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: -1 }) }
    else if (k === 'l') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 1, dy: 0 }) }
    // Jump to the edge of the grid, the way a cursor does everywhere else.
    else if (k === 'H') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: -8, dy: 0 }) }
    else if (k === 'L') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 8, dy: 0 }) }
    else if (k === 'K') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: -8 }) }
    else if (k === 'J') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: 8 }) }
    // The next empty cell, which is what you actually want between placements.
    else if (k === 'Tab') { e.preventDefault(); dispatch({ type: 'nextEmpty', back: e.shiftKey }) }
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
        <StatsView
          onClose={() => setView('home')}
          onPractice={startPractice}
          leagueName={settings.leagueName}
          onLeagueName={n => updateSettings({ leagueName: n })}
        />
      </div>
    )
  }

  if (view === 'cards' && cards) {
    return (
      <div className="app wide">
        <Flashcards
          technique={cards.technique}
          deck={cards.deck}
          onClose={() => setView('practice')}
          onAgain={() => startCards(cards.technique)}
        />
      </div>
    )
  }

  if (view === 'practice') {
    return (
      <div className="app wide">
        <PracticeView
          onCards={startCards}
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
          handoff={
            handoff
              ? {
                  graded: handoff.save.graded,
                  variant: handoff.save.variant,
                  moves: handoff.save.moveLog?.length || 0,
                  elapsedMs: handoff.save.elapsedMs || 0,
                  reason: handoff.verdict.reason,
                  onTake: takeHandoff,
                  onIgnore: () => setHandoff(null),
                }
              : null
          }
          inProgress={
            state.board && (state.status === 'playing' || state.status === 'paused')
              ? {
                  mode: state.mode,
                  graded: label,
                  variant: state.variant,
                  tech,
                  elapsedMs: timer.ms,
                  empty: state.board.reduce((a, v) => a + (v ? 0 : 1), 0),
                }
              : null
          }
          daily={dailyInfo}
          records={records}
          variant={settings.variant || 'classic'}
          theme={settings.theme}
          onTheme={th => updateSettings({ theme: th })}
          onResume={() => setView('game')}
          onPick={(t, v) => { startNew(t, v); setView('game') }}
          onDaily={() => { startDaily(); setView('game') }}
          onStats={() => setView('stats')}
          onPractice={() => setView('practice')}
          onTailored={startTailored}
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

      {/* Between the clock and the board, because it is about the clock. One
          line, and gone the moment you close it. */}
      {!won && !lost && <RaceStrip ghost={race.ghost} race={raceNow} onStop={race.stop} />}

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
              {genError
                ? genError
                : state.requested === 'tailored'
                  ? 'Building a puzzle around your weak spots…'
                  : `Crafting a ${state.requested} puzzle…`}
              {/* Diabolical genuinely takes a while: most grids cannot be dug
                  that hard while staying solvable by logic, so it keeps trying
                  until one is. Say so rather than looking hung. */}
              {(state.requested === 'Diabolical' || state.requested === 'tailored') && !genError && (
                <span className="genSub">
                  {state.requested === 'tailored'
                    ? 'searching for one that needs the patterns you keep missing'
                    : 'these are rare, it may take a moment'}
                </span>
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
            {/* One of the two places the companion is allowed to exist, the
                other being an empty screen. It marks the end of a game and
                never appears during one: see the note in Companion.jsx. The
                rays only come out when a streak is actually running, so they
                mean something instead of firing on every win. */}
            <Companion mood={dailyInfo.streak > 1 ? 'streak' : 'solved'} size={62} />
            <Trophy size={34} className="trophy" />
            <div className="winTime">{fmtMs(timer.ms)}</div>
            <div className="winSub">
              {label} · {tech}
              {newRecord
                ? ' · new best!'
                : records[recordKey(state.variant || 'classic', label)] !== undefined
                  ? ` · best ${fmtMs(records[recordKey(state.variant || 'classic', label)])}`
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

      {/* The rung below the explanation: the words, and nothing drawn on the
          board. It sits in the same place and wears the same shape, because it
          is the same button one press earlier. */}
      {hint.ask && !state.explain && (
        <div className="explainBar askBar">
          <div className="explainText">
            <span className="explainWhy">{hint.ask.question}</span>
            <span className="explainTech">
              {hint.ask.contradiction
                ? 'Something already on the board is wrong'
                : 'Nothing is filled in and nothing is drawn yet'}
            </span>
          </div>
          <div className="explainBtns">
            <button className="newBtn" onClick={onHint}>
              {settings.explainHints || state.practice ? 'Show me the pattern' : 'Fill it in'}
            </button>
            <button className="linkBtn" onClick={hint.seen}>I see it</button>
          </div>
        </div>
      )}

      {state.explain && (
        <div className="explainBar">
          <div className="explainText">
            <span className="explainWhy">{state.explain.why}</span>
            {state.explain.technique && TECHNIQUES[state.explain.technique] && (
              <span className="explainTech">{TECHNIQUES[state.explain.technique].label}</span>
            )}
          </div>
          <div className="explainBtns">
            {/* The same press as the button, which is the point of the ladder:
                with a pattern already showing, the next rung is the digit. It
                used to reach for hintPlacement itself, which meant two places
                could disagree about what the answer was. */}
            <button className="newBtn" onClick={onHint}>Fill it in</button>
            <button className="linkBtn" onClick={() => dispatch({ type: 'clearExplain' })}>
              I see it
            </button>
          </div>
        </div>
      )}

      {race.offer && (
        <RaceOffer
          mine={race.offer.mine}
          engine={race.offer.engine}
          onRace={race.start}
          onDismiss={race.dismiss}
        />
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

      {/* Opt in only, and it goes through the same `digit` action the number
          pad and the keyboard do, so notes mode, the move log and undo all work
          without knowing where the digit came from. It never dispatches on its
          own: the player presses a button in the pad. */}
      {settings.handwriting && !won && !lost && (
        <HandwritingPad
          selected={state.selected}
          editable={!busy && state.selected >= 0 && state.puzzle?.[state.selected] === 0}
          notes={state.notes}
          onCommit={v => dispatch({ type: 'digit', value: v })}
        />
      )}

      {/* Built, tested and mounted nowhere until now, which is the failure
          `DECISIONS.md` calls a shipped feature that never reached the device.
          Every command becomes the same `select` and `digit` actions a tap
          makes, so notes mode, the move log and undo need to know nothing.

          `allowOffDevice` is deliberately not passed. Without it the button
          renders only where the browser can recognise speech on the device, and
          nowhere else, so the app keeps its promise that the GitHub backup is
          the only request it can ever make. That leaves Safari, and therefore
          the iPhone, without voice: see the note in `docs/DECISIONS.md`. */}
      <VoiceButton
        enabled={settings.voiceInput}
        disabled={busy || won || lost}
        notes={state.notes}
        onCommand={onVoiceCommand}
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

      {/* Built from the shortcut table rather than typed out beside it. The
          hand-written version listed erase under none of the three keys that
          do it. */}
      <div className="hint">
        keys: {shortcutLine({ quickInput: settings.quickInput, canComplete: Boolean(autoFills) })}
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
          onCode={startFromCode}
          // The code has to name what generation takes, which is the tier that
          // was asked for, not the one the grader returned: regenerating from
          // the graded tier produces a different puzzle. And a practice or
          // tailored puzzle comes from a different search entirely, so a tier
          // seed cannot rebuild it and no code is offered for one.
          currentCode={
            state.seed !== undefined && !state.practice && TIERS.some(t => t.name === state.requested)
              ? encodePuzzle({ variant: state.variant, tier: state.requested, seed: state.seed })
              : null
          }
          variant={settings.variant}
          games={allGames}
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
