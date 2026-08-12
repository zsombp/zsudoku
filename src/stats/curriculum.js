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
function walk(games) {
  const state = new Map()
  const ordered = (games || []).filter(g => at(g)).sort((a, b) => at(a) - at(b))

  for (const g of ordered) {
    const hinted = {}
    for (const h of g.hintLog || []) {
      if (h?.technique) hinted[h.technique] = (hinted[h.technique] || 0) + 1
    }
    // `sharpBy` sometimes names a rung the grader's own solve path never needed,
    // because the classifier asks what proved this cell rather than what the
    // cheapest solve used. That is the same definition the coach already reports
    // as your strongest pattern, and one definition of "you spotted it" is worth
    // more here than a second, tidier one.
    const sharp = g.summary?.sharpBy || {}
    const required = g.techniques || {}

    for (const key of new Set([...Object.keys(hinted), ...Object.keys(sharp), ...Object.keys(required)])) {
      if (NEVER.has(key) || !TECHNIQUES[key]) continue

      const hints = hinted[key] || 0
      const unaided = sharp[key] || 0
      const direct = hints > 0 || unaided > 0

      // A puzzle you walked away from proves nothing about a pattern that was in
      // it: you may never have reached the cell. Direct evidence still counts,
      // because a hint you took is a hint you took whether or not you finished.
      if (!direct && !(required[key] && g.completed)) continue

      const rec = state.get(key) || { strength: PRIOR, games: 0, hints: 0, unaided: 0, lastSeen: 0 }
      const outcome = direct ? unaided / (unaided + hints) : 1
      const weight = direct ? 1 : EXPOSURE_WEIGHT

      rec.strength += ALPHA * weight * (outcome - rec.strength)
      rec.games++
      rec.hints += hints
      rec.unaided += unaided
      rec.lastSeen = at(g)
      state.set(key, rec)
    }
  }
  return state
}

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
function reasonFor({ hints, unaided, games, ago, dueNow, interval, dueIn }) {
  const evidence =
    hints && unaided
      ? `${plural(hints, 'hint')} against ${unaided} you found unaided, across ${plural(games, 'game')} with it.`
      : hints
        ? `${plural(hints, 'hint')} on it and nothing found unaided, across ${plural(games, 'game')} with it.`
        : unaided
          ? `Found unaided ${plural(unaided, 'time')} across ${plural(games, 'game')} with it, never hinted.`
          : `${plural(games, 'finished game')} needed it and you took no hints on it.`

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
export function schedule(games, { now = Date.now() } = {}) {
  const out = []

  for (const [technique, rec] of walk(games)) {
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
    const thin = rec.hints === 0 && rec.unaided === 0

    out.push({
      technique,
      label: TECHNIQUES[technique].label,
      strength: rec.strength,
      due,
      lastSeen: rec.lastSeen,
      reason: reasonFor({
        hints: rec.hints,
        unaided: rec.unaided,
        games: rec.games,
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
      hints: rec.hints,
      unaided: rec.unaided,
      sample: `${plural(rec.games, 'game')} with it`,
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
export function nextUp(games, { now = Date.now() } = {}) {
  return schedule(games, { now }).find(x => x.group === 'due') || null
}

/**
 * What to say when `nextUp` returns null, in the coach's voice: name what is
 * missing rather than showing an empty panel.
 */
export function nothingDue(games, { now = Date.now() } = {}) {
  const all = schedule(games, { now })
  if (!all.length) {
    return 'Nothing is scheduled yet. This tracks only the patterns your own puzzles have actually contained, so it fills in as you play.'
  }

  const real = all.filter(x => !x.thin)
  if (!real.length) {
    return `Nothing to drill yet. Your puzzles have needed ${plural(all.length, 'pattern')} so far and not one of them has cost you a hint or been credited to you unaided, which is all there would be to schedule against.`
  }

  const waiting = real.filter(x => !x.dueNow).sort((a, b) => a.due - b.due)[0]
  if (!waiting) return 'Nothing is due.'

  const days = Math.max(1, Math.round((waiting.due - now) / DAY))
  return `Nothing is due. Everything you have met is fresher than its own interval, so playing is the practice right now. Next up is the ${waiting.label}, in ${days === 1 ? 'a day' : `${days} days`}.`
}
