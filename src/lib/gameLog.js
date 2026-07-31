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
    score: state.score,
    hardest: state.hardest,
    techniques: state.counts || {},
    clues: state.clues,
    seed: state.seed,
    puzzle: state.puzzle,
    solution: state.solution,

    mistakes: state.mistakes,
    hints: state.hints,
    hintLog: state.hintLog || [],
    autoCompleted: Boolean(state.autoCompleted),
    moveLog: state.moveLog || [],
  }
}

/** A game with no moves in it is not a game. Switching difficulty is not a loss. */
export const worthRecording = state =>
  Boolean(state?.board) && (state.moveLog?.length || 0) > 0

export async function record(state, opts) {
  if (!worthRecording(state)) return false
  try {
    return await idb.put(buildRecord(state, opts))
  } catch {
    return false
  }
}

export const all = () => idb.getAll()
export const clearAll = () => idb.clear()

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
