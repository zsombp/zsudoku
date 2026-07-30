// The whole game as a pure reducer, deliberately outside React.
//
// Two reasons it is shaped this way. It is testable without mounting anything,
// and every player action already funnels through one place, so the Phase 5
// move log is a single hook rather than instrumentation sprinkled across a
// dozen handlers.

import { PEERS, candMaskAt, colOf, range } from '../logic/topology.js'
import { hasMark, toggleMark, removeMark, emptyMarks } from '../logic/marks.js'
import { LEGACY_LEVEL_NAME } from '../logic/difficulty.js'

export const initialState = {
  status: 'generating', // generating | playing | paused | won
  puzzle: null,
  solution: null,
  board: null,
  marks: null,
  selected: -1,
  notes: false,
  history: [],
  // What was asked for, and what the grader actually measured. Kept apart
  // everywhere, because only `graded` is ever shown to the player.
  requested: 'Medium',
  graded: 'Medium',
  score: 0,
  hardest: null,
  counts: {},
  clues: 0,
  seed: null,
  mistakes: 0,
  hints: 0,
  startedAt: null,
  elapsedMs: 0,
}

const snapshot = s => ({ board: s.board.slice(), marks: s.marks.slice(), mistakes: s.mistakes })

const canEdit = s =>
  s.board && s.status === 'playing' && s.selected >= 0 && s.puzzle[s.selected] === 0

const isSolved = (board, solution) =>
  !board.includes(0) && board.every((v, i) => v === solution[i])

export function gameReducer(state, action) {
  switch (action.type) {
    case 'generating':
      return { ...state, status: 'generating', requested: action.requested ?? state.requested }

    case 'ready': {
      const made = action.made
      return {
        ...initialState,
        status: 'playing',
        puzzle: made.puzzle,
        solution: made.solution,
        board: made.puzzle.slice(),
        marks: emptyMarks(),
        requested: made.requested,
        graded: made.graded,
        score: made.score,
        hardest: made.hardest,
        counts: made.counts,
        clues: made.clues,
        seed: made.seed,
        startedAt: action.now,
      }
    }

    case 'hydrate': {
      const s = action.saved
      return {
        ...initialState,
        status: 'playing',
        puzzle: s.puzzle,
        solution: s.solution,
        board: s.board,
        marks: Int16Array.from(s.marks),
        requested: s.requested,
        // Saves written before the six-tier rebuild carry a numeric level
        // instead of a tier name. Map them rather than dropping a game in
        // progress on the floor.
        graded: s.graded || LEGACY_LEVEL_NAME[s.level] || 'Medium',
        score: s.score ?? 0,
        hardest: s.hardest ?? null,
        counts: s.counts || {},
        clues: s.clues,
        seed: s.seed,
        mistakes: s.mistakes || 0,
        hints: s.hints || 0,
        startedAt: s.startedAt,
        elapsedMs: s.elapsedMs || 0,
      }
    }

    case 'restart':
      if (!state.puzzle) return state
      return {
        ...state,
        status: 'playing',
        board: state.puzzle.slice(),
        marks: emptyMarks(),
        history: [],
        selected: -1,
        mistakes: 0,
        hints: 0,
        elapsedMs: 0,
        startedAt: action.now,
      }

    case 'select':
      return { ...state, selected: action.index }

    case 'moveSelection': {
      if (!state.board) return state
      if (state.selected < 0) return { ...state, selected: 40 }
      let i = state.selected
      const { dx, dy } = action
      if (dy === -1 && i - 9 >= 0) i -= 9
      if (dy === 1 && i + 9 < 81) i += 9
      if (dx === -1 && colOf(i) > 0) i -= 1
      if (dx === 1 && colOf(i) < 8) i += 1
      return { ...state, selected: i }
    }

    case 'toggleNotes':
      return { ...state, notes: !state.notes }

    case 'digit': {
      if (!canEdit(state)) return state
      const v = action.value
      const i = state.selected

      // Notes mode: toggle a pencil mark, but only in an empty cell.
      if (state.notes) {
        if (state.board[i] !== 0) return state
        const marks = state.marks.slice()
        marks[i] = toggleMark(marks[i], v)
        return { ...state, marks, history: [...state.history, snapshot(state)] }
      }

      const board = state.board.slice()
      const marks = state.marks.slice()
      let mistakes = state.mistakes

      if (board[i] === v) {
        // Pressing the digit already there clears it.
        board[i] = 0
      } else {
        board[i] = v
        marks[i] = 0
        // Auto-erase this digit from every peer's pencil marks.
        for (const p of PEERS[i]) if (hasMark(marks[p], v)) marks[p] = removeMark(marks[p], v)
        if (v !== state.solution[i]) mistakes++
      }

      const next = {
        ...state,
        board,
        marks,
        mistakes,
        history: [...state.history, snapshot(state)],
      }
      if (isSolved(board, state.solution)) next.status = 'won'
      return next
    }

    case 'erase': {
      if (!canEdit(state)) return state
      const i = state.selected
      if (state.board[i] === 0 && state.marks[i] === 0) return state
      const board = state.board.slice()
      const marks = state.marks.slice()
      board[i] = 0
      marks[i] = 0
      return { ...state, board, marks, history: [...state.history, snapshot(state)] }
    }

    case 'undo': {
      if (!state.board || state.status !== 'playing' || state.history.length === 0) return state
      const prev = state.history[state.history.length - 1]
      return {
        ...state,
        board: prev.board.slice(),
        marks: prev.marks.slice(),
        mistakes: prev.mistakes,
        history: state.history.slice(0, -1),
      }
    }

    case 'autoPencil': {
      if (!state.board || state.status !== 'playing') return state
      const marks = emptyMarks()
      for (const i of range(81)) if (state.board[i] === 0) marks[i] = candMaskAt(state.board, i)
      return { ...state, marks, history: [...state.history, snapshot(state)] }
    }

    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state

    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'playing' } : state

    case 'togglePause':
      if (state.status === 'playing') return { ...state, status: 'paused' }
      if (state.status === 'paused') return { ...state, status: 'playing' }
      return state

    case 'tick':
      return { ...state, elapsedMs: action.ms }

    default:
      return state
  }
}

// ---- selectors ----

/** How many of each digit are still unplaced. Drives the number pad counts. */
export function remainingCounts(board) {
  const counts = {}
  if (board) for (const v of board) if (v) counts[v] = (counts[v] || 0) + 1
  const out = {}
  for (let v = 1; v <= 9; v++) out[v] = 9 - (counts[v] || 0)
  return out
}

/** Wrong only means "differs from the solution", and only for cells you filled. */
export const isWrong = (state, i) =>
  state.board[i] !== 0 && state.puzzle[i] === 0 && state.board[i] !== state.solution[i]

/** The grader's verdict. Never the requested tier. */
export const currentLabel = state => state.graded
