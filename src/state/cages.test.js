import { describe, it, expect } from 'vitest'
import { gameReducer, initialState } from './gameReducer.js'
import { buildRecord } from '../lib/gameLog.js'
import { makeVariantPuzzle, topologyFromRecord } from '../logic/variants.js'
import { countKillerSolutions } from '../logic/killer.js'

/**
 * A killer game has to carry its cages, not re-derive them.
 *
 * `makeVariantPuzzle` hands the cage list over and every layer between it and
 * storage used to drop it: the reducer copied `regions` and not `cages`, the
 * save blob and the finished record did the same, and so the stored-cage branch
 * of `topologyFromRecord` could never fire for a real game.
 *
 * Nothing looked wrong, which is the whole problem. `killerLayout` is a pure
 * function of the seed, so the board was rebuilt correctly every time and the
 * missing list only mattered on the day that builder changed, at which point
 * every saved killer game would quietly become a different puzzle with the same
 * digits in it. These assertions are cheap and that failure is not recoverable.
 */
const made = makeVariantPuzzle('killer', 'Medium', { seed: 6000 })

describe('killer cages survive the trip to storage', () => {
  it('the generator produces them at all', () => {
    expect(made.cages.length).toBeGreaterThan(20)
    expect(made.cages.reduce((n, c) => n + c.cells.length, 0)).toBe(81)
  })

  it('the reducer keeps them when a game starts', () => {
    const s = gameReducer(initialState, { type: 'ready', made, mode: 'casual', now: 1000 })
    expect(s.cages).toEqual(made.cages)
    expect(s.topo.cages).toEqual(made.cages)
  })

  it('the finished record carries them, and rebuilds the same board', () => {
    const s = gameReducer(initialState, { type: 'ready', made, mode: 'casual', now: 1000 })
    const rec = buildRecord(s, { completed: true, durationMs: 60000, endedAt: 61000 })
    expect(rec.cages).toEqual(made.cages)

    // The point of storing them: the record alone rebuilds the board, with no
    // call back into the layout builder.
    const topo = topologyFromRecord({ variant: 'killer', cages: rec.cages, seed: 999999 })
    expect(topo.cages).toEqual(made.cages)
    expect(topo.id).toBe('killer')
  })

  it('a resumed save keeps them', () => {
    const saved = { ...made, variant: 'killer', cages: made.cages, board: made.puzzle, marks: [], seed: made.seed }
    const s = gameReducer(initialState, { type: 'hydrate', saved })
    expect(s.topo.cages).toEqual(made.cages)
  })

  it('and the stored cages are the ones that make the puzzle unique', () => {
    // Guards against storing a cage list that is merely well-formed. These are
    // the cages the single solution depends on.
    const topo = topologyFromRecord({ variant: 'killer', cages: made.cages, seed: made.seed })
    expect(countKillerSolutions(made.puzzle, made.cages, 2, topo)).toBe(1)
  })
})
