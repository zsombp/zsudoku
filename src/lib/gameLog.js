// Turning a finished game into a record, and getting records back out.
//
// One record per game, completed or abandoned. Abandoned games are kept on
// purpose: a win rate computed only from wins is not a win rate.

import * as idb from './idb.js'
import { GRADER_VERSION } from '../logic/techniques.js'

export const SCHEMA_VERSION = 1

/**
 * `puzzle` and `solution` are stored despite being regenerable from the seed,
 * because regenerating a Diabolical puzzle costs seconds and the pair is about
 * 350 bytes. That buys any future analysis that needs to know what the board
 * actually looked like at a given move.
 */
export function buildRecord(state, { completed, durationMs, endedAt }) {
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
    puzzle: state.puzzle,
    solution: state.solution,

    mistakes: state.mistakes,
    hints: state.hints,
    checks: state.checks || 0,
    hintLog: state.hintLog || [],
    autoCompleted: Boolean(state.autoCompleted),
    // Gave up, as opposed to walked away: both are incomplete, only one is a
    // decision, and the review says which.
    forfeited: Boolean(state.forfeited),
    moveLog: state.moveLog || [],
  }
}

/** A game with no moves in it is not a game. Switching difficulty is not a loss. */
export const worthRecording = state =>
  Boolean(state?.board) && (state.moveLog?.length || 0) > 0

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
export const removeGame = id => idb.del(id)

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
