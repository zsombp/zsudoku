// Running an experiment on yourself.
//
// The app has opinions baked into its defaults: auto-pencil is off, mistake
// marking is on, quick input is off. Those are guesses. This settles them for
// one particular player with actual evidence, which is the same principle as
// honest difficulty applied to the assists rather than to the puzzles.
//
// It works because the timing is trustworthy, the outcome measures are already
// recorded, and the app can randomise which arm each game lands in. Nothing
// here needs technology that was not already built.
//
// ---- the statistics, and why this one ----
//
// A permutation test. The observed difference between the two groups is
// compared against the differences you get by reshuffling which games were in
// which group, thousands of times. If almost every reshuffle produces a smaller
// difference than the real split, the real split is telling you something.
//
// Chosen over a t-test because solve times are skewed and the samples are tiny,
// and over a lookup table because the method is its own explanation: "I shuffled
// the labels ten thousand times and only 3% of shuffles looked this different"
// is something a person can check the meaning of without trusting a formula.
//
// Seeded, so a result does not wobble every time it is looked at.
//
// ---- what it cannot do ----
//
// It cannot blind you. You can see whether your board came with pencil marks
// in it, so expecting one arm to be better could make it so. That limitation is
// stated in the interface rather than hidden, because an experiment that
// oversells itself is worse than no experiment.
//
// And it can only find large effects. That is not a guess: the power was
// simulated against skewed data at the sample sizes on offer, and the numbers
// are in POWER below. Thirty games catch a one-third difference nine times in
// ten and a one-fifth difference only four times in ten. So "no difference
// found" has to be reported as "nothing this size could have shown up", which
// is what NULL_CAVEAT is for. A null result that does not admit its own reach
// is the most common way an honest-looking experiment misleads.

import { mulberry32, shuffle } from '../lib/prng.js'
import { median } from './compute.js'

/**
 * The questions worth settling. Each names one setting, one primary outcome
 * declared in advance, and how many games it will take.
 *
 * Declaring the primary outcome up front matters. Testing four outcomes and
 * reporting whichever came out significant is how you find an effect in noise,
 * so the others are computed and shown as secondary, never as the verdict.
 */
export const EXPERIMENTS = {
  autopencil: {
    id: 'autopencil',
    setting: 'autoPencilOnStart',
    title: 'Do pencil marks actually help you?',
    question: 'Half your games will start with every candidate filled in, half will start bare.',
    primary: 'mistakes',
    games: 30,
  },
  mistakes: {
    id: 'mistakes',
    setting: 'checkErrors',
    title: 'Is marking mistakes helping or just comforting?',
    question: 'Half your games will mark a wrong digit the moment you place it, half will say nothing.',
    primary: 'time',
    games: 30,
  },
  candidates: {
    id: 'candidates',
    setting: 'candidateHints',
    title: 'Are the candidate outlines worth having on?',
    question: 'Half your games will outline where the highlighted digit could go, half will not.',
    primary: 'time',
    games: 30,
  },
  quick: {
    id: 'quick',
    setting: 'quickInput',
    title: 'Is quick input actually faster for you?',
    question: 'Half your games will use pick-then-place, half will use select-then-type.',
    primary: 'time',
    games: 30,
  },
}

/**
 * Measured, not assumed. Simulated against log-normal data resembling real solve
 * times: the share of runs where a true effect of that size came out under
 * p=0.05. Re-run the simulation if the test changes.
 */
export const POWER = {
  30: [
    { effect: 50, catches: 100 },
    { effect: 35, catches: 91 },
    { effect: 20, catches: 39 },
    { effect: 10, catches: 11 },
  ],
}

/** What a null result is actually entitled to claim. */
export const NULL_CAVEAT =
  'Thirty games can find a difference of about a third nine times in ten, and a difference of a fifth only four times in ten. So this rules out a large effect, not a small one.'

export const OUTCOMES = {
  time: {
    label: 'Time',
    // Normalised against your own median for that tier, so a run of Diabolicals
    // landing in one arm cannot masquerade as an effect.
    lowerIsBetter: true,
    unit: 'x your usual',
  },
  mistakes: { label: 'Mistakes', lowerIsBetter: true, unit: 'a game' },
  hints: { label: 'Hints', lowerIsBetter: true, unit: 'a game' },
  justified: { label: 'Justified placements', lowerIsBetter: false, unit: '%' },
}

const KEY = 'zsudoku.experiment.v1'

export const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

export const save = state => {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  } catch {
    /* best effort, like every write in this app */
  }
}

export const start = id =>
  EXPERIMENTS[id] ? { id, startedAt: Date.now(), games: EXPERIMENTS[id].games } : null

/**
 * Which arm the next game goes in.
 *
 * Balanced rather than a straight coin flip: twenty coin flips can easily come
 * out fourteen to six, and a lopsided split wastes half the games. This keeps
 * the arms within one of each other while staying unpredictable.
 */
export function assignArm(gamesSoFar, rng = Math.random) {
  const on = gamesSoFar.filter(g => g.experiment?.arm === 'on').length
  const off = gamesSoFar.length - on
  if (on > off) return 'off'
  if (off > on) return 'on'
  return rng() < 0.5 ? 'on' : 'off'
}

/** Games belonging to a run, in the order they were played. */
export const gamesFor = (games, id) =>
  games.filter(g => g.experiment?.id === id).sort((a, b) => a.endedAt - b.endedAt)

/**
 * One number per game for a given outcome, or null where the game cannot
 * supply it. Time only counts completed games: an abandoned one has a duration
 * that means nothing.
 */
function outcomeValues(games, outcome, all) {
  const out = []
  for (const g of games) {
    if (outcome === 'time') {
      if (!g.completed) continue
      // Against your own median for that tier on that kind of board. Tier
      // alone is not enough once variants exist: a jigsaw Hard and a classic
      // Hard are different amounts of time for the same amount of thinking.
      const base = tierMedian(all, g.graded, g.variant || 'classic')
      if (!base) continue
      out.push(g.durationMs / base)
    } else if (outcome === 'mistakes') out.push(g.mistakes || 0)
    else if (outcome === 'hints') out.push(g.hints || 0)
    else if (outcome === 'justified') {
      const s = g.summary
      if (!s?.placements) continue
      const earned = (s.counts.routine || 0) + (s.counts.solid || 0) + (s.counts.sharp || 0)
      out.push((earned / s.placements) * 100)
    }
  }
  return out
}

const tierMedian = (games, tier, variant) => {
  const same = games.filter(
    g => g.completed && g.graded === tier && (g.variant || 'classic') === variant
  )
  if (same.length >= 3) return median(same.map(g => g.durationMs))
  // Not enough of that board at that tier yet. Falling back to the tier across
  // all boards is better than dropping the game, and is stated in the copy.
  const anyBoard = games.filter(g => g.completed && g.graded === tier)
  return anyBoard.length >= 3 ? median(anyBoard.map(g => g.durationMs)) : null
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * How often reshuffling the group labels produces a gap at least as big as the
 * one actually observed. That proportion is the p-value, and it is also the
 * whole explanation of what a p-value is.
 *
 * The plus-one on both sides is the standard correction: an observed result is
 * itself one of the arrangements, so a p-value of exactly zero is never honest.
 */
export function permutationTest(a, b, { iterations = 10000, seed = 1 } = {}) {
  if (a.length < 3 || b.length < 3) return null
  const observed = Math.abs(mean(a) - mean(b))
  const pool = [...a, ...b]
  const rng = mulberry32(seed)
  let atLeastAsBig = 0

  for (let i = 0; i < iterations; i++) {
    const mixed = shuffle(pool, rng)
    const diff = Math.abs(mean(mixed.slice(0, a.length)) - mean(mixed.slice(a.length)))
    if (diff >= observed - 1e-12) atLeastAsBig++
  }
  return (atLeastAsBig + 1) / (iterations + 1)
}

/** A seed from the data itself, so the same games always give the same answer. */
const seedFrom = games => {
  let h = 2166136261 >>> 0
  for (const g of games) {
    for (const ch of String(g.id)) {
      h ^= ch.charCodeAt(0)
      h = Math.imul(h, 16777619) >>> 0
    }
  }
  return h
}

/** One outcome, both arms, with the test run. */
function compare(on, off, outcome, all, seed) {
  const a = outcomeValues(on, outcome, all)
  const b = outcomeValues(off, outcome, all)
  if (a.length < 3 || b.length < 3) {
    return { outcome, enough: false, onN: a.length, offN: b.length }
  }
  const onMean = mean(a)
  const offMean = mean(b)
  const p = permutationTest(a, b, { seed })
  const better = OUTCOMES[outcome].lowerIsBetter
    ? onMean < offMean ? 'on' : 'off'
    : onMean > offMean ? 'on' : 'off'
  const relative = offMean === 0 ? null : ((onMean - offMean) / Math.abs(offMean)) * 100

  return { outcome, enough: true, onN: a.length, offN: b.length, onMean, offMean, p, better, relative }
}

/**
 * The state of a run: how far along, and what it has found.
 *
 * No verdict is produced before the declared number of games is in. Checking
 * repeatedly and stopping the moment something looks significant is the most
 * reliable way to find an effect that is not there, and an app that did that
 * while claiming to be honest would be worse than one with no experiments.
 */
export function analyse(games, state) {
  const exp = EXPERIMENTS[state?.id]
  if (!exp) return null

  const played = gamesFor(games, exp.id)
  const on = played.filter(g => g.experiment.arm === 'on')
  const off = played.filter(g => g.experiment.arm === 'off')
  const complete = played.length >= exp.games

  const base = {
    exp,
    played: played.length,
    target: exp.games,
    onN: on.length,
    offN: off.length,
    complete,
  }
  if (!complete) return { ...base, results: null }

  const seed = seedFrom(played)
  const results = Object.keys(OUTCOMES).map(k => compare(on, off, k, games, seed))
  return { ...base, results, primary: results.find(r => r.outcome === exp.primary) }
}

/**
 * A p-value as a percentage, never rounded down to zero.
 *
 * Ten thousand reshuffles cannot resolve below one in ten thousand, and the
 * plus-one correction means the answer is never actually zero. Printing "0.0%"
 * would claim the result could not have happened by chance, which is precisely
 * the overclaim the correction exists to prevent.
 */
export const pctChance = p => (p < 0.001 ? 'under 0.1%' : `${(p * 100).toFixed(1)}%`)

/** The same for a narrow table column. */
export const pctShort = p => (p < 0.005 ? '<1%' : `${(p * 100).toFixed(0)}%`)

/** The finding, in the plainest terms the numbers support. */
export function verdictFor(exp, result) {
  if (!result?.enough) return 'Not enough finished games in both halves to compare.'
  const o = OUTCOMES[result.outcome]
  const size = Math.abs(result.relative || 0)

  if (result.p > 0.05) {
    return `No difference big enough to trust. ${o.label} came out ${size.toFixed(0)}% ${
      result.better === 'on' ? 'better' : 'worse'
    } with it on, but a split at least this uneven turns up by chance ${pctShort(
      result.p
    )} of the time, so it is indistinguishable from noise. ${NULL_CAVEAT}`
  }
  return `${o.label} was ${size.toFixed(0)}% ${
    result.better === 'on' ? 'better with it on' : 'better with it off'
  }, and a gap this big came up in ${pctChance(
    result.p
  )} of reshuffles. That is a real effect for you, whatever it does for anyone else.`
}
