import { useEffect, useState } from 'react'
import { TECHNIQUES, LADDER } from '../logic/techniques.js'
import * as gameLog from '../lib/gameLog.js'
import { hintsByTechnique } from '../stats/compute.js'
import { VARIANT_LIST } from '../logic/variants.js'

/**
 * Practice, and the technique reference the app never had.
 *
 * The coach has been able to name the pattern you keep needing hints on since
 * Phase 5, and could do nothing about it. This is the other half: pick a
 * technique and get a puzzle that actually requires it.
 *
 * It doubles as the reference. Every rung of the ladder is listed with what it
 * means and how often you have needed help with it, which is the closest thing
 * to teaching the app does outside the post-game summary.
 */
export default function PracticeView({ onPractice, onCards, onClose, busyWith, error }) {
  const [hints, setHints] = useState(null)
  const [open, setOpen] = useState(null)
  // Which board to drill on. Spotting a naked pair inside an irregular region
  // is a different skill from spotting one in a square box, so the same rung
  // is worth practising more than one way.
  const [variant, setVariant] = useState('classic')

  useEffect(() => {
    gameLog.all().then(games => setHints(hintsByTechnique(games)))
  }, [])

  return (
    <div className="statsView">
      <header className="top">
        <div className="brand">PRACTICE</div>
        <button className="newBtn" onClick={onClose}>Back</button>
      </header>

      <p className="dataNote">
        Pick a pattern and get a puzzle that genuinely requires it. The grader
        records what each puzzle needs, so this is a filter rather than a
        promise: if a technique is in the list, the puzzle will contain it.
      </p>

      <div className="variantRow" role="tablist" aria-label="Which board">
        {VARIANT_LIST.map(v => (
          <button
            key={v.id}
            role="tab"
            aria-selected={v.id === variant}
            className={'variantChip' + (v.id === variant ? ' on' : '')}
            onClick={() => setVariant(v.id)}
          >
            {v.name}
          </button>
        ))}
      </div>

      <div className="techList">
        {LADDER.map(key => {
          const t = TECHNIQUES[key]
          const used = hints?.counts?.[key] || 0
          const isOpen = open === key
          const busy = busyWith === key
          return (
            <div className={'techRow' + (isOpen ? ' open' : '')} key={key}>
              <button
                className="techMain"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
              >
                <span className="techText">
                  <span className="techName">{t.label}</span>
                  <span className="techShort">{t.short}</span>
                </span>
                {used > 0 && (
                  <span className="techHints" title={`${used} hints on this`}>
                    {used} {used === 1 ? 'hint' : 'hints'}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="techBody">
                  <p className="techAbout">{t.about}</p>
                  <div className="dataRow">
                    <button className="newBtn" disabled={Boolean(busyWith)} onClick={() => onPractice(key, variant)}>
                      {busy ? 'Finding a puzzle…' : `Practise ${t.label}`}
                    </button>
                    {/* A whole puzzle teaches the pattern once in ten minutes.
                        Cards ask the same question twenty times in three. */}
                    {onCards && key !== 'nakedSingle' && (
                      <button
                        className="newBtn"
                        disabled={Boolean(busyWith)}
                        onClick={() => onCards(key)}
                      >
                        {busyWith === 'cards:' + key ? 'Dealing…' : 'Flashcards'}
                      </button>
                    )}
                  </div>
                  {error && !busyWith && (
                    <p className="techError">{error}</p>
                  )}
                  {RARE.has(key) && (
                    <p className="techWarn">
                      Rare. Finding one can take a few seconds, and occasionally
                      the search comes up empty.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Measured with scripts/practice.mjs rather than assumed. Naked quad landed 67%
 * of the time at a 20s budget and everything else 100%; these three are the
 * ones slow enough to be worth warning about.
 */
const RARE = new Set(['nakedQuad', 'swordfish', 'nakedTriple', 'hiddenTriple', 'xWing'])
