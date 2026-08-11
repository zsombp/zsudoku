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
import { TECHNIQUES } from '../logic/techniques.js'
import { PEERS, rowOf, colOf } from '../logic/topology.js'
import { marksToList } from '../logic/marks.js'
import { justification, cellName } from '../logic/explain.js'
import { boardAt } from './replay.js'

export { settledCands } from '../logic/explain.js'

export const CLASSES = {
  routine: { label: 'Routine', rank: 3, about: 'The cell had only one candidate left.' },
  solid: { label: 'Solid', rank: 4, about: 'The digit had only one home left in a unit.' },
  sharp: { label: 'Sharp', rank: 5, about: 'This needed a real pattern, not just a scan.' },
  lucky: { label: 'Lucky', rank: 2, about: 'Right, but nothing on the board proved it yet.' },
  mistake: { label: 'Mistake', rank: 0, about: 'This digit does not belong here.' },
  hint: { label: 'Hint', rank: 1, about: 'The app filled this one in.' },
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
    let pattern = null
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
      pattern = j?.pattern || null
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
        ? {
            cell: offered.cell,
            digit: offered.digit,
            detail: best.detail,
            technique: best.technique,
            // Drawable, so "easier was 9 to r5c3" can point at r5c3 instead of
            // making you go and find it.
            step: best,
          }
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
      pattern,
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

/**
 * What the clock says about the judgment, which is where the interesting
 * findings are.
 *
 * The review has always shown a gap next to a class and never crossed them. A
 * long think before a move that was a lone candidate the whole time is a
 * scanning problem; an instant placement that nothing proved is not thinking at
 * all. Neither shows up in either number alone.
 *
 * Thresholds are relative to the game rather than absolute, because a fast
 * player's long pause and a slow player's are different numbers, and an
 * absolute one would tell most people the same thing every time.
 */
export function timeShape({ moves }) {
  const timed = moves.filter(m => m.gap > 0)
  if (timed.length < 8) return []

  const sorted = timed.map(m => m.gap).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  // A pause worth remarking on: well above this game's own rhythm, and long
  // enough in absolute terms to have been a real think.
  const long = Math.max(median * 3, 12000)
  const quick = Math.min(median / 2, 3000)

  const out = []
  const secs = ms => `${(ms / 1000).toFixed(0)}s`
  const pick = list => list.sort((a, b) => b.gap - a.gap)[0]

  const stalledOnEasy = timed.filter(m => m.gap > long && (m.cls === 'routine' || m.cls === 'solid'))
  if (stalledOnEasy.length) {
    const worst = pick(stalledOnEasy)
    out.push({
      id: 'stall-on-easy',
      tone: 'warn',
      text: `${stalledOnEasy.length} of your long pauses ended in a move that was already there for the taking. The worst was ${secs(worst.gap)} before ${worst.value} to ${worst.cellName}, which ${worst.cls === 'routine' ? 'was the only candidate left in that cell' : 'was the only home left for that digit'}. That is a scanning problem rather than a hard puzzle.`,
    })
  }

  const guessedFast = timed.filter(m => m.gap < quick && m.cls === 'lucky')
  if (guessedFast.length >= 3) {
    out.push({
      id: 'fast-guess',
      tone: 'warn',
      text: `${guessedFast.length} placements went in under ${secs(quick)} with nothing on the board proving them. Fast and unproven is the combination that turns into mistakes on a harder grid.`,
    })
  }

  const earned = timed.filter(m => m.gap > long && m.cls === 'sharp')
  if (earned.length) {
    const best = pick(earned)
    out.push({
      id: 'earned',
      tone: 'good',
      text: `${secs(best.gap)} on ${best.value} to ${best.cellName}, and it needed a real pattern. Time spent on something that was genuinely hard is the time that was well spent.`,
    })
  }

  const slowMistakes = timed.filter(m => m.gap > long && m.cls === 'mistake')
  if (slowMistakes.length >= 2) {
    out.push({
      id: 'slow-mistakes',
      tone: 'warn',
      text: `${slowMistakes.length} of your mistakes came after a long think. Deliberating your way to a wrong digit usually means the pencil marks you were reading had gone stale.`,
    })
  }

  return out
}
