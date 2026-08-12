// Does the post-game review read the board the game was actually played on?
//
// Same trick as classcheck.mjs, one variant at a time. A ladder-perfect player
// must score zero Lucky whatever the topology, because every digit it writes
// was derived a moment earlier by the ladder itself. Any Lucky here is the
// classifier reasoning about a board that is not the one in front of it.
//
// Run with `node scripts/variantclass.mjs [tier] [n]`.
import { makeVariantPuzzle, topologyFromRecord, VARIANT_LIST } from '../src/logic/variants.js'
import { createState, nextStep, applyStep } from '../src/logic/grader.js'
import { analyseGame } from '../src/stats/analysis.js'

const tier = process.argv[2] || 'Medium'
const N = Number(process.argv[3] || 2)

process.stdout.write(`${tier}, ${N} each. A ladder-perfect solve, so lucky must be 0.\n`)
process.stdout.write('variant       moves  routine  solid  sharp  lucky  missed\n')

for (const v of VARIANT_LIST) {
  let moves = 0
  const counts = { routine: 0, solid: 0, sharp: 0, lucky: 0 }
  let missed = 0
  for (let k = 0; k < N; k++) {
    const made = makeVariantPuzzle(v.id, tier, { seed: 7000 + k * 313 })
    if (!made) continue
    const record = {
      variant: made.variant,
      regions: made.regions,
      cages: made.cages,
      seed: made.seed,
      puzzle: made.puzzle,
      solution: made.solution,
      moveLog: [],
    }
    const topo = topologyFromRecord(record)

    const st = createState(made.puzzle, topo)
    let t = 0
    for (let guard = 0; guard < 800 && st.board.includes(0); guard++) {
      const step = nextStep(st)
      if (!step) break
      for (const p of step.placements) {
        t += 1000
        record.moveLog.push({ t, kind: 'place', cell: p.cell, value: p.digit, correct: true })
      }
      applyStep(st, step)
    }

    const out = analyseGame(record)
    moves += out.moves.length
    for (const key of Object.keys(counts)) counts[key] += out.counts[key] || 0
    missed += out.missed
  }
  process.stdout.write(
    v.id.padEnd(13) +
      String(moves).padStart(5) +
      String(counts.routine).padStart(9) +
      String(counts.solid).padStart(7) +
      String(counts.sharp).padStart(7) +
      String(counts.lucky).padStart(7) +
      String(missed).padStart(8) +
      '\n'
  )
}
