/**
 * Measure the handwriting recogniser.
 *
 *   node scripts/handwriting.mjs             confusion matrix and summary
 *   node scripts/handwriting.mjs slop        accuracy against how shaky the hand is
 *   node scripts/handwriting.mjs ablate      what each feature is worth
 *   node scripts/handwriting.mjs weights     sweep one weight, or `weights a,b` for two
 *   node scripts/handwriting.mjs margin      is the confidence number honest
 *   node scripts/handwriting.mjs dists       how close a correct match usually gets
 *   node scripts/handwriting.mjs loops       what each prototype measures
 *   node scripts/handwriting.mjs time        cost per recognition
 *
 * SLOP=2 makes the hand twice as unsteady, N=50 makes it quicker.
 *
 * READ THIS BEFORE BELIEVING A NUMBER FROM IT.
 *
 * There is no handwriting dataset in this repository and there is not going to
 * be one, so the strokes are synthesised. That makes every accuracy figure here
 * an upper bound and not a measurement of the feature as used. Two reasons, and
 * the second is the serious one:
 *
 *   Synthetic ink is tidier than a thumb. The distortions below are slant,
 *   wobble, jitter, aspect, rotation and clipped ends, which is most of what
 *   varies, but a real finger on glass also skips, doubles back and stops in
 *   the wrong place.
 *
 *   The author of the recogniser wrote the test set. That is circular, and the
 *   only defence available is to make the two descriptions independent. The
 *   paths below were written from scratch rather than copied from PROTOTYPES:
 *   different proportions, different control points, and eight forms that have
 *   no prototype at all (marked `held out`). The held-out rows are the closest
 *   thing here to an honest test, and they are reported separately.
 *
 * What the script is genuinely good for is comparison: this change against that
 * one, this feature weight against zero. Differences survive the circularity
 * even where the absolute number does not.
 */

import { recognise, prepare, features, distance, WEIGHTS, DIGITS } from '../src/lib/handwriting.js'
import { PROTOTYPES } from '../src/lib/handwriting.js'

// ---------------------------------------------------------------------------
// a seeded generator, so a reported number can be reproduced
// ---------------------------------------------------------------------------

let seed = 0x9e3779b9
const rnd = () => {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  seed |= 0
  return (seed >>> 0) / 4294967296
}
const between = (lo, hi) => lo + rnd() * (hi - lo)
// Box-Muller, because jitter that is uniform does not look like a hand.
const gauss = s => s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())

// ---------------------------------------------------------------------------
// how the digits get written, described again and differently
// ---------------------------------------------------------------------------

/**
 * Control points in a box one unit tall, x at the digit's own natural width.
 * Written to describe the glyph, not to match the recogniser: where PROTOTYPES
 * puts the waist of a 3 at y=0.45 this puts it at 0.48, and so on throughout.
 *
 * `heldOut` marks a form the recogniser has no prototype for. Those are the
 * rows that say something about generalisation rather than about round trips.
 */
const FORMS = [
  { digit: 1, name: 'bare', strokes: [[[0.5, 0.02], [0.47, 1]]] },
  { digit: 1, name: 'flagged', strokes: [[[0.24, 0.22], [0.49, 0.02], [0.46, 1]]] },
  { digit: 1, name: 'footed', strokes: [[[0.34, 0.18], [0.55, 0.02], [0.52, 0.98]], [[0.24, 0.99], [0.8, 0.99]]] },
  // Held out: a 1 written as a bare stroke leaning hard right.
  { digit: 1, name: 'leaning', heldOut: true, strokes: [[[0.72, 0.02], [0.3, 1]]] },

  {
    digit: 2,
    name: 'round',
    strokes: [[[0.04, 0.28], [0.12, 0.1], [0.32, 0.02], [0.54, 0.11], [0.58, 0.3], [0.46, 0.5], [0.24, 0.72], [0.03, 0.96], [0.64, 0.96]]],
  },
  {
    digit: 2,
    name: 'angular',
    strokes: [[[0.12, 0.14], [0.24, 0.02], [0.46, 0.04], [0.56, 0.2], [0.44, 0.42], [0.08, 0.92], [0.7, 0.92]]],
  },
  // Held out: the continental 2 with a small loop where it starts.
  {
    digit: 2,
    name: 'looped',
    heldOut: true,
    strokes: [[[0.2, 0.1], [0.08, 0.16], [0.14, 0.28], [0.34, 0.16], [0.5, 0.16], [0.56, 0.32], [0.4, 0.54], [0.05, 0.94], [0.66, 0.94]]],
  },

  {
    digit: 3,
    name: 'round',
    strokes: [[[0.08, 0.16], [0.22, 0.03], [0.44, 0.05], [0.54, 0.18], [0.46, 0.33], [0.28, 0.48], [0.5, 0.55], [0.6, 0.74], [0.48, 0.94], [0.24, 1], [0.05, 0.9]]],
  },
  {
    digit: 3,
    name: 'flat-topped',
    strokes: [[[0.08, 0.04], [0.52, 0.04], [0.28, 0.44], [0.5, 0.52], [0.6, 0.72], [0.48, 0.95], [0.24, 1], [0.05, 0.9]]],
  },
  // Held out: the top half drawn, then the bottom half as a second stroke.
  {
    digit: 3,
    name: 'two-stroke',
    heldOut: true,
    strokes: [[[0.08, 0.16], [0.24, 0.03], [0.46, 0.06], [0.52, 0.2], [0.4, 0.36], [0.24, 0.46]], [[0.24, 0.46], [0.5, 0.54], [0.6, 0.74], [0.46, 0.95], [0.22, 1], [0.04, 0.9]]],
  },

  { digit: 4, name: 'open', strokes: [[[0.5, 0.04], [0.02, 0.62], [0.7, 0.62]], [[0.54, 0.06], [0.54, 0.99]]] },
  { digit: 4, name: 'stem-then-bar', strokes: [[[0.58, 0.08], [0.58, 0.99]], [[0.5, 0.02], [0.02, 0.68], [0.78, 0.68]]] },
  { digit: 4, name: 'closed', strokes: [[[0.52, 0.04], [0.04, 0.68], [0.8, 0.68], [0.7, 1]]] },
  // Held out: the bar drawn back over itself, so the stroke doubles.
  { digit: 4, name: 'retraced', heldOut: true, strokes: [[[0.5, 0.02], [0.03, 0.64], [0.72, 0.64], [0.56, 0.64], [0.56, 1]]] },

  {
    digit: 5,
    name: 'one-stroke',
    strokes: [[[0.6, 0.04], [0.09, 0.03], [0.05, 0.44], [0.28, 0.36], [0.52, 0.42], [0.62, 0.6], [0.56, 0.86], [0.32, 1], [0.08, 0.9]]],
  },
  {
    digit: 5,
    name: 'bar-after',
    strokes: [[[0.09, 0.04], [0.05, 0.44], [0.28, 0.36], [0.52, 0.42], [0.62, 0.6], [0.56, 0.86], [0.32, 1], [0.08, 0.9]], [[0.08, 0.03], [0.6, 0.03]]],
  },
  // Held out: a 5 with a long flat bowl, the shape a fast hand leaves.
  {
    digit: 5,
    name: 'flat-bowl',
    heldOut: true,
    strokes: [[[0.64, 0.03], [0.08, 0.03], [0.06, 0.5], [0.4, 0.42], [0.66, 0.58], [0.6, 0.9], [0.28, 1], [0.06, 0.92]]],
  },

  {
    digit: 6,
    name: 'curved',
    strokes: [[[0.6, 0.04], [0.3, 0.12], [0.12, 0.38], [0.05, 0.64], [0.12, 0.88], [0.34, 1], [0.56, 0.93], [0.62, 0.73], [0.5, 0.56], [0.26, 0.53], [0.09, 0.64]]],
  },
  {
    digit: 6,
    name: 'straight-back',
    strokes: [[[0.48, 0.03], [0.18, 0.34], [0.05, 0.64], [0.13, 0.89], [0.34, 1], [0.56, 0.92], [0.6, 0.72], [0.48, 0.55], [0.24, 0.54], [0.08, 0.67]]],
  },
  // Held out: a 6 whose loop is left open, the ends a good way apart.
  {
    digit: 6,
    name: 'open-loop',
    heldOut: true,
    strokes: [[[0.58, 0.04], [0.28, 0.16], [0.08, 0.46], [0.06, 0.74], [0.24, 0.96], [0.5, 0.96], [0.62, 0.78], [0.5, 0.6], [0.28, 0.58]]],
  },

  { digit: 7, name: 'bare', strokes: [[[0.03, 0.06], [0.7, 0.03], [0.28, 1]]] },
  { digit: 7, name: 'barred', strokes: [[[0.03, 0.06], [0.7, 0.03], [0.28, 1]], [[0.12, 0.58], [0.58, 0.5]]] },
  { digit: 7, name: 'hooked', strokes: [[[0.08, 0.18], [0.14, 0.02], [0.74, 0.05], [0.32, 1]]] },
  // Held out: the descender curved rather than straight.
  { digit: 7, name: 'curved-leg', heldOut: true, strokes: [[[0.04, 0.05], [0.72, 0.04], [0.56, 0.4], [0.42, 0.72], [0.34, 1]]] },

  {
    digit: 8,
    name: 'single',
    strokes: [[[0.42, 0.03], [0.18, 0.13], [0.18, 0.34], [0.44, 0.52], [0.62, 0.68], [0.54, 0.92], [0.3, 1], [0.09, 0.86], [0.15, 0.62], [0.42, 0.46], [0.58, 0.3], [0.58, 0.11], [0.42, 0.03]]],
  },
  {
    digit: 8,
    name: 'stacked',
    strokes: [[[0.36, 0.03], [0.15, 0.13], [0.2, 0.36], [0.38, 0.47], [0.56, 0.34], [0.56, 0.12], [0.36, 0.03]], [[0.38, 0.47], [0.12, 0.62], [0.11, 0.88], [0.34, 1], [0.58, 0.9], [0.6, 0.62], [0.38, 0.47]]],
  },
  // Held out: an 8 that starts at the bottom and climbs.
  {
    digit: 8,
    name: 'upward',
    heldOut: true,
    strokes: [[[0.34, 1], [0.1, 0.88], [0.14, 0.64], [0.4, 0.48], [0.58, 0.32], [0.58, 0.12], [0.38, 0.03], [0.17, 0.12], [0.18, 0.33], [0.42, 0.5], [0.6, 0.66], [0.56, 0.9], [0.34, 1]]],
  },

  {
    digit: 9,
    name: 'straight-tail',
    strokes: [[[0.58, 0.14], [0.42, 0.03], [0.18, 0.11], [0.12, 0.3], [0.26, 0.46], [0.48, 0.46], [0.58, 0.32], [0.6, 0.12], [0.6, 0.56], [0.58, 1]]],
  },
  {
    digit: 9,
    name: 'hooked-tail',
    strokes: [[[0.58, 0.14], [0.42, 0.03], [0.18, 0.11], [0.12, 0.3], [0.26, 0.46], [0.48, 0.46], [0.58, 0.32], [0.6, 0.12], [0.62, 0.62], [0.54, 0.94], [0.32, 1]]],
  },
  // Held out: loop drawn first, tail added as a separate stroke downward.
  {
    digit: 9,
    name: 'tail-apart',
    heldOut: true,
    strokes: [[[0.58, 0.14], [0.4, 0.03], [0.16, 0.12], [0.12, 0.32], [0.28, 0.46], [0.5, 0.44], [0.58, 0.3]], [[0.6, 0.2], [0.58, 1]]],
  },
]

// ---------------------------------------------------------------------------
// turning a form into something a finger might have left behind
// ---------------------------------------------------------------------------

/** Its own spline, so a bug in the recogniser's cannot hide inside the test. */
function curve(points, per) {
  if (points.length < 3) {
    const out = []
    for (let s = 0; s <= per; s++) {
      const t = s / per
      out.push({ x: points[0].x + t * (points[1].x - points[0].x), y: points[0].y + t * (points[1].y - points[0].y) })
    }
    return out
  }
  const at = i => points[Math.max(0, Math.min(points.length - 1, i))]
  const out = []
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
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
  out.push({ ...points[points.length - 1] })
  return out
}

/**
 * One written instance of a form.
 *
 * Six things vary, in the order a hand varies them: where the control points
 * actually land, how far the writing leans, how wide it is, how level the pad
 * was held, a slow wobble along the stroke, and the sampling noise of a fat
 * finger on glass. Ends are clipped or overrun, because nobody starts and stops
 * exactly on the mark.
 */
function write(form) {
  const slant = between(-0.18 * SLOP, 0.34 * SLOP)
  const wide = between(1 - 0.22 * SLOP, 1 + 0.3 * SLOP)
  const tilt = between(-0.11 * SLOP, 0.11 * SLOP)
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)
  const wobbleN = 2 + Math.floor(rnd() * 2)
  const wobble = Array.from({ length: wobbleN }, () => ({
    a: between(0.006 * SLOP, 0.028 * SLOP),
    f: between(1, 3.5),
    p: rnd() * 2 * Math.PI,
  }))
  // The pad is a rectangle of device pixels and the writing sits somewhere in
  // it at some size, exactly as it would on screen.
  const scale = between(120, 240)
  const originX = between(10, 60)
  const originY = between(10, 40)

  return form.strokes.map(raw => {
    const nudged = raw.map(([x, y]) => ({ x: x + gauss(0.026 * SLOP), y: y + gauss(0.026 * SLOP) }))
    const dense = curve(nudged, 10)
    // Clip or overrun the ends, along the stroke.
    const head = Math.floor(dense.length * between(0, 0.05 * SLOP))
    const tail = Math.floor(dense.length * between(0, 0.05 * SLOP))
    const body = dense.slice(head, dense.length - tail)
    const use = body.length >= 2 ? body : dense

    return use.map((p, i) => {
      const u = i / (use.length - 1)
      let wob = 0
      for (const w of wobble) wob += w.a * Math.sin(w.f * u * 2 * Math.PI + w.p)
      let x = (p.x + wob) * wide + slant * (0.5 - p.y)
      let y = p.y
      const rx = x * cosT - y * sinT
      const ry = x * sinT + y * cosT
      return {
        x: originX + (rx + gauss(0.008 * SLOP)) * scale,
        y: originY + (ry + gauss(0.008 * SLOP)) * scale,
      }
    })
  })
}

// ---------------------------------------------------------------------------
// the runs
// ---------------------------------------------------------------------------

const PER_FORM = Number(process.env.N || 300)

/**
 * How hard the test is. Every distortion above is multiplied by it, so SLOP=2
 * is a hand twice as unsteady in every respect at once.
 *
 * SLOP=1 was set to look like careful writing on a phone and produces 99%,
 * which is the clearest evidence available that synthetic strokes are not the
 * thing being claimed. The number worth quoting is the curve across this dial,
 * not any single point on it.
 */
let SLOP = Number(process.env.SLOP || 1)

function sample() {
  const rows = []
  for (const form of FORMS) {
    for (let i = 0; i < PER_FORM; i++) rows.push({ form, strokes: write(form) })
  }
  return rows
}

function pad(s, n) {
  s = String(s)
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function confusion(rows, guess) {
  const table = new Map()
  for (const d of DIGITS) table.set(d, new Map(DIGITS.map(e => [e, 0])))
  let right = 0
  let top2 = 0
  let none = 0
  const perForm = new Map()
  for (const row of rows) {
    const r = guess(row.strokes)
    if (!r) {
      none++
      continue
    }
    table.get(row.form.digit).set(r.digit, table.get(row.form.digit).get(r.digit) + 1)
    const ok = r.digit === row.form.digit
    if (ok) right++
    if (r.alternatives.slice(0, 2).includes(row.form.digit)) top2++
    const key = `${row.form.digit} ${row.form.name}${row.form.heldOut ? ' (held out)' : ''}`
    const acc = perForm.get(key) || { n: 0, right: 0, worst: new Map() }
    acc.n++
    if (ok) acc.right++
    else acc.worst.set(r.digit, (acc.worst.get(r.digit) || 0) + 1)
    perForm.set(key, acc)
  }
  return { table, right, top2, none, n: rows.length, perForm }
}

function printConfusion(res) {
  console.log('\n     guessed')
  console.log('     ' + DIGITS.map(d => pad(d, 6)).join('') + '    correct')
  for (const d of DIGITS) {
    const row = res.table.get(d)
    const n = DIGITS.reduce((a, e) => a + row.get(e), 0) || 1
    const cells = DIGITS.map(e => {
      const v = row.get(e)
      return pad(v === 0 ? '.' : v, 6)
    }).join('')
    console.log(`  ${d}  ${cells}    ${((100 * row.get(d)) / n).toFixed(1)}%`)
  }
}

function main() {
  const rows = sample()
  const res = confusion(rows, recognise)

  console.log(`Synthetic strokes: ${res.n} (${FORMS.length} forms x ${PER_FORM})`)
  printConfusion(res)
  console.log(`\noverall           ${((100 * res.right) / res.n).toFixed(1)}%`)
  console.log(`right or runner-up ${((100 * res.top2) / res.n).toFixed(1)}%`)
  if (res.none) console.log(`no ink at all      ${res.none}`)

  const held = rows.filter(r => r.form.heldOut)
  const known = rows.filter(r => !r.form.heldOut)
  const heldRes = confusion(held, recognise)
  const knownRes = confusion(known, recognise)
  console.log(`\nforms with a prototype  ${((100 * knownRes.right) / knownRes.n).toFixed(1)}%  (${knownRes.n})`)
  console.log(`forms held out          ${((100 * heldRes.right) / heldRes.n).toFixed(1)}%  (${heldRes.n})`)

  console.log('\nby form, worst first')
  const forms = [...res.perForm.entries()].sort((a, b) => a[1].right / a[1].n - b[1].right / b[1].n)
  for (const [name, acc] of forms) {
    const worst = [...acc.worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    const asWhat = worst.length ? `   read as ${worst.map(([d, c]) => `${d} x${c}`).join(', ')}` : ''
    console.log(`  ${pad(((100 * acc.right) / acc.n).toFixed(1), 6)}%  ${name}${asWhat}`)
  }

  // What the player is actually offered: the guess, and the caveat when the
  // margin is thin. A feature that says "I am not sure" and is then right is
  // not a failure, so both halves are reported.
  let sureN = 0
  let sureRight = 0
  let unsureN = 0
  let unsureRight = 0
  for (const row of rows) {
    const r = recognise(row.strokes)
    if (!r) continue
    const ok = r.digit === row.form.digit
    if (r.sure) {
      sureN++
      if (ok) sureRight++
    } else {
      unsureN++
      if (ok) unsureRight++
    }
  }
  console.log(`\nshown without a caveat  ${((100 * sureRight) / (sureN || 1)).toFixed(1)}% right over ${sureN} (${((100 * sureN) / res.n).toFixed(0)}% of strokes)`)
  console.log(`shown as "not sure"     ${((100 * unsureRight) / (unsureN || 1)).toFixed(1)}% right over ${unsureN}`)
}

function ablate() {
  const rows = sample()
  const base = confusion(rows, recognise)
  console.log(`all features      ${((100 * base.right) / base.n).toFixed(1)}%`)

  // Rebuilding the prototype features per weighting is the honest way to do
  // this: they go through the same `features` call the input does.
  const templates = PROTOTYPES.map(p => ({
    digit: p.digit,
    features: features(prepare(p.strokes.map(s => curve(s.map(([x, y]) => ({ x, y })), 6)))),
  }))

  const guessWith = w => strokes => {
    const prep = prepare(strokes)
    if (!prep) return null
    const f = features(prep)
    const best = new Map()
    for (const t of templates) {
      const d = distance(f, t.features, w)
      if (!(best.get(t.digit) <= d)) best.set(t.digit, d)
    }
    const ranked = [...best.entries()].sort((a, b) => a[1] - b[1])
    return { digit: ranked[0][0], alternatives: ranked.map(r => r[0]) }
  }

  const full = confusion(rows, guessWith(WEIGHTS))
  console.log(`same, rebuilt here ${((100 * full.right) / full.n).toFixed(1)}%  (sanity check, should match)`)
  for (const key of Object.keys(WEIGHTS)) {
    const w = { ...WEIGHTS, [key]: 0 }
    const r = confusion(rows, guessWith(w))
    const acc = (100 * r.right) / r.n
    const drop = (100 * full.right) / full.n - acc
    console.log(`  without ${key.padEnd(10)} ${acc.toFixed(1)}%   costs ${drop >= 0 ? '' : '+'}${(-drop).toFixed(1)}`)
  }
  console.log('\nand each feature on its own')
  for (const key of Object.keys(WEIGHTS)) {
    const w = Object.fromEntries(Object.keys(WEIGHTS).map(k => [k, k === key ? 1 : 0]))
    const r = confusion(rows, guessWith(w))
    console.log(`  only ${key.padEnd(13)} ${((100 * r.right) / r.n).toFixed(1)}%`)
  }
}

function margin() {
  const rows = sample()
  const buckets = []
  for (const row of rows) {
    const r = recognise(row.strokes)
    if (r) buckets.push({ m: r.margin, ok: r.digit === row.form.digit })
  }
  buckets.sort((a, b) => a.m - b.m)
  console.log('margin  share of strokes below  accuracy below  accuracy above')
  for (const cut of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.14]) {
    const below = buckets.filter(b => b.m < cut)
    const above = buckets.filter(b => b.m >= cut)
    const pct = xs => (xs.length ? ((100 * xs.filter(x => x.ok).length) / xs.length).toFixed(1) + '%' : '-')
    console.log(`${pad(cut.toFixed(2), 5)}   ${pad(((100 * below.length) / buckets.length).toFixed(1) + '%', 20)}  ${pad(pct(below), 14)}  ${pad(pct(above), 14)}`)
  }
}

function loops() {
  // Feeds the two thresholds in handwriting.js. A loop has to be big enough to
  // be a loop and a pinhole has to be small enough to ignore, and if those two
  // populations overlap the threshold cannot be chosen at all: better to know.
  console.log('prototype                 loops  cross  loopY  turnAbs')
  for (const p of PROTOTYPES) {
    const prep = prepare(p.strokes.map(s => curve(s.map(([x, y]) => ({ x, y })), 6)))
    const f = features(prep)
    console.log(
      `  ${(p.digit + ' ' + p.name).padEnd(24)} ${pad(f.loops, 5)} ${pad(f.crossings, 6)} ` +
      `${pad(f.loopY.toFixed(2), 6)} ${pad(f.turnAbs.toFixed(2), 8)}`
    )
  }
}

/**
 * One knob at a time, because a sweep over two knobs that move together
 * measures the pair and gets written down as a fact about one of them. That
 * mistake is already in docs/DECISIONS.md once and once is enough.
 */
function weights() {
  const rows = sample()
  const templates = PROTOTYPES.map(p => ({
    digit: p.digit,
    features: features(prepare(p.strokes.map(s => curve(s.map(([x, y]) => ({ x, y })), 6)))),
  }))
  const guessWith = w => strokes => {
    const prep = prepare(strokes)
    if (!prep) return null
    const f = features(prep)
    const best = new Map()
    for (const t of templates) {
      const d = distance(f, t.features, w)
      if (!(best.get(t.digit) <= d)) best.set(t.digit, d)
    }
    const ranked = [...best.entries()].sort((a, b) => a[1] - b[1])
    return { digit: ranked[0][0], alternatives: ranked.map(r => r[0]) }
  }
  const held = rows.filter(r => r.form.heldOut)
  // Both numbers on every line. A weight that lifts the forms with prototypes
  // while pushing the held-out ones down is fitting, not improving, and that is
  // invisible from the total alone.
  const run = w => {
    const g = guessWith(w)
    const all = confusion(rows, g)
    const out = confusion(held, g)
    return `${((100 * all.right) / all.n).toFixed(1)}/${((100 * out.right) / out.n).toFixed(1)}`
  }
  const [pairA, pairB] = (process.argv[3] || '').split(',')
  if (pairA && pairB) {
    const steps = [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1]
    console.log(`${pairA} down, ${pairB} across`)
    console.log('      ' + steps.map(v => pad(v, 12)).join(''))
    for (const a of steps) {
      console.log(pad(a, 5) + ' ' + steps.map(b => pad(run({ ...WEIGHTS, [pairA]: a, [pairB]: b }), 12)).join(''))
    }
    return
  }
  console.log(`baseline ${run(WEIGHTS)}   (all/held out)`)
  for (const key of Object.keys(WEIGHTS)) {
    const line = [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1]
      .map(v => `${v}:${run({ ...WEIGHTS, [key]: v })}`)
      .join('  ')
    console.log(`  ${key.padEnd(10)} ${line}`)
  }
}

/**
 * Accuracy against how unsteady the hand is. The one table in this script that
 * says something a single accuracy figure cannot: where the recogniser stops
 * working, and how fast it gets there.
 */
function slop() {
  console.log('slop  overall  held out  top two  shown plainly  and right')
  for (const level of [0.5, 1, 1.5, 2, 2.5, 3, 4]) {
    SLOP = level
    seed = 0x9e3779b9
    const rows = sample()
    const res = confusion(rows, recognise)
    const held = confusion(rows.filter(r => r.form.heldOut), recognise)
    let sureN = 0
    let sureRight = 0
    for (const row of rows) {
      const r = recognise(row.strokes)
      if (!r || !r.sure) continue
      sureN++
      if (r.digit === row.form.digit) sureRight++
    }
    console.log(
      `${pad(level, 4)}  ${pad(((100 * res.right) / res.n).toFixed(1) + '%', 7)}  ` +
      `${pad(((100 * held.right) / held.n).toFixed(1) + '%', 8)}  ` +
      `${pad(((100 * res.top2) / res.n).toFixed(1) + '%', 7)}  ` +
      `${pad(((100 * sureN) / res.n).toFixed(0) + '%', 13)}  ${pad(((100 * sureRight) / (sureN || 1)).toFixed(1) + '%', 9)}`
    )
  }
}

function dists() {
  const rows = sample()
  const ds = []
  for (const row of rows) {
    const r = recognise(row.strokes)
    if (r) ds.push(r.distance)
  }
  ds.sort((a, b) => a - b)
  const q = p => ds[Math.floor(p * (ds.length - 1))].toFixed(3)
  console.log(`slop ${SLOP}  p50 ${q(0.5)}  p90 ${q(0.9)}  p99 ${q(0.99)}  max ${q(1)}`)
}

function time() {
  const rows = sample().slice(0, 2000)
  const t0 = process.hrtime.bigint()
  for (const row of rows) recognise(row.strokes)
  const t1 = process.hrtime.bigint()
  console.log(`${(Number(t1 - t0) / 1e6 / rows.length).toFixed(3)} ms per recognition over ${rows.length}`)
}

const mode = process.argv[2] || 'matrix'
if (mode === 'ablate') ablate()
else if (mode === 'margin') margin()
else if (mode === 'loops') loops()
else if (mode === 'weights') weights()
else if (mode === 'slop') slop()
else if (mode === 'dists') dists()
else if (mode === 'time') time()
else main()
