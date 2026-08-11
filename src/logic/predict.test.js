import { describe, it, expect } from 'vitest'
import { predictTime } from './difficulty.js'

const game = (ms, over = {}) => ({ completed: true, graded: 'Hard', variant: 'classic', durationMs: ms, ...over })

describe('predicting a solve time', () => {
  it('refuses to guess from too little history', () => {
    expect(predictTime([game(1000), game(2000)], 'Hard')).toBeNull()
  })

  it('gives a range from your own middle, not a single number', () => {
    const games = [100, 200, 300, 400, 500, 600, 700].map(n => game(n * 1000))
    const p = predictTime(games, 'Hard')
    expect(p.low).toBeLessThan(p.mid)
    expect(p.mid).toBeLessThan(p.high)
    expect(p.sample).toBe(7)
  })

  it('is wider for an erratic player than a consistent one', () => {
    const steady = [300, 305, 310, 315, 320, 325].map(n => game(n * 1000))
    const erratic = [60, 200, 340, 480, 620, 900].map(n => game(n * 1000))
    const a = predictTime(steady, 'Hard')
    const b = predictTime(erratic, 'Hard')
    expect(b.high - b.low).toBeGreaterThan(a.high - a.low)
  })

  it('never mixes a board with a different one', () => {
    const games = [
      ...[100, 110, 120, 130, 140].map(n => game(n * 1000)),
      ...[900, 950, 1000, 1050, 1100].map(n => game(n * 1000, { variant: 'jigsaw' })),
    ]
    const classic = predictTime(games, 'Hard', 'classic')
    const jigsaw = predictTime(games, 'Hard', 'jigsaw')
    expect(classic.high).toBeLessThan(jigsaw.low)
  })

  it('ignores games that were never finished', () => {
    const games = [
      ...[100, 110, 120, 130, 140].map(n => game(n * 1000)),
      game(999999, { completed: false }),
    ]
    expect(predictTime(games, 'Hard').high).toBeLessThan(200000)
  })
})
