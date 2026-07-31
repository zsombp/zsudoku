// Can practice mode actually produce a puzzle for each technique?
//
// Some rungs of the ladder are genuinely rare. This measures which ones are
// reachable and how long they take, so the interface only offers what works
// instead of spinning on something that will not arrive.
//
//   node scripts/practice.mjs [samplesPerTechnique] [budgetMsEach]

import { makePracticePuzzle } from '../src/logic/generator.js'
import { gradePuzzle } from '../src/logic/grader.js'
import { hasUniqueSolution } from '../src/logic/solver.js'
import { TECHNIQUES } from '../src/logic/techniques.js'

const N = Number(process.argv[2] || 3)
const BUDGET = Number(process.argv[3] || 20000)

console.log(`\n${N} attempts per technique, ${BUDGET / 1000}s budget each\n`)
console.log('technique        hit    median ms   tries   lands on')
console.log('-'.repeat(70))

for (const key of Object.keys(TECHNIQUES)) {
  const times = []
  const tiers = {}
  let hits = 0
  let tries = 0

  for (let i = 0; i < N; i++) {
    const t0 = performance.now()
    const made = makePracticePuzzle(key, { seed: 4000 + i, budgetMs: BUDGET })
    const ms = performance.now() - t0
    if (!made) continue
    hits++
    times.push(ms)
    tries += made.attempts
    tiers[made.graded] = (tiers[made.graded] || 0) + 1

    // Contracts: it must be a real puzzle, and it must actually need the thing.
    if (!hasUniqueSolution(made.puzzle)) throw new Error(`${key}: not unique`)
    const re = gradePuzzle(made.puzzle)
    if (!re.solved) throw new Error(`${key}: needs a guess`)
    if (!re.counts[key]) throw new Error(`${key}: does not actually require it`)
  }

  times.sort((a, b) => a - b)
  const spread = Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(', ')
  console.log(
    `${key.padEnd(15)} ${String(Math.round((hits / N) * 100) + '%').padStart(4)}   ` +
    `${(times.length ? times[Math.floor(times.length / 2)].toFixed(0) : '–').padStart(9)}   ` +
    `${String(hits ? Math.round(tries / hits) : '–').padStart(5)}   ${spread || 'never found'}`
  )
}
console.log()
