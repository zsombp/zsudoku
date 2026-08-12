import { describe, it, expect } from 'vitest'
import { askAbout, questionFor, focusUnit, hasQuestion } from './socratic.js'
import { createState, nextStep, applyStep } from './grader.js'
import { CLASSIC, unitName, rowOf, colOf } from './topology.js'
import { LADDER } from './techniques.js'
import { hasMark, countMarks } from './marks.js'
import { makePuzzle } from './generator.js'
import { topologyFor, makeVariantPuzzle } from './variants.js'

const cellName = i => `r${rowOf(i) + 1}c${colOf(i) + 1}`
const unitCells = (topo, meta) => topo.units[topo.unitMeta.indexOf(meta)]

// Medium and Hard rather than Expert: they need the same mix of singles and
// eliminations and generate in a fraction of the time.
const medium = makePuzzle('Medium', { seed: 20260812 })
const hard = makePuzzle('Hard', { seed: 20260812 })

/** Every board position along the grader's own solve of a puzzle. */
function positions(puzzle, topo = CLASSIC) {
  const state = createState(puzzle, topo)
  const out = []
  for (let guard = 0; guard < 400; guard++) {
    const step = nextStep(state)
    if (!step) break
    out.push({ board: state.board.slice(), step })
    applyStep(state, step)
  }
  return out
}

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

describe('a question points at the move without giving it away', () => {
  it('never names the cell it is about', () => {
    // The whole point of the rung. If the sentence contains the answer cell
    // then this is a hint with a question mark on the end, and the rung above
    // it, which draws the pattern, has nothing left to reveal.
    let placements = 0
    for (const { board } of positions(hard.puzzle)) {
      const a = askAbout(board)
      expect(a).not.toBeNull()
      expect(a.question).not.toMatch(/r[1-9]c[1-9]/)
      for (const p of a.placements) {
        placements++
        expect(a.question).not.toContain(cellName(p.cell))
      }
    }
    expect(placements).toBeGreaterThan(20)
  })

  it('sends you to a unit with more than one blank in it, unless no such unit exists', () => {
    // A naked single carries no unit of its own, so the question picks one to
    // search. Naming the region is the natural scan, but the region holds a
    // single blank 22% of the time and "the only gap in the top left box" is
    // the answer rather than a question. Choosing by breadth drops that to the
    // 3.7% of cells that are the last blank of every unit they belong to, and
    // by then there is nothing left to protect.
    let checked = 0
    for (const { board } of [...positions(medium.puzzle), ...positions(hard.puzzle)]) {
      const a = askAbout(board)
      if (a.technique !== 'nakedSingle') continue
      checked++
      const cell = a.placements[0].cell
      const blanks = cells => cells.filter(i => board[i] === 0).length
      let region = 0
      let widest = 0
      for (let u = 0; u < CLASSIC.units.length; u++) {
        if (!CLASSIC.units[u].includes(cell)) continue
        const open = blanks(CLASSIC.units[u])
        if (CLASSIC.unitMeta[u].type === 'region') region = open
        widest = Math.max(widest, open)
      }
      expect(blanks(unitCells(CLASSIC, a.unit))).toBe(region >= 2 ? region : widest)
    }
    // Guards the loop itself: without this the rule could stop being exercised
    // and the test would keep passing on nothing.
    expect(checked).toBeGreaterThan(40)
  })

  it('says something true about the position rather than something well formed', () => {
    // A sentence that reads correctly and describes a board that is not there
    // is the failure nothing catches: the player hunts for a pattern that does
    // not exist and concludes they cannot see patterns.
    for (const { board } of positions(hard.puzzle)) {
      const a = askAbout(board)
      const state = createState(board)
      if (a.technique === 'nakedSingle') {
        const cells = unitCells(CLASSIC, a.unit)
        expect(cells.some(i => board[i] === 0 && countMarks(state.cands[i]) === 1)).toBe(true)
      }
      if (a.technique === 'hiddenSingle') {
        const homes = unitCells(CLASSIC, a.unit).filter(i => board[i] === 0 && hasMark(state.cands[i], a.digits[0]))
        expect(homes).toHaveLength(1)
      }
      if (a.technique === 'pointing') {
        const homes = unitCells(CLASSIC, a.unit).filter(i => board[i] === 0 && hasMark(state.cands[i], a.digits[0]))
        expect(a.unit.type).toBe('region')
        const lined = new Set(homes.map(rowOf)).size === 1 || new Set(homes.map(colOf)).size === 1
        expect(lined).toBe(true)
      }
    }
  })

  it('names in words the unit it hands back to be highlighted', () => {
    // This failed when it was written. A naked single has no unit on its step,
    // so the sentence chose one and the result still carried unit: null. The
    // words said "the top left box" and the pattern rung had nothing to draw,
    // and no test, build or type would ever have noticed.
    for (const { board } of positions(medium.puzzle)) {
      const a = askAbout(board)
      if (!a.unit) continue
      expect(a.question).toContain(unitName(a.unit))
    }
  })

  it('names every digit the pattern turns on', () => {
    // Naming the digit is half of "what do you notice about the 4s in column
    // 3". A question that names only some of a naked pair's digits describes a
    // different pattern from the one it hands back.
    for (const { board } of positions(hard.puzzle)) {
      const a = askAbout(board)
      if (a.technique === 'nakedSingle') continue
      for (const d of a.digits) expect(a.question).toContain(String(d))
    }
  })
})

describe('the question comes from the engine, not from a second opinion', () => {
  it('asks about the step the grader would take next', () => {
    // Same rule as the hint: the cheapest step available is the one worth
    // pointing at. If these ever diverge, the question and the hint that
    // follows it would be about different moves.
    for (const { board } of positions(medium.puzzle)) {
      const a = askAbout(board)
      expect(a.technique).toBe(nextStep(createState(board)).technique)
    }
  })

  it('has a phrasing for every rung of the ladder', () => {
    // A new technique with no phrasing returns no question at all, and a
    // silent hint button looks like a broken one. Synthetic steps, because
    // half these rungs need a hand-built grid to fire.
    for (const key of LADDER) {
      const step = {
        technique: key,
        placements: [{ cell: 40, digit: 5 }],
        eliminations: [{ cell: 41, digit: 5 }],
        cells: [40, 41, 42, 43],
        digits: [2, 5, 7],
        unit: CLASSIC.unitMeta[3],
      }
      const q = questionFor(step, CLASSIC, new Array(81).fill(0))
      expect(q, key).toBeTruthy()
      expect(q, key).toMatch(/\?$/)
      expect(q, key).not.toMatch(/undefined|NaN|null/)
      // House style: no em-dashes and no emoji in any copy the app shows.
      // Escaped rather than written out, so a grep for the character across the
      // repository does not land on the test that forbids it.
      expect(q, key).not.toMatch(/\u2014|\p{Extended_Pictographic}/u)
    }
  })

  it('says nothing at all rather than an empty question for a rung it does not know', () => {
    expect(questionFor({ technique: 'jellyfish', cells: [], digits: [3] })).toBeNull()
  })

  it('talks about regions on a jigsaw, which has no boxes', () => {
    // The word comes off the topology's own naming rather than being hardcoded,
    // so a board with irregular regions never asks about a box it does not
    // have. Same rule as the board drawing its heavy rules from the regions.
    const jigsaw = topologyFor('jigsaw', 12345)
    const step = { technique: 'claiming', placements: [], eliminations: [], cells: [0, 1], digits: [4], unit: jigsaw.unitMeta[0] }
    expect(questionFor(step, jigsaw)).toContain('region')
    expect(questionFor(step, jigsaw)).not.toMatch(/\bbox\b/)
    expect(questionFor(step, CLASSIC)).toMatch(/\bbox\b/)
  })

  it('asks about a variant board without knowing it is one', () => {
    // The engine reads units and peers off the topology it was handed, so a
    // question needs no per-variant anything. This is the end to end version of
    // that claim: a real jigsaw grid, walked by the ladder, asked at every
    // position, with no box mentioned anywhere.
    const made = makeVariantPuzzle('jigsaw', 'Medium', { seed: 7 })
    const topo = topologyFor('jigsaw', made.seed)
    const state = createState(made.puzzle, topo)
    let asked = 0
    for (let guard = 0; guard < 400; guard++) {
      const step = nextStep(state)
      if (!step) break
      const a = askAbout(state.board.slice(), topo)
      expect(a).not.toBeNull()
      expect(a.question).not.toMatch(/\bbox\b|r[1-9]c[1-9]/)
      asked++
      applyStep(state, step)
    }
    expect(asked).toBeGreaterThan(20)
  })
})

describe('escalating from a question to the answer', () => {
  it('carries the pattern and the answer with the question, so the caller never asks twice', () => {
    // Asking again for each rung would run the ladder against a board the
    // player may have changed in between, and the pattern drawn could then
    // belong to a different move from the question asked.
    for (const { board } of positions(hard.puzzle)) {
      const a = askAbout(board)
      expect(a.cells.length).toBeGreaterThan(0)
      expect(a.placements.length + a.eliminations.length).toBeGreaterThan(0)
      expect(a.cands).toHaveLength(81)
      // Every cell of the pattern is still empty, or the outline would land on
      // a digit already written in.
      for (const c of a.cells) expect(board[c]).toBe(0)
    }
  })

  it('moves past an elimination when asked, because acting on one changes no digit', () => {
    // An elimination-only step leaves the board identical, so a caller that
    // rebuilds from the board gets the same question forever. Four of the
    // twelve rungs are reachable no other way: measured over 9090 questions,
    // every hidden pair, naked triple, hidden triple and swordfish that came
    // up was behind at least one skip.
    const stuck = positions(hard.puzzle).find(p => !p.step.placements.length)
    expect(stuck, 'no elimination-only step in this puzzle').toBeTruthy()

    const first = askAbout(stuck.board)
    expect(first.placements).toHaveLength(0)
    expect(first.assumed).toEqual([])

    const second = askAbout(stuck.board, CLASSIC, { skip: 1 })
    expect(second.assumed).toEqual([first.technique])
    expect(second.question).not.toBe(first.question)
    // The pattern must be drawn against the candidates it was found in, since
    // it stands on eliminations the raw board does not show.
    expect(second.cands).toHaveLength(81)
  })

  it('never walks past a placement, whatever it is asked for', () => {
    // Behind a placement is a board with a digit the player has not written.
    // A question about that position is a question about a grid they are not
    // looking at, which is worse than no question.
    const placing = positions(medium.puzzle).find(p => p.step.placements.length)
    const plain = askAbout(placing.board)
    const skipped = askAbout(placing.board, CLASSIC, { skip: 5 })
    expect(skipped.question).toBe(plain.question)
    expect(skipped.assumed).toEqual([])
  })

  it('has nothing to ask about a finished board', () => {
    expect(askAbout(SOLUTION)).toBeNull()
    expect(hasQuestion(SOLUTION)).toBe(false)
    expect(hasQuestion(medium.puzzle)).toBe(true)
  })
})

describe('a board with a wrong digit on it', () => {
  // r1c1 is 5 and r1c3 is 4. Blank both and write 4 into r1c1: the row then
  // holds every digit but 5, and r1c3's column already holds every digit but 4,
  // so r1c3 has nothing left it can be.
  const poisoned = SOLUTION.slice()
  poisoned[0] = 4
  poisoned[2] = 0

  it('asks about your own digits rather than a pattern that is not there', () => {
    // A wrong digit poisons every candidate set and the ladder then derives
    // things confidently and wrongly. Planting one wrong digit in 197 real
    // positions, 39.6% of the time the cheapest step claimed a digit the
    // solution contradicts. Sending someone hunting for that is worse than
    // saying nothing.
    const a = askAbout(poisoned, CLASSIC, { solution: SOLUTION })
    expect(a.contradiction).toBe(true)
    expect(a.technique).toBeNull()
    expect(a.cells).toContain(0)
    // Still a question, and still not one that names the cell.
    expect(a.question).toMatch(/\?$/)
    expect(a.question).not.toMatch(/r[1-9]c[1-9]/)
    // The answer rung knows what belongs there, so the escalation still ends
    // somewhere useful.
    expect(a.placements).toContainEqual({ cell: 0, digit: 5 })
  })

  it('spots it without the solution when a cell has run out of candidates', () => {
    // Only 18.8% of planted wrong digits leave a cell with nothing in it, and
    // not one of 197 produced a duplicate in a unit. So this catches a fifth of
    // them for free and the solution catches the rest.
    const a = askAbout(poisoned)
    expect(a.contradiction).toBe(true)
    expect(a.cells).toEqual([2])
    expect(a.question).not.toMatch(/r[1-9]c[1-9]/)
  })

  it('says nothing about contradictions on a board that is merely unfinished', () => {
    const a = askAbout(medium.puzzle, CLASSIC, { solution: medium.solution })
    expect(a.contradiction).toBeUndefined()
    expect(a.technique).toBeTruthy()
  })
})

describe('the unit a question points at', () => {
  it('is whichever unit the step already names', () => {
    const step = { technique: 'hiddenSingle', placements: [{ cell: 4, digit: 7 }], cells: [4], digits: [7], unit: CLASSIC.unitMeta[5] }
    expect(focusUnit(step, CLASSIC, SOLUTION)).toBe(CLASSIC.unitMeta[5])
  })

  it('is nothing for a pattern that argues across several units', () => {
    // An X-Wing spans two rows and two columns, so naming one of them would
    // misdescribe it. Those questions name only the digit.
    const step = { technique: 'xWing', placements: [], cells: [10, 13, 37, 40], digits: [6], unit: null }
    expect(focusUnit(step, CLASSIC, SOLUTION)).toBeNull()
  })
})
