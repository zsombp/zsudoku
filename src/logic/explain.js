// Why the board proves a digit belongs in a cell, and what to draw to show it.
//
// Split out of the post-game analysis because the live game needs exactly the
// same answer. The review asks "why was this move justified"; the hint button
// asks "why is this the move", and they must never be able to disagree, for the
// same reason the grader and the hint engine are one piece of code.
//
// Pure and framework-free, like everything else in logic/.

import { createState, nextStep } from './grader.js'
import { TECHNIQUES, LADDER } from './techniques.js'
import { UNITS, UNIT_META, PEERS, unitName, rowOf, colOf } from './topology.js'
import { hasMark, marksToList, countMarks, removeMark } from './marks.js'

export const cellName = i => `r${rowOf(i) + 1}c${colOf(i) + 1}`

/**
 * Why the board proved this digit belongs in this cell, cheapest reason first.
 * Returns null when nothing on the board proved it yet, which is what makes a
 * correct move "lucky" rather than earned.
 */
export function justification(state, cell, digit) {
  if (state.board[cell] !== 0) return null
  const cands = state.cands[cell]
  if (!hasMark(cands, digit)) return null

  if (countMarks(cands) === 1) {
    return {
      kind: 'routine',
      why: `${cellName(cell)} had only ${digit} left.`,
      pattern: { technique: 'nakedSingle', cells: [cell], digits: [digit], unit: null, eliminations: [] },
    }
  }

  // Hidden single: the digit has one home in some unit containing the cell.
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u]
    if (!unit.includes(cell)) continue
    let homes = 0
    for (const i of unit) if (state.board[i] === 0 && hasMark(state.cands[i], digit)) homes++
    if (homes === 1) {
      return {
        kind: 'solid',
        why: `${digit} had only one place left in ${unitName(UNIT_META[u])}.`,
        // The whole unit is the evidence, so the whole unit gets drawn.
        pattern: {
          technique: 'hiddenSingle',
          cells: [cell],
          digits: [digit],
          unit: UNIT_META[u],
          unitCells: unit,
          eliminations: [],
        },
      }
    }
  }

  // Neither a lone candidate nor a hidden single, so the only way this was
  // knowable is if the ladder's eliminations make it one.
  //
  // "Sharp" used to be the fallthrough, which meant a digit dropped onto an
  // empty grid was classed as brilliant deduction. A move is only sharp if
  // something actually proved it.
  const proof = provenBy(state, cell, digit)
  if (!proof) return null

  return {
    kind: 'sharp',
    why: `${cellName(cell)} still showed ${marksToList(cands).join('/')}; ${TECHNIQUES[proof.key]?.label || proof.key} ruled the rest out.`,
    technique: proof.key,
    // The step that did the ruling out, kept whole so the review can draw it
    // rather than describe it, along with the candidate state it fired in.
    pattern: { ...proof.step, target: { cell, digit }, cands: proof.cands, derived: true },
  }
}

/**
 * The technique whose eliminations first prove this digit belongs in this cell,
 * or null if nothing in the ladder does.
 *
 * Candidates have to be re-derived rather than read off the player's own pencil
 * marks: `createState` computes them from the board alone, so every elimination
 * a pointing pair or a subset had already established is missing. Without this
 * step, a move that the ladder itself derived came back "lucky", which is how
 * the bug was found.
 *
 * Nothing is ever placed here. Whether the digit becomes derivable after making
 * moves you had not made yet is a different question, and not the one being
 * asked.
 */
function provenBy(state, cell, digit) {
  const work = { board: state.board.slice(), cands: state.cands.slice() }
  for (let pass = 0; pass < 12; pass++) {
    let changed = false
    for (const key of LADDER) {
      const step = TECHNIQUES[key].fn(work)
      if (!step?.eliminations?.length) continue
      let did = false
      for (const e of step.eliminations) {
        if (!hasMark(work.cands[e.cell], e.digit)) continue
        work.cands[e.cell] = removeMark(work.cands[e.cell], e.digit)
        did = true
      }
      if (!did) continue
      changed = true
      // Checked after every technique rather than at the end, so the answer is
      // the one that actually did the work rather than the first to fire.
      if (directJustification(work, cell, digit)) {
        // The candidates as they stood when the pattern fired, not the naive
        // peer-only set. A naked quad found after a pointing pair has cleared
        // the way does not look like a quad on the raw board, so drawing it
        // over raw candidates shows a pattern whose cells visibly contradict
        // it. This is the state in which the pattern is actually true.
        return { key, step, cands: work.cands.slice() }
      }
    }
    if (!changed) break
  }
  return null
}

/**
 * Every candidate the ladder can rule out, applied to exhaustion.
 *
 * `createState` gives the naive set: a digit is a candidate unless a peer holds
 * it. That is not everything the board proves. A pointing pair or a naked pair
 * kills candidates no peer scan will find, and the game never erases those
 * marks for you, so they are precisely the notes that go quietly stale while
 * you keep trusting them. Comparing your notes against the naive set finds
 * almost nothing; comparing against this finds the ones worth knowing about.
 */
export function settledCands(board) {
  const work = createState(board)
  for (let pass = 0; pass < 12; pass++) {
    let changed = false
    for (const key of LADDER) {
      const step = TECHNIQUES[key].fn(work)
      if (!step?.eliminations?.length) continue
      for (const e of step.eliminations) {
        if (!hasMark(work.cands[e.cell], e.digit)) continue
        work.cands[e.cell] = removeMark(work.cands[e.cell], e.digit)
        changed = true
      }
    }
    if (!changed) break
  }
  return work.cands
}

/** Lone candidate or hidden single, in whatever position is handed in. */
function directJustification(state, cell, digit) {
  const cands = state.cands[cell]
  if (!hasMark(cands, digit)) return false
  if (countMarks(cands) === 1) return true
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u]
    if (!unit.includes(cell)) continue
    let homes = 0
    for (const i of unit) if (state.board[i] === 0 && hasMark(state.cands[i], digit)) homes++
    if (homes === 1) return true
  }
  return false
}

/**
 * What to show a player who asks why, rather than what.
 *
 * `hintPlacement` already knows which cell to fill. This says what on the board
 * proves it, and hands back the cells and unit to draw so the answer can be
 * pointed at instead of recited. Returns null when nothing proves it, which
 * happens when a wrong digit has poisoned the position.
 */
export function explainPlacement(board, cell, digit) {
  const state = createState(board)
  const j = justification(state, cell, digit)
  if (!j) return null
  return { kind: j.kind, why: j.why, pattern: j.pattern, technique: j.pattern?.technique || null }
}

/**
 * One worked example of every technique a puzzle required, taken from that
 * puzzle rather than from a textbook.
 *
 * The practice screen can already tell you what an X-Wing is. This says "here
 * is the X-Wing that was in the grid you just played, at the moment it
 * mattered", which is the version worth looking at: you have already stared at
 * this board for ten minutes.
 *
 * Walks the ladder keeping the position at each step, so every example carries
 * the board and the candidates it was true in. Singles are skipped: a worked
 * example of "this cell had one candidate left" teaches nobody anything.
 */
export function workedExamples(puzzle, { skip = ['nakedSingle', 'hiddenSingle'] } = {}) {
  const state = createState(puzzle)
  const seen = new Set(skip)
  const out = []

  for (let guard = 0; guard < 800; guard++) {
    const step = nextStep(state)
    if (!step) break
    if (!seen.has(step.technique)) {
      seen.add(step.technique)
      out.push({
        technique: step.technique,
        step,
        board: state.board.slice(),
        cands: state.cands.slice(),
        // How far into the solve it came up, as a share of the grid filled.
        at: state.board.reduce((a, v) => a + (v ? 1 : 0), 0),
      })
    }
    for (const e of step.eliminations) state.cands[e.cell] = removeMark(state.cands[e.cell], e.digit)
    for (const p of step.placements) {
      state.board[p.cell] = p.digit
      state.cands[p.cell] = 0
      for (const q of PEERS[p.cell]) state.cands[q] = removeMark(state.cands[q], p.digit)
    }
  }
  return out
}
