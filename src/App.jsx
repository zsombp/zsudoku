import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Board from './components/Board.jsx'
import NumberPad from './components/NumberPad.jsx'
import Toolbar from './components/Toolbar.jsx'
import StatusBar from './components/StatusBar.jsx'
import NewGameSheet from './components/NewGameSheet.jsx'
import HintSummary from './components/HintSummary.jsx'
import { Moon, Sun, Play, Plus, Trophy, Sparkles } from './components/Icons.jsx'
import { gameReducer, initialState, remainingCounts, currentLabel } from './state/gameReducer.js'
import { techFor, tierForScore } from './logic/difficulty.js'
import { gradePuzzle, autoCompleteFills, hintPlacement } from './logic/grader.js'
import { GRADER_VERSION } from './logic/techniques.js'
import { useTimer } from './hooks/useTimer.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useSettings } from './hooks/useSettings.js'
import { useGenerator } from './hooks/useGenerator.js'
import { KEYS, getSync, set, requestPersistence } from './lib/storage.js'
import { fmtMs } from './lib/format.js'

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const [settings, updateSettings] = useSettings()
  const [records, setRecords] = useState(() => getSync(KEYS.records) || {})
  const [showPicker, setShowPicker] = useState(false)
  const [newRecord, setNewRecord] = useState(false)
  const [genError, setGenError] = useState(null)

  const timer = useTimer(state.status === 'playing', 0)
  const generator = useGenerator()

  const stateRef = useRef(state)
  stateRef.current = state
  const timerRef = useRef(timer)
  timerRef.current = timer

  const label = currentLabel(state)
  const tech = techFor(label)
  const counts = remainingCounts(state.board)
  const busy = state.status !== 'playing'

  // Auto-complete offers itself when the rest of the board falls to lone
  // candidates and few enough cells remain that it is mop-up. Recomputed on
  // each board change, which is cheap: it bails on the cell count before doing
  // any solving work.
  const autoFills = useMemo(
    () => (state.status === 'playing' && state.board ? autoCompleteFills(state.board) : null),
    [state.board, state.status]
  )

  // ---- persistence ----

  const persist = useCallback(() => {
    const s = stateRef.current
    if (!s.board || s.status === 'generating') return
    set(KEYS.game, {
      puzzle: s.puzzle,
      solution: s.solution,
      board: s.board,
      marks: Array.from(s.marks),
      requested: s.requested,
      graded: s.graded,
      score: s.score,
      hardest: s.hardest,
      counts: s.counts,
      clues: s.clues,
      seed: s.seed,
      graderVersion: GRADER_VERSION,
      autoCompleted: s.autoCompleted,
      hintLog: s.hintLog,
      mistakes: s.mistakes,
      hints: s.hints,
      startedAt: s.startedAt,
      elapsedMs: timerRef.current.read(),
      completed: s.status === 'won',
    })
  }, [])

  // Save whenever the position changes. Deliberately not keyed on the clock:
  // the timer is written by the ten-second interval below instead.
  useEffect(() => {
    persist()
  }, [state.board, state.marks, state.status, state.mistakes, persist])

  useEffect(() => {
    if (state.status !== 'playing') return
    const id = setInterval(persist, 10000)
    return () => clearInterval(id)
  }, [state.status, persist])

  // ---- generation ----

  const startNew = useCallback(
    async tier => {
      setShowPicker(false)
      setNewRecord(false)
      dispatch({ type: 'generating', requested: tier })
      try {
        const made = await generator.request(tier)
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now() })
      } catch (err) {
        setGenError(String(err.message || err))
      }
    },
    [generator]
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
  const onHint = useCallback(() => {
    const s = stateRef.current
    if (!s.board || s.status !== 'playing') return
    const hint = hintPlacement(s.board, s.solution)
    if (hint) dispatch({ type: 'hint', hint })
  }, [])

  const toggleQuick = useCallback(() => {
    updateSettings({ quickInput: !settings.quickInput })
    dispatch({ type: 'clearActiveDigit' })
  }, [settings.quickInput, updateSettings])

  const restart = useCallback(() => {
    setShowPicker(false)
    setNewRecord(false)
    timerRef.current.reset(0)
    dispatch({ type: 'restart', now: Date.now() })
  }, [])

  // ---- boot ----

  useEffect(() => {
    requestPersistence()
    const saved = getSync(KEYS.game)
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

  // ---- win ----

  useEffect(() => {
    if (state.status !== 'won') return
    const ms = timerRef.current.read()
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
    if (showPicker) {
      if (e.key === 'Escape') setShowPicker(false)
      return
    }
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: 'undo' }) }
      return
    }
    const k = e.key
    if (k >= '1' && k <= '9') dispatch({ type: 'digit', value: Number(k) })
    else if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); dispatch({ type: 'erase' }) }
    else if (k === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: -1 }) }
    else if (k === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 0, dy: 1 }) }
    else if (k === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: -1, dy: 0 }) }
    else if (k === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'moveSelection', dx: 1, dy: 0 }) }
    else if (k.toLowerCase() === 'n') dispatch({ type: 'toggleNotes' })
    else if (k.toLowerCase() === 'a') dispatch({ type: 'autoPencil' })
    else if (k.toLowerCase() === 'u') dispatch({ type: 'undo' })
    else if (k.toLowerCase() === 'p') dispatch({ type: 'togglePause' })
    else if (k.toLowerCase() === 'c' && autoFills) dispatch({ type: 'autoComplete', fills: autoFills })
    else if (k.toLowerCase() === 'q') toggleQuick()
    else if (k.toLowerCase() === 'h') onHint()
    else if (k === 'Escape') dispatch({ type: 'clearActiveDigit' })
  })

  // ---- render ----

  const generating = state.status === 'generating'
  const paused = state.status === 'paused'
  const won = state.status === 'won'
  const allFilledButWrong =
    state.board && !won && !state.board.includes(0)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">ZSUDOKU</div>
        <button
          className="iconBtn"
          aria-label="Toggle theme"
          onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <StatusBar
        graded={label}
        tech={tech}
        requested={state.requested}
        hardest={state.hardest}
        ms={timer.ms}
        paused={paused}
        canPause={Boolean(state.board) && !won && !generating}
        onTogglePause={() => dispatch({ type: 'togglePause' })}
      />

      <div className="boardWrap">
        <Board
          state={state}
          checkErrors={settings.checkErrors}
          blurred={paused}
          onCellTap={onCellTap}
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
              <button className="bigBtn ghost" onClick={() => setShowPicker(true)}>New difficulty</button>
            </div>
          </div>
        )}
      </div>

      {autoFills && (
        <button className="autoDone" onClick={() => dispatch({ type: 'autoComplete', fills: autoFills })}>
          <Sparkles size={16} />
          Fill the last {autoFills.length}
          {/* Not "every cell is forced" any more: under the capped cascade rule
              the cells become forced in turn rather than all at once. */}
          <span className="autoDoneSub">only lone candidates left</span>
        </button>
      )}

      <Toolbar
        canUndo={state.history.length > 0}
        notes={state.notes}
        quick={settings.quickInput}
        disabled={busy}
        onUndo={() => dispatch({ type: 'undo' })}
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
        <button className="newBtn" onClick={() => setShowPicker(true)}>
          <Plus size={15} /> New game
        </button>
      </div>

      {allFilledButWrong && (
        <div className="offMsg">All 81 filled, something is off. Keep looking.</div>
      )}

      <div className="hint">
        keys: 1–9 place · N notes · A auto · U/⌘Z undo · P pause · Q quick · H hint · arrows move
        {autoFills && ' · C complete'}
      </div>
      {settings.quickInput && (
        <div className="modeHint">
          Quick input: pick a number, then tap cells to fill them. Tap it again to put it down.
        </div>
      )}

      {showPicker && (
        <NewGameSheet
          records={records}
          canRestart={Boolean(state.puzzle)}
          onPick={startNew}
          onRestart={restart}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
