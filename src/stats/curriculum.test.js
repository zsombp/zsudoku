import { describe, it, expect } from 'vitest'
import { schedule, nextUp, nothingDue, intervalDays, strengthLabel } from './curriculum.js'

const DAY = 86400000
const NOW = Date.UTC(2026, 7, 12, 18, 0, 0)

/**
 * A finished game `daysAgo` days back.
 *
 * `hints` is what the bulb was pressed on, `unaided` is what the classifier
 * credited to the player, and `needed` is what the grader's own solve path
 * required, which is the field a real record stores as `techniques`.
 */
const game = (daysAgo, { hints = {}, unaided = {}, needed = {}, completed = true } = {}) => ({
  id: `g${daysAgo}`,
  endedAt: NOW - daysAgo * DAY,
  completed,
  graded: 'Hard',
  durationMs: 300000,
  mistakes: 0,
  hints: Object.values(hints).reduce((a, b) => a + b, 0),
  hintLog: Object.entries(hints).flatMap(([technique, n]) =>
    Array.from({ length: n }, () => ({ technique, cell: 0, derived: true }))
  ),
  techniques: needed,
  summary: { v: 1, placements: 45, counts: {}, sharpBy: unaided },
})

const row = (games, technique, now = NOW) => schedule(games, { now }).find(r => r.technique === technique)

describe('what gets scheduled at all', () => {
  it('never suggests a pattern this player has never met', () => {
    // The rule that separates a curriculum from somebody else's textbook.
    // Measured over 72 generated puzzles: a Swordfish appeared in none of them
    // and a naked quad in one, so a player can easily have no exposure at all.
    const games = Array.from({ length: 6 }, (_, i) =>
      game(i + 1, { needed: { nakedSingle: 30, hiddenSingle: 8, pointing: 2 }, hints: { pointing: 2 } })
    )
    const keys = schedule(games, { now: NOW }).map(r => r.technique)
    expect(keys).toContain('pointing')
    expect(keys).not.toContain('swordfish')
    expect(keys).not.toContain('xyWing')
  })

  it('never suggests naked singles, whatever the hint log says', () => {
    // They cost zero in the grader on purpose and fire in 100% of puzzles at
    // every tier, so a curriculum able to suggest them would suggest them for
    // ever and nothing else would ever reach the top.
    const games = Array.from({ length: 6 }, (_, i) =>
      game(i + 1, { needed: { nakedSingle: 40 }, hints: { nakedSingle: 5 } })
    )
    expect(schedule(games, { now: NOW }).map(r => r.technique)).not.toContain('nakedSingle')
    expect(nextUp(games, { now: NOW })).toBeNull()
  })

  it('does not treat a puzzle you walked away from as a pattern you handled', () => {
    // `techniques` records what the grader's solve needed, not what the player
    // reached. Two moves into an abandoned Diabolical, the XY-Wing in it was
    // never in front of them.
    const abandoned = [game(3, { needed: { xyWing: 2 }, completed: false })]
    expect(row(abandoned, 'xyWing')).toBeUndefined()

    // A hint is evidence either way: taking one and then giving up still says
    // the pattern beat you.
    const gaveUp = [game(3, { needed: { xyWing: 2 }, hints: { xyWing: 1 }, completed: false })]
    expect(row(gaveUp, 'xyWing')).toBeTruthy()
  })
})

describe('strength', () => {
  it('rises on patterns found unaided and falls on the ones that cost hints', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      game(i + 1, {
        needed: { pointing: 3, hiddenPair: 2 },
        hints: { pointing: 2 },
        unaided: { hiddenPair: 2 },
      })
    )
    expect(row(games, 'pointing').strength).toBeLessThan(0.2)
    expect(row(games, 'hiddenPair').strength).toBeGreaterThan(0.8)
    expect(strengthLabel(row(games, 'pointing').strength)).toBe('shaky')
    expect(strengthLabel(row(games, 'hiddenPair').strength)).toBe('solid')
  })

  it('leaves a hidden single a route back up, since nothing else can credit one', () => {
    // Measured over 72 ladder-perfect games: `sharpBy` credited every
    // elimination rung and credited hiddenSingle exactly zero times, because
    // `justification` answers solid for a hidden single and never reaches the
    // branch that names a pattern. Without counting the games that needed it and
    // got no hint, one hint would pin it at the bottom for the rest of time.
    const hinted = Array.from({ length: 5 }, (_, i) =>
      game(20 - i, { needed: { hiddenSingle: 9 }, hints: { hiddenSingle: 3 } })
    )
    const clean = Array.from({ length: 15 }, (_, i) => game(15 - i, { needed: { hiddenSingle: 9 } }))

    const beaten = row(hinted, 'hiddenSingle')
    expect(beaten.strength).toBeLessThan(0.2)
    expect(beaten.group).toBe('due')

    const recovered = row([...hinted, ...clean], 'hiddenSingle')
    expect(recovered.strength).toBeGreaterThan(0.7)
    expect(recovered.group).toBe('waiting')
  })

  it('counts a game as one review rather than one review per hint', () => {
    // A game is a sitting: three hints on the same pattern inside twenty minutes
    // is one failure to learn it, not three independent reviews. It also matches
    // what the data supports, since hintLog entries carry no timestamps.
    const once = [game(1, { needed: { xWing: 1 }, hints: { xWing: 1 } })]
    const fiveTimes = [game(1, { needed: { xWing: 1 }, hints: { xWing: 5 } })]
    expect(row(fiveTimes, 'xWing').strength).toBeCloseTo(row(once, 'xWing').strength)
    // The raw count is still reported, so the claim can be checked.
    expect(row(fiveTimes, 'xWing').hints).toBe(5)
  })
})

describe('what to drill next', () => {
  it('names the pattern that keeps costing hints, not the one that is merely overdue', () => {
    // The bug this protects against, found by running the scheduler over real
    // games: ranking purely by how far past due a rung was put an X-Wing that
    // two puzzles happened to contain ahead of a pointing pair that had been
    // hinted 57 times, because the pointing pair had been met more recently and
    // so was not technically due. Overdue is a poor proxy for weak.
    const games = [
      game(4, { needed: { xWing: 1, pointing: 4 }, hints: { pointing: 3 } }),
      game(3, { needed: { xWing: 1, pointing: 4 }, hints: { pointing: 3 } }),
      game(2, { needed: { pointing: 4 }, hints: { pointing: 3 } }),
      game(1, { needed: { pointing: 4 }, hints: { pointing: 3 } }),
    ]
    expect(nextUp(games, { now: NOW }).technique).toBe('pointing')
    expect(row(games, 'xWing').group).toBe('thin')
  })

  it('will not build a drill on a pattern it has only seen in the grader path', () => {
    // Two puzzles contained a naked triple somewhere in the ladder's own solve.
    // Nobody hinted, nobody was credited, and there is nothing here to teach.
    const games = [game(10, { needed: { nakedTriple: 1 } }), game(9, { needed: { nakedTriple: 1 } })]
    expect(row(games, 'nakedTriple').group).toBe('thin')
    expect(nextUp(games, { now: NOW })).toBeNull()
    expect(nothingDue(games, { now: NOW })).toMatch(/Nothing to drill yet/)
  })

  it('says nothing is due while every pattern is fresher than its own interval', () => {
    const games = Array.from({ length: 10 }, (_, i) =>
      game(i, { needed: { pointing: 3, hiddenPair: 1 }, unaided: { pointing: 2, hiddenPair: 1 } })
    )
    expect(nextUp(games, { now: NOW })).toBeNull()
    expect(nothingDue(games, { now: NOW })).toMatch(/^Nothing is due\./)
    // And it names what comes next, so an empty panel still says something.
    expect(nothingDue(games, { now: NOW })).toMatch(/Next up is the/)
  })

  it('states the sample behind whatever it suggests', () => {
    const games = Array.from({ length: 4 }, (_, i) => game(i + 1, { needed: { xyWing: 2 }, hints: { xyWing: 2 } }))
    const up = nextUp(games, { now: NOW })
    expect(up.technique).toBe('xyWing')
    expect(up.reason).toMatch(/8 hints/)
    expect(up.reason).toMatch(/across 4 games with it/)
    expect(up.sample).toBe('4 games with it')
  })

  it('has nothing to say before anything has been played', () => {
    expect(schedule([], { now: NOW })).toEqual([])
    expect(nextUp([], { now: NOW })).toBeNull()
    expect(nothingDue([], { now: NOW })).toMatch(/Nothing is scheduled yet/)
  })
})

describe('the interval', () => {
  it('brings a failed pattern back the same day and a solid one back in weeks', () => {
    // Half a day at the floor is deliberate: this app is built around a puzzle a
    // day, so a full day would mean a pattern failed this evening is not offered
    // until after the next game.
    expect(intervalDays(0)).toBeCloseTo(0.5)
    expect(intervalDays(1)).toBeCloseTo(21)
    expect(intervalDays(0.5)).toBeGreaterThan(intervalDays(0.4))
  })

  it('comes due once the interval has passed, and not before', () => {
    const games = Array.from({ length: 4 }, (_, i) =>
      game(i + 1, { needed: { nakedPair: 2 }, unaided: { nakedPair: 2 } })
    )
    const fresh = row(games, 'nakedPair')
    expect(fresh.group).toBe('waiting')
    expect(fresh.intervalDays).toBeGreaterThan(10)
    expect(row(games, 'nakedPair', NOW + 20 * DAY).group).toBe('due')
  })

  it('puts the due date a strength-sized wait after the game it was last met in', () => {
    const games = [game(2, { needed: { hiddenPair: 2 }, unaided: { hiddenPair: 2 } })]
    const r = row(games, 'hiddenPair')
    expect(r.lastSeen).toBe(NOW - 2 * DAY)
    expect(r.due).toBeCloseTo(r.lastSeen + intervalDays(r.strength) * DAY, -3)
  })
})
