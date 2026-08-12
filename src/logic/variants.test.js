import { describe, it, expect } from 'vitest'
import {
  VARIANT_LIST,
  VARIANTS,
  topologyFor,
  jigsawLayout,
  killerLayout,
  killerTopology,
  cageEdges,
  makeVariantPuzzle,
  topologyFromRecord,
} from './variants.js'
import { makeTopology, CLASSIC, regionEdges, range } from './topology.js'
import { gradePuzzle } from './grader.js'
import { countSolutions } from './solver.js'
import { countKillerSolutions, cageProblems } from './killer.js'

const topoOf = made =>
  made.regions
    ? makeTopology({ id: 'jigsaw', name: 'Jigsaw', regions: made.regions })
    : made.cages
      ? killerTopology(made.cages)
      : topologyFor(made.variant, made.seed)

/**
 * How many answers a board has, asked the right way for the board it is.
 *
 * `countSolutions` knows nothing about cages, so on a killer with three givens
 * it reports thousands and the assertion below would fail on a puzzle that is
 * perfectly sound. Getting this wrong in the other direction is the dangerous
 * one: a killer checked with the classic solver and found unique would be a
 * puzzle far more constrained than it needs to be.
 */
const answers = (made, topo) =>
  made.cages ? countKillerSolutions(made.puzzle, made.cages, 2, topo) : countSolutions(made.puzzle, 2, topo)

describe('every topology is a legal board', () => {
  for (const v of VARIANT_LIST) {
    it(`${v.name} tiles the grid and constrains every cell`, () => {
      const topo = topologyFor(v.id, 4242)
      // The first nine regions must tile all 81 cells exactly once.
      const tiling = topo.regions.slice(0, 9).flat()
      expect(tiling).toHaveLength(81)
      expect(new Set(tiling).size).toBe(81)
      // Every unit is nine cells. Peer counts are not fixed: a jigsaw region
      // can hug a row, sharing more cells with it than a square box does, which
      // leaves that cell with as few as seventeen peers. Classic is always
      // exactly twenty.
      for (const u of topo.units) expect(u).toHaveLength(9)
      for (const p of topo.peers) expect(p.length).toBeGreaterThanOrEqual(17)
      if (v.id === 'classic') for (const p of topo.peers) expect(p).toHaveLength(20)
    })
  }

  it('adds constraint rather than removing it, where it claims to', () => {
    // X-Sudoku, Windoku and Anti-knight are classic plus something, so no cell
    // may end up with fewer peers than classic gives it. Jigsaw is exempt: it
    // replaces the regions rather than adding to them.
    for (const v of VARIANT_LIST) {
      if (v.id === 'jigsaw' || v.id === 'classic') continue
      const topo = topologyFor(v.id, 7)
      for (let i = 0; i < 81; i++) {
        expect(topo.peers[i].length).toBeGreaterThanOrEqual(CLASSIC.peers[i].length)
      }
    }
  })

  it('keeps overlapping regions from stealing a cell from its box', () => {
    // A Windoku cell belongs to a box and a window. The box has to win, or the
    // grid is drawn wrong and claiming argues about the wrong region.
    const w = topologyFor('windoku')
    expect(Math.max(...w.regionOf)).toBe(8)
    expect(w.overlaid.size).toBe(36)
    expect(topologyFor('classic').overlaid.size).toBe(0)
  })
})

describe('jigsaw layouts', () => {
  it('are nine connected regions of nine cells', () => {
    const orth = c => {
      const r = Math.floor(c / 9)
      const k = c % 9
      const o = []
      if (r > 0) o.push(c - 9)
      if (r < 8) o.push(c + 9)
      if (k > 0) o.push(c - 1)
      if (k < 8) o.push(c + 1)
      return o
    }
    for (const seed of [1, 2, 3, 99]) {
      const { regions } = jigsawLayout(seed)
      expect(regions).toHaveLength(9)
      for (const cells of regions) {
        expect(cells).toHaveLength(9)
        const set = new Set(cells)
        const seen = new Set([cells[0]])
        const queue = [cells[0]]
        while (queue.length) {
          for (const n of orth(queue.pop())) if (set.has(n) && !seen.has(n)) { seen.add(n); queue.push(n) }
        }
        expect(seen.size).toBe(9)
      }
    }
  })

  it('come with a grid that actually satisfies them', () => {
    // The whole reason shapes and digits are built together: no search, and no
    // possibility of a layout that cannot be filled.
    for (const seed of [1, 5, 20]) {
      const { regions, solution } = jigsawLayout(seed)
      const topo = makeTopology({ id: 'j', name: 'J', regions })
      expect(solution.filter(Boolean)).toHaveLength(81)
      for (let i = 0; i < 81; i++) {
        for (const p of topo.peers[i]) expect(solution[p]).not.toBe(solution[i])
      }
    }
  })

  it('are not secretly square', () => {
    const square = JSON.stringify(CLASSIC.regions.map(r => [...r].sort((a, b) => a - b)))
    for (const seed of [1, 2, 3, 4, 5]) {
      const { regions } = jigsawLayout(seed)
      expect(JSON.stringify(regions.map(r => [...r].sort((a, b) => a - b)))).not.toBe(square)
    }
  })

  it('reproduce exactly from their seed', () => {
    expect(JSON.stringify(jigsawLayout(11).regions)).toBe(JSON.stringify(jigsawLayout(11).regions))
  })
})

describe('generating a variant', () => {
  for (const v of VARIANT_LIST) {
    it(`${v.name} produces a sound, uniquely solvable puzzle`, { timeout: 60000 }, () => {
      const made = makeVariantPuzzle(v.id, 'Medium', { seed: 31337 })
      expect(made).toBeTruthy()
      expect(made.variant).toBe(v.id)
      const topo = topoOf(made)
      // Unique, and finishable by pure logic: the promise that holds for every
      // board this app ships, whatever shape it is.
      expect(answers(made, topo)).toBe(1)
      expect(gradePuzzle(made.puzzle, { topo }).solved).toBe(true)
      // And it lands in the band it was asked for.
      expect(made.graded).toBe('Medium')
    })
  }

  it('carries jigsaw shapes with the puzzle, since they cannot be re-derived', { timeout: 60000 }, () => {
    const made = makeVariantPuzzle('jigsaw', 'Easy', { seed: 808 })
    expect(made.regions).toHaveLength(9)
    // A saved game rebuilds the same board from what was stored.
    const rebuilt = topologyFromRecord({ variant: 'jigsaw', regions: made.regions })
    expect(rebuilt.regionOf).toEqual(makeTopology({ id: 'j', name: 'J', regions: made.regions }).regionOf)
  })
})

describe('killer boards', () => {
  it('hands back a cage list that covers the grid and matches the answer', () => {
    // Every failure `cageProblems` looks for is one that leaves a board looking
    // completely normal: a lost cell, a cage in two pieces, a sum that its own
    // solution does not add up to.
    for (const seed of [1, 77, 4242]) {
      const layout = killerLayout(seed)
      expect(layout, `seed ${seed}`).toBeTruthy()
      expect(cageProblems(layout.cages, layout.solution)).toEqual([])
      expect(layout.cages.flatMap(c => c.cells)).toHaveLength(81)
    }
  })

  it('rebuilds the identical board from the seed alone', () => {
    // What makes a saved killer game safe. The cages travel with the record so
    // nothing has to be re-derived, and if they ever fail to arrive the seed is
    // still enough, which is only true because `killerLayout` takes nothing else.
    for (const seed of [3, 900]) {
      const a = killerLayout(seed)
      const b = killerLayout(seed)
      expect(JSON.stringify(a.cages)).toBe(JSON.stringify(b.cages))
      expect(a.solution).toEqual(b.solution)
    }
  })

  it('carries cages with the puzzle, and prefers the stored list to a rebuild', { timeout: 60000 }, () => {
    const made = makeVariantPuzzle('killer', 'Easy', { seed: 808 })
    expect(made.cages.length).toBeGreaterThan(20)
    expect(cageProblems(made.cages, made.solution)).toEqual([])

    const stored = topologyFromRecord({ variant: 'killer', cages: made.cages, seed: made.seed })
    expect(stored.cages).toBe(made.cages)
    // The seed-only path has to agree, or a record that lost its cages would
    // come back as a different puzzle wearing the same digits.
    const rebuilt = topologyFromRecord({ variant: 'killer', seed: made.seed })
    expect(JSON.stringify(rebuilt.cages)).toBe(JSON.stringify(made.cages))
  })

  it('refuses a damaged cage list rather than playing a board it cannot solve', () => {
    // A cage that lost a cell in transit produces a grid that looks fine and has
    // no answer. Falling back to the seed is the honest repair.
    const made = killerLayout(55)
    const broken = made.cages.map((c, i) => (i === 0 ? { ...c, cells: c.cells.slice(1) } : c))
    const topo = topologyFromRecord({ variant: 'killer', cages: broken, seed: 55 })
    expect(topo.cages).not.toBe(broken)
    expect(cageProblems(topo.cages)).toEqual([])
  })

  it('is uniquely solvable and finishable by the ladder at every tier', { timeout: 120000 }, () => {
    // The two promises this app makes about any board it ships, checked on the
    // variant where they are hardest to take on trust: killer uniqueness comes
    // from the cages rather than from the givens, and a killer with three clues
    // looks impossible until the ladder finishes it.
    for (const tier of ['Gentle', 'Medium', 'Diabolical']) {
      const made = makeVariantPuzzle('killer', tier, { seed: 20260812 })
      expect(made, tier).toBeTruthy()
      const topo = killerTopology(made.cages)
      expect(countKillerSolutions(made.puzzle, made.cages, 2, topo), tier).toBe(1)
      expect(gradePuzzle(made.puzzle, { topo }).solved, tier).toBe(true)
    }
  })
})

describe('drawing a board', () => {
  it('gives classic exactly the 3x3 rules it always had', () => {
    const edges = regionEdges(CLASSIC)
    // Cell r1c3 sits on a box boundary to its right; r1c2 does not.
    expect(edges[2].right).toBe(true)   // r1c3, right edge of the first box
    expect(edges[1].right).toBe(false)  // r1c2, inside it
    expect(edges[9].bottom).toBe(false) // r2c1, box continues below
    expect(edges[18].bottom).toBe(true) // r3c1, bottom of the box
  })

  it('outlines a cage on the sides that face another cage, and on the board edge', () => {
    // Both boards draw from this and nothing else, so a wrong edge is a cage
    // drawn around cells it does not contain: a puzzle that reads as a
    // different puzzle while every number on it is right.
    const edges = cageEdges([
      { cells: [0, 1], sum: 9 },
      { cells: [2, 11], sum: 7 },
      ...range(81).slice(3).filter(i => i !== 11).map(i => ({ cells: [i], sum: 5 })),
    ])
    // r1c1 and r1c2 are one cage: no line between them, lines everywhere else.
    expect(edges[0]).toMatchObject({ top: true, left: true, bottom: true, right: false })
    expect(edges[1]).toMatchObject({ top: true, left: false, bottom: true, right: true })
    // r1c3 and r2c3 are one cage bending down the board, so the line opens
    // between them and closes around the outside.
    expect(edges[2]).toMatchObject({ top: true, left: true, right: true, bottom: false })
    expect(edges[11]).toMatchObject({ top: false, left: true, right: true, bottom: true })
    // The total is on every cell of the cage, and printed by the first.
    expect(edges[0]).toMatchObject({ sum: 9, size: 2, head: true })
    expect(edges[1]).toMatchObject({ sum: 9, size: 2, head: false })
    expect(edges[11]).toMatchObject({ sum: 7, head: false })
  })

  it('draws no cages at all rather than most of them, on a list with a hole', () => {
    // The review reads its cage list off a stored game and nothing on that path
    // checks it. Half a set of outlines is a picture of a puzzle nobody played,
    // and reading the missing cell would throw and blank the whole screen.
    const { cages } = killerLayout(2468)
    expect(cageEdges(cages.slice(1))).toBeNull()
    expect(cageEdges(cages)).not.toBeNull()
  })

  it('prints every cage total exactly once, on a real layout', () => {
    const { cages } = killerLayout(2468)
    const edges = cageEdges(cages)
    expect(edges.filter(e => e.head)).toHaveLength(cages.length)
    for (const cage of cages) {
      // Reading order, so the number lands in the cage's top-left cell and
      // never floats in the middle of one.
      expect(edges[Math.min(...cage.cells)].head).toBe(true)
      expect(edges[Math.min(...cage.cells)].sum).toBe(cage.sum)
    }
  })

  it('outlines a jigsaw on all four sides, which squares never needed', () => {
    const { regions } = jigsawLayout(3)
    const edges = regionEdges(makeTopology({ id: 'j', name: 'J', regions }))
    const lefts = edges.filter(e => e.left).length
    const tops = edges.filter(e => e.top).length
    expect(lefts).toBeGreaterThan(0)
    expect(tops).toBeGreaterThan(0)
  })
})
