// What the drill log says about a pattern: the learning curve, a sentence for
// the practice screen, and the evidence the curriculum schedules from.
//
// Pure, like the rest of src/stats/: the entries come from src/lib/drillLog.js
// and nothing here touches storage.

const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const secs = ms => `${(ms / 1000).toFixed(1)}s`

export const decksFor = (log, technique) =>
  log.filter(e => e.kind === 'drill' && e.technique === technique).sort((a, b) => a.t - b.t)

/**
 * One point per deck, oldest first: how fast you spotted the pattern and how
 * often you named what it removes. The thing worth watching is the first
 * number falling, which is what recognising a pattern actually looks like.
 */
export function learningCurve(log, technique) {
  return decksFor(log, technique).map((d, i) => ({
    n: i + 1,
    t: d.t,
    cards: d.cards,
    foundRate: d.cards ? d.found / d.cards : 0,
    removedRate: d.asked ? d.removed / d.asked : null,
    medianMs: median(d.spotMs || []),
  }))
}

/** One line for the practice screen, or null with no decks yet. */
export function drillSummary(log, technique) {
  const decks = decksFor(log, technique)
  if (!decks.length) return null
  const cards = decks.reduce((n, d) => n + d.cards, 0)
  const found = decks.reduce((n, d) => n + d.found, 0)
  const asked = decks.reduce((n, d) => n + (d.asked || 0), 0)
  const removed = decks.reduce((n, d) => n + (d.removed || 0), 0)
  const curve = learningCurve(log, technique).filter(p => p.medianMs != null)
  const first = curve[0]?.medianMs ?? null
  const last = curve.at(-1)?.medianMs ?? null
  let text = `${plural(decks.length, 'deck')}: spotted ${found} of ${cards}`
  if (asked) text += `, named what it removes ${removed} of ${asked}`
  if (last != null) {
    text += curve.length > 1 ? `. Median ${secs(last)} a card, from ${secs(first)} on the first deck.` : `. Median ${secs(last)} a card.`
  } else text += '.'
  return { decks: decks.length, cards, found, asked, removed, firstMs: first, lastMs: last, text }
}

/**
 * Each deck as one encounter for the curriculum: the share of questions you
 * got right, both kinds counted. One per deck rather than one per card, for the
 * same reason a game counts once: twenty cards in three minutes are one sitting.
 */
export const drillEncounters = log =>
  log
    .filter(e => e.kind === 'drill' && e.cards > 0)
    .map(e => ({
      t: e.t,
      technique: e.technique,
      right: e.found + (e.removed || 0),
      asked: e.cards + (e.asked || 0),
      outcome: (e.found + (e.removed || 0)) / (e.cards + (e.asked || 0)),
    }))

/** How the predictions inside lessons went, for one pattern. */
export function predictionSummary(log, technique) {
  const ps = log.filter(e => e.kind === 'predict' && e.technique === technique)
  if (!ps.length) return null
  const exact = ps.filter(p => p.missed === 0 && p.extra === 0).length
  return { made: ps.length, exact, text: `Predicted ${exact} of ${ps.length} lessons exactly before seeing the worlds.` }
}
