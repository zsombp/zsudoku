import { range } from '../logic/topology.js'

export default function NumberPad({ counts, notes, onDigit, disabled }) {
  return (
    <div className={'pad' + (notes ? ' noteMode' : '')}>
      {range(9).map(k => {
        const v = k + 1
        const left = counts[v]
        return (
          <button
            key={v}
            className={'key' + (left <= 0 ? ' done' : '')}
            disabled={disabled || (left <= 0 && !notes)}
            onClick={() => onDigit(v)}
            aria-label={`Place ${v}${left > 0 ? `, ${left} left` : ', all placed'}`}
          >
            <span className="kv">{v}</span>
            <span className="kc">{left > 0 ? left : ''}</span>
          </button>
        )
      })}
    </div>
  )
}
