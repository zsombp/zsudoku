import { useCallback, useEffect, useRef, useState } from 'react'

// Timestamp-based clock, not a tick counter.
//
// The prototype incremented a number on a one-second setInterval. That drifts,
// and browsers throttle or suspend timers in a backgrounded tab, so a phone
// locked mid-game recorded far less time than it took. Every statistic built on
// that would be wrong, which is not acceptable in an app whose whole pitch is
// honest difficulty.
//
// Here the elapsed time is always recomputed from performance.now(), so a
// throttled interval costs display smoothness and nothing else.

export function useTimer(running, initialMs = 0) {
  const accRef = useRef(initialMs)
  const startRef = useRef(null)
  const [ms, setMs] = useState(initialMs)

  const read = useCallback(
    () => accRef.current + (startRef.current === null ? 0 : performance.now() - startRef.current),
    []
  )

  // Commit on stop, restart the stopwatch on start.
  useEffect(() => {
    if (running) {
      if (startRef.current === null) startRef.current = performance.now()
    } else if (startRef.current !== null) {
      accRef.current += performance.now() - startRef.current
      startRef.current = null
      setMs(accRef.current)
    }
  }, [running])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setMs(read()), 250)
    return () => clearInterval(id)
  }, [running, read])

  const reset = useCallback(
    (value = 0) => {
      accRef.current = value
      startRef.current = running ? performance.now() : null
      setMs(value)
    },
    [running]
  )

  return { ms, read, reset }
}
