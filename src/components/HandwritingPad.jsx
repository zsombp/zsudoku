import { useCallback, useEffect, useRef, useState } from 'react'
import { recognise } from '../lib/handwriting.js'
import { rowOf, colOf } from '../logic/topology.js'

/**
 * Write a digit with a finger, see what it was read as, then say yes.
 *
 * Three decisions worth keeping, because each rules something out.
 *
 * IT IS NOT ON THE BOARD. "Draw on the cell" is the obvious design and it does
 * not survive contact with the device this app is for. A cell on a 350px phone
 * board is 39px across and the contact patch of a fingertip is about 40px, so
 * there is no room to draw anything. Worse, ink on a cell would have to share
 * the gesture space with tapping to select and holding to tint, and one of the
 * three would have to lose. So the cell is chosen the way it always was and the
 * digit is written large, somewhere else.
 *
 * NOTHING IS COMMITTED BY DRAWING. The recogniser is wrong somewhere between
 * one time in seventy and one in six depending on how steady the hand is, and
 * it cannot tell a shape that is not a digit from one that is: see the note on
 * UNSURE_MARGIN. A misread written straight onto the board would be a mistake
 * against the player's record that the player did not make. Every path here
 * ends at a button.
 *
 * IT RE-READS ON EVERY STROKE RATHER THAN WAITING. A 4 or a crossed 7 is two
 * strokes with a pause in the middle, so the obvious implementation waits a few
 * hundred milliseconds after the pen lifts before deciding. That delay is
 * visible on every single-stroke digit, which is most of them, and the length
 * of it would be a guess about how long people pause. Reading again after each
 * stroke costs 0.054ms and needs no such guess: the answer simply updates when
 * the second stroke lands.
 */

// Points closer together than this are the same place twice. A pointer reports
// faster than a finger moves, so most of what arrives is sub-pixel tremor, and
// keeping it makes a longer polyline that says nothing new.
const MIN_STEP = 1.5

const cellName = i => `r${rowOf(i) + 1}c${colOf(i) + 1}`

/**
 * What the row under the ink offers, given a reading and where it would go.
 *
 * Out here as a function rather than inline in the markup so the promise the
 * whole feature rests on can be tested: THERE IS NOTHING TO PRESS UNTIL THERE
 * IS A READING, AND NOTHING HAPPENS UNTIL IT IS PRESSED. Written inline it
 * would be four conditionals inside JSX, which nothing without a browser can
 * ask a question of.
 *
 * `place` is a list because a misread is common enough that the correction has
 * to be as easy as the confirmation, and the recogniser already ranks the
 * digits by how close each came.
 */
export function offerFor(guess, { editable, notes }) {
  if (!guess) return { place: [], caveat: null }
  return {
    digit: guess.digit,
    sure: guess.sure,
    // Three, not nine. The number pad above already reaches all nine, and a
    // second row of nine here would be the number pad wearing a disguise.
    place: [guess.digit, ...guess.alternatives.filter(d => d !== guess.digit).slice(0, 3)],
    label: `${notes ? 'Pencil in' : 'Place'} ${guess.digit}`,
    enabled: Boolean(editable),
    // Said out loud, because a guess that looks the same whether it was certain
    // or a coin toss is the dishonest version of this feature.
    caveat: guess.sure ? null : 'not certain, check before placing',
  }
}

export default function HandwritingPad({ selected, editable, notes, onCommit }) {
  const [strokes, setStrokes] = useState([])
  const [guess, setGuess] = useState(null)
  const [open, setOpen] = useState(true)
  const surfaceRef = useRef(null)
  const liveRef = useRef(null)
  // The stroke being drawn lives in a ref and is written straight onto one SVG
  // element. Putting it in state instead re-renders the whole panel on every
  // pointermove, which on a finger drag is a hundred renders a second for a
  // picture that is one line long.
  const drawing = useRef(null)
  const pointer = useRef(null)

  const clear = useCallback(() => {
    setStrokes([])
    setGuess(null)
    drawing.current = null
    if (liveRef.current) liveRef.current.setAttribute('points', '')
  }, [])

  // A new cell is a new digit. Leaving the old ink up would invite confirming a
  // guess about the cell you just left.
  useEffect(() => { clear() }, [selected, clear])

  const at = e => {
    const box = surfaceRef.current.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  const onDown = e => {
    // One finger. A second touch during a stroke is a palm, not a digit.
    if (pointer.current !== null) return
    pointer.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = [at(e)]
    liveRef.current?.setAttribute('points', '')
  }

  const onMove = e => {
    if (pointer.current !== e.pointerId || !drawing.current) return
    const p = at(e)
    const last = drawing.current[drawing.current.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) return
    drawing.current.push(p)
    liveRef.current?.setAttribute('points', drawing.current.map(q => `${q.x},${q.y}`).join(' '))
  }

  const onUp = e => {
    if (pointer.current !== e.pointerId) return
    pointer.current = null
    const done = drawing.current
    drawing.current = null
    liveRef.current?.setAttribute('points', '')
    // A tap on the pad is not ink, and neither is a stroke the browser took
    // away halfway through.
    if (!done || done.length < 2 || e.type === 'pointercancel') return
    const next = [...strokes, done]
    setStrokes(next)
    setGuess(recognise(next))
  }

  const place = digit => {
    onCommit(digit)
    clear()
  }

  if (!open) {
    return (
      <button className="hwOpen" onClick={() => setOpen(true)}>
        Write a digit
      </button>
    )
  }

  const offer = offerFor(guess, { editable, notes })

  return (
    <section className="hwPad">
      <div className="hwHead">
        <span className="hwWhere">
          {selected < 0
            ? 'Tap a cell on the board first'
            : editable
              ? `Writing into ${cellName(selected)}`
              : 'That cell cannot be changed'}
        </span>
        <button className="linkBtn" onClick={() => setOpen(false)}>hide</button>
      </div>

      <div className="hwSurfaceWrap">
        <svg
          ref={surfaceRef}
          className="hwSurface"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          /* Not focusable and not in the tab order: the number pad above is the
             route for anyone who is not drawing, and it reaches all nine. The
             label is here so that what has been read is announced rather than
             only drawn. */
          role="img"
          aria-label={
            guess
              ? `Writing pad, read as ${guess.digit}${guess.sure ? '' : ', not certain'}`
              : 'Writing pad. Draw a digit here with a finger.'
          }
        >
          {/* Where the digit goes. Not a grid: two faint rules are enough to
              say "write between these" and anything more would be read as a
              cell to fill in, which is the one thing this is not. */}
          <line className="hwRule" x1="0" y1="18%" x2="100%" y2="18%" />
          <line className="hwRule" x1="0" y1="86%" x2="100%" y2="86%" />
          {strokes.map((s, i) => (
            <polyline key={i} className="hwInk" points={s.map(p => `${p.x},${p.y}`).join(' ')} />
          ))}
          <polyline ref={liveRef} className="hwInk" points="" />
        </svg>
        {!strokes.length && <div className="hwPrompt" aria-hidden="true">draw here</div>}
      </div>

      {/* Everything below is the confirmation. The guess is never applied by
          arriving, only by being pressed. */}
      <div className="hwResult" aria-live="polite">
        {offer.place.length ? (
          <>
            <span className={'hwGuess' + (offer.sure ? '' : ' unsure')}>{offer.digit}</span>
            <div className="hwActions">
              <button className="hwPlace" disabled={!offer.enabled} onClick={() => place(offer.digit)}>
                {offer.label}
              </button>
              {/* Ordered by how close each came, so a misread is usually one tap
                  from right. The number pad above still reaches all nine. */}
              <span className="hwAlts">
                or
                {offer.place.slice(1).map(d => (
                  <button key={d} className="hwAlt" disabled={!offer.enabled} onClick={() => place(d)}>
                    {d}
                  </button>
                ))}
              </span>
              <button className="linkBtn" onClick={clear}>clear</button>
            </div>
            {offer.caveat && <span className="hwUnsure">{offer.caveat}</span>}
          </>
        ) : (
          <span className="hwIdle">
            {strokes.length ? 'Not enough ink to read.' : 'Nothing is placed until you press.'}
          </span>
        )}
      </div>
    </section>
  )
}
