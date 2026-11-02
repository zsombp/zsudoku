// Builds src/logic/__fixtures__/solvepaths.json: real puzzles whose solve paths
// between them cover every classic rung at least twice, plus a few variant
// boards. worlds.test.js walks every step of every path, so the lesson engine is
// held to the ladder on positions that genuinely arose rather than ones drawn to
// make a point. Run with node; it takes about a minute.
import fs from 'fs'
import { makePuzzle } from '../src/logic/generator.js'
import { gradePuzzle } from '../src/logic/grader.js'
import { makeVariantPuzzle, topologyFromRecord } from '../src/logic/variants.js'

const want = ['hiddenSingle', 'pointing', 'claiming', 'nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple', 'nakedQuad', 'xWing', 'xyWing', 'swordfish', 'skyscraper', 'twoStringKite', 'wWing', 'xyzWing']
// Grows the existing file rather than replacing it: a rung added to the top of
// the ladder leaves every old solve path byte identical, and the naked quad
// took most of a run to find the first time. Delete the file to start over.
const FILE = 'src/logic/__fixtures__/solvepaths.json'
const existing = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []
const seen = Object.fromEntries(want.map(k => [k, 0]))
const out = existing.filter(f => f.variant === 'classic')
for (const f of out) {
  const g = gradePuzzle([...f.puzzle].map(Number))
  for (const k of want) if (g.counts[k]) seen[k]++
}
const t0 = Date.now()
let seed = 4242 + out.length * 1000
while (want.some(k => seen[k] < 2) && Date.now() - t0 < 150000) {
  const tier = ['Expert', 'Diabolical', 'Infernal'][seed % 3]
  const made = makePuzzle(tier, { seed: seed++ })
  if (!made) continue
  const g = gradePuzzle(made.puzzle)
  if (!want.some(k => g.counts[k] && seen[k] < 2)) continue
  for (const k of want) if (g.counts[k]) seen[k]++
  out.push({ variant: 'classic', puzzle: made.puzzle.join('') })
}
const variants = existing.filter(f => f.variant !== 'classic')
if (variants.length) out.push(...variants)
else {
  for (const [variant, s] of [['jigsaw', 11], ['jigsaw', 23], ['x', 7], ['windoku', 5], ['antiknight', 3]]) {
    const made = makeVariantPuzzle(variant, 'Hard', { seed: s })
    if (made) out.push({ variant, regions: made.regions || null, puzzle: made.puzzle.join(''), seed: made.seed })
  }
}
// Preserve the existing solves and add the generated cage cases. Their actual
// cages travel with the puzzle, so replay never depends on regenerating a seed.
for (let seed = 7001; seed <= 7005; seed++) {
  if (out.some(f => f.variant === 'killer' && f.seed === seed)) continue
  const made = makeVariantPuzzle('killer', 'Expert', { seed })
  if (made) out.push({ variant: 'killer', seed, puzzle: made.puzzle.join(''), cages: made.cages })
}
const cageRungs = ['cageCombo', 'cageSum', 'cageSingle', 'sum45', 'cageLocked']
const cageSeen = new Set()
for (const f of out.filter(f => f.variant === 'killer')) {
  const g = gradePuzzle([...f.puzzle].map(Number), { topo: topologyFromRecord(f) })
  for (const k of cageRungs) if (g.counts[k]) cageSeen.add(k)
}
if (cageRungs.some(k => !cageSeen.has(k))) throw new Error('Killer fixtures missed a rung')
fs.writeFileSync(FILE, JSON.stringify(out, null, 0) + '\n')
console.log('puzzles:', out.length, 'coverage:', JSON.stringify(seen), Math.round((Date.now() - t0) / 1000) + 's')
