import { DIFFS, DIFF_ORDER } from '../logic/difficulty.js'
import { fmtMs } from '../lib/format.js'

export default function NewGameSheet({ records, canRestart, onPick, onRestart, onClose }) {
  return (
    <div className="modalVeil" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="New game" onClick={e => e.stopPropagation()}>
        <div className="sheetTitle">New game</div>
        {DIFF_ORDER.map(d => (
          <button key={d} className="sheetBtn" onClick={() => onPick(d)}>
            <b>{d}</b>
            <span>
              {DIFFS[d].tech}
              {records[d] !== undefined ? ` · best ${fmtMs(records[d])}` : ''}
            </span>
          </button>
        ))}
        <button className="sheetBtn subtle" disabled={!canRestart} onClick={onRestart}>
          <b>Restart puzzle</b>
          <span>same board, fresh start</span>
        </button>
        <button className="sheetBtn cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
