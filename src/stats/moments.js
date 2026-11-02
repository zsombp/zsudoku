// The moments in your games where something stopped you, as lessons.
//
// A stock example teaches a pattern; the position you were actually staring at
// when you needed it teaches you. The analysis already knows, for every move,
// what finding the next digit took from there (`needed`, the hardest rung on the
// ladder's path, see src/logic/bottleneck.js). A hint, a wrong digit, a guess
// that came off or a pattern you asked to be shown at such a spot is a moment
// the pattern beat you, and this turns it into a lesson on that exact board.

import { analyseGame } from './analysis.js'
import { boardAt } from './replay.js'
import { stuckIn, isStuck } from './compute.js'
import { pathToNextDigit } from '../logic/bottleneck.js'
import { buildLesson, canTeach } from '../logic/lessons.js'
import { topologyFromRecord } from '../logic/variants.js'

export { isStuck }

/**
 * A lesson on what the position just before this move needed.
 *
 * Built from the step the ladder would have taken there, on the candidates it
 * would have taken it in, so the lesson shows the pattern as it actually stood
 * rather than over the raw board, where it often is not visible yet.
 */
export function lessonAtMove(record, move, topo = topologyFromRecord(record)) {
  if (!move || !canTeach(move.needed)) return null
  const path = pathToNextDigit(boardAt(record, move.index - 1), topo)
  if (!path) return null
  const { step, board, cands } = path.bottleneck
  return buildLesson({ board, cands, step, topo, source: 'game' })
}

/**
 * The most recent moment this pattern stopped you, as a lesson, or null.
 *
 * Only games whose summary says the pattern stopped them are analysed, so this
 * costs one game's analysis (a few milliseconds) in the usual case.
 */
export function latestStuckLesson(games, technique) {
  const recent = [...games].sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
  for (const g of recent) {
    if (!g.moveLog?.length || !(stuckIn(g)[technique] > 0)) continue
    const { moves } = analyseGame(g)
    const m = [...moves].reverse().find(x => isStuck(x) && x.needed === technique)
    const lesson = m && lessonAtMove(g, m)
    if (lesson) return lesson
  }
  return null
}
