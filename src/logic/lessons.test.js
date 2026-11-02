import { describe, it, expect } from 'vitest'
import fixtures from './__fixtures__/solvepaths.json'
import { createState, nextStep, applyStep, hintPlacement } from './grader.js'
import { topologyFromRecord } from './variants.js'
import { buildLesson, analyse, canTeach, TEACHABLE, survivorPhrase, withFlaw, judgePrediction } from './lessons.js'
import { stockLesson, STOCK } from './lessonBank.js'
import { explainBottleneck, explainPlacement } from './explain.js'
import { hasMark, countMarks } from './marks.js'
import { CLASSIC } from './topology.js'
import { solve, hasUniqueSolution } from './solver.js'

/**
 * A lesson is a promise that an argument holds, so every lesson the app can
 * build is held to it here, on every teachable step of sixteen real solves:
 *
 *   the worlds kill every elimination the ladder made, with no flaw on
 *   every flaw it offers opens at least one world where a target lives
 *   a control survives in at least one world, or it would be a target
 *   a payoff is a digit you could place straight after the elimination
 *   none of the copy has a hole in it
 */
function walk(entry, visit) {
  const topo = topologyFromRecord({ variant: entry.variant, regions: entry.regions, seed: entry.seed })
  const state = createState([...entry.puzzle].map(Number), topo)
  for (let guard = 0; guard < 800; guard++) {
    const step = nextStep(state)
    if (!step) break
    visit(step, state.board.slice(), state.cands.slice(), topo)
    applyStep(state, step)
  }
}

const HOLES = /undefined|NaN|null|\[object|—|–/

function copyOf(lesson) {
  const a = analyse(lesson)
  const lines = lesson.steps.flatMap(s => [s.title, s.text, s.payoff || '', s.askTitle || '', s.askText || ''])
  for (const w of a.worlds) lines.push(lesson.caption(w, a.cands))
  lines.push(lesson.worldKill, lesson.intactLine(a.worlds.length))
  for (const f of lesson.flaws) {
    lines.push(f.label)
    const b = analyse(lesson, f)
    for (const i of b.survivorWorlds) lines.push(survivorPhrase(b.per[i]))
  }
  return lines
}

function direct(board, cands, topo, cell, digit) {
  if (!hasMark(cands[cell], digit)) return false
  if (countMarks(cands[cell]) === 1) return true
  return topo.units.some(
    u => u.includes(cell) && u.filter(i => board[i] === 0 && hasMark(cands[i], digit)).length === 1
  )
}

describe('every lesson holds its own argument', () => {
  const built = {}

  for (const [n, entry] of fixtures.entries()) {
    it(`builds a sound lesson for every teachable step of solve ${n + 1} (${entry.variant})`, () => {
      walk(entry, (step, board, cands, topo) => {
        if (!canTeach(step.technique)) return
        const lesson = buildLesson({ board, cands, step, topo })
        expect(lesson, `${step.technique}: ${step.detail}`).toBeTruthy()
        built[step.technique] = (built[step.technique] || 0) + 1

        const a = analyse(lesson)
        expect(a.intact).toBe(true)
        expect(a.truncated).toBe(false)
        expect(lesson.worldCount).toBe(a.worlds.length)

        for (const f of lesson.flaws) {
          const b = analyse(lesson, f)
          expect(b.intact, `${step.technique} flaw "${f.label}" changes nothing`).toBe(false)
          expect(b.survivorWorlds.length).toBeGreaterThan(0)
          // A flaw only ever touches empty cells.
          for (const [c] of [...(f.add || []), ...(f.remove || [])]) expect(board[c]).toBe(0)
        }

        if (lesson.controls.length) {
          const c = analyse(lesson, null, lesson.controls)
          expect(c.dead, `${step.technique}: a control dies everywhere`).toHaveLength(0)
        }

        if (lesson.payoff) {
          const after = withFlaw(cands, { remove: lesson.targets })
          expect(direct(board, after, topo, lesson.payoff.cell, lesson.payoff.digit)).toBe(true)
        }

        for (const line of copyOf(lesson)) expect(line, `${step.technique}: "${line}"`).not.toMatch(HOLES)
        // Steps run build, then worlds, then apply, then break, and a lesson
        // with no flaw has no break step at all.
        const modes = lesson.steps.map(s => s.mode || 'build')
        expect(modes.filter(m => m === 'break').length).toBe(lesson.flaws.length ? 1 : 0)
        expect(modes).toContain('apply')
      })
    })
  }

  it('reached every teachable rung', () => {
    for (const k of TEACHABLE) expect(built[k] || 0, `${k} never built`).toBeGreaterThan(0)
  })
})

describe('the lessons on a hand-made XY-Wing', () => {
  // The prototype's position: pivot r5c5 {4,7}, pincers r5c2 {4,9} and r2c5
  // {7,9}, target r2c2 {3,9}, and r4c2 {1,9} seeing only one pincer.
  const at = (r, c) => (r - 1) * 9 + (c - 1)
  const board = new Array(81).fill(0)
  const cands = new Int16Array(81)
  const set = (cell, ds) => (cands[cell] = ds.reduce((m, d) => m | (1 << (d - 1)), 0))
  // Fill the rest of the grid with digits that do not touch the pattern, so
  // the board is a position and not a void. Only the cells below are empty.
  for (let i = 0; i < 81; i++) board[i] = 1 + ((i * 7) % 9)
  for (const [cell, ds] of [
    [at(5, 5), [4, 7]],
    [at(5, 2), [4, 9]],
    [at(2, 5), [7, 9]],
    [at(2, 2), [3, 9]],
    [at(4, 2), [1, 9]],
  ]) {
    board[cell] = 0
    set(cell, ds)
  }
  const step = {
    technique: 'xyWing',
    cells: [at(5, 5), at(5, 2), at(2, 5)],
    digits: [4, 7, 9],
    eliminations: [{ cell: at(2, 2), digit: 9 }],
    placements: [],
  }
  const lesson = buildLesson({ board, cands, step })

  it('builds, with four worlds', () => {
    expect(lesson).toBeTruthy()
    expect(lesson.worldCount).toBe(4)
  })

  it('keeps r4c2 as a control: it sees only one pincer', () => {
    expect(lesson.controls).toEqual([[at(4, 2), 9]])
    expect(lesson.steps.find(s => s.mode === 'apply').payoff).toMatch(/r4c2 keeps its 9/)
  })

  it('ends on the 3 that is left in r2c2', () => {
    expect(lesson.payoff).toMatchObject({ cell: at(2, 2), digit: 3, how: 'naked' })
  })

  it('names the pivot and both links', () => {
    const text = lesson.steps.map(s => s.text).join(' ')
    expect(text).toMatch(/r5c5 is the pivot\. It shares a 4 with r5c2 and a 7 with r2c5/)
  })
})

describe('the stock lessons', () => {
  it('has a position for every teachable rung, and every one builds with a flaw', () => {
    expect([...STOCK].sort()).toEqual([...TEACHABLE].sort())
    for (const k of TEACHABLE) {
      const lesson = stockLesson(k)
      expect(lesson, k).toBeTruthy()
      expect(analyse(lesson).intact).toBe(true)
      // A hidden single is a scan, not a case split, and has no flaw by design.
      if (k !== 'hiddenSingle') expect(lesson.flaws.length, `${k} has no flaw`).toBeGreaterThan(0)
    }
  })

  it('is a real position: every stock board still has a unique solution', () => {
    for (const k of TEACHABLE) {
      const { board } = stockLesson(k)
      expect(hasUniqueSolution(board), k).toBe(true)
    }
  })

  it('has nothing for the naked single or the cage rungs', () => {
    expect(stockLesson('nakedSingle')).toBeNull()
    expect(stockLesson('sum45')).toBeNull()
  })
})

describe('your guess first', () => {
  // The question step asks for a guess before it shows anything. What it asks
  // for is worked out from the targets (cells outside the pattern, or digits
  // inside it), and the copy is written per family, so the two have to agree
  // on every lesson the app can build, not only the stock ones.
  it('asks for the kind of answer its copy promises, on every teachable step of every solve', () => {
    let asked = 0
    for (const entry of fixtures) {
      walk(entry, (step, board, cands, topo) => {
        if (!canTeach(step.technique)) return
        const lesson = buildLesson({ board, cands, step, topo })
        if (!lesson) return
        const ask = lesson.steps.filter(s => s.predict)
        if (step.technique === 'hiddenSingle') {
          expect(lesson.predict ?? null).toBeNull()
          return
        }
        expect(ask, step.technique).toHaveLength(1)
        const p = lesson.predict
        expect(p, step.technique).toBeTruthy()
        expect(ask[0].askText, step.technique).toMatch(p.kind === 'digits' ? /Pick them\.$/ : /Tap them\.$/)
        // The answer is exactly what the ladder removed, said the right way.
        const right = judgePrediction(lesson, p.answer)
        expect(right.exact).toBe(true)
        expect(right.text).not.toMatch(HOLES)
        if (p.kind === 'digits') {
          for (const d of p.answer) expect(p.offer).toContain(d)
          expect(p.offer.length).toBeGreaterThan(p.answer.length)
        } else {
          for (const c of p.answer) expect(board[c]).toBe(0)
        }
        asked++
      })
    }
    expect(asked).toBeGreaterThan(40)
  })

  it('judges a partial guess by what it got, what it missed and what it added', () => {
    const lesson = stockLesson('pointing')
    const [first, ...rest] = lesson.predict.answer
    const stray = lesson.board.findIndex((v, c) => v === 0 && !lesson.predict.answer.includes(c))
    const r = judgePrediction(lesson, [first, stray])
    expect(r.exact).toBe(false)
    expect(r.hits).toEqual([first])
    expect(r.missed).toEqual(rest)
    expect(r.extra).toEqual([stray])
    expect(r.text).toMatch(/^You named 1 of \d\./)
    expect(r.text).toMatch(/keeps its notes\.$/)
    expect(r.text).not.toMatch(HOLES)
  })

  it('asks for digits on a hidden set, where the cells are already given', () => {
    const lesson = stockLesson('hiddenPair')
    expect(lesson.predict.kind).toBe('digits')
    const r = judgePrediction(lesson, [])
    expect(r.exact).toBe(false)
    expect(r.missed).toEqual(lesson.predict.answer)
  })
})

describe('the hint teaches the hard step', () => {
  // A real position from the fixtures where the ladder has to eliminate before
  // any digit can be placed: the hint must say what was needed, and the pattern
  // rung must draw the elimination, not the single it uncovered.
  function hardSpot() {
    for (const entry of fixtures.filter(f => f.variant === 'classic')) {
      const sol = solve([...entry.puzzle].map(Number))
      const state = createState([...entry.puzzle].map(Number), CLASSIC)
      for (let guard = 0; guard < 800; guard++) {
        const step = nextStep(state)
        if (!step) break
        if (step.technique === 'xyWing' || step.technique === 'xWing' || step.technique === 'hiddenPair') {
          // Only a spot where no placement is available at all.
          const fresh = createState(state.board, CLASSIC)
          const first = nextStep(fresh)
          if (first && !first.placements.length) return { board: state.board.slice(), solution: sol }
        }
        applyStep(state, step)
      }
    }
    return null
  }

  it('reports what the position needed and how to get there', () => {
    const spot = hardSpot()
    expect(spot).toBeTruthy()
    const h = hintPlacement(spot.board, spot.solution, CLASSIC)
    expect(h).toBeTruthy()
    expect(h.needed).not.toBe(h.technique)
    expect(h.via.step.technique).toBe(h.needed)
    expect(h.via.step.eliminations.length).toBeGreaterThan(0)

    const ex = explainBottleneck(h.via, h.cell, h.digit)
    expect(ex.technique).toBe(h.needed)
    expect(ex.why).toMatch(/removes .* That is what lets \d go in r\dc\d\./)
    // And the same moment opens as a lesson.
    const lesson = buildLesson({ ...ex.lesson, topo: CLASSIC, source: 'hint', hint: { cell: h.cell, digit: h.digit } })
    if (canTeach(h.needed)) {
      expect(lesson).toBeTruthy()
      expect(analyse(lesson).intact).toBe(true)
    }
  })

  it('hands a placement explanation the candidates from before its pattern fired', () => {
    // A derived explanation draws the candidates left after the elimination;
    // the lesson needs the ones before it, or there is nothing to strike.
    for (const entry of fixtures.filter(f => f.variant === 'classic')) {
      const state = createState([...entry.puzzle].map(Number), CLASSIC)
      for (let guard = 0; guard < 800; guard++) {
        const step = nextStep(state)
        if (!step) break
        if (step.placements.length) {
          const p = step.placements[0]
          const ex = explainPlacement(state.board, p.cell, p.digit, CLASSIC)
          if (ex?.kind === 'sharp' && canTeach(ex.technique)) {
            for (const e of ex.lesson.step.eliminations) expect(hasMark(ex.lesson.cands[e.cell], e.digit)).toBe(true)
            expect(buildLesson({ ...ex.lesson, topo: CLASSIC })).toBeTruthy()
            return
          }
        }
        applyStep(state, step)
      }
    }
  })
})
