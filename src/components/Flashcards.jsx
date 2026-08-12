import { useEffect, useMemo, useState } from 'react'
import ReviewBoard from './ReviewBoard.jsx'
import { cardLabel, isCorrect } from '../logic/flashcards.js'
import * as sound from '../lib/sound.js'
import { Explain, Term, TermGroup } from './Term.jsx'
import { define, techniqueTerm } from '../logic/glossary.js'

/**
 * Find the pattern, as fast as you can.
 *
 * Practice mode gives you a whole puzzle that needs a technique, which takes
 * ten minutes and teaches the pattern once. This shows a position where the
 * pattern is present and asks one question: where. Twenty of those in three
 * minutes builds recognition in a way one long solve does not.
 *
 * Every position is real. They come from generated puzzles walked forward to
 * the move the technique actually fires, so no card is a diagram someone drew
 * to make a point.
 */
export default function Flashcards({ technique, deck, onClose, onAgain }) {
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState([])
  const [judged, setJudged] = useState(null)
  const [score, setScore] = useState({ right: 0, wrong: 0 })
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [times, setTimes] = useState([])

  const card = deck[at]
  const done = at >= deck.length

  // A fresh card is a fresh clock: the whole point is how fast you see it.
  useEffect(() => {
    setPicked([])
    setJudged(null)
    setStartedAt(Date.now())
  }, [at])

  const toggle = cell => {
    if (judged) return
    setPicked(p => (p.includes(cell) ? p.filter(c => c !== cell) : [...p, cell]))
  }

  const check = () => {
    if (!card || judged) return
    const right = isCorrect(card, picked)
    setJudged(right ? 'right' : 'wrong')
    setScore(s => ({ right: s.right + (right ? 1 : 0), wrong: s.wrong + (right ? 0 : 1) }))
    setTimes(t => (right ? [...t, Date.now() - startedAt] : t))
    if (right) sound.unitDone()
    else sound.wrong()
  }

  const pattern = useMemo(
    () => (card && judged ? { cells: card.cells, digits: card.digits, unit: card.unit, eliminations: [] } : null),
    [card, judged]
  )

  const median = times.length
    ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]
    : null

  if (done) {
    return (
      <div className="statsView">
        <header className="top">
          <div className="brand">FLASHCARDS</div>
          <button className="newBtn" onClick={onClose}>Back</button>
        </header>
        <div className="cardDone">
          <div className="cardScore">{score.right}<span>/{deck.length}</span></div>
          <p className="cardVerdict">
            {score.right === deck.length
              ? `Every one, ${median ? `${(median / 1000).toFixed(1)}s a card` : ''}. You know this pattern.`
              : score.right >= deck.length / 2
                ? `${cardLabel(technique)} is coming, but not yet automatic.`
                : `${cardLabel(technique)} is not landing yet. Worth a full puzzle rather than more cards.`}
          </p>
          {/* The rung's sentence, through the glossary like everywhere else.
              No fallback to `TECHNIQUES.about`: a second source that only
              appears when the first one fails is a second source, and
              glossary.test.js already fails if a rung has no entry. */}
          <p className="dataNote">{define(techniqueTerm(technique))?.definition}</p>
          <div className="dataRow">
            <button className="newBtn" onClick={onAgain}>Another deck</button>
            <button className="newBtn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="statsView">
      <header className="top">
        <div className="brand">FLASHCARDS</div>
        <button className="newBtn" onClick={onClose}>Back</button>
      </header>

      {/* The pattern being asked for is the one thing you may not know, and
          the card is timed, so it has to be one press away rather than
          somewhere else. The deck's own definition sits under the head, where
          there is the full column for it. */}
      <TermGroup>
        <div className="cardHead">
          <div className="cardAsk">
            Find the{' '}
            <Term id={techniqueTerm(technique)} className="cardAskTerm">
              <strong>{cardLabel(technique)}</strong>
            </Term>
          </div>
          <div className="cardProgress">
            {at + 1} of {deck.length} · {score.right} right
          </div>
        </div>
      </TermGroup>
      {/* Once, on the first card. The same line under all twenty would be
          twenty copies of a thing you read in the first three seconds. */}
      {at === 0 && <Explain id="flashcards" />}

      <div className="moveStage">
        <ReviewBoard
          puzzle={card.board}
          board={card.board}
          cands={card.cands}
          showing="cands"
          pattern={pattern}
          onCell={toggle}
          picked={picked}
          cellAction="choose this cell"
        />
        <div className="stageSide">
          {judged ? (
            <>
              <p className={'cardResult ' + judged}>
                {judged === 'right' ? 'That is it.' : 'Not quite. It is outlined now.'}
              </p>
              <p className="stageWhy">{card.detail}</p>
              <button className="newBtn" onClick={() => setAt(a => a + 1)}>
                {at + 1 === deck.length ? 'Finish' : 'Next card'}
              </button>
            </>
          ) : (
            <>
              <p className="stageNote">
                Tap the cells the pattern is made of. {card.cells.length} of them.
              </p>
              <div className="dataRow">
                <button className="newBtn" disabled={!picked.length} onClick={check}>
                  Check
                </button>
                <button className="linkBtn" onClick={() => { setJudged('wrong'); setScore(s => ({ ...s, wrong: s.wrong + 1 })) }}>
                  show me
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
