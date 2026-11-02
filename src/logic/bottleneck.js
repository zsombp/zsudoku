// What finding the next digit actually costs.
//
// The ladder takes the cheapest step it can, and most of the time that step is
// a placement: a single is sitting there. At a hard spot it is not. The ladder
// takes an elimination (an X-Wing, a hidden pair), then maybe another, and only
// then does a digit fall out, usually as a single. The digit is the easy part;
// the elimination that unlocked it is the skill.
//
// Everything that judged a hint used to read the label of that last single.
// `hintPlacement` walks past the eliminations to the first placement, and the
// hint log recorded the placement's technique, so an XY-Wing you could not find
// went down as a naked single you could not find. Measured against real games
// in October 2026: both hints in the synced history sat at an XY-Wing and a
// hidden triple, and both were logged as singles. The curriculum then rated
// XY-Wing 0.90 out of 1 for someone who had never found one, and hidden single
// as their weakest pattern.
//
// So this is the one place that answers "what did it take to get the next
// digit from here": the path, and the hardest rung on it.

import { createState, nextStep, applyStep } from './grader.js'
import { LADDER } from './techniques.js'
import { CLASSIC } from './topology.js'

const rank = key => LADDER.indexOf(key)

/**
 * The ladder's path from this board to its first placement.
 *
 * Returns null when the ladder cannot move at all, which on a real game means a
 * wrong digit is already on the board.
 *
 *   steps       every step taken, each with the candidates it fired on
 *   needed      the hardest technique on the path
 *   bottleneck  the step that used it, with its candidates, for drawing
 *   placement   the digit the path ends on
 */
export function pathToNextDigit(board, topo = CLASSIC, { maxSteps = 60 } = {}) {
  const state = createState(board, topo)
  const steps = []
  for (let guard = 0; guard < maxSteps; guard++) {
    const step = nextStep(state)
    if (!step) return null
    // The candidates this step was found in, before it changes them: a step's
    // pattern only reads true against the position it fired in.
    steps.push({ step, board: state.board.slice(), cands: state.cands.slice() })
    if (step.placements.length) {
      let hardest = steps[0]
      for (const s of steps) if (rank(s.step.technique) > rank(hardest.step.technique)) hardest = s
      return {
        steps,
        needed: hardest.step.technique,
        bottleneck: hardest,
        placement: step.placements[0],
        placedBy: step.technique,
      }
    }
    applyStep(state, step)
  }
  return null
}

/** Just the technique, for the many callers that only need a label. */
export function neededAt(board, topo = CLASSIC) {
  return pathToNextDigit(board, topo)?.needed || null
}

/**
 * Rungs too cheap to count as being stuck on. A naked single is bookkeeping,
 * and the grader scores it zero for the same reason: a wrong digit placed when a
 * naked single was available is a slip, not a pattern that beat you.
 */
export const NOT_A_SKILL = new Set(['nakedSingle'])
