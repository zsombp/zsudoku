// Everything derived from the game history. Pure functions over an array of
// records, so all of it is testable without a browser or a database.

import { TIERS } from '../logic/difficulty.js'
import { boxOf } from '../logic/topology.js'

const asc = (a, b) => a - b

export function median(values) {
  if (!values.length) return 0
  const s = [...values].sort(asc)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export const mean = values =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0

/** Local calendar day, not UTC: "did I play today" is a local question. */
export function dayKey(ts) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const dayNumber = ts => {
  const d = new Date(ts)
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000)
}

// ---- headline ----

export function overview(games) {
  const done = games.filter(g => g.completed)
  const durations = done.map(g => g.durationMs)
  return {
    played: games.length,
    completed: done.length,
    winRate: games.length ? done.length / games.length : 0,
    totalMs: games.reduce((a, g) => a + g.durationMs, 0),
    fastest: durations.length ? Math.min(...durations) : 0,
    medianMs: median(durations),
    mistakesPerGame: done.length ? done.reduce((a, g) => a + g.mistakes, 0) / done.length : 0,
    hintsPerGame: done.length ? done.reduce((a, g) => a + g.hints, 0) / done.length : 0,
    cleanGames: done.filter(g => g.mistakes === 0 && g.hints === 0).length,
    ...streaks(games),
  }
}

/**
 * Consecutive local days with at least one completed game.
 *
 * The current streak is only "current" if it includes today or yesterday.
 * Yesterday counts because a streak should not die at midnight while you are
 * still awake.
 */
export function streaks(games, now = Date.now()) {
  const days = [...new Set(games.filter(g => g.completed).map(g => dayNumber(g.endedAt)))].sort(asc)
  if (!days.length) return { currentStreak: 0, longestStreak: 0, daysPlayed: 0 }

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1
    if (run > longest) longest = run
  }

  const today = dayNumber(now)
  const last = days[days.length - 1]
  let current = 0
  if (last === today || last === today - 1) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] === days[i - 1] + 1) current++
      else break
    }
  }
  return { currentStreak: current, longestStreak: longest, daysPlayed: days.length }
}

// ---- per tier ----

export function byTier(games) {
  return TIERS.map(tier => {
    const played = games.filter(g => g.graded === tier.name)
    const done = played.filter(g => g.completed)
    const times = done.map(g => g.durationMs)
    const recent = done.slice(-10)
    return {
      tier: tier.name,
      played: played.length,
      completed: done.length,
      best: times.length ? Math.min(...times) : 0,
      medianMs: median(times),
      recent: recent.map(g => g.durationMs),
      mistakes: done.length ? done.reduce((a, g) => a + g.mistakes, 0) / done.length : 0,
    }
  })
}

/** Rolling mean over a window, for the "am I improving" line. */
export function rolling(values, window = 5) {
  const out = []
  for (let i = 0; i < values.length; i++) {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    out.push(mean(slice))
  }
  return out
}

// ---- distributions ----

export function durationHistogram(games, bins = 10) {
  const times = games.filter(g => g.completed).map(g => g.durationMs).sort(asc)
  if (!times.length) return []
  const min = times[0]
  const max = times[times.length - 1]
  const span = Math.max(1, max - min)
  const width = span / bins
  const out = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }))
  for (const t of times) {
    const idx = Math.min(bins - 1, Math.floor((t - min) / width))
    out[idx].count++
  }
  return out
}

export function byHour(games) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, totalMs: 0, completed: 0 }))
  for (const g of games) {
    const h = new Date(g.endedAt).getHours()
    hours[h].count++
    hours[h].totalMs += g.durationMs
    if (g.completed) hours[h].completed++
  }
  return hours
}

/** Games per local day, for the calendar. */
export function calendar(games, days = 119, now = Date.now()) {
  const counts = new Map()
  for (const g of games) {
    const k = dayKey(g.endedAt)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const out = []
  const base = new Date(now)
  base.setHours(12, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const k = dayKey(d.getTime())
    out.push({ key: k, date: d, count: counts.get(k) || 0 })
  }
  return out
}

// ---- move log analysis ----

/** Gaps between consecutive actions, which is where the thinking happened. */
export function stalls(moveLog) {
  if (!moveLog?.length) return []
  const out = []
  let prev = 0
  for (const m of moveLog) {
    out.push({ ...m, gap: Math.max(0, m.t - prev) })
    prev = m.t
  }
  return out
}

/**
 * Where in a game the time and the errors land.
 *
 * Thirds rather than a smooth curve: with a handful of games a smooth curve is
 * noise wearing a suit, and "you lose it in the endgame" is the actionable
 * shape anyway.
 */
export function pace(games) {
  const thirds = [
    { part: 'opening', ms: 0, moves: 0, mistakes: 0 },
    { part: 'middle', ms: 0, moves: 0, mistakes: 0 },
    { part: 'endgame', ms: 0, moves: 0, mistakes: 0 },
  ]
  let counted = 0

  for (const g of games) {
    const log = stalls(g.moveLog)
    const placements = log.filter(m => m.kind === 'place')
    if (placements.length < 9) continue
    counted++
    placements.forEach((m, i) => {
      const third = Math.min(2, Math.floor((i / placements.length) * 3))
      thirds[third].ms += m.gap
      thirds[third].moves++
      if (m.correct === false) thirds[third].mistakes++
    })
  }

  return {
    sample: counted,
    parts: thirds.map(t => ({ ...t, msPerMove: t.moves ? Math.round(t.ms / t.moves) : 0 })),
  }
}

/** Which 3x3 box the mistakes cluster in, if any. */
export function mistakeBoxes(games) {
  const boxes = Array.from({ length: 9 }, () => 0)
  let total = 0
  for (const g of games) {
    for (const m of g.moveLog || []) {
      if (m.kind === 'place' && m.correct === false) {
        boxes[boxOf(m.cell)]++
        total++
      }
    }
  }
  return { boxes, total }
}

/** How often each technique needed a hint. */
export function hintsByTechnique(games) {
  const counts = {}
  let total = 0
  for (const g of games) {
    for (const h of g.hintLog || []) {
      const key = h.technique || 'unknown'
      counts[key] = (counts[key] || 0) + 1
      total++
    }
  }
  return { counts, total }
}
