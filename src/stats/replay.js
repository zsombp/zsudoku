// Reading a finished game back out of its move log.
//
// The log has been recorded since Phase 5 and, until now, only ever summarised.
// These functions are what actually spend it: reconstructing the board at any
// moment, and working out where on the grid the time went.

import { boxOf } from '../logic/topology.js'

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
  const board = record.puzzle.slice()
  const log = record.moveLog || []
  for (let i = 0; i <= step && i < log.length; i++) {
    const m = log[i]
    if (m.changes) {
      for (const [cell, value] of m.changes) board[cell] = value
    } else if (m.kind === 'place' || m.kind === 'hint') {
      board[m.cell] = m.value
    } else if (m.kind === 'clear' || m.kind === 'erase') {
      board[m.cell] = 0
    }
  }
  return board
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
