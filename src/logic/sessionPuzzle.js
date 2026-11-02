import { createState, nextStep, applyStep, gradePuzzle } from './grader.js'
import { makeVariantPractice, topologyFromRecord } from './variants.js'
import { tierForScore } from './difficulty.js'
import { randomSeed } from '../lib/prng.js'

const empties = board => board.filter(v => !v).length
const distance = n => n < 25 ? 25 - n : n > 40 ? n - 40 : 0

/** Keep a real prefix of the solve, with a few placements before the pattern. */
export function finishPosition(made, technique) {
  const topo = topologyFromRecord(made)
  const state = createState(made.puzzle, topo)
  const positions = []
  const candidates = new Map()
  for (let guard = 0; guard < 800; guard++) {
    const step = nextStep(state)
    if (!step) break
    if (!positions.length || step.placements.length) positions.push(state.board.slice())
    if (step.technique === technique) {
      // Three placements gives a short approach. Earlier prefixes remain
      // candidates when the pattern only occurs near the end of the solve.
      for (let i = 0; i < positions.length; i++) {
        const board = positions[i]
        const n = empties(board)
        candidates.set(board.join(''), { board, n, lead: positions.length - 1 - i })
      }
      candidates.set(state.board.join(''), { board: state.board.slice(), n: empties(state.board), lead: 0 })
    }
    applyStep(state, step)
  }
  const ranked = [...candidates.values()].sort((a, b) =>
    distance(a.n) - distance(b.n) || Math.abs(a.lead - 3) - Math.abs(b.lead - 3) || a.n - b.n
  )
  for (const { board, n } of ranked) {
    // Earlier eliminations are not givens. Rebuild candidates and prove that
    // the remaining puzzle still needs this rung and still finishes by logic.
    const grade = gradePuzzle(board, { topo })
    if (!grade.solved || !grade.counts[technique] || n > 45 || n < 20) continue
    return {
      ...made, puzzle: board, clues: 81 - n, score: grade.score,
      graded: tierForScore(grade.score).name, hardest: grade.hardest,
      counts: grade.counts, sessionPuzzle: true,
    }
  }
  return null
}

/** Search for the target size, keeping an honest nearest miss if it is rare. */
export function makeSessionPuzzle(technique, { seed = randomSeed(), budgetMs = 30000 } = {}) {
  const started = Date.now()
  let best = null
  for (let n = 0; n < 8 && Date.now() - started < budgetMs; n++) {
    const made = makeVariantPractice('classic', technique, {
      seed: (seed + n * 7919) >>> 0, budgetMs: Math.max(1, budgetMs - (Date.now() - started)),
    })
    if (!made) continue
    const short = finishPosition(made, technique)
    if (!short) continue
    if (!best || distance(empties(short.puzzle)) < distance(empties(best.puzzle))) best = short
    if (distance(empties(short.puzzle)) === 0) return short
  }
  return best
}
