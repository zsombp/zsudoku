import { describe, it, expect } from 'vitest'
import {
  pickPattern,
  sessionToday,
  nextStage,
  markStage,
  isComplete,
  sessionStreak,
  sessionable,
  dayKey,
  isStale,
  STAGES,
} from './session.js'
import { LADDER } from '../logic/techniques.js'

const DAY = 86400000
// Midday local time, so a day either side is still a different calendar day
// wherever the test runs.
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime()

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

describe("which pattern today's session is about", () => {
  it('takes the due pattern when the schedule has one', () => {
    const games = [game(3, { needed: { pointing: 2, xWing: 1 }, hints: { xWing: 2 } })]
    const pick = pickPattern(games, { now: NOW })
    expect(pick.technique).toBe('xWing')
    expect(pick.why).toBe('due')
    expect(pick.line).toMatch(/Stopped you 2 times/)
  })

  it('starts a first-day player on the first rung above the singles', () => {
    const pick = pickPattern([], { now: NOW })
    expect(pick.technique).toBe('pointing')
    expect(pick.why).toBe('new')
  })

  it('goes up the ladder when everything met is in hand and nothing is due', () => {
    // Pointing found unaided yesterday, so it is strong and not due.
    const games = Array.from({ length: 6 }, (_, i) =>
      game(i * 0.1 + 0.2, { needed: { pointing: 2 }, unaided: { pointing: 3 } })
    )
    const pick = pickPattern(games, { now: NOW })
    expect(pick.why).toBe('new')
    expect(pick.technique).toBe(LADDER.find(k => sessionable(k) && !['hiddenSingle', 'pointing'].includes(k)))
  })

  it('never picks a rung a classic session cannot teach and deal', () => {
    for (const k of ['nakedSingle', 'cageSum', 'sum45']) expect(sessionable(k)).toBe(false)
    for (const k of ['pointing', 'xyWing', 'skyscraper', 'xyzWing']) expect(sessionable(k)).toBe(true)
  })
})

describe('a session through the day', () => {
  it('keeps its pattern for the whole day and starts afresh the next', () => {
    const games = [game(3, { needed: { xWing: 1 }, hints: { xWing: 2 } })]
    const { session, created } = sessionToday(null, games, { now: NOW })
    expect(created).toBe(true)
    expect(session.day).toBe(dayKey(NOW))
    expect(nextStage(session)).toBe('lesson')

    // A deck later the same day changes the schedule, but not today's subject.
    const later = sessionToday(session, [], { now: NOW + 3 * 3600000 })
    expect(later.created).toBe(false)
    expect(later.session.technique).toBe('xWing')

    const tomorrow = sessionToday(session, [], { now: NOW + DAY })
    expect(tomorrow.created).toBe(true)
    expect(tomorrow.session.stages).toEqual({})
  })

  it('knows when the session it holds is from a day that has ended', () => {
    const { session } = sessionToday(null, [], { now: NOW })
    expect(isStale(session, NOW + 3600000)).toBe(false)
    expect(isStale(session, NOW + DAY)).toBe(true)
    expect(isStale(null, NOW)).toBe(true)
  })

  it('walks the three steps in order and counts the day once the deck is done', () => {
    let { session } = sessionToday(null, [], { now: NOW })
    expect(STAGES).toEqual(['lesson', 'drill', 'puzzle'])
    session = markStage(session, 'lesson')
    expect(nextStage(session)).toBe('drill')
    session = markStage(session, 'drill')
    expect(isComplete(session)).toBe(false)
    session = markStage(session, 'puzzle', 'skipped')
    expect(isComplete(session)).toBe(true)
    expect(nextStage(session)).toBeNull()
    expect(session.history).toEqual([dayKey(NOW)])
  })

  it('does not count a day whose deck was skipped', () => {
    let { session } = sessionToday(null, [], { now: NOW })
    session = markStage(markStage(markStage(session, 'lesson'), 'drill', 'skipped'), 'puzzle')
    expect(nextStage(session)).toBeNull()
    expect(isComplete(session)).toBe(false)
    expect(session.history).toEqual([])
  })

  it('never undoes a step that is done, and never mutates what it was given', () => {
    const { session } = sessionToday(null, [], { now: NOW })
    const a = markStage(session, 'lesson')
    expect(session.stages).toEqual({})
    expect(markStage(a, 'lesson', 'skipped').stages.lesson).toBe('done')
  })
})

describe('the session streak', () => {
  const days = n => Array.from({ length: n }, (_, i) => dayKey(NOW - i * DAY))

  it('counts days in a row up to today', () => {
    expect(sessionStreak(days(4), NOW)).toBe(4)
  })

  it('survives until tonight when the last one was yesterday', () => {
    expect(sessionStreak(days(3).map((_, i) => dayKey(NOW - (i + 1) * DAY)), NOW)).toBe(3)
  })

  it('is broken by a missed day', () => {
    expect(sessionStreak([dayKey(NOW - 2 * DAY), dayKey(NOW - 3 * DAY)], NOW)).toBe(0)
    expect(sessionStreak([dayKey(NOW), dayKey(NOW - 2 * DAY)], NOW)).toBe(1)
    expect(sessionStreak([], NOW)).toBe(0)
  })
})
