// Sanity check for the move classifier, run with `node scripts/classcheck.mjs`.
//
// Two players on the same puzzles. One follows the ladder exactly and must
// never be graded lucky and never make a mistake, because every move it makes
// was derived. The other fills correct digits in reading order, which is not
// deduction at all, and must be graded lucky most of the time.
//
// The pair is the point: either alone can be satisfied by a classifier that
// always answers the same thing.
import { makePuzzle } from '../src/logic/generator.js'
import { createState, nextStep, applyStep } from '../src/logic/grader.js'
import { analyseGame } from '../src/stats/analysis.js'

for (const tier of ['Easy', 'Medium', 'Hard', 'Tough', 'Diabolical']) {
  const made = makePuzzle(tier, { seed: 20260731 })
  if (!made) { console.log(tier.padEnd(11), 'no puzzle'); continue }

  // Play it the way the ladder would, recording each placement as a move.
  const st = createState(made.puzzle)
  const log = []
  let t = 0
  for (let guard = 0; guard < 800 && st.board.includes(0); guard++) {
    const step = nextStep(st)
    if (!step) break
    for (const p of step.placements) {
      t += 1000
      log.push({ t, kind: 'place', cell: p.cell, value: p.digit, correct: true })
    }
    applyStep(st, step)
  }

  // The other player: correct digits, but filled left to right, top to bottom.
  const blind = []
  let bt = 0
  for (let i = 0; i < 81; i++) {
    if (made.puzzle[i] !== 0) continue
    bt += 1000
    blind.push({ t: bt, kind: 'place', cell: i, value: made.solution[i], correct: true })
  }

  const run = moveLog => {
    const t0 = Date.now()
    const out = analyseGame({ puzzle: made.puzzle, solution: made.solution, moveLog })
    return { ...out, ms: Date.now() - t0 }
  }
  const show = r =>
    ['routine', 'solid', 'sharp', 'lucky', 'mistake'].map(k => `${k} ${String(r.counts[k] || 0).padStart(2)}`).join(' ')

  const ladder = run(log)
  const reading = run(blind)
  console.log(
    tier.padEnd(11),
    `${String(ladder.moves.length).padStart(2)} moves`,
    `| ladder ${show(ladder)}`,
    `| reading ${show(reading)}`,
    `| ${ladder.ms + reading.ms}ms`
  )
}
