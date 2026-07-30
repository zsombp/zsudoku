// Measures what the generator actually delivers against what was requested,
// and how long it takes to do it.
//
// This is the baseline Phase 2 gets calibrated against. Run it before and after
// the grader rebuild and compare: the point of the rebuild is a higher exact-hit
// rate and no puzzle that needs guessing.
//
//   node scripts/distribution.mjs [samplesPerTier]

import { makePuzzle } from '../src/logic/generator.js'
import { gradePuzzle } from '../src/logic/grader.js'
import { hasUniqueSolution } from '../src/logic/solver.js'
import { DIFFS, LEVEL_NAME } from '../src/logic/difficulty.js'

const N = Number(process.argv[2] || 25)
const pct = (a, b) => `${((a / b) * 100).toFixed(0)}%`

console.log(`\n${N} puzzles per tier\n`)
console.log('tier      hit    graded as                         clues   median ms   worst ms')
console.log('-'.repeat(84))

for (const [wanted, spec] of Object.entries(DIFFS)) {
  const times = []
  const graded = {}
  const clues = []
  let hits = 0
  let unique = 0

  for (let i = 0; i < N; i++) {
    const t0 = performance.now()
    const made = makePuzzle(wanted, { seed: 1000 + i })
    times.push(performance.now() - t0)
    const name = LEVEL_NAME[made.level]
    graded[name] = (graded[name] || 0) + 1
    clues.push(made.clues)
    if (made.level === spec.level) hits++
    if (hasUniqueSolution(made.puzzle)) unique++
    // The grader must agree with itself: the level reported has to be the level
    // the puzzle actually grades at.
    if (gradePuzzle(made.puzzle) !== made.level) throw new Error(`grade mismatch on ${wanted} #${i}`)
  }

  times.sort((a, b) => a - b)
  clues.sort((a, b) => a - b)
  const spread = Object.entries(graded)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')

  console.log(
    `${wanted.padEnd(9)} ${pct(hits, N).padStart(4)}   ${spread.padEnd(32)}  ${String(clues[Math.floor(N / 2)]).padStart(4)}   ${times[Math.floor(N / 2)].toFixed(0).padStart(9)}   ${times[N - 1].toFixed(0).padStart(8)}`
  )

  if (unique !== N) console.log(`  WARNING: ${N - unique} of ${N} ${wanted} puzzles were not unique`)
}

console.log(
  '\nNote: level 4 ("Expert") is a catch-all in the Phase 0 grader. It includes\n' +
  'puzzles solvable with an X-Wing and puzzles solvable only by guessing, with no\n' +
  'way to tell them apart. That is the thing Phase 2 fixes.\n'
)
