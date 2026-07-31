// Move-by-move analysis of a finished game.
//
// The chess-review idea, and it works here for the same reason it works there:
// there is an engine that can say what the position actually offered. The
// technique ladder already does that. For each placement we rebuild the board
// as it stood beforehand, ask what was derivable, and compare it to what you
// played.
//
// The classes are deliberately not a score. A sudoku move is not better for
// being harder; it is better for being justified. So the axis is "could you
// know this", not "how clever was it".

import { createState, nextStep } from '../logic/grader.js'
import { TECHNIQUES, LADDER } from '../logic/techniques.js'
import { UNITS, UNIT_META, PEERS, unitName, rowOf, colOf } from '../logic/topology.js'
import { hasMark, marksToList, countMarks, removeMark } from '../logic/marks.js'
import { boardAt } from './replay.js'

export const CLASSES = {
  routine: { label: 'Routine', rank: 3, about: 'The cell had only one candidate left.' },
  solid: { label: 'Solid', rank: 4, about: 'The digit had only one home left in a unit.' },
  sharp: { label: 'Sharp', rank: 5, about: 'This needed a real pattern, not just a scan.' },
  lucky: { label: 'Lucky', rank: 2, about: 'Right, but nothing on the board proved it yet.' },
  mistake: { label: 'Mistake', rank: 0, about: 'This digit does not belong here.' },
  hint: { label: 'Hint', rank: 1, about: 'The app filled this one in.' },
}

const cellName = i => `r${rowOf(i) + 1}c${colOf(i) + 1}`

/**
 * Why the board proved this digit belongs in this cell, cheapest reason first.
 * Returns null when nothing on the board proved it yet, which is what makes a
 * correct move "lucky" rather than earned.
 */
function justification(state, cell, digit) {
  if (state.board[cell] !== 0) return null
  const cands = state.cands[cell]
  if (!hasMark(cands, digit)) return null

  if (countMarks(cands) === 1) {
    return { kind: 'routine', why: `${cellName(cell)} had only ${digit} left.` }
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
      }
    }
  }

  // Neither a lone candidate nor a hidden single, so the only way this was
  // knowable is if the ladder's eliminations make it one.
  //
  // "Sharp" used to be the fallthrough, which meant a digit dropped onto an
  // empty grid was classed as brilliant deduction. A move is only sharp if
  // something actually proved it.
  const by = provenBy(state, cell, digit)
  if (!by) return null

  return {
    kind: 'sharp',
    why: `${cellName(cell)} still showed ${marksToList(cands).join('/')}; ${TECHNIQUES[by]?.label || by} ruled the rest out.`,
    technique: by,
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
      if (directJustification(work, cell, digit)) return key
    }
    if (!changed) break
  }
  return null
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

/** Why a wrong digit was wrong, in the most concrete terms available. */
function faultOf(state, cell, digit, solution) {
  const clash = PEERS[cell].find(p => state.board[p] === digit)
  if (clash !== undefined) {
    return `There was already a ${digit} at ${cellName(clash)}.`
  }
  const cands = marksToList(state.cands[cell])
  if (cands.length === 1) {
    return `${cellName(cell)} could only be ${cands[0]}.`
  }
  return `${cellName(cell)} was ${solution[cell]}; ${digit} does not fit the rest of the grid.`
}

/**
 * Every placement in the game, classified, with what the board offered instead.
 *
 * Rebuilds the candidate state from the board at each step rather than
 * threading it through, which costs about 1600 operations a move and keeps this
 * correct across undos and erases without any special handling.
 */
export function analyseGame(record) {
  const log = record.moveLog || []
  const solution = record.solution || []
  if (!log.length || !solution.length) return { moves: [], counts: {}, missed: 0 }

  const moves = []
  const counts = {}
  const toldAbout = new Set()
  let prevT = 0
  let missed = 0

  for (let i = 0; i < log.length; i++) {
    const m = log[i]
    const isPlacement = m.kind === 'place' || m.kind === 'hint'
    const gap = Math.max(0, m.t - prevT)
    prevT = m.t
    if (!isPlacement) continue

    const before = boardAt(record, i - 1)
    const state = createState(before)

    // The easiest thing the position offered, whether or not it was taken.
    const best = nextStep(state)
    const bestPlacement = best?.placements?.[0] || null

    let cls
    let why
    if (m.kind === 'hint') {
      cls = 'hint'
      why = m.technique ? `Found by ${TECHNIQUES[m.technique]?.label || m.technique}.` : 'You asked for this one.'
    } else if (m.correct === false || solution[m.cell] !== m.value) {
      cls = 'mistake'
      why = faultOf(state, m.cell, m.value, solution)
    } else {
      const j = justification(state, m.cell, m.value)
      cls = j ? j.kind : 'lucky'
      why = j ? j.why : `Nothing on the board proved ${m.value} here yet.`
    }

    // Only worth mentioning an alternative when yours was not the easy one.
    //
    // And only once per cell: an easy placement you keep walking past stays the
    // cheapest move for as long as you ignore it, so naming it on every line
    // repeats one fact a dozen times and reads like a broken template. It still
    // counts toward `missed` each time, because you did miss it each time.
    const offered =
      bestPlacement && bestPlacement.cell !== m.cell && (cls === 'lucky' || cls === 'sharp' || cls === 'mistake')
        ? bestPlacement
        : null
    const alternative =
      offered && !toldAbout.has(offered.cell)
        ? { cell: offered.cell, digit: offered.digit, detail: best.detail, technique: best.technique }
        : null
    if (alternative) toldAbout.add(alternative.cell)
    if (offered && cls !== 'mistake') missed++

    counts[cls] = (counts[cls] || 0) + 1
    moves.push({
      index: i,
      n: moves.length + 1,
      t: m.t,
      gap,
      cell: m.cell,
      cellName: cellName(m.cell),
      value: m.value,
      cls,
      why,
      alternative,
    })
  }

  return { moves, counts, missed }
}

/** One line for the top of the review. */
export function verdict({ moves, counts }) {
  if (!moves.length) return null
  const total = moves.length
  const earned = (counts.routine || 0) + (counts.solid || 0) + (counts.sharp || 0)
  const pct = Math.round((earned / total) * 100)

  if (counts.mistake >= total * 0.15) {
    return `${pct}% of your placements were justified by the board. The mistakes are the thing to look at.`
  }
  if ((counts.lucky || 0) >= total * 0.15) {
    return `${pct}% justified, but ${counts.lucky} placements went in before the board proved them. Guessing that works is still guessing.`
  }
  if ((counts.sharp || 0) >= 3) {
    return `${pct}% justified, including ${counts.sharp} that needed a real pattern. That is the good stuff.`
  }
  return `${pct}% of your placements were justified by the board when you made them.`
}
