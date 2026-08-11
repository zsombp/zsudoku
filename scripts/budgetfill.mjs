// Is a jigsaw layout satisfiable at all, and how hard is it to find out?
import { makeTopology } from '../src/logic/topology.js'
import { jigsawRegions } from '../src/logic/variants.js'
import { mulberry32, shuffle } from '../src/lib/prng.js'

function fillBudgeted(topo, rng, budget) {
  const b = new Array(81).fill(0)
  let steps = 0
  const fill = () => {
    if (++steps > budget) return null
    let best = -1, bestCands = null
    for (let i = 0; i < 81; i++) {
      if (b[i] !== 0) continue
      const options = []
      for (let v = 1; v <= 9; v++) {
        let ok = true
        for (const p of topo.peers[i]) if (b[p] === v) { ok = false; break }
        if (ok) options.push(v)
      }
      if (!options.length) return false
      if (!bestCands || options.length < bestCands.length) {
        best = i; bestCands = options
        if (options.length === 1) break
      }
    }
    if (best === -1) return true
    for (const v of shuffle(bestCands, rng)) {
      b[best] = v
      const r = fill()
      if (r === null) return null
      if (r) return true
      b[best] = 0
    }
    return false
  }
  const r = fill()
  return { result: r, steps }
}

// Restarts, given the search is heavy-tailed: a run that has not succeeded
// quickly is far better abandoned than continued.
let filled = 0, totalSteps = 0, totalTries = 0, worstTries = 0
const BUDGET = 1500
for (let seed = 1; seed <= 40; seed++) {
  const topo = makeTopology({ id: 'j', name: 'J', regions: jigsawRegions(seed) })
  let tries = 0, steps = 0, done = false
  for (let attempt = 0; attempt < 60 && !done; attempt++) {
    tries++
    const r = fillBudgeted(topo, mulberry32(seed * 1000 + attempt), BUDGET)
    steps += r.steps
    if (r.result === true) done = true
    if (r.result === false) break
  }
  if (done) { filled++; totalSteps += steps; totalTries += tries; worstTries = Math.max(worstTries, tries) }
  else process.stdout.write(`seed ${seed}: never filled\n`)
}
process.stdout.write(`\n40 layouts, budget ${BUDGET} with restarts: ${filled} filled\n`)
process.stdout.write(`average ${(totalTries / filled).toFixed(1)} restarts, ${Math.round(totalSteps / filled)} steps; worst ${worstTries} restarts\n`)
