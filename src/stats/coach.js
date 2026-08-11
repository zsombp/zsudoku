// The coach: recommendations derived from what the puzzles required, what you
// actually did, and where the time went.
//
// Two rules govern everything here.
//
// 1. Nothing appears without enough data behind it. Telling someone they are
//    weak on Swordfish after two games is noise dressed as insight. Every
//    insight declares its own threshold and reports the sample it used, so a
//    claim can always be checked rather than taken on faith.
// 2. Every insight says what to do about it. A dashboard of observations nobody
//    can act on is decoration.

import { TIERS } from '../logic/difficulty.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { fmtMs } from '../lib/format.js'
import {
  byTier,
  hintsByTechnique,
  mistakeBoxes,
  pace,
  median,
  judgment,
  tilt,
  improvement,
  sessionFatigue,
} from './compute.js'

const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0)

/** Technique labels are lower case by design; titles are not. */
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * "an X-Wing", not "a X-Wing". X is the only letter in the ladder that is
 * spelled with a consonant and said with a vowel.
 */
const an = word => (/^[aeiou]/i.test(word) || /^x/i.test(word) ? 'an' : 'a')

/** Hints cluster on one technique: that is the pattern you are not spotting. */
function hintWeakness(games) {
  const MIN = 5
  const { counts, total } = hintsByTechnique(games)
  if (total < MIN) return null

  const ranked = Object.entries(counts)
    .filter(([k]) => k !== 'unknown' && TECHNIQUES[k])
    .sort((a, b) => b[1] - a[1])
  if (!ranked.length) return null

  const [key, n] = ranked[0]
  const share = pctOf(n, total)
  if (share < 35) {
    return {
      id: 'hints-spread',
      title: 'Your hints are spread evenly',
      body: `No single pattern dominates: ${total} hints across ${ranked.length} techniques. That usually means you are reaching for hints out of impatience rather than because a particular pattern defeats you.`,
      sample: `${total} hints`,
    }
  }
  return {
    id: 'hints-technique',
    // The whole point of naming it is being able to act on it.
    practice: key,
    title: `${sentence(TECHNIQUES[key].label)} is your weak spot`,
    body: `${share}% of your hints (${n} of ${total}) were on ${an(TECHNIQUES[key].label)} ${TECHNIQUES[key].label}. That is the pattern to learn next: when you get stuck, look for it before reaching for the bulb.`,
    sample: `${total} hints`,
  }
}

/** Errors clustered in the endgame mean fatigue; in the opening, misreading. */
function mistakeShape(games) {
  const MIN = 8
  const p = pace(games)
  const totalMistakes = p.parts.reduce((a, x) => a + x.mistakes, 0)
  if (p.sample < 5 || totalMistakes < MIN) return null

  const worst = [...p.parts].sort((a, b) => b.mistakes - a.mistakes)[0]
  const share = pctOf(worst.mistakes, totalMistakes)
  if (share < 45) return null

  const advice = {
    opening: 'Opening mistakes usually mean misreading a given or a rushed first scan. Slow down for the first dozen placements.',
    middle: 'Middle-game mistakes tend to come from stale pencil marks. Try auto notes when the board stops being obvious.',
    endgame: 'Endgame mistakes are almost always haste. The auto-complete button appears at 12 cells left for exactly this reason.',
  }[worst.part]

  return {
    id: 'mistake-shape',
    title: `Most of your mistakes land in the ${worst.part}`,
    body: `${share}% of your wrong placements (${worst.mistakes} of ${totalMistakes}). ${advice}`,
    sample: `${p.sample} games`,
  }
}

/** Where the clock actually goes. */
function paceShape(games) {
  const p = pace(games)
  if (p.sample < 5) return null
  const parts = p.parts.filter(x => x.moves > 0)
  if (parts.length < 3) return null

  const slowest = [...parts].sort((a, b) => b.msPerMove - a.msPerMove)[0]
  const fastest = [...parts].sort((a, b) => a.msPerMove - b.msPerMove)[0]
  if (!fastest.msPerMove) return null
  const ratio = slowest.msPerMove / fastest.msPerMove
  if (ratio < 1.6) return null

  return {
    id: 'pace',
    title: `The ${slowest.part} is where your time goes`,
    body: `${(slowest.msPerMove / 1000).toFixed(1)}s per placement there against ${(fastest.msPerMove / 1000).toFixed(1)}s in the ${fastest.part}, ${ratio.toFixed(1)} times slower. ${
      slowest.part === 'opening'
        ? 'A slow opening is normal: few digits are placeable until the board opens up.'
        : 'Worth a look, because the board should get easier as it fills, not harder.'
    }`,
    sample: `${p.sample} games`,
  }
}

/** Does pencilling actually help this player, at this level? */
function pencilDiscipline(games) {
  const MIN = 8
  const done = games.filter(g => g.completed && g.moveLog?.length)
  if (done.length < MIN) return null

  const withUse = done.map(g => {
    const marks = g.moveLog.filter(m => m.kind === 'pencil').length
    const auto = g.moveLog.some(m => m.kind === 'autoPencil')
    return { g, uses: marks + (auto ? 30 : 0) }
  })
  const cutoff = median(withUse.map(x => x.uses))
  const heavy = withUse.filter(x => x.uses > cutoff).map(x => x.g)
  const light = withUse.filter(x => x.uses <= cutoff).map(x => x.g)
  if (heavy.length < 3 || light.length < 3) return null

  const errs = list => list.reduce((a, g) => a + g.mistakes, 0) / list.length
  const heavyErr = errs(heavy)
  const lightErr = errs(light)
  if (Math.abs(heavyErr - lightErr) < 0.4) return null

  const helps = heavyErr < lightErr
  return {
    id: 'pencil',
    title: helps ? 'Pencil marks are earning their keep' : 'Pencilling is not reducing your mistakes',
    body: helps
      ? `Games where you pencilled more averaged ${heavyErr.toFixed(1)} mistakes against ${lightErr.toFixed(1)} when you pencilled less. Keep doing it.`
      : `Games where you pencilled more averaged ${heavyErr.toFixed(1)} mistakes against ${lightErr.toFixed(1)} when you pencilled less. The marks may be going stale: they only help if you keep them current as you place.`,
    sample: `${heavy.length} heavy vs ${light.length} light games`,
  }
}

/** Ready for the tier above? Criteria stated, so it is not a black box. */
function tierReadiness(games) {
  const tiers = byTier(games)
  for (let i = 0; i < tiers.length - 1; i++) {
    const t = tiers[i]
    if (t.completed < 6) continue
    const winRate = t.played ? t.completed / t.played : 0
    if (winRate < 0.8 || t.mistakes > 1) continue

    const next = tiers[i + 1]
    if (next.completed >= 3) continue

    return {
      id: 'readiness',
      title: `You are ready for ${next.tier}`,
      body: `You have finished ${t.completed} of ${t.played} ${t.tier} puzzles at ${t.mistakes.toFixed(1)} mistakes each, median ${fmtMs(t.medianMs)}. The bar for this suggestion is six completed, an 80% finish rate and under one mistake a game. ${next.tier} adds ${TIERS[i + 1].tech}.`,
      sample: `${t.completed} ${t.tier} games`,
    }
  }
  return null
}

/** Does the hour genuinely matter, or does it just feel like it does? */
function timeOfDay(games) {
  const MIN = 12
  const done = games.filter(g => g.completed)
  if (done.length < MIN) return null

  const bands = [
    { name: 'morning', from: 5, to: 12 },
    { name: 'afternoon', from: 12, to: 18 },
    { name: 'evening', from: 18, to: 23 },
    { name: 'late night', from: 23, to: 5 },
  ]
  const scored = bands
    .map(b => {
      const inBand = done.filter(g => {
        const h = new Date(g.endedAt).getHours()
        return b.from < b.to ? h >= b.from && h < b.to : h >= b.from || h < b.to
      })
      return { ...b, games: inBand, mistakes: inBand.length ? inBand.reduce((a, g) => a + g.mistakes, 0) / inBand.length : 0 }
    })
    .filter(b => b.games.length >= 4)

  if (scored.length < 2) return null
  const best = [...scored].sort((a, b) => a.mistakes - b.mistakes)[0]
  const worst = [...scored].sort((a, b) => b.mistakes - a.mistakes)[0]
  if (worst.mistakes - best.mistakes < 0.5) {
    return {
      id: 'time-of-day-flat',
      title: 'The hour does not seem to matter',
      body: `Across ${scored.map(b => b.name).join(', ')} your mistake rate is within half a mistake a game. Play whenever suits you.`,
      sample: `${done.length} games`,
    }
  }
  return {
    id: 'time-of-day',
    title: `You play best in the ${best.name}`,
    body: `${best.mistakes.toFixed(1)} mistakes a game in the ${best.name} against ${worst.mistakes.toFixed(1)} in the ${worst.name}, across ${best.games.length} and ${worst.games.length} games.`,
    sample: `${done.length} games`,
  }
}

/** Errors piling into one box is a scanning habit, not bad luck. */
function boxBias(games) {
  const { boxes, total } = mistakeBoxes(games)
  if (total < 12) return null
  const max = Math.max(...boxes)
  const idx = boxes.indexOf(max)
  const share = pctOf(max, total)
  if (share < 25) return null

  const bands = ['top', 'middle', 'bottom']
  const stacks = ['left', 'centre', 'right']
  const name = `${bands[Math.floor(idx / 3)]} ${stacks[idx % 3]}`
  return {
    id: 'box-bias',
    title: `Your mistakes cluster in the ${name} box`,
    body: `${share}% of your wrong placements (${max} of ${total}) landed there, where an even spread would be about 11%. Usually a scanning blind spot rather than a hard box.`,
    sample: `${total} mistakes`,
  }
}

const BUILDERS = [
  // The nemesis leads when it fires at all: a pattern that has beaten you for
  // weeks outranks anything measured this session.
  nemesis,
  // Then the judgment insights: they are the only ones that speak to whether a
  // move was earned, which every other statistic here is blind to.
  guessRate,
  tiltInsight,
  improving,
  fatigue,
  scanningStalls,
  patternStrength,
  missedEasy,
  hintWeakness,
  mistakeShape,
  paceShape,
  pencilDiscipline,
  tierReadiness,
  timeOfDay,
  boxBias,
]

/**
 * All insights that currently have enough behind them.
 *
 * `needed` is what is still missing when nothing qualifies, so an empty coach
 * says how to fill it rather than just looking broken.
 */
export function insights(games) {
  const out = []
  for (const build of BUILDERS) {
    try {
      const insight = build(games)
      if (insight) out.push(insight)
    } catch {
      /* an insight that throws is skipped, never fatal */
    }
  }
  return out
}

export function needed(games) {
  const done = games.filter(g => g.completed).length
  if (done < 5) return `Finish ${5 - done} more ${5 - done === 1 ? 'game' : 'games'} and the coach starts having something to say.`
  if (done < 12) return `${12 - done} more finished games unlocks the time-of-day and pencil analysis.`
  return 'Keep playing: the remaining insights need more mistakes and hints to look at than you have made.'
}

/**
 * How much of your play is actually justified by the board.
 *
 * The single most useful number the review produces, and until now it evaporated
 * when you closed the review. A guess that happens to be right looks exactly
 * like a deduction in every other statistic in this app.
 */
function guessRate(games) {
  const MIN = 8
  const j = judgment(games)
  if (j.sample < MIN || j.total.placements < 200) return null

  const lucky = j.counts.lucky || 0
  const share = pctOf(lucky, j.total.placements)
  if (share < 6) {
    return {
      id: 'justified',
      title: 'You place digits you can prove',
      body: `Only ${share}% of your placements went in before the board proved them, across ${j.total.placements} moves. That is the habit that stops a hard grid falling apart in the endgame.`,
      sample: `${j.sample} games`,
    }
  }

  // Where it happens matters more than that it happens.
  const tiers = Object.entries(j.byTier)
    .filter(([, t]) => t.placements >= 60)
    .map(([name, t]) => ({ name, share: pctOf(t.lucky, t.placements) }))
    .sort((a, b) => b.share - a.share)
  const worst = tiers[0]

  return {
    id: 'guess-rate',
    title: `${share}% of your placements are guesses that worked`,
    body: `${lucky} of ${j.total.placements} moves went in before anything on the board proved them.${
      worst && tiers.length > 1 ? ` It is worst at ${worst.name}, at ${worst.share}%.` : ''
    } They are not mistakes, but a guess and a deduction look identical in every other statistic here, and only one of them keeps working as the grids get harder.`,
    sample: `${j.sample} games`,
  }
}

/** Patterns you find unaided, against the ones you spend hints on. */
function patternStrength(games) {
  const j = judgment(games)
  const { counts: hintCounts, total: hintTotal } = hintsByTechnique(games)
  const found = Object.entries(j.sharpBy).sort((a, b) => b[1] - a[1])
  if (j.sample < 8 || !found.length || hintTotal < 5) return null

  const [bestKey, bestN] = found[0]
  const hintedOn = hintCounts[bestKey] || 0

  // The interesting case: a pattern you can clearly find, that you still reach
  // for the bulb on.
  if (hintedOn >= 3 && bestN >= 3) {
    return {
      id: 'pattern-impatience',
      practice: bestKey,
      title: `You can find ${an(TECHNIQUES[bestKey].label)} ${TECHNIQUES[bestKey].label}, when you look`,
      body: `You spotted ${bestN} unaided, and took ${hintedOn} hints on the same pattern. That is not a gap in what you know, it is reaching for the bulb before finishing the scan.`,
      sample: `${j.sample} games`,
    }
  }

  return {
    id: 'pattern-strength',
    title: `${sentence(TECHNIQUES[bestKey].label)} is your strongest pattern`,
    body: `You have found it unaided ${bestN} ${bestN === 1 ? 'time' : 'times'}${
      found.length > 1 ? `, more than any other pattern you spot` : ''
    }. Worth knowing which tools you actually reach for when a grid stops being obvious.`,
    sample: `${j.sample} games`,
  }
}

/** Long pauses that ended in a move which had been available all along. */
function scanningStalls(games) {
  const j = judgment(games)
  if (j.sample < 8 || j.total.placements < 200) return null
  const per = j.total.slowEasy / j.sample
  if (per < 1) return null

  return {
    id: 'scanning-stalls',
    title: 'Your long pauses usually end in an easy move',
    body: `${j.total.slowEasy} times across ${j.sample} games, about ${per.toFixed(1)} a game, you thought for a long stretch and then played something that was a lone candidate or the only home for its digit the whole time. That is a scanning habit rather than a hard puzzle, and auto notes are the cheapest fix for it.`,
    sample: `${j.sample} games`,
  }
}

/** How often something easier was sitting there while you did something else. */
function missedEasy(games) {
  const j = judgment(games)
  if (j.sample < 8 || j.total.placements < 200) return null
  const share = pctOf(j.total.missed, j.total.placements)
  if (share < 12) return null

  return {
    id: 'missed-easy',
    title: `An easier move was available ${share}% of the time`,
    body: `In ${j.total.missed} of ${j.total.placements} placements, the board was offering something simpler somewhere else. Working the whole grid rather than the corner you are looking at is usually faster than solving the corner.`,
    sample: `${j.sample} games`,
  }
}

/** Does a mistake make the next few minutes worse, for this person? */
function tiltInsight(games) {
  const t = tilt(games)
  if (!t) return null
  const after = t.afterRate * 100
  const rest = t.restRate * 100
  const ratio = t.restRate ? t.afterRate / t.restRate : 0

  if (ratio < 1.4) {
    return {
      id: 'tilt-steady',
      title: 'A mistake does not rattle you',
      body: `In the five minutes after a wrong digit you are wrong ${after.toFixed(1)}% of the time, against ${rest.toFixed(1)}% otherwise. That is the same within noise, which is worth knowing: the usual advice to stop after an error does not apply to you.`,
      sample: `${t.sample} games with mistakes in them`,
    }
  }
  return {
    id: 'tilt',
    title: 'Mistakes come in clusters for you',
    body: `In the five minutes after a wrong digit you are wrong ${after.toFixed(1)}% of the time, against ${rest.toFixed(1)}% otherwise, which is ${ratio.toFixed(1)} times worse. The first error is ordinary; the ones that follow it are the ones to stop and avoid. Pausing after a mistake is worth more to you than to most people.`,
    sample: `${t.sample} games with mistakes in them`,
  }
}

/** Getting better, or drifting toward easier puzzles? */
function improving(games) {
  const imp = improvement(games)
  if (!imp) return null
  const pct = Math.abs(imp.overall * 100)
  if (pct < 8) {
    return {
      id: 'improving-flat',
      title: 'Your times have levelled off',
      body: `Comparing the first half of your games against the second, within each tier so a drift toward easier puzzles cannot flatter the answer, you are within ${pct.toFixed(0)}% of where you started. Levelling off is what happens when the assists are doing the work that used to be practice.`,
      sample: `${imp.sample} finished games`,
    }
  }
  const better = imp.overall < 0
  const best = imp.tiers[0]
  return {
    id: 'improving',
    title: better ? `You are ${pct.toFixed(0)}% faster than you were` : `You are ${pct.toFixed(0)}% slower than you were`,
    body: `Measured within each tier, so playing easier puzzles cannot masquerade as progress. ${
      better
        ? `The biggest gain is at ${best.tier}, from ${fmtMs(best.early)} to ${fmtMs(best.late)}.`
        : `That is usually harder puzzles rather than worse play, but the comparison already controls for tier, so it is worth a look at whether you are playing tired.`
    }`,
    sample: `${imp.sample} finished games`,
  }
}

/** Does a long sitting cost accuracy? */
function fatigue(games) {
  const f = sessionFatigue(games)
  if (!f) return null
  const first = f[0]
  const last = f[f.length - 1]
  const rise = last.mistakes - first.mistakes
  if (rise < 0.5) return null

  return {
    id: 'fatigue',
    title: 'Your accuracy falls off within a sitting',
    body: `The ${first.name} game of a session averages ${first.mistakes.toFixed(1)} mistakes, the ${last.name} averages ${last.mistakes.toFixed(1)}. Games within three quarters of an hour of each other count as one sitting. Two or three is apparently your limit before it stops being practice.`,
    sample: `${f.reduce((a, b) => a + b.count, 0)} games across sessions`,
  }
}

/**
 * The one pattern that keeps winning, tracked over time rather than reported
 * fresh each visit.
 *
 * The difference from `hintWeakness` is memory. That one names whatever is
 * worst today; this one only speaks when the same rung has been the worst for
 * long enough to be a standing problem rather than a bad week, and it escalates
 * rather than repeating itself.
 */
function nemesis(games) {
  const MIN = 10
  const recent = games.filter(g => g.hintLog?.length).slice(-40)
  if (recent.length < 6) return null

  const half = Math.floor(recent.length / 2)
  const countIn = list => {
    const counts = {}
    for (const g of list) for (const h of g.hintLog || []) {
      if (h.technique && TECHNIQUES[h.technique]) counts[h.technique] = (counts[h.technique] || 0) + 1
    }
    return counts
  }
  const early = countIn(recent.slice(0, half))
  const late = countIn(recent.slice(half))
  const total = countIn(recent)

  const ranked = Object.entries(total).sort((a, b) => b[1] - a[1])
  if (!ranked.length || ranked[0][1] < MIN) return null
  const [key, n] = ranked[0]

  // Standing, not passing: worst in both halves of the recent history.
  const worstEarly = Object.entries(early).sort((a, b) => b[1] - a[1])[0]?.[0]
  const worstLate = Object.entries(late).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (worstEarly !== key || worstLate !== key) return null

  const gettingWorse = (late[key] || 0) >= (early[key] || 0)
  return {
    id: 'nemesis',
    practice: key,
    title: `${sentence(TECHNIQUES[key].label)} has beaten you ${n} times now`,
    body: `It has been your worst pattern across both halves of your recent games, ${early[key] || 0} hints then and ${late[key] || 0} since. ${
      gettingWorse
        ? 'It is not getting better on its own, and it will not: the hint fills the cell and moves on without ever making you find one.'
        : 'It is easing, but it is still the one that costs you most.'
    } Drill it deliberately rather than meeting it by accident.`,
    sample: `${recent.length} recent games with hints`,
  }
}
