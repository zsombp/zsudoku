// Builds src/logic/lessonBank.json: one stock lesson position per rung, for the
// practice screen's "Learn it" when there is no game of your own to learn from.
//
// Every candidate is a real step from a real solve: the fixture solves
// plus fixed seeds of classic and killer puzzles. Each is built
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
import { makeVariantPuzzle, topologyFromRecord } from '../src/logic/variants.js'
import { CAGE_TECHNIQUES } from '../src/logic/techniques.js'

const fixtures = JSON.parse(fs.readFileSync('src/logic/__fixtures__/solvepaths.json', 'utf8'))
// Existing classic choices are already curated. Keep them byte identical unless
// explicitly refreshing them; adding a board should not reshuffle old lessons.
const refreshClassic = process.argv.includes('--refresh-classic')
const file = 'src/logic/lessonBank.json'
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
const preserve = existing.filter(e => !CAGE_TECHNIQUES.includes(e.technique) && !refreshClassic)
const preserved = new Set(preserve.map(e => e.technique))
const puzzles = fixtures.filter(f => f.variant === 'classic' || f.variant === 'killer').map(f => ({ ...f, puzzle: [...f.puzzle].map(Number) }))

const t0 = Date.now()
for (let seed = 9001; (refreshClassic || !preserve.length) && seed < 9001 + 400 && Date.now() - t0 < 100000; seed++) {
  const made = makePuzzle(['Expert', 'Diabolical', 'Infernal'][seed % 3], { seed })
  if (made) puzzles.push({ variant: 'classic', puzzle: made.puzzle })
}

// Fixed seeds cover both directions of the 45 rule and the rarer cage lock.
for (let seed = 7001; seed <= 7008; seed++) {
  if (puzzles.some(p => p.variant === 'killer' && p.seed === seed)) continue
  const made = makeVariantPuzzle('killer', 'Expert', { seed })
  if (made) puzzles.push({ ...made, variant: 'killer', seed })
}

const IDEAL_WORLDS = { hiddenSingle: 1, swordfish: 3, nakedTriple: 3, hiddenTriple: 3, nakedQuad: 4, xyWing: 4, skyscraper: 3, twoStringKite: 3, wWing: 4, xyzWing: 5 }

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

const best = Object.fromEntries(preserve.map(entry => [entry.technique, { sc: Infinity, entry }]))
for (const record of puzzles) {
  const topo = topologyFromRecord(record)
  const state = createState(record.puzzle, topo)
  for (let guard = 0; guard < 800; guard++) {
    const step = nextStep(state)
    if (!step) break
    if (TEACHABLE.has(step.technique) && !preserved.has(step.technique)) {
      const lesson = buildLesson({ board: state.board, cands: state.cands, step, topo })
      // A stock lesson without a "break it" step teaches half the idea, so one
      // is only kept when nothing with a flaw turns up. The hidden single is
      // a scan and the 45 rule is subtraction; neither has a flaw.
      if (lesson && (lesson.flaws.length || ['hiddenSingle', 'sum45'].includes(step.technique) || !best[step.technique])) {
        const sc = score(lesson, step) + (lesson.flaws.length || ['hiddenSingle', 'sum45'].includes(step.technique) ? 100 : 0)
        if (!best[step.technique] || sc > best[step.technique].sc) {
          best[step.technique] = {
            sc,
            entry: {
              technique: step.technique,
              board: state.board.join(''),
              cands: Array.from(state.cands),
              step: JSON.parse(JSON.stringify(step)),
              ...(topo.cages ? { variant: 'killer', cages: topo.cages } : {}),
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
if (missing.length) throw new Error('Missing lessons: ' + missing.join(', '))
fs.writeFileSync(file, JSON.stringify(bank) + '\n')
console.log(
  'puzzles:', puzzles.length,
  'scores:', Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.sc])),
  missing.length ? 'MISSING: ' + missing.join(', ') : 'all rungs covered',
  Math.round((Date.now() - t0) / 1000) + 's'
)
