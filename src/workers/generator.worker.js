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

import { makeVariantPuzzle, makeVariantPractice, makeVariantTailored } from '../logic/variants.js'

self.onmessage = event => {
  const { id, tier, seed, practice, tailored, variant = 'classic' } = event.data
  try {
    // Rare techniques need a long leash. Measured with scripts/practice.mjs:
    // Swordfish took a median 9s and naked quad landed only 67% of the time at
    // 20s, so the budget here is deliberately generous. It runs in a worker, so
    // waiting costs the interface nothing.
    const made = practice
      ? makeVariantPractice(variant, practice, { budgetMs: 30000, ...(seed === undefined ? {} : { seed }) })
      : tailored
        ? makeVariantTailored(variant, { wants: tailored, budgetMs: 20000, ...(seed === undefined ? {} : { seed }) })
        : makeVariantPuzzle(variant, tier, seed === undefined ? {} : { seed })
    if (!made) {
      self.postMessage({
        id,
        error: practice
          ? `could not find a puzzle needing that technique. It is rare; try again.`
          : tailored
            ? `could not find a puzzle built around your weak spots. Try again, or play a tier.`
            : `could not generate a ${tier} puzzle`,
      })
      return
    }
    self.postMessage({ id, made })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}
