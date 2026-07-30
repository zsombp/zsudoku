// Puzzle generation.
//
// Two changes from the prototype's approach, both of which exist to make the
// difficulty label mean something:
//
// 1. It digs toward a difficulty band, not a clue count. The old code dug to a
//    fixed number of clues and hoped the grade landed right. Here the puzzle is
//    graded as it is dug and the digging adjusts: too easy, remove another
//    clue; too hard, put one back. Clue count is an outcome, not a target.
//
// 2. Nothing that needs guessing ever ships. If the technique ladder cannot
//    finish a puzzle, it is discarded whatever tier was asked for. "Expert"
//    means hard, not unfair.

import { PEERS, range } from './topology.js'
import { countSolutions } from './solver.js'
import { gradePuzzle } from './grader.js'
import { TIERS, tierByName, tierForScore } from './difficulty.js'
import { mulberry32, randomSeed, shuffle } from '../lib/prng.js'

const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t.name, i]))

/** A random completed grid. Backtracking cell by cell over shuffled digits. */
export function generateFull(rng) {
  const b = new Array(81).fill(0)
  const fill = i => {
    if (i === 81) return true
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      let ok = true
      for (const p of PEERS[i]) if (b[p] === v) { ok = false; break }
      if (ok) {
        b[i] = v
        if (fill(i + 1)) return true
        b[i] = 0
      }
    }
    return false
  }
  fill(0)
  return b
}

/**
 * Removes clues while keeping the solution unique.
 *
 * Digs in rotationally symmetric pairs (i and 80-i), which is what gives the
 * finished grid its symmetry. The hardest tiers need asymmetry to reach their
 * scores, so `symmetric` is a per-tier switch rather than a rule.
 */
export function dig(full, targetClues, rng, { symmetric = true } = {}) {
  const b = full.slice()
  let clues = 81

  if (symmetric) {
    for (const i of shuffle(range(41), rng)) {
      if (clues <= targetClues) break
      const j = 80 - i
      if (b[i] === 0) continue
      const k1 = b[i]
      const k2 = b[j]
      b[i] = 0
      if (j !== i) b[j] = 0
      if (countSolutions(b, 2) !== 1) {
        b[i] = k1
        if (j !== i) b[j] = k2
      } else {
        clues -= j === i ? 1 : 2
      }
    }
  }

  if (clues > targetClues) {
    for (const i of shuffle(range(81), rng)) {
      if (clues <= targetClues) break
      if (b[i] === 0) continue
      const k = b[i]
      b[i] = 0
      if (countSolutions(b, 2) !== 1) b[i] = k
      else clues--
    }
  }

  return b
}

const clueCount = p => p.reduce((n, v) => n + (v ? 1 : 0), 0)

/** One more clue out, keeping uniqueness. Raises difficulty. Null if stuck. */
function digOneMore(puzzle, rng) {
  for (const i of shuffle(range(81), rng)) {
    if (puzzle[i] === 0) continue
    const next = puzzle.slice()
    next[i] = 0
    if (countSolutions(next, 2) === 1) return next
  }
  return null
}

/** One clue back from the solution. Always safe, and lowers difficulty. */
function restoreOne(puzzle, solution, rng) {
  const holes = range(81).filter(i => puzzle[i] === 0)
  if (!holes.length) return null
  const i = shuffle(holes, rng)[0]
  const next = puzzle.slice()
  next[i] = solution[i]
  return next
}

/**
 * Digs a single grid toward the target band, then reports where it landed.
 * The adjustment loop is what lifts the hit rate: without it, a fixed clue
 * count scatters across two or three tiers.
 */
function shapeToBand(solution, tier, rng, { maxAdjust = 30 } = {}) {
  let puzzle = dig(solution, tier.clues, rng, { symmetric: tier.symmetric !== false })
  let grade = gradePuzzle(puzzle)

  for (let n = 0; n < maxAdjust; n++) {
    // Unsolvable by the ladder means we dug past the point of fairness. Put a
    // clue back rather than shipping a puzzle that needs a guess.
    if (!grade.solved) {
      const back = restoreOne(puzzle, solution, rng)
      if (!back) break
      puzzle = back
      grade = gradePuzzle(puzzle)
      continue
    }
    if (grade.score >= tier.min && grade.score < tier.max) break

    if (grade.score < tier.min) {
      const harder = digOneMore(puzzle, rng)
      if (!harder) break
      const nextGrade = gradePuzzle(harder)
      // Refuse a step that lands somewhere unfair.
      if (!nextGrade.solved) {
        const alt = digOneMore(puzzle, rng)
        if (!alt) break
        const altGrade = gradePuzzle(alt)
        if (!altGrade.solved) break
        puzzle = alt
        grade = altGrade
        continue
      }
      puzzle = harder
      grade = nextGrade
    } else {
      const easier = restoreOne(puzzle, solution, rng)
      if (!easier) break
      puzzle = easier
      grade = gradePuzzle(easier)
    }
  }

  return { puzzle, grade }
}

/**
 * Generates a puzzle aiming at `wanted`, and reports what it actually got.
 *
 * `graded` is the grader's verdict and is the only thing ever shown to the
 * player. It is not always `requested`, and when it differs the interface says
 * so out loud. The alternative is lying about difficulty, which is the thing
 * this whole engine exists to avoid.
 */
export function makePuzzle(wanted, opts = {}) {
  const tier = tierByName(wanted)
  const seed = opts.seed ?? randomSeed()
  const attempts = opts.attempts ?? tier.attempts ?? 24
  const budgetMs = opts.budgetMs ?? tier.budgetMs ?? 6000
  const rng = mulberry32(seed)
  const t0 = Date.now()
  let best = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateFull(rng)
    const { puzzle, grade } = shapeToBand(solution, tier, rng)

    // Never ship a puzzle the ladder cannot finish, at any tier.
    if (!grade.solved) continue

    const graded = tierForScore(grade.score)
    const cand = {
      puzzle,
      solution,
      seed,
      requested: wanted,
      graded: graded.name,
      score: grade.score,
      hardest: grade.hardest,
      counts: grade.counts,
      clues: clueCount(puzzle),
    }

    if (graded.name === tier.name) return cand

    // Keep the nearest miss, measured in tiers rather than raw score.
    const distance = Math.abs(TIER_INDEX[graded.name] - TIER_INDEX[tier.name])
    if (!best || distance < best.distance) best = { ...cand, distance }

    if (Date.now() - t0 > budgetMs) break
  }

  return best
}
