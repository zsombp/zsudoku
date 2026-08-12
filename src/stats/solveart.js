// A finished game as a picture.
//
// Three things are recorded about every placement and none of them is visible
// anywhere in the app as a shape. The move log knows the order the cells were
// filled, the gaps between entries know how long you sat on each one, and the
// classifier knows whether the board had proved it yet. All three are drawn:
//
//   order   a thread through the cells, drifting off the lattice as time passes
//   dwell   the width of the thread, and the size of the bead at each cell
//   class   the colour of the bead, the same key the review's pips already use
//
// Two halves, deliberately split. `toArt` returns normalised coordinates in
// 0..1 and knows nothing about pixels, so the same drawing serves a thumbnail
// and a print. `toSvg` is the only part that has a size, and it names no
// colour: every fill is a CSS custom property, so one drawing themes six ways.
//
// Nothing here imports React or touches the DOM.

import { analyseGame } from './analysis.js'
import { rowOf, colOf } from '../logic/topology.js'
import { fmtMs } from '../lib/format.js'

/** Bump if the drawing changes shape, so a cached picture can be spotted. */
export const ART_VERSION = 1

// ---- the warp ----
//
// A path drawn through nine-by-nine cell centres is a wiring diagram: every
// segment lands on the same lattice and the whole thing reads as mechanical.
// So the board turns as the game goes on. The grid you were given is the still
// point, drawn square, and the solve swings from half a turn behind it to half
// a turn ahead, opening outward as it goes.
//
// Centred rather than starting square and drifting off, which was the first
// attempt and put every picture off balance: the whole path leaned one way and
// left a wedge of empty canvas on the other. Centring costs nothing and the
// statement is better, since the givens are the one thing that did not move.
//
// Drift is by position in the order, not by the clock. Time-weighted drift puts
// most of the rotation into two or three long pauses, which reads as a kink
// rather than a drift, and dwell already has a channel of its own.

// Judged by eye against four simulated solves, which is the only way to judge
// it, but the ceiling is not a matter of taste. Past about 1.5 the composition
// starts depending on how strongly the solve order happened to correlate with
// position on the board: a game solved in a scan fans out to one side and
// leaves the lattice sitting off centre, looking like a mistake. At 1.2 every
// tier stayed balanced.
const TURN = 1.2 // radians, about a fifth of a turn end to end
const BLOOM = 0.14

// Room left around the drawing, in canvas fractions. The widest thing drawn at
// a mark is a full-width bead at 0.0065 inside the ring a sharp placement gets,
// 0.008, plus half its stroke: 0.0156 in all. Everything is scaled to fit inside
// this rather than laid out at a fixed size, so the turn can be as wide as it
// looks good without leaving a border of dead canvas.
const MARGIN = 0.018

// ---- weight from dwell ----
//
// Dwell is heavy-tailed: a stall of several minutes in a game whose typical gap
// is four seconds is ordinary, not exceptional. The failure of a linear map is
// not that the short placements vanish, since a floor stops that. It is that
// the range gets spent on the two or three stalls and everything else is drawn
// at the same width.
//
// Measured on a simulated Expert solve, 58 placements, lognormal gaps around a
// 4s median: linear gives the middle 80% of placements 30% of the width range,
// and once three genuine multi-minute stalls are in the game that falls to 8%.
// Logarithmic against the game's own median holds it at 68% in both, which is
// the same relative-threshold rule the rest of the app uses for "a long think".
//
// SATURATE is where the thread reaches full width, at 12 times the median. It
// leaves 7% of placements saturated on the stall-heavy simulation against 14%
// at 6, and it puts the app's existing "long pause" threshold of three times
// the median at 54% of full width, so a pause the review would remark on is
// visibly more than half the widest thing in the picture.

const W_MIN = 0.0018 // 1.2px at 640: an instant placement still draws a line
const W_MAX = 0.0105 // 6.7px at 640
const SATURATE = 12

// Beads are a little smaller than the ribbon is wide, so the thread reads as a
// halo around each placement rather than the bead reading as a lump in it. The
// floor keeps a fast placement visible as a coloured dot.
const BEAD = 0.62
const BEAD_MIN = 0.0036

// The board the game was played on, drawn faintly underneath. Without it the
// path is a scribble on nothing: there is no reference for where the middle of
// the grid is, no edge to compose against, and the drift off the lattice is
// invisible because there is no lattice to drift from. The clues are drawn
// larger than the empty cells because they are the one part of the picture the
// player did not make.
const GRID_DOT = 0.0018
const CLUE_DOT = 0.0040

/**
 * Class to colour role.
 *
 * Grouped rather than one role per class: routine and solid are most of any
 * game and separating them would put two thirds of the picture into two hues
 * that mean "you solved it normally". The classes worth picking out are the
 * rare ones. `unknown` is for a record with no solution stored, where nothing
 * is known about justification and the picture should not imply otherwise.
 */
const ROLE = {
  routine: 'earned',
  solid: 'earned',
  sharp: 'sharp',
  lucky: 'lucky',
  hint: 'hint',
  mistake: 'mistake',
}

/**
 * Every colour is a custom property name. Never a literal: the app has six
 * themes and a hardcoded colour outside `tokens.css` is a bug.
 *
 * `solve` is the default and is one hue plus the rare moments picked out, which
 * is the restraint the stats screens already keep. `review` uses exactly the
 * colours the move list's pips use, so the picture reads with a key that is
 * already on the screen next to it. `mono` is for paper, and still says which
 * placements were wrong and which needed a pattern, because those two carry a
 * shape as well as a colour.
 */
export const PALETTES = {
  solve: {
    paper: '--panel',
    grid: '--line',
    ghost: '--sub',
    thread: '--accent',
    earned: '--accent',
    sharp: '--t1',
    lucky: '--t4',
    hint: '--t3',
    mistake: '--error',
    unknown: '--sub',
  },
  review: {
    paper: '--panel',
    grid: '--line',
    ghost: '--sub',
    thread: '--accent',
    earned: '--line-strong',
    sharp: '--t1',
    lucky: '--t4',
    hint: '--t3',
    mistake: '--error',
    unknown: '--sub',
  },
  mono: {
    paper: '--panel',
    grid: '--line',
    ghost: '--sub',
    thread: '--ink',
    earned: '--ink',
    sharp: '--ink',
    lucky: '--sub',
    hint: '--sub',
    mistake: '--ink',
    unknown: '--sub',
  },
}

const ROLES = ['earned', 'sharp', 'lucky', 'hint', 'mistake', 'unknown']

/**
 * Where a cell sits on a board turned by `a` and swelled by `s`, in board
 * units centred on zero. Fitted to the canvas afterwards, not here.
 */
function place(cell, a, s) {
  const gx = (colOf(cell) + 0.5) / 9 - 0.5
  const gy = (rowOf(cell) + 0.5) / 9 - 0.5
  return {
    x: (gx * Math.cos(a) - gy * Math.sin(a)) * s,
    y: (gx * Math.sin(a) + gy * Math.cos(a)) * s,
  }
}

/**
 * Scale and centre everything so the drawing fills the frame.
 *
 * Over the lattice as well as the path, so that the board is always in shot and
 * the scale barely moves between games: a picture that zoomed in on whichever
 * corner happened to be busy would be a different size every time and would
 * stop being comparable with the last one.
 */
function fitAll(groups) {
  let lo = Infinity
  let hi = -Infinity
  let loY = Infinity
  let hiY = -Infinity
  for (const g of groups) {
    for (const p of g) {
      if (p.x < lo) lo = p.x
      if (p.x > hi) hi = p.x
      if (p.y < loY) loY = p.y
      if (p.y > hiY) hiY = p.y
    }
  }
  const cx = (lo + hi) / 2
  const cy = (loY + hiY) / 2
  const half = Math.max((hi - lo) / 2, (hiY - loY) / 2) || 1
  const k = (0.5 - MARGIN) / half
  // Widths are canvas fractions and deliberately do not scale: the line weight
  // means the same thing in every picture.
  return p => ({ ...p, x: 0.5 + (p.x - cx) * k, y: 0.5 + (p.y - cy) * k })
}

/**
 * The drawing, as data.
 *
 * Built from the move log, which is the thing being drawn, and decorated with
 * the classifier's verdict where one is available. That order matters: a record
 * missing its solution still has a solve path worth looking at, and a game that
 * cannot be classified should lose its colours rather than its picture.
 *
 * Pass `analysis` when the caller already has one, which the review does. It is
 * the expensive half and its cost depends entirely on the game: 0.2ms on a
 * solve played in the ladder's own order, where the first technique tried
 * always fires, and 4.7ms on one played in reading order, where the ladder runs
 * to the bottom at every step. The drawing itself is 0.03ms either way.
 *
 * Returns null when there is nothing to draw. An empty frame is worse than no
 * frame: it looks like the feature is broken rather than like the game was.
 */
export function toArt(record, { analysis } = {}) {
  const log = record?.moveLog || []
  if (!log.length) return null

  const placed = []
  let prevT = 0
  for (const m of log) {
    const gap = Math.max(0, (m.t || 0) - prevT)
    prevT = m.t || 0
    if (m.kind !== 'place' && m.kind !== 'hint') continue
    if (!Number.isInteger(m.cell) || m.cell < 0 || m.cell > 80) continue
    placed.push({ cell: m.cell, t: m.t || 0, dwellMs: gap })
  }
  if (!placed.length) return null

  // Auto-complete fills a dozen cells in one press and is deliberately absent:
  // the thread is a record of attention, and nobody attended to those. The
  // count is reported instead so a caller can say so.
  const autoFilled = log
    .filter(m => m.kind === 'autoComplete')
    .reduce((n, m) => n + (m.count || m.changes?.length || 0), 0)

  const classes = classify(record, analysis)

  const sorted = placed.map(p => p.dwellMs).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 0
  const longest = sorted[sorted.length - 1] || 0

  let marks = placed.map((p, i) => {
    const progress = placed.length > 1 ? i / (placed.length - 1) : 0
    const cls = classes[i] || null
    return {
      cell: p.cell,
      row: rowOf(p.cell),
      col: colOf(p.cell),
      order: i + 1,
      t: p.t,
      dwellMs: p.dwellMs,
      cls,
      role: (cls && ROLE[cls]) || 'unknown',
      ...place(p.cell, TURN * (progress - 0.5), 1 + BLOOM * progress),
      w: weight(p.dwellMs, median),
    }
  })

  // The board itself, unturned. A clue is where the puzzle started and never
  // moved, so it is drawn square while everything the player did swings past it.
  const puzzle = record.puzzle || []
  let grid = []
  let clues = []
  for (let c = 0; c < 81; c++) {
    const at = { cell: c, ...place(c, 0, 1) }
    ;(puzzle[c] ? clues : grid).push(at)
  }

  // The spine is built first and fitted with everything else, because a spline
  // through the marks can bow well outside them and it is the ribbon, not the
  // marks, that would be the thing clipped by the frame.
  let spine = spineOf(marks)
  const fit = fitAll([marks, spine, grid, clues])
  marks = marks.map(fit)
  spine = spine.map(fit)
  grid = grid.map(fit)
  clues = clues.map(fit)

  const worst = placed.reduce((a, b) => (b.dwellMs > a.dwellMs ? b : a), placed[0])

  return {
    v: ART_VERSION,
    marks,
    spine,
    grid,
    clues,
    label: label(record, marks.length),
    stats: {
      placements: marks.length,
      medianDwellMs: median,
      longestDwellMs: longest,
      longestCell: worst.cell,
      autoFilled,
      durationMs: record.durationMs || 0,
    },
  }
}

/**
 * A class per placement, indexed the same way the marks are.
 *
 * `analyseGame` walks the log and returns only the placements, in order, so its
 * results line up one to one with what was collected above. It throws on a
 * record with no puzzle, which is a record that predates the whole log format,
 * and the drawing survives that without colours rather than not existing.
 */
function classify(record, analysis) {
  try {
    const a = analysis || analyseGame(record)
    return (a?.moves || []).map(m => m.cls)
  } catch {
    return []
  }
}

/** Half the thread's width at a placement, from how long it took. */
function weight(dwellMs, median) {
  if (!median) return W_MIN
  const ratio = Math.log1p(dwellMs / median) / Math.log1p(SATURATE)
  return W_MIN + (W_MAX - W_MIN) * Math.min(1, Math.max(0, ratio))
}

function label(record, n) {
  const tier = record?.graded || record?.requested
  const time = record?.durationMs ? ` in ${fmtMs(record.durationMs)}` : ''
  // "an Expert", "a Hard". Only one of the six tiers starts with a vowel, which
  // is exactly the sort of thing that ships wrong.
  const on = tier ? ` on a${/^[aeiou]/i.test(tier) ? 'n' : ''} ${tier}` : ''
  // "Beads", not "placements". The picture draws the hints as well as your own
  // digits, and the glossary defines Placements as the count without them, so
  // the same screen carried 57 placements over a figure reading 56. A bead is
  // the drawing's own unit and the paragraph beneath says what one is.
  return `Solve path: ${n} bead${n === 1 ? '' : 's'}${on}${time}.`
}

// ---- the thread ----

/**
 * Samples per gap between placements.
 *
 * Six, because past that the picture stops improving and the file keeps
 * growing. Measured on a 58 placement solve, the angle the drawn polyline turns
 * through at each joint: 10.0 degrees median at four samples, 6.4 at six, 5.0
 * at eight, and the 95th percentile barely moves at all (25.3, 23.0, 21.5).
 * That tail is the path's own hairpins rather than the sampling, so more
 * samples relocate the corners instead of removing them. Bytes are linear in
 * this: 9.8KB, 13.9KB, 18.1KB.
 */
const SAMPLES = 6

/**
 * A centripetal Catmull-Rom spline through the marks, sampled.
 *
 * Centripetal rather than uniform, which is not a detail here. This path is
 * mostly long jumps across the board followed by short hops, and that is
 * exactly where uniform Catmull-Rom overshoots. Measured across five simulated
 * solves, the worst excursion outside the box formed by the two points a
 * segment runs between: uniform 0.077 of the canvas, chordal 0.089,
 * centripetal 0.034. The overshoot is a loop around a cell nothing ever
 * happened in, so halving it is worth the square roots.
 */
function spineOf(marks) {
  if (marks.length < 2) return marks.map(m => ({ x: m.x, y: m.y, w: m.w }))

  const at = i => marks[Math.min(marks.length - 1, Math.max(0, i))]
  const out = []

  for (let i = 0; i < marks.length - 1; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)

    // Knots spaced by the square root of the distance. The floor matters: the
    // centre cell is the one point the warp never moves, so filling it twice in
    // a row gives two identical points and a division by zero.
    const gap = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)))
    const t0 = 0
    const t1 = t0 + gap(p0, p1)
    const t2 = t1 + gap(p1, p2)
    const t3 = t2 + gap(p2, p3)

    for (let s = 0; s < SAMPLES; s++) {
      const f = s / SAMPLES
      const t = t1 + (t2 - t1) * f
      out.push({
        ...crPoint(p0, p1, p2, p3, t0, t1, t2, t3, t),
        w: p1.w + (p2.w - p1.w) * f,
      })
    }
  }

  const last = marks[marks.length - 1]
  out.push({ x: last.x, y: last.y, w: last.w })
  return out
}

function crPoint(p0, p1, p2, p3, t0, t1, t2, t3, t) {
  const mix = (a, b, ta, tb) => {
    const f = (t - ta) / (tb - ta)
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
  }
  const a1 = mix(p0, p1, t0, t1)
  const a2 = mix(p1, p2, t1, t2)
  const a3 = mix(p2, p3, t2, t3)
  const b1 = mix(a1, a2, t0, t2)
  const b2 = mix(a2, a3, t1, t3)
  return mix(b1, b2, t1, t2)
}

// ---- rendering ----

/**
 * The thread is drawn in four passes of rising opacity rather than one, so that
 * where you finished is visible and not just where you went. Four steps for the
 * same reason the calendar heatmap has four: past about seven, adjacent levels
 * of a translucent overlay stop being tellable apart. These steps are 0.08
 * apart, which is comfortably above that.
 */
const BANDS = [0.13, 0.20, 0.27, 0.35]

const isVarName = v => typeof v === 'string' && /^--[a-z][a-z0-9-]*$/i.test(v)

function resolvePalette(palette) {
  const base = typeof palette === 'string' ? PALETTES[palette] : palette
  if (!base) throw new TypeError(`Unknown palette: ${palette}`)
  const out = { ...PALETTES.solve, ...base }
  for (const [role, name] of Object.entries(out)) {
    // A literal colour here would survive every test that only renders the
    // default palette, and would then be wrong in five of the six themes.
    if (!isVarName(name)) throw new TypeError(`Palette entry ${role} must be a custom property name, got ${name}`)
  }
  return out
}

const num = v => String(Math.round(v * 100) / 100)

/**
 * The drawing as an SVG string.
 *
 * Colours are set on groups, not on elements, so the whole file names each
 * custom property once. They are set as inline `style` rather than as `fill`
 * attributes because a presentation attribute is not reliably a CSS value in
 * every browser, and `var()` in one has a history of being ignored. A `<style>`
 * block would be smaller still and is not used on purpose: style inside an
 * inlined SVG is document-scoped, so its rules would leak into the app.
 */
export function toSvg(art, { size = 640, palette = 'solve', background = true } = {}) {
  if (!art?.marks?.length) return ''
  const pal = resolvePalette(palette)
  const S = size
  const px = v => num(v * S)

  const parts = []
  if (background) parts.push(`<rect width="${num(S)}" height="${num(S)}" style="fill:var(${pal.paper})"/>`)

  const discs = (list, r) => list.map(c => `<circle cx="${px(c.x)}" cy="${px(c.y)}" r="${px(r)}"/>`).join('')
  if (art.grid?.length) parts.push(`<g style="fill:var(${pal.grid})">${discs(art.grid, GRID_DOT)}</g>`)
  if (art.clues?.length) parts.push(`<g style="fill:var(${pal.ghost});opacity:.5">${discs(art.clues, CLUE_DOT)}</g>`)

  const thread = bandPaths(art.spine, S)
  if (thread) parts.push(`<g style="fill:var(${pal.thread})">${thread}</g>`)

  for (const role of ROLES) {
    const inRole = art.marks.filter(m => m.role === role)
    if (!inRole.length) continue

    // A wrong digit is never signalled by colour alone, here as anywhere else
    // in the app: a mistake is an open ring, which survives a mono print and
    // survives colour blindness.
    if (role === 'mistake') {
      const rings = inRole
        .map(m => `<circle cx="${px(m.x)}" cy="${px(m.y)}" r="${px(bead(m) + 0.004)}"/>`)
        .join('')
      parts.push(
        `<g style="fill:none;stroke:var(${pal.mistake});stroke-width:${px(0.0028)}">${rings}</g>`
      )
      continue
    }

    parts.push(`<g style="fill:var(${pal[role]})">${inRole.map(m => `<circle cx="${px(m.x)}" cy="${px(m.y)}" r="${px(bead(m))}"/>`).join('')}</g>`)

    // The placements that needed a real pattern get a ring around them. They
    // are rare by construction, a handful a game, so this stays quiet.
    if (role === 'sharp') {
      const halos = inRole
        .map(m => `<circle cx="${px(m.x)}" cy="${px(m.y)}" r="${px(bead(m) + 0.008)}"/>`)
        .join('')
      parts.push(
        `<g style="fill:none;stroke:var(${pal.sharp});stroke-width:${px(0.0022)};opacity:.6">${halos}</g>`
      )
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(S)} ${num(S)}" width="${num(S)}" height="${num(S)}" role="img" aria-label="${esc(art.label)}">`,
    `<title>${esc(art.label)}</title>`,
    ...parts,
    '</svg>',
  ].join('')
}

const bead = m => Math.max(BEAD_MIN, m.w * BEAD)

const esc = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The thread, split into its opacity bands. */
function bandPaths(spine, S) {
  if (spine.length < 2) return ''
  const per = spine.length / BANDS.length
  return BANDS.map((opacity, b) => {
    const from = Math.floor(b * per)
    // One sample of overlap, or the bands leave a hairline gap between them.
    const to = b === BANDS.length - 1 ? spine.length - 1 : Math.floor((b + 1) * per)
    const d = ribbon(spine.slice(from, to + 1), S)
    return d ? `<path style="opacity:${opacity}" d="${d}"/>` : ''
  }).join('')
}

/**
 * A variable-width stroke, as a filled outline.
 *
 * SVG strokes are one width per path, so a thread that swells where you stalled
 * has to be a shape rather than a line. The outline runs up one side, round the
 * end, and back down the other. Filled nonzero, so the crossings a solve path
 * is full of stay solid instead of punching holes in themselves, and so the
 * translucency does not build up into mud where the path doubles back.
 */
function ribbon(pts, S) {
  if (pts.length < 2) return ''
  const left = []
  const right = []
  const frames = []

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const nx = -ty
    const ny = tx
    const w = pts[i].w
    left.push([pts[i].x + nx * w, pts[i].y + ny * w])
    right.push([pts[i].x - nx * w, pts[i].y - ny * w])
    frames.push({ p: pts[i], nx, ny, tx, ty, w })
  }

  // Round ends, sampled rather than drawn as arcs: an elliptical arc command
  // needs a sweep flag, and which of the two sweeps bulges forward depends on a
  // handedness that is easy to get backwards and shows up as a bite taken out
  // of the end of the thread.
  const capPts = (c, back) => {
    const out = []
    const [nx, ny] = back ? [-c.nx, -c.ny] : [c.nx, c.ny]
    const [tx, ty] = back ? [-c.tx, -c.ty] : [c.tx, c.ty]
    for (let k = 1; k < 6; k++) {
      const a = (k * Math.PI) / 6
      out.push([c.p.x + c.w * (Math.cos(a) * nx + Math.sin(a) * tx), c.p.y + c.w * (Math.cos(a) * ny + Math.sin(a) * ty)])
    }
    return out
  }

  const seg = ([x, y]) => `${num(x * S)},${num(y * S)}`
  const d = [`M${seg(left[0])}`]
  for (let i = 1; i < left.length; i++) d.push(`L${seg(left[i])}`)
  for (const p of capPts(frames[frames.length - 1], false)) d.push(`L${seg(p)}`)
  for (let i = right.length - 1; i >= 0; i--) d.push(`L${seg(right[i])}`)
  for (const p of capPts(frames[0], true)) d.push(`L${seg(p)}`)
  d.push('Z')
  return d.join('')
}
