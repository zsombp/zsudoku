import { describe, it, expect } from 'vitest'
import * as c from './compute.js'
import { insights, needed } from './coach.js'

const DAY = 86400000

/** A synthetic game record. Only the fields the stats layer reads. */
function game({
  endedAt = Date.parse('2026-07-20T12:00:00'),
  completed = true,
  graded = 'Medium',
  durationMs = 300000,
  mistakes = 0,
  hints = 0,
  hintLog = [],
  moveLog = [],
  id = String(Math.random()),
} = {}) {
  return { id, endedAt, completed, graded, durationMs, mistakes, hints, hintLog, moveLog }
}

/** A plausible move log: `n` placements spaced `gap` ms apart. */
function moves(n, { gap = 4000, wrongAt = [] } = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({ t: (i + 1) * gap, kind: 'place', cell: i, value: 1, correct: !wrongAt.includes(i) })
  }
  return out
}

describe('summary maths', () => {
  it('takes a median of both odd and even counts', () => {
    expect(c.median([5, 1, 3])).toBe(3)
    expect(c.median([1, 2, 3, 4])).toBe(3)
    expect(c.median([])).toBe(0)
  })

  it('means and handles empty', () => {
    expect(c.mean([2, 4, 6])).toBe(4)
    expect(c.mean([])).toBe(0)
  })
})

describe('streaks', () => {
  const now = Date.parse('2026-07-20T20:00:00')

  it('counts consecutive days ending today', () => {
    const games = [0, 1, 2].map(back => game({ endedAt: now - back * DAY }))
    const s = c.streaks(games, now)
    expect(s.currentStreak).toBe(3)
    expect(s.longestStreak).toBe(3)
    expect(s.daysPlayed).toBe(3)
  })

  it('lets a streak survive until the end of the following day', () => {
    // Played yesterday but not yet today: the streak is alive, not broken.
    const games = [1, 2].map(back => game({ endedAt: now - back * DAY }))
    expect(c.streaks(games, now).currentStreak).toBe(2)
  })

  it('breaks a streak after a missed day', () => {
    const games = [3, 4].map(back => game({ endedAt: now - back * DAY }))
    const s = c.streaks(games, now)
    expect(s.currentStreak).toBe(0)
    expect(s.longestStreak).toBe(2)
  })

  it('ignores abandoned games and counts a day once', () => {
    const games = [
      game({ endedAt: now }),
      game({ endedAt: now - 3600000 }),
      game({ endedAt: now - DAY, completed: false }),
    ]
    const s = c.streaks(games, now)
    expect(s.currentStreak).toBe(1)
    expect(s.daysPlayed).toBe(1)
  })
})

describe('overview', () => {
  it('counts abandoned games against the win rate', () => {
    const games = [game(), game(), game({ completed: false })]
    const o = c.overview(games)
    expect(o.played).toBe(3)
    expect(o.completed).toBe(2)
    expect(o.winRate).toBeCloseTo(2 / 3)
  })

  it('counts a clean solve as no hints and no mistakes', () => {
    const o = c.overview([game(), game({ mistakes: 1 }), game({ hints: 2 })])
    expect(o.cleanGames).toBe(1)
  })

  it('survives an empty history', () => {
    const o = c.overview([])
    expect(o.played).toBe(0)
    expect(o.winRate).toBe(0)
    expect(o.currentStreak).toBe(0)
  })
})

describe('per tier', () => {
  it('splits by the graded tier, never the requested one', () => {
    const games = [
      game({ graded: 'Hard', durationMs: 100 }),
      game({ graded: 'Hard', durationMs: 300 }),
      game({ graded: 'Easy', durationMs: 50 }),
    ]
    const hard = c.byTier(games).find(t => t.tier === 'Hard')
    expect(hard.played).toBe(2)
    expect(hard.best).toBe(100)
    expect(hard.medianMs).toBe(200)
  })

  it('gives every tier a row even with no games', () => {
    const rows = c.byTier([])
    expect(rows).toHaveLength(6)
    for (const r of rows) expect(r.played).toBe(0)
  })
})

describe('distributions', () => {
  it('bins durations without losing any', () => {
    const games = [100, 200, 300, 400, 500].map(durationMs => game({ durationMs }))
    const bins = c.durationHistogram(games, 5)
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(5)
  })

  it('returns nothing for an empty history', () => {
    expect(c.durationHistogram([])).toEqual([])
  })

  it('buckets by local hour', () => {
    const hours = c.byHour([game({ endedAt: Date.parse('2026-07-20T14:30:00') })])
    expect(hours[14].count).toBe(1)
    expect(hours).toHaveLength(24)
  })

  it('builds a calendar ending today', () => {
    const now = Date.parse('2026-07-20T12:00:00')
    const days = c.calendar([game({ endedAt: now })], 14, now)
    expect(days).toHaveLength(14)
    expect(days[days.length - 1].count).toBe(1)
    expect(days[0].count).toBe(0)
  })
})

describe('move log analysis', () => {
  it('turns timestamps into gaps', () => {
    const s = c.stalls([{ t: 1000 }, { t: 4000 }, { t: 4500 }])
    expect(s.map(x => x.gap)).toEqual([1000, 3000, 500])
  })

  it('splits a solve into thirds and needs enough moves to bother', () => {
    const p = c.pace([game({ moveLog: moves(30) }), game({ moveLog: moves(4) })])
    expect(p.sample).toBe(1)
    expect(p.parts).toHaveLength(3)
    expect(p.parts.reduce((a, x) => a + x.moves, 0)).toBe(30)
  })

  it('locates mistakes by box', () => {
    const log = [
      { kind: 'place', cell: 0, correct: false },
      { kind: 'place', cell: 1, correct: false },
      { kind: 'place', cell: 80, correct: true },
    ]
    const { boxes, total } = c.mistakeBoxes([game({ moveLog: log })])
    expect(total).toBe(2)
    expect(boxes[0]).toBe(2)
  })

  it('counts hints per technique', () => {
    const games = [
      game({ hintLog: [{ technique: 'hiddenSingle' }, { technique: 'pointing' }] }),
      game({ hintLog: [{ technique: 'hiddenSingle' }] }),
    ]
    const { counts, total } = c.hintsByTechnique(games)
    expect(total).toBe(3)
    expect(counts.hiddenSingle).toBe(2)
  })
})

describe('coach', () => {
  it('says nothing at all with no data', () => {
    expect(insights([])).toEqual([])
    expect(needed([])).toMatch(/5 more/)
  })

  it('refuses to draw conclusions from a tiny sample', () => {
    // Two games, both with a hint on the same technique. Tempting, and wrong.
    const games = [
      game({ hints: 1, hintLog: [{ technique: 'xyWing' }] }),
      game({ hints: 1, hintLog: [{ technique: 'xyWing' }] }),
    ]
    expect(insights(games).find(i => i.id === 'hints-technique')).toBeUndefined()
  })

  it('names a weak technique once there are enough hints', () => {
    const hintLog = Array.from({ length: 8 }, () => ({ technique: 'pointing' }))
    const found = insights([game({ hints: 8, hintLog })])
    const weak = found.find(i => i.id === 'hints-technique')
    expect(weak).toBeTruthy()
    expect(weak.title).toMatch(/pointing pair/i)
    expect(weak.sample).toMatch(/8 hints/)
  })

  it('spots mistakes clustering in the endgame', () => {
    // 30 placements a game, the wrong ones all in the final third.
    const games = Array.from({ length: 6 }, () =>
      game({ mistakes: 2, moveLog: moves(30, { wrongAt: [24, 27] }) })
    )
    const shape = insights(games).find(i => i.id === 'mistake-shape')
    expect(shape).toBeTruthy()
    expect(shape.title).toMatch(/endgame/)
  })

  it('every insight carries a sample size', () => {
    const hintLog = Array.from({ length: 8 }, () => ({ technique: 'pointing' }))
    const games = Array.from({ length: 8 }, () =>
      game({ hints: 1, hintLog, mistakes: 2, moveLog: moves(30, { wrongAt: [25] }) })
    )
    const found = insights(games)
    expect(found.length).toBeGreaterThan(0)
    for (const i of found) {
      expect(i.sample).toBeTruthy()
      expect(i.title.length).toBeGreaterThan(0)
      expect(i.body.length).toBeGreaterThan(0)
    }
  })

  it('suggests the next tier only on a real track record', () => {
    const thin = Array.from({ length: 3 }, () => game({ graded: 'Hard' }))
    expect(insights(thin).find(i => i.id === 'readiness')).toBeUndefined()

    const solid = Array.from({ length: 8 }, () => game({ graded: 'Hard', mistakes: 0 }))
    const ready = insights(solid).find(i => i.id === 'readiness')
    expect(ready).toBeTruthy()
    expect(ready.title).toMatch(/Expert/)
  })

  it('never throws on malformed records', () => {
    expect(() => insights([{ completed: true }, {}, game()])).not.toThrow()
  })
})
