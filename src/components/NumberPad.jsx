import { range } from '../logic/topology.js'

export default function NumberPad({ counts, notes, quick, activeDigit, onDigit, disabled }) {
  return (
    <div className={'pad' + (notes ? ' noteMode' : '') + (quick ? ' quick' : '')}>
      {range(9).map(k => {
        const v = k + 1
        const left = counts[v]
        const active = quick && activeDigit === v
        return (
          <button
            key={v}
            className={'key' + (left <= 0 ? ' done' : '') + (active ? ' active' : '')}
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
