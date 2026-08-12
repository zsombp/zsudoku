import { describe, it, expect } from 'vitest'
import { makeGhost, engineGhost, raceState, progressOf, ENGINE_STEP_MS } from './ghost.js'
import { gradePuzzle } from '../logic/grader.js'
import { boardAt } from './replay.js'

// A board is only ever counted here, never solved, so these do not have to be
// legal sudoku. What matters is which cells were given and what the right digit
// is in each of the rest.
const SOLUTION = Array.from({ length: 81 }, (_, i) => (i % 9) + 1)
const BLANKS = [76, 77, 78, 79, 80]
const PUZZLE = SOLUTION.map((v, i) => (BLANKS.includes(i) ? 0 : v))

const right = cell => SOLUTION[cell]
const wrong = cell => (SOLUTION[cell] % 9) + 1

const game = (moveLog, over = {}) => ({
  puzzle: PUZZLE,
  solution: SOLUTION,
  moveLog,
  completed: true,
  durationMs: moveLog.length ? moveLog[moveLog.length - 1].t : 0,
  ...over,
})

const place = (t, cell, value) => ({ t, kind: 'place', cell, value, correct: value === SOLUTION[cell] })

// A real Hard, from `makePuzzle('Hard', { seed: 1 })`. Kept as a fixture rather
// than generated in the test because generating it costs 136ms, and because the
// engine ghost needs a solve path with elimination-only steps in it: this one
// runs 62 steps to fill 56 cells, so 6 of them write nothing.
const HARD =
  '500031000092007030400060010037000009000000000900000460020040005000100320000250004'
const parse = s => s.split('').map(Number)

describe('a ghost from a finished game', () => {
  it('counts a cell only once the right digit is in it', () => {
    // The wrong digit sits on the board for ten seconds. Counting anything
    // non-empty would call that progress, and the race would report you ahead
    // by exactly the number of digits you had wrong.
    const g = makeGhost(game([place(1000, 76, wrong(76)), place(11000, 76, right(76))]))
    expect(g.at(5000)).toBe(0)
    expect(g.at(11000)).toBe(1)
  })

  it('takes a cell back off the count when it is erased or undone', () => {
    const g = makeGhost(
      game([
        place(1000, 76, right(76)),
        place(2000, 77, right(77)),
        { t: 3000, kind: 'erase', cell: 77 },
        { t: 4000, kind: 'undo', changes: [[76, 0]] },
      ])
    )
    expect(g.at(2000)).toBe(2)
    expect(g.at(3000)).toBe(1)
    expect(g.at(4000)).toBe(0)
  })

  it('holds its last value before the first move and long after the last', () => {
    const g = makeGhost(game([place(5000, 76, right(76)), place(9000, 77, right(77))]))
    expect(g.at(0)).toBe(0)
    expect(g.at(-5000)).toBe(0)
    expect(g.at(4999)).toBe(0)
    expect(g.at(60 * 60 * 1000)).toBe(2)
    // "Where did it end up" is a fair question. A garbled clock is not, and
    // lands at the start rather than somewhere unpredictable.
    expect(g.at(Infinity)).toBe(2)
    expect(g.at(NaN)).toBe(0)
  })

  it('counts towards the blanks, never the givens', () => {
    const g = makeGhost(game(BLANKS.map((cell, i) => place((i + 1) * 1000, cell, right(cell)))))
    expect(g.total).toBe(5)
    expect(g.at(5000)).toBe(5)
    expect(g.finished).toBe(true)
  })

  it('says a game that was walked away from did not finish', () => {
    const g = makeGhost(game([place(1000, 76, right(76))], { completed: false, durationMs: 90000 }))
    expect(g.finished).toBe(false)
    // The clock ran on after the last thing that was written down.
    expect(g.endMs).toBe(90000)
  })

  it('refuses a record for a different puzzle', () => {
    // The obvious query is "my best time at this difficulty", and it is the
    // wrong one: racing a ghost that was solving a different grid is nonsense
    // that nothing else in the app would catch.
    const other = PUZZLE.map((v, i) => (i === 0 ? 0 : v))
    expect(makeGhost(game([]), { puzzle: other })).toBeNull()
    expect(makeGhost(game([]), { puzzle: PUZZLE })).not.toBeNull()
  })

  it('has nothing to offer from a record with no puzzle on it', () => {
    expect(makeGhost(null)).toBeNull()
    expect(makeGhost({ moveLog: [] })).toBeNull()
  })

  it('starts flat at nothing when the log is empty', () => {
    const g = makeGhost(game([]))
    expect(g.at(0)).toBe(0)
    expect(g.at(999999)).toBe(0)
    expect(g.finished).toBe(false)
  })

  it('names itself with the time it took', () => {
    const g = makeGhost(game([place(1000, 76, right(76))], { durationMs: 521000 }))
    expect(g.label).toMatch(/Your 8:41/)
    const quit = makeGhost(game([place(1000, 76, right(76))], { completed: false }))
    expect(quit.label).toMatch(/unfinished/)
  })

  it('agrees with the board rebuilt at any moment, not only at the ones it recorded', () => {
    // The timeline keeps only the moments the count changed, so every lookup
    // between two of them is the binary search answering rather than a stored
    // number. This walks a real solve, with a wrong digit every fifth move,
    // and checks the ghost against an independent recount at 200 sample times.
    const puzzle = parse(HARD)
    const { steps } = gradePuzzle(puzzle, { keepSteps: true })
    const solution = puzzle.slice()
    for (const s of steps) for (const p of s.placements) solution[p.cell] = p.digit

    const log = []
    let t = 0
    let n = 0
    for (const s of steps) {
      for (const p of s.placements) {
        n++
        if (n % 5 === 0) {
          t += 2000
          log.push({ t, kind: 'place', cell: p.cell, value: (p.digit % 9) + 1, correct: false })
          t += 8000
          log.push({ t, kind: 'erase', cell: p.cell })
        }
        t += 3000
        log.push({ t, kind: 'place', cell: p.cell, value: p.digit, correct: true })
      }
    }

    const record = { puzzle, solution, moveLog: log, completed: true, durationMs: t }
    const g = makeGhost(record)
    expect(g.finished).toBe(true)

    for (let k = 0; k <= 200; k++) {
      const sample = Math.round((k / 200) * t)
      let idx = -1
      for (let i = 0; i < log.length && log[i].t <= sample; i++) idx = i
      const board = idx === -1 ? puzzle : boardAt(record, idx)
      expect(g.at(sample)).toBe(progressOf(board, puzzle, solution))
    }
  })

  it('knows when it first reached a given count, even after going backwards', () => {
    const g = makeGhost(
      game([
        place(1000, 76, right(76)),
        place(2000, 77, right(77)),
        { t: 3000, kind: 'erase', cell: 77 },
        place(9000, 77, right(77)),
      ])
    )
    // Two cells were reached at 2000 and lost again. The first time stands: it
    // is what a race is comparing against, not the last time.
    expect(g.timeTo(2)).toBe(2000)
    expect(g.timeTo(1)).toBe(1000)
    expect(g.timeTo(0)).toBe(0)
    expect(g.timeTo(5)).toBe(Infinity)
  })
})

describe('a ghost from the technique ladder', () => {
  it('follows the ladder to the end of a real puzzle', () => {
    const puzzle = parse(HARD)
    const g = engineGhost(puzzle, undefined, 4000)
    expect(g.total).toBe(56)
    expect(g.at(0)).toBe(0)
    expect(g.at(g.endMs)).toBe(56)
    expect(g.finished).toBe(true)
    // Monotone: the engine never takes a digit back.
    for (let i = 1; i < g.points.length; i++) {
      expect(g.points[i].filled).toBeGreaterThan(g.points[i - 1].filled)
      expect(g.points[i].t).toBeGreaterThan(g.points[i - 1].t)
    }
  })

  it('spends its time on the steps that only eliminate, and fills nothing there', () => {
    // This grid takes 62 ladder steps to fill 56 cells, so six of them write
    // nothing at all. An engine that only charged for placements would finish
    // six steps early and be a harder race than the ladder really is.
    const g = engineGhost(parse(HARD), undefined, 4000)
    expect(g.endMs).toBeGreaterThan(g.total * 4000)
  })

  it('races from a position, not only from an empty grid', () => {
    const puzzle = parse(HARD)
    const { steps } = gradePuzzle(puzzle, { keepSteps: true })
    const halfway = puzzle.slice()
    for (const s of steps.slice(0, 20)) for (const p of s.placements) halfway[p.cell] = p.digit

    const g = engineGhost(halfway)
    expect(g.total).toBeLessThan(56)
    expect(g.finished).toBe(true)
    expect(g.at(g.endMs)).toBe(g.total)
  })

  it('stops where the ladder stops rather than pretending to finish', () => {
    // An empty grid is the extreme case: pure logic cannot start, so the ghost
    // is a flat line at nothing and admits it.
    const g = engineGhost(new Array(81).fill(0))
    expect(g.total).toBe(81)
    expect(g.finished).toBe(false)
    expect(g.at(600000)).toBe(0)
  })

  it('says what pace it is running at', () => {
    expect(engineGhost(parse(HARD), undefined, 3000).label).toMatch(/every 3s/)
    expect(engineGhost(parse(HARD), undefined, 1500).label).toMatch(/every 1.5s/)
    // A nonsense pace falls back rather than producing a timeline where every
    // step happens at once.
    expect(engineGhost(parse(HARD), undefined, 0).endMs).toBeGreaterThan(0)
    expect(engineGhost(parse(HARD)).endMs).toBe(engineGhost(parse(HARD), undefined, ENGINE_STEP_MS).endMs)
  })

  it('has nothing to race without a board', () => {
    expect(engineGhost(null)).toBeNull()
  })
})

describe('the race', () => {
  const ghost = makeGhost(
    game([place(10000, 76, right(76)), place(20000, 77, right(77)), place(30000, 78, right(78))])
  )

  it('says how far ahead you are, in cells', () => {
    const r = raceState(ghost, 20000, 4)
    expect(r.ghostFilled).toBe(2)
    expect(r.ahead).toBe(true)
    expect(r.by).toBe(2)
    expect(r.diff).toBe(2)
  })

  it('reads a dead heat as level rather than as ahead by nothing', () => {
    const r = raceState(ghost, 20000, 2)
    expect(r.by).toBe(0)
    expect(r.ahead).toBe(false)
  })

  it('measures the same race on the clock, which is what a level cell count hides', () => {
    // Level on cells at 25s, and five seconds down: the ghost had those two
    // cells at 20s. Nothing in the cell count can say that, and it is the half
    // that moves while you are both stuck on the same cell.
    const r = raceState(ghost, 25000, 2)
    expect(r.by).toBe(0)
    expect(r.byMs).toBe(-5000)
    // The other way round at 15s: one cell up, and five seconds up with it.
    const early = raceState(ghost, 15000, 2)
    expect(early.by).toBe(1)
    expect(early.byMs).toBe(5000)
  })

  it('has no time to report when the ghost never got that far', () => {
    const quit = makeGhost(game([place(10000, 76, right(76))], { completed: false }))
    expect(raceState(quit, 30000, 3).byMs).toBeNull()
    // And none at the start either: nobody had filled anything, so the clock
    // gap is not zero, it is meaningless.
    expect(raceState(ghost, 30000, 0).byMs).toBeNull()
  })

  it('ignores a clock or a count that has gone backwards', () => {
    expect(raceState(ghost, -5000, 0).ghostFilled).toBe(0)
    expect(raceState(ghost, 20000, -3).diff).toBe(-2)
    expect(raceState(ghost, NaN, 1).ghostFilled).toBe(0)
  })

  it('has nothing to say without a ghost', () => {
    expect(raceState(null, 1000, 1)).toBeNull()
  })
})

describe('counting a live board', () => {
  it('does not count the givens, so both sides of a race count the same way', () => {
    // The trap this guards: `board.filter(Boolean).length` on the live side
    // would start the player 76 cells ahead of a ghost on the same grid.
    expect(progressOf(PUZZLE, PUZZLE, SOLUTION)).toBe(0)
    expect(progressOf(SOLUTION, PUZZLE, SOLUTION)).toBe(5)
  })

  it('does not count a wrong digit as progress', () => {
    const board = PUZZLE.slice()
    board[76] = wrong(76)
    board[77] = right(77)
    expect(progressOf(board, PUZZLE, SOLUTION)).toBe(1)
  })
})
