import { useState } from 'react'
import { TIERS, predictTime } from '../logic/difficulty.js'
import { VARIANT_LIST, VARIANTS } from '../logic/variants.js'
import { fmtMs } from '../lib/format.js'
import { Calendar } from './Icons.jsx'

export default function NewGameSheet({
  records, canRestart, daily, variant = 'classic', games = [], onPick, onDaily, onRestart, onClose,
}) {
  // Chosen before the difficulty, because it changes what the difficulty means
  // to play rather than how hard it is.
  const [pickedVariant, setPickedVariant] = useState(variant)
  const chosen = VARIANT_LIST.find(v => v.id === pickedVariant) || VARIANT_LIST[0]

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
            {daily.variant && daily.variant !== 'classic' && (
              <em>{VARIANTS[daily.variant]?.name}</em>
            )}
            {daily.streak > 0 && <em>{daily.streak} day streak</em>}
          </span>
        </button>

        <div className="sheetDivider">or pick a difficulty</div>

        <div className="variantRow" role="tablist" aria-label="Variant">
          {VARIANT_LIST.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === pickedVariant}
              className={'variantChip' + (v.id === pickedVariant ? ' on' : '')}
              onClick={() => setPickedVariant(v.id)}
            >
              {v.name}
            </button>
          ))}
        </div>
        <p className="variantBlurb">{chosen.blurb}</p>

        {TIERS.map(t => (
          <button key={t.name} className="sheetBtn tier" onClick={() => onPick(t.name, pickedVariant)}>
            <span className="tierMain">
              <b>{t.name}</b>
              <span className="tierBlurb">{t.blurb}</span>
            </span>
            <span className="tierMeta">
              {t.tech}
              {/* What it is likely to cost you, from your own history on this
                  board. A range rather than a number: a point estimate for
                  something this variable is a lie with a decimal place on it. */}
              {(() => {
                const p = predictTime(games, t.name, pickedVariant)
                return p ? <em>{fmtMs(p.low)}–{fmtMs(p.high)} for you</em> : null
              })()}
              {records[recordKey(pickedVariant, t.name)] !== undefined && (
                <em>best {fmtMs(records[recordKey(pickedVariant, t.name)])}</em>
              )}
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

/**
 * Records are kept per variant and per tier. A Hard jigsaw and a Hard classic
 * are not the same achievement, and one personal best covering both would be
 * neither.
 */
export const recordKey = (variant, tier) => (variant === 'classic' ? tier : `${variant}:${tier}`)
