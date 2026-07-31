import { describe, it, expect } from 'vitest'
import { boardAt, replaySteps, stallHeatmap, longestStall, summarise } from './replay.js'

/** A record with a puzzle of 81 zeros unless stated, and whatever log we need. */
const rec = (moveLog, over = {}) => ({
  puzzle: new Array(81).fill(0),
  solution: new Array(81).fill(1),
  moveLog,
  hints: 0,
  ...over,
})

describe('board reconstruction', () => {
  it('starts from the puzzle before any move', () => {
    const puzzle = new Array(81).fill(0)
    puzzle[0] = 5
    const r = rec([{ t: 100, kind: 'place', cell: 1, value: 3 }], { puzzle })
    expect(boardAt(r, -1)[0]).toBe(5)
    expect(boardAt(r, -1)[1]).toBe(0)
  })

  it('applies placements in order', () => {
    const r = rec([
      { t: 100, kind: 'place', cell: 0, value: 4 },
      { t: 200, kind: 'place', cell: 1, value: 7 },
    ])
    expect(boardAt(r, 0)[0]).toBe(4)
    expect(boardAt(r, 0)[1]).toBe(0)
    expect(boardAt(r, 1)[1]).toBe(7)
  })

  it('replays an undo exactly, using its recorded diff', () => {
    // The whole reason undo records a diff: without it the replay cannot know
    // what an undo actually undid.
    const r = rec([
      { t: 100, kind: 'place', cell: 0, value: 4 },
      { t: 200, kind: 'undo', changes: [[0, 0]] },
    ])
    expect(boardAt(r, 0)[0]).toBe(4)
    expect(boardAt(r, 1)[0]).toBe(0)
  })

  it('replays auto-complete across every cell it filled', () => {
    const r = rec([{ t: 100, kind: 'autoComplete', count: 3, changes: [[0, 1], [5, 2], [80, 9]] }])
    const b = boardAt(r, 0)
    expect([b[0], b[5], b[80]]).toEqual([1, 2, 9])
  })

  it('erasing clears the cell', () => {
    const r = rec([
      { t: 100, kind: 'place', cell: 3, value: 6 },
      { t: 200, kind: 'erase', cell: 3 },
    ])
    expect(boardAt(r, 1)[3]).toBe(0)
  })

  it('skips pencilling, which never changes the board', () => {
    const r = rec([
      { t: 100, kind: 'pencil', cell: 0, value: 4 },
      { t: 200, kind: 'place', cell: 0, value: 9 },
    ])
    expect(replaySteps(r)).toEqual([1])
    expect(boardAt(r, 1)[0]).toBe(9)
  })
})

describe('stall heatmap', () => {
  it('charges the gap before a placement to the cell placed', () => {
    const { cells, max } = stallHeatmap(rec([
      { t: 1000, kind: 'place', cell: 0, value: 1 },
      { t: 6000, kind: 'place', cell: 1, value: 2 },
    ]))
    expect(cells[0]).toBe(1000)
    expect(cells[1]).toBe(5000)
    expect(max).toBe(5000)
  })

  it('keeps the longest gap when a cell is filled more than once', () => {
    const { cells } = stallHeatmap(rec([
      { t: 5000, kind: 'place', cell: 0, value: 1 },
      { t: 5500, kind: 'place', cell: 0, value: 2 },
    ]))
    expect(cells[0]).toBe(5000)
  })

  it('ignores pencilling when charging time', () => {
    const { cells } = stallHeatmap(rec([
      { t: 4000, kind: 'pencil', cell: 0, value: 1 },
      { t: 4200, kind: 'place', cell: 1, value: 2 },
    ]))
    expect(cells[0]).toBe(0)
    expect(cells[1]).toBe(200)
  })

  it('survives an empty log', () => {
    expect(stallHeatmap(rec([])).max).toBe(0)
    expect(longestStall(rec([])).cell).toBe(-1)
  })
})

describe('per-game summary', () => {
  it('counts what happened', () => {
    const s = summarise(rec([
      { t: 500, kind: 'place', cell: 0, value: 1, correct: true },
      { t: 900, kind: 'place', cell: 1, value: 9, correct: false },
      { t: 1200, kind: 'undo', changes: [[1, 0]] },
      { t: 1500, kind: 'pencil', cell: 2, value: 3 },
      { t: 9000, kind: 'hint', cell: 3, value: 4 },
    ]))
    expect(s.placements).toBe(2)
    expect(s.wrong).toBe(1)
    expect(s.undos).toBe(1)
    expect(s.pencilMarks).toBe(1)
    expect(s.timeToFirstMove).toBe(500)
    // The hint after a 7.5s gap is the longest pause.
    expect(s.longest.gap).toBe(7500)
    expect(s.longest.cell).toBe(3)
  })

  it('remembers a mistake that was later undone', () => {
    // The mistakes counter is reverted by undo, deliberately. The log is not,
    // so the review can still say a wrong digit was tried.
    const s = summarise(rec([
      { t: 100, kind: 'place', cell: 0, value: 9, correct: false },
      { t: 200, kind: 'undo', changes: [[0, 0]] },
    ]))
    expect(s.wrong).toBe(1)
  })

  it('survives a record with no log at all', () => {
    expect(() => summarise({ puzzle: [], moveLog: undefined })).not.toThrow()
  })
})
