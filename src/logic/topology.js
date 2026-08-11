// Board topology: which cells constrain which.
//
// Cells are indexed 0..80, row-major. A "unit" is any set of nine cells that
// must hold the nine digits exactly once. A cell's "peers" are every other cell
// sharing a unit with it.
//
// ---- why this is built rather than hardcoded ----
//
// It used to be nine rows, nine columns and nine 3x3 boxes, written as
// constants. Every variant worth having is a different answer to the same two
// questions, and nothing above this file needs to know which answer it got:
//
//   Jigsaw       the nine regions are irregular instead of square
//   X-Sudoku     the two diagonals are units as well
//   Windoku      four extra overlapping regions
//   Anti-knight  a knight's move away counts as a peer
//
// That is the whole trick. The twelve techniques already reason about "units"
// and "peers" and never about arithmetic on 3, so they grade, hint and explain
// every one of those variants with no change at all.
//
// The one exception was `claiming`, which asked `boxOf(cell)` and so assumed
// square boxes. Topologies carry `regionOf` instead, and the technique reads it
// off the board it was handed.

export const range = n => Array.from({ length: n }, (_, i) => i)

const BAND = ['top', 'middle', 'bottom']
const STACK = ['left', 'centre', 'right']

export const rowOf = i => Math.floor(i / 9)
export const colOf = i => i % 9

/**
 * Build a topology from its regions, plus anything else that constrains.
 *
 * `regions` is nine groups of nine cells. `extraUnits` are further groups that
 * must also hold nine distinct digits but are not regions, which matters
 * because pointing and claiming are specifically a region-against-line
 * argument: a diagonal is a unit but is not a box, and treating it as one would
 * produce eliminations that are not sound.
 *
 * `extraPeers` adds constraint without adding a unit at all. Anti-knight says
 * two cells a knight's move apart cannot match, which rules out a digit without
 * ever forming a group of nine.
 */
export function makeTopology({ id, name, regions, regionNamer, extraUnits = [], extraPeers = null }) {
  const rows = range(9).map(r => range(9).map(c => r * 9 + c))
  const cols = range(9).map(c => range(9).map(r => r * 9 + c))

  const units = [...rows, ...cols, ...regions, ...extraUnits.map(u => u.cells)]
  const unitMeta = [
    ...rows.map((_, i) => ({ type: 'row', index: i })),
    ...cols.map((_, i) => ({ type: 'col', index: i })),
    ...regions.map((_, i) => ({ type: 'region', index: i, name: regionNamer?.(i) })),
    ...extraUnits.map((u, i) => ({ type: u.type || 'extra', index: i, name: u.name })),
  ]

  // Regions can overlap: a Windoku cell is in a box and in a window. `regionOf`
  // keeps the first one that claims it, which is always the box, because that
  // is the region the grid is drawn from and the one `claiming` should argue
  // about. The overlapping extras still constrain, since they are units.
  const regionOf = new Array(81).fill(-1)
  regions.forEach((cells, i) => cells.forEach(cell => { if (regionOf[cell] === -1) regionOf[cell] = i }))

  // Cells belonging to a region beyond the tiling, for shading them.
  const overlaid = new Set()
  regions.slice(9).forEach(cells => cells.forEach(cell => overlaid.add(cell)))

  const peers = range(81).map(i => {
    const s = new Set()
    for (const u of units) if (u.includes(i)) for (const j of u) if (j !== i) s.add(j)
    for (const j of extraPeers?.(i) || []) if (j !== i) s.add(j)
    return [...s]
  })

  return {
    id,
    name,
    rows,
    cols,
    regions,
    units,
    unitMeta,
    // Where the regions start in `units`, so a technique that wants regions
    // specifically can find them without counting.
    regionStart: 18,
    regionOf,
    overlaid,
    peers,
    candMaskAt(board, i) {
      let mask = 0b111111111
      for (const p of peers[i]) if (board[p]) mask &= ~(1 << (board[p] - 1))
      return mask
    },
  }
}

/** The 3x3 boxes everyone means by "sudoku". */
const squareRegions = range(9).map(b => {
  const br = Math.floor(b / 3) * 3
  const bc = (b % 3) * 3
  const cells = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + bc + c)
  return cells
})

export const CLASSIC = makeTopology({
  id: 'classic',
  name: 'Classic',
  regions: squareRegions,
  regionNamer: i => `the ${BAND[Math.floor(i / 3)]} ${STACK[i % 3]} box`,
})

/** Human name for a unit, for hint and explanation text. */
export function unitName({ type, index, name }) {
  if (type === 'row') return `row ${index + 1}`
  if (type === 'col') return `column ${index + 1}`
  return name || `region ${index + 1}`
}

// ---- the classic topology, as plain exports ----
//
// Everything that has no opinion about variants keeps importing these and keeps
// working. Only code that must handle an arbitrary board reads the topology off
// the state it was given.

export const ROWS = CLASSIC.rows
export const COLS = CLASSIC.cols
export const BOXES = CLASSIC.regions
export const UNITS = CLASSIC.units
export const UNIT_META = CLASSIC.unitMeta
export const PEERS = CLASSIC.peers
export const boxOf = i => CLASSIC.regionOf[i]

/** Digits 1..9 that could legally go in cell `i` given the placed values in `b`. */
export function candsAt(b, i, topo = CLASSIC) {
  const used = new Set()
  for (const p of topo.peers[i]) if (b[p]) used.add(b[p])
  const out = []
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v)
  return out
}

/** Same thing as a 9-bit mask, for the candidate machinery. Bit 0 is digit 1. */
export function candMaskAt(b, i, topo = CLASSIC) {
  return topo.candMaskAt(b, i)
}

/**
 * Which sides of each cell sit on a region boundary.
 *
 * The board used to draw its heavy rules with `col % 3 === 2`, which is only
 * true of square boxes. Asking the topology instead means a jigsaw draws its
 * own outline, and the drawing can never disagree with the rules being
 * enforced: both come from the same regions.
 */
export function regionEdges(topo) {
  return range(81).map(i => {
    const r = topo.regionOf[i]
    const differs = (dr, dc) => {
      const nr = rowOf(i) + dr
      const nc = colOf(i) + dc
      if (nr < 0 || nr > 8 || nc < 0 || nc > 8) return false
      return topo.regionOf[nr * 9 + nc] !== r
    }
    return {
      top: differs(-1, 0),
      bottom: differs(1, 0),
      left: differs(0, -1),
      right: differs(0, 1),
    }
  })
}
