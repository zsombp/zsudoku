// Builds src/logic/__fixtures__/solvepaths.json: real puzzles whose solve paths
// between them cover every classic rung at least twice, plus a few variant
// boards. worlds.test.js walks every step of every path, so the lesson engine is
// held to the ladder on positions that genuinely arose rather than ones drawn to
// make a point. Run with node; it takes about a minute.
import fs from 'fs'
import { makePuzzle } from '../src/logic/generator.js'
import { gradePuzzle } from '../src/logic/grader.js'
import { makeVariantPuzzle } from '../src/logic/variants.js'

const want = ['hiddenSingle', 'pointing', 'claiming', 'nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple', 'nakedQuad', 'xWing', 'xyWing', 'swordfish']
const seen = Object.fromEntries(want.map(k => [k, 0]))
const out = []
const t0 = Date.now()
let seed = 4242
while (want.some(k => seen[k] < 2) && Date.now() - t0 < 150000) {
  const tier = ['Expert', 'Diabolical', 'Diabolical'][seed % 3]
  const made = makePuzzle(tier, { seed: seed++ })
  if (!made) continue
  const g = gradePuzzle(made.puzzle)
  if (!want.some(k => g.counts[k] && seen[k] < 2)) continue
  for (const k of want) if (g.counts[k]) seen[k]++
  out.push({ variant: 'classic', puzzle: made.puzzle.join('') })
}
for (const [variant, s] of [['jigsaw', 11], ['jigsaw', 23], ['x', 7], ['windoku', 5], ['antiknight', 3]]) {
  const made = makeVariantPuzzle(variant, 'Hard', { seed: s })
  if (made) out.push({ variant, regions: made.regions || null, puzzle: made.puzzle.join(''), seed: made.seed })
}
fs.writeFileSync('src/logic/__fixtures__/solvepaths.json', JSON.stringify(out, null, 0) + '\n')
console.log('puzzles:', out.length, 'coverage:', JSON.stringify(seen), Math.round((Date.now() - t0) / 1000) + 's')
