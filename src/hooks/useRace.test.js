import { describe, it, expect } from 'vitest'
import { paceFrom, samePuzzle } from './useRace.js'
import { ENGINE_STEP_MS } from '../stats/ghost.js'

// The grid is only ever compared here, never solved, so it does not have to be
// a legal sudoku. What matters is which cells were given.
const grid = (over = {}) => {
  const cells = Array.from({ length: 81 }, (_, i) => (i % 3 === 0 ? (i % 9) + 1 : 0))
  for (const [i, v] of Object.entries(over)) cells[i] = v
  return cells
}

const logAt = gap =>
  Array.from({ length: 30 }, (_, i) => ({
    t: (i + 1) * gap,
    kind: 'place',
    cell: i,
    value: (i % 9) + 1,
    correct: true,
  }))

const game = (gap, over = {}) => ({ completed: true, moveLog: logAt(gap), ...over })

describe('is this the same grid', () => {
  it('says no to a record from a different puzzle', () => {
    // The mistake a caller is most likely to make is racing their best Hard
    // against a different Hard, which compares nothing at all.
    expect(samePuzzle(grid(), grid({ 4: 7 }))).toBe(false)
  })

  it('says yes only to the identical set of givens', () => {
    expect(samePuzzle(grid(), grid())).toBe(true)
  })

  it('refuses anything that is not a grid rather than throwing on it', () => {
    // Records come back out of IndexedDB and out of another device's sync, so
    // a malformed one has to cost that row and nothing else.
    expect(samePuzzle(grid(), null)).toBe(false)
    expect(samePuzzle(grid(), [1, 2, 3])).toBe(false)
    expect(samePuzzle(grid(), 'not a board')).toBe(false)
  })
})

describe('how fast the engine should be', () => {
  it('falls back to the module default when there is nothing to measure', () => {
    // Inventing a pace from no evidence would be the one thing this app does
    // not do. Better the documented default, which the label states out loud.
    expect(paceFrom([])).toBe(ENGINE_STEP_MS)
    expect(paceFrom([{ completed: true, moveLog: [] }])).toBe(ENGINE_STEP_MS)
  })

  it('takes the median of the player own median gaps, so one grind is not the pace', () => {
    const games = [game(6000), game(6000), game(60000), game(6000), game(6000)]
    expect(paceFrom(games)).toBe(6000)
  })

  it('ignores games that were never finished', () => {
    // A game abandoned after four placements has a cadence, and it is the
    // cadence of giving up rather than of solving.
    const games = [game(9000), game(500, { completed: false }), game(9000)]
    expect(paceFrom(games)).toBe(9000)
  })

  it('produces a pace a person can actually race', () => {
    // At the module default of 3s a step the ladder finishes a Diabolical in
    // 3:18, which is a pacemaker rather than an opponent. The whole point of
    // measuring is that the engine lands somewhere near the player.
    expect(paceFrom([game(11000), game(13000), game(12000)])).toBeGreaterThan(ENGINE_STEP_MS)
  })
})
