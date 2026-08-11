// The variants, each one a topology and nothing else.
//
// This file is short, and that is the point of the work that preceded it. The
// twelve techniques, the grader, the hint engine, the explanations, the review
// and belief archaeology all reason about units and peers rather than about
// arithmetic on three, so a variant that can be expressed as "different units,
// different peers" gets every one of them for free.
//
// What that does not cover is arithmetic. Killer sudoku needs cage sums, and
// thermometers need an ordering along a path; neither is a set of nine cells
// holding nine digits, so both need genuinely new constraint types and new
// techniques to reason about them. They are deliberately not here.

import { makeTopology, CLASSIC, range, rowOf, colOf } from './topology.js'
import { mulberry32, randomSeed } from '../lib/prng.js'
import { generateFull, makePuzzle } from './generator.js'

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

  const topo = variant.topology(seed)
  const made = makePuzzle(tier, { ...opts, seed, topo })
  return made && { ...made, variant: variant.id }
}

/**
 * Rebuild the topology for a saved or synced game.
 *
 * Jigsaw shapes travel with the record rather than being regenerated: the
 * layout builder could change, and a saved game whose board silently reshaped
 * itself would be worse than one that failed to load. Everything else is
 * derivable from the variant id.
 */
export function topologyFromRecord({ variant, regions, seed } = {}) {
  if (variant === 'jigsaw' && regions?.length === 9) {
    return makeTopology({
      id: 'jigsaw',
      name: 'Jigsaw',
      regions,
      regionNamer: i => `region ${i + 1}`,
    })
  }
  return topologyFor(variant, seed)
}
