import { describe, it, expect } from 'vitest'
import { nextRung } from './useHint.js'
import { createState, nextStep, applyStep, hintPlacement } from '../logic/grader.js'
import { askAbout } from '../logic/socratic.js'
import { makePuzzle } from '../logic/generator.js'

describe('which rung a press of the hint button lands on', () => {
  const press = over =>
    nextRung({ asking: false, teaching: false, hasAsk: false, hasExplain: false, ...over })

  it('goes straight to the digit with both teaching settings off', () => {
    // Phase 3 settled that the plain hint is the right default for flow, and
    // adding two rungs below it must not quietly change what the button does
    // for somebody who never asked to be taught.
    expect(press()).toBe('answer')
  })

  it('asks, then points, then fills', () => {
    const on = { asking: true, teaching: true }
    expect(press(on)).toBe('question')
    expect(press({ ...on, hasAsk: true })).toBe('pattern')
    expect(press({ ...on, hasExplain: true })).toBe('answer')
  })

  it('skips the question when only the explanation is asked for', () => {
    expect(press({ teaching: true })).toBe('pattern')
  })

  it('skips the pattern when only the question is asked for', () => {
    // Two independent settings, so a player who wants to be asked but not shown
    // gets a two rung ladder rather than the question being ignored.
    expect(press({ asking: true })).toBe('question')
    expect(press({ asking: true, hasAsk: true })).toBe('answer')
  })

  it('never asks again while a pattern is already on the board', () => {
    // Otherwise clearing the explanation and pressing again would walk back
    // down the ladder instead of up it.
    expect(press({ asking: true, teaching: true, hasExplain: true })).toBe('answer')
  })
})

/**
 * The property the whole ladder rests on: the question and the answer have to
 * be about the same deduction, and nothing in either module enforces that.
 *
 * `askAbout` returns the cheapest step, which may be an elimination.
 * `hintPlacement` returns the cheapest placement, walking past eliminations to
 * find one. They agree only because the ladder is walked in the same order by
 * both, and a change to either could break it without a single test failing.
 */
describe('the question and the hint talk about the same cell', () => {
  it('names the cell the hint would fill, whenever the question is about a placement', () => {
    const seen = { placement: 0, elimination: 0, agreed: 0 }

    for (const tier of ['Gentle', 'Medium', 'Hard', 'Diabolical']) {
      const made = makePuzzle(tier, { seed: 4242 })
      if (!made) continue
      const st = createState(made.puzzle)
      for (let k = 0; k < 40 && st.board.includes(0); k++) {
        const board = st.board.slice()
        const q = askAbout(board, undefined, { solution: made.solution })
        const h = hintPlacement(board, made.solution)
        if (q && h) {
          if (q.placements.length) {
            seen.placement++
            if (q.placements.some(p => p.cell === h.cell)) seen.agreed++
          } else {
            seen.elimination++
          }
        }
        const step = nextStep(st)
        if (!step) break
        applyStep(st, step)
      }
    }

    // Measured over 636 positions from 22 games while this was wired up: 591
    // placements and 45 eliminations, and agreement on all 591.
    expect(seen.placement).toBeGreaterThan(50)
    expect(seen.agreed).toBe(seen.placement)
  })

  it('walks past an elimination question when it is waved away, rather than repeating it', () => {
    // An elimination step changes no digit, so asking again about the same board
    // returns the identical question forever. This is the whole reason `skip`
    // is threaded through the hook.
    const made = makePuzzle('Diabolical', { seed: 4242 })
    const st = createState(made.puzzle)

    let found = null
    for (let k = 0; k < 60 && st.board.includes(0); k++) {
      const board = st.board.slice()
      const q = askAbout(board, undefined, { solution: made.solution })
      if (q && !q.placements.length) { found = board; break }
      const step = nextStep(st)
      if (!step) break
      applyStep(st, step)
    }

    expect(found).not.toBeNull()
    const first = askAbout(found, undefined, { solution: made.solution })
    expect(askAbout(found, undefined, { solution: made.solution }).question).toBe(first.question)
    expect(askAbout(found, undefined, { skip: 1, solution: made.solution }).question).not.toBe(
      first.question
    )
  })
})
