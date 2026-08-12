import { describe, it, expect } from 'vitest'
import { boardAt, stateAt, replaySteps, stallHeatmap, longestStall, summarise, cellHistory } from './replay.js'
import { marksToList } from '../logic/marks.js'
import { CLASSIC } from '../logic/topology.js'
import { makeVariantPuzzle, topologyFromRecord } from '../logic/variants.js'

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

describe('rebuilding pencil marks', () => {
  const withPuzzle = (moveLog, puzzle = new Array(81).fill(0)) => ({
    puzzle,
    solution: new Array(81).fill(1),
    moveLog,
  })

  it('replays a pencil toggle on and off again', () => {
    const r = withPuzzle([
      { t: 100, kind: 'pencil', cell: 0, value: 5 },
      { t: 200, kind: 'pencil', cell: 0, value: 7 },
      { t: 300, kind: 'pencil', cell: 0, value: 5 },
    ])
    expect(marksToList(stateAt(r, 1).marks[0])).toEqual([5, 7])
    expect(marksToList(stateAt(r, 2).marks[0])).toEqual([7])
  })

  it('strips a placed digit from its peers, the way the game does', () => {
    // 4 pencilled into r1c2 and r2c1, then a 4 placed at r1c1 takes both.
    const r = withPuzzle([
      { t: 100, kind: 'pencil', cell: 1, value: 4 },
      { t: 200, kind: 'pencil', cell: 9, value: 4 },
      { t: 300, kind: 'place', cell: 0, value: 4, correct: true },
    ])
    const before = stateAt(r, 1).marks
    expect(marksToList(before[1])).toEqual([4])
    const after = stateAt(r, 2).marks
    expect(marksToList(after[1])).toEqual([])
    expect(marksToList(after[9])).toEqual([])
  })

  it('puts back exactly what an erase displaced, including the cell own marks', () => {
    const r = withPuzzle([
      { t: 100, kind: 'pencil', cell: 0, value: 4 },
      { t: 150, kind: 'pencil', cell: 0, value: 6 },
      { t: 200, kind: 'pencil', cell: 1, value: 4 },
      { t: 300, kind: 'place', cell: 0, value: 4, correct: true },
      { t: 400, kind: 'erase', cell: 0 },
    ])
    const after = stateAt(r, 4).marks
    expect(marksToList(after[0])).toEqual([4, 6])
    expect(marksToList(after[1])).toEqual([4])
  })

  it('recomputes every mark on auto-pencil', () => {
    // A grid with r1c1 empty and a 4 already sitting in its row.
    const puzzle = new Array(81).fill(0)
    puzzle[1] = 4
    const r = withPuzzle([{ t: 100, kind: 'autoPencil' }], puzzle)
    const marks = stateAt(r, 0).marks
    expect(marksToList(marks[0])).not.toContain(4)
    expect(marksToList(marks[0])).toContain(9)
    // A filled cell holds no candidates.
    expect(marks[1]).toBe(0)
  })

  it('replays an undo from its recorded mark diff', () => {
    const r = withPuzzle([
      { t: 100, kind: 'pencil', cell: 0, value: 5 },
      { t: 200, kind: 'place', cell: 0, value: 5, correct: true },
      { t: 300, kind: 'undo', changes: [[0, 0]], markChanges: [[0, 1 << 4]] },
    ])
    expect(marksToList(stateAt(r, 2).marks[0])).toEqual([5])
    expect(stateAt(r, 2).exact).toBe(true)
  })

  it('admits when an old log makes the marks a guess', () => {
    // No markChanges on the undo, and marks existed to be disturbed.
    const r = withPuzzle([
      { t: 100, kind: 'pencil', cell: 0, value: 5 },
      { t: 200, kind: 'undo', changes: [] },
    ])
    expect(stateAt(r, 1).exact).toBe(false)
  })

  it('stays exact when an undo had no marks to disturb', () => {
    const r = withPuzzle([
      { t: 100, kind: 'place', cell: 0, value: 5, correct: true },
      { t: 200, kind: 'undo', changes: [[0, 0]] },
    ])
    expect(stateAt(r, 1).exact).toBe(true)
  })

  it('leaves boardAt behaving exactly as it did', () => {
    const r = withPuzzle([
      { t: 100, kind: 'pencil', cell: 0, value: 5 },
      { t: 200, kind: 'place', cell: 3, value: 7, correct: true },
    ])
    expect(boardAt(r, 1)[3]).toBe(7)
    expect(boardAt(r, 1)[0]).toBe(0)
  })
})

describe('one cell, from start to finish', () => {
  const rec = (moveLog, over = {}) => ({
    puzzle: new Array(81).fill(0),
    solution: new Array(81).fill(0).map((_, i) => (i === 4 ? 7 : 1)),
    moveLog,
    ...over,
  })

  it('knows a pencil toggle put a mark in rather than took it out', () => {
    const r = rec([
      { t: 1000, kind: 'pencil', cell: 4, value: 3 },
      { t: 2000, kind: 'pencil', cell: 4, value: 3 },
    ])
    const h = cellHistory(r, 4)
    expect(h[0].text).toContain('Pencilled in 3')
    expect(h[1].text).toContain('Rubbed out the 3')
  })

  it('says when a digit was wrong, using the solution rather than the flag', () => {
    const r = rec([{ t: 1000, kind: 'place', cell: 4, value: 2 }])
    expect(cellHistory(r, 4)[0].kind).toBe('wrong')
  })

  it('reports a given as a given and stops there', () => {
    const puzzle = new Array(81).fill(0)
    puzzle[4] = 7
    const r = rec([{ t: 1000, kind: 'place', cell: 4, value: 7 }], { puzzle })
    const h = cellHistory(r, 4)
    expect(h).toHaveLength(1)
    expect(h[0].kind).toBe('given')
  })

  it('picks up a cell changed by an undo it was not the subject of', () => {
    const r = rec([
      { t: 1000, kind: 'place', cell: 4, value: 7 },
      { t: 2000, kind: 'undo', changes: [[4, 0]] },
    ])
    const h = cellHistory(r, 4)
    expect(h).toHaveLength(2)
    expect(h[1].text).toContain('an undo')
  })

  it('ignores moves that never touched this cell', () => {
    const r = rec([
      { t: 1000, kind: 'place', cell: 9, value: 1 },
      { t: 2000, kind: 'pencil', cell: 9, value: 5 },
    ])
    expect(cellHistory(r, 4)).toEqual([])
  })
})

describe('the board a game was played on', () => {
  /**
   * Auto-pencil is the one entry the log does not describe: it writes nothing
   * down because it is deterministic from the board. That only holds if the
   * replay scans the same board the game did, and it did not, so a jigsaw came
   * back with the candidates of a classic grid.
   *
   * Nothing failed. The review drew notes the player had never had, and belief
   * archaeology then reported them as misreads: one real game claimed fifteen
   * on a board whose only notes came from pressing Auto.
   */
  it('rebuilds auto-pencil from the regions the game actually had', () => {
    const made = makeVariantPuzzle('jigsaw', 'Easy', { seed: 7202 })
    const topo = topologyFromRecord(made)
    const record = { ...made, moveLog: [{ t: 1000, kind: 'autoPencil' }] }

    const { marks } = stateAt(record, 0)
    for (let cell = 0; cell < 81; cell++) {
      if (made.puzzle[cell] !== 0) continue
      expect(marks[cell], `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`)
        .toBe(topo.candMaskAt(made.puzzle, cell))
    }
    // And it has to differ from the classic answer somewhere, or this test
    // would pass just as well against the bug it exists to catch.
    const differs = [...Array(81).keys()].some(
      cell => made.puzzle[cell] === 0 && topo.candMaskAt(made.puzzle, cell) !== CLASSIC.candMaskAt(made.puzzle, cell)
    )
    expect(differs).toBe(true)
  })

  it('strips a placed digit from the peers that board gives it', () => {
    // Two cells in the same jigsaw region but different 3x3 boxes. Placing a
    // digit in one has to take it out of the other's notes, which the classic
    // peer list has no reason to do.
    const made = makeVariantPuzzle('jigsaw', 'Easy', { seed: 7202 })
    const topo = topologyFromRecord(made)
    const cell = made.puzzle.findIndex(v => v === 0)
    const peer = topo.peers[cell].find(
      p => made.puzzle[p] === 0 && !CLASSIC.peers[cell].includes(p)
    )
    expect(peer, 'a peer this board adds').toBeGreaterThanOrEqual(0)

    const digit = 1 + ((made.solution[cell] + 3) % 9)
    const record = {
      ...made,
      moveLog: [
        { t: 100, kind: 'pencil', cell: peer, value: digit },
        { t: 200, kind: 'place', cell, value: digit, correct: false },
      ],
    }
    expect(marksToList(stateAt(record, 0).marks[peer])).toEqual([digit])
    expect(marksToList(stateAt(record, 1).marks[peer])).toEqual([])
  })
})
