import { describe, it, expect } from 'vitest'
import { insights } from './coach.js'
import { tilt, improvement, sessionFatigue } from './compute.js'

const HOUR = 36e5
/** A game whose move log has the mistakes placed where the test wants them. */
const game = (i, over = {}) => ({
  id: 'g' + i,
  endedAt: 1785000000000 + i * HOUR,
  completed: true,
  graded: 'Hard',
  durationMs: 300000,
  mistakes: 0,
  hints: 0,
  hintLog: [],
  moveLog: Array.from({ length: 30 }, (_, k) => ({ t: k * 10000, kind: 'place', cell: k, value: 1, correct: true })),
  ...over,
})

describe('tilt', () => {
  it('says nothing without enough placements either side of a mistake', () => {
    expect(tilt([game(0)])).toBeNull()
  })

  it('finds a real cluster of errors after a mistake', () => {
    // Wrong at t=0, then four more wrong inside the next five minutes, then a
    // long clean tail.
    const clustered = Array.from({ length: 6 }, (_, i) =>
      game(i, {
        mistakes: 5,
        moveLog: [
          { t: 0, kind: 'place', cell: 0, value: 1, correct: false },
          ...Array.from({ length: 5 }, (_, k) => ({ t: 30000 + k * 20000, kind: 'place', cell: k + 1, value: 1, correct: k < 4 ? false : true })),
          ...Array.from({ length: 25 }, (_, k) => ({ t: 900000 + k * 20000, kind: 'place', cell: k + 10, value: 1, correct: true })),
        ],
      })
    )
    const t = tilt(clustered)
    expect(t).toBeTruthy()
    expect(t.afterRate).toBeGreaterThan(t.restRate * 1.4)
    expect(insights(clustered).find(i => i.id === 'tilt')).toBeTruthy()
  })

  it('says so plainly when a mistake changes nothing', () => {
    // One early mistake, then the same steady accuracy throughout.
    const steady = Array.from({ length: 8 }, (_, i) =>
      game(i, {
        mistakes: 2,
        moveLog: Array.from({ length: 40 }, (_, k) => ({
          t: k * 20000, kind: 'place', cell: k, value: 1, correct: !(k === 2 || k === 30),
        })),
      })
    )
    const found = insights(steady).find(i => i.id === 'tilt-steady')
    expect(found).toBeTruthy()
    expect(found.body).toMatch(/does not apply to you/)
  })
})

describe('improvement', () => {
  it('measures within a tier, so easier puzzles cannot look like progress', () => {
    // Ten slow Hards, then ten fast Gentles. Naively that is a huge speed-up.
    const drifted = [
      ...Array.from({ length: 10 }, (_, i) => game(i, { graded: 'Hard', durationMs: 600000 })),
      ...Array.from({ length: 10 }, (_, i) => game(10 + i, { graded: 'Gentle', durationMs: 60000 })),
    ]
    // Neither tier has both halves, so it declines to claim anything.
    const imp = improvement(drifted)
    expect(imp === null || Math.abs(imp.overall) < 0.2).toBe(true)
  })

  it('finds a genuine speed-up inside one tier', () => {
    // Twenty finished games is the bar for claiming anything about a trend,
    // which is the point of the threshold rather than an obstacle to the test.
    const faster = [
      ...Array.from({ length: 12 }, (_, i) => game(i, { durationMs: 600000 })),
      ...Array.from({ length: 12 }, (_, i) => game(12 + i, { durationMs: 300000 })),
    ]
    const imp = improvement(faster)
    expect(imp.overall).toBeLessThan(-0.3)
    expect(insights(faster).find(i => i.id === 'improving')?.title).toMatch(/faster/)
  })
})

describe('session fatigue', () => {
  it('groups games into sittings by the gap between them', () => {
    // Four sittings of four games, ten minutes apart inside a sitting.
    const games = []
    let t = 1785000000000
    for (let s = 0; s < 4; s++) {
      t += 6 * HOUR
      for (let k = 0; k < 4; k++) {
        t += 10 * 60 * 1000
        games.push(game(games.length, { endedAt: t, mistakes: k }))
      }
    }
    const f = sessionFatigue(games)
    expect(f).toBeTruthy()
    expect(f[0].name).toBe('first')
    // Mistakes rise through a sitting by construction.
    expect(f[f.length - 1].mistakes).toBeGreaterThan(f[0].mistakes)
    expect(insights(games).find(i => i.id === 'fatigue')).toBeTruthy()
  })
})

describe('the nemesis', () => {
  const withHints = (i, technique, n) =>
    game(i, { hints: n, hintLog: Array.from({ length: n }, () => ({ technique })) })

  it('stays quiet about a pattern that was only bad recently', () => {
    const games = [
      ...Array.from({ length: 6 }, (_, i) => withHints(i, 'pointing', 3)),
      ...Array.from({ length: 6 }, (_, i) => withHints(6 + i, 'xWing', 3)),
    ]
    expect(insights(games).find(i => i.id === 'nemesis')).toBeFalsy()
  })

  it('speaks when the same rung has been worst throughout', () => {
    const games = Array.from({ length: 12 }, (_, i) => withHints(i, 'xWing', 3))
    const n = insights(games).find(i => i.id === 'nemesis')
    expect(n).toBeTruthy()
    expect(n.practice).toBe('xWing')
    expect(n.title).toMatch(/X-Wing/)
  })
})
