// A ready puzzle per tier, kept in localStorage.
//
// Generating a Diabolical puzzle can take nine seconds. Nobody should watch a
// spinner for nine seconds because they pressed New Game, so one puzzle per
// tier is generated ahead of time in the worker while the player is busy with
// the current one, and handed over instantly when asked for.
//
// localStorage rather than IndexedDB on purpose: a puzzle is about 400 bytes
// and six of them is under 3KB. IndexedDB arrives in Phase 5 for the game
// history, which is the thing that actually needs it.

import { GRADER_VERSION } from '../logic/techniques.js'

// The grader version is part of the key, so changing a technique or a cost
// silently orphans the old cache instead of serving puzzles labelled by a
// scoring system that no longer exists.
const KEY = `zsudoku.pending.v${GRADER_VERSION}`

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* best effort: a full cache is a convenience, never a requirement */
  }
}

/** Takes the ready puzzle for a tier, removing it. Null if none waiting. */
export function take(tier) {
  const all = readAll()
  const made = all[tier]
  if (!made) return null
  delete all[tier]
  writeAll(all)
  return made
}

export function put(tier, made) {
  const all = readAll()
  all[tier] = made
  writeAll(all)
}

export const has = tier => Boolean(readAll()[tier])

/** Dropped whenever the grader changes, since cached puzzles carry stale scores. */
export function clear() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
