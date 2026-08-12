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
//     unit,                         // topo.unitMeta entry, or null
//     detail,                       // human sentence, for hints
//   }

import { CLASSIC, rowOf, colOf, unitName } from './topology.js'
import { hasMark, marksToList, countMarks } from './marks.js'
import { combosFor } from './killer.js'

const step = s => ({ placements: [], eliminations: [], cells: [], digits: [], unit: null, ...s })

// ---- rung 1: naked single ----
// One cell, one candidate left. Nothing else it could be.

function nakedSingle(state) {
  const { board, cands, topo = CLASSIC } = state
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

function hiddenSingle(state) {
  const { board, cands, topo = CLASSIC } = state
  for (let u = 0; u < topo.units.length; u++) {
    const unit = topo.units[u]
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
          unit: topo.unitMeta[u],
          detail: `${digit} has only one place left in ${unitName(topo.unitMeta[u])}`,
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

function pointing(state) {
  const { board, cands, topo = CLASSIC } = state
  // Every region, not nine: Windoku has thirteen.
  for (let b = 0; b < topo.regions.length; b++) {
    const box = topo.regions[b]
    for (let digit = 1; digit <= 9; digit++) {
      const cells = collect(box, board, cands, digit)
      if (cells.length < 2) continue

      const rows = new Set(cells.map(rowOf))
      if (rows.size === 1) {
        const r = [...rows][0]
        const elim = eliminationsIn(topo.rows[r], cells, board, cands, digit)
        if (elim.length) {
          return step({
            technique: 'pointing',
            eliminations: elim,
            cells,
            digits: [digit],
            unit: topo.unitMeta[topo.regionStart + b],
            detail: `in ${unitName(topo.unitMeta[topo.regionStart + b])}, ${digit} is confined to row ${r + 1}`,
          })
        }
      }

      const cols = new Set(cells.map(colOf))
      if (cols.size === 1) {
        const c = [...cols][0]
        const elim = eliminationsIn(topo.cols[c], cells, board, cands, digit)
        if (elim.length) {
          return step({
            technique: 'pointing',
            eliminations: elim,
            cells,
            digits: [digit],
            unit: topo.unitMeta[topo.regionStart + b],
            detail: `in ${unitName(topo.unitMeta[topo.regionStart + b])}, ${digit} is confined to column ${c + 1}`,
          })
        }
      }
    }
  }
  return null
}

function claiming(state) {
  const { board, cands, topo = CLASSIC } = state
  // Rows and columns only. A region claiming inside a region is not this
  // technique, and the regions always begin at `regionStart`.
  for (let u = 0; u < topo.regionStart; u++) {
    const line = topo.units[u]
    for (let digit = 1; digit <= 9; digit++) {
      const cells = collect(line, board, cands, digit)
      if (cells.length < 2) continue
      const boxes = new Set(cells.map(c => topo.regionOf[c]))
      if (boxes.size !== 1) continue
      const b = [...boxes][0]
      const elim = eliminationsIn(topo.regions[b], cells, board, cands, digit)
      if (elim.length) {
        return step({
          technique: 'claiming',
          eliminations: elim,
          cells,
          digits: [digit],
          unit: topo.unitMeta[u],
          detail: `in ${unitName(topo.unitMeta[u])}, ${digit} only fits inside ${unitName(topo.unitMeta[topo.regionStart + b])}`,
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
  return state => {
    const { board, cands, topo = CLASSIC } = state
    for (let u = 0; u < topo.units.length; u++) {
      const unit = topo.units[u]
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
          unit: topo.unitMeta[u],
          detail: `${digits.join(', ')} fill those ${k} cells in ${unitName(topo.unitMeta[u])}, so they cannot go anywhere else in it`,
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
  return state => {
    const { board, cands, topo = CLASSIC } = state
    for (let u = 0; u < topo.units.length; u++) {
      const unit = topo.units[u]
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
          unit: topo.unitMeta[u],
          detail: `${combo.join(', ')} only fit in those ${k} cells of ${unitName(topo.unitMeta[u])}, so nothing else can`,
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
  return state => {
    const { board, cands, topo = CLASSIC } = state
    for (const orientation of ['row', 'col']) {
      const lines = orientation === 'row' ? topo.rows : topo.cols
      const cross = orientation === 'row' ? topo.cols : topo.rows
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

function xyWing(state) {
  const { board, cands, topo = CLASSIC } = state
  const twos = []
  for (let i = 0; i < 81; i++) if (board[i] === 0 && countMarks(cands[i]) === 2) twos.push(i)

  for (const pivot of twos) {
    const [x, y] = marksToList(cands[pivot])
    const wings = twos.filter(i => i !== pivot && topo.peers[pivot].includes(i))

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
          if (!topo.peers[a].includes(i) || !topo.peers[b].includes(i)) continue
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

// ---- rungs 8 to 12: arithmetic, for killer ----
//
// The first constraint in this app that is not a set of nine cells holding nine
// digits. A cage is a group of cells with a target sum and no repeat, so it says
// things no amount of reasoning about units and peers can reach, and DECISIONS
// records that as the reason killer waited while the four topology variants
// shipped.
//
// The cages ride on the topology rather than on the solver state, which is what
// makes this cost nothing anywhere else. `createState` already carries `topo`
// through, so the grader, the hint engine, `explain.js`, the socratic questions,
// the move classifier and belief archaeology all reach a killer board with no
// change at all. Every function below returns null the moment it finds no cages,
// so a classic grid pays one property read per rung and its score cannot move:
// verified by grading 168 puzzles across five variants before and after, all
// identical.
//
// Nothing here re-derives what killer.js already knows. `combosFor` is the table
// of every set of n distinct digits summing to s, built once at import.

/**
 * What is left to say about one cage: which digits could still go in it, which
 * must, and how many ways there are to finish it.
 *
 * The three filters are the whole of cage deduction and each is plain logic. A
 * way of making the sum dies if the cage already holds a digit it does not use,
 * if some empty cell of the cage can take none of its digits, or if one of its
 * digits has nowhere left in the cage to go. The same three live in
 * `narrowCage` in killer.js, which is the uniqueness checker rather than the
 * ladder; they are stated twice because the two answer different questions,
 * one "how many solutions" and one "what is the next human step".
 *
 * Returns null for a cage with nothing left open, and for a dead one. A dead
 * cage means the board is already wrong, and a technique's job is to find the
 * next move rather than to diagnose that.
 */
function cageView(state, cage) {
  const { board, cands } = state
  let held = 0
  let need = cage.sum
  const empty = []
  for (const i of cage.cells) {
    if (board[i]) {
      held |= 1 << (board[i] - 1)
      need -= board[i]
    } else empty.push(i)
  }
  if (!empty.length) return null

  const live = []
  let union = 0
  let required = 0b111111111
  for (const mask of combosFor(empty.length, need)) {
    if (mask & held) continue
    let covered = 0
    let ok = true
    for (const i of empty) {
      const fits = cands[i] & mask
      if (!fits) {
        ok = false
        break
      }
      covered |= fits
    }
    if (!ok || covered !== mask) continue
    live.push(mask)
    union |= mask
    required &= mask
  }
  if (!live.length) return null
  return { cage, empty, held, need, live, union, required }
}

/** Cages that still have something to say, cheapest question first. */
function eachCage(state) {
  const cages = state.topo?.cages
  if (!cages) return null
  const out = []
  for (const cage of cages) {
    const view = cageView(state, cage)
    if (view) out.push(view)
  }
  return out
}

/** Strike everything the cage cannot hold out of its own empty cells. */
function trimToCage(view, cands, keep) {
  const elim = []
  for (const i of view.empty) {
    const extra = cands[i] & ~keep
    if (extra) for (const d of marksToList(extra)) elim.push({ cell: i, digit: d })
  }
  return elim
}

// ---- rung 8: one way to make the sum ----
// The first thing anyone learns about killer: 17 in two cells is 8 and 9, and
// 7 in three is 1, 2 and 4. Read off a table rather than worked out, which is
// why it is priced barely above a hidden single.

function cageCombo(state) {
  const views = eachCage(state)
  if (!views) return null
  for (const view of views) {
    if (view.live.length !== 1) continue
    const digits = marksToList(view.live[0])
    const elim = trimToCage(view, state.cands, view.live[0])
    if (!elim.length) continue

    const { cage } = view
    return step({
      technique: 'cageCombo',
      eliminations: elim,
      cells: cage.cells,
      digits,
      detail: view.empty.length === cage.cells.length
        ? `${cage.cells.length} cells adding to ${cage.sum} can only hold ${digits.join(', ')}`
        : `the rest of the ${cage.sum} cage can only be ${digits.join(', ')}`,
    })
  }
  return null
}

// ---- rung 9: a digit with one home in its cage ----
// A hidden single over a group that is not a unit. The digit appears in every
// surviving way of making the sum, so it is somewhere in the cage, and only one
// cell of the cage will take it.

function cageSingle(state) {
  const views = eachCage(state)
  if (!views) return null
  for (const view of views) {
    let required = view.required
    while (required) {
      const digit = marksToList(required)[0]
      required &= ~(1 << (digit - 1))

      let spot = -1
      let homes = 0
      for (const i of view.empty) {
        if (hasMark(state.cands[i], digit)) {
          homes++
          spot = i
          if (homes > 1) break
        }
      }
      if (homes !== 1) continue

      return step({
        technique: 'cageSingle',
        placements: [{ cell: spot, digit }],
        cells: view.cage.cells,
        digits: [digit],
        detail: `every way of making ${view.cage.sum} here uses ${digit}, and only one cell of the cage can take it`,
      })
    }
  }
  return null
}

// ---- rung 10: the sum rules digits out, with several ways left ----
// The general form of rung 8, and much more work to see: you have to list every
// surviving way of making the total and take what they have in common. 5 in two
// cells is 1+4 or 2+3, so the cage holds nothing above 4 either way.

function cageSum(state) {
  const views = eachCage(state)
  if (!views) return null
  for (const view of views) {
    if (view.live.length < 2) continue
    const elim = trimToCage(view, state.cands, view.union)
    if (!elim.length) continue

    return step({
      technique: 'cageSum',
      eliminations: elim,
      cells: view.cage.cells,
      digits: marksToList(view.union),
      detail: `every way of making ${view.cage.sum} in this cage uses only ${marksToList(view.union).join(', ')}`,
    })
  }
  return null
}

// ---- rung 11: the 45 rule ----
//
// A unit holds one to nine, so it totals 45. Cages that sit wholly inside it
// account for part of that and the remainder is the rest of the unit; cages
// that spill out of it overshoot 45 by exactly what they hold outside. Either
// way, when one cell is the only unknown, arithmetic names it.
//
// Innies and outies are one technique rather than two on purpose. They are the
// same equation read from opposite ends, and a player who can do one can do the
// other; splitting them would put two prices on one idea.
//
// Deliberately one unit at a time. Running the same argument across a band of
// three rows is stronger and is how a hard killer is really cracked, and it is
// a search over subsets of units rather than a scan. Measured: single-unit 45 is
// enough for the generator to finish every puzzle it ships, so the wider version
// buys nothing yet and would cost a rung nobody could price honestly.

function sum45(state) {
  const { board, cands, topo } = state
  const cages = topo?.cages
  if (!cages) return null
  const owner = topo.cageOf

  for (let u = 0; u < topo.units.length; u++) {
    const unit = topo.units[u]
    // Only a group of nine distinct digits totals 45. Every unit this app builds
    // is one, and the guard is here so a future topology carrying a shorter
    // extra unit cannot silently make this technique unsound.
    if (unit.length !== 9) continue
    const inUnit = new Set(unit)
    const touching = new Set()
    // A cell in no cage makes every total below meaningless. It cannot happen
    // on a board this app ships, since `topologyFromRecord` checks the list it
    // was handed, but the arithmetic would go wrong silently rather than throw.
    let caged = true
    for (const i of unit) {
      if (owner[i] < 0) {
        caged = false
        break
      }
      touching.add(owner[i])
    }
    if (!caged) continue

    // Innie: what the cages wholly inside do not cover has to make up the rest.
    let inside = 0
    const covered = new Set()
    for (const c of touching) {
      if (!cages[c].cells.every(i => inUnit.has(i))) continue
      inside += cages[c].sum
      for (const i of cages[c].cells) covered.add(i)
    }
    if (covered.size) {
      let known = 0
      const open = []
      for (const i of unit) {
        if (covered.has(i)) continue
        if (board[i]) known += board[i]
        else open.push(i)
      }
      const digit = 45 - inside - known
      if (open.length === 1 && digit >= 1 && digit <= 9 && hasMark(cands[open[0]], digit)) {
        return step({
          technique: 'sum45',
          placements: [{ cell: open[0], digit }],
          cells: [open[0]],
          digits: [digit],
          unit: topo.unitMeta[u],
          detail: `${unitName(topo.unitMeta[u])} totals 45, and everything else in it accounts for ${45 - digit}`,
        })
      }
    }

    // Outie: every cage touching the unit covers it exactly once and then some,
    // so their total overshoots 45 by whatever they hold outside it.
    let total = 0
    let knownOut = 0
    const openOut = []
    for (const c of touching) {
      total += cages[c].sum
      for (const i of cages[c].cells) {
        if (inUnit.has(i)) continue
        if (board[i]) knownOut += board[i]
        else openOut.push(i)
      }
    }
    const digit = total - 45 - knownOut
    if (openOut.length === 1 && digit >= 1 && digit <= 9 && hasMark(cands[openOut[0]], digit)) {
      return step({
        technique: 'sum45',
        placements: [{ cell: openOut[0], digit }],
        cells: [openOut[0]],
        digits: [digit],
        unit: topo.unitMeta[u],
        detail: `the cages covering ${unitName(topo.unitMeta[u])} total ${total}, which is ${total - 45} more than its 45`,
      })
    }
  }
  return null
}

// ---- rung 12: a cage pointing into a unit ----
//
// The cage-and-unit interaction, and the exact analogue of pointing: a digit
// that must appear somewhere in the cage, whose remaining homes in that cage all
// sit inside one row, column or region, is spoken for there and leaves the rest
// of that unit.
//
// The other direction needs nothing new. A cage lying wholly inside a unit whose
// digits are pinned down is a naked subset of that unit, so `cageCombo` narrows
// the cells and `nakedPair` and friends do the rest. Writing a second rung for
// it would price one deduction twice.

function cageLocked(state) {
  const views = eachCage(state)
  if (!views) return null
  const { board, cands, topo } = state

  for (const view of views) {
    let required = view.required
    while (required) {
      const digit = marksToList(required)[0]
      required &= ~(1 << (digit - 1))

      const homes = view.empty.filter(i => hasMark(cands[i], digit))
      // One home is a placement and `cageSingle` is cheaper, so leave it alone.
      if (homes.length < 2) continue

      for (let u = 0; u < topo.units.length; u++) {
        const unit = topo.units[u]
        if (!homes.every(i => unit.includes(i))) continue
        const elim = eliminationsIn(unit, homes, board, cands, digit)
        if (!elim.length) continue

        return step({
          technique: 'cageLocked',
          eliminations: elim,
          cells: homes,
          digits: [digit],
          unit: topo.unitMeta[u],
          detail: `${digit} has to be in this cage, and every place left for it sits in ${unitName(topo.unitMeta[u])}`,
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
  cageCombo: { label: 'cage combination', first: 15, repeat: 4, cages: true, short: 'one way to make the sum', about: 'A killer cage whose total can be made in only one way. Seventeen across two cells is 8 and 9, and there is nothing to work out.', fn: cageCombo },
  cageSum: { label: 'cage sum', first: 25, repeat: 6, cages: true, short: 'what no total can use', about: 'List every way of making a cage total and keep what they have in common. Five across two cells is 1+4 or 2+3, so nothing above 4 belongs in it.', fn: cageSum },
  cageSingle: { label: 'cage single', first: 60, repeat: 20, cages: true, short: 'one home left in a cage', about: 'A digit used by every way of making a cage total, with only one cell of the cage able to take it. A hidden single over a group that is not a unit.', fn: cageSingle },
  pointing: { label: 'pointing pair', first: 120, repeat: 40, short: 'a box points along a line', about: 'Inside a box, a digit sits only in one row or column, so it can be struck from the rest of that line.', fn: pointing },
  claiming: { label: 'box-line reduction', first: 130, repeat: 45, short: 'a line claims a box', about: 'The mirror of pointing. Inside a line, a digit sits only in one box, so it leaves the rest of that box.', fn: claiming },
  sum45: { label: 'the 45 rule', first: 140, repeat: 45, cages: true, short: 'a unit adds to 45', about: 'A row, column or box holds one to nine, so it totals 45. Add up the cages over it and whatever is left over names the one cell they do not settle.', fn: sum45 },
  nakedPair: { label: 'naked pair', first: 150, repeat: 50, short: 'two cells, two digits', about: 'Two cells in a unit share the same two candidates. Those digits are spoken for and leave every other cell in it.', fn: nakedSubset(2) },
  cageLocked: { label: 'cage lock', first: 170, repeat: 55, cages: true, short: 'a cage points into a unit', about: 'A digit every total of a cage needs, whose remaining homes in that cage all sit in one row, column or box. It is spoken for there, so it leaves the rest of that unit.', fn: cageLocked },
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
 * Rungs that can only fire on a board carrying cages.
 *
 * Read by generation rather than inferred there: asking for a practice puzzle
 * built around a cage technique on a classic grid is impossible, and thirty
 * seconds of searching before saying so is a worse answer than saying so at
 * once.
 */
export const CAGE_TECHNIQUES = LADDER.filter(k => TECHNIQUES[k].cages)

/**
 * Bump this whenever a technique, a cost or a tier band changes.
 *
 * Scores are only comparable within one version of the ladder, and puzzles are
 * cached ahead of time with their score and tier baked in. Without a version
 * stamp, a pre-generated puzzle would keep displaying the label it was given by
 * the previous scoring long after that scoring stopped existing, which is
 * exactly the kind of quiet dishonesty this engine is meant to rule out.
 *
 * Bumped to 3 when the five arithmetic rungs landed. The classic scale did not
 * move and was measured rather than assumed: 168 puzzles at fixed seeds across
 * classic, jigsaw, X, Windoku and anti-knight came back with identical boards,
 * scores, tiers and technique counts before and after. It has to be bumped
 * anyway, because a stamp that only moves when a number changes is a stamp
 * nobody can trust when one does.
 */
export const GRADER_VERSION = 3
