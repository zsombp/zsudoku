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

/**
 * The stored move classifications, added up.
 *
 * Every game carries its own summary since v1.9.0, so this is arithmetic rather
 * than analysis: the expensive part happened once, when the game ended.
 */
export function judgment(games) {
  const withSummary = games.filter(g => g.summary?.placements)
  const total = { placements: 0, missed: 0, slowEasy: 0, fastGuess: 0, earned: 0 }
  const counts = {}
  const sharpBy = {}
  const byTier = {}

  for (const g of withSummary) {
    const s = g.summary
    total.placements += s.placements
    total.missed += s.missed || 0
    total.slowEasy += s.slowEasy || 0
    total.fastGuess += s.fastGuess || 0
    total.earned += s.earned || 0
    for (const [k, n] of Object.entries(s.counts || {})) counts[k] = (counts[k] || 0) + n
    for (const [k, n] of Object.entries(s.sharpBy || {})) sharpBy[k] = (sharpBy[k] || 0) + n

    const tier = g.graded || 'Unknown'
    const t = (byTier[tier] ||= { games: 0, placements: 0, lucky: 0, sharp: 0, mistake: 0 })
    t.games++
    t.placements += s.placements
    t.lucky += s.counts?.lucky || 0
    t.sharp += s.counts?.sharp || 0
    t.mistake += s.counts?.mistake || 0
  }

  return { sample: withSummary.length, total, counts, sharpBy, byTier }
}

/**
 * Does accuracy fall apart in the minutes after a mistake?
 *
 * Compares placements made within `windowMs` of a wrong digit against every
 * other placement in the same game, so a player who is simply error-prone does
 * not read as tilting. The comparison is within a game and then pooled, because
 * a bad game and a good game have different baselines.
 */
export function tilt(games, { windowMs = 300000 } = {}) {
  let afterTotal = 0
  let afterWrong = 0
  let restTotal = 0
  let restWrong = 0
  let sample = 0

  for (const g of games) {
    const log = (g.moveLog || []).filter(m => m.kind === 'place')
    if (log.length < 20) continue
    const wrongTimes = log.filter(m => m.correct === false).map(m => m.t)
    if (!wrongTimes.length) continue
    sample++

    for (const m of log) {
      // A placement inside the shadow of an earlier mistake.
      const shadowed = wrongTimes.some(t => m.t > t && m.t - t <= windowMs)
      if (shadowed) {
        afterTotal++
        if (m.correct === false) afterWrong++
      } else {
        restTotal++
        if (m.correct === false) restWrong++
      }
    }
  }

  if (afterTotal < 30 || restTotal < 30) return null
  return {
    sample,
    afterRate: afterWrong / afterTotal,
    restRate: restWrong / restTotal,
    afterTotal,
    restTotal,
  }
}

/**
 * Is this player actually getting better, or just playing easier puzzles?
 *
 * Compares the first half of their history against the second, within each
 * tier, so a drift toward Gentle cannot read as improvement. Only tiers with
 * enough games on both sides are counted.
 */
export function improvement(games) {
  const done = games.filter(g => g.completed).sort((a, b) => a.endedAt - b.endedAt)
  if (done.length < 20) return null

  const byTierName = {}
  for (const g of done) (byTierName[g.graded] ||= []).push(g)

  const moved = []
  for (const [tier, list] of Object.entries(byTierName)) {
    if (list.length < 8) continue
    const half = Math.floor(list.length / 2)
    const early = median(list.slice(0, half).map(g => g.durationMs))
    const late = median(list.slice(half).map(g => g.durationMs))
    if (!early || !late) continue
    moved.push({ tier, early, late, change: (late - early) / early, games: list.length })
  }
  if (!moved.length) return null

  // Weighted by how many games each tier contributed.
  const total = moved.reduce((a, m) => a + m.games, 0)
  const overall = moved.reduce((a, m) => a + m.change * m.games, 0) / total
  return { tiers: moved.sort((a, b) => a.change - b.change), overall, sample: total }
}

/** How performance moves across the hours of the day, for the fatigue read. */
export function byPartOfDay(games) {
  const bands = [
    { name: 'morning', from: 5, to: 12 },
    { name: 'afternoon', from: 12, to: 18 },
    { name: 'evening', from: 18, to: 23 },
    { name: 'late night', from: 23, to: 5 },
  ]
  const done = games.filter(g => g.completed)
  return bands
    .map(b => {
      const inBand = done.filter(g => {
        const h = new Date(g.endedAt).getHours()
        return b.from < b.to ? h >= b.from && h < b.to : h >= b.from || h < b.to
      })
      return {
        ...b,
        games: inBand.length,
        mistakes: inBand.length ? inBand.reduce((a, g) => a + g.mistakes, 0) / inBand.length : 0,
        medianMs: inBand.length ? median(inBand.map(g => g.durationMs)) : 0,
      }
    })
    .filter(b => b.games > 0)
}

/**
 * How long a session had been running when each game was played, and whether
 * accuracy holds up across it. Games within `gapMs` of each other are one
 * sitting.
 */
export function sessionFatigue(games, { gapMs = 45 * 60 * 1000 } = {}) {
  const done = games.filter(g => g.completed).sort((a, b) => a.endedAt - b.endedAt)
  if (done.length < 12) return null

  const buckets = [
    { name: 'first', games: [] },
    { name: 'second or third', games: [] },
    { name: 'fourth onward', games: [] },
  ]
  let position = 0
  let prevEnd = 0

  for (const g of done) {
    const startedNew = g.endedAt - prevEnd > gapMs
    position = startedNew ? 0 : position + 1
    prevEnd = g.endedAt
    const bucket = position === 0 ? 0 : position <= 2 ? 1 : 2
    buckets[bucket].games.push(g)
  }

  const filled = buckets
    .filter(b => b.games.length >= 4)
    .map(b => ({
      name: b.name,
      count: b.games.length,
      mistakes: b.games.reduce((a, g) => a + g.mistakes, 0) / b.games.length,
    }))
  return filled.length >= 2 ? filled : null
}
