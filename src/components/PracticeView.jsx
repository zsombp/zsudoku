import { Suspense, useEffect, useMemo, useState } from 'react'
import { TECHNIQUES, LADDER, CAGE_TECHNIQUES } from '../logic/techniques.js'
import * as gameLog from '../lib/gameLog.js'
import { stuckByTechnique } from '../stats/compute.js'
import { canTeach } from '../logic/teachable.js'
import { allDrills } from '../lib/drillLog.js'
import { drillSummary, learningCurve, predictionSummary } from '../stats/drills.js'
import SpotCurve from './SpotCurve.jsx'
import { TechGlyph } from './Glyphs.jsx'
import { Lesson, bank, moments } from './lazyLesson.js'
import { useLessonState } from './useLessonState.js'
import { VARIANT_LIST } from '../logic/variants.js'
import { schedule, nextUp, nothingDue, strengthLabel } from '../stats/curriculum.js'
import { Explain, Term, TermGroup } from './Term.jsx'
import { define, techniqueTerm } from '../logic/glossary.js'

/**
 * Practice, and the technique reference.
 *
 * Three ways in, in the order they are worth trying. A lesson walks one real
 * position through every way the pattern can go, either a stock example or the
 * last moment the pattern stopped you in a game. A drill deals positions and
 * asks where the pattern is and what it removes, twenty times in three minutes.
 * A full puzzle that needs the pattern is last: ten minutes for one sighting is
 * the slowest way to learn to see something, and it used to be the only one.
 *
 * Every rung of the ladder is listed with what it means and how often it has
 * stopped you, counted against the pattern the position needed rather than the
 * single a hint filled in.
 */
export default function PracticeView({ onPractice, onCards, onClose, busyWith, error }) {
  const [games, setGames] = useState(null)
  const [open, setOpen] = useState(null)
  // Which board to drill on. Spotting a naked pair inside an irregular region
  // is a different skill from spotting one in a square box, so the same rung
  // is worth practising more than one way.
  const [variant, setVariant] = useState('classic')
  const [learning, learn, unlearn] = useLessonState()

  useEffect(() => {
    gameLog.all().then(setGames)
  }, [])

  const stuck = useMemo(() => (games ? stuckByTechnique(games) : null), [games])
  // 0.02ms over a real history, so there is nothing to gain by storing it on a
  // record or recomputing it any less often than the screen opens.
  // Read once per visit: a deck finished on the drill screen is on the record
  // by the time this screen comes back, because coming back remounts it.
  const [drills] = useState(() => allDrills())
  const due = useMemo(() => (games ? schedule(games, { drills }) : []), [games, drills])
  const soonest = useMemo(() => (games ? nextUp(games, { drills }) : null), [games, drills])
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

  // Naked singles need no pattern search. Cage cards carry their own board.
  const drillable = key => key !== 'nakedSingle'

  if (learning) {
    return (
      <Suspense fallback={null}>
        <Lesson
          lesson={learning}
          onClose={unlearn}
          onDrill={onCards && drillable(learning.technique) ? () => onCards(learning.technique) : null}
        />
      </Suspense>
    )
  }

  /** The three ways in, for one rung. Shared by the due card and every row. */
  const ways = key => (
    <div className="dataRow">
      {canTeach(key) && (
        <button className="newBtn" disabled={Boolean(busyWith)} onClick={async () => learn((await bank()).stockLesson(key))}>
          Learn it
        </button>
      )}
      {canTeach(key) && stuck?.counts?.[key] > 0 && (
        <button
          className="newBtn"
          disabled={Boolean(busyWith)}
          onClick={async () => learn((await moments()).latestStuckLesson(games, key))}
        >
          Where it stopped you
        </button>
      )}
      {onCards && drillable(key) && (
        <button className="newBtn" disabled={Boolean(busyWith)} onClick={() => onCards(key)}>
          {busyWith === 'cards:' + key ? 'Dealing…' : 'Drill positions'}
        </button>
      )}
      <button className="newBtn" disabled={Boolean(busyWith)} onClick={() => onPractice(key, variant)}>
        {busyWith === key ? 'Finding a puzzle…' : 'Full puzzle'}
        {/* The board comes from the picker below, which is out of sight when
            it is not the default. Say which one this will be. */}
        {variant !== 'classic' && ` on ${VARIANT_LIST.find(v => v.id === variant)?.name || variant}`}
      </button>
    </div>
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
            <div className="dueTitle">
              <TechGlyph technique={soonest.technique} size={22} />
              {soonest.label.charAt(0).toUpperCase() + soonest.label.slice(1)}
            </div>
            <div className="dueStrength">
              <Term id="strengthBand">{strengthLabel(soonest.strength)}</Term>
              <span className="dueBar" aria-hidden="true">
                <span className="dueFill" style={{ width: `${Math.round(soonest.strength * 100)}%` }} />
              </span>
            </div>
            <p className="dueReason">{soonest.reason}</p>
            {ways(soonest.technique)}
            {error && !busyWith && <p className="techError">{error}</p>}
          </div>
        ) : (
          <p className="dataNote">{nothingDue(games, { drills })}</p>
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
          <Term id="stuck" />{' · '}<Term id="lesson" />{' · '}<Term id="flashcards" />
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
          const used = stuck?.counts?.[key] || 0
          const isOpen = open === key
          const sched = byTechnique.get(key)
          return (
            <div className={'techRow' + (isOpen ? ' open' : '')} key={key}>
              <button
                className="techMain"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
              >
                <span className="techLead">
                  <TechGlyph technique={key} size={20} />
                  <span className="techText">
                    <span className="techName">{t.label}</span>
                    <span className="techShort">{t.short}</span>
                  </span>
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
                  <span className="techHints" title={`It stopped you ${used} ${used === 1 ? 'time' : 'times'}`}>
                    {used} stuck
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
                  {/* What the drills and the lessons' predictions say, which
                      the schedule above already counts. */}
                  {drillSummary(drills, key) && <p className="techAbout">{drillSummary(drills, key).text}</p>}
                  {predictionSummary(drills, key) && <p className="techAbout">{predictionSummary(drills, key).text}</p>}
                  {learningCurve(drills, key).filter(p => p.medianMs != null).length > 1 && (
                    <SpotCurve points={learningCurve(drills, key)} />
                  )}
                  {ways(key)}
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
const RARE = new Set(['nakedQuad', 'swordfish', 'nakedTriple', 'hiddenTriple', 'xWing', 'xyzWing'])
