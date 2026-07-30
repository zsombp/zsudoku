// The grader. Solves a puzzle the way a person does, using only the techniques
// in the ladder, and reports what it cost.
//
// Replaces the prototype's three-technique grader, which collapsed everything
// above naked pairs into a single "level 4". That bucket held both puzzles
// needing one clean X-Wing and puzzles that could only be finished by guessing,
// and it labelled them identically. A puzzle that needs guessing is not hard,
// it is defective, and this grader refuses to call it anything else: it returns
// solved: false, and the generator throws it away.
//
// Difficulty is the summed cost of the techniques the solve actually required,
// not just the hardest one used. Three X-Wings really are harder than one, and
// a single number captures that where "hardest technique" cannot.

import { PEERS, candMaskAt } from './topology.js'
import { removeMark, countMarks } from './marks.js'
import { TECHNIQUES, LADDER } from './techniques.js'

export function createState(puzzle) {
  const board = puzzle.slice()
  const cands = new Int16Array(81)
  for (let i = 0; i < 81; i++) cands[i] = board[i] ? 0 : candMaskAt(board, i)
  return { board, cands }
}

function place(state, i, v) {
  state.board[i] = v
  state.cands[i] = 0
  for (const p of PEERS[i]) state.cands[p] = removeMark(state.cands[p], v)
}

export function applyStep(state, step) {
  for (const { cell, digit } of step.eliminations) {
    state.cands[cell] = removeMark(state.cands[cell], digit)
  }
  for (const { cell, digit } of step.placements) place(state, cell, digit)
}

/** An empty cell with no candidates left means the board is already wrong. */
function broken(state) {
  for (let i = 0; i < 81; i++) if (state.board[i] === 0 && state.cands[i] === 0) return true
  return false
}

const isFull = state => !state.board.includes(0)

/**
 * The cheapest technique that does something right now, or null.
 *
 * This is what the Phase 3 hint button calls. Hints and difficulty ratings can
 * never disagree, because they are the same function.
 */
export function nextStep(state, { upTo = LADDER.length } = {}) {
  for (let rung = 0; rung < Math.min(upTo, LADDER.length); rung++) {
    const key = LADDER[rung]
    const found = TECHNIQUES[key].fn(state)
    if (found) return { ...found, rung }
  }
  return null
}

/**
 * Runs the whole ladder to a finish.
 *
 * Returns:
 *   solved    did pure logic get there, with no guessing
 *   score     summed technique cost, the difficulty number
 *   hardest   the most expensive technique the solve needed
 *   counts    how many times each technique fired
 *   steps     the full solve path, kept only when `keepSteps` is set
 */
export function gradePuzzle(puzzle, { keepSteps = false, upTo } = {}) {
  const state = createState(puzzle)
  const counts = {}
  const steps = []
  let score = 0
  let guard = 0

  while (!isFull(state)) {
    if (++guard > 800 || broken(state)) break

    const found = nextStep(state, { upTo })
    if (!found) break

    const spec = TECHNIQUES[found.technique]
    counts[found.technique] = (counts[found.technique] || 0) + 1
    score += counts[found.technique] === 1 ? spec.first : spec.repeat

    applyStep(state, found)
    if (keepSteps) steps.push(found)
  }

  const solved = isFull(state) && !broken(state)
  let hardest = null
  for (const key of LADDER) if (counts[key]) hardest = key

  return {
    solved,
    score: solved ? score : Infinity,
    hardest,
    counts,
    steps,
    filled: 81 - state.board.filter(v => v === 0).length,
  }
}

/**
 * Can the rest of this board be finished with naked singles alone, each one
 * revealing the next? That is the honest definition of "no thinking left", and
 * it is what the Phase 3 auto-complete button is gated on.
 *
 * Returns the placements in order, or null if real deduction is still needed.
 */
export function trivialTail(board) {
  const state = createState(board)
  const placements = []
  const nakedOnly = { upTo: 1 }

  while (!isFull(state)) {
    if (broken(state)) return null
    const found = nextStep(state, nakedOnly)
    if (!found) return null
    placements.push(found.placements[0])
    applyStep(state, found)
  }
  return placements
}

/** Every empty cell has exactly one candidate right now. The strict reading. */
export function allCellsForced(board) {
  const state = createState(board)
  let empty = 0
  for (let i = 0; i < 81; i++) {
    if (state.board[i] !== 0) continue
    empty++
    if (countMarks(state.cands[i]) !== 1) return false
  }
  return empty > 0
}
