import { TIERS } from '../logic/difficulty.js'
import { fmtMs } from '../lib/format.js'

export default function NewGameSheet({ records, canRestart, onPick, onRestart, onClose }) {
  return (
    <div className="modalVeil" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="New game" onClick={e => e.stopPropagation()}>
        <div className="sheetTitle">New game</div>
        {TIERS.map(t => (
          <button key={t.name} className="sheetBtn tier" onClick={() => onPick(t.name)}>
            <span className="tierMain">
              <b>{t.name}</b>
              <span className="tierBlurb">{t.blurb}</span>
            </span>
            <span className="tierMeta">
              {t.tech}
              {records[t.name] !== undefined && <em>best {fmtMs(records[t.name])}</em>}
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
