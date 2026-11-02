// The stock lessons: one real position per rung, for when there is no game of
// your own to learn from yet.
//
// Kept apart from lessons.js so the engine stays importable from node, where a
// bare JSON import is not allowed. The positions themselves are picked by
// `scripts/lessonbank.mjs` out of real classic and killer solves for being easy to read:
// few worlds, few eliminations, a flaw that opens a world, and where possible a
// digit that lands at the end. Regenerate with that script if a technique's
// step shape changes; lessons.test.js fails if a rung is missing or an entry
// stops building.

import BANK from './lessonBank.json'
import { buildLesson } from './lessons.js'
import { topologyFromRecord } from './variants.js'

export function stockLesson(technique) {
  const entry = BANK.find(e => e.technique === technique)
  if (!entry) return null
  return buildLesson({
    board: [...entry.board].map(Number),
    cands: Int16Array.from(entry.cands),
    step: entry.step,
    topo: topologyFromRecord(entry),
    source: 'example',
  })
}

export const STOCK = BANK.map(e => e.technique)
