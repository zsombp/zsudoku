// The daily puzzle.
//
// No server, and none needed. The generator has taken a seed since Phase 0, and
// the seed is derived from the calendar date, so every device produces the same
// puzzle for the same day by construction. That was the whole reason for
// replacing Math.random back then.
//
// Difficulty rises through the week, the way a newspaper crossword does: Monday
// is a warm-up, Sunday is the fight.

import { seedFromDate } from '../lib/prng.js'

const BY_WEEKDAY = [
  'Diabolical', // Sunday
  'Gentle',
  'Easy',
  'Medium',
  'Medium',
  'Hard',
  'Expert', // Saturday
]

/** Local date, not UTC: "today's puzzle" is a local question. */
export function dayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export const dailyTier = (date = new Date()) => BY_WEEKDAY[date.getDay()]

/**
 * Offset by one so the daily and a casual game of the same tier on the same day
 * never come out as the same puzzle.
 */
export const dailySeed = (date = new Date()) => (seedFromDate(date) ^ 0x5bf03635) >>> 0

export function dailyPlan(date = new Date()) {
  return { key: dayKey(date), tier: dailyTier(date), seed: dailySeed(date), weekday: date.getDay() }
}

const WEEKDAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const weekdayName = (date = new Date()) => WEEKDAY_NAME[date.getDay()]

/**
 * Consecutive days of completed dailies, ending today or yesterday.
 *
 * Same grace as the play streak: a streak should not die at midnight while you
 * are still awake.
 */
export function dailyStreak(records, today = dayKey()) {
  const done = new Set(records.filter(r => r.daily && r.completed).map(r => r.dayKey))
  if (!done.size) return { current: 0, longest: 0, total: done.size, doneToday: false }

  const toDay = k => {
    const [y, m, d] = k.split('-').map(Number)
    return Math.floor(new Date(y, m - 1, d).getTime() / 86400000)
  }
  const days = [...done].map(toDay).sort((a, b) => a - b)

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1
    if (run > longest) longest = run
  }

  const t = toDay(today)
  const last = days[days.length - 1]
  let current = 0
  if (last === t || last === t - 1) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] === days[i - 1] + 1) current++
      else break
    }
  }

  return { current, longest, total: done.size, doneToday: done.has(today) }
}
