import { useCallback, useEffect, useState } from 'react'
import { KEYS, getSync, set } from '../lib/storage.js'
import * as gameLog from '../lib/gameLog.js'
import { allDrills } from '../lib/drillLog.js'
import { sessionToday, markStage as mark } from '../stats/session.js'

/**
 * Today's session, read from and written to localStorage.
 *
 * The pattern is picked the first time the day's session is asked for and
 * kept for the rest of the day; see src/stats/session.js for why.
 */
export function useSession() {
  const [session, setSession] = useState(() => getSync(KEYS.session))

  /** Today's session, picking a pattern if the stored one is from another day. */
  const refresh = useCallback(async () => {
    const games = await gameLog.all()
    const { session: s, created } = sessionToday(getSync(KEYS.session), games, { drills: allDrills() })
    if (created) set(KEYS.session, s)
    setSession(s)
    return s
  }, [])

  /**
   * Mark one step. Read from storage rather than from state, so two marks in
   * one tick (a deck finished and the screen leaving) cannot lose either.
   */
  const markStage = useCallback((stage, outcome = 'done') => {
    const stored = getSync(KEYS.session)
    if (!stored) return null
    const next = mark(stored, stage, outcome)
    if (next !== stored) set(KEYS.session, next)
    setSession(next)
    return next
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { session, refresh, markStage }
}
