import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Board from './components/Board.jsx'
import NumberPad from './components/NumberPad.jsx'
import Toolbar from './components/Toolbar.jsx'
import StatusBar from './components/StatusBar.jsx'
import NewGameSheet from './components/NewGameSheet.jsx'
import { Moon, Sun, Play, Plus, Trophy } from './components/Icons.jsx'
import { gameReducer, initialState, remainingCounts, currentLabel } from './state/gameReducer.js'
import { makePuzzle } from './logic/generator.js'
import { techFor } from './logic/difficulty.js'
import { useTimer } from './hooks/useTimer.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useSettings } from './hooks/useSettings.js'
import { KEYS, getSync, set, requestPersistence } from './lib/storage.js'
import { fmtMs } from './lib/format.js'

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const [settings, updateSettings] = useSettings()
  const [records, setRecords] = useState(() => getSync(KEYS.records) || {})
  const [showPicker, setShowPicker] = useState(false)
  const [newRecord, setNewRecord] = useState(false)

  const timer = useTimer(state.status === 'playing', 0)

  const stateRef = useRef(state)
  stateRef.current = state
  const timerRef = useRef(timer)
  timerRef.current = timer

  const label = currentLabel(state)
  const tech = techFor(label)
  const counts = remainingCounts(state.board)
  const busy = state.status !== 'playing'

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
      level: s.level,
      clues: s.clues,
      seed: s.seed,
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
    diff => {
      setShowPicker(false)
      setNewRecord(false)
      dispatch({ type: 'generating', requested: diff })
      // Yield a frame so the veil paints before the generator blocks the thread.
      // Phase 2 moves this into a Web Worker, where it belongs.
      setTimeout(() => {
        const made = makePuzzle(diff)
        timerRef.current.reset(0)
        dispatch({ type: 'ready', made, now: Date.now() })
      }, 30)
    },
    []
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
    const saved = getSync(KEYS.game)
    if (saved?.board && saved.puzzle && saved.solution && !saved.completed) {
      dispatch({ type: 'hydrate', saved })
      timerRef.current.reset(saved.elapsedMs || 0)
    } else {
      startNew(saved?.requested || 'Medium')
    }
  }, [startNew])

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
        label={label}
        tech={tech}
        requested={state.requested}
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
          onSelect={i => dispatch({ type: 'select', index: i })}
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
            <div className="gen"><div className="spinner" />Crafting puzzle…</div>
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
            <div className="winBtns">
              <button className="bigBtn" onClick={() => startNew(label)}>Play again</button>
              <button className="bigBtn ghost" onClick={() => setShowPicker(true)}>New difficulty</button>
            </div>
          </div>
        )}
      </div>

      <Toolbar
        canUndo={state.history.length > 0}
        notes={state.notes}
        disabled={busy}
        onUndo={() => dispatch({ type: 'undo' })}
        onErase={() => dispatch({ type: 'erase' })}
        onToggleNotes={() => dispatch({ type: 'toggleNotes' })}
        onAutoPencil={() => dispatch({ type: 'autoPencil' })}
      />

      <NumberPad
        counts={counts}
        notes={state.notes}
        disabled={busy}
        onDigit={v => dispatch({ type: 'digit', value: v })}
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
        keys: 1–9 place · N notes · A auto notes · U/⌘Z undo · P pause · arrows move
      </div>

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
