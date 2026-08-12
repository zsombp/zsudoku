/**
 * Handwriting recognition for the nine sudoku digits, offline and dependency
 * free.
 *
 * There is no model here and there is no training set. A digit is described as
 * a polyline, several ways per digit because people write a 4 and a 7 in more
 * than one way, and an incoming stroke is compared against those descriptions
 * on a handful of measured features. That is the only kind of recogniser that
 * fits an app whose whole point is that it downloads nothing.
 *
 * What it is compared on, in the order measurement says they matter:
 *
 *   direction sequence   sixteen tangents taken at equal arc length along the
 *                        ink, in drawing order. The workhorse: it is the shape
 *                        and the order at once, and removing it costs 36.5
 *                        points against 7.0 for the next one down.
 *   direction histogram  the same tangents with the order thrown away, so a
 *                        digit written in an unusual stroke order still lands
 *                        somewhere near. Worth 7.0.
 *   stroke count         worth 3.9, which is more than expected for something
 *                        this crude.
 *   crossings, loops     the digits with a hole in them. 1.3 and 0.3, and the
 *                        loop position is the whole of 6 against 9.
 *   total turning        1 and 7 barely turn, 8 turns four times around. 0.6.
 *
 * Three more were built, measured and thrown away, which is the useful part of
 * this file to read before adding a fourth. See WEIGHTS.
 *
 * Accuracy is in CHANGELOG.md and comes out of scripts/handwriting.mjs, which
 * synthesises its own strokes and says at length why that makes every figure an
 * upper bound. The short version: 98.7% on tidy synthetic writing, 94.0% at a
 * hand half again as unsteady, 83.6% at twice. 1 against 7 and 9 against 5 are
 * the pairs that go wrong. The confidence gate is what keeps the digit actually
 * offered to the player above 96% throughout.
 *
 * Nothing here touches the DOM or React. `recognise` takes arrays of points and
 * returns a guess; the pad decides what to do about it, and never commits a
 * digit without being told to.
 */

// Sixteen tangents, one per sixteenth of the ink.
const DIR_SAMPLES = 16
// Direction histogram bins. Eight is one per compass point.
const HIST_BINS = 8
// Points each stroke is resampled to before the loop and crossing search. The
// search is O(n^2) over segment pairs, so 40 per stroke is 780 pairs for one
// stroke and about 3000 for three. A whole recognition measures 0.063ms, which
// is a quarter of a percent of a frame, so nothing here needs to be cleverer.
const GEOM_POINTS = 40
// Ink shorter than this fraction of the whole drawing's diagonal is a speck: a
// tap that did not become a stroke, or the dot somebody put on the end of a 7.
// Dropping it stops a stray tap turning a clean 1 into a two-stroke shape.
const SPECK = 0.06
// A crossing only makes a loop if it encloses something, in units of the
// drawing's own height squared. The threshold only has to reject pinholes: real
// loops measure 0.04 (the bowl of an 8) upward, and the overshoot where a
// stroke doubles back on itself measures under 0.005, so anything in between
// works and this is the middle of it.
const MIN_LOOP_AREA = 0.015
// Two points this close in a drawing one unit tall count as the pen coming back
// to where it started, so a 6 whose loop does not quite close still reads as
// having a loop.
const NEAR_CLOSE = 0.13

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function pathLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  return total
}

/** Equal-arc-length resample to exactly `n` points. */
function resample(pts, n) {
  const total = pathLength(pts)
  if (pts.length < 2 || total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }))
  const step = total / (n - 1)
  const out = [{ ...pts[0] }]
  let carried = 0
  let prev = pts[0]
  for (let i = 1; i < pts.length; ) {
    const seg = dist(prev, pts[i])
    if (carried + seg >= step && seg > 0) {
      const t = (step - carried) / seg
      const p = { x: prev.x + t * (pts[i].x - prev.x), y: prev.y + t * (pts[i].y - prev.y) }
      out.push(p)
      prev = p
      carried = 0
    } else {
      carried += seg
      prev = pts[i]
      i++
    }
  }
  // Floating point can leave the last point one short of the count.
  while (out.length < n) out.push({ ...pts[pts.length - 1] })
  return out.slice(0, n)
}

/**
 * Catmull-Rom through the control points, so a prototype for a 0 is an oval
 * rather than a decagon. A control point listed twice pins the curve to a
 * corner, which is how the 7 keeps its elbow.
 */
function smooth(pts, per = 6) {
  if (pts.length < 3) return pts.slice()
  const at = i => pts[Math.max(0, Math.min(pts.length - 1, i))]
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let s = 0; s < per; s++) {
      const t = s / per
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push({ ...pts[pts.length - 1] })
  return out
}

/** Where two segments cross, or null. Endpoints count as crossing. */
function segmentCross(a1, a2, b1, b2) {
  const dx1 = a2.x - a1.x
  const dy1 = a2.y - a1.y
  const dx2 = b2.x - b1.x
  const dy2 = b2.y - b1.y
  const den = dx1 * dy2 - dy1 * dx2
  if (Math.abs(den) < 1e-12) return null
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / den
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 }
}

/** Shoelace, absolute. */
function area(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].y - pts[i].x * pts[j].y
  }
  return Math.abs(a) / 2
}

// ---------------------------------------------------------------------------
// preparation
// ---------------------------------------------------------------------------

/**
 * Clean, normalise and resample raw pointer strokes.
 *
 * Returns null when there is not enough ink to say anything, which is the
 * honest answer to a tap.
 *
 * Everything downstream measures in one frame: divided by the taller side, so
 * the proportions survive. Stretching a 1 to fill a square would turn it into a
 * shape no digit has.
 *
 * There was a second frame, each axis mapped to the drawing's own extent, for
 * saying where the pen went down and came up. Endpoints turned out to cost
 * accuracy rather than add it, so the frame went with them: see WEIGHTS.
 */
export function prepare(rawStrokes) {
  const strokes = []
  for (const raw of rawStrokes || []) {
    const pts = []
    for (const p of raw) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const last = pts[pts.length - 1]
      if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue
      pts.push({ x: p.x, y: p.y })
    }
    if (pts.length >= 2) strokes.push(pts)
  }
  if (!strokes.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  const w = maxX - minX
  const h = maxY - minY
  const span = Math.max(w, h)
  if (span <= 0) return null

  const diag = Math.hypot(w, h)
  const kept = strokes.filter(s => pathLength(s) >= SPECK * diag)
  if (!kept.length) return null

  const shape = kept.map(s => {
    // A three-point mean kills the sampling jitter a finger leaves without
    // rounding off any corner: over the prototypes it moves the direction
    // sequence by 0.004, which is a hundredth of the gap between two digits.
    const sm = s.length >= 3
      ? s.map((p, i) => {
          const a = s[Math.max(0, i - 1)]
          const b = s[Math.min(s.length - 1, i + 1)]
          return { x: (a.x + p.x + b.x) / 3, y: (a.y + p.y + b.y) / 3 }
        })
      : s
    return sm.map(p => ({ x: (p.x - minX) / span, y: (p.y - minY) / span }))
  })

  return { shape, strokeCount: kept.length }
}

// ---------------------------------------------------------------------------
// features
// ---------------------------------------------------------------------------

/**
 * `n` tangents spread along the ink by arc length, never joining one stroke to
 * the next: the jump the pen makes between strokes is not a direction anybody
 * drew, and letting it in put a spurious hard left turn in every two-stroke 4.
 */
function tangents(shape, n) {
  const lens = shape.map(pathLength)
  const total = lens.reduce((a, b) => a + b, 0)
  if (total === 0) return []
  const share = lens.map(l => Math.max(1, Math.round((n * l) / total)))
  // Give or take the rounding on whichever stroke has the most ink to spare.
  let over = share.reduce((a, b) => a + b, 0) - n
  while (over !== 0) {
    let pick = 0
    for (let i = 1; i < share.length; i++) if (share[i] > share[pick]) pick = i
    if (over > 0 && share[pick] > 1) {
      share[pick]--
      over--
    } else if (over < 0) {
      share[pick]++
      over++
    } else break
  }

  const out = []
  shape.forEach((s, i) => {
    const k = share[i]
    if (k < 1) return
    const pts = resample(s, k + 1)
    for (let j = 0; j < k; j++) {
      const dx = pts[j + 1].x - pts[j].x
      const dy = pts[j + 1].y - pts[j].y
      const m = Math.hypot(dx, dy)
      out.push(m > 0 ? { x: dx / m, y: dy / m } : { x: 0, y: 0 })
    }
  })
  return out
}

/** Loops, crossings and total turning, all read off the resampled geometry. */
function topology(shape) {
  const pts = []
  const breaks = []
  // Which stroke each point belongs to. A loop is ink that comes back to
  // itself, and the jump the pen makes between two strokes is not ink: without
  // this, the stem of a two-stroke 4 passing near its own bar closed a "loop"
  // across the gap and every 4 was reported with two holes in it. That showed
  // up as the loop feature measuring worse than useless, which is how it was
  // found.
  const strokeOf = []
  shape.forEach((s, k) => {
    if (pts.length) breaks.push(pts.length)
    for (const p of resample(s, GEOM_POINTS)) {
      pts.push(p)
      strokeOf.push(k)
    }
  })
  const isBreak = new Set(breaks)
  const segAt = i => (isBreak.has(i + 1) ? null : [pts[i], pts[i + 1]])

  const found = []
  let crossings = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = segAt(i)
    if (!a) continue
    for (let j = i + 2; j < pts.length - 1; j++) {
      const b = segAt(j)
      if (!b) continue
      const hit = segmentCross(a[0], a[1], b[0], b[1])
      if (!hit) continue
      // A crossbar crossing a leg is a crossing wherever the pen lifted.
      crossings++
      if (strokeOf[i] !== strokeOf[j]) continue
      const ring = pts.slice(i, j + 2)
      const size = area(ring)
      if (size >= MIN_LOOP_AREA) found.push({ i, j, size, ring })
    }
  }
  // A 6 whose tail stops a hair short of its own body has no crossing at all
  // and still, plainly, has a loop in it.
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 8; j < pts.length; j++) {
      if (strokeOf[i] !== strokeOf[j]) continue
      if (dist(pts[i], pts[j]) > NEAR_CLOSE) continue
      const ring = pts.slice(i, j + 1)
      const size = area(ring)
      if (size >= MIN_LOOP_AREA) found.push({ i, j, size, ring })
    }
  }

  // One loop can be found many times over. Keep the biggest and throw away
  // anything that mostly covers the same stretch of ink.
  found.sort((a, b) => b.size - a.size)
  const loops = []
  for (const cand of found) {
    const clash = loops.some(l => Math.min(l.j, cand.j) - Math.max(l.i, cand.i) > 0.5 * Math.min(l.j - l.i, cand.j - cand.i))
    if (!clash) loops.push(cand)
  }

  // Total turning, unsigned. Signed turning was implemented too, on the theory
  // that a 6 winding one way and a 2 the other is a separate axis. Measured
  // over 9000 strokes it was worth 0.2 points at its best weight and cost
  // accuracy at any weight above 0.2, because the direction sequence already
  // says which way round the pen went. Removed rather than left at zero, since
  // a feature nothing reads is a feature nothing can test.
  let turnAbs = 0
  for (let i = 1; i < pts.length - 1; i++) {
    if (isBreak.has(i) || isBreak.has(i + 1)) continue
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x)
    const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
    let d = b - a
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    turnAbs += Math.abs(d)
  }

  return { loops, crossings: Math.min(crossings, 3), turnAbs }
}

/** The whole feature vector for one prepared drawing. */
export function features(prep) {
  const dirs = tangents(prep.shape, DIR_SAMPLES)
  const dense = tangents(prep.shape, 48)
  const hist = new Array(HIST_BINS).fill(0)
  for (const d of dense) {
    if (d.x === 0 && d.y === 0) continue
    const a = ((Math.atan2(d.y, d.x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)
    // Split each tangent across the two nearest bins, so a direction sitting on
    // a bin boundary does not flip the whole histogram when a hand wobbles.
    const pos = a * HIST_BINS
    const lo = Math.floor(pos) % HIST_BINS
    const frac = pos - Math.floor(pos)
    hist[lo] += 1 - frac
    hist[(lo + 1) % HIST_BINS] += frac
  }
  const sum = hist.reduce((a, b) => a + b, 0) || 1
  for (let i = 0; i < HIST_BINS; i++) hist[i] /= sum

  const topo = topology(prep.shape)

  // Where the loops sit vertically decides 6 against 9, and nothing else does:
  // both are one loop and one tail, drawn with much the same turning.
  let loopY = 0.5
  if (topo.loops.length) {
    let acc = 0
    for (const l of topo.loops) {
      let ly = 0
      for (const p of l.ring) ly += p.y
      acc += ly / l.ring.length
    }
    // Ring points are in the shape frame, where y runs 0..1 top to bottom for a
    // drawing that is taller than it is wide, which every digit is.
    loopY = acc / topo.loops.length
  }

  return {
    dirs,
    hist,
    loops: Math.min(topo.loops.length, 2),
    loopY,
    crossings: topo.crossings,
    turnAbs: topo.turnAbs,
    strokeCount: prep.strokeCount,
  }
}

// ---------------------------------------------------------------------------
// distance
// ---------------------------------------------------------------------------

/**
 * How much each feature is allowed to say.
 *
 * Set by sweeping one weight at a time with `node scripts/handwriting.mjs
 * weights`, watching the held-out forms in the second column as the guard. A
 * weight that lifts the forms with prototypes while pushing the held-out ones
 * down is fitting rather than improving, and that is invisible from the total.
 *
 * Not swept to the last decimal, deliberately. The optimum moves with how
 * unsteady the synthetic hand is: `turn` wants 0.3 at slop 1 and 0 at slop 2,
 * and chasing that would be fitting to a dial nobody knows the real value of.
 * Every weight here is within a point of its best at both ends.
 *
 * THREE FEATURES WERE BUILT AND THEN REMOVED. Recorded because each of them is
 * an obvious thing to try again, and each measured worse than nothing:
 *
 *   endpoints    Where the pen went down and came up, in a box frame with the
 *                narrow axis floored. Cost 2.5 points at every positive weight.
 *                At heavy distortion it helped the forms with prototypes by 1.6
 *                and hurt the held-out ones by 4.6, which is overfitting with a
 *                signature on it. The direction sequence already implies where
 *                the ends are, and slant moves them while leaving the shape.
 *
 *   net turning  Signed rather than absolute, on the theory that a 6 winding
 *                one way and a 2 the other is a separate axis. Worth 0.2 points
 *                at its best weight and negative above 0.2.
 *
 *   aspect       Width over height, which ought to be the whole of "1". Cost
 *                0.9 points overall and, measured per digit, cost 1 itself 5.3
 *                points: a bare 1 leans, so it measures 0.2 to 0.4 wide while
 *                the upright prototype measures 0.05, and the feature argues
 *                against the right answer. Shearing the lean out first was
 *                tried, estimating it from the near-upright segments only, and
 *                cost another 2.8 points because the estimate is noisy on
 *                exactly the drawings that need it. Both are worth re-trying
 *                only with a real dataset to check against.
 */
export const WEIGHTS = {
  dirs: 1,
  hist: 1,
  loops: 0.1,
  crossings: 0.15,
  turn: 0.2,
  strokes: 0.35,
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Weighted distance between two feature vectors, 0 (identical) to 1. */
export function distance(a, b, w = WEIGHTS) {
  let d = 0
  const n = Math.min(a.dirs.length, b.dirs.length)
  for (let i = 0; i < n; i++) {
    // 1 - cos of the angle between, halved into 0..1.
    d += (1 - (a.dirs[i].x * b.dirs[i].x + a.dirs[i].y * b.dirs[i].y)) / 2
  }
  let out = w.dirs * (n ? d / n : 1)

  let hist = 0
  for (let i = 0; i < HIST_BINS; i++) hist += Math.abs(a.hist[i] - b.hist[i])
  out += w.hist * (hist / 2)

  out += w.loops * (clamp01(Math.abs(a.loops - b.loops)) * 0.7 + clamp01(Math.abs(a.loopY - b.loopY) / 0.4) * 0.3)
  out += w.crossings * clamp01(Math.abs(a.crossings - b.crossings) / 2)
  out += w.turn * clamp01(Math.abs(a.turnAbs - b.turnAbs) / 5)
  out += w.strokes * (a.strokeCount === b.strokeCount ? 0 : 1)

  const total = w.dirs + w.hist + w.loops + w.crossings + w.turn + w.strokes
  return out / total
}

// ---------------------------------------------------------------------------
// prototypes
// ---------------------------------------------------------------------------

/**
 * How the nine digits get written, as polylines in a box one unit tall. The x
 * range of each is its natural width, so a 1 stays narrow and a 4 stays wide
 * even though nothing measures the width directly any more: the tangents of a
 * digit drawn in the wrong proportions point the wrong way.
 *
 * More than one per digit wherever people genuinely differ: the crossbar on a
 * 7, the two orders of a 4, the flat-topped 3, whether the top bar of a 5 is
 * part of the same stroke. A form that is not in here cannot be recognised, so
 * this list is the honest limit of the feature.
 *
 * Corners are pinned by listing the point twice, which holds the Catmull-Rom
 * tangent near zero there. Without it the elbow of a 7 rounds off into a 2.
 */
export const PROTOTYPES = [
  { digit: 1, name: 'plain', strokes: [[[0.53, 0], [0.5, 0.5], [0.48, 1]]] },
  { digit: 1, name: 'flag', strokes: [[[0.28, 0.19], [0.5, 0.01], [0.5, 0.01], [0.48, 1]]] },
  {
    digit: 1,
    name: 'serif',
    strokes: [
      [[0.3, 0.2], [0.52, 0.01], [0.52, 0.01], [0.5, 0.98]],
      [[0.26, 1], [0.76, 1]],
    ],
  },
  {
    digit: 2,
    name: 'plain',
    strokes: [[
      [0.06, 0.24], [0.14, 0.08], [0.34, 0.01], [0.55, 0.09], [0.6, 0.26],
      [0.52, 0.45], [0.28, 0.68], [0.05, 0.95], [0.05, 0.95], [0.66, 0.95],
    ]],
  },
  {
    digit: 2,
    name: 'flat',
    strokes: [[
      [0.1, 0.16], [0.2, 0.03], [0.42, 0.03], [0.58, 0.16], [0.5, 0.38],
      [0.06, 0.94], [0.06, 0.94], [0.68, 0.94],
    ]],
  },
  {
    digit: 3,
    name: 'plain',
    strokes: [[
      [0.06, 0.14], [0.2, 0.02], [0.42, 0.03], [0.56, 0.16], [0.5, 0.34],
      [0.3, 0.45], [0.54, 0.53], [0.63, 0.72], [0.52, 0.93], [0.28, 1], [0.07, 0.93],
    ]],
  },
  {
    digit: 3,
    name: 'flattop',
    strokes: [[
      [0.06, 0.03], [0.55, 0.03], [0.55, 0.03], [0.3, 0.42], [0.52, 0.5],
      [0.62, 0.7], [0.5, 0.94], [0.26, 1], [0.06, 0.92],
    ]],
  },
  {
    digit: 4,
    name: 'bar-first',
    strokes: [
      [[0.52, 0.02], [0.28, 0.34], [0.03, 0.65], [0.03, 0.65], [0.74, 0.65]],
      [[0.56, 0.1], [0.56, 1]],
    ],
  },
  {
    digit: 4,
    name: 'stem-first',
    strokes: [
      [[0.56, 0.1], [0.56, 1]],
      [[0.52, 0.02], [0.28, 0.34], [0.03, 0.65], [0.03, 0.65], [0.74, 0.65]],
    ],
  },
  {
    digit: 4,
    name: 'one-stroke',
    strokes: [[
      [0.55, 0.02], [0.3, 0.35], [0.03, 0.66], [0.03, 0.66], [0.76, 0.66],
      [0.76, 0.66], [0.68, 1],
    ]],
  },
  {
    digit: 5,
    name: 'plain',
    strokes: [[
      [0.62, 0.02], [0.1, 0.02], [0.1, 0.02], [0.06, 0.4], [0.26, 0.33],
      [0.5, 0.39], [0.64, 0.58], [0.58, 0.84], [0.36, 0.99], [0.1, 0.93],
    ]],
  },
  {
    digit: 5,
    name: 'bar-last',
    strokes: [
      [[0.1, 0.03], [0.06, 0.4], [0.26, 0.33], [0.5, 0.39], [0.64, 0.58], [0.58, 0.84], [0.36, 0.99], [0.1, 0.93]],
      [[0.09, 0.02], [0.62, 0.02]],
    ],
  },
  {
    digit: 6,
    name: 'plain',
    strokes: [[
      [0.62, 0.02], [0.34, 0.1], [0.14, 0.36], [0.06, 0.63], [0.11, 0.87],
      [0.31, 1], [0.54, 0.95], [0.63, 0.75], [0.52, 0.57], [0.28, 0.54], [0.11, 0.66],
    ]],
  },
  {
    digit: 6,
    name: 'straight',
    strokes: [[
      [0.5, 0.02], [0.2, 0.32], [0.06, 0.62], [0.11, 0.87], [0.31, 1],
      [0.54, 0.95], [0.63, 0.75], [0.5, 0.56], [0.26, 0.55], [0.1, 0.68],
    ]],
  },
  {
    digit: 7,
    name: 'plain',
    strokes: [[[0.04, 0.05], [0.38, 0.04], [0.72, 0.04], [0.72, 0.04], [0.5, 0.5], [0.3, 1]]],
  },
  {
    digit: 7,
    name: 'crossed',
    strokes: [
      [[0.04, 0.05], [0.38, 0.04], [0.72, 0.04], [0.72, 0.04], [0.5, 0.5], [0.3, 1]],
      [[0.14, 0.55], [0.56, 0.48]],
    ],
  },
  {
    digit: 7,
    name: 'hooked',
    strokes: [[[0.06, 0.16], [0.12, 0.03], [0.72, 0.04], [0.72, 0.04], [0.5, 0.5], [0.3, 1]]],
  },
  {
    digit: 8,
    name: 'one-stroke',
    strokes: [[
      [0.4, 0.02], [0.17, 0.11], [0.16, 0.32], [0.42, 0.49], [0.6, 0.65],
      [0.56, 0.9], [0.32, 1], [0.1, 0.89], [0.14, 0.64], [0.4, 0.48],
      [0.58, 0.33], [0.6, 0.13], [0.4, 0.02],
    ]],
  },
  {
    digit: 8,
    name: 'two-loops',
    strokes: [
      [[0.38, 0.02], [0.16, 0.12], [0.2, 0.35], [0.4, 0.46], [0.58, 0.33], [0.58, 0.13], [0.38, 0.02]],
      [[0.4, 0.46], [0.14, 0.62], [0.12, 0.88], [0.34, 1], [0.58, 0.9], [0.6, 0.63], [0.4, 0.46]],
    ],
  },
  {
    digit: 9,
    name: 'plain',
    strokes: [[
      [0.6, 0.12], [0.44, 0.02], [0.2, 0.09], [0.13, 0.28], [0.24, 0.44],
      [0.46, 0.48], [0.6, 0.36], [0.62, 0.14], [0.62, 0.55], [0.6, 1],
    ]],
  },
  {
    digit: 9,
    name: 'hooked',
    strokes: [[
      [0.6, 0.12], [0.44, 0.02], [0.2, 0.09], [0.13, 0.28], [0.24, 0.44],
      [0.46, 0.48], [0.6, 0.36], [0.62, 0.14], [0.62, 0.6], [0.56, 0.95], [0.34, 1],
    ]],
  },
  {
    digit: 9,
    name: 'two-stroke',
    strokes: [
      [[0.6, 0.12], [0.44, 0.02], [0.2, 0.09], [0.13, 0.28], [0.24, 0.44], [0.46, 0.48], [0.6, 0.36], [0.62, 0.14]],
      [[0.62, 0.06], [0.6, 1]],
    ],
  },
]

/** The digits this can recognise at all. Nine, because sudoku has no zero. */
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function buildPrototypes() {
  return PROTOTYPES.map(p => {
    const prep = prepare(p.strokes.map(s => smooth(s.map(([x, y]) => ({ x, y })))))
    return { digit: p.digit, name: p.name, features: features(prep) }
  })
}

// Built once. The whole module costs 6.6ms to import, nearly all of it this,
// and it is paid at import rather than on the first stroke, where it would look
// like the recogniser was slow.
const TEMPLATES = buildPrototypes()

// ---------------------------------------------------------------------------
// recognition
// ---------------------------------------------------------------------------

/**
 * Below this margin the guess is not worth stating without a caveat.
 *
 * Set from the measurement rather than by eye. On strokes from a hand twice as
 * unsteady as the baseline, where the recogniser is right 83.6% of the time
 * overall, guesses above this margin are right 96.4% and those below it 68.5%.
 * Raising it to 0.10 would reach 99.1% but would put a caveat on 72% of
 * strokes, which is a feature that never says anything.
 *
 * A margin and not a distance, and that is not a preference either. Gating on
 * how close the winner got was tried first and cannot work: a circle, which is
 * not any of the nine, lands at 0.218 and a zigzag at 0.171, while real strokes
 * from an unsteady hand sit at a median of 0.181 and a ninetieth percentile of
 * 0.283. The two populations are on top of each other, so any absolute cutoff
 * throws away more digits than scribbles.
 *
 * The consequence, stated rather than hidden: THERE IS NO "THAT IS NOT A DIGIT"
 * DETECTOR HERE. Draw a circle and it will offer you an 8, fairly confidently.
 * What stops that mattering is the pad asking before it writes anything, which
 * is why that rule is not negotiable.
 */
export const UNSURE_MARGIN = 0.06

/**
 * Recognise a drawing.
 *
 * `strokes` is an array of arrays of `{x, y}` in any units, y downward. Returns
 * null when there is not enough ink, otherwise:
 *
 *   digit         the best guess, 1 to 9
 *   sure          whether the gap to the next digit clears the measured
 *                 threshold, which is the only thing the pad shows about it
 *   alternatives  every digit, best first, so a correction list can be ordered
 *                 by what the drawing actually looked like
 *   distance      how close the winner got, and `margin` how far ahead. Read by
 *                 scripts/handwriting.mjs and by the tests rather than by the
 *                 interface, which needs one bit and gets `sure`.
 *   features      what it measured, so a wrong answer can be argued with
 *
 * Nothing here decides to place anything. A guess is a suggestion and the pad
 * asks before it commits, because a recogniser this size will be wrong
 * regularly and a wrong digit written silently is worse than no feature.
 */
export function recognise(strokes) {
  const prep = prepare(strokes)
  if (!prep) return null
  const f = features(prep)

  // Best per digit, not best per prototype: a digit written two ways is two
  // descriptions and the closer of them is what that digit scored.
  const best = new Map()
  for (const t of TEMPLATES) {
    const d = distance(f, t.features)
    if (!(best.get(t.digit) <= d)) best.set(t.digit, d)
  }

  const ranked = [...best.entries()]
    .map(([digit, d]) => ({ digit, distance: d }))
    .sort((a, b) => a.distance - b.distance)

  const top = ranked[0]
  const next = ranked[1]
  // A margin rather than a raw distance: how far ahead the winner is says much
  // more than how close it got, because a shaky hand moves every distance at
  // once and moves the gap between them hardly at all.
  const margin = next ? next.distance - top.distance : 1

  return {
    digit: top.digit,
    distance: top.distance,
    margin,
    sure: margin >= UNSURE_MARGIN,
    alternatives: ranked.map(r => r.digit),
    features: f,
  }
}
