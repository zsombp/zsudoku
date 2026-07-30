// PHASE 0 GRADER. Ported 1:1 from the prototype so the port can be verified
// against known behaviour before anything changes.
//
// This gets replaced in Phase 2 by a full technique ladder with weighted
// scoring. Its known limitation, and the reason for that rebuild: everything
// above naked pairs collapses into level 4, so "Expert" currently means "these
// three techniques ran out". It cannot tell a puzzle needing one clean X-Wing
// apart from a puzzle that can only be finished by guessing, and it labels both
// the same. See docs/PLAN.md Phase 2.

import { UNITS, BOXES, ROWS, COLS, PEERS, candsAt, rowOf, colOf } from './topology.js'

export const LEVEL_UNSOLVABLE = 4

/**
 * Solves with human techniques and returns the hardest tier required.
 * 1 = naked singles, 2 = hidden singles, 3 = pairs and pointing,
 * 4 = anything past that ladder, including puzzles needing a guess.
 */
export function gradePuzzle(puzzle) {
  const b = puzzle.slice()
  const cands = b.map((v, i) => (v ? new Set() : new Set(candsAt(b, i))))
  let level = 1

  const place = (i, v) => {
    b[i] = v
    cands[i] = new Set()
    for (const p of PEERS[i]) cands[p].delete(v)
  }

  let guard = 0
  while (b.includes(0)) {
    if (++guard > 2000) return 4
    let acted = false

    // naked single
    for (let i = 0; i < 81; i++) {
      if (b[i] === 0 && cands[i].size === 1) {
        place(i, [...cands[i]][0])
        acted = true
        break
      }
    }
    if (acted) continue

    // hidden single
    for (const u of UNITS) {
      for (let v = 1; v <= 9; v++) {
        let spot = -1
        let n = 0
        for (const i of u) {
          if (b[i] === 0 && cands[i].has(v)) { n++; spot = i; if (n > 1) break }
        }
        if (n === 1) { place(spot, v); level = Math.max(level, 2); acted = true; break }
      }
      if (acted) break
    }
    if (acted) continue

    // pointing pairs and triples: a box's candidates confined to one row or column
    let removed = 0
    for (const box of BOXES) {
      for (let v = 1; v <= 9; v++) {
        const cells = box.filter(i => b[i] === 0 && cands[i].has(v))
        if (cells.length < 2) continue
        const rs = new Set(cells.map(rowOf))
        const cs = new Set(cells.map(colOf))
        if (rs.size === 1) {
          const r = [...rs][0]
          for (const i of ROWS[r]) if (!box.includes(i) && cands[i].has(v)) { cands[i].delete(v); removed++ }
        }
        if (cs.size === 1) {
          const c = [...cs][0]
          for (const i of COLS[c]) if (!box.includes(i) && cands[i].has(v)) { cands[i].delete(v); removed++ }
        }
      }
    }

    // naked pairs
    for (const u of UNITS) {
      const twos = u.filter(i => b[i] === 0 && cands[i].size === 2)
      for (let a = 0; a < twos.length; a++) {
        for (let c = a + 1; c < twos.length; c++) {
          const A = [...cands[twos[a]]].sort().join('')
          const B = [...cands[twos[c]]].sort().join('')
          if (A === B) {
            for (const i of u) {
              if (i !== twos[a] && i !== twos[c] && b[i] === 0) {
                for (const v of cands[twos[a]]) if (cands[i].has(v)) { cands[i].delete(v); removed++ }
              }
            }
          }
        }
      }
    }

    if (removed > 0) { level = Math.max(level, 3); continue }
    return 4
  }

  return level
}
