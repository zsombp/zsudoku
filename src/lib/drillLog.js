// What the position drills and the lesson predictions recorded.
//
// Drill results used to vanish when a deck ended, so twenty X-Wing cards done
// well left the practice schedule exactly as unsure of your X-Wing as before.
// Each finished deck is now one entry, and so is each prediction made inside a
// lesson. The curriculum reads the decks as evidence of their own kind; the
// practice screen reads both for the learning curve.
//
// localStorage rather than IndexedDB: an entry is about a hundred bytes and the
// log is capped, so it stays a few tens of kilobytes forever. It is not part of
// the GitHub backup, which carries the game log and the league file and nothing
// else, so drills done on the phone stay on the phone.

import { KEYS, getSync } from './storage.js'

/** About a year of a deck a day, with room for lesson predictions besides. */
export const CAP = 800

export function allDrills() {
  const v = getSync(KEYS.drills)
  return Array.isArray(v) ? v : []
}

function save(list) {
  try {
    localStorage.setItem(KEYS.drills, JSON.stringify(list.slice(-CAP)))
  } catch {
    /* best effort: a full or private-mode store loses the entry, not the app */
  }
}

/**
 * One finished deck.
 *
 *   cards     how many cards were dealt
 *   found     cards where you named the pattern's cells
 *   asked     cards that also asked what the pattern removes
 *   removed   of those, how many you named
 *   spotMs    seconds to spot, in milliseconds, for each card found
 */
export function recordDeck({ technique, cards, found, asked, removed, spotMs }, t = Date.now()) {
  const entry = {
    kind: 'drill',
    t,
    technique,
    cards,
    found,
    asked,
    removed,
    spotMs: (spotMs || []).map(ms => Math.round(ms / 100) * 100),
  }
  save([...allDrills(), entry])
  return entry
}

/** One prediction made inside a lesson, before the worlds were shown. */
export function recordPrediction({ technique, hits, missed, extra, source }, t = Date.now()) {
  const entry = { kind: 'predict', t, technique, hits, missed, extra, source: source || null }
  save([...allDrills(), entry])
  return entry
}
