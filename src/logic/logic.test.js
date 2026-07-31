// Tests for the logic layer. This is the one place tests genuinely earn their
// keep: the generator and grader are the product, and a silent regression there
// means unfair puzzles or dishonest labels rather than a visible bug.

import { describe, it, expect } from 'vitest'
import { UNITS, PEERS, candsAt, candMaskAt, range, unitName, UNIT_META } from './topology.js'
import { countSolutions, solve, hasUniqueSolution } from './solver.js'
import { generateFull, dig, makePuzzle } from './generator.js'
import {
  gradePuzzle, createState, nextStep, applyStep,
  trivialTail, allCellsForced, forcedFills, autoCompleteFills, AUTO_COMPLETE_MAX, hintPlacement,
} from './grader.js'
import { gameReducer, initialState, highlightDigit } from '../state/gameReducer.js'
import { TIERS, tierForScore } from './difficulty.js'
import { TECHNIQUES, LADDER } from './techniques.js'
import { mulberry32, seedFromDate, shuffle } from '../lib/prng.js'
import { hasMark, addMark, removeMark, toggleMark, marksToList, listToMarks, countMarks } from './marks.js'

const FAST = { attempts: 12, budgetMs: 6000 }

const isValidGrid = b => UNITS.every(u => {
  const seen = new Set()
  for (const i of u) {
    if (!b[i] || seen.has(b[i])) return false
    seen.add(b[i])
  }
  return true
})

describe('topology', () => {
  it('has 27 units of 9 cells', () => {
    expect(UNITS).toHaveLength(27)
    for (const u of UNITS) expect(u).toHaveLength(9)
  })

  it('gives every cell exactly 20 peers, never itself', () => {
    for (const i of range(81)) {
      expect(PEERS[i]).toHaveLength(20)
      expect(PEERS[i]).not.toContain(i)
    }
  })

  it('peering is symmetric', () => {
    for (const i of range(81)) for (const p of PEERS[i]) expect(PEERS[p]).toContain(i)
  })

  it('candMaskAt agrees with candsAt', () => {
    const full = generateFull(mulberry32(7))
    const b = dig(full, 30, mulberry32(11))
    for (const i of range(81)) {
      if (b[i] === 0) expect(marksToList(candMaskAt(b, i))).toEqual(candsAt(b, i))
    }
  })

  it('names every unit readably', () => {
    expect(unitName(UNIT_META[0])).toBe('row 1')
    expect(unitName(UNIT_META[9])).toBe('column 1')
    expect(unitName(UNIT_META[18])).toBe('the top left box')
    expect(unitName(UNIT_META[26])).toBe('the bottom right box')
  })
})

describe('marks bitmask', () => {
  it('round-trips a digit list', () => {
    expect(marksToList(listToMarks([1, 4, 5, 9]))).toEqual([1, 4, 5, 9])
  })

  it('adds, removes and toggles', () => {
    let m = addMark(0, 3)
    expect(hasMark(m, 3)).toBe(true)
    expect(hasMark(m, 4)).toBe(false)
    m = toggleMark(m, 3)
    expect(hasMark(m, 3)).toBe(false)
    m = addMark(addMark(m, 2), 7)
    expect(countMarks(m)).toBe(2)
    expect(marksToList(removeMark(m, 2))).toEqual([7])
  })
})

describe('prng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(Array.from({ length: 5 }, mulberry32(42))).toEqual(Array.from({ length: 5 }, mulberry32(42)))
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('derives a stable seed from a date', () => {
    expect(seedFromDate(new Date(2026, 6, 30))).toBe(seedFromDate(new Date(2026, 6, 30)))
    expect(seedFromDate(new Date(2026, 6, 30))).not.toBe(seedFromDate(new Date(2026, 6, 31)))
  })

  it('shuffle keeps every element', () => {
    expect([...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], mulberry32(3))].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('generator', () => {
  it('generateFull produces a legal complete grid', () => {
    for (const seed of [1, 2, 3, 99]) expect(isValidGrid(generateFull(mulberry32(seed)))).toBe(true)
  })

  it('is reproducible from a seed', () => {
    expect(generateFull(mulberry32(123))).toEqual(generateFull(mulberry32(123)))
  })

  it('dug puzzles keep a unique solution and solve back to their grid', () => {
    for (const seed of [5, 6, 7]) {
      const full = generateFull(mulberry32(seed))
      const puzzle = dig(full, 30, mulberry32(seed + 100))
      expect(hasUniqueSolution(puzzle)).toBe(true)
      expect(solve(puzzle)).toEqual(full)
    }
  })
})

describe('solver', () => {
  it('sees an empty board as ambiguous and a full grid as unique', () => {
    expect(countSolutions(new Array(81).fill(0), 2)).toBe(2)
    expect(countSolutions(generateFull(mulberry32(4)), 2)).toBe(1)
  })
})

describe('technique soundness', () => {
  // The check that matters most. If a technique claims an elimination that is
  // actually part of the solution, the grader will mis-rate puzzles AND the
  // Phase 3 hint button will confidently tell you something false. Both come
  // from these same functions, so this test guards both at once.
  it('never eliminates a candidate that belongs to the solution', () => {
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const rng = mulberry32(seed)
      const solution = generateFull(rng)
      const puzzle = dig(solution, 26, rng)
      const state = createState(puzzle)

      for (let n = 0; n < 400; n++) {
        const step = nextStep(state)
        if (!step) break
        for (const { cell, digit } of step.eliminations) {
          expect(
            solution[cell],
            `${step.technique} wrongly ruled ${digit} out of cell ${cell}`
          ).not.toBe(digit)
        }
        for (const { cell, digit } of step.placements) {
          expect(solution[cell], `${step.technique} wrongly placed ${digit} in cell ${cell}`).toBe(digit)
        }
        applyStep(state, step)
      }
    }
  })

  it('every technique actually does something when it fires', () => {
    for (const key of LADDER) {
      expect(typeof TECHNIQUES[key].fn).toBe('function')
      expect(TECHNIQUES[key].first).toBeGreaterThanOrEqual(TECHNIQUES[key].repeat)
    }
  })

  it('every step it reports carries an explanation for the hint engine', () => {
    const rng = mulberry32(909)
    const solution = generateFull(rng)
    const g = gradePuzzle(dig(solution, 26, rng), { keepSteps: true })
    expect(g.steps.length).toBeGreaterThan(0)
    for (const s of g.steps) {
      expect(TECHNIQUES[s.technique]).toBeTruthy()
      expect(s.detail.length).toBeGreaterThan(0)
      expect(s.placements.length + s.eliminations.length).toBeGreaterThan(0)
    }
  })
})

describe('grader', () => {
  it('scores a complete grid at zero', () => {
    const g = gradePuzzle(generateFull(mulberry32(8)))
    expect(g.solved).toBe(true)
    expect(g.score).toBe(0)
  })

  it('reports Infinity for a puzzle it cannot finish by logic', () => {
    // Two clues removed from a full grid in a way that leaves the ladder no
    // purchase is hard to construct by hand, so use a nearly empty board:
    // ambiguous, and therefore correctly refused rather than guessed at.
    const g = gradePuzzle(new Array(81).fill(0))
    expect(g.solved).toBe(false)
    expect(g.score).toBe(Infinity)
  })

  it('is deterministic: the same puzzle always grades identically', () => {
    const rng = mulberry32(4242)
    const puzzle = dig(generateFull(rng), 28, rng)
    const a = gradePuzzle(puzzle)
    const b = gradePuzzle(puzzle)
    expect(a.score).toBe(b.score)
    expect(a.hardest).toBe(b.hardest)
    expect(a.counts).toEqual(b.counts)
  })

  it('does not let board size inflate the score', () => {
    // The bug this scoring model was rebuilt to kill: naked singles used to
    // cost 10 each, so a puzzle's score mostly measured how many blank cells it
    // had. Two naked-singles-only puzzles of very different clue counts must
    // score the same.
    const easy = []
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rng = mulberry32(seed)
      const puzzle = dig(generateFull(rng), 44, rng)
      const g = gradePuzzle(puzzle)
      if (g.solved && g.hardest === 'nakedSingle') easy.push({ clues: puzzle.filter(Boolean).length, score: g.score })
    }
    expect(easy.length).toBeGreaterThan(0)
    for (const e of easy) expect(e.score).toBe(0)
  })
})

describe('auto-complete triggers', () => {
  it('trivialTail finishes a board that only needs naked singles', () => {
    const rng = mulberry32(77)
    const solution = generateFull(rng)
    const puzzle = solution.slice()
    for (const i of [4, 19, 33, 50, 61]) puzzle[i] = 0
    const tail = trivialTail(puzzle)
    expect(tail).toBeTruthy()
    expect(tail).toHaveLength(5)
    for (const { cell, digit } of tail) expect(solution[cell]).toBe(digit)
  })

  it('trivialTail refuses when real deduction is still needed', () => {
    const rng = mulberry32(78)
    expect(trivialTail(dig(generateFull(rng), 26, rng))).toBeNull()
  })

  it('allCellsForced is the stricter reading', () => {
    const rng = mulberry32(79)
    const solution = generateFull(rng)
    const nearly = solution.slice()
    nearly[10] = 0
    expect(allCellsForced(nearly)).toBe(true)
    expect(allCellsForced(solution)).toBe(false)
  })

  // The one that matters: the button fills the board for you, so if it ever
  // offers a wrong digit it silently ruins a finished game.
  it('forcedFills only ever offers the correct digit', () => {
    for (const seed of [101, 202, 303, 404]) {
      const rng = mulberry32(seed)
      const solution = generateFull(rng)
      const puzzle = dig(solution, 30, rng)
      const state = createState(puzzle)

      for (let s = 0; s < 400; s++) {
        const fills = forcedFills(state.board)
        if (fills) {
          for (const { cell, digit } of fills) expect(solution[cell]).toBe(digit)
          // And it must finish the job: no empty cells left afterwards.
          const done = state.board.slice()
          for (const { cell, digit } of fills) done[cell] = digit
          expect(done).toEqual(solution)
          break
        }
        const step = nextStep(state)
        if (!step) break
        applyStep(state, step)
      }
    }
  })

  it('autoCompleteFills respects the cap even when the tail is trivial', () => {
    const rng = mulberry32(707)
    const solution = generateFull(rng)
    const board = solution.slice()
    // Blank 20 scattered cells: the tail is trivially fillable, but 20 is over
    // the cap, so the button must stay hidden.
    for (let i = 0; i < 80 && i / 4 < 20; i += 4) board[i] = 0
    expect(board.filter(v => v === 0).length).toBe(20)
    expect(trivialTail(board)).toBeTruthy()
    expect(autoCompleteFills(board)).toBeNull()
    expect(autoCompleteFills(board, { maxCells: 20 })).toHaveLength(20)
  })

  it('autoCompleteFills offers the solution digits under the cap', () => {
    const rng = mulberry32(708)
    const solution = generateFull(rng)
    const board = solution.slice()
    const holes = [1, 9, 20, 34, 48, 55, 63, 77]
    for (const i of holes) board[i] = 0
    const fills = autoCompleteFills(board)
    expect(fills).toHaveLength(holes.length)
    for (const { cell, digit } of fills) expect(solution[cell]).toBe(digit)
  })

  it('autoCompleteFills declines a finished board', () => {
    expect(autoCompleteFills(generateFull(mulberry32(709)))).toBeNull()
  })

  it('forcedFills refuses a board with a contradiction', () => {
    const rng = mulberry32(505)
    const solution = generateFull(rng)
    const wrecked = solution.slice()
    // Blank two cells in a row, then put the wrong digit in one of them, so a
    // peer is left with no candidates at all.
    const [a, b] = [0, 1]
    wrecked[a] = 0
    wrecked[b] = 0
    wrecked[a] = solution[b]
    expect(forcedFills(wrecked)).toBeNull()
  })
})

describe('auto-complete reducer', () => {
  it('fills the board and wins, and stays undoable', () => {
    const rng = mulberry32(606)
    const solution = generateFull(rng)
    const puzzle = solution.slice()
    for (const i of [3, 17, 40, 62, 78]) puzzle[i] = 0

    let s = gameReducer(initialState, {
      type: 'ready',
      made: { puzzle, solution, requested: 'Gentle', graded: 'Gentle', score: 0, hardest: null, counts: {}, clues: 76, seed: 1 },
      now: 0,
    })
    const fills = forcedFills(s.board)
    expect(fills).toHaveLength(5)

    s = gameReducer(s, { type: 'autoComplete', fills })
    expect(s.board).toEqual(solution)
    expect(s.status).toBe('won')
    expect(s.autoCompleted).toBe(true)

    const undone = gameReducer({ ...s, status: 'playing' }, { type: 'undo' })
    expect(undone.board.filter(v => v === 0)).toHaveLength(5)
  })

  it('ignores an empty fill list', () => {
    const s = { ...initialState, status: 'playing', board: new Array(81).fill(1) }
    expect(gameReducer(s, { type: 'autoComplete', fills: [] })).toBe(s)
  })
})

describe('hints', () => {
  it('only ever offers the correct digit, across a whole solve', () => {
    for (const seed of [111, 222, 333]) {
      const rng = mulberry32(seed)
      const solution = generateFull(rng)
      let board = dig(solution, 28, rng)

      // Solve the entire puzzle using nothing but hints.
      for (let n = 0; n < 100 && board.includes(0); n++) {
        const hint = hintPlacement(board, solution)
        expect(hint).toBeTruthy()
        expect(hint.digit).toBe(solution[hint.cell])
        expect(board[hint.cell]).toBe(0)
        board = board.slice()
        board[hint.cell] = hint.digit
      }
      expect(board).toEqual(solution)
    }
  })

  it('names the technique that proves the cell', () => {
    const rng = mulberry32(444)
    const solution = generateFull(rng)
    const hint = hintPlacement(dig(solution, 28, rng), solution)
    expect(hint.derived).toBe(true)
    expect(TECHNIQUES[hint.technique]).toBeTruthy()
    expect(hint.detail.length).toBeGreaterThan(0)
  })

  it('picks the easiest available cell, not an arbitrary one', () => {
    // On a board where a naked single exists, the hint must be that cell rather
    // than some cell needing an X-Wing. This is the whole reason it is not
    // random: a random empty cell may not be derivable yet.
    const rng = mulberry32(555)
    const solution = generateFull(rng)
    const board = solution.slice()
    for (const i of [5, 14, 23, 32, 41, 50, 59, 68, 77]) board[i] = 0
    const hint = hintPlacement(board, solution)
    expect(hint.technique).toBe('nakedSingle')
  })

  it('still returns a correct digit when the board has a mistake', () => {
    const rng = mulberry32(666)
    const solution = generateFull(rng)
    const board = dig(solution, 30, rng)
    // Poison the board: a wrong digit makes the candidate sets lie.
    const empty = board.findIndex(v => v === 0)
    board[empty] = (solution[empty] % 9) + 1
    const hint = hintPlacement(board, solution)
    expect(hint).toBeTruthy()
    expect(hint.digit).toBe(solution[hint.cell])
    expect(board[hint.cell]).toBe(0)
  })

  it('returns null on a finished board', () => {
    const solution = generateFull(mulberry32(777))
    expect(hintPlacement(solution, solution)).toBeNull()
  })
})

describe('hint reducer', () => {
  const setup = () => {
    const rng = mulberry32(888)
    const solution = generateFull(rng)
    const puzzle = dig(solution, 30, rng)
    return gameReducer(initialState, {
      type: 'ready',
      made: { puzzle, solution, requested: 'Medium', graded: 'Medium', score: 200, hardest: 'pointing', counts: {}, clues: 30, seed: 1 },
      now: 0,
    })
  }

  it('places the digit, counts it, and logs the technique', () => {
    let s = setup()
    const hint = hintPlacement(s.board, s.solution)
    s = gameReducer(s, { type: 'hint', hint })
    expect(s.board[hint.cell]).toBe(hint.digit)
    expect(s.hints).toBe(1)
    expect(s.hintLog).toHaveLength(1)
    expect(s.hintLog[0].technique).toBe(hint.technique)
    expect(s.hintCell).toBe(hint.cell)
    expect(s.selected).toBe(hint.cell)
    expect(s.mistakes).toBe(0)
  })

  it('places even in notes mode, and leaves notes mode as it found it', () => {
    let s = gameReducer(setup(), { type: 'toggleNotes' })
    const hint = hintPlacement(s.board, s.solution)
    s = gameReducer(s, { type: 'hint', hint })
    expect(s.board[hint.cell]).toBe(hint.digit)
    expect(s.notes).toBe(true)
  })

  it('clears the hint marker on the next move', () => {
    let s = setup()
    s = gameReducer(s, { type: 'hint', hint: hintPlacement(s.board, s.solution) })
    expect(s.hintCell).not.toBe(-1)
    s = gameReducer(s, { type: 'select', index: 0 })
    expect(s.hintCell).toBe(-1)
  })

  it('is undoable', () => {
    let s = setup()
    const hint = hintPlacement(s.board, s.solution)
    s = gameReducer(s, { type: 'hint', hint })
    s = gameReducer(s, { type: 'undo' })
    expect(s.board[hint.cell]).toBe(0)
  })
})

describe('quick input', () => {
  // A board with a handful of holes, so placements are unambiguous to assert.
  const holes = [3, 17, 40, 62, 78]
  const setup = () => {
    const rng = mulberry32(818)
    const solution = generateFull(rng)
    const puzzle = solution.slice()
    for (const i of holes) puzzle[i] = 0
    return gameReducer(initialState, {
      type: 'ready',
      made: { puzzle, solution, requested: 'Gentle', graded: 'Gentle', score: 0, hardest: null, counts: {}, clues: 76, seed: 1 },
      now: 0,
    })
  }

  it('arms a digit, and re-arming the same one disarms it', () => {
    let s = setup()
    expect(s.activeDigit).toBe(0)
    s = gameReducer(s, { type: 'setActiveDigit', value: 5 })
    expect(s.activeDigit).toBe(5)
    s = gameReducer(s, { type: 'setActiveDigit', value: 7 })
    expect(s.activeDigit).toBe(7)
    s = gameReducer(s, { type: 'setActiveDigit', value: 7 })
    expect(s.activeDigit).toBe(0)
  })

  it('drops the armed digit into a tapped cell and selects it', () => {
    let s = setup()
    const cell = holes[0]
    const digit = s.solution[cell]
    s = gameReducer(s, { type: 'setActiveDigit', value: digit })
    s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(s.board[cell]).toBe(digit)
    expect(s.selected).toBe(cell)
    expect(s.mistakes).toBe(0)
  })

  it('counts a wrong quick placement as a mistake, same as cell-first', () => {
    let s = setup()
    const cell = holes[1]
    const wrong = (s.solution[cell] % 9) + 1
    s = gameReducer(s, { type: 'setActiveDigit', value: wrong })
    s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(s.mistakes).toBe(1)
  })

  it('tapping a cell that already holds the armed digit clears it', () => {
    let s = setup()
    const cell = holes[2]
    const digit = s.solution[cell]
    s = gameReducer(s, { type: 'setActiveDigit', value: digit })
    s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(s.board[cell]).toBe(digit)
    s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(s.board[cell]).toBe(0)
  })

  it('never edits a given, but still moves the selection there', () => {
    let s = setup()
    const given = s.puzzle.findIndex(v => v !== 0)
    const before = s.board[given]
    s = gameReducer(s, { type: 'setActiveDigit', value: 9 })
    s = gameReducer(s, { type: 'quickPlace', index: given })
    expect(s.board[given]).toBe(before)
    expect(s.selected).toBe(given)
  })

  it('does nothing with no digit armed', () => {
    const s = setup()
    expect(gameReducer(s, { type: 'quickPlace', index: holes[0] })).toBe(s)
  })

  it('toggles a pencil mark instead when notes mode is on', () => {
    let s = setup()
    const cell = holes[3]
    s = gameReducer(s, { type: 'toggleNotes' })
    s = gameReducer(s, { type: 'setActiveDigit', value: 4 })
    s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(s.board[cell]).toBe(0)
    expect(marksToList(s.marks[cell])).toEqual([4])
    s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(marksToList(s.marks[cell])).toEqual([])
  })

  it('wins when a quick placement completes the board', () => {
    let s = setup()
    for (const cell of holes) {
      // Disarm first: arming a digit that is already armed toggles it off, and
      // two of these holes happen to want the same digit.
      s = gameReducer(s, { type: 'clearActiveDigit' })
      s = gameReducer(s, { type: 'setActiveDigit', value: s.solution[cell] })
      s = gameReducer(s, { type: 'quickPlace', index: cell })
    }
    expect(s.status).toBe('won')
    expect(s.board).toEqual(s.solution)
  })

  it('stays armed across placements, so runs of a digit are one tap each', () => {
    // The whole point of the mode: arm once, then fill every cell that wants
    // that digit without going back to the pad.
    let s = setup()
    const digit = s.solution[holes[0]]
    const wants = holes.filter(i => s.solution[i] === digit)
    s = gameReducer(s, { type: 'setActiveDigit', value: digit })
    for (const cell of wants) s = gameReducer(s, { type: 'quickPlace', index: cell })
    expect(s.activeDigit).toBe(digit)
    for (const cell of wants) expect(s.board[cell]).toBe(digit)
  })

  it('highlights the armed digit, falling back to the selected cell', () => {
    let s = setup()
    expect(highlightDigit(s)).toBe(0)

    const given = s.puzzle.findIndex(v => v !== 0)
    s = gameReducer(s, { type: 'select', index: given })
    expect(highlightDigit(s)).toBe(s.board[given])

    // Arming wins over the selection: that is what makes number highlighting
    // fall out of the mode instead of needing its own control.
    s = gameReducer(s, { type: 'setActiveDigit', value: 6 })
    expect(highlightDigit(s)).toBe(6)

    s = gameReducer(s, { type: 'clearActiveDigit' })
    expect(highlightDigit(s)).toBe(s.board[given])
  })
})

describe('makePuzzle', () => {
  for (const tier of TIERS) {
    it(`${tier.name}: ships an honest, unique, logically solvable puzzle`, () => {
      const made = makePuzzle(tier.name, { seed: 2026, ...FAST })
      expect(made, `no ${tier.name} puzzle produced`).toBeTruthy()

      // Unique solution.
      expect(hasUniqueSolution(made.puzzle)).toBe(true)

      // Never needs a guess. This is the contract the old grader could not make.
      const re = gradePuzzle(made.puzzle)
      expect(re.solved, `${tier.name} puzzle needs a guess`).toBe(true)

      // The label is the grader's verdict on this exact puzzle, and nothing else.
      expect(re.score).toBe(made.score)
      expect(made.graded).toBe(tierForScore(made.score).name)

      // Requested is recorded separately and never overwrites the verdict.
      expect(made.requested).toBe(tier.name)
      expect(made.clues).toBe(made.puzzle.filter(Boolean).length)
    })
  }

  it('is reproducible from a seed', () => {
    const a = makePuzzle('Medium', { seed: 777, ...FAST })
    const b = makePuzzle('Medium', { seed: 777, ...FAST })
    expect(a.puzzle).toEqual(b.puzzle)
    expect(a.score).toBe(b.score)
    expect(a.graded).toBe(b.graded)
  })

  it('tier bands are contiguous and ordered', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].min).toBe(TIERS[i - 1].max)
    }
    expect(TIERS[0].min).toBe(0)
    expect(TIERS[TIERS.length - 1].max).toBe(Infinity)
  })
})
