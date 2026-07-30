// Board topology. Ported 1:1 from the prototype: this is pure geometry and
// there is nothing to improve about it.
//
// Cells are indexed 0..80, row-major. A "unit" is any row, column or box, so
// there are 27 of them. A cell's "peers" are every other cell sharing a unit
// with it: 20 of them.

export const ROWS = []
export const COLS = []
export const BOXES = []

for (let r = 0; r < 9; r++) ROWS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c))
for (let c = 0; c < 9; c++) COLS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c))
for (let b = 0; b < 9; b++) {
  const br = Math.floor(b / 3) * 3
  const bc = (b % 3) * 3
  const cells = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + bc + c)
  BOXES.push(cells)
}

export const UNITS = [...ROWS, ...COLS, ...BOXES]

// Which row, column and box each unit is, so a technique can say "the middle
// left box" rather than "unit 21". The hint engine in Phase 3 reads this.
export const UNIT_META = [
  ...ROWS.map((_, i) => ({ type: 'row', index: i })),
  ...COLS.map((_, i) => ({ type: 'col', index: i })),
  ...BOXES.map((_, i) => ({ type: 'box', index: i })),
]

const BAND = ['top', 'middle', 'bottom']
const STACK = ['left', 'centre', 'right']

/** Human name for a unit, for hint text. */
export function unitName({ type, index }) {
  if (type === 'row') return `row ${index + 1}`
  if (type === 'col') return `column ${index + 1}`
  return `the ${BAND[Math.floor(index / 3)]} ${STACK[index % 3]} box`
}

export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set()
  for (const u of UNITS) if (u.includes(i)) for (const j of u) if (j !== i) s.add(j)
  return [...s]
})

export const rowOf = i => Math.floor(i / 9)
export const colOf = i => i % 9
export const boxOf = i => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

export const range = n => Array.from({ length: n }, (_, i) => i)

/** Digits 1..9 that could legally go in cell `i` given the placed values in `b`. */
export function candsAt(b, i) {
  const used = new Set()
  for (const p of PEERS[i]) if (b[p]) used.add(b[p])
  const out = []
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v)
  return out
}

/** Same thing as a 9-bit mask, for the candidate machinery. Bit 0 is digit 1. */
export function candMaskAt(b, i) {
  let mask = 0b111111111
  for (const p of PEERS[i]) if (b[p]) mask &= ~(1 << (b[p] - 1))
  return mask
}
