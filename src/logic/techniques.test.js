// The arithmetic rungs: what a cage sum proves, and what it must never claim.
//
// Everything else in the ladder is tested in logic.test.js against classic
// grids. These five are the first rungs that can say nothing at all on a board
// with no cages, and the first that can be wrong in a way no classic test would
// notice, so they are tested twice over: once on hand-built cages where the
// arithmetic is checkable by eye, and once against real generated killers where
// the solution is known and every claim can be held against it.

import { describe, it, expect } from 'vitest'
import { TECHNIQUES, CAGE_TECHNIQUES, LADDER, GRADER_VERSION } from './techniques.js'
import { createState, nextStep, applyStep, gradePuzzle } from './grader.js'
import { killerTopology, makeVariantPuzzle } from './variants.js'
import { CLASSIC, range } from './topology.js'
import { marksToList } from './marks.js'
import { mulberry32 } from '../lib/prng.js'
import { generateFull, dig } from './generator.js'

const ALL = 0b111111111
const fire = (key, state) => TECHNIQUES[key].fn(state)

/**
 * A board with nothing placed and every digit still open, over a hand-made cage
 * list.
 *
 * The cages need not cover the grid: a technique reads `topo.cages` and the
 * cells it names, so a two-cell list is a complete test case. The one exception
 * is `sum45`, which needs a whole unit's worth, and its cases say so.
 */
const openBoard = cages => ({
  board: new Array(81).fill(0),
  cands: Int16Array.from(range(81), () => ALL),
  topo: killerTopology(cages),
})

const digitsOf = step => [...new Set(step.eliminations.map(e => e.digit))].sort()
const cellsHit = step => [...new Set(step.eliminations.map(e => e.cell))].sort((a, b) => a - b)

describe('what a cage sum proves', () => {
  it('reads the only combination off a two cell seventeen', () => {
    // The first thing anyone learns about killer, and the case a table built
    // with an off-by-one on the size or the digit still passes almost
    // everywhere else.
    const step = fire('cageCombo', openBoard([{ cells: [0, 1], sum: 17 }]))
    expect(step.technique).toBe('cageCombo')
    expect(step.digits).toEqual([8, 9])
    expect(cellsHit(step)).toEqual([0, 1])
    expect(digitsOf(step)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps what several combinations agree on, and drops the rest', () => {
    // Five across two cells is 1+4 or 2+3, so the cage is settled to nothing
    // above 4 without either combination being settled at all. This is the rung
    // that does the work on a real board; single combinations are rarer.
    const step = fire('cageSum', openBoard([{ cells: [0, 1], sum: 5 }]))
    expect(step.technique).toBe('cageSum')
    expect(step.digits).toEqual([1, 2, 3, 4])
    expect(digitsOf(step)).toEqual([5, 6, 7, 8, 9])
  })

  it('leaves a cage alone once nothing more can be said about it', () => {
    // 45 across nine cells is every digit, so it rules nothing out. A technique
    // that returned a step with an empty elimination list would stall the
    // grader: it counts a firing, pays its cost and changes nothing.
    const nine = { cells: range(9), sum: 45 }
    expect(fire('cageCombo', openBoard([nine]))).toBeNull()
    expect(fire('cageSum', openBoard([nine]))).toBeNull()
  })

  it('subtracts what the cage already holds', () => {
    // A cage of three summing 24 is 7, 8 and 9. With the 7 written in, the rest
    // is 17 across two cells, and the technique has to be asking about that
    // rather than about the original sum.
    const state = openBoard([{ cells: [0, 1, 2], sum: 24 }])
    state.board[0] = 7
    state.cands[0] = 0
    const step = fire('cageCombo', state)
    expect(step.digits).toEqual([8, 9])
    expect(cellsHit(step)).toEqual([1, 2])
    expect(step.detail).toContain('the rest of the 24 cage')
  })

  it('places a digit that every combination needs and only one cell can take', () => {
    // A hidden single over a group that is not a unit, which is the whole point
    // of the rung: no amount of reasoning about rows, columns and boxes reaches
    // it.
    const state = openBoard([{ cells: [0, 1, 2], sum: 24 }])
    state.cands[0] = 0b11000000 // 7, 8
    state.cands[1] = 0b11000000 // 7, 8
    const step = fire('cageSingle', state)
    expect(step.placements).toEqual([{ cell: 2, digit: 9 }])
  })
})

describe('the 45 rule', () => {
  /** Row one cut into cages, plus whatever else a case needs. */
  const rowOne = extra => [
    { cells: [0, 1, 2], sum: 6 },
    { cells: [3, 4, 5], sum: 15 },
    ...extra,
  ]

  it('names the one cell the cages inside a unit do not settle', () => {
    // 6 + 15 + 15 is 36 of row one's 45, over eight of its nine cells, so the
    // ninth is 9. The cage holding it has to be one that leaves the row, or the
    // row would be fully covered and there would be nothing to say.
    const state = openBoard(rowOne([{ cells: [6, 7], sum: 15 }, { cells: [8, 17], sum: 12 }]))
    const step = fire('sum45', state)
    expect(step.technique).toBe('sum45')
    expect(step.placements).toEqual([{ cell: 8, digit: 9 }])
    expect(step.unit).toEqual(CLASSIC.unitMeta[0])
  })

  it('names the one cell the cages spill outside a unit', () => {
    // The same equation from the other end. Every cage touching row one totals
    // 6 + 15 + 30 = 51, which is six more than 45, and the only cell of those
    // cages outside the row is r2c1. So r2c1 is 6.
    const state = openBoard(rowOne([{ cells: [6, 7, 8, 9], sum: 30 }]))
    const step = fire('sum45', state)
    expect(step.placements).toEqual([{ cell: 9, digit: 6 }])
    expect(step.detail).toContain('51')
  })

  it('says nothing when the leftover is not a digit', () => {
    // An impossible total has to come back as no step rather than as a
    // placement of 0 or 13. Nothing downstream checks: the grader would write
    // it straight onto the board.
    const state = openBoard(rowOne([{ cells: [6, 7], sum: 3 }, { cells: [8, 17], sum: 12 }]))
    expect(fire('sum45', state)).toBeNull()
  })

  it('ignores a unit with a cell in no cage at all', () => {
    // Only reachable from a damaged cage list, and the arithmetic would be
    // wrong rather than absent: the missing cell's cage contributes nothing to
    // the total and the leftover comes out too large.
    const state = openBoard([{ cells: [0, 1, 2], sum: 6 }, { cells: [3, 4, 5], sum: 15 }])
    expect(fire('sum45', state)).toBeNull()
  })
})

describe('a cage against a unit', () => {
  it('strikes a digit from the rest of the line it is confined to', () => {
    // 17 across r1c1 and r1c2 needs an 8 somewhere in those two cells, and both
    // are in row one, so no other cell of row one can hold it.
    const step = fire('cageLocked', openBoard([{ cells: [0, 1], sum: 17 }]))
    expect(step.technique).toBe('cageLocked')
    expect(step.digits).toEqual([8])
    expect(step.unit).toEqual(CLASSIC.unitMeta[0])
    expect(cellsHit(step)).toEqual([2, 3, 4, 5, 6, 7, 8])
  })

  it('leaves a one cell answer to the cheaper rung', () => {
    // With only one home left the digit is placed, and `cageSingle` costs 60
    // against 170. A rung that also fired here would price one deduction twice
    // and would never be the cheapest step, so it would never be seen.
    const state = openBoard([{ cells: [0, 1], sum: 17 }])
    state.cands[1] = 0b100000000 // 9 only, so 8 has one home
    const step = fire('cageLocked', state)
    expect(step === null || !step.digits.includes(8)).toBe(true)
  })
})

describe('the arithmetic rungs cost a classic board nothing', () => {
  it('every one of them says nothing at all on a board with no cages', () => {
    // The mechanism behind the claim that adding these five moved no classic
    // score. Measured too, over 168 puzzles at fixed seeds across five
    // variants, which came back byte for byte identical; this is the reason.
    const rng = mulberry32(4242)
    const puzzle = dig(generateFull(rng), 26, rng)
    const state = createState(puzzle)
    expect(CAGE_TECHNIQUES).toHaveLength(5)
    for (const key of CAGE_TECHNIQUES) expect(fire(key, state), key).toBeNull()
  })

  it('sits in cost order in the ladder, like every other rung', () => {
    // The grader takes the first technique that fires, so the order is the
    // whole meaning of the costs. A rung inserted at the wrong place would make
    // the ladder report an expensive technique for a cheap deduction.
    let last = -1
    for (const key of LADDER) {
      expect(TECHNIQUES[key].first, `${key} is out of order`).toBeGreaterThanOrEqual(last)
      last = TECHNIQUES[key].first
    }
  })

  it('is stamped by a grader version that moved when the ladder did', () => {
    // Scores only compare within one version, and puzzles are cached with their
    // tier baked in. Two is the ladder without arithmetic.
    expect(GRADER_VERSION).toBeGreaterThan(2)
  })
})

describe('the ladder on a real killer board', () => {
  const boards = ['Easy', 'Medium', 'Expert'].map(tier => {
    const made = makeVariantPuzzle('killer', tier, { seed: 606 + tier.length })
    return { tier, made, topo: killerTopology(made.cages) }
  })

  it('never rules out a digit the answer needs, and never places a wrong one', () => {
    // The soundness test, and the only one that would catch a cage combination
    // filtered by the wrong mask. An unsound elimination does not throw: it
    // produces a board that is quietly unsolvable, thirty moves later.
    for (const { tier, made, topo } of boards) {
      const state = createState(made.puzzle, topo)
      for (let guard = 0; guard < 800; guard++) {
        const step = nextStep(state)
        if (!step) break
        for (const { cell, digit } of step.eliminations) {
          expect(made.solution[cell], `${tier}: ${step.technique} ruled ${digit} out of ${cell}`).not.toBe(digit)
        }
        for (const { cell, digit } of step.placements) {
          expect(made.solution[cell], `${tier}: ${step.technique} placed ${digit} in ${cell}`).toBe(digit)
        }
        applyStep(state, step)
      }
    }
  })

  it('finishes by pure logic, and uses the arithmetic to do it', () => {
    // Two claims in one, because either alone can pass while the feature is
    // broken: a killer the ladder cannot finish would never ship, and a killer
    // it finishes without ever touching a cage is a classic puzzle with
    // decorations.
    for (const { tier, made, topo } of boards) {
      const g = gradePuzzle(made.puzzle, { topo })
      expect(g.solved, tier).toBe(true)
      const used = CAGE_TECHNIQUES.filter(k => g.counts[k])
      expect(used.length, `${tier} needed no cage reasoning at all`).toBeGreaterThan(0)
    }
  })

  it('reports every arithmetic step in the shape the rest of the app reads', () => {
    // Hints, the explanation, the review, the move classifier and belief
    // archaeology all read the same fields off a step. A rung that returned a
    // shorter object would break all of them at once and none of them loudly.
    const seen = new Set()
    for (const { made, topo } of boards) {
      const state = createState(made.puzzle, topo)
      for (let guard = 0; guard < 800; guard++) {
        const step = nextStep(state)
        if (!step) break
        expect(TECHNIQUES[step.technique]).toBeTruthy()
        expect(Array.isArray(step.placements)).toBe(true)
        expect(Array.isArray(step.eliminations)).toBe(true)
        expect(Array.isArray(step.cells)).toBe(true)
        expect(Array.isArray(step.digits)).toBe(true)
        expect(step.placements.length + step.eliminations.length).toBeGreaterThan(0)
        expect(step.detail.length).toBeGreaterThan(0)
        expect(step.detail).not.toMatch(/undefined|NaN|null/)
        seen.add(step.technique)
        applyStep(state, step)
      }
    }
    // The cheap two carry most killer boards, so they are the ones a shape
    // change would be found on. Named rather than counted, so a run that
    // happened to need none of the harder rungs still checks something.
    expect(seen.has('cageCombo') || seen.has('cageSum')).toBe(true)
  })

  it('does not let a cage sum inflate the score the way naked singles once did', () => {
    // The same failure the scoring model was rebuilt to kill, in a new place.
    // Trimming a cage is the routine motion of killer and it fires about once
    // per cage: measured at 22 firings of cageCombo and 28 of cageSum on an
    // empty board of 32 cages. Priced like a pointing pair, that bookkeeping
    // alone would be 1300 of a 2100 score and every killer would be Diabolical.
    const cheap = TECHNIQUES.cageCombo.first + TECHNIQUES.cageSum.first
    expect(cheap).toBeLessThan(TECHNIQUES.pointing.first)
    expect(TECHNIQUES.cageCombo.repeat).toBeLessThanOrEqual(TECHNIQUES.hiddenSingle.repeat)
  })
})
