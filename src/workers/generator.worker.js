// Puzzle generation, off the main thread.
//
// The Phase 0 version ran the generator inside a setTimeout, which was fine
// when the grader was three techniques and the worst case was 162ms. The full
// ladder digs and re-grades repeatedly, and a Diabolical puzzle can take nine
// seconds. On the main thread that is a nine second frozen interface, so it
// moves here.
//
// The worker also fills the pre-generation cache while nobody is waiting, which
// is what makes "New game" feel instant despite the cost.

import { makePuzzle } from '../logic/generator.js'

self.onmessage = event => {
  const { id, tier, seed } = event.data
  try {
    const made = makePuzzle(tier, seed === undefined ? {} : { seed })
    if (!made) {
      self.postMessage({ id, error: `could not generate a ${tier} puzzle` })
      return
    }
    self.postMessage({ id, made })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}
