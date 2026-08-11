import { describe, it, expect } from 'vitest'
import { explainPlacement, workedExamples, settledCands } from './explain.js'
import { makePuzzle } from './generator.js'
import { createState } from './grader.js'
import { marksToList } from './marks.js'
import { TECHNIQUES } from './techniques.js'

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

const gridMissing = (...cells) => {
  const b = SOLUTION.slice()
  for (const c of cells) b[c] = 0
  return b
}

describe('explaining a placement', () => {
  it('hands back a drawable pattern, not just a sentence', () => {
    const out = explainPlacement(gridMissing(40), 40, 5)
    expect(out.kind).toBe('routine')
    expect(out.pattern.cells).toEqual([40])
    expect(out.pattern.digits).toEqual([5])
  })

  it('carries the whole unit for a hidden single, because the unit is the proof', () => {
    // Blank enough of box 1 that r1c1 keeps several candidates but 5 has one home.
    const out = explainPlacement(gridMissing(0, 3, 9, 28), 0, 5)
    expect(['routine', 'solid']).toContain(out.kind)
    if (out.kind === 'solid') {
      expect(out.pattern.unitCells.length).toBe(9)
      expect(out.pattern.unitCells).toContain(0)
    }
  })

  it('returns null when nothing on the board proves it', () => {
    // An empty grid proves nothing about any cell.
    expect(explainPlacement(new Array(81).fill(0), 0, 5)).toBeNull()
  })
})

describe('settled candidates', () => {
  it('never adds a candidate the naive set did not have', () => {
    const made = makePuzzle('Hard', { seed: 771 })
    const naive = createState(made.puzzle).cands
    const settled = settledCands(made.puzzle)
    for (let i = 0; i < 81; i++) {
      // Every settled candidate must have been a naive one: this only removes.
      expect((settled[i] & ~naive[i]) === 0).toBe(true)
    }
  })

  it('keeps the true digit as a candidate in every empty cell', () => {
    // Eliminating the actual answer would mean the ladder is unsound.
    const made = makePuzzle('Expert', { seed: 99 })
    const settled = settledCands(made.puzzle)
    for (let i = 0; i < 81; i++) {
      if (made.puzzle[i] !== 0) continue
      expect(marksToList(settled[i])).toContain(made.solution[i])
    }
  })

  it('removes at least something on a puzzle that needs more than singles', () => {
    const made = makePuzzle('Expert', { seed: 4242 })
    const naive = createState(made.puzzle).cands
    const settled = settledCands(made.puzzle)
    let removed = 0
    for (let i = 0; i < 81; i++) {
      const gone = naive[i] & ~settled[i]
      for (let d = 0; d < 9; d++) if (gone & (1 << d)) removed++
    }
    expect(removed).toBeGreaterThan(0)
  })
})

describe('worked examples', () => {
  // Expert rather than Diabolical throughout: it needs the same more-than-
  // singles techniques and generates in under a second, where Diabolical takes
  // five and a half and blows the default test timeout.
  const expert = makePuzzle('Expert', { seed: 20260811 })

  it('skips singles, which teach nobody anything', () => {
    const ex = workedExamples(expert.puzzle)
    expect(ex.map(e => e.technique)).not.toContain('nakedSingle')
    expect(ex.map(e => e.technique)).not.toContain('hiddenSingle')
  })

  it('gives one example per technique, in the order they came up', () => {
    const ex = workedExamples(expert.puzzle)
    expect(new Set(ex.map(e => e.technique)).size).toBe(ex.length)
    for (let i = 1; i < ex.length; i++) expect(ex[i].at).toBeGreaterThanOrEqual(ex[i - 1].at)
  })

  it('carries the position each example was true in', () => {
    const made = makePuzzle('Hard', { seed: 20260811 })
    for (const e of workedExamples(made.puzzle)) {
      expect(e.board).toHaveLength(81)
      expect(e.cands).toHaveLength(81)
      expect(TECHNIQUES[e.technique]).toBeTruthy()
      // Every cell of the pattern must still be empty in that position, or the
      // drawing would outline a cell that already holds a digit.
      for (const c of e.step.cells) expect(e.board[c]).toBe(0)
    }
  })

  it('returns nothing for a grid that falls to singles alone', () => {
    const made = makePuzzle('Gentle', { seed: 5 })
    if (made) expect(workedExamples(made.puzzle).length).toBe(0)
  })
})
