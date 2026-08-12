import { describe, it, expect } from 'vitest'
import {
  combosFor,
  cageCombos,
  cagePossible,
  cageRequired,
  minSum,
  maxSum,
  cageOf,
  cellsConnected,
  cageLayout,
  uniqueCageLayout,
  cageProblems,
  killerSolutions,
  countKillerSolutions,
  hasUniqueKillerSolution,
} from './killer.js'
import { CLASSIC, range } from './topology.js'
import { topologyFor } from './variants.js'
import { generateFull } from './generator.js'
import { countSolutions } from './solver.js'
import { mulberry32 } from '../lib/prng.js'

const ALL = 0b111111111
const digits = mask => range(9).map(i => i + 1).filter(d => mask & (1 << (d - 1)))
const gridFor = seed => generateFull(mulberry32(seed), CLASSIC)
const EMPTY = new Array(81).fill(0)

describe('which digits can make a sum', () => {
  it('knows the only three digits that reach 7', () => {
    // 1+2+4 and nothing else. A table built with an off-by-one on the digit or
    // the size passes almost every other check and fails this one.
    expect(cageCombos(3, 7).map(digits)).toEqual([[1, 2, 4]])
    expect(cageCombos(2, 17).map(digits)).toEqual([[8, 9]])
    // Mask order, not digit order, because the table is built by walking the
    // 511 subsets. Stated here so a reader knows it is a fact and not a bug.
    expect(cageCombos(2, 5).map(digits)).toEqual([[2, 3], [1, 4]])
  })

  it('holds every set of digits exactly once', () => {
    // There are 511 non-empty subsets of one to nine, so the table has 511
    // entries and no subset appears in two buckets. Guards against a duplicate
    // or a lost combination, either of which would make the solver either miss
    // solutions or invent them.
    const seen = new Set()
    let total = 0
    for (let n = 1; n <= 9; n++) {
      for (let s = 1; s <= 45; s++) {
        for (const mask of combosFor(n, s)) {
          expect(seen.has(mask)).toBe(false)
          seen.add(mask)
          expect(digits(mask)).toHaveLength(n)
          expect(digits(mask).reduce((a, b) => a + b, 0)).toBe(s)
          total++
        }
      }
    }
    expect(total).toBe(511)
  })

  it('says nothing at all about a sum that cannot happen', () => {
    // Three cells cannot total 5, and a cage claiming so has to come back dead
    // rather than come back unconstrained.
    expect(cagePossible(3, 5)).toBe(0)
    expect(cageRequired(3, 5)).toBe(0)
    expect(cagePossible(2, 1)).toBe(0)
    expect(minSum(3)).toBe(6)
    expect(maxSum(3)).toBe(24)
    expect(cagePossible(3, minSum(3))).toBe(0b111)
    expect(cagePossible(3, maxSum(3))).toBe(0b111000000)
  })

  it('narrows a cage to the digits it can still take', () => {
    // Nine cells short of a 20 in four: the combinations holding a 9 die, and
    // what is left is a much smaller answer than the unrestricted one.
    expect(combosFor(4, 20)).toHaveLength(12)
    expect(cageCombos(4, 20, ALL & ~(1 << 8))).toHaveLength(7)
    // A pair that already holds a 3 and needs 8 more can only be 3 and 5.
    expect(digits(cagePossible(1, 5, ALL & ~0b100))).toEqual([5])
  })

  it('reports what a cage must contain, not only what it may', () => {
    // Three cells summing 6 can only be 1, 2, 3, so all three are compulsory.
    // This is the rung the ordinary ladder has no words for, and the solver
    // leans on it hard.
    expect(digits(cageRequired(3, 6))).toEqual([1, 2, 3])
    expect(digits(cageRequired(2, 17))).toEqual([8, 9])
    // A loose cage requires nothing: 20 in four has twelve ways.
    expect(cageRequired(4, 20)).toBe(0)
  })

  it('answers a nonsense question with silence, never with another cage answer', () => {
    // A malformed cage list off a saved game asks things like "one cell summing
    // 70". The right answer is that nothing fits. A memo keyed on the arguments
    // used to live here and packed the sum into six bits, so that exact
    // question landed on the key for one cell summing 6 and answered it dead
    // for the life of the process, with nothing thrown anywhere. The memo is
    // gone because it measured slower than recomputing, and this stays as the
    // rule any replacement has to keep.
    expect(cagePossible(1, 70)).toBe(0)
    expect(cagePossible(1, 6)).toBe(0b100000)
    expect(cagePossible(0, 0)).toBe(0)
    expect(cagePossible(2, 46)).toBe(0)
    expect(cagePossible(3, 24)).toBe(0b111000000)
  })

  it('gives the same answer as working it out longhand, for every question there is', () => {
    // Both accessors read one packed integer, so a shift or a mask in the wrong
    // place would swap "can hold" for "must hold" and the solver would
    // eliminate digits that were fine. Checked against a from-scratch
    // recomputation across every size, every sum and a sweep of held digits.
    for (let n = 1; n <= 9; n++) {
      for (let s = 1; s <= 45; s++) {
        for (let allowed = 0; allowed <= ALL; allowed += 37) {
          let possible = 0
          let required = ALL
          let any = false
          for (const mask of combosFor(n, s)) {
            if (mask & ~allowed) continue
            any = true
            possible |= mask
            required &= mask
          }
          expect(cagePossible(n, s, allowed)).toBe(possible)
          expect(cageRequired(n, s, allowed)).toBe(any ? required : 0)
        }
      }
    }
  })
})

describe('building cages over a finished grid', () => {
  const seeds = [1, 2, 3, 17, 404]

  it('covers every cell exactly once', () => {
    for (const seed of seeds) {
      const { cages } = cageLayout(seed, gridFor(1000 + seed))
      const cells = cages.flatMap(c => c.cells)
      expect(cells).toHaveLength(81)
      expect(new Set(cells).size).toBe(81)
      expect([...cageOf(cages)].every(c => c >= 0)).toBe(true)
    }
  })

  it('never lets a cage repeat a digit of the solution', () => {
    // The whole soundness argument, and the one that fails silently: sums stay
    // right and the grid stays a legal sudoku, so a layout whose own answer
    // breaks the no-repeat rule looks completely normal. Growing the same
    // shapes without the digit test put a repeat in 57 of 915 cages.
    for (const seed of seeds) {
      const solution = gridFor(1000 + seed)
      const { cages } = cageLayout(seed, solution)
      expect(cageProblems(cages, solution)).toEqual([])
    }
  })

  it('makes each cage one connected shape, so it can be drawn', () => {
    for (const seed of seeds) {
      const { cages } = cageLayout(seed, gridFor(1000 + seed))
      for (const cage of cages) {
        expect(cellsConnected(cage.cells)).toBe(true)
        // cells[0] is the top-left cell, which is where the sum is printed.
        expect(cage.cells[0]).toBe(Math.min(...cage.cells))
      }
    }
  })

  it('leaves almost no one-cell cages, which are givens in disguise', () => {
    // Growth strands a cell whenever its neighbours are all taken first, and
    // that happens to 18.9% of cages. Absorbing them takes it to 0.7%, so a
    // layout that suddenly shows several is a broken absorb pass.
    let singles = 0
    let total = 0
    for (let seed = 0; seed < 20; seed++) {
      const { cages } = cageLayout(seed, gridFor(1000 + seed))
      total += cages.length
      singles += cages.filter(c => c.cells.length === 1).length
    }
    expect(singles / total).toBeLessThan(0.05)
  })

  it('gives the same layout for the same seed', () => {
    const solution = gridFor(1234)
    expect(JSON.stringify(cageLayout(88, solution))).toBe(JSON.stringify(cageLayout(88, solution)))
  })
})

describe('solving with cages', () => {
  it('never loses the answer it was built from', () => {
    // Soundness in the direction that matters most: propagation must never
    // throw away the real answer. A cage rule applied one digit too eagerly
    // reports zero solutions, or a different one, for a puzzle that plainly has
    // this one. Twelve cells blanked, which the cages more than close.
    for (const seed of [5, 6, 7]) {
      const solution = gridFor(2000 + seed)
      const { cages } = cageLayout(seed, solution)
      const board = solution.map((v, i) => (i % 7 === 0 ? 0 : v))
      const found = killerSolutions(board, cages, 4)
      expect(found).toContainEqual(solution)
    }
  })

  it('only ever produces a board that is genuinely finished', () => {
    // The other direction: it must not invent answers. A raw layout is usually
    // not unique, so whatever comes back is only one of several, and each one
    // has to be a legal sudoku that every cage agrees with. Checked against
    // cageProblems and the peer lists rather than against the intended grid,
    // which is exactly the thing a loose layout is not obliged to produce.
    for (const seed of [5, 6, 7]) {
      const solution = gridFor(2000 + seed)
      const { cages } = cageLayout(seed, solution)
      for (const board of killerSolutions(EMPTY, cages, 2)) {
        expect(board.filter(Boolean)).toHaveLength(81)
        for (let i = 0; i < 81; i++) {
          for (const p of CLASSIC.peers[i]) expect(board[p]).not.toBe(board[i])
        }
        expect(cageProblems(cages, board)).toEqual([])
      }
    }
  })

  it('counts a second solution when the cages prove nothing', () => {
    // One cage per row: every sum is 45 and no row repeats a digit, so every
    // grid in the puzzle's own solution space satisfies it. A checker that
    // called this unique would be reading the cages and ignoring them.
    const solution = gridFor(4242)
    const rows = CLASSIC.rows.map(cells => ({ cells, sum: 45 }))
    expect(cageProblems(rows, solution)).toEqual([])
    expect(countKillerSolutions(EMPTY, rows, 2)).toBe(2)
    expect(hasUniqueKillerSolution(EMPTY, rows)).toBe(false)
  })

  it('refuses a board that already breaks a cage', () => {
    // A cage of two summing 17 is 8 and 9. Writing a 1 into it leaves no way to
    // finish, and the search has to say zero rather than quietly ignore the sum.
    const solution = gridFor(555)
    const { cages } = cageLayout(9, solution)
    const pair = cages.find(c => c.cells.length === 2)
    const board = EMPTY.slice()
    // Whatever the pair needs, give it a digit that cannot be part of any
    // combination for that sum.
    const impossible = range(9).map(i => i + 1).find(d => !(cagePossible(2, pair.sum) & (1 << (d - 1))))
    board[pair.cells[0]] = impossible
    expect(countKillerSolutions(board, cages, 2)).toBe(0)
  })

  it('agrees with a search too stupid to be wrong', () => {
    // The propagation in killer.js is the only part of this engine complicated
    // enough to be confidently wrong: it kills combinations, and a rule applied
    // one step too far loses real answers while everything still looks fine.
    // So it is checked against an enumeration with no cleverness in it at all,
    // on boards it can actually finish. Run over 130 boards while this was
    // written, including deliberately broken ones; the four disagreements it
    // found were all the reference's fault and all real bugs in the reference.
    const naive = (board, cages, limit) => {
      const b = board.slice()
      const owner = cageOf(cages)
      const left = cages.map(c => c.cells.length)
      const need = cages.map(c => c.sum)
      const held = cages.map(() => 0)
      for (let i = 0; i < 81; i++) {
        if (!b[i]) continue
        const c = owner[i]
        left[c]--
        need[c] -= b[i]
        if (held[c] & (1 << (b[i] - 1))) return 0
        held[c] |= 1 << (b[i] - 1)
        for (const p of CLASSIC.peers[i]) if (b[p] === b[i]) return 0
      }
      let count = 0
      const step = i => {
        if (i === 81) {
          count++
          return
        }
        if (b[i]) {
          step(i + 1)
          return
        }
        const c = owner[i]
        for (let d = 1; d <= 9; d++) {
          if (held[c] & (1 << (d - 1))) continue
          if (d > need[c]) continue
          if (CLASSIC.peers[i].some(p => b[p] === d)) continue
          const r = left[c] - 1
          const s = need[c] - d
          if (r === 0 ? s !== 0 : s < minSum(r) || s > maxSum(r)) continue
          b[i] = d
          left[c]--
          need[c] = s
          held[c] |= 1 << (d - 1)
          step(i + 1)
          b[i] = 0
          left[c]++
          need[c] = s + d
          held[c] &= ~(1 << (d - 1))
          if (count >= limit) return
        }
      }
      step(0)
      return count
    }

    for (const seed of [41, 42, 43, 44]) {
      const solution = gridFor(7000 + seed)
      const { cages } = cageLayout(seed, solution)
      const board = solution.map((v, i) => ((i * 11 + seed) % 4 === 0 ? 0 : v))
      expect(countKillerSolutions(board, cages, 4)).toBe(naive(board, cages, 4))
      // and again with one digit moved, which is a board with no answers at all
      const wrecked = board.slice()
      const victim = board.findIndex((v, i) => v && i > 40)
      wrecked[victim] = (wrecked[victim] % 9) + 1
      expect(countKillerSolutions(wrecked, cages, 4)).toBe(naive(wrecked, cages, 4))
    }
  })

  it('refuses a cage list that does not cover the board', () => {
    // Reached by a saved game whose cages lost a cell in transit. Answering it
    // would mean solving a different puzzle than the one being asked about, and
    // without this the failure is a type error thrown four calls down.
    const solution = gridFor(99)
    const { cages } = cageLayout(4, solution)
    const short = cages.slice(1)
    expect(() => countKillerSolutions(EMPTY, short, 2)).toThrow(/in no cage/)
    expect(cageProblems(short).length).toBeGreaterThan(0)
  })

  it('never finds more solutions than the same board without cages', () => {
    // Cages only ever add constraint. If the killer count exceeded the classic
    // one, the search would be generating grids that are not sudoku at all.
    for (const seed of [21, 22]) {
      const solution = gridFor(5000 + seed)
      const { cages } = cageLayout(seed, solution)
      const board = solution.map((v, i) => (i % 3 === 0 ? v : 0))
      expect(countKillerSolutions(board, cages, 5)).toBeLessThanOrEqual(countSolutions(board, 5))
    }
  })
})

describe('a layout that is actually a puzzle', () => {
  const seeds = [1, 2, 3, 4, 5, 6]

  it('has exactly one answer, and it is the grid it was built from', () => {
    // The two halves of the promise. Unique on its own is not enough: a repair
    // that recomputed a sum from the wrong grid would still be unique, and
    // would be unique on a different puzzle than the one the app thinks it is
    // showing.
    for (const seed of seeds) {
      const solution = gridFor(6000 + seed)
      const made = uniqueCageLayout(seed, solution)
      expect(made).toBeTruthy()
      expect(cageProblems(made.cages, solution)).toEqual([])
      const found = killerSolutions(EMPTY, made.cages, 2)
      expect(found).toHaveLength(1)
      expect(found[0]).toEqual(solution)
    }
  })

  it('splits cages rather than shrinking the board', () => {
    // Repair works by cutting a cage in two, so cells stay put and the cage
    // count goes up by exactly the number of splits it made.
    for (const seed of seeds) {
      const solution = gridFor(6000 + seed)
      const before = cageLayout(seed, solution).cages.length
      const made = uniqueCageLayout(seed, solution)
      expect(made.cages.length).toBe(before + made.splits)
      for (const cage of made.cages) expect(cellsConnected(cage.cells)).toBe(true)
    }
  })

  it('gives the same puzzle for the same seed', () => {
    const solution = gridFor(777)
    expect(JSON.stringify(uniqueCageLayout(31, solution))).toBe(
      JSON.stringify(uniqueCageLayout(31, solution)),
    )
  })

  it('sits on top of a topology rather than replacing one', () => {
    // A cage is a constraint the twelve techniques cannot express, but it is
    // not a different board: killer-X and killer-Windoku are cages plus those
    // units, and every part of this engine that reads a board reads it off the
    // topology it was handed. Anything here that quietly assumed classic peers
    // would come back with a second solution, or with none.
    for (const id of ['x', 'windoku']) {
      const topo = topologyFor(id, 7)
      const solution = generateFull(mulberry32(500), topo)
      const made = uniqueCageLayout(300, solution, { topo })
      expect(made).toBeTruthy()
      expect(cageProblems(made.cages, solution)).toEqual([])
      expect(killerSolutions(EMPTY, made.cages, 2, topo)).toEqual([solution])
    }
  })
})

describe('checking a cage list handed in from outside', () => {
  // A saved or synced game rebuilds its cages from a record. Every one of these
  // produces a board that looks perfectly normal and cannot be solved.
  const solution = gridFor(31337)
  const good = cageLayout(3, solution).cages

  it('notices a cell that belongs to nobody', () => {
    const cages = good.map(c => ({ ...c }))
    cages[0] = { cells: cages[0].cells.slice(1), sum: cages[0].sum }
    expect(cageProblems(cages).join(' ')).toContain('is in no cage')
  })

  it('notices a cell claimed twice', () => {
    const cages = good.map(c => ({ ...c }))
    cages[1] = { cells: [...cages[1].cells, cages[0].cells[0]].sort((a, b) => a - b), sum: cages[1].sum }
    expect(cageProblems(cages).join(' ')).toContain('is in cages')
  })

  it('notices a cage in two pieces', () => {
    const cages = [{ cells: [0, 80], sum: solution[0] + solution[80] }]
    expect(cageProblems(cages).join(' ')).toContain('more than one piece')
  })

  it('notices a sum no cage of that size could reach', () => {
    expect(cageProblems([{ cells: [0, 1], sum: 18 }]).join(' ')).toContain('cannot sum to 18')
    expect(cageProblems([{ cells: [0, 1], sum: 2 }]).join(' ')).toContain('cannot sum to 2')
  })

  it('notices a sum that does not match the grid it claims to describe', () => {
    const cages = good.map(c => ({ ...c }))
    cages[0] = { ...cages[0], sum: cages[0].sum + 1 }
    expect(cageProblems(cages, solution).join(' ')).toContain('does not add up')
    expect(cageProblems(cages).join(' ')).toEqual('')
  })
})
