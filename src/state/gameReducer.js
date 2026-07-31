// The whole game as a pure reducer, deliberately outside React.
//
// Two reasons it is shaped this way. It is testable without mounting anything,
// and every player action already funnels through one place, so the Phase 5
// move log is a single hook rather than instrumentation sprinkled across a
// dozen handlers.

import { PEERS, UNITS, candMaskAt, colOf, range } from '../logic/topology.js'
import { hasMark, toggleMark, removeMark, addMark, emptyMarks } from '../logic/marks.js'
import { LEGACY_LEVEL_NAME } from '../logic/difficulty.js'

export const initialState = {
  status: 'generating', // generating | playing | paused | won
  puzzle: null,
  solution: null,
  board: null,
  marks: null,
  selected: -1,
  notes: false,
  // Quick input: the digit currently armed on the number pad, 0 for none.
  activeDigit: 0,
  history: [],
  // Redo. Undo alone means over-undoing costs you retyping by hand.
  future: [],
  // Which peers each placed digit took a pencil mark from, so erasing it can
  // put them back exactly. Keyed by the cell holding the digit.
  stripped: {},
  // How many times the board was checked. An assist, so it is counted.
  checks: 0,
  // A saved position to come back to. On a Diabolical puzzle you sometimes
  // commit to a branch, and twenty undos is a clumsy way to get back.
  bookmark: null,
  // Player-applied cell tints, for tracking a chain by hand. Cell index -> 1..4.
  tints: {},
  // What was asked for, and what the grader actually measured. Kept apart
  // everywhere, because only `graded` is ever shown to the player.
  requested: 'Medium',
  graded: 'Medium',
  // Which slot this game belongs to. The daily gets its own save so starting it
  // never destroys a casual game in progress.
  mode: 'casual', // casual | daily
  dayKey: null,
  score: 0,
  hardest: null,
  counts: {},
  clues: 0,
  seed: null,
  mistakes: 0,
  hints: 0,
  // Which technique each hint stood in for. Not shown during play; it feeds the
  // post-game summary, which is where teaching belongs.
  hintLog: [],
  // The cell the last hint filled, so it can be marked. Cleared by the next move.
  hintCell: -1,
  // Cells of a row, column or box just completed, for the flash.
  flash: [],
  flashSeq: 0,
  // Every action, timestamped against elapsed game time. This is what turns
  // statistics into analytics: stalls, pace, and where on the grid time goes.
  // `t` comes in on the action because the reducer stays pure.
  moveLog: [],
  // A game finished with auto-complete is not the same as one finished by hand.
  // Phase 5 stats read this.
  autoCompleted: false,
  startedAt: null,
  elapsedMs: 0,
}

const snapshot = s => ({
  board: s.board.slice(),
  marks: s.marks.slice(),
  mistakes: s.mistakes,
  // Carried too: restoring marks without restoring the record of what stripped
  // them would leave the ledger describing a board that no longer exists.
  stripped: s.stripped,
  tints: s.tints,
})

const canEdit = s =>
  s.board && s.status === 'playing' && s.selected >= 0 && s.puzzle[s.selected] === 0

const isSolved = (board, solution) =>
  !board.includes(0) && board.every((v, i) => v === solution[i])

/**
 * Puts `v` into cell `i`, or clears it if `v` is already there.
 *
 * Shared by cell-first input (digit into the selected cell) and quick input
 * (armed digit into a tapped cell) so the two modes cannot drift apart in how
 * they handle pencil erasure, mistake counting or the win check. Callers are
 * responsible for checking the cell is editable.
 */
/**
 * Cells of any row, column or box that this placement just completed.
 *
 * Purely for the flash: finishing a unit is the small satisfaction the game
 * runs on, and until now nothing acknowledged it.
 */
function completedUnitCells(board, i) {
  const out = new Set()
  for (const u of UNITS) {
    if (!u.includes(i)) continue
    if (u.every(c => board[c] !== 0)) for (const c of u) out.add(c)
  }
  return out.size ? [...out] : []
}

/** Appends one entry to the move log. `t` is elapsed game time in ms. */
const logMove = (state, entry, t) => [...state.moveLog, { t: Math.round(t ?? 0), ...entry }]

/**
 * Which cells changed and what they became.
 *
 * Undo, redo and auto-complete each move an unknown number of cells, and the
 * log only recorded that they happened. That is enough to count them and not
 * enough to replay them: a review could not reconstruct the board at a given
 * moment without knowing what an undo actually undid. Recording the diff makes
 * the log a complete history rather than a summary.
 */
function boardDiff(before, after) {
  const changes = []
  for (let i = 0; i < 81; i++) if (before[i] !== after[i]) changes.push([i, after[i]])
  return changes
}

/**
 * Puts `v` back into the pencil marks of the peers it was taken from.
 *
 * Placing a digit strips it from every peer's marks, which is right. Erasing it
 * has to put them back, which the app did not do: place a 5, strip it from nine
 * peers, erase the 5, and those nine cells were left permanently missing a
 * candidate that had become valid again. Your notes quietly stopped being true.
 *
 * The peers are recorded at strip time rather than recomputed, because
 * recomputing cannot tell a mark you never wrote from one the app removed, and
 * would invent marks you had deliberately cleared.
 */
function restoreStripped(marks, stripped, i) {
  const rec = stripped[i]
  if (!rec) return stripped
  for (const [p, digit] of rec.peers) marks[p] = addMark(marks[p], digit)
  // The cell's own marks are cleared when a digit lands on it. Those come back
  // too: having pencilled 1/4/6/9, typed a 4 and then erased it, you want your
  // four candidates back, not an empty cell.
  if (rec.own) marks[i] = rec.own
  const next = { ...stripped }
  delete next[i]
  return next
}

function placeDigit(state, i, v, t) {
  // Notes mode: toggle a pencil mark, but only in an empty cell.
  if (state.notes) {
    if (state.board[i] !== 0) return state
    const marks = state.marks.slice()
    marks[i] = toggleMark(marks[i], v)
    return {
      ...state,
      marks,
      history: [...state.history, snapshot(state)],
      moveLog: logMove(state, { kind: 'pencil', cell: i, value: v }, t),
    }
  }

  const board = state.board.slice()
  const marks = state.marks.slice()
  let mistakes = state.mistakes
  let entry
  let flash = []

  // Whatever the previous occupant of this cell took out of its peers' marks
  // goes back first, whether we are clearing the cell or overwriting it.
  let stripped = restoreStripped(marks, state.stripped, i)

  if (board[i] === v) {
    board[i] = 0
    entry = { kind: 'clear', cell: i, value: v }
  } else {
    board[i] = v
    const own = marks[i]
    marks[i] = 0
    // Strip this digit from every peer's marks, remembering exactly which peers
    // so the removal can be undone precisely when the digit leaves.
    const taken = []
    for (const p of PEERS[i]) {
      if (hasMark(marks[p], v)) {
        marks[p] = removeMark(marks[p], v)
        taken.push([p, v])
      }
    }
    stripped = taken.length || own ? { ...stripped, [i]: { own, peers: taken } } : stripped
    const correct = v === state.solution[i]
    if (!correct) mistakes++
    else flash = completedUnitCells(board, i)
    entry = { kind: 'place', cell: i, value: v, correct }
  }

  const next = {
    ...state,
    board,
    marks,
    stripped,
    mistakes,
    flash,
    // Bumped so an identical flash set still retriggers the animation.
    flashSeq: state.flashSeq + 1,
    history: [...state.history, snapshot(state)],
    // Any new move invalidates whatever was undone. Standard, and it stops redo
    // replaying a branch that no longer exists.
    future: [],
    moveLog: logMove(state, entry, t),
  }
  if (isSolved(board, state.solution)) next.status = 'won'
  return next
}

export function gameReducer(state, action) {
  const next = reduce(state, action)
  // The hint marker survives only until the next thing you do.
  if (action.type !== 'hint' && next !== state && next.hintCell !== -1) {
    return { ...next, hintCell: -1 }
  }
  return next
}

function reduce(state, action) {
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
        mode: action.mode || 'casual',
        dayKey: action.dayKey || null,
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
        mode: s.mode || 'casual',
        dayKey: s.dayKey || null,
        score: s.score ?? 0,
        hardest: s.hardest ?? null,
        counts: s.counts || {},
        clues: s.clues,
        seed: s.seed,
        mistakes: s.mistakes || 0,
        hints: s.hints || 0,
        hintLog: s.hintLog || [],
        moveLog: s.moveLog || [],
        history: (s.history || []).map(h => ({
          board: h.board,
          marks: Int16Array.from(h.marks),
          mistakes: h.mistakes,
          stripped: h.stripped || {},
        })),
        stripped: s.stripped || {},
        checks: s.checks || 0,
        bookmark: s.bookmark
          ? { ...s.bookmark, marks: Int16Array.from(s.bookmark.marks) }
          : null,
        tints: s.tints || {},
        // Reopening paused is the honest resume: the clock stopped when you
        // paused and must not start again just because the app restarted.
        status: s.status === 'paused' ? 'paused' : 'playing',
        autoCompleted: s.autoCompleted || false,
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
      return placeDigit(state, state.selected, action.value, action.t)
    }

    // Quick input: a digit is armed on the pad and tapping a cell drops it in.
    // Far fewer taps on a phone, because digits get filled in runs.
    case 'quickPlace': {
      const i = action.index
      if (!state.board || state.status !== 'playing') return state
      if (!state.activeDigit) return state
      if (state.puzzle[i] !== 0) return { ...state, selected: i }
      return { ...placeDigit(state, i, state.activeDigit, action.t), selected: i }
    }

    case 'hint': {
      if (!state.board || state.status !== 'playing') return state
      const h = action.hint
      if (!h) return state
      // A hint always places the digit, even in notes mode. Pencilling it in
      // would not be a hint.
      const placed = placeDigit({ ...state, notes: false }, h.cell, h.digit, action.t)
      return {
        ...placed,
        notes: state.notes,
        selected: h.cell,
        hintCell: h.cell,
        hints: state.hints + 1,
        hintLog: [...state.hintLog, { cell: h.cell, technique: h.technique, derived: h.derived }],
        // Overwrite the 'place' entry placeDigit just wrote: a hinted cell was
        // not solved by the player and must not count as their placement.
        moveLog: logMove(state, { kind: 'hint', cell: h.cell, value: h.digit, correct: true, technique: h.technique }, action.t),
      }
    }

    // ---- hard-puzzle tools ----

    case 'bookmark':
      if (!state.board || state.status !== 'playing') return state
      return {
        ...state,
        bookmark: {
          board: state.board.slice(),
          marks: state.marks.slice(),
          mistakes: state.mistakes,
          stripped: state.stripped,
          tints: state.tints,
          at: Math.round(action.t ?? 0),
        },
        moveLog: logMove(state, { kind: 'bookmark' }, action.t),
      }

    case 'returnToBookmark': {
      if (!state.board || state.status !== 'playing' || !state.bookmark) return state
      const b = state.bookmark
      return {
        ...state,
        board: b.board.slice(),
        marks: b.marks.slice(),
        mistakes: b.mistakes,
        stripped: b.stripped,
        tints: b.tints,
        // Going back is itself undoable: returning by mistake should not cost
        // you the branch you were exploring.
        history: [...state.history, snapshot(state)],
        future: [],
        bookmark: null,
        moveLog: logMove(state, {
          kind: 'returnToBookmark',
          changes: boardDiff(state.board, b.board),
        }, action.t),
      }
    }

    case 'clearBookmark':
      return state.bookmark ? { ...state, bookmark: null } : state

    /** Cycles a cell through the four tints and back to none. */
    case 'cycleTint': {
      if (!state.board || state.status !== 'playing') return state
      const i = action.index
      const next = ((state.tints[i] || 0) + 1) % 5
      const tints = { ...state.tints }
      if (next === 0) delete tints[i]
      else tints[i] = next
      return { ...state, tints }
    }

    case 'clearTints':
      return Object.keys(state.tints).length ? { ...state, tints: {} } : state

    case 'setActiveDigit': {
      // Tapping the armed digit again disarms it, which is how you get back to
      // plain selection without leaving the mode.
      const v = state.activeDigit === action.value ? 0 : action.value
      return { ...state, activeDigit: v }
    }

    case 'clearActiveDigit':
      return state.activeDigit ? { ...state, activeDigit: 0 } : state

    case 'erase': {
      if (!canEdit(state)) return state
      const i = state.selected
      if (state.board[i] === 0 && state.marks[i] === 0) return state
      const board = state.board.slice()
      const marks = state.marks.slice()
      // Erase does two different jobs. On a cell holding a digit it removes the
      // digit and restores the marks that digit displaced, including the cell's
      // own. On an empty cell it clears the pencil marks, which is the only
      // thing there is to clear.
      const hadDigit = board[i] !== 0
      const stripped = hadDigit ? restoreStripped(marks, state.stripped, i) : state.stripped
      board[i] = 0
      if (!hadDigit) marks[i] = 0
      return {
        ...state,
        board,
        marks,
        stripped,
        history: [...state.history, snapshot(state)],
        future: [],
        moveLog: logMove(state, { kind: 'erase', cell: i }, action.t),
      }
    }

    case 'undo': {
      if (!state.board || state.status !== 'playing' || state.history.length === 0) return state
      const prev = state.history[state.history.length - 1]
      return {
        ...state,
        board: prev.board.slice(),
        marks: prev.marks.slice(),
        mistakes: prev.mistakes,
        stripped: prev.stripped || {},
        tints: prev.tints || {},
        history: state.history.slice(0, -1),
        future: [...state.future, snapshot(state)],
        moveLog: logMove(state, { kind: 'undo', changes: boardDiff(state.board, prev.board) }, action.t),
      }
    }

    case 'redo': {
      if (!state.board || state.status !== 'playing' || state.future.length === 0) return state
      const next = state.future[state.future.length - 1]
      return {
        ...state,
        board: next.board.slice(),
        marks: next.marks.slice(),
        mistakes: next.mistakes,
        stripped: next.stripped || {},
        tints: next.tints || {},
        history: [...state.history, snapshot(state)],
        future: state.future.slice(0, -1),
        moveLog: logMove(state, { kind: 'redo', changes: boardDiff(state.board, next.board) }, action.t),
      }
    }

    // Counts an explicit board check. The wrong cells are already derivable, so
    // this only records that help was taken.
    case 'check':
      if (!state.board || state.status !== 'playing') return state
      return {
        ...state,
        checks: state.checks + 1,
        moveLog: logMove(state, { kind: 'check' }, action.t),
      }

    case 'autoComplete': {
      // The button is only offered when every remaining cell is forced, so this
      // is pure mop-up. Still goes through history like any other move.
      if (!state.board || state.status !== 'playing') return state
      const fills = action.fills
      if (!fills?.length) return state

      const board = state.board.slice()
      const marks = state.marks.slice()
      for (const { cell, digit } of fills) {
        board[cell] = digit
        marks[cell] = 0
      }

      const next = {
        ...state,
        board,
        marks,
        autoCompleted: true,
        history: [...state.history, snapshot(state)],
        moveLog: logMove(state, {
          kind: 'autoComplete',
          count: fills.length,
          changes: fills.map(f => [f.cell, f.digit]),
        }, action.t),
      }
      if (isSolved(board, state.solution)) next.status = 'won'
      return next
    }

    case 'autoPencil': {
      if (!state.board || state.status !== 'playing') return state
      const marks = emptyMarks()
      for (const i of range(81)) if (state.board[i] === 0) marks[i] = candMaskAt(state.board, i)
      return {
        ...state,
        marks,
        // Auto-pencil rewrites every mark from the board, so nothing the old
        // ledger describes still applies.
        stripped: {},
        history: [...state.history, snapshot(state)],
        future: [],
        moveLog: logMove(state, { kind: 'autoPencil' }, action.t),
      }
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

/**
 * Which digit the board should highlight everywhere.
 *
 * In quick input this is the armed digit, which is why that mode needs no
 * separate "highlight this number" control: arming a digit to place it and
 * arming it to look for it are the same gesture. Otherwise it falls back to
 * whatever sits in the selected cell, which is the old behaviour.
 */
export const highlightDigit = state => {
  if (state.activeDigit) return state.activeDigit
  if (!state.board || state.selected < 0) return 0
  return state.board[state.selected]
}
