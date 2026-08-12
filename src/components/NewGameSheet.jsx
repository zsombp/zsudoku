import { useState } from 'react'
import { isPuzzleCode } from '../logic/share.js'
import { TIERS, predictTime } from '../logic/difficulty.js'
import { VARIANT_LIST, VARIANTS } from '../logic/variants.js'
import { fmtMs } from '../lib/format.js'
import { Calendar } from './Icons.jsx'
import { Term, TermGroup } from './Term.jsx'
import { define, tierTerm, variantTerm } from '../logic/glossary.js'

/**
 * The blurbs on this sheet come through the glossary rather than off `TIERS`
 * and `VARIANT_LIST` directly.
 *
 * The sentence is the same either way; the point is that there is one door. A
 * tier described here and defined on the statistics screen has to be the same
 * description, and the only way to guarantee that is for both to ask the same
 * question of the same module.
 */
const tierBlurb = name => define(tierTerm(name))?.definition
const variantBlurb = id => define(variantTerm(id))?.definition

export default function NewGameSheet({
  records, canRestart, daily, variant = 'classic', games = [], currentCode, onCode,
  onPick, onDaily, onRestart, onClose,
}) {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
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
            {/* The daily's own line said "same puzzle on every device", which
                is true and is a third of what the daily is. The glossary says
                the whole of it, including that the week has a shape. */}
            <span className="tierBlurb">
              {daily.done
                ? `Finished in ${fmtMs(daily.durationMs)}`
                : daily.inProgress
                  ? 'In progress'
                  : define('daily').definition}
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
        <p className="variantBlurb">{variantBlurb(chosen.id)}</p>
        {/* Cage appears only for killer, which is the only board that has any,
            and it is the one variant whose extra rule is a shape on the grid
            rather than another set of nine cells. */}
        <TermGroup>
          <p className="termHint">
            <Term id="variant" />
            {chosen.id === 'killer' && <>{' · '}<Term id="cage" /></>}
          </p>
        </TermGroup>

        {TIERS.map(t => (
          <button key={t.name} className="sheetBtn tier" onClick={() => onPick(t.name, pickedVariant)}>
            <span className="tierMain">
              <b>{t.name}</b>
              <span className="tierBlurb">{tierBlurb(t.name)}</span>
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

        {/* A puzzle is a seed, a tier and a board, so sharing one is sharing a
            word. No server, no link to rot, and short enough to read aloud. */}
        {onCode && (
          <div className="shareRow">
            <label className="field">
              <span className="fieldLabel">Play someone's puzzle</span>
              <div className="shareInput">
                <input
                  className="fieldInput"
                  value={code}
                  placeholder="CJ-4K7P"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  onChange={e => setCode(e.target.value)}
                />
                <button
                  className="newBtn"
                  disabled={!isPuzzleCode(code)}
                  onClick={() => onCode(code)}
                >
                  Open
                </button>
              </div>
            </label>
            {currentCode && (
              <button
                className="linkBtn"
                onClick={() => {
                  navigator.clipboard?.writeText(currentCode).catch(() => {})
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
              >
                {copied ? 'copied' : `share this one: ${currentCode}`}
              </button>
            )}
          </div>
        )}

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
