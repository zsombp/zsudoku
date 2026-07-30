// Pencil marks are stored as a 9-bit mask per cell rather than an array of
// digits. Bit 0 is the digit 1, bit 8 is the digit 9.
//
// Reason: undo is unlimited and gets persisted from Phase 3, so a snapshot per
// move adds up. A long Expert game runs to a few hundred moves, and 81 small
// arrays per snapshot is roughly ten times the memory of 81 integers. The
// helpers below keep the call sites readable so nothing outside this file has
// to think in bits.

export const ALL_MARKS = 0b111111111

export const hasMark = (mask, v) => (mask & (1 << (v - 1))) !== 0
export const addMark = (mask, v) => mask | (1 << (v - 1))
export const removeMark = (mask, v) => mask & ~(1 << (v - 1))
export const toggleMark = (mask, v) => mask ^ (1 << (v - 1))
export const countMarks = mask => {
  let n = 0
  while (mask) { mask &= mask - 1; n++ }
  return n
}

/** Mask to a sorted array of digits. For rendering and for tests. */
export function marksToList(mask) {
  const out = []
  for (let v = 1; v <= 9; v++) if (hasMark(mask, v)) out.push(v)
  return out
}

/** Array of digits to a mask. Used when loading old saves. */
export function listToMarks(list) {
  let mask = 0
  for (const v of list) mask = addMark(mask, v)
  return mask
}

export const emptyMarks = () => new Int16Array(81)
