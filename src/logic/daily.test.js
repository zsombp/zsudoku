import { describe, it, expect } from 'vitest'
import { dayKey, dailyTier, dailySeed, dailyPlan, weekdayName, dailyStreak } from './daily.js'
import { seedFromDate, mulberry32 } from '../lib/prng.js'
import { makePuzzle, makePracticePuzzle } from './generator.js'
import { achievements, earnedCount } from '../stats/achievements.js'
import { gameReducer, initialState } from '../state/gameReducer.js'
import { generateFull, dig } from './generator.js'
import { PEERS } from './topology.js'
import { hasMark } from './marks.js'
import { hasUniqueSolution } from './solver.js'
import { gradePuzzle } from './grader.js'
import { tierForScore } from './difficulty.js'
import { TECHNIQUES, LADDER } from './techniques.js'

describe('daily plan', () => {
  it('keys by local date', () => {
    expect(dayKey(new Date(2026, 6, 5))).toBe('2026-07-05')
    expect(dayKey(new Date(2026, 11, 25))).toBe('2026-12-25')
  })

  it('rises through the week like a crossword', () => {
    // 2026-07-27 is a Monday.
    const monday = new Date(2026, 6, 27)
    expect(weekdayName(monday)).toBe('Monday')
    expect(dailyTier(monday)).toBe('Gentle')
    expect(dailyTier(new Date(2026, 6, 31))).toBe('Hard') // Friday
    expect(dailyTier(new Date(2026, 7, 1))).toBe('Expert') // Saturday
    expect(dailyTier(new Date(2026, 7, 2))).toBe('Diabolical') // Sunday
  })

  it('gives the same seed for a date and a different one for the next', () => {
    const a = dailySeed(new Date(2026, 6, 30))
    const b = dailySeed(new Date(2026, 6, 30))
    const c = dailySeed(new Date(2026, 6, 31))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('is offset from the plain date seed', () => {
    // Otherwise the daily and a casual game seeded the same way could be the
    // identical puzzle.
    const d = new Date(2026, 6, 30)
    expect(dailySeed(d)).not.toBe(seedFromDate(d))
  })

  it('produces the identical puzzle for the same day, which is the whole point', () => {
    const d = new Date(2026, 6, 29)
    const plan = dailyPlan(d)
    const a = makePuzzle(plan.tier, { seed: plan.seed, attempts: 6, budgetMs: 8000 })
    const b = makePuzzle(plan.tier, { seed: plan.seed, attempts: 6, budgetMs: 8000 })
    expect(a.puzzle).toEqual(b.puzzle)
    expect(a.graded).toBe(b.graded)
  })
})

describe('daily streak', () => {
  const rec = (dayKey, completed = true) => ({ daily: true, completed, dayKey })

  it('counts consecutive days up to today', () => {
    const games = [rec('2026-07-28'), rec('2026-07-29'), rec('2026-07-30')]
    const s = dailyStreak(games, '2026-07-30')
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
    expect(s.doneToday).toBe(true)
  })

  it('stays alive on the day after the last one', () => {
    const s = dailyStreak([rec('2026-07-29'), rec('2026-07-30')], '2026-07-31')
    expect(s.current).toBe(2)
    expect(s.doneToday).toBe(false)
  })

  it('breaks after a missed day', () => {
    const s = dailyStreak([rec('2026-07-25'), rec('2026-07-26')], '2026-07-30')
    expect(s.current).toBe(0)
    expect(s.longest).toBe(2)
  })

  it('ignores casual games and unfinished dailies', () => {
    const games = [
      { daily: false, completed: true, dayKey: '2026-07-30' },
      rec('2026-07-30', false),
    ]
    expect(dailyStreak(games, '2026-07-30').current).toBe(0)
  })

  it('handles a month boundary', () => {
    const s = dailyStreak([rec('2026-07-31'), rec('2026-08-01')], '2026-08-01')
    expect(s.current).toBe(2)
  })
})

describe('achievements', () => {
  const game = (over = {}) => ({
    completed: true,
    graded: 'Medium',
    durationMs: 400000,
    endedAt: Date.parse('2026-07-20T12:00:00'),
    mistakes: 0,
    hints: 0,
    moveLog: [],
    daily: false,
    ...over,
  })

  it('awards none on an empty history but still lists them all', () => {
    const list = achievements([])
    expect(list.length).toBeGreaterThan(10)
    expect(list.every(a => !a.earned)).toBe(true)
  })

  it('awards the first solve, and not the tenth', () => {
    const list = achievements([game()])
    expect(list.find(a => a.id === 'first').earned).toBe(true)
    expect(list.find(a => a.id === 'ten').earned).toBe(false)
  })

  it('tracks progress toward a counter', () => {
    const five = Array.from({ length: 5 }, () => game())
    const ten = achievements(five).find(a => a.id === 'ten')
    expect(ten.progress).toBeCloseTo(0.5)
    expect(ten.detail).toBe('5/10')
  })

  it('counts a clean solve as no hints and no mistakes', () => {
    expect(achievements([game({ mistakes: 1 })]).find(a => a.id === 'clean').earned).toBe(false)
    expect(achievements([game()]).find(a => a.id === 'clean').earned).toBe(true)
  })

  it('awards the no-pencil badge only above Hard and only without marks', () => {
    const withMarks = game({ graded: 'Expert', moveLog: [{ kind: 'pencil' }] })
    expect(achievements([withMarks]).find(a => a.id === 'no-pencil').earned).toBe(false)
    expect(achievements([game({ graded: 'Expert' })]).find(a => a.id === 'no-pencil').earned).toBe(true)
    expect(achievements([game({ graded: 'Easy' })]).find(a => a.id === 'no-pencil').earned).toBe(false)
  })

  it('never reports progress above 1', () => {
    const many = Array.from({ length: 250 }, () => game())
    for (const a of achievements(many)) expect(a.progress).toBeLessThanOrEqual(1)
  })

  it('counts earned badges', () => {
    expect(earnedCount([])).toBe(0)
    expect(earnedCount([game()])).toBeGreaterThan(0)
  })

  it('never throws on malformed records', () => {
    expect(() => achievements([{}, { completed: true }, game()])).not.toThrow()
  })
})

describe('pencil marks stay true', () => {
  const setup = () => {
    const rng = mulberry32(4321)
    const solution = generateFull(rng)
    const puzzle = dig(solution, 30, rng)
    let s = gameReducer(initialState, {
      type: 'ready',
      made: { puzzle, solution, requested: 'Medium', graded: 'Medium', score: 200, hardest: 'pointing', counts: {}, clues: 30, seed: 1 },
      now: 0,
    })
    return gameReducer(s, { type: 'autoPencil' })
  }

  const peersHolding = (s, cell, digit) => {
    let n = 0
    for (const p of PEERS[cell]) if (hasMark(s.marks[p], digit)) n++
    return n
  }

  it('erasing a digit puts back the marks it stripped', () => {
    let s = setup()
    const cell = s.board.findIndex((v, i) => v === 0 && s.puzzle[i] === 0)
    const digit = s.solution[cell]
    const before = peersHolding(s, cell, digit)
    expect(before).toBeGreaterThan(0)

    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: digit })
    expect(peersHolding(s, cell, digit)).toBe(0)

    s = gameReducer(s, { type: 'erase' })
    expect(peersHolding(s, cell, digit)).toBe(before)
  })

  it('overwriting a digit puts back the first one it stripped', () => {
    let s = setup()
    const cell = s.board.findIndex((v, i) => v === 0 && s.puzzle[i] === 0)
    const first = s.solution[cell]
    const second = (first % 9) + 1
    const before = peersHolding(s, cell, first)

    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: first })
    s = gameReducer(s, { type: 'digit', value: second })
    expect(peersHolding(s, cell, first)).toBe(before)
  })

  it('undo restores marks and the ledger together', () => {
    let s = setup()
    const cell = s.board.findIndex((v, i) => v === 0 && s.puzzle[i] === 0)
    const digit = s.solution[cell]
    const before = JSON.stringify(Array.from(s.marks))

    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: digit })
    s = gameReducer(s, { type: 'undo' })
    expect(JSON.stringify(Array.from(s.marks))).toBe(before)
    // And erasing afterwards must not double-restore.
    s = gameReducer(s, { type: 'digit', value: digit })
    s = gameReducer(s, { type: 'erase' })
    expect(JSON.stringify(Array.from(s.marks))).toBe(before)
  })
})

describe('redo', () => {
  const setup = () => {
    const rng = mulberry32(5555)
    const solution = generateFull(rng)
    const puzzle = dig(solution, 30, rng)
    return gameReducer(initialState, {
      type: 'ready',
      made: { puzzle, solution, requested: 'Medium', graded: 'Medium', score: 200, hardest: 'pointing', counts: {}, clues: 30, seed: 1 },
      now: 0,
    })
  }

  it('goes back forward again', () => {
    let s = setup()
    const cell = s.board.findIndex((v, i) => v === 0 && s.puzzle[i] === 0)
    const digit = s.solution[cell]
    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: digit })
    s = gameReducer(s, { type: 'undo' })
    expect(s.board[cell]).toBe(0)
    expect(s.future).toHaveLength(1)
    s = gameReducer(s, { type: 'redo' })
    expect(s.board[cell]).toBe(digit)
    expect(s.future).toHaveLength(0)
  })

  it('a new move drops the redo branch', () => {
    let s = setup()
    const cells = s.board.map((v, i) => (v === 0 && s.puzzle[i] === 0 ? i : -1)).filter(i => i >= 0)
    s = gameReducer(s, { type: 'select', index: cells[0] })
    s = gameReducer(s, { type: 'digit', value: s.solution[cells[0]] })
    s = gameReducer(s, { type: 'undo' })
    expect(s.future).toHaveLength(1)
    s = gameReducer(s, { type: 'select', index: cells[1] })
    s = gameReducer(s, { type: 'digit', value: s.solution[cells[1]] })
    expect(s.future).toHaveLength(0)
  })

  it('does nothing with an empty redo stack', () => {
    const s = setup()
    expect(gameReducer(s, { type: 'redo' })).toBe(s)
  })
})

describe('practice puzzles', () => {
  // Only the fast rungs are exercised here. The rare ones are measured by
  // scripts/practice.mjs, which has a real time budget; putting a Swordfish
  // search in the unit suite would make it take ten seconds.
  for (const key of ['hiddenSingle', 'pointing', 'nakedPair', 'xyWing']) {
    it(`${key}: the puzzle actually requires it`, () => {
      const made = makePracticePuzzle(key, { seed: 777, budgetMs: 15000 })
      expect(made, `no ${key} puzzle found`).toBeTruthy()
      expect(made.practice).toBe(key)

      // The contract: unique, solvable by logic, and genuinely needs the thing.
      expect(hasUniqueSolution(made.puzzle)).toBe(true)
      const re = gradePuzzle(made.puzzle)
      expect(re.solved).toBe(true)
      expect(re.counts[key]).toBeGreaterThan(0)

      // And it is still labelled by the grader, not by what was asked for.
      expect(made.graded).toBe(tierForScore(re.score).name)
    })
  }

  it('is reproducible from a seed', () => {
    const a = makePracticePuzzle('pointing', { seed: 31337, budgetMs: 15000 })
    const b = makePracticePuzzle('pointing', { seed: 31337, budgetMs: 15000 })
    expect(a.puzzle).toEqual(b.puzzle)
  })

  it('gives up rather than spinning when the budget runs out', () => {
    // A budget too small to find anything must return null, not hang.
    const made = makePracticePuzzle('swordfish', { seed: 1, budgetMs: 1 })
    expect(made).toBeNull()
  })

  it('every technique has something to show in the practice list', () => {
    for (const key of LADDER) {
      expect(TECHNIQUES[key].short, `${key} has no short label`).toBeTruthy()
      expect(TECHNIQUES[key].about.length, `${key} has no explanation`).toBeGreaterThan(20)
    }
  })
})

describe('hard-puzzle tools', () => {
  const setup = () => {
    const rng = mulberry32(2468)
    const solution = generateFull(rng)
    const puzzle = dig(solution, 30, rng)
    return gameReducer(initialState, {
      type: 'ready',
      made: { puzzle, solution, requested: 'Hard', graded: 'Hard', score: 500, hardest: 'nakedPair', counts: {}, clues: 30, seed: 1 },
      now: 0,
    })
  }
  const firstEmpty = s => s.board.findIndex((v, i) => v === 0 && s.puzzle[i] === 0)

  it('returns the whole position, not just the board', () => {
    let s = gameReducer(setup(), { type: 'autoPencil' })
    const cell = firstEmpty(s)
    s = gameReducer(s, { type: 'cycleTint', index: cell })
    s = gameReducer(s, { type: 'bookmark' })
    const marks = JSON.stringify(Array.from(s.marks))

    // Wander off: place a digit and repaint a cell.
    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: s.solution[cell] })
    s = gameReducer(s, { type: 'cycleTint', index: cell + 1 })
    expect(s.board[cell]).not.toBe(0)

    s = gameReducer(s, { type: 'returnToBookmark' })
    expect(s.board[cell]).toBe(0)
    expect(JSON.stringify(Array.from(s.marks))).toBe(marks)
    expect(s.tints[cell]).toBe(1)
    expect(s.tints[cell + 1]).toBeUndefined()
  })

  it('clears the bookmark once used, so the button flips back', () => {
    let s = gameReducer(setup(), { type: 'bookmark' })
    expect(s.bookmark).toBeTruthy()
    s = gameReducer(s, { type: 'returnToBookmark' })
    expect(s.bookmark).toBeNull()
    // And returning again does nothing rather than throwing.
    expect(gameReducer(s, { type: 'returnToBookmark' })).toBe(s)
  })

  it('makes the return itself undoable', () => {
    // Returning by mistake must not cost you the branch you were exploring.
    let s = setup()
    const cell = firstEmpty(s)
    s = gameReducer(s, { type: 'bookmark' })
    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: s.solution[cell] })
    const explored = s.board[cell]
    s = gameReducer(s, { type: 'returnToBookmark' })
    expect(s.board[cell]).toBe(0)
    s = gameReducer(s, { type: 'undo' })
    expect(s.board[cell]).toBe(explored)
  })

  it('cycles a tint through four colours and back to none', () => {
    let s = setup()
    const seen = []
    for (let i = 0; i < 5; i++) {
      s = gameReducer(s, { type: 'cycleTint', index: 3 })
      seen.push(s.tints[3] ?? 0)
    }
    expect(seen).toEqual([1, 2, 3, 4, 0])
  })

  it('carries tints through undo', () => {
    let s = setup()
    s = gameReducer(s, { type: 'cycleTint', index: 7 })
    const cell = firstEmpty(s)
    s = gameReducer(s, { type: 'select', index: cell })
    s = gameReducer(s, { type: 'digit', value: s.solution[cell] })
    s = gameReducer(s, { type: 'cycleTint', index: 7 })
    expect(s.tints[7]).toBe(2)
    s = gameReducer(s, { type: 'undo' })
    expect(s.tints[7]).toBe(1)
  })

  it('clears every tint at once', () => {
    let s = setup()
    for (const i of [1, 2, 3]) s = gameReducer(s, { type: 'cycleTint', index: i })
    s = gameReducer(s, { type: 'clearTints' })
    expect(Object.keys(s.tints)).toHaveLength(0)
  })
})
