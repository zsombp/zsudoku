import { useEffect, useRef, useState } from 'react'
import { range } from '../logic/topology.js'

export default function NumberPad({ counts, notes, quick, activeDigit, onDigit, disabled }) {
  // The digit whose last copy just went in gets one sweep of light. Only on
  // the transition: a resumed game with three digits already spent shows them
  // spent and still, and so does an undo followed by the same placement twice.
  const prev = useRef(counts)
  const [shine, setShine] = useState(0)
  useEffect(() => {
    for (let v = 1; v <= 9; v++) {
      if (prev.current?.[v] > 0 && counts[v] <= 0) setShine(v)
    }
    prev.current = counts
  }, [counts])

  return (
    <div className={'pad' + (notes ? ' noteMode' : '') + (quick ? ' quick' : '')}>
      {range(9).map(k => {
        const v = k + 1
        const left = counts[v]
        const active = quick && activeDigit === v
        return (
          <button
            key={v}
            className={'key' + (left <= 0 ? ' done' : '') + (active ? ' active' : '') + (shine === v ? ' shine' : '')}
            onAnimationEnd={e => {
              if (e.animationName === 'keyShine') setShine(0)
            }}
            disabled={disabled || (left <= 0 && !notes)}
            onClick={() => onDigit(v)}
            aria-pressed={quick ? active : undefined}
            aria-label={
              quick
                ? `${active ? 'Disarm' : 'Arm'} ${v}${left > 0 ? `, ${left} left` : ', all placed'}`
                : `Place ${v}${left > 0 ? `, ${left} left` : ', all placed'}`
            }
          >
            <span className="kv">{v}</span>
            {/* A digit that is spent says so rather than going blank. Nine of
                these accumulating is the quiet progress bar of a solve. */}
            <span className="kc">{left > 0 ? left : '✓'}</span>
          </button>
        )
      })}
    </div>
  )
}
