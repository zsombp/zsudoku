// Racing your past self, or the engine.
//
// A ghost is one number over time: at moment t, how many cells had it filled.
// That is the whole shape a race needs. "Three ahead", "forty seconds down",
// and a second line drawn beside your own all come out of that one function.
//
// It is deliberately not a replay. A replay wants every cell and every mark; a
// race wants a single scalar it can compare against a live board sixty times a
// second, and reducing the ghost to that is what makes it cheap enough to run
// while someone is playing.
//
// ---- "filled" means filled correctly ----
//
// The obvious count is "cells that are not empty", and it is wrong here in a
// way that would quietly poison the readout. Measured on a Hard game with wrong
// digits left standing, the two counts disagree at 59% of board changes with
// two wrong digits down and 85% with five, and the gap is exactly the number
// standing. A race is decided by one, two or three cells, so that error is the
// same size as the signal: you would be told you were two cells ahead precisely
// because two of your digits were wrong.
//
// So a cell counts once it holds the digit the solution has. A wrong digit is
// not progress towards finishing, it is work still to undo.
//
// ---- the timeline is built out of replay.js, not a second board walk ----
//
// The rules for turning a move log back into a board (a `changes` diff, a bare
// placement, an erase, an undo carrying its own diff) live in `replay.js` and
// should live in exactly one place. Folding the log once here instead measured
// 0.01ms against 0.11ms per ghost on a 782-entry log, and the price of that
// tenth of a millisecond would be two descriptions of what an undo does, free
// to drift apart. `replaySteps` already names the entries that can move a
// digit, 86 of those 782, so the quadratic-looking version is a tenth of a
// millisecond and is paid once when a race starts rather than during play.

import { CLASSIC } from '../logic/topology.js'
import { gradePuzzle } from '../logic/grader.js'
import { boardAt, replaySteps } from './replay.js'
import { fmtMs } from '../lib/format.js'

/**
 * How far along a board is: cells that were blank in the puzzle and now hold
 * the right digit.
 *
 * Exported because the live side of a race has to count itself exactly this
 * way. A UI that counts its own board with `board.filter(Boolean).length` would
 * be comparing a number that includes the givens against one that does not, and
 * would report the player as a clue count ahead for the whole game.
 *
 * `solution` is optional only for the sake of a record that somehow lacks one;
 * without it every digit counts, right or wrong. Always pass it.
 */
export function progressOf(board, puzzle, solution = null) {
  if (!board || !puzzle) return 0
  let n = 0
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0 || !board[i]) continue
    if (!solution || board[i] === solution[i]) n++
  }
  return n
}

const blanksIn = puzzle => {
  let n = 0
  for (let i = 0; i < 81; i++) if (!puzzle[i]) n++
  return n
}

const sameBoard = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The finished ghost object, from a list of {t, filled} points.
 *
 * Points are collapsed to the moments the count actually changed, so a game
 * with 782 log entries becomes 59 points and a lookup is a binary search over
 * those. `reach` is the same timeline read the other way round, filled count to
 * the moment it was first reached, precomputed because it cannot be binary
 * searched: a ghost that erases a correct digit goes backwards, so the counts
 * are not sorted even though the times are.
 */
function buildGhost({ label, total, points, endMs, finished }) {
  const reach = new Array(total + 1).fill(Infinity)
  reach[0] = 0
  let high = 0
  for (const p of points) {
    for (let n = high + 1; n <= p.filled && n <= total; n++) reach[n] = p.t
    if (p.filled > high) high = p.filled
  }

  return {
    label,
    total,
    points,
    endMs,
    finished,

    /** How many cells the ghost had filled at `ms`. Holds its last value after the end. */
    at(ms) {
      // Infinity is a fair question, meaning "where did it end up", and the
      // search answers it. NaN is not, and lands at the start rather than
      // anywhere unpredictable.
      const t = ms > 0 ? ms : 0
      let lo = 0
      let hi = points.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (points[mid].t <= t) lo = mid
        else hi = mid - 1
      }
      return points[lo].filled
    },

    /** When the ghost first got to `n` cells, or Infinity if it never did. */
    timeTo(n) {
      if (!(n > 0)) return 0
      if (n > total) return Infinity
      return reach[n]
    },
  }
}

/**
 * A ghost from a finished game.
 *
 * Needs no topology: it only ever asks whether a cell holds the right digit,
 * which the record's own solution answers whatever shape the regions were.
 *
 * Pass `puzzle` to have it refuse a record for a different board. Racing your
 * best Hard against a different Hard is meaningless, and it is the mistake a
 * caller is most likely to make, because "my best time at this difficulty" is
 * the obvious query and the wrong one.
 */
export function makeGhost(record, { label, puzzle } = {}) {
  if (!record?.puzzle) return null
  if (puzzle && !sameBoard(puzzle, record.puzzle)) return null

  const log = record.moveLog || []
  const solution = record.solution || null
  const total = blanksIn(record.puzzle)
  const points = [{ t: 0, filled: 0 }]
  let filled = 0
  let last = 0

  for (const i of replaySteps(record)) {
    const n = progressOf(boardAt(record, i), record.puzzle, solution)
    if (n === filled) continue
    filled = n
    // The log is chronological by construction. Taking the running maximum
    // rather than trusting it means a malformed log lands a fill slightly early
    // instead of leaving the points unsorted, which would break every lookup
    // after it and look like the ghost stopping dead.
    last = Math.max(last, log[i].t || 0)
    if (points[points.length - 1].t === last) points.pop()
    points.push({ t: last, filled: n })
  }

  return buildGhost({
    label: label || recordLabel(record),
    total,
    points,
    // The clock the game actually ran for, which is past the last fill on a
    // game that was abandoned staring at the grid.
    endMs: Math.max(last, Math.round(record.durationMs || 0)),
    finished: filled >= total,
  })
}

function recordLabel(record) {
  const when = record.endedAt
    ? new Date(record.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : null
  if (record.completed && record.durationMs) {
    const time = fmtMs(record.durationMs)
    return when ? `Your ${time} from ${when}` : `Your ${time}`
  }
  return when ? `Your unfinished run from ${when}` : 'Your unfinished run'
}

/**
 * How long the engine spends on one rung of the ladder.
 *
 * A dial, and openly so. At this pace the ladder's median solve path finishes a
 * Gentle in 1:51 and a Diabolical in 3:18, measured over six seeds a tier, so
 * this is a ghost that beats a person on every tier. Set it from the player's
 * own median gap between placements if the point is a race they can win rather
 * than a pacemaker to chase.
 */
export const ENGINE_STEP_MS = 3000

/**
 * A ghost from the technique ladder's own solve path.
 *
 * Every step costs `msPerStep`, including the ones that only eliminate
 * candidates. Those are 6 of the 62 steps on a Hard and 5 of 56 on a
 * Diabolical, and they are why the engine's line has flat stretches: it is
 * thinking rather than writing, which is the same thing a person does.
 *
 * `puzzle` does not have to be the original grid. Hand it a position from a
 * game in progress and the ghost starts from there, which is what "how fast
 * would the engine finish from here" needs.
 */
export function engineGhost(puzzle, topo = CLASSIC, msPerStep = ENGINE_STEP_MS, { label } = {}) {
  if (!puzzle) return null
  const step = Number.isFinite(msPerStep) && msPerStep > 0 ? msPerStep : ENGINE_STEP_MS
  const { steps } = gradePuzzle(puzzle, { keepSteps: true, topo })
  const total = blanksIn(puzzle)
  const points = [{ t: 0, filled: 0 }]
  let filled = 0
  let t = 0

  for (const s of steps) {
    t += step
    if (!s.placements.length) continue
    filled += s.placements.length
    points.push({ t, filled })
  }

  return buildGhost({
    label: label || engineLabel(step),
    total,
    points,
    endMs: t,
    // A puzzle the ladder cannot finish leaves the line short, and says so
    // rather than pretending the race was ever winnable.
    finished: filled >= total,
  })
}

const engineLabel = step => {
  const secs = step / 1000
  return `The engine, a step every ${secs % 1 === 0 ? secs : secs.toFixed(1)}s`
}

/**
 * Where the race stands right now.
 *
 * `elapsedMs` must come from the same pause-aware clock the move log was
 * written against, or the ghost will appear to sprint while the phone is
 * locked. `myFilled` must come from `progressOf`.
 *
 * Level is `by === 0`, and `ahead` is false there: a caller reading `ahead`
 * alone would write "0 cells behind".
 *
 * `byMs` is the same race measured on the clock instead of on the board, which
 * is often the more meaningful half: cells are not equal, and "forty seconds
 * up" survives a stretch where you are both stuck. It is negative when you are
 * behind, and null when the ghost never reached your count at all, which is
 * what happens once you pass a game that was abandoned.
 */
export function raceState(ghost, elapsedMs, myFilled) {
  if (!ghost) return null
  const t = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const mine = Number.isFinite(myFilled) && myFilled > 0 ? Math.floor(myFilled) : 0
  const ghostFilled = ghost.at(t)
  const diff = mine - ghostFilled

  // Undefined at zero rather than zero: both of you had filled nothing at the
  // start, so "you reached 0 cells at 0:00" would report a player who has done
  // nothing for a minute as a minute behind.
  const reached = mine > 0 ? ghost.timeTo(mine) : Infinity

  return {
    ahead: diff > 0,
    by: Math.abs(diff),
    diff,
    ghostFilled,
    byMs: Number.isFinite(reached) ? reached - t : null,
  }
}
