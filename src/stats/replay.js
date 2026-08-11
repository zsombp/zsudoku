// Reading a finished game back out of its move log.
//
// The log has been recorded since Phase 5 and, until now, only ever summarised.
// These functions are what actually spend it: reconstructing the board at any
// moment, and working out where on the grid the time went.

import { boxOf, PEERS, candMaskAt, range } from '../logic/topology.js'
import { hasMark, addMark, removeMark, toggleMark } from '../logic/marks.js'

/** Entries that move a digit. Pencilling and checking do not change the board. */
const CHANGES_BOARD = new Set(['place', 'clear', 'erase', 'hint', 'undo', 'redo', 'autoComplete'])

/**
 * The board as it stood immediately after move `step`.
 *
 * Handles two log shapes. Newer entries carry an explicit `changes` diff, which
 * replays exactly whatever the action did. Older ones only named a single cell,
 * so those are applied by kind. Games recorded before the diff existed replay
 * approximately through undos, which is the honest limit of what was stored.
 */
export function boardAt(record, step) {
  return walk(record, step, false).board
}

/**
 * The board and the pencil marks as they stood immediately after move `step`.
 *
 * The marks are the reason this exists. The review used to show a board with no
 * candidates on it while the analysis said things like "r3c1 still showed
 * 2/3/6", which is a claim you had no way to check. Notes are not in the log
 * directly, but every rule that changes them is, so they can be rebuilt:
 *
 *   pencil       toggles one digit in one cell
 *   place        clears the cell and strips the digit from its peers
 *   clear/erase  puts back exactly what the placement took, via the ledger
 *   autoPencil   recomputes every mark from the board
 *
 * Snapshot restores are the exception. Undo, redo and returning to a bookmark
 * put back marks nothing else describes, so those entries now carry a
 * `markChanges` diff. Games recorded before that carry no such diff and their
 * marks go approximate after the first undo, which `marksExact` reports rather
 * than hides.
 */
export function stateAt(record, step) {
  return walk(record, step, true)
}

/** True when nothing in the log up to `step` forces the marks to be guessed. */
export function marksExact(record, step) {
  return walk(record, step, true).exact
}

const RESTORES = new Set(['undo', 'redo', 'returnToBookmark'])

function walk(record, step, wantMarks) {
  const board = record.puzzle.slice()
  const marks = wantMarks ? new Int16Array(81) : null
  // What each placed digit took out of its peers' marks, so erasing puts back
  // exactly that. Mirrors the reducer's ledger of the same name.
  let stripped = {}
  let exact = true

  const log = record.moveLog || []
  for (let i = 0; i <= step && i < log.length; i++) {
    const m = log[i]

    if (wantMarks && m.kind === 'pencil') {
      marks[m.cell] = toggleMark(marks[m.cell], m.value)
      continue
    }
    if (wantMarks && m.kind === 'autoPencil') {
      // Deterministic from the board, which is why it needs nothing logged.
      for (const c of range(81)) marks[c] = board[c] === 0 ? candMaskAt(board, c) : 0
      stripped = {}
      continue
    }

    if (wantMarks && RESTORES.has(m.kind)) {
      if (m.markChanges) {
        for (const [cell, mask] of m.markChanges) marks[cell] = mask
      } else if (marksTouched(marks)) {
        // An older log, and marks existed to be disturbed. Say so.
        exact = false
      }
    }

    // ---- the board, and the mark rules that follow from it ----
    if (m.changes) {
      for (const [cell, value] of m.changes) {
        if (wantMarks) applyCellChange(board, marks, cell, value, stripped)
        board[cell] = value
      }
    } else if (m.kind === 'place' || m.kind === 'hint') {
      if (wantMarks) applyCellChange(board, marks, m.cell, m.value, stripped)
      board[m.cell] = m.value
    } else if (m.kind === 'clear' || m.kind === 'erase') {
      if (wantMarks) applyCellChange(board, marks, m.cell, 0, stripped)
      board[m.cell] = 0
    }
  }

  return { board, marks, exact }
}

const marksTouched = marks => {
  for (let i = 0; i < 81; i++) if (marks[i] !== 0) return true
  return false
}

/**
 * One cell changing value, and what that does to the pencil marks around it.
 * Exactly the rules `placeDigit` applies, so the replay and the game agree.
 */
function applyCellChange(board, marks, cell, value, stripped) {
  // Whatever the previous occupant took out of its peers goes back first.
  const rec = stripped[cell]
  if (rec) {
    for (const [p, digit] of rec.peers) marks[p] = addMark(marks[p], digit)
    if (rec.own) marks[cell] = rec.own
    delete stripped[cell]
  }

  if (value === 0) return

  const own = marks[cell]
  marks[cell] = 0
  const taken = []
  for (const p of PEERS[cell]) {
    if (hasMark(marks[p], value)) {
      marks[p] = removeMark(marks[p], value)
      taken.push([p, value])
    }
  }
  if (taken.length || own) stripped[cell] = { own, peers: taken }
}

/** Indices of log entries worth stepping through. Pencilling is skipped. */
export function replaySteps(record) {
  const log = record.moveLog || []
  const out = []
  log.forEach((m, i) => {
    if (CHANGES_BOARD.has(m.kind)) out.push(i)
  })
  return out
}

/**
 * How long you sat on each cell before filling it.
 *
 * The gap before a placement is the thinking that produced it, so it is charged
 * to the cell that was placed. Cells filled more than once keep their longest
 * gap: the hard part of a cell is the hardest time you had with it.
 */
export function stallHeatmap(record) {
  const log = record.moveLog || []
  const cells = new Array(81).fill(0)
  let prev = 0
  let max = 0
  let total = 0

  for (const m of log) {
    const gap = Math.max(0, m.t - prev)
    prev = m.t
    if (m.kind !== 'place' && m.kind !== 'hint') continue
    if (gap > cells[m.cell]) cells[m.cell] = gap
    if (cells[m.cell] > max) max = cells[m.cell]
    total += gap
  }

  return { cells, max, total }
}

/** The single longest pause, and where it happened. */
export function longestStall(record) {
  const log = record.moveLog || []
  let best = { gap: 0, cell: -1, at: 0 }
  let prev = 0
  for (const m of log) {
    const gap = Math.max(0, m.t - prev)
    prev = m.t
    if ((m.kind === 'place' || m.kind === 'hint') && gap > best.gap) {
      best = { gap, cell: m.cell, at: m.t }
    }
  }
  return best
}

/** Headline numbers for one game's review. */
export function summarise(record) {
  const log = record.moveLog || []
  const placements = log.filter(m => m.kind === 'place')
  const wrong = placements.filter(m => m.correct === false)
  const firstMove = log.length ? log[0].t : 0
  const { total } = stallHeatmap(record)

  const boxes = new Array(9).fill(0)
  for (const m of wrong) boxes[boxOf(m.cell)]++

  return {
    moves: log.length,
    placements: placements.length,
    wrong: wrong.length,
    pencilMarks: log.filter(m => m.kind === 'pencil').length,
    usedAutoPencil: log.some(m => m.kind === 'autoPencil'),
    undos: log.filter(m => m.kind === 'undo').length,
    timeToFirstMove: firstMove,
    thinkingTime: total,
    longest: longestStall(record),
    mistakeBoxes: boxes,
  }
}

/**
 * Everything that ever happened to one cell, in order.
 *
 * The review can say a great deal about a move and nothing about a cell. Some
 * cells are the whole story of a game: pencilled early, argued with for ten
 * minutes, filled wrong, erased, filled right. That history is all in the log
 * and was never being read.
 */
export function cellHistory(record, cell) {
  const log = record.moveLog || []
  const out = []
  const solution = record.solution || []

  if (record.puzzle?.[cell]) {
    return [{ t: 0, kind: 'given', text: `Given as ${record.puzzle[cell]}.` }]
  }

  for (let i = 0; i < log.length; i++) {
    const m = log[i]
    const touches =
      m.cell === cell || (m.changes || []).some(([c]) => c === cell) ||
      (m.markChanges || []).some(([c]) => c === cell)
    if (!touches) continue

    if (m.kind === 'pencil') {
      // Whether this toggle put the mark in or took it out needs the state
      // before it, which is the one thing a single entry cannot tell you.
      const had = hasMark(stateAt(record, i - 1).marks[cell], m.value)
      out.push({
        t: m.t, index: i, kind: 'pencil',
        text: had ? `Rubbed out the ${m.value}.` : `Pencilled in ${m.value}.`,
      })
    } else if (m.kind === 'place' || m.kind === 'hint') {
      const right = solution[cell] === m.value
      out.push({
        t: m.t, index: i, kind: right ? 'place' : 'wrong',
        text:
          m.kind === 'hint'
            ? `Hint filled in ${m.value}.`
            : right
              ? `Filled in ${m.value}.`
              : `Filled in ${m.value}, which was wrong.`,
      })
    } else if (m.kind === 'erase' || m.kind === 'clear') {
      out.push({ t: m.t, index: i, kind: 'erase', text: 'Cleared it.' })
    } else if (m.changes?.some(([c]) => c === cell)) {
      const to = m.changes.find(([c]) => c === cell)[1]
      out.push({
        t: m.t, index: i, kind: m.kind,
        text: to === 0 ? `Emptied by ${LABEL[m.kind] || m.kind}.` : `Set to ${to} by ${LABEL[m.kind] || m.kind}.`,
      })
    }
  }
  return out
}

const LABEL = {
  undo: 'an undo',
  redo: 'a redo',
  returnToBookmark: 'going back to your mark',
  autoComplete: 'auto-complete',
}
