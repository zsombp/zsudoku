import { TIERS } from '../logic/difficulty.js'
import { fmtMs } from '../lib/format.js'
import { Calendar } from './Icons.jsx'

export default function NewGameSheet({
  records, canRestart, daily, onPick, onDaily, onRestart, onClose,
}) {
  return (
    <div className="modalVeil" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="New game" onClick={e => e.stopPropagation()}>
        <div className="sheetTitle">New game</div>

        {/* The daily sits above the tiers rather than among them: it is not a
            difficulty, it is a different thing to do. */}
        <button className={'sheetBtn dailyBtn' + (daily.done ? ' dailyDone' : '')} onClick={onDaily}>
          <span className="tierMain">
            <b>
              <Calendar size={14} /> {daily.weekday} puzzle
            </b>
            <span className="tierBlurb">
              {daily.done
                ? `Finished in ${fmtMs(daily.durationMs)}`
                : daily.inProgress
                  ? 'In progress'
                  : 'Same puzzle on every device, no server involved.'}
            </span>
          </span>
          <span className="tierMeta">
            {daily.tier}
            {daily.streak > 0 && <em>{daily.streak} day streak</em>}
          </span>
        </button>

        <div className="sheetDivider">or pick a difficulty</div>

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
