import { stuckIn } from './compute.js'
import { schedule } from './curriculum.js'
import { learningCurve } from './drills.js'
import { sessionStreak } from './session.js'
import { TECHNIQUES } from '../logic/techniques.js'

export const WEEK_MS = 7 * 86400000

/** Opening or dismissing the card starts its next seven-day wait. */
export const weeklyDue = (handledAt, now = Date.now()) =>
  !Number.isFinite(handledAt) || handledAt <= 0 || now - handledAt >= WEEK_MS

/** Reconstruct both snapshots from retained history, never today's strengths alone. */
export function weeklyReview(games, { drills = [], history = [], now = Date.now() } = {}) {
  const since = now - WEEK_MS
  const known = games.filter(g => Number.isFinite(g.endedAt) && g.endedAt <= now)
  const log = drills.filter(d => Number.isFinite(d.t) && d.t <= now)
  const week = known.filter(g => g.endedAt >= since)
  const decks = log.filter(d => d.t >= since && d.kind === 'drill')
  const stopped = new Map()
  for (const game of week) {
    for (const [technique, count] of Object.entries(stuckIn(game))) {
      if (!TECHNIQUES[technique] || count <= 0) continue
      const entry = stopped.get(technique) || { technique, label: TECHNIQUES[technique].label, moments: 0, games: 0 }
      entry.moments += count
      entry.games++
      stopped.set(technique, entry)
    }
  }
  const before = new Map(schedule(known.filter(g => g.endedAt < since), {
    now: since, drills: log.filter(d => d.t < since),
  }).map(row => [row.technique, row]))
  const current = schedule(known, { now, drills: log })
  const changes = []
  const firstSeen = []
  for (const row of current) {
    const old = before.get(row.technique)
    if (!old) {
      firstSeen.push({ technique: row.technique, label: row.label, sample: row.sample })
      continue
    }
    const delta = row.strength - old.strength
    // A tenth of a percentage point is below what the screen can print.
    if (Math.abs(delta) < 0.001) continue
    changes.push({
      technique: row.technique, label: row.label, before: old.strength,
      after: row.strength, delta, beforeSample: old.sample, afterSample: row.sample,
    })
  }
  const spotting = [...new Set(decks.map(d => d.technique))].filter(k => TECHNIQUES[k]).map(technique => {
    const own = decks.filter(d => d.technique === technique).sort((a, b) => a.t - b.t)
    const timed = own.filter(d => d.spotMs?.length)
    const curve = learningCurve(own, technique).filter(p => p.medianMs != null)
    return {
      technique, label: TECHNIQUES[technique].label, decks: own.length,
      cards: own.reduce((n, d) => n + d.cards, 0), timedDecks: curve.length,
      firstMs: curve[0]?.medianMs ?? null, lastMs: curve.at(-1)?.medianMs ?? null,
      firstSpots: timed[0]?.spotMs.length || 0, lastSpots: timed.at(-1)?.spotMs.length || 0,
    }
  })
  const finished = week.filter(g => g.completed)
  return {
    since, now, played: week.length, finished: finished.length,
    clean: finished.filter(g => g.mistakes === 0 && g.hints === 0).length,
    decks: decks.length, cards: decks.reduce((n, d) => n + d.cards, 0),
    stopped: [...stopped.values()].sort((a, b) => b.moments - a.moments),
    changes: changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)), firstSeen, spotting,
    streak: sessionStreak(history, now), sessionDays: new Set(history).size,
    sparse: week.length + decks.length < 3,
  }
}
