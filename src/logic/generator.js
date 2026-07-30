// Puzzle generation. Ported from the prototype, with Math.random replaced by an
// injected seedable rng so every puzzle is reproducible from its seed.
//
// Phase 2 changes the strategy here: dig to a difficulty band rather than to a
// fixed clue count, and reject anything the technique ladder cannot finish.

import { PEERS, range } from './topology.js'
import { countSolutions } from './solver.js'
import { gradePuzzle } from './grader.js'
import { DIFFS } from './difficulty.js'
import { mulberry32, randomSeed, shuffle } from '../lib/prng.js'

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
 * First pass digs in rotationally symmetric pairs (i and 80-i), which is what
 * gives the finished grid its symmetry. If that cannot reach the clue target,
 * a second pass digs single cells wherever it can.
 */
export function dig(full, targetClues, rng) {
  const b = full.slice()
  let clues = 81

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

/**
 * Generates a puzzle aiming at `wanted`, and reports what it actually got.
 *
 * The returned `level` is the grader's verdict, which is not always the level
 * that was asked for. That mismatch is deliberate and is surfaced to the player
 * rather than hidden: the alternative is lying about difficulty.
 */
export function makePuzzle(wanted, { seed = randomSeed(), attempts = 36, budgetMs = 4500 } = {}) {
  const target = DIFFS[wanted]
  const rng = mulberry32(seed)
  const t0 = Date.now()
  let best = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateFull(rng)
    const puzzle = dig(solution, target.clues, rng)
    const level = gradePuzzle(puzzle)
    const clues = puzzle.reduce((n, v) => n + (v ? 1 : 0), 0)
    const cand = { puzzle, solution, level, clues, seed, requested: wanted }

    if (level === target.level) return cand
    if (!best || Math.abs(level - target.level) < Math.abs(best.level - target.level)) best = cand
    if (Date.now() - t0 > budgetMs) break
  }

  return best
}
