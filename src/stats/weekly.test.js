import { describe, it, expect } from 'vitest'
import { weeklyReview, weeklyDue, WEEK_MS } from './weekly.js'
import { schedule } from './curriculum.js'
import { dayKey } from './session.js'

const now = new Date(2026, 10, 2, 12).getTime()
const since = now - WEEK_MS
const game = (endedAt, extra = {}) => ({ endedAt, completed: true, mistakes: 0, hints: 0, ...extra })
const deck = (t, ms, technique = 'pointing') => ({ kind: 'drill', t, technique, cards: 5, found: 5, asked: 0, removed: 0, spotMs: ms })

describe('weekly review', () => {
  it('uses an inclusive seven-day start and excludes future records', () => {
    const result = weeklyReview([game(since - 1), game(since), game(now), game(now + 1)], { now })
    expect(result).toMatchObject({ played: 2, finished: 2, clean: 2, sparse: true })
  })
  it('counts abandoned games as played, with clean games drawn only from finishes', () => {
    expect(weeklyReview([game(now), game(now, { completed: false }), game(now, { hints: 1 })], { now }))
      .toMatchObject({ played: 3, finished: 2, clean: 1, sparse: false })
  })
  it('attributes stuck moments to the needed pattern rather than the placed single', () => {
    const result = weeklyReview([
      game(now, { hintLog: [{ technique: 'nakedSingle', needed: 'xWing' }] }),
      game(now, { summary: { stuckBy: { xWing: 2, nakedPair: 1 } } }),
    ], { now })
    expect(result.stopped.find(r => r.technique === 'xWing')).toMatchObject({ moments: 3, games: 2 })
    expect(result.stopped.some(r => r.technique === 'nakedSingle')).toBe(false)
  })
  it('reconstructs earlier strengths from earlier games and decks only', () => {
    const games = [game(since - 1, { hints: 1, hintLog: [{ needed: 'pointing' }] }), game(now, { techniques: { pointing: 1 } })]
    const drills = [deck(since - 2, [9000]), deck(since, [7000]), deck(now + 1, [100])]
    const result = weeklyReview(games, { now, drills })
    const row = result.changes.find(r => r.technique === 'pointing')
    expect(row.before).toBe(schedule(games.slice(0, 1), { now: since, drills: drills.slice(0, 1) })[0].strength)
    expect(row.after).toBe(schedule(games, { now, drills: drills.slice(0, 2) })[0].strength)
    expect(row.delta).toBeGreaterThan(0)
    expect(row.beforeSample).toContain('1 drill deck')
    expect(row.afterSample).toContain('2 drill decks')
  })
  it('reports a fall and distinguishes first evidence from a prior strength', () => {
    const games = [game(since - 1, { techniques: { pointing: 1 } }), game(now, { hints: 2, hintLog: [{ needed: 'pointing' }, { needed: 'xWing' }] })]
    const result = weeklyReview(games, { now })
    expect(result.changes[0].delta).toBeLessThan(0)
    expect(result.firstSeen.map(r => r.technique)).toContain('xWing')
  })
  it('compares timed decks within one pattern and states the successful-card samples', () => {
    const drills = [deck(now, [1000, 3000]), deck(since, [5000, 9000]), deck(now, [500], 'xWing'), deck(now, [])]
    const result = weeklyReview([], { now, drills })
    expect(result.spotting.find(r => r.technique === 'pointing')).toMatchObject({ decks: 3, timedDecks: 2, firstMs: 9000, lastMs: 3000, firstSpots: 2, lastSpots: 2 })
    expect(result.spotting.find(r => r.technique === 'xWing').timedDecks).toBe(1)
  })
  it('keeps predictions out of deck counts and future decks out of the snapshot', () => {
    expect(weeklyReview([], { now, drills: [{ ...deck(now, []), kind: 'predict' }, deck(now + 1, [])] }))
      .toMatchObject({ decks: 0, cards: 0, spotting: [], sparse: true })
  })
  it('reports empty weeks plainly and keeps the actual session streak', () => {
    const history = [dayKey(now), dayKey(now - 86400000)]
    expect(weeklyReview([], { now, history })).toMatchObject({ played: 0, changes: [], sparse: true, streak: 2, sessionDays: 2 })
  })
  it('does not mutate history while building either snapshot', () => {
    const games = [game(now), game(since)]
    const drills = [deck(now, [4000, 1000]), deck(since, [6000])]
    const before = structuredClone({ games, drills })
    weeklyReview(games, { now, drills })
    expect({ games, drills }).toEqual(before)
  })
})

it('offers a review once per seven days after opening or dismissal', () => {
  expect(weeklyDue(null, now)).toBe(true)
  expect(weeklyDue(now, now)).toBe(false)
  expect(weeklyDue(now, now + WEEK_MS - 1)).toBe(false)
  expect(weeklyDue(now, now + WEEK_MS)).toBe(true)
})
