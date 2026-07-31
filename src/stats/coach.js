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
import { byTier, hintsByTechnique, mistakeBoxes, pace, median } from './compute.js'

const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0)

/** Technique labels are lower case by design; titles are not. */
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1)

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
    title: `${sentence(TECHNIQUES[key].label)} is your weak spot`,
    body: `${share}% of your hints (${n} of ${total}) were on a ${TECHNIQUES[key].label}. That is the pattern to learn next: when you get stuck, look for it before reaching for the bulb.`,
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

const BUILDERS = [hintWeakness, mistakeShape, paceShape, pencilDiscipline, tierReadiness, timeOfDay, boxBias]

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
