import { describe, it, expect } from 'vitest'
import { makeSessionPuzzle, finishPosition } from './sessionPuzzle.js'
import { createState, nextStep, applyStep, gradePuzzle } from './grader.js'
import { countSolutions } from './solver.js'
import { makePracticePuzzle } from './generator.js'

describe('finish from here', () => {
  it.each(['hiddenSingle', 'pointing', 'nakedPair', 'xyWing'])('keeps %s necessary with fresh candidates and one solution', { timeout: 20000 }, technique => {
    const made = makeSessionPuzzle(technique, { seed: 1234, budgetMs: 10000 })
    expect(made).not.toBeNull()
    expect(made.sessionPuzzle).toBe(true)
    expect(81 - made.clues).toBeGreaterThanOrEqual(25)
    expect(81 - made.clues).toBeLessThanOrEqual(40)
    expect(countSolutions(made.puzzle, 2)).toBe(1)
    const grade = gradePuzzle(made.puzzle)
    expect(grade.solved).toBe(true)
    expect(grade.counts[technique]).toBeGreaterThan(0)
    expect(made.counts).toEqual(grade.counts)
  })

  it('is a real prefix of the ladder and leaves the full practice puzzle intact', () => {
    const made = makePracticePuzzle('pointing', { seed: 1234 })
    const before = structuredClone(made)
    const short = finishPosition(made, 'pointing')
    const state = createState(made.puzzle)
    let reached = false
    for (let i = 0; i < 800; i++) {
      if (state.board.join('') === short.puzzle.join('')) { reached = true; break }
      const step = nextStep(state)
      if (!step) break
      applyStep(state, step)
    }
    expect(reached).toBe(true)
    expect(made).toEqual(before)
  })

  it('refuses a tail that never needs the requested pattern', () => {
    const made = makePracticePuzzle('pointing', { seed: 1234 })
    expect(finishPosition({ ...made, puzzle: made.solution }, 'pointing')).toBeNull()
  })
})
