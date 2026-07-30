import { useEffect, useRef } from 'react'

// The prototype attached and removed a keydown listener on every single render,
// because its effect had no dependency array. That was how it avoided stale
// closures. Same result here without the churn: the listener is attached once
// and always calls the newest handler through a ref.

export function useKeyboard(handler) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    const onKey = e => {
      const t = e.target
      // Never swallow keys aimed at a text field.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
