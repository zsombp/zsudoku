// Builds src/logic/lessonBank.json: one stock lesson position per rung, for the
// practice screen's "Learn it" when there is no game of your own to learn from.
//
// Every candidate is a real step from a real classic solve: the fixture solves
// plus a fixed run of generated Expert and Diabolical puzzles. Each is built
// into a lesson and scored for how easy it is to read: few worlds, few
// eliminations, a flaw that opens a world, a digit that lands at the end, and a
// few things per family (an X-Wing whose rows have exactly two homes each, a
// hidden single whose blockers are all digits you can see). The best of each
// rung is kept. Deterministic: same seeds, same bank.
//
// Run with node from the project root; it takes a minute or two.
import fs from 'fs'
import { makePuzzle } from '../src/logic/generator.js'
import { createState, nextStep, applyStep } from '../src/logic/grader.js'
import { buildLesson, TEACHABLE } from '../src/logic/lessons.js'
import { CLASSIC, rowOf, colOf } from '../src/logic/topology.js'
import { countMarks } from '../src/logic/marks.js'

const fixtures = JSON.parse(fs.readFileSync('src/logic/__fixtures__/solvepaths.json', 'utf8'))
const puzzles = fixtures.filter(f => f.variant === 'classic').map(f => [...f.puzzle].map(Number))

const t0 = Date.now()
for (let seed = 9001; seed < 9001 + 400 && Date.now() - t0 < 100000; seed++) {
  const made = makePuzzle(seed % 2 ? 'Diabolical' : 'Expert', { seed })
  if (made) puzzles.push(made.puzzle)
}

const IDEAL_WORLDS = { swordfish: 3, nakedTriple: 3, hiddenTriple: 3, nakedQuad: 4, xyWing: 4 }

function score(lesson, step) {
  const t = step.technique
  let s = 0
  s -= Math.abs(lesson.worldCount - (IDEAL_WORLDS[t] || 2)) * 2
  s -= Math.max(0, lesson.targets.length - 2)
  s += lesson.flaws.length * 3
  if (lesson.payoff) s += 2
  if (lesson.controls.length) s += 1
  if (step.unit?.type === 'row') s += 1
  if (t === 'hiddenSingle') {
    const block = lesson.steps[1]?.hi?.blocks || []
    const others = lesson.steps[0]?.hi?.pat?.length - 1 || 0
    if (others >= 3 && block.length === others) s += 4
    if (countMarks(lesson.cands[step.cells[0]]) >= 3) s += 2
  }
  if (t === 'xWing' || t === 'swordfish') {
    const lines = step.lines.map(l =>
      step.cells.filter(c => (step.base === 'row' ? rowOf(c) : colOf(c)) === l).length
    )
    if (t === 'xWing' && lines.every(n => n === 2)) s += 2
    if (t === 'swordfish' && lines.some(n => n === 2)) s += 1
  }
  if (t === 'xyWing') {
    const [, a, b] = step.cells
    if (!CLASSIC.peers[a].includes(b)) s += 1
    if (lesson.targets.length === 1) s += 1
  }
  return s
}

const best = {}
for (const puzzle of puzzles) {
  const state = createState(puzzle, CLASSIC)
  for (let guard = 0; guard < 800; guard++) {
    const step = nextStep(state)
    if (!step) break
    if (TEACHABLE.has(step.technique)) {
      const lesson = buildLesson({ board: state.board, cands: state.cands, step })
      if (lesson) {
        const sc = score(lesson, step)
        if (!best[step.technique] || sc > best[step.technique].sc) {
          best[step.technique] = {
            sc,
            entry: {
              technique: step.technique,
              board: state.board.join(''),
              cands: Array.from(state.cands),
              step: JSON.parse(JSON.stringify(step)),
            },
          }
        }
      }
    }
    applyStep(state, step)
  }
}

const missing = [...TEACHABLE].filter(k => !best[k])
const bank = [...TEACHABLE].filter(k => best[k]).map(k => best[k].entry)
fs.writeFileSync('src/logic/lessonBank.json', JSON.stringify(bank) + '\n')
console.log(
  'puzzles:', puzzles.length,
  'scores:', Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.sc])),
  missing.length ? 'MISSING: ' + missing.join(', ') : 'all rungs covered',
  Math.round((Date.now() - t0) / 1000) + 's'
)
