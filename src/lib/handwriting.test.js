import { describe, it, expect } from 'vitest'
import { recognise, prepare, features, distance, PROTOTYPES, DIGITS, UNSURE_MARGIN } from './handwriting.js'

/**
 * Strokes for the tests are drawn here rather than imported from the recogniser
 * so that a test cannot pass by agreeing with the thing it is testing. They are
 * deliberately crude: straight segments between a handful of points, sampled
 * evenly, which is roughly what a finger dragged across glass leaves behind.
 *
 * Accuracy is not tested here. Nine digits at one sample each says nothing
 * about accuracy, and pretending otherwise would be the exact dishonesty this
 * app exists to avoid. The measurement lives in scripts/handwriting.mjs and
 * reports a confusion matrix over 9000 strokes. What is tested here is
 * behaviour that must hold for every stroke: that a tap places nothing, that
 * moving the writing across the pad changes nothing, that a stroke order the
 * recogniser does not know is reported as unsure rather than confidently wrong.
 */
function ink(points, { at = [0, 0], size = 200, per = 9 } = {}) {
  const out = []
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    for (let s = 0; s < per; s++) {
      const t = s / per
      out.push({ x: at[0] + (ax + t * (bx - ax)) * size, y: at[1] + (ay + t * (by - ay)) * size })
    }
  }
  const [lx, ly] = points[points.length - 1]
  out.push({ x: at[0] + lx * size, y: at[1] + ly * size })
  return out
}

// A written 1, 7, 6 and 9, as somebody who is not being careful would draw
// them. 6 and 9 are here because they are the pair the loop position exists to
// separate, and 1 and 7 because they are the pair that most often goes wrong.
const ONE = [[0.5, 0], [0.48, 0.5], [0.46, 1]]
const SEVEN = [[0.05, 0.05], [0.4, 0.03], [0.72, 0.04], [0.5, 0.5], [0.3, 1]]
const SIX = [
  [0.6, 0.03], [0.3, 0.14], [0.1, 0.42], [0.07, 0.68], [0.18, 0.92], [0.4, 1],
  [0.58, 0.9], [0.58, 0.68], [0.4, 0.56], [0.18, 0.6], [0.08, 0.72],
]
const NINE = [
  [0.58, 0.13], [0.4, 0.03], [0.18, 0.12], [0.14, 0.3], [0.28, 0.45], [0.5, 0.45],
  [0.6, 0.32], [0.6, 0.13], [0.6, 0.55], [0.58, 1],
]

describe('reading a digit off a stroke', () => {
  it('says nothing at all when the pad was only tapped', () => {
    // The pad commits nothing on its own, but a tap that returned a digit would
    // still put a guess on screen for every stray touch while scrolling.
    expect(recognise([[{ x: 10, y: 10 }]])).toBeNull()
    expect(recognise([])).toBeNull()
    expect(recognise([[{ x: 10, y: 10 }, { x: 10, y: 10 }]])).toBeNull()
  })

  it('reads the same digit wherever on the pad it was written and however big', () => {
    // A recogniser that quietly depended on pad coordinates would work
    // perfectly in testing and drift the moment the layout changed, or on a
    // phone against a desktop, where the pad is a different size.
    const small = recognise([ink(SEVEN, { at: [4, 4], size: 60 })])
    const large = recognise([ink(SEVEN, { at: [180, 90], size: 300 })])
    expect(small.digit).toBe(large.digit)
    expect(small.alternatives).toEqual(large.alternatives)
    expect(Math.abs(small.distance - large.distance)).toBeLessThan(0.02)
  })

  it('ignores a speck of ink beside a real stroke', () => {
    // A finger that touches down twice adds a stroke of nearly no length. The
    // stroke count is a feature, so an uncounted speck moves the answer.
    const clean = recognise([ink(ONE)])
    const withSpeck = recognise([ink(ONE), [{ x: 210, y: 30 }, { x: 212, y: 32 }]])
    expect(withSpeck.digit).toBe(clean.digit)
    expect(withSpeck.features.strokeCount).toBe(1)
  })

  it('offers every digit as a correction, best match first', () => {
    // The pad's correction row is ordered by this, so a misread is one tap from
    // the right answer rather than a hunt along nine identical buttons.
    const r = recognise([ink(SIX)])
    expect(r.alternatives[0]).toBe(r.digit)
    expect([...r.alternatives].sort((a, b) => a - b)).toEqual(DIGITS)
  })

  it('puts the loop of a 6 low and the loop of a 9 high', () => {
    // The only thing separating them. Both are one loop and one tail with much
    // the same turning, so if this collapses the two digits become one.
    const six = recognise([ink(SIX)])
    const nine = recognise([ink(NINE)])
    expect(six.features.loops).toBe(1)
    expect(nine.features.loops).toBe(1)
    expect(six.features.loopY).toBeGreaterThan(0.6)
    expect(nine.features.loopY).toBeLessThan(0.4)
  })

  it('does not find a loop across the gap where the pen lifted', () => {
    // Found by measuring rather than by reading: the stem of a two-stroke 4
    // passes close to its own bar, and the near-closure search was joining the
    // two through the pen-up jump and reporting two holes in every 4. It made
    // the loop feature measure worse than useless, which is what gave it away.
    const bar = ink([[0.52, 0.02], [0.04, 0.66], [0.76, 0.66]])
    const stem = ink([[0.56, 0.08], [0.56, 1]])
    expect(recognise([bar, stem]).features.loops).toBe(0)
    // And a genuine crossing is still counted, because the stem does cross.
    expect(recognise([bar, stem]).features.crossings).toBeGreaterThan(0)
  })

  it('admits it is unsure when two digits fit the stroke equally badly', () => {
    // The whole safety of the feature rests on this number. A recogniser that
    // reported every guess as certain would put the caveat nowhere and the pad
    // would read as reliable when it is not.
    const scribble = ink([[0.2, 0.3], [0.8, 0.7], [0.3, 0.9], [0.7, 0.1], [0.1, 0.6], [0.9, 0.4]])
    const r = recognise([scribble])
    expect(r.sure).toBe(false)
    expect(r.margin).toBeLessThan(UNSURE_MARGIN)
  })

  it('still names a digit for a shape that is not one', () => {
    // Written down as a limit rather than a wish. There is no detector here for
    // "that is not a digit", and measuring says there cannot be a cheap one: a
    // circle matches its nearest digit at 0.218 and a zigzag at 0.171, while
    // real strokes from an unsteady hand run to a median of 0.181, so the two
    // populations sit on top of each other and no distance cutoff separates
    // them. This test exists so that a later change claiming to reject
    // non-digits has to face the same measurement.
    const circle = ink([
      [0.5, 0], [0.9, 0.2], [1, 0.5], [0.9, 0.8], [0.5, 1],
      [0.1, 0.8], [0, 0.5], [0.1, 0.2], [0.5, 0],
    ])
    const r = recognise([circle])
    expect(DIGITS).toContain(r.digit)
    expect(r.distance).toBeLessThan(0.3)
  })

  it('is sure about a stroke it has a description for', () => {
    // The other half of the previous test. A threshold that never clears is the
    // same bug as one that always does.
    const r = recognise([ink(ONE)])
    expect(r.sure).toBe(true)
    expect(r.margin).toBeGreaterThan(UNSURE_MARGIN)
  })

  it('reads back every shape it claims to know', () => {
    // Not a measure of accuracy: these are the recogniser's own descriptions
    // read back to it, which is the easiest possible test. It catches one thing
    // and is worth keeping for it: a prototype with a typo in its points, or
    // filed under the wrong digit, which would otherwise silently drag every
    // real stroke near it towards the wrong answer.
    for (const p of PROTOTYPES) {
      const strokes = p.strokes.map(s => ink(s.map(([x, y]) => [x, y]), { per: 4 }))
      const r = recognise(strokes)
      expect(`${p.digit} ${p.name} read as ${r.digit}`).toBe(`${p.digit} ${p.name} read as ${p.digit}`)
    }
  })

  it('scores a shape against itself as zero and never below', () => {
    // A distance that could go negative would let one prototype win by being
    // strange rather than by being close.
    const f = features(prepare([ink(SIX)]))
    expect(distance(f, f)).toBeCloseTo(0, 10)
    for (const p of PROTOTYPES) {
      const g = features(prepare(p.strokes.map(s => ink(s.map(([x, y]) => [x, y]), { per: 4 }))))
      expect(distance(f, g)).toBeGreaterThanOrEqual(0)
      expect(distance(f, g)).toBeLessThanOrEqual(1)
      // Order cannot matter, or which of two shapes was the prototype would.
      expect(distance(f, g)).toBeCloseTo(distance(g, f), 12)
    }
  })

  it('survives points that are not numbers', () => {
    // Pointer events on a page being scrolled have produced NaN coordinates
    // before now. Every downstream number would become NaN and the guess would
    // come out as whichever prototype was first in the list.
    const dirty = [{ x: 0, y: 0 }, { x: NaN, y: 5 }, { x: 20, y: 40 }, { x: 22, y: 90 }, { x: undefined, y: 1 }]
    const r = recognise([dirty])
    expect(r).not.toBeNull()
    expect(Number.isFinite(r.distance)).toBe(true)
    expect(DIGITS).toContain(r.digit)
  })
})
