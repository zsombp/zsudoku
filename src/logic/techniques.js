// The technique ladder: the human solving methods, cheapest first.
//
// Every technique is a pure function of the solver state that returns either
// null or a Step describing exactly what it found. That return shape is the
// whole design. The same function both grades a puzzle (Phase 2) and explains
// the next move to the player (Phase 3 hints), so a hint can never disagree
// with the difficulty rating: they come from one place.
//
// A Step is:
//   {
//     technique,                    // key into TECHNIQUES
//     placements: [{cell, digit}],  // digits this proves
//     eliminations: [{cell, digit}],// candidates this rules out
//     cells,                        // the cells forming the pattern
//     digits,                       // the digits involved
//     unit,                         // UNIT_META entry, or null
//     detail,                       // human sentence, for hints
//   }

import { ROWS, COLS, BOXES, UNITS, UNIT_META, PEERS, rowOf, colOf, boxOf, unitName } from './topology.js'
import { hasMark, marksToList, countMarks } from './marks.js'

const step = s => ({ placements: [], eliminations: [], cells: [], digits: [], unit: null, ...s })

// ---- rung 1: naked single ----
// One cell, one candidate left. Nothing else it could be.

function nakedSingle({ board, cands }) {
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0 && countMarks(cands[i]) === 1) {
      const digit = marksToList(cands[i])[0]
      return step({
        technique: 'nakedSingle',
        placements: [{ cell: i, digit }],
        cells: [i],
        digits: [digit],
        detail: `only ${digit} can go here`,
      })
    }
  }
  return null
}

// ---- rung 2: hidden single ----
// A digit has only one home left in its row, column or box.

function hiddenSingle({ board, cands }) {
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u]
    for (let digit = 1; digit <= 9; digit++) {
      let spot = -1
      let n = 0
      for (const i of unit) {
        if (board[i] === 0 && hasMark(cands[i], digit)) {
          n++
          spot = i
          if (n > 1) break
        }
      }
      if (n === 1) {
        return step({
          technique: 'hiddenSingle',
          placements: [{ cell: spot, digit }],
          cells: [spot],
          digits: [digit],
          unit: UNIT_META[u],
          detail: `${digit} has only one place left in ${unitName(UNIT_META[u])}`,
        })
      }
    }
  }
  return null
}

// ---- rung 3: locked candidates ----
// Pointing: inside a box, a digit sits only in one row or column, so it can be
// struck from the rest of that line.
// Claiming: the mirror image. Inside a line, a digit sits only in one box, so
// it can be struck from the rest of that box.

function collect(cells, board, cands, digit) {
  const out = []
  for (const i of cells) if (board[i] === 0 && hasMark(cands[i], digit)) out.push(i)
  return out
}

function eliminationsIn(cells, exclude, board, cands, digit) {
  const out = []
  for (const i of cells) {
    if (exclude.includes(i)) continue
    if (board[i] === 0 && hasMark(cands[i], digit)) out.push({ cell: i, digit })
  }
  return out
}

function pointing({ board, cands }) {
  for (let b = 0; b < 9; b++) {
    const box = BOXES[b]
    for (let digit = 1; digit <= 9; digit++) {
      const cells = collect(box, board, cands, digit)
      if (cells.length < 2) continue

      const rows = new Set(cells.map(rowOf))
      if (rows.size === 1) {
        const r = [...rows][0]
        const elim = eliminationsIn(ROWS[r], cells, board, cands, digit)
        if (elim.length) {
          return step({
            technique: 'pointing',
            eliminations: elim,
            cells,
            digits: [digit],
            unit: UNIT_META[18 + b],
            detail: `in ${unitName(UNIT_META[18 + b])}, ${digit} is confined to row ${r + 1}`,
          })
        }
      }

      const cols = new Set(cells.map(colOf))
      if (cols.size === 1) {
        const c = [...cols][0]
        const elim = eliminationsIn(COLS[c], cells, board, cands, digit)
        if (elim.length) {
          return step({
            technique: 'pointing',
            eliminations: elim,
            cells,
            digits: [digit],
            unit: UNIT_META[18 + b],
            detail: `in ${unitName(UNIT_META[18 + b])}, ${digit} is confined to column ${c + 1}`,
          })
        }
      }
    }
  }
  return null
}

function claiming({ board, cands }) {
  for (let u = 0; u < 18; u++) {
    const line = UNITS[u]
    for (let digit = 1; digit <= 9; digit++) {
      const cells = collect(line, board, cands, digit)
      if (cells.length < 2) continue
      const boxes = new Set(cells.map(boxOf))
      if (boxes.size !== 1) continue
      const b = [...boxes][0]
      const elim = eliminationsIn(BOXES[b], cells, board, cands, digit)
      if (elim.length) {
        return step({
          technique: 'claiming',
          eliminations: elim,
          cells,
          digits: [digit],
          unit: UNIT_META[u],
          detail: `in ${unitName(UNIT_META[u])}, ${digit} only fits inside ${unitName(UNIT_META[18 + b])}`,
        })
      }
    }
  }
  return null
}

// ---- rung 4: naked subsets ----
// k cells in a unit share exactly k candidates between them. Those k digits are
// spoken for, so they leave every other cell in the unit.

function combinations(arr, k) {
  const out = []
  const pick = (start, chosen) => {
    if (chosen.length === k) { out.push([...chosen]); return }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i])
      pick(i + 1, chosen)
      chosen.pop()
    }
  }
  pick(0, [])
  return out
}

const NAKED_NAME = { 2: 'nakedPair', 3: 'nakedTriple', 4: 'nakedQuad' }

function nakedSubset(k) {
  return ({ board, cands }) => {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u]
      const open = unit.filter(i => board[i] === 0 && countMarks(cands[i]) >= 2 && countMarks(cands[i]) <= k)
      if (open.length <= k) continue

      for (const combo of combinations(open, k)) {
        let union = 0
        for (const i of combo) union |= cands[i]
        if (countMarks(union) !== k) continue

        const digits = marksToList(union)
        const elim = []
        for (const i of unit) {
          if (combo.includes(i) || board[i] !== 0) continue
          for (const d of digits) if (hasMark(cands[i], d)) elim.push({ cell: i, digit: d })
        }
        if (!elim.length) continue

        return step({
          technique: NAKED_NAME[k],
          eliminations: elim,
          cells: combo,
          digits,
          unit: UNIT_META[u],
          detail: `${digits.join(', ')} fill those ${k} cells in ${unitName(UNIT_META[u])}, so they cannot go anywhere else in it`,
        })
      }
    }
    return null
  }
}

// ---- rung 5: hidden subsets ----
// k digits in a unit appear in only k cells between them. Those cells belong to
// those digits, so every other candidate leaves the cells.

const HIDDEN_NAME = { 2: 'hiddenPair', 3: 'hiddenTriple' }

function hiddenSubset(k) {
  return ({ board, cands }) => {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u]
      const open = unit.filter(i => board[i] === 0)
      if (open.length <= k) continue

      const homes = {}
      for (let d = 1; d <= 9; d++) {
        const cells = open.filter(i => hasMark(cands[i], d))
        if (cells.length >= 2 && cells.length <= k) homes[d] = cells
      }
      const digits = Object.keys(homes).map(Number)
      if (digits.length < k) continue

      for (const combo of combinations(digits, k)) {
        const cellSet = new Set()
        for (const d of combo) for (const i of homes[d]) cellSet.add(i)
        if (cellSet.size !== k) continue

        let keep = 0
        for (const d of combo) keep |= 1 << (d - 1)

        const elim = []
        for (const i of cellSet) {
          const extra = cands[i] & ~keep
          if (extra) for (const d of marksToList(extra)) elim.push({ cell: i, digit: d })
        }
        if (!elim.length) continue

        return step({
          technique: HIDDEN_NAME[k],
          eliminations: elim,
          cells: [...cellSet],
          digits: combo,
          unit: UNIT_META[u],
          detail: `${combo.join(', ')} only fit in those ${k} cells of ${unitName(UNIT_META[u])}, so nothing else can`,
        })
      }
    }
    return null
  }
}

// ---- rung 6: fish (X-Wing, Swordfish) ----
// A digit is confined to the same N columns across N rows. Those columns are
// then fully accounted for, so the digit leaves them everywhere else. And the
// same argument with rows and columns swapped.

function fish(size, technique) {
  return ({ board, cands }) => {
    for (const orientation of ['row', 'col']) {
      const lines = orientation === 'row' ? ROWS : COLS
      const cross = orientation === 'row' ? COLS : ROWS
      const posOf = orientation === 'row' ? colOf : rowOf

      for (let digit = 1; digit <= 9; digit++) {
        const candidateLines = []
        for (let l = 0; l < 9; l++) {
          const cells = collect(lines[l], board, cands, digit)
          if (cells.length >= 2 && cells.length <= size) candidateLines.push({ l, cells })
        }
        if (candidateLines.length < size) continue

        for (const combo of combinations(candidateLines, size)) {
          const positions = new Set()
          for (const { cells } of combo) for (const i of cells) positions.add(posOf(i))
          if (positions.size !== size) continue

          const inFish = combo.flatMap(({ cells }) => cells)
          const elim = []
          for (const p of positions) {
            for (const { cell, digit: d } of eliminationsIn(cross[p], inFish, board, cands, digit)) {
              elim.push({ cell, digit: d })
            }
          }
          if (!elim.length) continue

          const lineLabel = orientation === 'row' ? 'rows' : 'columns'
          const crossLabel = orientation === 'row' ? 'columns' : 'rows'
          return step({
            technique,
            eliminations: elim,
            cells: inFish,
            digits: [digit],
            detail: `${digit} in ${lineLabel} ${combo.map(c => c.l + 1).join(', ')} is locked to ${crossLabel} ${[...positions].map(p => p + 1).join(', ')}`,
          })
        }
      }
    }
    return null
  }
}

// ---- rung 7: XY-Wing ----
// A pivot holding exactly {x,y} sees two pincers holding {x,z} and {y,z}.
// Whichever way the pivot resolves, one pincer becomes z, so any cell seeing
// both pincers cannot be z.

function xyWing({ board, cands }) {
  const twos = []
  for (let i = 0; i < 81; i++) if (board[i] === 0 && countMarks(cands[i]) === 2) twos.push(i)

  for (const pivot of twos) {
    const [x, y] = marksToList(cands[pivot])
    const wings = twos.filter(i => i !== pivot && PEERS[pivot].includes(i))

    for (const a of wings) {
      const da = marksToList(cands[a])
      if (!da.includes(x) || da.includes(y)) continue
      const z = da.find(d => d !== x)

      for (const b of wings) {
        if (b === a) continue
        const db = marksToList(cands[b])
        if (!db.includes(y) || !db.includes(z)) continue

        const elim = []
        for (let i = 0; i < 81; i++) {
          if (i === a || i === b || i === pivot || board[i] !== 0) continue
          if (!PEERS[a].includes(i) || !PEERS[b].includes(i)) continue
          if (hasMark(cands[i], z)) elim.push({ cell: i, digit: z })
        }
        if (!elim.length) continue

        return step({
          technique: 'xyWing',
          eliminations: elim,
          cells: [pivot, a, b],
          digits: [x, y, z],
          detail: `pivot holds ${x}/${y}, so one of the two wings must be ${z}`,
        })
      }
    }
  }
  return null
}

// ---- the ladder ----
//
// Order is cost order, and the grader always restarts from the top after a
// success.
//
// Costs are first-use / repeat-use, and the gap between them is deliberate and
// large. Difficulty is dominated by the hardest thing you have to *spot*;
// spotting a second X-Wing once you know one is there is much cheaper than
// finding the first. So first-use sets the tier and repeats refine within it.
//
// Naked singles cost nothing at all. This is the correction that matters most.
// An earlier pricing gave them 10 apiece, and because a puzzle has 81 minus
// clues of them, the score ended up measuring how many blank cells the grid had
// rather than how hard it was: a trivial 22-clue puzzle outscored a genuinely
// hard 34-clue one. Writing in a digit that has only one possible value is
// bookkeeping, not deduction, and it is not what makes a sudoku difficult.
// Hidden singles are priced low for the same reason: scanning is the basic
// motion of the game, not a skill that separates tiers.
//
// Bands over the summed score are measured in scripts/calibrate.mjs. Change
// anything here and they have to be re-measured, because it moves the scale.

export const TECHNIQUES = {
  nakedSingle: { label: 'naked single', first: 0, repeat: 0, short: 'only one digit fits', about: 'A cell with one candidate left. Nothing else can go there, so it goes there.', fn: nakedSingle },
  hiddenSingle: { label: 'hidden single', first: 12, repeat: 4, short: 'one home left in a unit', about: 'A digit that can only fit in one cell of a row, column or box, even if that cell has other candidates.', fn: hiddenSingle },
  pointing: { label: 'pointing pair', first: 120, repeat: 40, short: 'a box points along a line', about: 'Inside a box, a digit sits only in one row or column, so it can be struck from the rest of that line.', fn: pointing },
  claiming: { label: 'box-line reduction', first: 130, repeat: 45, short: 'a line claims a box', about: 'The mirror of pointing. Inside a line, a digit sits only in one box, so it leaves the rest of that box.', fn: claiming },
  nakedPair: { label: 'naked pair', first: 150, repeat: 50, short: 'two cells, two digits', about: 'Two cells in a unit share the same two candidates. Those digits are spoken for and leave every other cell in it.', fn: nakedSubset(2) },
  hiddenPair: { label: 'hidden pair', first: 200, repeat: 60, short: 'two digits, two homes', about: 'Two digits fit in only two cells of a unit. Those cells belong to them, so their other candidates go.', fn: hiddenSubset(2) },
  nakedTriple: { label: 'naked triple', first: 260, repeat: 70, short: 'three cells, three digits', about: 'Three cells whose candidates between them are exactly three digits. Not every cell needs all three.', fn: nakedSubset(3) },
  hiddenTriple: { label: 'hidden triple', first: 320, repeat: 90, short: 'three digits, three homes', about: 'Three digits confined to three cells. Everything else in those cells can be removed.', fn: hiddenSubset(3) },
  nakedQuad: { label: 'naked quad', first: 380, repeat: 110, short: 'four cells, four digits', about: 'The same idea one size up, and rare enough that spotting it is mostly knowing it exists.', fn: nakedSubset(4) },
  xWing: { label: 'X-Wing', first: 500, repeat: 120, short: 'a rectangle of two', about: 'A digit confined to the same two columns across two rows. Those columns are then accounted for and it leaves them elsewhere.', fn: fish(2, 'xWing') },
  xyWing: { label: 'XY-Wing', first: 620, repeat: 140, short: 'a pivot and two wings', about: 'A cell holding x/y sees one cell holding x/z and another holding y/z. Either way, one wing becomes z, so z leaves anything seeing both.', fn: xyWing },
  swordfish: { label: 'Swordfish', first: 800, repeat: 180, short: 'a rectangle of three', about: 'An X-Wing one size up: a digit confined to the same three columns across three rows.', fn: fish(3, 'swordfish') },
}

export const LADDER = Object.keys(TECHNIQUES)

/**
 * Bump this whenever a technique, a cost or a tier band changes.
 *
 * Scores are only comparable within one version of the ladder, and puzzles are
 * cached ahead of time with their score and tier baked in. Without a version
 * stamp, a pre-generated puzzle would keep displaying the label it was given by
 * the previous scoring long after that scoring stopped existing, which is
 * exactly the kind of quiet dishonesty this engine is meant to rule out.
 */
export const GRADER_VERSION = 2
