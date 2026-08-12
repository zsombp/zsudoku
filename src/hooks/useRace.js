import { useCallback, useEffect, useMemo, useState } from 'react'
import * as gameLog from '../lib/gameLog.js'
import { makeGhost, engineGhost, ENGINE_STEP_MS } from '../stats/ghost.js'
import { flowSummary } from '../stats/flow.js'
import { median } from '../stats/compute.js'

/**
 * What there is to race on this grid, and which of them is running.
 *
 * Kept out of App because it is all bookkeeping: which past run is the same
 * board, how fast the engine should be, and whether the offer has been waved
 * away. What the race actually says is a single call to `raceState`, which
 * costs nothing and belongs at the point of render.
 *
 * ---- the engine's pace ----
 *
 * `ENGINE_STEP_MS` is 3 seconds, and at that pace the ladder finishes a
 * Diabolical in 3:18. That is a pacemaker, not an opponent. So the engine runs
 * at this player's own median gap between placements instead, taken from their
 * last twenty finished games, which makes it a race they can win on a good day
 * and lose on a bad one. The label says the pace out loud either way, so nothing
 * about it is hidden. With no history to measure, it falls back to the module's
 * own default rather than inventing a number.
 */
const PACE_GAMES = 20

export function paceFrom(games) {
  const gaps = []
  for (const g of games) {
    if (!g?.completed || !g.moveLog?.length) continue
    const s = flowSummary(g)
    if (s.enough && s.medianGap > 0) gaps.push(s.medianGap)
    if (gaps.length >= PACE_GAMES) break
  }
  return gaps.length ? Math.round(median(gaps)) : ENGINE_STEP_MS
}

export const samePuzzle = (a, b) =>
  Array.isArray(b) && b.length === 81 && a.every((v, i) => v === b[i])

/**
 * How long a game may have been running and still count as not started.
 *
 * The race compares the two runs at the same point on the clock, which is the
 * only honest comparison there is, and it means a race joined late opens with
 * the ghost far ahead. Found by starting one on a board resumed with 5:15 on it
 * and nothing placed: it opened at 38 cells down, which is true and reads as
 * broken.
 *
 * So the offer is only made while the game genuinely has not started. Measured
 * over the 17 real games on this device, the first digit lands within 30s in 14
 * of them and within 60s in 16; the outlier is one 123 second study. A minute
 * covers the openings and is short enough that the ghost has barely moved.
 */
export const RACE_WINDOW_MS = 60000

export function useRace({ puzzle, topo, elapsedMs = 0, untouched, enabled }) {
  const [found, setFound] = useState(null)
  const [ghost, setGhost] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  // A new grid is a new race. Everything about the old one is stale, including
  // the dismissal: waving the offer away on Tuesday's puzzle should not mean
  // never being asked again, which is what the settings switch is for.
  useEffect(() => {
    setFound(null)
    setGhost(null)
    setDismissed(false)
  }, [puzzle])

  useEffect(() => {
    if (!enabled || !puzzle) return
    let alive = true
    gameLog.all().then(games => {
      if (!alive) return
      // Only a finished run of this exact grid. "My best Hard" is the obvious
      // query and the wrong one: two Hards are not the same race.
      const played = games
        .filter(g => g.completed && g.durationMs > 0 && samePuzzle(puzzle, g.puzzle))
        .sort((a, b) => a.durationMs - b.durationMs)
      setFound({
        mine: played.length ? makeGhost(played[0], { puzzle }) : null,
        pace: paceFrom([...games].sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))),
      })
    })
    return () => { alive = false }
  }, [puzzle, enabled])

  // Built when the offer is drawn rather than when the race starts, so the
  // button can carry the pace in its own label. 0.22ms on a Hard, which is a
  // full walk of the ladder and still cheaper than a repaint.
  const engine = useMemo(
    () => (found && puzzle ? engineGhost(puzzle, topo, found.pace) : null),
    [found, puzzle, topo]
  )

  const start = useCallback(
    which => setGhost(which === 'engine' ? engine : found?.mine || null),
    [engine, found]
  )

  return {
    ghost,
    start,
    stop: useCallback(() => setGhost(null), []),
    dismiss: useCallback(() => setDismissed(true), []),
    // Only while the grid is untouched and the clock is still near zero. Both
    // conditions take the offer away on their own, so it is never closed by a
    // prompt reappearing mid-game, which is where this would become nagging.
    offer:
      enabled && untouched && elapsedMs < RACE_WINDOW_MS && !ghost && !dismissed && found
        ? { mine: found.mine, engine }
        : null,
  }
}
