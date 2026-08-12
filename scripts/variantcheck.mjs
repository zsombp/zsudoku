// Does each variant generate, is the result sound, and does the difficulty
// scale calibrated for classic still land where it claims?
import { makeVariantPuzzle, topologyFor, killerTopology, VARIANT_LIST } from '../src/logic/variants.js'
import { makeTopology } from '../src/logic/topology.js'
import { gradePuzzle } from '../src/logic/grader.js'
import { countSolutions } from '../src/logic/solver.js'
import { countKillerSolutions } from '../src/logic/killer.js'

const tier = process.argv[2] || 'Hard'
const N = Number(process.argv[3] || 3)

const topoOf = made =>
  made.regions
    ? makeTopology({ id: 'jigsaw', name: 'Jigsaw', regions: made.regions })
    : made.cages
      ? killerTopology(made.cages)
      : topologyFor(made.variant, made.seed)

// Asked the right way for the board it is. `countSolutions` knows nothing about
// cages, so on a killer with three givens it reports thousands and the column
// would read 0/3 on puzzles that are perfectly sound.
const answers = (made, topo) =>
  made.cages
    ? countKillerSolutions(made.puzzle, made.cages, 2, topo)
    : countSolutions(made.puzzle, 2, topo)

process.stdout.write(`${tier}, ${N} each\n`)
process.stdout.write('variant       made   ms/ea   clues   score   landed          unique  ladder\n')
for (const v of VARIANT_LIST) {
  let made = 0, ms = 0, clues = 0, score = 0, unique = 0, solved = 0
  const landed = {}
  for (let k = 0; k < N; k++) {
    const t0 = Date.now()
    const p = makeVariantPuzzle(v.id, tier, { seed: 4000 + k * 101 })
    ms += Date.now() - t0
    if (!p) continue
    made++
    clues += p.clues
    score += p.score
    landed[p.graded] = (landed[p.graded] || 0) + 1
    const topo = topoOf(p)
    if (answers(p, topo) === 1) unique++
    if (gradePuzzle(p.puzzle, { topo }).solved) solved++
  }
  process.stdout.write(
    v.name.padEnd(13) +
      `${made}/${N}`.padEnd(7) +
      String(Math.round(ms / N)).padEnd(8) +
      (made ? Math.round(clues / made) : 0).toString().padEnd(8) +
      (made ? Math.round(score / made) : 0).toString().padEnd(8) +
      Object.entries(landed).map(([k, n]) => `${k}x${n}`).join(' ').padEnd(16) +
      `${unique}/${made}`.padEnd(8) +
      `${solved}/${made}\n`
  )
}
