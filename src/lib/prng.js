// Seedable random. The prototype used Math.random directly, which makes every
// puzzle unreproducible. Everything downstream that matters needs a seed: the
// daily puzzle, sharing a puzzle by seed, and reproducing a generator bug.

/** mulberry32. Small, fast, good enough for shuffling a sudoku grid. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh unpredictable seed, for ordinary "new game". */
export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
  }
  return Math.floor(Math.random() * 0xffffffff)
}

/**
 * A seed derived from a calendar date, for the daily puzzle in Phase 6.
 * Same date gives the same seed on every device, with no server involved.
 */
export function seedFromDate(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  let h = 2166136261 >>> 0
  for (const ch of `${y}-${m}-${d}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** Fisher-Yates against a supplied rng. Never uses Math.random. */
export function shuffle(arr, rng) {
  const x = [...arr]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}
