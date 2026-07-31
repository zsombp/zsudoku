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
import { removeMark, countMarks, marksToList } from './marks.js'
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

/**
 * The auto-complete trigger, in its strict reading: every empty cell has
 * exactly one candidate right now. Returns the fills, or null.
 *
 * Strict is Zsomb's call, and the reasoning is the right one. The looser
 * reading (the rest falls to naked singles, each revealing the next) still asks
 * you to notice which cell has become forced, and a cell being forced is not
 * always obvious: a cell may hold several candidates while some digit has only
 * one home left in its box. Noticing that is a hidden single, and it is
 * thinking. This fires only when there is nothing left to notice at all.
 *
 * Deliberately computed from the true candidates rather than from the player's
 * pencil marks. Keying it on the marks would make the button appear or not
 * depending on how diligently they had been pencilling, which is nonsense.
 *
 * A contradiction on the board (a cell with no candidates left) fails the
 * single-candidate check, so a wrecked board never offers the button.
 */
export function forcedFills(board) {
  const state = createState(board)
  const fills = []
  for (let i = 0; i < 81; i++) {
    if (state.board[i] !== 0) continue
    if (countMarks(state.cands[i]) !== 1) return null
    fills.push({ cell: i, digit: marksToList(state.cands[i])[0] })
  }
  return fills.length > 0 ? fills : null
}

export const allCellsForced = board => forcedFills(board) !== null

/**
 * How many cells may remain for auto-complete to offer itself.
 *
 * Arbitrary, and openly so. Strict alone fired with a median of 5 cells left,
 * which Zsomb found later than he was used to. The looser cascade rule fires at
 * a median of 29, which on a Gentle puzzle means handing over 36 of 45 blanks.
 * There is no principled trigger between those two, so this is a dial rather
 * than a discovery. Tune it by feel.
 */
export const AUTO_COMPLETE_MAX = 12

/**
 * The shipped auto-complete trigger: the rest of the board falls to lone
 * candidates, and few enough cells remain that finishing is mop-up rather than
 * a large chunk of the puzzle.
 *
 * Note the cascade condition, once true, stays true as long as you fill
 * correctly. So in practice this fires the moment the board drops to the cap,
 * and the cascade check is what stops it offering on a board that still needs
 * real work. Strict is a strict subset: if every cell is forced at once, the
 * tail is trivially all lone candidates.
 */
export function autoCompleteFills(board, { maxCells = AUTO_COMPLETE_MAX } = {}) {
  let empty = 0
  for (let i = 0; i < 81; i++) if (board[i] === 0) empty++
  if (empty === 0 || empty > maxCells) return null
  return trivialTail(board)
}
