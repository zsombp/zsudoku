// A curriculum of only what this player gets wrong, scheduled against their own
// failures rather than a fixed syllabus.
//
// The evidence is already on every record. `hintLog` says which pattern beat
// you, `summary.sharpBy` says which ones you found unaided, and `techniques`
// says which ones the puzzle required at all. So each rung carries a strength
// that rises when you find it yourself and falls when you ask for it, plus a due
// date derived from that strength: weak patterns come back in a day, ones you
// have proved you own come back in three weeks.
//
// Everything below was measured first, over 12 generated puzzles per tier (72
// in all). Share of puzzles whose solve path needs each rung:
//
//   rung          Gentle  Easy  Medium  Hard  Expert  Diabolical
//   nakedSingle     100%  100%    100%  100%    100%        100%
//   hiddenSingle       .  100%    100%  100%    100%        100%
//   pointing           .     .     92%  100%    100%         83%
//   claiming           .     .     17%   58%     33%         42%
//   nakedPair          .     .      8%   33%     33%         42%
//   hiddenPair         .     .     17%   50%     17%         67%
//   nakedTriple        .     .       .     .      8%         33%
//   hiddenTriple       .     .       .     .      8%         17%
//   nakedQuad          .     .       .     .       .          8%
//   xWing              .     .       .    8%      8%         67%
//   xyWing             .     .       .     .     83%        100%
//   swordfish          .     .       .     .       .           .
//
// Two things fall out of that table and both are load-bearing.
//
// A Swordfish turned up in none of the 72 and a naked quad in one, so the rule
// against suggesting a rung with no exposure is not a formality. It is the
// difference between a curriculum and somebody else's textbook.
//
// And the cheap rungs get practised whether this module asks for them or not,
// which is why the ordering prefers the pattern you have not met lately over the
// one you failed this morning. You will meet a hidden single tomorrow whatever
// happens. You will not meet an XY-Wing unless you go looking.
//
// The second measurement decided the third signal. Replaying those same 72
// puzzles as a ladder-perfect player and running the real classifier over them,
// `sharpBy` credited every elimination rung (pointing 26, XY-Wing 25, X-Wing 13,
// hidden pair 15) and credited nakedSingle and hiddenSingle exactly zero times.
// That is structural rather than a sampling accident: `justification` answers
// routine or solid for those two and never reaches the branch that names a
// pattern. So a hint is the only per-technique signal a hidden single can
// produce, and one hint would have pinned it at strength zero for good with no
// route back up. Meeting a rung in a game you then finished without asking for
// help is therefore counted too, at a lower weight, and that is the only thing
// that lets the bottom of the ladder recover.

import { TECHNIQUES, LADDER } from '../logic/techniques.js'
import { stuckIn } from './compute.js'
import { drillEncounters } from './drills.js'

const DAY = 86400000

/**
 * How fast one game moves a strength. 0.35 gives 3, 6, 10, 13, 17 day intervals
 * over five clean encounters, which is close to SM-2's own ladder without
 * inheriting its ease factors. Anything much larger and a single bad evening
 * erases a month of evidence.
 */
const ALPHA = 0.35

/**
 * Where a rung starts, the first time it is ever met. Deliberately the middle of
 * the scale, meaning unknown rather than weak.
 *
 * It started at zero, and that was wrong in a way only real games showed. The
 * rare rungs are met two or three times in twenty games, so from a start of zero
 * a player who found four hidden triples unaided and never once needed help
 * still read as 0.58, and the schedule offered to drill the pattern they had
 * just demonstrated. From 0.5 the same player reads 0.79.
 */
const PRIOR = 0.5

/**
 * A game that needed the rung, that you finished, and that you took no hints on
 * counts as evidence, but weaker evidence: the puzzle contained the pattern and
 * you did not ask for help, which is not the same as being seen to use it. At
 * 0.4 it takes roughly seven such games to reach the strength one unaided find
 * buys outright.
 */
const EXPOSURE_WEIGHT = 0.4

/**
 * A finished drill deck counts as direct evidence, at a little over half the
 * weight of a game. It is a fair test of recognition and an easy one: the card
 * tells you which pattern is there, and a game never does. At 0.55 two good
 * decks move a strength about as far as one pattern found unaided in a game.
 */
const DRILL_WEIGHT = 0.55

/**
 * The interval, in days, at each end of the strength scale. Geometric between
 * them, so every step of strength multiplies the wait rather than adding to it,
 * which is the one property of SM-2 worth keeping.
 *
 * The floor is half a day rather than a day on purpose. This app is built around
 * a puzzle a day, so an interval of a full day means a pattern you demonstrably
 * failed this evening is not offered until after your next game, which is one
 * game too late. Half a day puts it in front of you before you play again.
 *
 * Three weeks at the top is deliberately short of unbounded. This is not a deck
 * of ten thousand facts where a year-long interval saves real work: there are
 * eleven schedulable rungs, and asking about a solid one every three weeks costs
 * one line on a screen.
 */
const MIN_DAYS = 0.5
const MAX_DAYS = 21

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x)

/** The wait a strength earns. Exported because the interface should be able to say it. */
export const intervalDays = strength => MIN_DAYS * (MAX_DAYS / MIN_DAYS) ** clamp01(strength)

/**
 * Naked singles are never scheduled. They cost zero in the grader on purpose
 * (see docs/DECISIONS.md: writing a digit that has only one possible value is
 * bookkeeping, not deduction) and they fire in 100% of puzzles at every tier, so
 * a curriculum that could suggest them would suggest them forever.
 */
const NEVER = new Set(['nakedSingle'])

const rungIndex = key => LADDER.indexOf(key)
const at = game => game?.endedAt || game?.startedAt || 0

/**
 * What each rung's history looks like, walked in the order it happened.
 *
 * One encounter per game rather than one per hint. A game is a sitting: three
 * hints on the same pattern inside twenty minutes is one failure to learn it,
 * not three independent reviews, and the raw counts are still reported so the
 * claim can be checked. It also matches what the data can support, since
 * `hintLog` entries carry no timestamp of their own.
 */
function walk(games, drills = []) {
  const state = new Map()
  // Games and drill decks in one timeline, so a deck done between two games
  // lands between them rather than all drills arriving at the end.
  const events = [
    ...(games || []).filter(g => at(g)).map(g => ({ t: at(g), game: g })),
    ...drillEncounters(drills).map(d => ({ t: d.t, drill: d })),
  ].sort((a, b) => a.t - b.t)

  for (const ev of events) {
    if (ev.drill) {
      const d = ev.drill
      if (NEVER.has(d.technique) || !TECHNIQUES[d.technique]) continue
      const rec = state.get(d.technique) || blank()
      rec.strength += ALPHA * DRILL_WEIGHT * (d.outcome - rec.strength)
      rec.decks++
      rec.drillRight += d.right
      rec.drillAsked += d.asked
      rec.lastSeen = d.t
      state.set(d.technique, rec)
      continue
    }
    const g = ev.game
    // What stopped you, by the pattern the position needed. This read the
    // hint log until v3.4.0, which labels a hint by the single it filled in:
    // an XY-Wing you could not find went down as a naked single you could not
    // find, and wrong digits at a hard spot counted for nothing at all. On real
    // games that rated XY-Wing 0.90 for someone who had never found one.
    const hinted = stuckIn(g)
    // `sharpBy` sometimes names a rung the grader's own solve path never needed,
    // because the classifier asks what proved this cell rather than what the
    // cheapest solve used. That is the same definition the coach already reports
    // as your strongest pattern, and one definition of "you spotted it" is worth
    // more here than a second, tidier one.
    const sharp = g.summary?.sharpBy || {}
    const required = g.techniques || {}

    for (const key of new Set([...Object.keys(hinted), ...Object.keys(sharp), ...Object.keys(required)])) {
      if (NEVER.has(key) || !TECHNIQUES[key]) continue

      const stuck = hinted[key] || 0
      const unaided = sharp[key] || 0
      const direct = stuck > 0 || unaided > 0

      // A puzzle you walked away from proves nothing about a pattern that was in
      // it: you may never have reached the cell. Direct evidence still counts,
      // because a hint you took is a hint you took whether or not you finished.
      if (!direct && !(required[key] && g.completed)) continue

      const rec = state.get(key) || blank()
      const outcome = direct ? unaided / (unaided + stuck) : 1
      const weight = direct ? 1 : EXPOSURE_WEIGHT

      rec.strength += ALPHA * weight * (outcome - rec.strength)
      rec.games++
      rec.stuck += stuck
      rec.unaided += unaided
      rec.lastSeen = at(g)
      state.set(key, rec)
    }
  }
  return state
}

const blank = () => ({ strength: PRIOR, games: 0, stuck: 0, unaided: 0, lastSeen: 0, decks: 0, drillRight: 0, drillAsked: 0 })

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Not "today": a game 23 hours ago was yesterday evening as often as not, and
// the elapsed time is the thing being reported rather than the calendar day.
const agoWords = days =>
  days < 1 ? 'less than a day ago' : days < 2 ? 'yesterday' : `${Math.round(days)} days ago`

/** Intervals run from half a day to three weeks, and "every 0.5 days" reads as badly as "every 21 days". */
const everyWords = days => {
  if (days < 0.75) return 'wants another look the same day'
  if (days < 1.5) return 'wants a look every day'
  if (days < 11) return `wants a look every ${Math.round(days)} days`
  return `wants a look every ${Math.round(days / 7)} weeks`
}

/** Every claim states the sample it rests on, the same bar the coach holds to. */
function reasonFor({ stuck, unaided, games, decks, drillRight, drillAsked, ago, dueNow, interval, dueIn }) {
  let fromGames
  if (!games && decks) fromGames = 'Not met in a game yet.'
  else if (stuck && unaided) {
    fromGames = `Stopped you ${plural(stuck, 'time')} against ${unaided} found unaided, across ${plural(games, 'game')} with it.`
  } else if (stuck) {
    fromGames = `Stopped you ${plural(stuck, 'time')} and never found unaided, across ${plural(games, 'game')} with it.`
  } else if (unaided) {
    fromGames = `Found unaided ${plural(unaided, 'time')} across ${plural(games, 'game')} with it, and it never stopped you.`
  } else fromGames = `${plural(games, 'finished game')} needed it and it never stopped you.`
  // A drill deck is its own evidence and says so, rather than being folded
  // into the game counts where it could pass for a game.
  const drilled = decks ? ` Drilled ${plural(decks, 'deck')}, ${drillRight} of ${drillAsked} right.` : ''
  const evidence = fromGames + drilled

  const timing = dueNow
    ? `Last met ${ago}, and at this strength it ${everyWords(interval)}.`
    : `Last met ${ago}, next due in ${dueIn === 1 ? 'a day' : `${dueIn} days`}.`

  return `${evidence} ${timing}`
}

/**
 * Four bands rather than a continuous number, because the ordering compares
 * strengths that differ by hundredths and a hundredth of a strength is not a
 * real difference in how well someone knows a pattern.
 */
const bandOf = strength => (strength < 0.3 ? 0 : strength < 0.6 ? 1 : strength < 0.85 ? 2 : 3)

/** A word for the number, defined once so two screens cannot define it twice. */
export const strengthLabel = strength => ['shaky', 'settling', 'steady', 'solid'][bandOf(strength)]

/**
 * Every rung this player has actually met, most due first.
 *
 * A rung with no exposure at all is absent rather than last: suggesting a
 * Swordfish to somebody whose puzzles have never contained one is inventing a
 * lesson, and 72 generated puzzles contained none.
 *
 * The ordering was wrong on its first run against real games, which is the
 * reason it is spelled out below rather than being a one-line sort. Ranking
 * purely by how far past due a rung was put an X-Wing that two puzzles happened
 * to contain ahead of a pointing pair that had been hinted 57 times, because the
 * pointing pair had been met yesterday and so was technically not yet due. Being
 * overdue is a poor proxy for being weak.
 *
 * So the list is three groups in order, and `group` says which:
 *
 *   due      past its date and with something on the record to act on
 *   waiting  known, not due yet
 *   thin     met, but never hinted and never credited to you unaided
 *
 * Within a group: weakest band first, then most overdue, then the cheaper rung.
 * Bands rather than raw strength, because two hundredths apart is not a real
 * difference in how well somebody knows a pattern.
 */
export function schedule(games, { now = Date.now(), drills = [] } = {}) {
  const out = []

  for (const [technique, rec] of walk(games, drills)) {
    const interval = intervalDays(rec.strength)
    const intervalMs = interval * DAY
    const due = rec.lastSeen + intervalMs
    const sinceMs = Math.max(0, now - rec.lastSeen)
    const urgency = sinceMs / intervalMs
    const dueNow = now >= due

    // Thin means the app has never seen this pattern beat you or be spotted by
    // you: every game it appeared in, it appeared only in the grader's own solve
    // path. That is a record of what the puzzles contained, not of what you can
    // do, and it is not enough to build a drill on. It still moves the strength,
    // which is what lets a hidden single climb back out of a hint.
    const thin = rec.stuck === 0 && rec.unaided === 0 && rec.decks === 0

    out.push({
      technique,
      label: TECHNIQUES[technique].label,
      strength: rec.strength,
      due,
      lastSeen: rec.lastSeen,
      reason: reasonFor({
        stuck: rec.stuck,
        unaided: rec.unaided,
        games: rec.games,
        decks: rec.decks,
        drillRight: rec.drillRight,
        drillAsked: rec.drillAsked,
        ago: agoWords(sinceMs / DAY),
        dueNow,
        interval,
        dueIn: Math.max(1, Math.round((due - now) / DAY)),
      }),
      dueNow,
      thin,
      group: thin ? 'thin' : dueNow ? 'due' : 'waiting',
      urgency,
      band: bandOf(rec.strength),
      intervalDays: Math.round(interval * 10) / 10,
      games: rec.games,
      stuck: rec.stuck,
      unaided: rec.unaided,
      decks: rec.decks,
      sample: rec.decks
        ? `${plural(rec.games, 'game')} with it, ${plural(rec.decks, 'drill deck')}`
        : `${plural(rec.games, 'game')} with it`,
    })
  }

  const GROUPS = { due: 0, waiting: 1, thin: 2 }
  return out.sort(
    (a, b) =>
      GROUPS[a.group] - GROUPS[b.group] ||
      a.band - b.band ||
      b.urgency - a.urgency ||
      rungIndex(a.technique) - rungIndex(b.technique)
  )
}

/**
 * The one to drill next, or null when nothing has earned a suggestion.
 *
 * Null is a real answer and the interface should say so rather than reaching for
 * whatever is top of the list. If every pattern you have met is fresher than its
 * own interval then playing is the practice, and there is nothing to add.
 */
export function nextUp(games, { now = Date.now(), drills = [] } = {}) {
  return schedule(games, { now, drills }).find(x => x.group === 'due') || null
}

/**
 * What to say when `nextUp` returns null, in the coach's voice: name what is
 * missing rather than showing an empty panel.
 */
export function nothingDue(games, { now = Date.now(), drills = [] } = {}) {
  const all = schedule(games, { now, drills })
  if (!all.length) {
    return 'Nothing is scheduled yet. This tracks only the patterns your own puzzles have actually contained, so it fills in as you play.'
  }

  const real = all.filter(x => !x.thin)
  if (!real.length) {
    return `Nothing to drill yet. Your puzzles have needed ${plural(all.length, 'pattern')} so far and not one of them has stopped you or been credited to you unaided, which is all there would be to schedule against.`
  }

  const waiting = real.filter(x => !x.dueNow).sort((a, b) => a.due - b.due)[0]
  if (!waiting) return 'Nothing is due.'

  const days = Math.max(1, Math.round((waiting.due - now) / DAY))
  return `Nothing is due. Everything you have met is fresher than its own interval, so playing is the practice right now. Next up is the ${waiting.label}, in ${days === 1 ? 'a day' : `${days} days`}.`
}
