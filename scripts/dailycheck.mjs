// Would a variant daily actually generate in time, on the day it is wanted?
import { makeVariantPuzzle } from '../src/logic/variants.js'
const plan = [
  ['x', 'Easy'], ['jigsaw', 'Medium'], ['windoku', 'Medium'],
  ['antiknight', 'Hard'], ['classic', 'Expert'], ['classic', 'Diabolical'],
]
for (const [variant, tier] of plan) {
  let worst = 0, total = 0, made = 0
  for (let k = 0; k < 3; k++) {
    const t0 = Date.now()
    const p = makeVariantPuzzle(variant, tier, { seed: 900000 + k * 7919 })
    const ms = Date.now() - t0
    total += ms
    worst = Math.max(worst, ms)
    if (p) made++
  }
  process.stdout.write(`${variant.padEnd(11)} ${tier.padEnd(11)} made ${made}/3  avg ${Math.round(total / 3)}ms  worst ${worst}ms\n`)
}
