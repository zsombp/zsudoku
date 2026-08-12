// The variants: four that are a topology and nothing else, and one that is not.
//
// This file is short, and that is the point of the work that preceded it. The
// twelve techniques, the grader, the hint engine, the explanations, the review
// and belief archaeology all reason about units and peers rather than about
// arithmetic on three, so a variant that can be expressed as "different units,
// different peers" gets every one of them for free.
//
// Killer is the exception, and it is handled by making a cage list part of the
// topology rather than a second thing to thread through everything. `topo` is
// already carried into every technique by `createState`, so five arithmetic
// rungs in techniques.js read `topo.cages` and the whole stack above them, the
// grader, the hints, the socratic questions, the review, the move classifier
// and belief archaeology, needed no change at all. A thermometer's ordering
// along a path would go the same way.

import { makeTopology, CLASSIC, range, rowOf, colOf } from './topology.js'
import { mulberry32, randomSeed } from '../lib/prng.js'
import { uniqueCageLayout, cageOf, cageProblems } from './killer.js'
import { gradePuzzle } from './grader.js'
import { generateFull, makePuzzle, makePracticePuzzle, makeTailoredPuzzle } from './generator.js'

/**
 * A jigsaw layout together with a grid that fills it.
 *
 * The obvious order is to make the shapes and then fill them, and it does not
 * work. Three attempts died here and the numbers are worth keeping:
 *
 *   Growing regions from seeds stranded cells every single time. Sixty seeds,
 *   sixty failures, between one and twenty-two cells left unclaimed.
 *
 *   Trading a pair of adjacent cells across a border always disconnects a
 *   region, because the cell it gains touches nothing but the cell it gave
 *   away. Two hundred seeds, two hundred rejections.
 *
 *   Moving two cells fixes the shapes, and then a quarter of the layouts turn
 *   out to admit no valid filling at all. Searching for one is heavy-tailed:
 *   the layouts that work fill in about two hundred steps, and the ones that do
 *   not burn forty thousand and prove nothing. With restarts, eleven of forty
 *   layouts still never filled.
 *
 * So the shapes and the digits are built together. Start from square regions
 * and a completed classic grid, which is valid, and move cells between regions
 * only when both regions still hold nine different digits afterwards. Validity
 * is preserved at every step, so the result needs no search and cannot fail:
 * the layout comes with the grid that satisfies it already in hand.
 *
 * One grid is not enough on its own. Holding the digits fixed leaves only about
 * a fifth of the cells free to move before every remaining swap is blocked, and
 * a jigsaw that is five-sixths square is not a jigsaw. So it works in rounds:
 * mutate, then draw a fresh grid for the shapes as they now stand, which
 * unblocks a different set of moves and cannot fail because the layout is
 * already known to be satisfiable. The witness it was built with is the proof.
 */
export function jigsawLayout(seed, { rounds = 6, movesPerRound = 900 } = {}) {
  const rng = mulberry32(seed)
  let solution = generateFull(rng, CLASSIC)
  const owner = new Array(81)
  CLASSIC.regions.forEach((cells, r) => cells.forEach(cell => { owner[cell] = r }))

  const cellsOf = r => {
    const out = []
    for (let i = 0; i < 81; i++) if (owner[i] === r) out.push(i)
    return out
  }

  /** A region is only a region if you can walk it without leaving it. */
  const connected = r => {
    const cells = cellsOf(r)
    if (!cells.length) return false
    const seen = new Set([cells[0]])
    const queue = [cells[0]]
    while (queue.length) {
      for (const n of orthogonal(queue.pop())) {
        if (owner[n] === r && !seen.has(n)) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
    return seen.size === cells.length
  }

  const holdsDigitTwice = r => {
    const seen = new Set()
    for (const c of cellsOf(r)) {
      if (seen.has(solution[c])) return true
      seen.add(solution[c])
    }
    return false
  }

  const borderCells = (from, to) =>
    cellsOf(from).filter(c => orthogonal(c).some(n => owner[n] === to))

  const mutate = moves => {
  for (let k = 0; k < moves; k++) {
    const x = Math.floor(rng() * 9)
    const touching = [...new Set(cellsOf(x).flatMap(c => orthogonal(c).map(n => owner[n])))].filter(r => r !== x)
    if (!touching.length) continue
    const y = touching[Math.floor(rng() * touching.length)]

    const outbound = borderCells(x, y)
    if (!outbound.length) continue
    const a = outbound[Math.floor(rng() * outbound.length)]
    owner[a] = y

    const inbound = borderCells(y, x).filter(c => c !== a)
    if (!inbound.length || !connected(x)) {
      owner[a] = x
      continue
    }
    const b = inbound[Math.floor(rng() * inbound.length)]
    owner[b] = x

    // Shapes must stay whole, and each region must still be a set of nine
    // different digits, which is what keeps the grid a valid solution.
    if (!connected(x) || !connected(y) || holdsDigitTwice(x) || holdsDigitTwice(y)) {
      owner[a] = x
      owner[b] = y
    }
  }
  }

  for (let round = 0; round < rounds; round++) {
    mutate(movesPerRound)
    if (round === rounds - 1) break
    // A fresh grid for the shapes as they stand. Known satisfiable, because the
    // grid we are replacing satisfies them.
    const topo = makeTopology({ id: 'jigsaw-wip', name: 'wip', regions: range(9).map(cellsOf) })
    const next = generateFull(rng, topo)
    if (next) solution = next
  }

  return { regions: range(9).map(cellsOf), solution }
}

/** Just the shapes, for anything that only needs the topology. */
export const jigsawRegions = (seed, opts) => jigsawLayout(seed, opts).regions

const orthogonal = cell => {
  const r = rowOf(cell)
  const c = colOf(cell)
  const out = []
  if (r > 0) out.push(cell - 9)
  if (r < 8) out.push(cell + 9)
  if (c > 0) out.push(cell - 1)
  if (c < 8) out.push(cell + 1)
  return out
}

/**
 * A killer board: a finished grid, and a cage layout that grid is the only
 * answer to. Everything in it comes from `killer.js`; this is the wiring.
 *
 * ---- pure in the seed, on purpose ----
 *
 * The only decision in this file worth arguing about. The alternative is to
 * redraw the cages on every generation attempt while hunting for a tier, which
 * hands generation another knob. It was refused because it costs the property
 * that makes a saved killer game safe: with the layout fixed by the seed, the
 * seed alone rebuilds the exact board, so a record whose cage list did not
 * survive a round trip is recoverable rather than a puzzle wearing the wrong
 * outlines. Tier targeting gets its variety from which cells are given, which
 * is measured in generator.js and reaches every tier.
 *
 * ---- and it keeps the hardest of four candidates ----
 *
 * A cage layout can be made easier by giving clues and never harder, so the top
 * of the scale is fixed by the layout alone. One layout per seed leaves most
 * seeds unable to reach the top tier at all. Measured over 30 seeds, ranking
 * candidates by what the ladder scores on the empty board:
 *
 *   candidates   ceiling p50   reach Diabolical   layout ms mean/max
 *            1           750           7 of 30           8.6 / 69
 *            2          1050          11 of 30          19.5 / 84
 *            3          1370          17 of 30          35.9 / 141
 *            4          1455          21 of 30          43.4 / 142
 *            5          1468          21 of 30          55.0 / 146
 *
 * Four is the knee and it is still pure, because the candidates are a
 * deterministic sequence. The gentle end is unaffected: a harder layout just
 * needs a few more givens, and Gentle through Medium land 25 times in 25
 * either way.
 *
 * A layout the ladder cannot finish with no clues at all ranks last rather than
 * first. It is a proxy and it is the wrong way round in principle, since such a
 * layout may be the hardest of the four once one clue is given. It is kept
 * because it is the cheap question and it measures well; the honest reading is
 * "hardest of the four that are playable as they stand".
 */
const NO_CLUES = new Array(81).fill(0)

export function killerLayout(seed, base = CLASSIC, { candidates = 4 } = {}) {
  let best = null
  let tried = 0
  // Four extra passes on top, because `uniqueCageLayout` can return null on a
  // layout it cannot repair. Deterministic either way, so still pure.
  for (let attempt = 0; attempt < candidates + 4 && tried < candidates; attempt++) {
    // 0x9e3779b9 is the golden-ratio step used everywhere seeds are derived, so
    // one candidate lands nowhere near the next in the generator's stream.
    const s = (seed + attempt * 0x9e3779b9) >>> 0
    const solution = generateFull(mulberry32(s), base)
    if (!solution) continue
    const made = uniqueCageLayout(s, solution, { topo: base })
    if (!made) continue
    tried++

    const bare = gradePuzzle(NO_CLUES, { topo: killerTopology(made.cages, base) })
    const ceiling = bare.solved ? bare.score : 0
    if (!best || ceiling > best.ceiling) {
      best = { solution, cages: made.cages, splits: made.splits, ceiling }
    }
  }
  return best
}

/**
 * A topology with cages riding on it.
 *
 * A cage constrains on top of a board rather than instead of one, so this takes
 * any base: killer-X and killer-Windoku already work, and nothing below this
 * line knows the difference.
 */
export function killerTopology(cages, base = CLASSIC) {
  return {
    ...base,
    id: 'killer',
    name: 'Killer',
    cages: cages || null,
    cageOf: cages ? cageOf(cages) : null,
  }
}

/**
 * Which sides of each cell sit on a cage boundary, what its cage adds to, and
 * which cell prints that total.
 *
 * The same shape and the same argument as `regionEdges` in topology.js: the
 * drawing asks the data rather than doing its own arithmetic, so an outline can
 * never disagree with the constraint being enforced. It lives here rather than
 * in killer.js, its obvious neighbour, because killer.js is the engine and has
 * no opinions about drawing.
 *
 * Unlike `regionEdges` the grid's own border counts as a boundary. A cage
 * against the edge of the board is still a cage and still gets outlined; a
 * region against the edge already has the board's heavy rule there.
 *
 * `sum` is on every cell of the cage, not only the one that prints it, because
 * a cell's label has to be able to say what cage it is in. A dashed outline is
 * nothing at all to a screen reader.
 *
 * Returns null for a list that does not cover the grid, so a damaged record
 * draws no cages rather than most of them. The review takes its cage list
 * straight off a stored game and nothing on that path validates it; drawing
 * what survived would be a picture of a puzzle nobody ever played, and reading
 * a missing cell would throw and take the whole review screen with it.
 */
export function cageEdges(cages) {
  const owner = cageOf(cages)
  for (let i = 0; i < 81; i++) if (owner[i] < 0) return null
  return range(81).map(i => {
    const c = owner[i]
    const cage = cages[c]
    const differs = (dr, dc) => {
      const nr = rowOf(i) + dr
      const nc = colOf(i) + dc
      if (nr < 0 || nr > 8 || nc < 0 || nc > 8) return true
      return owner[nr * 9 + nc] !== c
    }
    return {
      top: differs(-1, 0),
      bottom: differs(1, 0),
      left: differs(0, -1),
      right: differs(0, 1),
      sum: cage.sum,
      size: cage.cells.length,
      // Cages arrive in reading order, so cells[0] is the top-left cell and the
      // renderer never has to work out where the number goes.
      head: cage.cells[0] === i,
    }
  })
}

const MAIN_DIAGONAL = range(9).map(i => i * 9 + i)
const ANTI_DIAGONAL = range(9).map(i => i * 9 + (8 - i))

/** Cells a knight's move away, which anti-knight forbids from matching. */
const knightMoves = cell => {
  const r = rowOf(cell)
  const c = colOf(cell)
  const out = []
  for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
    const nr = r + dr
    const nc = c + dc
    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) out.push(nr * 9 + nc)
  }
  return out
}

/**
 * The four extra regions of Windoku, the ones that sit inside the grid rather
 * than tiling it. They overlap the ordinary boxes, which is exactly why the
 * puzzle can be dug so much further before it stops being solvable.
 */
const WINDOWS = [
  [1, 2, 3],
  [5, 6, 7],
].flatMap(rows => [[1, 2, 3], [5, 6, 7]].map(cols =>
  rows.flatMap(r => cols.map(c => r * 9 + c))
))

export const VARIANTS = {
  classic: {
    id: 'classic',
    name: 'Classic',
    blurb: 'Nine rows, nine columns, nine boxes.',
    topology: () => CLASSIC,
  },
  jigsaw: {
    id: 'jigsaw',
    name: 'Jigsaw',
    blurb: 'The boxes are irregular shapes instead of squares. Everything else is the same.',
    // The shapes are part of the puzzle, so they come from its seed.
    needsSeed: true,
    topology: seed =>
      makeTopology({
        id: 'jigsaw',
        name: 'Jigsaw',
        regions: jigsawRegions(seed),
        regionNamer: i => `region ${i + 1}`,
      }),
  },
  x: {
    id: 'x',
    name: 'X-Sudoku',
    blurb: 'Both long diagonals must also hold one to nine.',
    topology: () =>
      makeTopology({
        id: 'x',
        name: 'X-Sudoku',
        regions: CLASSIC.regions,
        regionNamer: i => CLASSIC.unitMeta[CLASSIC.regionStart + i].name,
        extraUnits: [
          { cells: MAIN_DIAGONAL, type: 'diagonal', name: 'the main diagonal' },
          { cells: ANTI_DIAGONAL, type: 'diagonal', name: 'the other diagonal' },
        ],
      }),
  },
  windoku: {
    id: 'windoku',
    name: 'Windoku',
    blurb: 'Four extra shaded regions, overlapping the boxes, each holding one to nine.',
    topology: () =>
      makeTopology({
        id: 'windoku',
        name: 'Windoku',
        regions: [...CLASSIC.regions, ...WINDOWS],
        regionNamer: i =>
          i < 9 ? CLASSIC.unitMeta[CLASSIC.regionStart + i].name : `the ${['top left', 'top right', 'bottom left', 'bottom right'][i - 9]} window`,
      }),
  },
  antiknight: {
    id: 'antiknight',
    name: 'Anti-knight',
    blurb: 'No digit may repeat a knight’s move away, as on a chessboard.',
    topology: () =>
      makeTopology({
        id: 'antiknight',
        name: 'Anti-knight',
        regions: CLASSIC.regions,
        regionNamer: i => CLASSIC.unitMeta[CLASSIC.regionStart + i].name,
        // Constraint without a unit: nothing here forms a group of nine.
        extraPeers: knightMoves,
      }),
  },
  killer: {
    id: 'killer',
    name: 'Killer',
    blurb: 'Dashed cages, each adding up to the small number in its corner, and no digit twice inside one.',
    // The cages are the puzzle, so they come from its seed.
    needsSeed: true,
    topology: seed => {
      const made = killerLayout(seed)
      // A killer topology with no cages rather than a silent fall back to a
      // classic one. DECISIONS records that the jigsaw generator failed twice
      // by quietly shipping square boxes under another name, which is the worst
      // way for a variant to break: nothing throws and nothing looks wrong.
      return killerTopology(made?.cages || null)
    },
  },
}

export const VARIANT_LIST = Object.values(VARIANTS)

/** The topology for a variant, given the puzzle's seed where shapes depend on it. */
export function topologyFor(variantId, seed = 1) {
  const v = VARIANTS[variantId] || VARIANTS.classic
  return v.topology(seed)
}

/**
 * A puzzle for a variant, handling the fact that jigsaw shapes and the grid
 * that fills them have to be made together.
 *
 * Everything a caller needs to know about variants lives here, so the worker,
 * the app and the scripts all ask one question and get a puzzle back.
 */
export function makeVariantPuzzle(variantId, tier, opts = {}) {
  const seed = opts.seed ?? randomSeed()
  const variant = VARIANTS[variantId] || VARIANTS.classic

  if (variant.id === 'jigsaw') {
    const { regions, solution } = jigsawLayout(seed)
    const topo = makeTopology({
      id: 'jigsaw',
      name: 'Jigsaw',
      regions,
      regionNamer: i => `region ${i + 1}`,
    })
    const made = makePuzzle(tier, { ...opts, seed, topo, solution })
    // The shapes are part of the puzzle, so they travel with it: a saved game
    // or a synced record has to be able to rebuild the exact board.
    return made && { ...made, variant: 'jigsaw', regions }
  }

  if (variant.id === 'killer') {
    const layout = killerLayout(seed)
    if (!layout) return null
    const topo = killerTopology(layout.cages)
    // A wider search than the shared default, because the tiers are not evenly
    // reachable on a killer board: measured over 6 layouts and 40 clue subsets
    // at each of ten counts, Hard came up in about 5% of subsets while Medium
    // came up in 45%. Costs nothing when the first attempt lands.
    const made = makePuzzle(tier, {
      attempts: 60,
      budgetMs: 8000,
      ...opts,
      seed,
      topo,
      solution: layout.solution,
    })
    // The cages are the puzzle, so they travel with it exactly as jigsaw shapes
    // do. A record that arrives without them can still be rebuilt from the seed,
    // which is why `killerLayout` is pure, but a stored list needs no rebuild
    // and cannot be affected by a later change to the layout builder.
    return made && { ...made, variant: 'killer', cages: layout.cages }
  }

  const topo = variant.topology(seed)
  const made = makePuzzle(tier, { ...opts, seed, topo })
  return made && { ...made, variant: variant.id }
}

/**
 * Rebuild the topology for a saved or synced game.
 *
 * Jigsaw shapes and killer cages travel with the record rather than being
 * regenerated: the layout builder could change, and a saved game whose board
 * silently reshaped itself would be worse than one that failed to load.
 * Everything else is derivable from the variant id.
 *
 * Killer has a second line of defence that jigsaw does not, because
 * `killerLayout` is a pure function of the seed: a record that reaches here
 * without its cages still rebuilds the right board. The stored list is checked
 * rather than trusted, since a cage list that lost a cell in transit produces a
 * grid that looks completely normal and cannot be solved.
 */
export function topologyFromRecord({ variant, regions, cages, seed } = {}) {
  if (variant === 'jigsaw' && regions?.length === 9) {
    return makeTopology({
      id: 'jigsaw',
      name: 'Jigsaw',
      regions,
      regionNamer: i => `region ${i + 1}`,
    })
  }
  if (variant === 'killer' && cages?.length && !cageProblems(cages).length) {
    return killerTopology(cages)
  }
  return topologyFor(variant, seed)
}

/** A practice puzzle on any board, handling jigsaw's paired layout and grid. */
export function makeVariantPractice(variantId, technique, opts = {}) {
  const seed = opts.seed ?? randomSeed()
  const variant = VARIANTS[variantId] || VARIANTS.classic

  if (variant.id === 'jigsaw') {
    const { regions, solution } = jigsawLayout(seed)
    const topo = makeTopology({
      id: 'jigsaw',
      name: 'Jigsaw',
      regions,
      regionNamer: i => `region ${i + 1}`,
    })
    const made = makePracticePuzzle(technique, { ...opts, seed, topo, solution })
    return made && { ...made, variant: 'jigsaw', regions }
  }

  if (variant.id === 'killer') {
    const layout = killerLayout(seed)
    if (!layout) return null
    const topo = killerTopology(layout.cages)
    const made = makePracticePuzzle(technique, { ...opts, seed, topo, solution: layout.solution })
    return made && { ...made, variant: 'killer', cages: layout.cages }
  }

  const made = makePracticePuzzle(technique, { ...opts, seed, topo: variant.topology(seed) })
  return made && { ...made, variant: variant.id }
}

/** A tailored puzzle on any board, jigsaw's paired layout included. */
export function makeVariantTailored(variantId, opts = {}) {
  const seed = opts.seed ?? randomSeed()
  const variant = VARIANTS[variantId] || VARIANTS.classic

  if (variant.id === 'jigsaw') {
    const { regions, solution } = jigsawLayout(seed)
    const topo = makeTopology({ id: 'jigsaw', name: 'Jigsaw', regions, regionNamer: i => `region ${i + 1}` })
    const made = makeTailoredPuzzle({ ...opts, seed, topo, solution })
    return made && { ...made, variant: 'jigsaw', regions }
  }
  if (variant.id === 'killer') {
    const layout = killerLayout(seed)
    if (!layout) return null
    const topo = killerTopology(layout.cages)
    const made = makeTailoredPuzzle({ ...opts, seed, topo, solution: layout.solution })
    return made && { ...made, variant: 'killer', cages: layout.cages }
  }
  const made = makeTailoredPuzzle({ ...opts, seed, topo: variant.topology(seed) })
  return made && { ...made, variant: variant.id }
}
