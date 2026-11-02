import { describe, it, expect } from 'vitest'
import fixtures from './__fixtures__/solvepaths.json'
import { createState, nextStep, applyStep } from './grader.js'
import { topologyFromRecord } from './variants.js'
import { argue, slotsFor, worldsOf, judge } from './worlds.js'
import { CLASSIC } from './topology.js'

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
  const topo = topologyFromRecord({ variant: entry.variant, regions: entry.regions, seed: entry.seed })
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
  const checked = {}

  for (const [n, entry] of fixtures.entries()) {
    it(`agrees on every step of solve ${n + 1} (${entry.variant})`, () => {
      walk(entry, (step, board, cands, topo) => {
        const a = argue(step, board, cands, topo)
        if (!a) {
          // Only the arithmetic rungs may decline; everything else must argue.
          expect(slotsFor(step, topo)).toBe(null)
          return
        }
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

  it('reached every classic rung on the way', () => {
    for (const k of ['nakedSingle', 'hiddenSingle', 'pointing', 'claiming', 'nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple', 'nakedQuad', 'xWing', 'xyWing', 'swordfish']) {
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
