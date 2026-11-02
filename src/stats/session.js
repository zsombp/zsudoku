// Today's session: one pattern, three steps.
//
// The practice screen offers every way in for every rung, which is the right
// shape for a reference and the wrong one for a habit: it asks you to decide
// what to practise before you have practised anything. This decides once a
// day, from the same schedule the practice screen shows, and walks the three
// ways in in the order they are worth doing: a lesson on the pattern (the last
// position it stopped you in, when there is one), five drill cards, and the
// shortest puzzle the generator can find that needs it.
//
// The pattern is fixed for the day once picked. A finished deck moves the
// schedule, and a session that changed its subject halfway through because its
// own drill made the pattern less due would be no session at all.
//
// Pure functions over a small stored object, so all of it is testable here and
// the app only has to read it, write it and draw it.

import { LADDER, CAGE_TECHNIQUES, TECHNIQUES } from '../logic/techniques.js'
import { canTeach } from '../logic/teachable.js'
import { schedule, strengthLabel } from './curriculum.js'

export const STAGES = ['lesson', 'drill', 'puzzle']

/** Five, not the practice screen's eight: the session is the short way in. */
export const SESSION_CARDS = 5

/** Days kept for the streak. More than a year of daily sessions is plenty. */
const HISTORY_CAP = 400

const pad = n => String(n).padStart(2, '0')

/** The local calendar day, which is what "today's session" means to a person. */
export const dayKey = (t = Date.now()) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A session needs all three ways in: a lesson, a deck and a classic puzzle. So
 * not the naked single, which is bookkeeping, and not the cage rungs, which no
 * classic deck can deal.
 */
export const sessionable = key =>
  Boolean(TECHNIQUES[key]) && key !== 'nakedSingle' && !CAGE_TECHNIQUES.includes(key) && canTeach(key)

/**
 * Which pattern today is about, and a sentence saying why.
 *
 *   due       the schedule's own answer, when it has one
 *   weak      nothing is due, so the shakiest pattern you have met
 *   new       nothing is shaky either, so the lowest rung the record knows
 *             nothing about: practice past what you have shown you own
 *   steady    every rung has evidence and all of it is good, so the weakest
 *
 * A first-day player with no games gets the pointing pair, the first rung
 * above the singles, rather than nothing: a session that refuses to start
 * until you have played twenty puzzles is not a daily habit.
 */
export function pickPattern(games, { now = Date.now(), drills = [] } = {}) {
  const all = schedule(games, { now, drills }).filter(x => sessionable(x.technique))
  const due = all.find(x => x.group === 'due')
  if (due) return { technique: due.technique, why: 'due', line: due.reason }

  const known = all.filter(x => !x.thin).sort((a, b) => a.strength - b.strength)
  const shaky = known.find(x => x.band <= 1)
  if (shaky) {
    return {
      technique: shaky.technique,
      why: 'weak',
      line: `Nothing is due, so the shakiest pattern you have met. ${shaky.reason}`,
    }
  }

  const evidence = new Set(known.map(x => x.technique))
  const fresh = LADDER.find(k => sessionable(k) && k !== 'hiddenSingle' && !evidence.has(k))
  if (fresh) {
    return {
      technique: fresh,
      why: 'new',
      line: known.length
        ? 'Nothing is due and nothing you have met is shaky, so the next rung up: the record has nothing on this one yet.'
        : 'The first rung above the singles. It fills in from your own games and decks as you go.',
    }
  }

  if (known.length) {
    const w = known[0]
    return {
      technique: w.technique,
      why: 'steady',
      line: `Every pattern you have met is ${strengthLabel(w.strength)} or better. This one is the least so. ${w.reason}`,
    }
  }
  return { technique: 'pointing', why: 'new', line: 'The first rung above the singles.' }
}

/** A blank session for a day. */
const blankSession = (day, pick, history) => ({
  v: 1,
  day,
  technique: pick.technique,
  why: pick.why,
  line: pick.line,
  stages: {},
  history,
})

/**
 * The session for today: the stored one if it is today's, otherwise a new one
 * on a newly picked pattern, carrying the streak history across.
 *
 * Returns `{ session, created }` so the caller knows to persist it.
 */
export function sessionToday(stored, games, { now = Date.now(), drills = [] } = {}) {
  const day = dayKey(now)
  const history = Array.isArray(stored?.history) ? stored.history : []
  if (stored?.v === 1 && stored.day === day && sessionable(stored.technique)) {
    return { session: { ...stored, stages: { ...stored.stages }, history }, created: false }
  }
  return { session: blankSession(day, pickPattern(games, { now, drills }), history), created: true }
}

/** The first step not yet done or skipped, or null once the session is over. */
export const nextStage = session => STAGES.find(s => !session?.stages?.[s]) || null

/**
 * A day counts once the lesson and the deck are done and the puzzle is done or
 * put off. The puzzle can be skipped because it is the long step and a
 * weeknight does not always have twenty minutes in it. The deck cannot: five
 * cards against the clock is the part that builds recognition, and a session
 * without it is a lesson you read.
 */
export const isComplete = session =>
  Boolean(session) &&
  session.stages.lesson === 'done' &&
  session.stages.drill === 'done' &&
  Boolean(session.stages.puzzle)

/** Mark one step. Returns a new session; the stored one is never mutated. */
export function markStage(session, stage, outcome = 'done') {
  if (!session || !STAGES.includes(stage)) return session
  // A step done stays done: skipping it afterwards, or a second deck, must
  // not undo it.
  if (session.stages[stage] === 'done') return session
  const next = { ...session, stages: { ...session.stages, [stage]: outcome } }
  if (isComplete(next) && !next.history.includes(next.day)) {
    next.history = [...next.history, next.day].sort().slice(-HISTORY_CAP)
  }
  return next
}

const DAY = 86400000
const dayNumber = key => {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY)
}

/**
 * Days in a row with a finished session, up to today or yesterday: like the
 * game streak, it does not die at midnight while you are still awake.
 */
export function sessionStreak(history, now = Date.now()) {
  const days = [...new Set((history || []).map(dayNumber))].sort((a, b) => b - a)
  if (!days.length) return 0
  const today = dayNumber(dayKey(now))
  if (days[0] < today - 1) return 0
  let n = 1
  for (let i = 1; i < days.length && days[i] === days[i - 1] - 1; i++) n++
  return n
}

/** What the card says about each step. */
export const STAGE_LABEL = { lesson: 'Lesson', drill: `${SESSION_CARDS} cards`, puzzle: 'One puzzle' }
