// Brute-force solver. Its only job is answering "does this puzzle have exactly
// one solution", which is what makes a puzzle a puzzle. Ported 1:1.
//
// Not to be confused with the grader, which solves the way a person does and is
// what decides difficulty.

import { CLASSIC, candsAt } from './topology.js'

/**
 * Counts solutions up to `limit`. Passing limit 2 answers "unique?" without
 * exploring the whole space. Minimum-remaining-values ordering keeps it fast.
 */
export function countSolutions(bd, limit = 2, topo = CLASSIC) {
  const b = bd.slice()
  let count = 0
  const step = () => {
    let best = -1
    let bestC = null
    for (let i = 0; i < 81; i++) {
      if (b[i] === 0) {
        const c = candsAt(b, i, topo)
        if (c.length === 0) return
        if (!bestC || c.length < bestC.length) {
          best = i
          bestC = c
          if (c.length === 1) break
        }
      }
    }
    if (best === -1) { count++; return }
    for (const v of bestC) {
      b[best] = v
      step()
      b[best] = 0
      if (count >= limit) return
    }
  }
  step()
  return count
}

export const hasUniqueSolution = (bd, topo = CLASSIC) => countSolutions(bd, 2, topo) === 1

/** First solution found, or null. Used to answer "is this placement right". */
export function solve(bd, topo = CLASSIC) {
  const b = bd.slice()
  const step = () => {
    let best = -1
    let bestC = null
    for (let i = 0; i < 81; i++) {
      if (b[i] === 0) {
        const c = candsAt(b, i, topo)
        if (c.length === 0) return false
        if (!bestC || c.length < bestC.length) {
          best = i
          bestC = c
          if (c.length === 1) break
        }
      }
    }
    if (best === -1) return true
    for (const v of bestC) {
      b[best] = v
      if (step()) return true
      b[best] = 0
    }
    return false
  }
  return step() ? b : null
}

/** True if `b` breaks a sudoku rule: the same digit twice in one unit. */
export function hasConflict(b, i, topo = CLASSIC) {
  const v = b[i]
  if (!v) return false
  for (const p of topo.peers[i]) if (b[p] === v) return true
  return false
}
