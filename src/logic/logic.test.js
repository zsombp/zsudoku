// Tests for the logic layer. This is the one place tests genuinely earn their
// keep: the generator and grader are the product, and a silent regression there
// means unfair puzzles or dishonest labels rather than a visible bug.
//
// Phase 2 adds the real calibration suite. This is the Phase 0 safety net that
// proves the port did not break the prototype's behaviour.

import { describe, it, expect } from 'vitest'
import { UNITS, PEERS, candsAt, candMaskAt, range } from './topology.js'
import { countSolutions, solve, hasUniqueSolution } from './solver.js'
import { generateFull, dig, makePuzzle } from './generator.js'
import { gradePuzzle } from './grader.js'
import { DIFFS } from './difficulty.js'
import { mulberry32, seedFromDate, shuffle } from '../lib/prng.js'
import { hasMark, addMark, removeMark, toggleMark, marksToList, listToMarks, countMarks } from './marks.js'

const isValidGrid = b => UNITS.every(u => {
  const seen = new Set()
  for (const i of u) {
    if (!b[i]) return false
    if (seen.has(b[i])) return false
    seen.add(b[i])
  }
  return true
})

describe('topology', () => {
  it('has 27 units of 9 cells', () => {
    expect(UNITS).toHaveLength(27)
    for (const u of UNITS) expect(u).toHaveLength(9)
  })

  it('gives every cell exactly 20 peers, never itself', () => {
    for (const i of range(81)) {
      expect(PEERS[i]).toHaveLength(20)
      expect(PEERS[i]).not.toContain(i)
    }
  })

  it('peering is symmetric', () => {
    for (const i of range(81)) for (const p of PEERS[i]) expect(PEERS[p]).toContain(i)
  })

  it('candMaskAt agrees with candsAt', () => {
    const full = generateFull(mulberry32(7))
    const b = dig(full, 30, mulberry32(11))
    for (const i of range(81)) {
      if (b[i] !== 0) continue
      expect(marksToList(candMaskAt(b, i))).toEqual(candsAt(b, i))
    }
  })
})

describe('marks bitmask', () => {
  it('round-trips a digit list', () => {
    const list = [1, 4, 5, 9]
    expect(marksToList(listToMarks(list))).toEqual(list)
  })

  it('adds, removes and toggles', () => {
    let m = 0
    m = addMark(m, 3)
    expect(hasMark(m, 3)).toBe(true)
    expect(hasMark(m, 4)).toBe(false)
    m = toggleMark(m, 3)
    expect(hasMark(m, 3)).toBe(false)
    m = addMark(addMark(m, 2), 7)
    expect(countMarks(m)).toBe(2)
    m = removeMark(m, 2)
    expect(marksToList(m)).toEqual([7])
  })
})

describe('prng', () => {
  it('is deterministic for a seed', () => {
    const a = Array.from({ length: 5 }, mulberry32(42))
    const b = Array.from({ length: 5 }, mulberry32(42))
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('derives the same seed from the same date', () => {
    expect(seedFromDate(new Date(2026, 6, 30))).toBe(seedFromDate(new Date(2026, 6, 30)))
    expect(seedFromDate(new Date(2026, 6, 30))).not.toBe(seedFromDate(new Date(2026, 6, 31)))
  })

  it('shuffle keeps every element', () => {
    const out = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], mulberry32(3))
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('generator', () => {
  it('generateFull produces a legal complete grid', () => {
    for (const seed of [1, 2, 3, 99]) {
      expect(isValidGrid(generateFull(mulberry32(seed)))).toBe(true)
    }
  })

  it('is reproducible from a seed', () => {
    expect(generateFull(mulberry32(123))).toEqual(generateFull(mulberry32(123)))
  })

  it('dug puzzles keep a unique solution', () => {
    for (const seed of [5, 6, 7]) {
      const full = generateFull(mulberry32(seed))
      const puzzle = dig(full, 30, mulberry32(seed + 100))
      expect(hasUniqueSolution(puzzle)).toBe(true)
    }
  })

  it('dug puzzles solve back to the grid they came from', () => {
    const full = generateFull(mulberry32(21))
    const puzzle = dig(full, 32, mulberry32(22))
    expect(solve(puzzle)).toEqual(full)
  })
})

describe('solver', () => {
  it('counts an empty-ish board as more than one solution', () => {
    const b = new Array(81).fill(0)
    expect(countSolutions(b, 2)).toBe(2)
  })

  it('counts a complete grid as exactly one', () => {
    expect(countSolutions(generateFull(mulberry32(4)), 2)).toBe(1)
  })
})

describe('grader', () => {
  it('grades a complete grid as the easiest level', () => {
    expect(gradePuzzle(generateFull(mulberry32(8)))).toBe(1)
  })

  it('returns a level in range for real puzzles', () => {
    for (const seed of [11, 12, 13]) {
      const full = generateFull(mulberry32(seed))
      const puzzle = dig(full, 30, mulberry32(seed + 50))
      const level = gradePuzzle(puzzle)
      expect(level).toBeGreaterThanOrEqual(1)
      expect(level).toBeLessThanOrEqual(4)
    }
  })
})

describe('makePuzzle', () => {
  // The honesty contract: the level reported is the level the grader measured,
  // regardless of what was requested.
  for (const wanted of Object.keys(DIFFS)) {
    it(`${wanted}: reports a graded level that matches its own puzzle`, () => {
      const made = makePuzzle(wanted, { seed: 2026, attempts: 8, budgetMs: 8000 })
      expect(made).toBeTruthy()
      expect(made.level).toBe(gradePuzzle(made.puzzle))
      expect(hasUniqueSolution(made.puzzle)).toBe(true)
      expect(made.requested).toBe(wanted)
      expect(made.clues).toBe(made.puzzle.filter(Boolean).length)
    })
  }

  it('is reproducible from a seed', () => {
    const a = makePuzzle('Medium', { seed: 777, attempts: 4 })
    const b = makePuzzle('Medium', { seed: 777, attempts: 4 })
    expect(a.puzzle).toEqual(b.puzzle)
    expect(a.level).toBe(b.level)
  })
})
