import { generateFull } from '../src/logic/generator.js'
import { topologyFor, VARIANT_LIST } from '../src/logic/variants.js'
import { mulberry32 } from '../src/lib/prng.js'
for (const v of VARIANT_LIST) {
  const topo = topologyFor(v.id, 1234)
  const t0 = Date.now()
  let ok = 0
  for (let k = 0; k < 5; k++) {
    const g = generateFull(mulberry32(k + 1), topo)
    if (g && !g.includes(0)) ok++
  }
  process.stdout.write(`${v.name.padEnd(12)} filled ${ok}/5 in ${Date.now() - t0}ms\n`)
}
