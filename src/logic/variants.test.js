import { describe, it, expect } from 'vitest'
import { VARIANT_LIST, VARIANTS, topologyFor, jigsawLayout, makeVariantPuzzle, topologyFromRecord } from './variants.js'
import { makeTopology, CLASSIC, regionEdges } from './topology.js'
import { gradePuzzle } from './grader.js'
import { countSolutions } from './solver.js'

const topoOf = made =>
  made.regions ? makeTopology({ id: 'jigsaw', name: 'Jigsaw', regions: made.regions }) : topologyFor(made.variant, made.seed)

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
      expect(countSolutions(made.puzzle, 2, topo)).toBe(1)
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

describe('drawing a board', () => {
  it('gives classic exactly the 3x3 rules it always had', () => {
    const edges = regionEdges(CLASSIC)
    // Cell r1c3 sits on a box boundary to its right; r1c2 does not.
    expect(edges[2].right).toBe(true)   // r1c3, right edge of the first box
    expect(edges[1].right).toBe(false)  // r1c2, inside it
    expect(edges[9].bottom).toBe(false) // r2c1, box continues below
    expect(edges[18].bottom).toBe(true) // r3c1, bottom of the box
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
