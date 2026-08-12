import { useCallback, useEffect, useState } from 'react'
import { hintPlacement } from '../logic/grader.js'
import { explainPlacement } from '../logic/explain.js'
import { askAbout } from '../logic/socratic.js'

/**
 * The hint button, which is a ladder of three rungs rather than one action.
 *
 *   question   names a unit or a digit, and shows nothing at all
 *   pattern    points at the cells, and fills nothing in
 *   answer     writes the digit
 *
 * Each rung is a separate press and each is off by default, because Phase 3
 * settled that the plain hint is the right default for flow and that has not
 * changed. These are rungs below it, not replacements for it. Practice mode
 * turns both on regardless: a drill that hands you the answer is not a drill.
 *
 * ---- why the rungs stay about the same deduction ----
 *
 * `askAbout` returns the cheapest step the ladder can take, which may be an
 * elimination; `hintPlacement` returns the cheapest placement, walking past any
 * eliminations on the way. Nothing makes them agree, so it was measured: over
 * 636 positions taken from 22 real solves, the cheapest step was a placement in
 * 591 of them, and in all 591 the cell the question named was the cell the hint
 * fills. In the other 45 the question is about an elimination and the pattern
 * rung moves on to what that elimination lets you place, which is the honest
 * escalation rather than a second unrelated hint. `src/hooks/useHint.test.js`
 * holds that measurement as a test so a change to either module has to notice.
 *
 * Both calls cost 0.01ms on a Hard partway through, so nothing here is cached.
 *
 * ---- skip ----
 *
 * An elimination step changes no digit, so asking twice about an unchanged board
 * returns the identical question forever. Saying "I see it" takes those
 * eliminations as read and walks past them, which is what `skip` is for. It is
 * bounded inside `askAbout` and resets the moment a digit lands, because a new
 * board is a new question.
 */

/**
 * Which rung a press lands on. Pure, so the sequence can be tested without a
 * board, a reducer or a React tree.
 */
export function nextRung({ asking, teaching, hasAsk, hasExplain }) {
  if (asking && !hasAsk && !hasExplain) return 'question'
  if (teaching && !hasExplain) return 'pattern'
  return 'answer'
}

export function useHint({ stateRef, settingsRef, dispatch, moveCount, status, seed, board }) {
  const [ask, setAsk] = useState(null)

  // Not a ref on purpose: it is read inside a callback that already depends on
  // `ask`, and a value that resets on a board change is easier to reason about
  // as state than as a mutable box.
  const [skip, setSkip] = useState(0)

  // Any move at all answers the question or moves past it, which is the rule
  // KEEPS_EXPLAIN applies to the explanation inside the reducer. Selecting a
  // cell is not a move and deliberately does not clear it: the question names a
  // unit, and looking around that unit is the thing it asked you to do.
  useEffect(() => {
    setAsk(null)
  }, [moveCount, status, seed])

  // A digit landing makes every earlier question a question about a board that
  // no longer exists, so the walk starts again from the cheapest step.
  useEffect(() => {
    setSkip(0)
  }, [board])

  const press = useCallback(() => {
    const s = stateRef.current
    if (!s.board || s.status !== 'playing') return

    const practice = Boolean(s.practice)
    const rung = nextRung({
      asking: settingsRef.current.askFirst || practice,
      teaching: settingsRef.current.explainHints || practice,
      hasAsk: Boolean(ask),
      hasExplain: Boolean(s.explain),
    })

    if (rung === 'question') {
      const q = askAbout(s.board, s.topo, { skip, solution: s.solution })
      // Nothing to ask means the ladder cannot reason about this position at
      // all, which is not a reason to withhold the hint. Fall through.
      if (q) {
        setAsk(q)
        return
      }
    }

    const hint = hintPlacement(s.board, s.solution, s.topo)
    if (!hint) return

    if (rung !== 'answer') {
      const ex = explainPlacement(s.board, hint.cell, hint.digit, s.topo)
      // Nothing proves it, which in practice means a wrong digit is poisoning
      // the position. There is nothing honest to point at, so just place it.
      if (ex) {
        setAsk(null)
        dispatch({ type: 'explain', explain: { ...ex, cell: hint.cell, digit: hint.digit } })
        return
      }
    }

    setAsk(null)
    dispatch({ type: 'hint', hint })
  }, [ask, skip, dispatch, stateRef, settingsRef])

  return {
    ask,
    press,
    /** Taking the eliminations as read, and asking about what is behind them. */
    seen: useCallback(() => {
      setSkip(n => n + 1)
      setAsk(null)
    }, []),
  }
}
