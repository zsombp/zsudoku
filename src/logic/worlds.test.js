import { describe, it, expect } from 'vitest'
import fixtures from './__fixtures__/solvepaths.json'
import { createState, nextStep, applyStep } from './grader.js'
import { topologyFromRecord } from './variants.js'
import { argue, slotsFor, worldsOf, judge, sumSlots, remainderFor } from './worlds.js'
import { CLASSIC } from './topology.js'
import { LADDER } from './techniques.js'
import { killerTopology } from './variants.js'

/**
 * The lessons are only worth anything if the worlds they draw are the argument
 * the ladder actually made. So this walks every step of sixteen real solves,
 * classic and four variants, and holds the engine to two things:
 *
 *   every elimination the ladder made dies in every world found here
 *   every placement the ladder made is in every world found here
 *
 * If a technique ever changes and the slots describing it do not, this fails at
 * the first step where the two disagree, on a position that genuinely arose.
 */
function walk(entry, visit) {
  const topo = topologyFromRecord(entry)
  const puzzle = [...entry.puzzle].map(Number)
  const state = createState(puzzle, topo)
  for (let guard = 0; guard < 800; guard++) {
    const step = nextStep(state)
    if (!step) break
    visit(step, state.board.slice(), state.cands.slice(), topo)
    applyStep(state, step)
  }
}

describe('the worlds are the argument the ladder made', () => {
  // Grown at v4.0.0 with puzzles that need the four rungs above the swordfish;
  // the old sixteen solves are unchanged because those rungs only fire where
  // nothing older can move.
  const checked = {}

  for (const [n, entry] of fixtures.entries()) {
    it(`agrees on every step of solve ${n + 1} (${entry.variant})`, () => {
      walk(entry, (step, board, cands, topo) => {
        const a = argue(step, board, cands, topo)
        expect(a, `${step.technique} has no argument`).toBeTruthy()
        checked[step.technique] = (checked[step.technique] || 0) + 1
        expect(a.worlds.length, `${step.technique}: no world at all`).toBeGreaterThan(0)
        expect(a.truncated).toBe(false)
        if (step.eliminations.length) {
          expect(a.intact, `${step.technique}: an elimination survives a world (${step.detail})`).toBe(true)
        }
        for (const p of step.placements) {
          for (const w of a.worlds) expect(w.get(p.cell), `${step.technique}: placement missing`).toBe(p.digit)
        }
      })
    })
  }

  it('reached every rung, including the five cage arguments', () => {
    for (const k of LADDER) {
      expect(checked[k] || 0, `${k} never checked`).toBeGreaterThan(0)
    }
  })
})

describe('a broken pattern opens a world', () => {
  it('lets the 9 live when an XY-Wing pivot gains a third note', () => {
    // r5c5 {4,7}, r5c2 {4,9}, r2c5 {7,9}; r2c2 sees both pincers.
    const at = (r, c) => (r - 1) * 9 + (c - 1)
    const board = new Array(81).fill(1)
    const cands = new Int16Array(81)
    const set = (cell, ds) => { board[cell] = 0; cands[cell] = ds.reduce((m, d) => m | (1 << (d - 1)), 0) }
    set(at(5, 5), [4, 7]); set(at(5, 2), [4, 9]); set(at(2, 5), [7, 9]); set(at(2, 2), [3, 9])
    const slots = [{ cell: at(5, 5) }, { cell: at(5, 2) }, { cell: at(2, 5) }]
    const step = { technique: 'xyWing', eliminations: [{ cell: at(2, 2), digit: 9 }] }

    const intact = argue(step, board, cands, CLASSIC, { slots })
    expect(intact.worlds).toHaveLength(4)
    expect(intact.intact).toBe(true)

    set(at(5, 5), [2, 4, 7])
    const broken = argue(step, board, cands, CLASSIC, { slots })
    expect(broken.intact).toBe(false)
    // The world that saves it: pivot 2, and neither pincer is forced to 9.
    const w = broken.worlds[broken.survivorWorlds[0]]
    expect(w.get(at(5, 5))).toBe(2)
    expect(judge(w, at(2, 2), 9).dies).toBe(false)
  })

  it('counts one placement twice as one, not as a clash', () => {
    // A cell slot and a unit slot naming the same digit in the same cell.
    const board = new Array(81).fill(1)
    const cands = new Int16Array(81)
    board[0] = 0; cands[0] = 1 << 4
    board[1] = 0; cands[1] = (1 << 4) | (1 << 5)
    const { worlds } = worldsOf([{ cell: 0 }, { digit: 5, cells: [0, 1] }], board, cands)
    expect(worlds).toHaveLength(1)
    expect(worlds[0].get(0)).toBe(5)
  })
})

describe('arithmetic worlds', () => {
  const mask = ds => ds.reduce((m, d) => m | (1 << (d - 1)), 0)
  const board = new Array(81).fill(0)

  it('forbids a repeated digit even when the cage cells are not peers', () => {
    const cands = new Int16Array(81)
    cands[0] = mask([1, 2, 3]); cands[40] = mask([1, 2, 3])
    const slots = sumSlots({ cells: [0, 40], sum: 4, distinct: true })
    const a = worldsOf(slots, board, cands)
    expect(a.worlds.map(w => [w.get(0), w.get(40)])).toEqual([[1, 3], [3, 1]])
  })

  it('subtracts fixed digits and prevents the open cells repeating them', () => {
    const fixed = [...board]; fixed[0] = 3
    const cands = new Int16Array(81)
    cands[40] = mask([1, 2, 3]); cands[80] = mask([1, 2, 3])
    const a = worldsOf(sumSlots({ cells: [0, 40, 80], sum: 6, distinct: true }), fixed, cands)
    expect(a.worlds.map(w => [...w.values()])).toEqual([[3, 1, 2], [3, 2, 1]])
    expect(fixed[0]).toBe(3)
    expect(cands[40]).toBe(mask([1, 2, 3]))
  })

  it('rejects impossible sums without claiming an elimination', () => {
    const cands = new Int16Array(81).fill(mask([1, 2]))
    const slots = sumSlots({ cells: [0, 40], sum: 17, distinct: true })
    const a = argue(null, board, cands, CLASSIC, { slots, targets: [[0, 1]] })
    expect(a.worlds).toHaveLength(0)
    expect(a.intact).toBe(false)
    expect(a.dead).toHaveLength(0)
  })

  it('only truncates when another distinct world actually exists', () => {
    const cands = new Int16Array(81).fill(mask([1, 2, 3]))
    const slots = sumSlots({ cells: [0, 40], sum: 4, distinct: true })
    expect(worldsOf(slots, board, cands, CLASSIC, { limit: 2 }).truncated).toBe(false)
    expect(worldsOf(slots, board, cands, CLASSIC, { limit: 1 }).truncated).toBe(true)
  })

  it('derives an innie from cage totals, independent of the step answer', () => {
    const topo = killerTopology([
      { cells: [0, 1, 2], sum: 6 }, { cells: [3, 4, 5], sum: 15 },
      { cells: [6, 7], sum: 15 }, { cells: [8, 17], sum: 10 },
    ])
    const step = { technique: 'sum45', cells: [8], digits: [1], unit: { type: 'row', index: 0 } }
    const group = remainderFor(step, topo)
    expect(group).toMatchObject({ cells: [8], sum: 9, distinct: true, innie: true })
    const cands = new Int16Array(81).fill(511)
    const a = worldsOf(slotsFor(step, topo), board, cands, topo)
    expect(a.worlds.map(w => w.get(8))).toEqual([9])
  })

  it('allows equal outie digits in separate cages that do not see each other', () => {
    const topo = killerTopology([
      { cells: [0, 27], sum: 12 }, { cells: [1, 2, 3], sum: 15 },
      { cells: [4, 5, 6], sum: 15 }, { cells: [7, 8, 61], sum: 13 },
    ])
    const step = { technique: 'sum45', cells: [61], unit: { type: 'row', index: 0 } }
    const fixed = [...board]; fixed[27] = 5
    const cands = new Int16Array(81).fill(511)
    expect(remainderFor(step, topo)).toMatchObject({ cells: [27, 61], sum: 10, distinct: false, innie: false })
    const a = worldsOf(slotsFor(step, topo), fixed, cands, topo)
    expect(a.worlds.map(w => [w.get(27), w.get(61)])).toEqual([[5, 5]])
  })
})
