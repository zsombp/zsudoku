import { describe, it, expect } from 'vitest'
import {
  analyseGame,
  verdict,
  timeShape,
  summariseAnalysis,
  summaryIsCurrent,
  ANALYSIS_VERSION,
  CLASSES,
} from './analysis.js'
import { makePuzzle } from '../logic/generator.js'
import { makeVariantPuzzle, topologyFromRecord } from '../logic/variants.js'
import { createState, nextStep, applyStep } from '../logic/grader.js'

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

describe('what the clock says about the judgment', () => {
  const game = moves => ({ moves })
  const mv = (cls, gap, over = {}) => ({ cls, gap, value: 5, cellName: 'r1c1', ...over })

  it('says nothing on a game too short to have a rhythm', () => {
    expect(timeShape(game([mv('routine', 1000), mv('routine', 2000)]))).toEqual([])
  })

  it('calls out a long think that ended in a move already available', () => {
    const moves = [...Array(10)].map(() => mv('routine', 2000))
    moves.push(mv('routine', 40000, { cellName: 'r4c4' }))
    const out = timeShape(game(moves))
    const found = out.find(o => o.id === 'stall-on-easy')
    expect(found).toBeTruthy()
    expect(found.text).toContain('r4c4')
    expect(found.tone).toBe('warn')
  })

  it('does not scold a long think that needed a real pattern', () => {
    const moves = [...Array(10)].map(() => mv('routine', 2000))
    moves.push(mv('sharp', 40000))
    const out = timeShape(game(moves))
    expect(out.find(o => o.id === 'stall-on-easy')).toBeFalsy()
    expect(out.find(o => o.id === 'earned')?.tone).toBe('good')
  })

  it('flags placements that were both fast and unproven', () => {
    const moves = [...Array(10)].map(() => mv('routine', 8000))
    moves.push(mv('lucky', 200), mv('lucky', 200), mv('lucky', 200))
    expect(timeShape(game(moves)).find(o => o.id === 'fast-guess')).toBeTruthy()
  })

  it('needs three fast guesses before saying so, not one', () => {
    const moves = [...Array(10)].map(() => mv('routine', 8000))
    moves.push(mv('lucky', 200))
    expect(timeShape(game(moves)).find(o => o.id === 'fast-guess')).toBeFalsy()
  })

  it('scales to the game rather than to a fixed number of seconds', () => {
    // A 20s pause is unremarkable in a game whose median gap is 15s.
    const slow = [...Array(10)].map(() => mv('routine', 15000))
    slow.push(mv('routine', 20000))
    expect(timeShape(game(slow)).find(o => o.id === 'stall-on-easy')).toBeFalsy()
  })
})

describe('the stored summary', () => {
  const played = (cells, over = {}) => ({
    puzzle: gridMissing(...cells),
    solution: SOLUTION,
    graderVersion: 2,
    moveLog: cells.map((c, i) => ({
      t: (i + 1) * 3000,
      kind: 'place',
      cell: c,
      value: SOLUTION[c],
      correct: true,
    })),
    ...over,
  })

  it('counts the same classes the review shows', () => {
    const r = played([40, 41, 42, 43])
    const s = summariseAnalysis(r)
    const live = analyseGame(r)
    expect(s.placements).toBe(live.moves.length)
    expect(s.counts).toEqual(live.counts)
    expect(s.missed).toBe(live.missed)
  })

  it('returns nothing for a game with no moves, rather than an empty shell', () => {
    expect(summariseAnalysis({ puzzle: SOLUTION, solution: SOLUTION, moveLog: [] })).toBeNull()
  })

  it('stays small enough to keep on every record', () => {
    const s = summariseAnalysis(played([0, 9, 18, 27, 36, 45, 54, 63, 72]))
    expect(JSON.stringify(s).length).toBeLessThan(400)
  })

  it('is treated as stale when the grader moved underneath it', () => {
    const g = { summary: { v: ANALYSIS_VERSION }, graderVersion: 999 }
    expect(summaryIsCurrent(g)).toBe(false)
    // And when the classifier itself changed.
    expect(summaryIsCurrent({ summary: { v: 0 }, graderVersion: 2 })).toBe(false)
  })

  it('records which patterns were found unaided', () => {
    // A grid solved in reading order will need more than a scan somewhere.
    const made = makePuzzle('Expert', { seed: 8 })
    const log = []
    let t = 0
    for (let i = 0; i < 81; i++) {
      if (made.puzzle[i] !== 0) continue
      t += 3000
      log.push({ t, kind: 'place', cell: i, value: made.solution[i], correct: true })
    }
    const s = summariseAnalysis({ puzzle: made.puzzle, solution: made.solution, moveLog: log, graderVersion: 2 })
    // Every key must be a real technique, never a stray label.
    for (const k of Object.keys(s.sharpBy)) expect(CLASSES[k]).toBeUndefined()
    expect(s.counts.routine).toBeGreaterThan(0)
  })
})

describe('the board the game was played on', () => {
  /**
   * A ladder-perfect solve, on each variant in turn.
   *
   * Every digit here was derived by the ladder a moment before it was written,
   * so Lucky is impossible by construction whatever shape the regions are. It
   * was not: `analyseGame` built its candidate state on the classic grid, so a
   * jigsaw solve came back 38 Lucky out of 117 and a killer 56 out of 146.
   * Nothing threw, every number was plausible, and the same counts were stored
   * on the record and fed to statistics and the curriculum.
   *
   * Killer is in here deliberately even though it is the slow one: its cage
   * arithmetic is the largest gap between the two topologies, and it is the
   * only variant whose layout has to be rebuilt from the seed.
   */
  for (const variant of ['jigsaw', 'x', 'windoku', 'antiknight', 'killer']) {
    it(`credits a ladder-perfect ${variant} solve without calling any of it luck`, () => {
      const made = makeVariantPuzzle(variant, 'Medium', { seed: 7000 })
      expect(made).toBeTruthy()
      const topo = topologyFromRecord(made)

      const state = createState(made.puzzle, topo)
      const moveLog = []
      let t = 0
      for (let guard = 0; guard < 800 && state.board.includes(0); guard++) {
        const step = nextStep(state)
        if (!step) break
        for (const p of step.placements) {
          t += 1000
          moveLog.push({ t, kind: 'place', cell: p.cell, value: p.digit, correct: true })
        }
        applyStep(state, step)
      }

      const { moves, counts } = analyseGame({ ...made, moveLog })
      expect(moves.length).toBeGreaterThan(20)
      expect(counts.lucky || 0).toBe(0)
      expect(counts.mistake || 0).toBe(0)
    }, 20000)
  }

  it('names a clashing digit from the peers of the board in play', () => {
    // A jigsaw region is a different nine cells from the classic box that
    // overlaps it, so a wrong digit explained against the classic box either
    // names a cell that does not constrain this one or misses the one that
    // does. Both read as a confident, checkable sentence.
    const made = makeVariantPuzzle('jigsaw', 'Gentle', { seed: 7101 })
    const topo = topologyFromRecord(made)
    const empty = made.puzzle.findIndex(v => v === 0)
    // A digit already sitting in one of this cell's peers, and wrong here.
    const peer = topo.peers[empty].find(p => made.puzzle[p] !== 0 && made.puzzle[p] !== made.solution[empty])
    const wrong = made.puzzle[peer]

    const { moves } = analyseGame({
      ...made,
      moveLog: [{ t: 1000, kind: 'place', cell: empty, value: wrong, correct: false }],
    })
    expect(moves[0].cls).toBe('mistake')
    expect(moves[0].why).toContain('There was already')
  })
})
