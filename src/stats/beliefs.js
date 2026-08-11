// What you believed, and how long it stayed wrong.
//
// The app records two things nothing else keeps together: the pencil marks you
// actually wrote, rebuilt move by move, and what the board genuinely proved at
// each of those moments. The gap between them is a record of false beliefs and
// how long they were held.
//
// ---- what counts, and why the obvious definition is wrong ----
//
// "A note the board had ruled out" sounds like the right test and is not.
// Auto-pencil fills in the plain peer-scan candidates, and the full ladder is
// stricter than a peer scan: on a Hard grid, 53 of the 158 candidates it writes
// are already dead to a pointing pair or a subset. Reporting those would mean
// telling someone they held 53 false beliefs the instant they pressed a button
// the app gave them, which is both noise and a lie about whose fault it is.
//
// So the test is narrower and means something: a note that **was** true, and
// **became** false while you kept it. The board moved and you did not notice.
// That is the belief you then reason from, and everything downstream of it
// inherits the error.
//
// Kept separately, because it is a different mistake: a note that was never
// possible at all, not even by a peer scan. That is a misread at the moment of
// writing rather than a belief that went stale.

import { settledCands } from '../logic/explain.js'
import { hasMark, marksToList } from '../logic/marks.js'
import { rowOf, colOf } from '../logic/topology.js'
import { stateAt } from './replay.js'

const cellName = i => `r${rowOf(i) + 1}c${colOf(i) + 1}`

/** Moves after which the truth can have changed. Pencilling changes only belief. */
const CHANGES_TRUTH = new Set([
  'place', 'clear', 'erase', 'hint', 'undo', 'redo', 'autoComplete', 'returnToBookmark',
])

const key = (cell, digit) => cell * 10 + digit

/**
 * Notes that went stale, and notes that were never on.
 *
 * Costs one full ladder pass per board-changing move, roughly a tenth of a
 * second for a whole game. Fine when a review is opened, far too much to run
 * across a history, which is why none of this is aggregated anywhere.
 *
 * `minMs` is there because a note that was wrong for four seconds before being
 * erased is not a false belief, it is a correction.
 */
export function falseBeliefs(record, { minMs = 15000 } = {}) {
  const log = record.moveLog || []
  const empty = { stale: [], misreads: [], totalMs: 0, worst: null, considered: 0 }
  if (!log.length || !record.solution || !record.puzzle) return empty

  // Marks seen to be genuinely possible at some point. Only these can go stale:
  // anything dead from the moment it appeared was never a belief the board
  // supported, so it is either a misread or an artefact of auto-pencil.
  const wasTrue = new Set()
  const dying = new Map()
  const finished = []
  const misreads = []
  const endedAt = log[log.length - 1]?.t || 0

  const close = (k, at, reason, atIndex) => {
    const rec = dying.get(k)
    if (!rec) return
    dying.delete(k)
    finished.push({
      cell: Math.floor(k / 10),
      digit: k % 10,
      cellName: cellName(Math.floor(k / 10)),
      diedAt: rec.diedAt,
      // The move it died at, so the review can put the board back to the exact
      // position where the note stopped being true.
      diedAtIndex: rec.diedAtIndex,
      droppedAt: at,
      droppedAtIndex: atIndex,
      heldMs: Math.max(0, at - rec.diedAt),
      reason,
      mistakesHere: rec.mistakesHere,
      killedBy: rec.killedBy,
    })
  }

  let truth = null
  // The most notes that were wrong at the same time, which is a far better
  // measure of how stale a board got than adding up durations that overlap.
  let peak = 0

  for (let i = 0; i < log.length; i++) {
    const m = log[i]
    const { board, marks } = stateAt(record, i)
    if (!marks) break

    // Count a wrong digit dropped into a cell whose note was already stale
    // before that note is closed out. Reported as co-occurrence, never as cause:
    // the app cannot know what you were thinking, only what was in front of you.
    if ((m.kind === 'place' || m.kind === 'hint') && m.correct === false) {
      for (const [k, rec] of dying) {
        if (Math.floor(k / 10) === m.cell) rec.mistakesHere++
      }
    }

    if (truth === null || CHANGES_TRUTH.has(m.kind) || m.changes) truth = settledCands(board)

    // Notes that have gone: erased, or the cell filled.
    for (const k of [...dying.keys()]) {
      const cell = Math.floor(k / 10)
      const digit = k % 10
      if (board[cell] !== 0) close(k, m.t, board[cell] === digit ? 'played' : 'filled', i)
      else if (!hasMark(marks[cell], digit)) close(k, m.t, 'erased', i)
    }

    for (let cell = 0; cell < 81; cell++) {
      if (board[cell] !== 0 || marks[cell] === 0) continue
      for (const digit of marksToList(marks[cell])) {
        const k = key(cell, digit)
        const possible = hasMark(truth[cell], digit)

        if (possible) {
          wasTrue.add(k)
          continue
        }
        if (dying.has(k)) continue

        if (!wasTrue.has(k)) {
          // Never supported. A peer scan tells a misread from an auto-pencil
          // artefact: the first is your error, the second is the app's own
          // candidate set being coarser than the ladder.
          if (!hasMark(nativeCands(board, cell), digit)) {
            misreads.push({ cell, digit, cellName: cellName(cell), at: m.t })
          }
          continue
        }

        dying.set(k, { diedAt: m.t, diedAtIndex: i, mistakesHere: 0, killedBy: null })
      }
    }
    if (dying.size > peak) peak = dying.size
  }

  for (const k of [...dying.keys()]) close(k, endedAt, 'kept', log.length - 1)

  const stale = finished
    .filter(b => b.heldMs >= minMs)
    // A stale note that sat in a cell you then got wrong is the one worth
    // reading first, however long the others lasted.
    .sort((a, b) => b.mistakesHere - a.mistakesHere || b.heldMs - a.heldMs)

  return {
    stale,
    misreads,
    peak,
    // How much of the game had at least one wrong note on the board. Adding the
    // durations instead would report two and a half hours inside a seven minute
    // game, because dozens of them overlap.
    coverageMs: union(stale.map(b => [b.diedAt, b.droppedAt])),
    worst: stale[0] || null,
    // Everything found, so a caller can say how many were dismissed as noise
    // rather than implying there were none at all.
    considered: finished.length,
  }
}

/** Total time covered by a set of intervals, counting overlap once. */
function union(intervals) {
  if (!intervals.length) return 0
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let [start, end] = sorted[0]
  for (const [s, e] of sorted.slice(1)) {
    if (s > end) {
      total += end - start
      start = s
      end = e
    } else if (e > end) end = e
  }
  return total + (end - start)
}

/** The plain peer scan, which is what auto-pencil writes. */
function nativeCands(board, cell) {
  const row = Math.floor(cell / 9)
  const col = cell % 9
  const boxTop = Math.floor(row / 3) * 3
  const boxLeft = Math.floor(col / 3) * 3
  let mask = 0x1ff
  for (let k = 0; k < 9; k++) {
    const inRow = board[row * 9 + k]
    const inCol = board[k * 9 + col]
    const inBox = board[(boxTop + Math.floor(k / 3)) * 9 + boxLeft + (k % 3)]
    if (inRow) mask &= ~(1 << (inRow - 1))
    if (inCol) mask &= ~(1 << (inCol - 1))
    if (inBox) mask &= ~(1 << (inBox - 1))
  }
  return mask
}

const secs = ms => (ms >= 60000 ? `${(ms / 60000).toFixed(1)} minutes` : `${Math.round(ms / 1000)} seconds`)

/** One line for the top of the panel. */
export function beliefVerdict({ stale, coverageMs, peak, considered, misreads }) {
  if (!stale.length) {
    if (misreads?.length) {
      return `Your notes kept up with the board. ${misreads.length} ${
        misreads.length === 1 ? 'note was' : 'notes were'
      } impossible the moment you wrote them, which is a misread rather than a stale belief.`
    }
    return considered
      ? 'Your notes kept up with the board. Nothing you wrote stayed wrong for long enough to matter.'
      : 'Every note you made stayed possible for as long as it was on the board.'
  }
  const worst = stale[0]
  const cost = stale.reduce((a, b) => a + b.mistakesHere, 0)
  return `${stale.length} of your notes went stale and stayed on the board, at worst ${peak} of them wrong at once. For ${secs(
    coverageMs
  )} of this game you were reading a map that was out of date somewhere.${
    cost
      ? ` ${cost} of your wrong digits went into a cell while a dead note was still sitting in it.`
      : ` The ${worst.digit} in ${worst.cellName} was the longest, impossible for ${secs(worst.heldMs)}.`
  }`
}
