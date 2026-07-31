import { describe, it, expect } from 'vitest'
import { dayKey, dailyTier, dailySeed, dailyPlan, weekdayName, dailyStreak } from './daily.js'
import { seedFromDate } from '../lib/prng.js'
import { makePuzzle } from './generator.js'
import { achievements, earnedCount } from '../stats/achievements.js'

describe('daily plan', () => {
  it('keys by local date', () => {
    expect(dayKey(new Date(2026, 6, 5))).toBe('2026-07-05')
    expect(dayKey(new Date(2026, 11, 25))).toBe('2026-12-25')
  })

  it('rises through the week like a crossword', () => {
    // 2026-07-27 is a Monday.
    const monday = new Date(2026, 6, 27)
    expect(weekdayName(monday)).toBe('Monday')
    expect(dailyTier(monday)).toBe('Gentle')
    expect(dailyTier(new Date(2026, 6, 31))).toBe('Hard') // Friday
    expect(dailyTier(new Date(2026, 7, 1))).toBe('Expert') // Saturday
    expect(dailyTier(new Date(2026, 7, 2))).toBe('Diabolical') // Sunday
  })

  it('gives the same seed for a date and a different one for the next', () => {
    const a = dailySeed(new Date(2026, 6, 30))
    const b = dailySeed(new Date(2026, 6, 30))
    const c = dailySeed(new Date(2026, 6, 31))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('is offset from the plain date seed', () => {
    // Otherwise the daily and a casual game seeded the same way could be the
    // identical puzzle.
    const d = new Date(2026, 6, 30)
    expect(dailySeed(d)).not.toBe(seedFromDate(d))
  })

  it('produces the identical puzzle for the same day, which is the whole point', () => {
    const d = new Date(2026, 6, 29)
    const plan = dailyPlan(d)
    const a = makePuzzle(plan.tier, { seed: plan.seed, attempts: 6, budgetMs: 8000 })
    const b = makePuzzle(plan.tier, { seed: plan.seed, attempts: 6, budgetMs: 8000 })
    expect(a.puzzle).toEqual(b.puzzle)
    expect(a.graded).toBe(b.graded)
  })
})

describe('daily streak', () => {
  const rec = (dayKey, completed = true) => ({ daily: true, completed, dayKey })

  it('counts consecutive days up to today', () => {
    const games = [rec('2026-07-28'), rec('2026-07-29'), rec('2026-07-30')]
    const s = dailyStreak(games, '2026-07-30')
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
    expect(s.doneToday).toBe(true)
  })

  it('stays alive on the day after the last one', () => {
    const s = dailyStreak([rec('2026-07-29'), rec('2026-07-30')], '2026-07-31')
    expect(s.current).toBe(2)
    expect(s.doneToday).toBe(false)
  })

  it('breaks after a missed day', () => {
    const s = dailyStreak([rec('2026-07-25'), rec('2026-07-26')], '2026-07-30')
    expect(s.current).toBe(0)
    expect(s.longest).toBe(2)
  })

  it('ignores casual games and unfinished dailies', () => {
    const games = [
      { daily: false, completed: true, dayKey: '2026-07-30' },
      rec('2026-07-30', false),
    ]
    expect(dailyStreak(games, '2026-07-30').current).toBe(0)
  })

  it('handles a month boundary', () => {
    const s = dailyStreak([rec('2026-07-31'), rec('2026-08-01')], '2026-08-01')
    expect(s.current).toBe(2)
  })
})

describe('achievements', () => {
  const game = (over = {}) => ({
    completed: true,
    graded: 'Medium',
    durationMs: 400000,
    endedAt: Date.parse('2026-07-20T12:00:00'),
    mistakes: 0,
    hints: 0,
    moveLog: [],
    daily: false,
    ...over,
  })

  it('awards none on an empty history but still lists them all', () => {
    const list = achievements([])
    expect(list.length).toBeGreaterThan(10)
    expect(list.every(a => !a.earned)).toBe(true)
  })

  it('awards the first solve, and not the tenth', () => {
    const list = achievements([game()])
    expect(list.find(a => a.id === 'first').earned).toBe(true)
    expect(list.find(a => a.id === 'ten').earned).toBe(false)
  })

  it('tracks progress toward a counter', () => {
    const five = Array.from({ length: 5 }, () => game())
    const ten = achievements(five).find(a => a.id === 'ten')
    expect(ten.progress).toBeCloseTo(0.5)
    expect(ten.detail).toBe('5/10')
  })

  it('counts a clean solve as no hints and no mistakes', () => {
    expect(achievements([game({ mistakes: 1 })]).find(a => a.id === 'clean').earned).toBe(false)
    expect(achievements([game()]).find(a => a.id === 'clean').earned).toBe(true)
  })

  it('awards the no-pencil badge only above Hard and only without marks', () => {
    const withMarks = game({ graded: 'Expert', moveLog: [{ kind: 'pencil' }] })
    expect(achievements([withMarks]).find(a => a.id === 'no-pencil').earned).toBe(false)
    expect(achievements([game({ graded: 'Expert' })]).find(a => a.id === 'no-pencil').earned).toBe(true)
    expect(achievements([game({ graded: 'Easy' })]).find(a => a.id === 'no-pencil').earned).toBe(false)
  })

  it('never reports progress above 1', () => {
    const many = Array.from({ length: 250 }, () => game())
    for (const a of achievements(many)) expect(a.progress).toBeLessThanOrEqual(1)
  })

  it('counts earned badges', () => {
    expect(earnedCount([])).toBe(0)
    expect(earnedCount([game()])).toBeGreaterThan(0)
  })

  it('never throws on malformed records', () => {
    expect(() => achievements([{}, { completed: true }, game()])).not.toThrow()
  })
})
