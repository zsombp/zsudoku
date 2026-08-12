import { useEffect, useMemo, useState } from 'react'
import { TECHNIQUES, LADDER, CAGE_TECHNIQUES } from '../logic/techniques.js'
import * as gameLog from '../lib/gameLog.js'
import { hintsByTechnique } from '../stats/compute.js'
import { VARIANT_LIST } from '../logic/variants.js'
import { schedule, nextUp, nothingDue, strengthLabel } from '../stats/curriculum.js'
import { Explain, Term, TermGroup } from './Term.jsx'
import { define, techniqueTerm } from '../logic/glossary.js'

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
  const [games, setGames] = useState(null)
  const [open, setOpen] = useState(null)
  // Which board to drill on. Spotting a naked pair inside an irregular region
  // is a different skill from spotting one in a square box, so the same rung
  // is worth practising more than one way.
  const [variant, setVariant] = useState('classic')

  useEffect(() => {
    gameLog.all().then(setGames)
  }, [])

  const hints = useMemo(() => (games ? hintsByTechnique(games) : null), [games])
  // 0.02ms over a real history, so there is nothing to gain by storing it on a
  // record or recomputing it any less often than the screen opens.
  const due = useMemo(() => (games ? schedule(games) : []), [games])
  const soonest = useMemo(() => (games ? nextUp(games) : null), [games])
  const byTechnique = useMemo(() => new Map(due.map(d => [d.technique, d])), [due])

  /**
   * The rungs this board can actually require.
   *
   * The five cage techniques were listed on every board, so picking Classic and
   * asking for a drill on the 45 rule sent the generator hunting for a puzzle
   * that cannot exist. It searched for about a minute and then said "it is
   * rare, try again", which is a true sentence about a different situation:
   * it is not rare on a classic grid, it is impossible.
   */
  const rungs = useMemo(
    () => (variant === 'killer' ? LADDER : LADDER.filter(k => !CAGE_TECHNIQUES.includes(k))),
    [variant]
  )

  return (
    <div className="statsView">
      <header className="top">
        <div className="brand">PRACTICE</div>
        <button className="newBtn" onClick={onClose}>Back</button>
      </header>

      {/* What is actually due, above the catalogue. The list below is every
          rung there is; this is the one the record says to look at, and it
          states the evidence rather than asserting a weakness. */}
      {games && (
        soonest ? (
          <div className="dueCard">
            {/* "Due" is a claim about your games, not a timer: a rung is due
                when its wait has run out and the record has something to say
                about it. */}
            <div className="dueKicker"><Term id="due">Due now</Term></div>
            <div className="dueTitle">{soonest.label}</div>
            <div className="dueStrength">
              <Term id="strengthBand">{strengthLabel(soonest.strength)}</Term>
              <span className="dueBar" aria-hidden="true">
                <span className="dueFill" style={{ width: `${Math.round(soonest.strength * 100)}%` }} />
              </span>
            </div>
            <p className="dueReason">{soonest.reason}</p>
            <div className="dataRow">
              <button
                className="newBtn"
                disabled={Boolean(busyWith)}
                onClick={() => onPractice(soonest.technique, variant)}
              >
                {busyWith === soonest.technique
                  ? 'Finding a puzzle…'
                  : `Practise ${soonest.label}`}
                {/* The board comes from the picker below, which is out of sight
                    when it is not the default. Say which one this will be. */}
                {variant !== 'classic' &&
                  ` on ${VARIANT_LIST.find(v => v.id === variant)?.name || variant}`}
              </button>
              {onCards && soonest.technique !== 'nakedSingle' && (
                <button
                  className="newBtn"
                  disabled={Boolean(busyWith)}
                  onClick={() => onCards(soonest.technique)}
                >
                  {busyWith === 'cards:' + soonest.technique ? 'Dealing…' : 'Flashcards'}
                </button>
              )}
            </div>
            {error && !busyWith && <p className="techError">{error}</p>}
          </div>
        ) : (
          <p className="dataNote">{nothingDue(games)}</p>
        )
      )}

      {/* This paragraph used to say what the glossary says, in different
          words. One source, and there is a full column for it. */}
      <Explain id="practice" />

      {/* Six words the rows below use and nothing defines: what makes a rung
          due, what the four strength words mean, and why a rung nothing knows
          about is called thin rather than weak. A row is a button, so a trigger
          cannot live inside one; they live here instead, above the list they
          describe. */}
      <TermGroup>
        <p className="termHint">
          The words on these rows: <Term id="spacedRepetition" />{' · '}<Term id="due" />
          {' · '}<Term id="waiting" />{' · '}<Term id="thin" />{' · '}<Term id="strength" />
          {' · '}<Term id="strengthBand" />{' · '}<Term id="interval" />{' · '}
          <Term id="flashcards" />
        </p>
        {/* The vocabulary every technique below is written in. This screen is
            the app's technique reference, so it is the one place where the
            words the explanations lean on are worth having in reach. */}
        <p className="termHint">
          The words the patterns are written in: <Term id="candidate" />{' · '}<Term id="unit" />
          {' · '}<Term id="peer" />{' · '}<Term id="given" />{' · '}<Term id="ladder" />
          {' · '}<Term id="technique" />
        </p>
      </TermGroup>

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
        {rungs.map(key => {
          const t = TECHNIQUES[key]
          const used = hints?.counts?.[key] || 0
          const isOpen = open === key
          const busy = busyWith === key
          const sched = byTechnique.get(key)
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
                {/* The schedule's own word for it, so a row says where it
                    stands without having to be opened. A rung the record has
                    never seen carries nothing rather than a zero. */}
                {sched && (
                  <span className={'techBand b' + sched.band + (sched.dueNow ? ' due' : '')}>
                    {sched.dueNow ? 'due · ' : ''}
                    {strengthLabel(sched.strength)}
                  </span>
                )}
                {used > 0 && (
                  <span className="techHints" title={`${used} hints on this`}>
                    {used} {used === 1 ? 'hint' : 'hints'}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="techBody">
                  {/* Through the glossary rather than off TECHNIQUES, so the
                      review, the flashcards and this reference all go through
                      one door to the same sentence. */}
                  <p className="techAbout">{define(techniqueTerm(key))?.definition}</p>
                  {/* Why it is where it is in the schedule. Every claim states
                      the sample it rests on, the same bar the coach holds to. */}
                  {sched && <p className="techAbout dueReason">{sched.reason}</p>}
                  <div className="dataRow">
                    <button className="newBtn" disabled={Boolean(busyWith)} onClick={() => onPractice(key, variant)}>
                      {busy ? 'Finding a puzzle…' : `Practise ${t.label}`}
                    </button>
                    {/* A whole puzzle teaches the pattern once in ten minutes.
                        Cards ask the same question twenty times in three.

                        Not offered on the cage rungs: `buildDeck` deals from
                        classic grids, so the button would spend twelve seconds
                        finding nothing and blame the rarity of the pattern.
                        Dealing killer positions is a real piece of work and is
                        deliberately not started here. */}
                    {onCards && key !== 'nakedSingle' && !CAGE_TECHNIQUES.includes(key) && (
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
