import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { topologyFromRecord } from '../logic/variants.js'
import ReviewBoard from './ReviewBoard.jsx'
import { Lesson, lessons } from './lazyLesson.js'
import { useLessonState } from './useLessonState.js'
import { cardLabel, isCorrect, removesCorrect, removalCells } from '../logic/flashcards.js'
import { canTeach } from '../logic/teachable.js'
import { recordDeck, allDrills } from '../lib/drillLog.js'
import { learningCurve } from '../stats/drills.js'
import SpotCurve from './SpotCurve.jsx'
import { TechGlyph } from './Glyphs.jsx'
import * as sound from '../lib/sound.js'
import { Explain, Term, TermGroup } from './Term.jsx'
import { define, techniqueTerm } from '../logic/glossary.js'

/**
 * Position drills: find the pattern, then say what it removes.
 *
 * Practice mode gives you a whole puzzle that needs a technique, which takes
 * ten minutes and teaches the pattern once. This shows a position where the
 * pattern is present and asks two questions. Where is it: tap its cells. And
 * what does it buy you: tap the cells it removes a candidate from. The first is
 * recognition, the second is the half a hint never asks, and knowing an X-Wing
 * is there without knowing which notes it kills is not knowing an X-Wing.
 *
 * Every position is real. They come from generated puzzles walked forward to
 * the move the technique actually fires, so no card is a diagram someone drew
 * to make a point. Any card opens as a lesson on its own board.
 */
export default function Flashcards({ technique, deck, onClose, onAgain, onFinish = null, onNext = null, onLater = null }) {
  const [at, setAt] = useState(0)
  const [phase, setPhase] = useState('find')
  const [picked, setPicked] = useState([])
  const [found, setFound] = useState(null)
  const [removed, setRemoved] = useState(null)
  const [score, setScore] = useState({ found: 0, removed: 0, asked: 0 })
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [times, setTimes] = useState([])
  // Patterns found in a row. Shown from two, and replayed on every one after.
  const [run, setRun] = useState(0)
  const [learning, learn, unlearn] = useLessonState()

  const card = deck[at]
  const topo = useMemo(() => topologyFromRecord(card), [card])
  const done = at >= deck.length
  // A single places a digit and removes nothing, so it only gets the first question.
  const asksRemoval = Boolean(card?.eliminations?.length)

  // A fresh card is a fresh clock: the whole point is how fast you see it.
  useEffect(() => {
    setPhase('find')
    setPicked([])
    setFound(null)
    setRemoved(null)
    setStartedAt(Date.now())
  }, [at])

  const toggle = cell => {
    if (phase === 'done') return
    setPicked(p => (p.includes(cell) ? p.filter(c => c !== cell) : [...p, cell]))
  }

  const judgeFind = right => {
    setFound(right ? 'right' : 'wrong')
    setScore(s => ({ ...s, found: s.found + (right ? 1 : 0), asked: s.asked + (asksRemoval ? 1 : 0) }))
    setTimes(t => (right ? [...t, Date.now() - startedAt] : t))
    setRun(r => (right ? r + 1 : 0))
    if (right) sound.unitDone()
    else sound.wrong()
    setPicked([])
    setPhase(asksRemoval ? 'remove' : 'done')
  }

  const judgeRemove = right => {
    setRemoved(right ? 'right' : 'wrong')
    setScore(s => ({ ...s, removed: s.removed + (right ? 1 : 0) }))
    if (right) sound.unitDone()
    else sound.wrong()
    setPhase('done')
  }

  const check = () => {
    if (!card) return
    if (phase === 'find') judgeFind(isCorrect(card, picked))
    else if (phase === 'remove') judgeRemove(removesCorrect(card, picked))
  }

  // The pattern is outlined once the first question is answered, and what it
  // removes is struck through once the second one is.
  const pattern = useMemo(() => {
    if (!card || phase === 'find') return null
    return {
      cells: card.cells,
      digits: card.digits,
      unit: card.unit,
      eliminations: phase === 'done' ? card.eliminations || [] : [],
    }
  }, [card, phase])

  const median = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : null
  // The ladder's labels are lowercase, for use mid-sentence. These start one.
  const Label = cardLabel(technique).charAt(0).toUpperCase() + cardLabel(technique).slice(1)

  // The deck goes on the record once, the moment it ends, so the practice
  // schedule and the learning curve both know about it. A deck abandoned
  // halfway records nothing: half a deck is not a sitting's worth of evidence.
  const recorded = useRef(false)
  const [curve, setCurve] = useState(null)
  useEffect(() => {
    if (!done || recorded.current || !deck.length) return
    recorded.current = true
    recordDeck({
      technique,
      cards: deck.length,
      found: score.found,
      asked: score.asked,
      removed: score.removed,
      spotMs: times,
    })
    setCurve(learningCurve(allDrills(), technique))
    onFinish?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, deck.length, technique, score, times])

  if (learning) {
    return (
      <Suspense fallback={null}>
        <Lesson lesson={learning} onClose={unlearn} />
      </Suspense>
    )
  }

  if (done) {
    const n = deck.length
    const both = score.found + score.removed
    const outOf = n + score.asked
    return (
      <div className="statsView">
        <header className="top">
          <div className="brand">DRILL</div>
          <button className="newBtn" onClick={onClose}>Back</button>
        </header>
        <div className="cardDone">
          <div className="cardScore">{score.found}<span>/{n}</span></div>
          <p className="cardVerdict">
            Found {score.found} of {n}
            {score.asked > 0 && `, and named what it removes ${score.removed} of ${score.asked} times`}.{' '}
            {both === outOf
              ? `Every one${median ? `, ${(median / 1000).toFixed(1)}s a card` : ''}. You know this pattern.`
              : score.found >= n / 2 && score.removed < score.asked / 2
                ? `You can see ${cardLabel(technique)}, but not yet what it buys you. The lesson's world steps are exactly that.`
                : both >= outOf / 2
                  ? `${Label} is coming, but not yet automatic.`
                  : `${Label} is not landing yet. Worth a lesson before more drills.`}
          </p>
          {curve && <SpotCurve points={curve} />}
          {/* The rung's sentence, through the glossary like everywhere else. */}
          <p className="dataNote">{define(techniqueTerm(technique))?.definition}</p>
          {onNext ? (
            // Inside today's session the deck is the middle step, so the end
            // of it points at the last one rather than at another deck.
            <div className="dataRow">
              <button className="newBtn" onClick={onNext}>Next: finish from here</button>
              <button className="linkBtn" onClick={onLater ?? onClose}>not today</button>
            </div>
          ) : (
            <div className="dataRow">
              <button className="newBtn" onClick={onAgain}>Another deck</button>
              <button className="newBtn" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const want = phase === 'remove' ? removalCells(card).length : card.cells.length

  return (
    <div className="statsView">
      <header className="top">
        <div className="brand">DRILL</div>
        <button className="newBtn" onClick={onClose}>Back</button>
      </header>

      {/* The pattern being asked for is the one thing you may not know, and
          the card is timed, so it has to be one press away rather than
          somewhere else. */}
      <TermGroup>
        <div className="cardHead">
          <div className="cardAsk">
            <TechGlyph technique={technique} size={18} className="techGlyph cardAskGlyph" />
            {phase === 'remove' ? 'What does the ' : 'Find the '}
            <Term id={techniqueTerm(technique)} className="cardAskTerm">
              <strong>{cardLabel(technique)}</strong>
            </Term>
            {phase === 'remove' ? ' remove?' : ''}
          </div>
          <div className="cardProgress">
            {run >= 2 && (
              <span className="cardRun" key={run}>
                {run} in a row
              </span>
            )}
            {at + 1} of {deck.length} · {score.found} found
            {score.asked > 0 && ` · ${score.removed} removed`}
          </div>
        </div>
      </TermGroup>
      {/* Once, on the first card. The same line under all twenty would be
          twenty copies of a thing you read in the first three seconds. */}
      {at === 0 && phase === 'find' && <Explain id="flashcards" />}

      <div className="moveStage">
        <ReviewBoard
          topo={topo}
          puzzle={card.board}
          board={card.board}
          cands={card.cands}
          showing="cands"
          pattern={pattern}
          onCell={phase === 'done' ? null : toggle}
          picked={phase === 'done' ? null : picked}
          cellAction={phase === 'remove' ? 'mark as losing a candidate' : 'choose this cell'}
        />
        <div className="stageSide">
          {found && (
            <p className={'cardResult ' + found}>
              {found === 'right' ? 'That is it.' : 'Not quite. It is outlined now.'}
            </p>
          )}
          {phase === 'find' && (
            <>
              <p className="stageNote">Tap the cells the pattern is made of. {want} of them.</p>
              <div className="dataRow">
                <button className="newBtn" disabled={!picked.length} onClick={check}>Check</button>
                <button className="linkBtn" onClick={() => judgeFind(false)}>show me</button>
              </div>
            </>
          )}
          {phase === 'remove' && (
            <>
              <p className="stageNote">
                Now tap every cell it removes a candidate from. {want === 1 ? 'There is one.' : `There are ${want}.`}
              </p>
              <div className="dataRow">
                <button className="newBtn" disabled={!picked.length} onClick={check}>Check</button>
                <button className="linkBtn" onClick={() => judgeRemove(false)}>show me</button>
              </div>
            </>
          )}
          {phase === 'done' && (
            <>
              {removed && (
                <p className={'cardResult ' + removed}>
                  {removed === 'right' ? 'And that is what it removes.' : 'What it removes is struck through now.'}
                </p>
              )}
              <p className="stageWhy">{card.detail}</p>
              <div className="dataRow">
                <button className="newBtn" onClick={() => setAt(a => a + 1)}>
                  {at + 1 === deck.length ? 'Finish' : 'Next card'}
                </button>
                {card.step && canTeach(card.technique) && (
                  <button
                    className="newBtn"
                    onClick={async () => {
                      const { buildLesson } = await lessons()
                      learn(buildLesson({ board: card.board, cands: card.cands, step: card.step, topo, source: 'card' }))
                    }}
                  >
                    Learn it on this board
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
