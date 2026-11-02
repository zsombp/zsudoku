import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * A lesson opened from inside another screen.
 *
 * The lesson replaces the screen rather than stacking on top of it, which on a
 * phone is the only arrangement with room for a board and its text. The screen
 * stays mounted underneath in spirit: its own state lives in its own component,
 * which is never unmounted, and the scroll position it had is put back when the
 * lesson closes, so "Back" lands on the row you tapped rather than at the top.
 *
 * `learn(null)` does nothing, so a caller can pass whatever `buildLesson`
 * returned without checking it first.
 */
export function useLessonState() {
  const [lesson, setLesson] = useState(null)
  const scroll = useRef(0)
  const restore = useRef(false)

  const learn = useCallback(l => {
    if (!l) return
    scroll.current = window.scrollY
    setLesson(l)
    window.scrollTo(0, 0)
  }, [])

  const unlearn = useCallback(() => {
    restore.current = true
    setLesson(null)
  }, [])

  useLayoutEffect(() => {
    if (lesson || !restore.current) return
    restore.current = false
    window.scrollTo(0, scroll.current)
  }, [lesson])

  return [lesson, learn, unlearn]
}
