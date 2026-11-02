import { describe, it, expect } from 'vitest'
import fixtures from '../logic/__fixtures__/solvepaths.json'
import { gameReducer, initialState } from '../state/gameReducer.js'
import { createState, nextStep, applyStep, hintPlacement } from '../logic/grader.js'
import { solve } from '../logic/solver.js'
import { CLASSIC } from '../logic/topology.js'
import { analyseGame, summariseAnalysis } from './analysis.js'
import { isStuck, lessonAtMove, latestStuckLesson } from './moments.js'
import { analyse } from '../logic/lessons.js'

/**
 * A real position from the fixture solves where no digit can be placed until an
 * XY-Wing has fired. The hint there fills a naked single, and everything that
 * judges the player has to blame the XY-Wing instead.
 */
function hardSpot() {
  for (const entry of fixtures.filter(f => f.variant === 'classic')) {
    const puzzle = [...entry.puzzle].map(Number)
    const solution = solve(puzzle)
    const state = createState(puzzle, CLASSIC)
    for (let guard = 0; guard < 800; guard++) {
      const step = nextStep(state)
      if (!step) break
      if (step.technique === 'xyWing') {
        const h = hintPlacement(state.board, solution, CLASSIC)
        if (h?.needed === 'xyWing') return { board: state.board.slice(), solution, hint: h }
      }
      applyStep(state, step)
    }
  }
  return null
}

const spot = hardSpot()

/** A finished-game record whose puzzle is the hard spot itself. */
const record = moveLog => ({
  id: 'test',
  endedAt: 1000,
  completed: true,
  variant: 'classic',
  puzzle: spot.board,
  solution: spot.solution,
  moveLog,
  hintLog: [],
})

describe('the hint knows what the position needed', () => {
  it('fills a single and says an XY-Wing was needed', () => {
    expect(spot).toBeTruthy()
    expect(spot.hint.technique).not.toBe('xyWing')
    expect(spot.hint.needed).toBe('xyWing')
    expect(spot.hint.via.step.technique).toBe('xyWing')
  })

  it('logs what was needed, in the hint log and on the move', () => {
    let s = gameReducer(initialState, {
      type: 'hydrate',
      saved: { puzzle: spot.board, solution: spot.solution, board: spot.board, marks: [], seed: 1, variant: 'classic' },
    })
    s = gameReducer(s, { type: 'hint', hint: spot.hint, t: 5000 })
    expect(s.hintLog.at(-1)).toMatchObject({ technique: spot.hint.technique, needed: 'xyWing' })
    expect(s.moveLog.at(-1)).toMatchObject({ kind: 'hint', needed: 'xyWing' })
  })

  it('logs being shown the pattern, which changes no cell', () => {
    let s = gameReducer(initialState, {
      type: 'hydrate',
      saved: { puzzle: spot.board, solution: spot.solution, board: spot.board, marks: [], seed: 1, variant: 'classic' },
    })
    const before = s.board
    s = gameReducer(s, {
      type: 'explain',
      explain: { cell: spot.hint.cell, digit: spot.hint.digit, technique: 'xyWing', why: 'x', pattern: {} },
      t: 4000,
    })
    expect(s.moveLog.at(-1)).toEqual({ t: 4000, kind: 'shown', cell: spot.hint.cell, value: spot.hint.digit, technique: 'xyWing' })
    expect(s.board).toBe(before)
    expect(s.hints).toBe(0)
  })
})

describe('a digit placed after being shown the way counts as stuck', () => {
  const place = { t: 9000, kind: 'place', cell: spot.hint.cell, value: spot.hint.digit, correct: true }

  it('is not stuck when found alone', () => {
    const { moves } = analyseGame(record([place]))
    expect(moves[0].helped).toBe(false)
    expect(moves[0].needed).toBe('xyWing')
    expect(isStuck(moves[0])).toBe(false)
    expect(summariseAnalysis(record([place])).stuckBy).toEqual({})
  })

  it('is stuck on the XY-Wing when the pattern was shown first', () => {
    const shown = { t: 6000, kind: 'shown', cell: spot.hint.cell, value: spot.hint.digit, technique: 'xyWing' }
    const rec = record([shown, place])
    const { moves } = analyseGame(rec)
    expect(moves[0].helped).toBe(true)
    expect(moves[0].why).toMatch(/^Shown the pattern first\./)
    expect(isStuck(moves[0])).toBe(true)
    const summary = summariseAnalysis(rec)
    expect(summary.stuckBy).toEqual({ xyWing: 1 })
    // And it never counts as a pattern found unaided.
    expect(Object.values(summary.sharpBy).reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('opens that moment as a lesson on the same board', () => {
    const shown = { t: 6000, kind: 'shown', cell: spot.hint.cell, value: spot.hint.digit, technique: 'xyWing' }
    const rec = record([shown, place])
    const { moves } = analyseGame(rec)
    const lesson = lessonAtMove(rec, moves[0])
    expect(lesson.technique).toBe('xyWing')
    expect(lesson.source).toBe('game')
    expect(analyse(lesson).intact).toBe(true)
  })

  it('finds the latest such moment across games', () => {
    const shown = { t: 6000, kind: 'shown', cell: spot.hint.cell, value: spot.hint.digit, technique: 'xyWing' }
    const rec = record([shown, place])
    rec.summary = summariseAnalysis(rec)
    expect(latestStuckLesson([rec], 'xyWing')?.technique).toBe('xyWing')
    expect(latestStuckLesson([rec], 'xWing')).toBeNull()
  })
})
