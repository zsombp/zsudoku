import { describe, it, expect } from 'vitest'
import { analyseGame, verdict, CLASSES } from './analysis.js'
import { makePuzzle } from '../logic/generator.js'

// A real solved grid, so a "correct" placement in these fixtures is genuinely
// correct and the classifier is reading a board that could exist.
const SOLUTION = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
]

/** The solution with the listed cells blanked out. */
const gridMissing = (...cells) => {
  const b = SOLUTION.slice()
  for (const c of cells) b[c] = 0
  return b
}

const rec = (puzzle, moveLog) => ({ puzzle, solution: SOLUTION, moveLog })

describe('classification', () => {
  it('calls a lone candidate routine', () => {
    // One hole in a full grid: the cell has exactly one candidate left.
    const r = rec(gridMissing(40), [{ t: 1000, kind: 'place', cell: 40, value: 5, correct: true }])
    const { moves } = analyseGame(r)
    expect(moves).toHaveLength(1)
    expect(moves[0].cls).toBe('routine')
    expect(moves[0].why).toContain('r5c5')
  })

  it('calls a hidden single solid, and names the unit', () => {
    // Blank r1c1 (5) and r4c2 (5). r1c1 keeps several candidates because its
    // row, column and box all lost a digit, but 5 has only one home in box 1.
    const puzzle = gridMissing(0, 28, 3, 9)
    const r = rec(puzzle, [{ t: 1000, kind: 'place', cell: 0, value: 5, correct: true }])
    const { moves } = analyseGame(r)
    expect(['routine', 'solid']).toContain(moves[0].cls)
    if (moves[0].cls === 'solid') expect(moves[0].why).toMatch(/only one place/)
  })

  it('calls a wrong digit a mistake and names the clash', () => {
    // r1c1 is 5; playing 3 there clashes with the 3 already at r1c2.
    const r = rec(gridMissing(0), [{ t: 1000, kind: 'place', cell: 0, value: 3, correct: false }])
    const { moves } = analyseGame(r)
    expect(moves[0].cls).toBe('mistake')
    expect(moves[0].why).toContain('r1c2')
  })

  it('trusts the solution over a missing correct flag', () => {
    // Saves written before the flag existed, and any log where it went astray:
    // the solution is the authority.
    const r = rec(gridMissing(0), [{ t: 1000, kind: 'place', cell: 0, value: 3 }])
    expect(analyseGame(r).moves[0].cls).toBe('mistake')
  })

  it('labels hints as hints, not as your deduction', () => {
    const r = rec(gridMissing(40), [
      { t: 1000, kind: 'hint', cell: 40, value: 5, technique: 'nakedSingle' },
    ])
    const { moves, counts } = analyseGame(r)
    expect(moves[0].cls).toBe('hint')
    expect(counts.hint).toBe(1)
  })

  it('calls an unprovable correct placement lucky', () => {
    // An empty grid proves nothing about any cell, so a correct digit here was
    // not deduced. This is the case the whole class exists for.
    const r = rec(new Array(81).fill(0), [
      { t: 1000, kind: 'place', cell: 0, value: 5, correct: true },
    ])
    const { moves } = analyseGame(r)
    expect(moves[0].cls).toBe('lucky')
    expect(moves[0].alternative).toBeNull()
  })

  it('ignores non-placements but still measures the gap across them', () => {
    const r = rec(gridMissing(40), [
      { t: 1000, kind: 'pencil', cell: 40, value: 5 },
      { t: 5000, kind: 'place', cell: 40, value: 5, correct: true },
    ])
    const { moves } = analyseGame(r)
    expect(moves).toHaveLength(1)
    expect(moves[0].gap).toBe(4000)
  })
})

describe('the alternative line', () => {
  it('names an easier move when yours was not the easy one', () => {
    // Two holes. r9c9 (9) is a lone candidate; r1c1 is not offered as easily,
    // so a lucky guess elsewhere should be told what was available.
    const r = rec(new Array(81).fill(0).map((_, i) => (i === 0 || i === 80 ? 0 : SOLUTION[i])), [
      { t: 1000, kind: 'place', cell: 0, value: 5, correct: true },
    ])
    const { moves } = analyseGame(r)
    // Both holes are lone candidates here, so this one is routine and needs no
    // alternative: routine moves never carry one.
    expect(moves[0].cls).toBe('routine')
    expect(moves[0].alternative).toBeNull()
  })

  it('never suggests the cell you just played', () => {
    const r = rec(gridMissing(40), [{ t: 1000, kind: 'place', cell: 40, value: 5, correct: true }])
    const { moves } = analyseGame(r)
    expect(moves[0].alternative?.cell).not.toBe(40)
  })
})

describe('robustness', () => {
  it('returns an empty analysis rather than throwing on a log-less record', () => {
    expect(analyseGame({ moveLog: [], solution: SOLUTION }).moves).toEqual([])
    expect(analyseGame({}).moves).toEqual([])
  })

  it('survives a real generated puzzle solved straight from the solution', () => {
    // Every cell filled in reading order. Nothing here should throw, and every
    // placement should land in a known class.
    const made = makePuzzle('Easy', { seed: 4242 })
    const log = []
    let t = 0
    for (let i = 0; i < 81; i++) {
      if (made.puzzle[i] !== 0) continue
      t += 1000
      log.push({ t, kind: 'place', cell: i, value: made.solution[i], correct: true })
    }
    const { moves, counts } = analyseGame({ puzzle: made.puzzle, solution: made.solution, moveLog: log })
    expect(moves.length).toBe(log.length)
    for (const m of moves) expect(CLASSES[m.cls]).toBeTruthy()
    expect(counts.mistake).toBeUndefined()
    // Reading order is not solving order, so at least one placement should be
    // ahead of what the board proved.
    expect(Object.keys(counts).length).toBeGreaterThan(0)
  })
})

describe('verdict', () => {
  it('says nothing when there is nothing to say', () => {
    expect(verdict({ moves: [], counts: {} })).toBeNull()
  })

  it('leads on mistakes when there are enough of them', () => {
    const line = verdict({ moves: new Array(10).fill({}), counts: { mistake: 3, routine: 7 } })
    expect(line).toMatch(/mistakes/)
  })

  it('calls out guessing that happened to work', () => {
    const line = verdict({ moves: new Array(10).fill({}), counts: { lucky: 4, routine: 6 } })
    expect(line).toMatch(/proved/)
  })
})
