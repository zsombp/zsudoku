// Turning a finished game into a record, and getting records back out.
//
// One record per game, completed or abandoned. Abandoned games are kept on
// purpose: a win rate computed only from wins is not a win rate.

import * as idb from './idb.js'
import * as backup from './backup.js'
import { summariseAnalysis, summaryIsCurrent } from '../stats/analysis.js'
import { GRADER_VERSION } from '../logic/techniques.js'

export const SCHEMA_VERSION = 1

/**
 * `puzzle` and `solution` are stored despite being regenerable from the seed,
 * because regenerating a Diabolical puzzle costs seconds and the pair is about
 * 350 bytes. That buys any future analysis that needs to know what the board
 * actually looked like at a given move.
 */
export function buildRecord(state, opts) {
  const record = baseRecord(state, opts)
  // Classified once, here, because doing it on demand costs three and a half
  // seconds across a thousand games. Cheap at four milliseconds once.
  try {
    record.summary = summariseAnalysis(record)
  } catch {
    // A summary is an optimisation. A game that cannot be classified is still
    // a game, and losing the record over it would be absurd.
  }
  return record
}

function baseRecord(state, { completed, durationMs, endedAt }) {
  return {
    id: `${endedAt}-${state.seed}`,
    schema: SCHEMA_VERSION,
    graderVersion: GRADER_VERSION,

    startedAt: state.startedAt,
    endedAt,
    durationMs: Math.round(durationMs),
    completed,

    requested: state.requested,
    graded: state.graded,
    daily: state.mode === 'daily',
    dayKey: state.dayKey || null,
    score: state.score,
    hardest: state.hardest,
    techniques: state.counts || {},
    clues: state.clues,
    seed: state.seed,
    variant: state.variant || 'classic',
    // Jigsaw shapes travel with the game: they cannot be re-derived if the
    // layout builder ever changes.
    regions: state.regions || null,
    puzzle: state.puzzle,
    solution: state.solution,

    mistakes: state.mistakes,
    hints: state.hints,
    checks: state.checks || 0,
    hintLog: state.hintLog || [],
    autoCompleted: Boolean(state.autoCompleted),
    // Which side of a running experiment this game was on, if any.
    experiment: state.experiment || null,
    // Gave up, as opposed to walked away: both are incomplete, only one is a
    // decision, and the review says which.
    forfeited: Boolean(state.forfeited),
    moveLog: state.moveLog || [],
  }
}

/**
 * A game with no moves in it is not a game. Switching difficulty is not a loss.
 *
 * Auto-pencil does not count on its own. With `autoPencilOnStart` on, every
 * board opens with a log entry already in it, so counting any entry would file
 * a result for a puzzle nobody touched.
 */
export const worthRecording = state =>
  Boolean(state?.board) && (state.moveLog || []).some(m => m.kind !== 'autoPencil')

export async function saveRecord(record) {
  try {
    await idb.put(record)
    return true
  } catch {
    return false
  }
}

export async function record(state, opts) {
  if (!worthRecording(state)) return false
  return saveRecord(buildRecord(state, opts))
}

/**
 * Classify any game recorded before summaries existed, or by an older grader.
 *
 * Runs in chunks with a yield between them: at four milliseconds a game, a few
 * hundred games would otherwise lock the interface for a second or more, and
 * this happens while someone is looking at the statistics screen.
 */
export async function backfillSummaries({ onProgress } = {}) {
  const games = await idb.getAll()
  const stale = games.filter(g => g.moveLog?.length && !summaryIsCurrent(g))
  if (!stale.length) return { done: 0, total: games.length }

  let done = 0
  for (let i = 0; i < stale.length; i += 10) {
    const batch = stale.slice(i, i + 10)
    for (const g of batch) {
      try {
        g.summary = summariseAnalysis(g)
        // The summary describes what this grader thinks, so it is only valid
        // while that stays true.
        g.graderVersion = GRADER_VERSION
      } catch {
        g.summary = null
      }
      done++
    }
    await idb.putMany(batch)
    onProgress?.(done, stale.length)
    // Let the interface breathe between batches.
    await new Promise(r => setTimeout(r, 0))
  }
  return { done, total: games.length }
}

export const all = () => idb.getAll()
export const clearAll = () => idb.clear()

/**
 * Drop one game.
 *
 * Every statistic in the app is computed from this log, so a game that was not
 * really played is not a harmless extra row: it moves medians, win rates and
 * the coach's thresholds. There was no way to remove one short of deleting the
 * lot, which is a poor choice to be offered.
 *
 * Note this does not remove it from a GitHub backup. The merge there is a union
 * by id, so a copy already pushed stays pushed until that file is changed too.
 */
export async function removeGame(id, endedAt) {
  // The tombstone goes down first. If the delete somehow fails, a tombstone for
  // a game that is still here is harmless: the next sync removes it anyway.
  backup.addTombstone(id, endedAt)
  return idb.del(id)
}

/**
 * Reconcile with the repository and apply whatever comes back.
 *
 * The sync module deliberately does not touch IndexedDB, so this is where the
 * two halves meet: games the other device played are written in, games it
 * deleted are removed here.
 */
export async function syncNow({ full = false, force = false } = {}) {
  const cfg = backup.loadCfg()
  if (!cfg.enabled) return { ok: false, error: 'Backup is not switched on.' }

  const res = await backup.sync(await all(), { cfg, full, force })
  if (res.cfg) backup.saveCfg(res.cfg)
  if (!res.ok) return res

  if (res.incoming?.length) await idb.putMany(res.incoming)
  for (const id of res.removeLocally || []) await idb.del(id)

  return { ...res, pulled: res.incoming?.length || 0, dropped: res.removeLocally?.length || 0 }
}

// ---- backup ----
//
// Browser storage gets evicted, and a few thousand games is worth more than the
// few hundred KB it costs to keep a copy somewhere real.

export async function exportJson() {
  const games = await all()
  return JSON.stringify(
    { app: 'zsudoku', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), games },
    null,
    2
  )
}

export async function importJson(text, { merge = true } = {}) {
  const data = JSON.parse(text)
  if (data?.app !== 'zsudoku' || !Array.isArray(data.games)) {
    throw new Error('That does not look like a Zsudoku export.')
  }
  if (!merge) await clearAll()
  const existing = merge ? new Set((await all()).map(g => g.id)) : new Set()
  const incoming = data.games.filter(g => g?.id && !existing.has(g.id))
  await idb.putMany(incoming)
  return { added: incoming.length, skipped: data.games.length - incoming.length }
}
