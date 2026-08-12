import { describe, it, expect } from 'vitest'
import { bandsFor } from './FlowStrip.jsx'

const seg = (over = {}) => ({
  kind: 'flow',
  from: 0,
  to: 8,
  startMs: 0,
  endMs: 10000,
  ms: 10000,
  moves: 9,
  msPerMove: 1111,
  spread: 1.1,
  wrong: 0,
  cells: [],
  ...over,
})

describe('laying the flow segments out along the clock', () => {
  it('puts a segment where it happened, as a share of the whole game', () => {
    const bands = bandsFor({
      totalMs: 100000,
      segments: [seg({ startMs: 25000, ms: 25000, endMs: 50000 })],
    })
    expect(bands[0].left).toBe(25)
    expect(bands[0].width).toBe(25)
  })

  it('draws nothing at all rather than NaN when the clock never moved', () => {
    // A game whose whole move log carries t: 0 gives a total of zero, and
    // dividing by it puts NaN into a style attribute. That renders as an empty
    // bar and nothing anywhere fails, which is exactly the kind of plausible
    // wrongness worth a test.
    expect(bandsFor({ totalMs: 0, segments: [seg()] })).toEqual([])
    expect(bandsFor({ segments: [seg()] })).toEqual([])
    expect(bandsFor(null)).toEqual([])
  })

  it('keeps a segment inside the track even when it ends on the last placement', () => {
    // `endMs` of the final segment is the timestamp of the last placement,
    // which is the total. Left plus width has to stay at or under 100 or the
    // band hangs off the end of the bar it belongs to.
    const bands = bandsFor({
      totalMs: 60000,
      segments: [seg({ startMs: 40000, ms: 20000, endMs: 60000 })],
    })
    expect(bands[0].left + bands[0].width).toBeLessThanOrEqual(100)
  })

  it('gives a moment-long segment enough width to be tappable', () => {
    // Struggle runs can be four placements inside a few seconds of a long game.
    // At true scale that is a sliver nobody could hit with a thumb.
    const bands = bandsFor({ totalMs: 3600000, segments: [seg({ startMs: 0, ms: 900 })] })
    expect(bands[0].width).toBeGreaterThanOrEqual(1.2)
  })

  it('never lets the minimum width push a late segment off the end', () => {
    const bands = bandsFor({
      totalMs: 3600000,
      segments: [seg({ startMs: 3599900, ms: 100, endMs: 3600000 })],
    })
    expect(bands[0].left + bands[0].width).toBeLessThanOrEqual(100)
  })
})
