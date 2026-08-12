// Killer sudoku: the first variant that is not a topology.
//
// Every variant so far was different units and different peers, and the twelve
// techniques handled all of them without a line of change because they reason
// about sets of cells rather than about arithmetic on three. A cage is not that.
// It is a set of cells with a target SUM and no repeated digit, which is a
// constraint the ladder has no vocabulary for. DECISIONS.md records that as the
// reason killer was deferred while jigsaw, X, Windoku and anti-knight shipped.
//
// This file is the engine only. Five pieces, in the order they depend on each
// other: the digit combinations behind a sum, the cage model, a layout built
// over a finished grid, a search that understands cages, and the repair that
// turns a sound layout into a puzzle with one answer.
//
// What it is not is a technique. Nothing here grades a killer puzzle or hints
// at one, and the ladder in techniques.js still knows nothing about arithmetic.
// `cagePossible` and `cageRequired` are the two questions a cage technique
// would be built out of, and they are exported for that reason.
//
// Nothing here renders and nothing here picks a variant. A cage is a constraint
// on top of a topology rather than instead of one, so every entry point takes a
// topology and killer-X, killer-Windoku and killer-anti-knight all work today.

import { CLASSIC, range, rowOf, colOf } from './topology.js'
import { mulberry32, shuffle } from '../lib/prng.js'
import { countMarks } from './marks.js'

const ALL = 0b111111111
const bit = d => 1 << (d - 1)

// ---- what digits can make a sum ----

/**
 * Every set of n distinct digits summing to s, as 9-bit masks.
 *
 * COMBOS[n][s] is the whole answer, and the whole table is 511 entries because
 * there are exactly 511 non-empty subsets of one to nine. Building it eagerly
 * costs 0.05ms and is done once at import, which is cheaper than the branch
 * that would check on every call whether it had been built yet.
 *
 * The widest bucket is twelve, at four cells and at five. That is the number
 * that decides how much a sum tells you: a two-cell cage has at most four ways
 * to fill it, a five-cell cage twelve.
 */
const COMBOS = buildCombos()

function buildCombos() {
  const table = range(10).map(() => range(46).map(() => []))
  for (let mask = 1; mask <= ALL; mask++) {
    let n = 0
    let sum = 0
    for (let d = 1; d <= 9; d++) {
      if (mask & bit(d)) {
        n++
        sum += d
      }
    }
    table[n][sum].push(mask)
  }
  return table
}

const NONE = Object.freeze([])

/**
 * The combinations for a cage of n cells summing to s, ignoring the board.
 *
 * Hands out the shared bucket rather than a copy, so treat it as read-only: a
 * caller that sorted or spliced one would change what every later puzzle in the
 * session believes a sum can be made of. Freezing the table says that in a way
 * the language can enforce and was measured and dropped, because the same
 * arrays are the search's innermost loop and it cost 5 to 8% on p90 and worst
 * case. `cageCombos` returns a fresh array and is the one to reach for if you
 * want to keep it.
 */
export function combosFor(n, sum) {
  if (n < 1 || n > 9 || sum < 1 || sum > 45) return NONE
  return COMBOS[n][sum]
}

/**
 * What a cage of n cells summing to s can still hold, given the digits still
 * `allowed` to it, which for a partly filled cage is everything it does not
 * already hold.
 *
 * Answers both questions at once, packed into one integer so a call allocates
 * nothing: possible digits in bits 0..8, digits present in every surviving
 * combination in bits 9..17.
 *
 * ---- there is no second cache here, and that was measured ----
 *
 * The table above is the cache, built once. A memo on top of it, keyed on the
 * three arguments, is the obvious next move because this is asked constantly,
 * and it is slower. Over 400,000 asks with about thirteen repeats per key:
 *
 *   recomputed every time   0.033us
 *   Map keyed on the three  0.046us
 *   flat Int32Array, 2MB    0.046us
 *
 * The answer is at most twelve masks and two bitwise operations each, which is
 * cheaper than hashing a key or indexing half a megaword to avoid it. The flat
 * table also carried a bug worth remembering, since it is what a future attempt
 * would rebuild: the key packed the sum into six bits, so a nonsense cage of
 * one cell summing 70 landed on the key for one cell summing 6 and answered it
 * "dead" for the life of the process. Nothing threw. Puzzles with a 6 in a
 * one-cell cage simply stopped having solutions.
 */
function cageInfo(n, sum, allowed) {
  if (n < 1 || n > 9 || sum < minSum(n) || sum > maxSum(n)) return 0
  let possible = 0
  let required = ALL
  for (const mask of COMBOS[n][sum]) {
    if (mask & ~allowed) continue
    possible |= mask
    required &= mask
  }
  return possible === 0 ? 0 : possible | (required << 9)
}

/** Digits that could still go in some cell of this cage. Zero means dead. */
export const cagePossible = (n, sum, allowed = ALL) => cageInfo(n, sum, allowed & ALL) & ALL

/** Digits that appear in every surviving combination, so must be in the cage. */
export const cageRequired = (n, sum, allowed = ALL) => (cageInfo(n, sum, allowed & ALL) >> 9) & ALL

/** The surviving combinations themselves, for anything that wants to list them. */
export const cageCombos = (n, sum, allowed = ALL) =>
  combosFor(n, sum).filter(mask => !(mask & ~allowed))

/** Smallest and largest sum n distinct digits can reach. */
export const minSum = n => (n * (n + 1)) / 2
export const maxSum = n => (n * (19 - n)) / 2

// ---- the cage model ----
//
// A cage is { cells, sum }: a connected group of cells that must add to `sum`
// and may not repeat a digit. Cages partition all 81 cells, so every cell is in
// exactly one, and `cells` is in reading order so `cells[0]` is the top-left
// cell, which is where the sum gets printed.

/** cell -> index of the cage holding it. Cages partition the grid, so no -1. */
export function cageOf(cages) {
  const owner = new Int8Array(81).fill(-1)
  cages.forEach((cage, c) => cage.cells.forEach(cell => { owner[cell] = c }))
  return owner
}

/** A cage for these cells, with the sum read off a finished grid. */
const cageFrom = (cells, solution) => {
  const sorted = [...cells].sort((a, b) => a - b)
  return { cells: sorted, sum: sorted.reduce((t, i) => t + solution[i], 0) }
}

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

/** A cage has to be one shape on the board, or its outline is a lie. */
export function cellsConnected(cells) {
  if (!cells.length) return false
  const set = new Set(cells)
  const seen = new Set([cells[0]])
  const queue = [cells[0]]
  while (queue.length) {
    for (const n of orthogonal(queue.pop())) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return seen.size === cells.length
}

// Cage sizes, cumulative, and the cap is measured rather than chosen for looks.
//
// Hand-set killers run to five cells and the first version did too. On the same
// forty grids, stopping at four takes the whole build-and-repair from a mean of
// 651ms and a worst case of 7694ms down to 13ms and 129ms. The reason is that a
// sum says less the more cells it covers: a two-cell cage has at most four ways
// to fill it and a five-cell cage twelve, so a grid of five-cell cages is a
// grid that barely constrains anything, and both the uniqueness check and the
// number of repairs it needs blow up together.
//
// Five is still reachable by passing `sizes`. It costs sixty times the tail.
const SIZE_WEIGHTS = [
  [2, 0.45],
  [3, 0.80],
  [4, 1.00],
]

const pickSize = (rng, weights) => {
  const r = rng()
  for (const [size, upTo] of weights) if (r < upTo) return size
  return weights[weights.length - 1][0]
}

/**
 * Cages over an already solved grid, each sum read off the solution.
 *
 * Read the `jigsawLayout` comment in variants.js before changing this. It
 * records three ways of building a constraint structure first and searching for
 * something to satisfy it second, all of which failed, and the ordering that
 * worked: build the shapes and the digits together so validity is preserved at
 * every step and no search is ever needed.
 *
 * Killer gets that for free in a way jigsaw could not, and the reason is worth
 * stating because it looks like the same problem. A jigsaw region must be
 * exactly nine cells, so a growth that runs out of legal neighbours has to
 * backtrack or strand a cell. A cage has no required size, so the same dead end
 * is simply a smaller cage. Growing against the finished grid, and refusing any
 * cell whose digit the cage already holds, cannot fail.
 *
 * Doing it the other way round does fail, and quietly. Growing the same shapes
 * while ignoring the digits put a repeated digit in 57 of 915 cages across 30
 * grids, and left 26 of those 30 layouts holding at least one. Nothing throws:
 * the sums are still right and the grid is still a sudoku solution, so what
 * ships is a puzzle whose stated rules its own answer breaks.
 *
 * Takes 0.03ms at the median over 60 grids and 0.39ms at the worst, which is
 * why nothing downstream has to think about how often it asks for one.
 */
export function cageLayout(seed, solution, { sizes = SIZE_WEIGHTS, allowSingles = false } = {}) {
  // One knob, not two. Absorbing a stray cell into a full-size cage would
  // otherwise quietly produce a cage a size larger than anything asked for.
  const maxSize = sizes[sizes.length - 1][0]
  const rng = mulberry32(seed)
  const owner = new Int8Array(81).fill(-1)
  const groups = []

  for (const start of shuffle(range(81), rng)) {
    if (owner[start] !== -1) continue
    const id = groups.length
    const cells = [start]
    owner[start] = id
    let held = bit(solution[start])
    const target = pickSize(rng, sizes)

    while (cells.length < target) {
      const open = []
      for (const cell of cells) {
        for (const n of orthogonal(cell)) {
          // The digit test is the whole soundness argument: a cage that never
          // takes a digit it already holds is a cage the solution satisfies.
          if (owner[n] === -1 && !(held & bit(solution[n])) && !open.includes(n)) open.push(n)
        }
      }
      if (!open.length) break
      const next = open[Math.floor(rng() * open.length)]
      owner[next] = id
      held |= bit(solution[next])
      cells.push(next)
    }
    groups.push(cells)
  }

  if (!allowSingles) absorbSingles(groups, owner, solution, maxSize, rng)

  const cages = groups.filter(cells => cells.length).map(cells => cageFrom(cells, solution))
  // Reading order, so cells[0] is the top-left cell of every cage. That is
  // where a renderer has to print the sum, and sorting here means it never has
  // to work it out.
  cages.sort((a, b) => a.cells[0] - b.cells[0])
  return { cages }
}

/**
 * Fold one-cell cages into a neighbour where one will take them.
 *
 * A single is legal killer and is also a free digit written on the board, so a
 * layout full of them is a layout of givens wearing cage outlines. Growth
 * leaves them whenever a cell is surrounded before its turn comes up, and that
 * is not rare: 18.9% of cages before this runs, 0.7% after.
 */
function absorbSingles(groups, owner, solution, maxSize, rng) {
  for (const id of shuffle(range(groups.length), rng)) {
    const cells = groups[id]
    if (cells.length !== 1) continue
    const cell = cells[0]

    const options = []
    for (const n of orthogonal(cell)) {
      const other = owner[n]
      if (other === id || other === -1) continue
      const into = groups[other]
      if (into.length >= maxSize || !into.length) continue
      if (into.some(c => solution[c] === solution[cell])) continue
      if (!options.includes(other)) options.push(other)
    }
    if (!options.length) continue

    // Smallest neighbour first, so absorbing does not build one long cage.
    options.sort((a, b) => groups[a].length - groups[b].length)
    const into = options[0]
    groups[into].push(cell)
    owner[cell] = into
    groups[id] = []
  }
}

// ---- solving with cages ----
//
// A killer puzzle usually has no given digits at all, so every cell starts on
// nine candidates and all the pruning has to come from the cages. That makes
// the search a different animal from the classic one in solver.js, and the
// numbers below are why this file has its own rather than passing a topology.
//
// Measured over 20 layouts, empty board, counting to two solutions:
//
//   plain candidates, reading-order tie-break   p50 104ms   p50 19578 nodes
//   plain candidates, tightest cage first       p50 104ms   p50 18106 nodes
//   live combinations per cage                  p50 4.2ms   p50   444 nodes
//   live combinations plus a perfect matching   p50 18.1ms  p50   274 nodes
//
// So the combinations are worth twenty-five times the node count, and the
// matching check is not: it is strictly stronger, cuts nodes by a further 38%,
// and costs four times the wall clock to do it. Rejected on the measurement.

/**
 * The state the search carries: board, candidates, and per cage how many cells
 * are empty, how much sum is left, which digits it holds, and which of its
 * combinations are still alive.
 *
 * Cloned on every branch rather than undone on the way back up. Propagation
 * touches most of it, so a trail would be bigger than the state, which is 81
 * bytes of board plus 162 of candidates plus six bytes a cage.
 */
function searchState(bd, cages, owner, combos, topo) {
  const st = {
    board: Int8Array.from(bd),
    cands: new Int16Array(81),
    left: Int8Array.from(cages, c => c.cells.length),
    need: Int16Array.from(cages, c => c.sum),
    held: new Int16Array(cages.length),
    live: Int16Array.from(cages, (_, c) => (1 << combos[c].length) - 1),
    // Counts digits written, so the fixpoint below can tell that something
    // happened. Narrowing a cage can place a digit without any combination
    // dying, and watching only the combinations lets the loop stop early with
    // work still to do.
    moves: 0,
    owner,
    cages,
    combos,
    topo,
  }
  for (let i = 0; i < 81; i++) {
    if (!st.board[i]) {
      st.cands[i] = topo.candMaskAt(st.board, i)
      continue
    }
    // A board that is already broken has no solutions, and it has to be said
    // here rather than left to fall out of the search. It usually does fall
    // out, because a duplicate strands some other digit in the same unit, but
    // usually is not a contract: a board with two 5s in a row cannot be
    // completed and the honest count is zero, not "whatever the search happens
    // to reach". Found by disagreeing with a brute-force count on four boards
    // out of thirty that had had one digit moved.
    const c = owner[i]
    st.left[c]--
    st.need[c] -= st.board[i]
    if (st.held[c] & bit(st.board[i])) return null
    st.held[c] |= bit(st.board[i])
    for (const p of topo.peers[i]) if (st.board[p] === st.board[i]) return null
  }
  return st
}

const cloneState = st => ({
  ...st,
  board: st.board.slice(),
  cands: st.cands.slice(),
  left: st.left.slice(),
  need: st.need.slice(),
  held: st.held.slice(),
  live: st.live.slice(),
})

/**
 * Write a digit and tell everything that cares.
 *
 * The cage half of this is not optional and is easy to miss: two cells of one
 * cage are often not peers, because a cage crosses rows, columns and boxes
 * freely, so nothing in the ordinary peer sweep stops a cage holding the same
 * digit twice.
 */
function placeInto(st, i, d) {
  st.board[i] = d
  st.cands[i] = 0
  st.moves++
  const c = st.owner[i]
  st.left[c]--
  st.need[c] -= d
  st.held[c] |= bit(d)
  if (st.need[c] < 0) return false
  if (st.left[c] === 0 && st.need[c] !== 0) return false

  for (const p of st.topo.peers[i]) {
    if (st.board[p]) continue
    if (st.cands[p] & bit(d)) {
      st.cands[p] &= ~bit(d)
      if (st.cands[p] === 0) return false
    }
  }
  for (const p of st.cages[c].cells) {
    if (p === i || st.board[p]) continue
    if (st.cands[p] & bit(d)) {
      st.cands[p] &= ~bit(d)
      if (st.cands[p] === 0) return false
    }
  }
  return true
}

/**
 * Narrow one cage: kill the combinations that cannot happen, then push what is
 * left back onto the cells.
 *
 * A combination dies for one of three reasons, all of them just deduction:
 * the cage already holds a digit the combination does not contain, some empty
 * cell in the cage can take none of its remaining digits, or one of those
 * digits has nowhere in the cage left to go.
 */
function narrowCage(st, c) {
  const cells = st.cages[c].cells
  const empty = []
  for (const i of cells) if (!st.board[i]) empty.push(i)
  if (!empty.length) return st.need[c] === 0

  const list = st.combos[c]
  let live = st.live[c]
  let union = 0
  let required = ALL
  for (let k = 0; k < list.length; k++) {
    if (!(live & (1 << k))) continue
    const combo = list[k]
    if (st.held[c] & ~combo) {
      live &= ~(1 << k)
      continue
    }
    const rest = combo & ~st.held[c]
    let covered = 0
    let ok = true
    for (const i of empty) {
      const fits = st.cands[i] & rest
      if (!fits) {
        ok = false
        break
      }
      covered |= fits
    }
    if (!ok || covered !== rest) {
      live &= ~(1 << k)
      continue
    }
    union |= rest
    required &= rest
  }
  st.live[c] = live
  if (!live) return false

  for (const i of empty) {
    const m = st.cands[i] & union
    if (!m) return false
    st.cands[i] = m
  }

  // A digit in every surviving combination has to be somewhere in the cage.
  // That is a hidden single over a set which is not a unit, and it is the rung
  // the ordinary ladder has no way to express.
  while (required) {
    const d = lowestDigit(required)
    required &= ~bit(d)
    let spot = -1
    let n = 0
    for (const i of empty) {
      if (st.cands[i] & bit(d)) {
        n++
        spot = i
        if (n > 1) break
      }
    }
    if (n === 0) return false
    if (n === 1 && !placeInto(st, spot, d)) return false
  }
  return true
}

/** Propagate cages, lone candidates and hidden singles to a fixpoint. */
function propagate(st) {
  const { topo } = st
  let changed = true
  while (changed) {
    changed = false
    const moves = st.moves

    for (let c = 0; c < st.cages.length; c++) {
      const before = st.live[c]
      if (!narrowCage(st, c)) return false
      if (st.live[c] !== before) changed = true
    }

    for (let i = 0; i < 81; i++) {
      if (st.board[i]) continue
      if (!st.cands[i]) return false
      if (countMarks(st.cands[i]) === 1) {
        if (!placeInto(st, i, lowestDigit(st.cands[i]))) return false
        changed = true
      }
    }

    for (let u = 0; u < topo.units.length; u++) {
      const unit = topo.units[u]
      for (let d = 1; d <= 9; d++) {
        let spot = -1
        let n = 0
        let already = false
        for (const i of unit) {
          if (st.board[i] === d) {
            already = true
            break
          }
          if (!st.board[i] && st.cands[i] & bit(d)) {
            n++
            spot = i
            if (n > 1) break
          }
        }
        if (already) continue
        if (n === 0) return false
        if (n === 1) {
          if (!placeInto(st, spot, d)) return false
          changed = true
        }
      }
    }

    if (st.moves !== moves) changed = true
  }
  return true
}

const lowestDigit = mask => 32 - Math.clz32(mask & -mask)

/**
 * How many ways this board can be completed under sudoku and these cages, up
 * to `limit`. Passing 2 answers "unique?" without exploring the whole space,
 * the same contract `countSolutions` in solver.js has.
 *
 * Branches on the cell with fewest candidates, ties going to the cell whose
 * cage has fewest empty cells left. Reading order as the tie-break is what the
 * classic solver uses and it is much worse here: p50 is the same but the mean
 * is 5474ms against 689ms, because a cage crosses the grid and a contradiction
 * planted top-left is not found until the search reaches the far side of it.
 * Same shape of mistake as filling a jigsaw in reading order, recorded in
 * generator.js.
 */
export function killerSolutions(bd, cages, limit = 2, topo = CLASSIC) {
  const owner = cageOf(cages)
  // Refused rather than answered. A cage list that has lost a cell on its way
  // through a saved game would otherwise reach `narrowCage` as cage number -1
  // and come back as a type error from four calls down, and the two other
  // options are both worse: reporting no solutions for a puzzle that has one,
  // or quietly solving a different puzzle than the one that was asked about.
  // `cageProblems` is the way to ask this question without an exception.
  for (let i = 0; i < 81; i++) {
    if (owner[i] < 0) throw new Error(`killer: cell ${i} is in no cage`)
  }
  const combos = cages.map(c => combosFor(c.cells.length, c.sum))
  const root = searchState(bd, cages, owner, combos, topo)
  const found = []
  if (!root) return found

  const step = st => {
    if (!propagate(st)) return
    let best = -1
    let bestN = 10
    let bestLeft = 99
    for (let i = 0; i < 81; i++) {
      if (st.board[i]) continue
      const n = countMarks(st.cands[i])
      const l = st.left[st.owner[i]]
      if (n < bestN || (n === bestN && l < bestLeft)) {
        best = i
        bestN = n
        bestLeft = l
      }
    }
    if (best === -1) {
      found.push(Array.from(st.board))
      return
    }
    let mask = st.cands[best]
    while (mask) {
      const d = lowestDigit(mask)
      mask &= ~bit(d)
      const next = cloneState(st)
      if (placeInto(next, best, d)) step(next)
      if (found.length >= limit) return
    }
  }

  step(root)
  return found
}

/** Same contract as `countSolutions` in solver.js, cages included. */
export const countKillerSolutions = (bd, cages, limit = 2, topo = CLASSIC) =>
  killerSolutions(bd, cages, limit, topo).length

/** The question a puzzle has to answer to be a puzzle. */
export const hasUniqueKillerSolution = (bd, cages, topo = CLASSIC) =>
  countKillerSolutions(bd, cages, 2, topo) === 1

// ---- from a sound layout to an actual puzzle ----

/**
 * Every way to cut `cells` in two along its own shape, with `cell` on one side
 * and both halves still connected.
 *
 * There is always at least one for a cage of two or more: drop a leaf of any
 * spanning tree that is not `cell` itself, and the leaf and the remainder are
 * both connected. So the repair below can never run out of moves.
 */
function splitsAround(cells, cell) {
  const rest = cells.filter(c => c !== cell)
  const out = []
  for (let m = 0; m < 1 << rest.length; m++) {
    const a = [cell]
    for (let j = 0; j < rest.length; j++) if (m & (1 << j)) a.push(rest[j])
    if (a.length === cells.length) continue
    const b = rest.filter(c => !a.includes(c))
    if (cellsConnected(a) && cellsConnected(b)) out.push([a, b])
  }
  return out
}

/**
 * A cage layout the given solution is the only answer to.
 *
 * A sound layout is not yet a puzzle: measured over 40 grids, a raw layout has
 * exactly one solution 1 time in 40 with cages up to five cells, 6 in 40 up to
 * four, 11 in 40 up to three and 14 in 40 with nothing but pairs. So something
 * has to close the gap, and there are two ways to do it.
 *
 * Throwing the layout away and drawing another is the obvious one and it is the
 * worse one, measured over 25 grids: 18.4 attempts and 2443ms on average, and
 * one grid in 25 never got there inside sixty tries.
 *
 * Splitting instead takes 3.0 splits and 13ms on average over 60 grids, p50
 * 5ms, p90 46ms, worst 129ms, and it converged on all sixty. It is also the
 * only one of the two that must terminate: a split raises the cage count by
 * one, and a layout of eighty-one one-cell cages is the whole solution written
 * out, which is unique by inspection.
 *
 * It works because a second solution says exactly where the ambiguity is. The
 * cells the two answers disagree about are the only cells worth touching, and
 * cutting the largest cage among them in half is the cheapest way to say more
 * about that spot without saying it outright.
 *
 * Halves rather than peeling one cell off, which is the same speed and needs
 * marginally fewer splits at 2.7 against 3.0, but leaves 2.7 one-cell cages
 * behind against 2.2. A one-cell cage is a given digit wearing an outline, so
 * the difference is the only thing worth deciding on.
 *
 * What it does not do is put the layout back the way it was. Growth works hard
 * to get one-cell cages down to 0.7%, and repair puts 2.2 of them back on an
 * average board. That is the price of a unique answer, and it is paid in the
 * open rather than by loosening what "unique" means.
 */
export function uniqueCageLayout(seed, solution, opts = {}) {
  let { cages } = cageLayout(seed, solution, opts)
  const empty = new Array(81).fill(0)
  const topo = opts.topo ?? CLASSIC
  let splits = 0

  // 81 is the ceiling by construction, not a guess: every pass adds a cage.
  for (let round = 0; round < 81; round++) {
    const found = killerSolutions(empty, cages, 2, topo)
    if (found.length === 1) return { cages, splits, rounds: round }
    if (found.length === 0) return null

    const other = found.find(s => s.some((v, i) => v !== solution[i]))
    if (!other) return null

    // The largest cage holding a disputed cell. Largest because it is the one
    // saying least, so it has the most room to say more.
    let target = -1
    let widest = 0
    for (let i = 0; i < 81; i++) {
      if (other[i] === solution[i]) continue
      const cage = cages.find(c => c.cells.includes(i))
      if (cage.cells.length > widest) {
        widest = cage.cells.length
        target = i
      }
    }
    // A one-cell cage fixes its digit, so no disputed cell can be inside one
    // and this cannot be reached. Guarded rather than asserted, because an
    // unsound cage list handed in from outside could get here.
    if (target === -1 || widest < 2) return null

    const index = cages.findIndex(c => c.cells.includes(target))
    const cells = cages[index].cells
    const options = splitsAround(cells, target)
    if (!options.length) return null
    const half = cells.length / 2
    options.sort((p, q) => Math.abs(p[0].length - half) - Math.abs(q[0].length - half))

    cages = [
      ...cages.slice(0, index),
      ...cages.slice(index + 1),
      ...options[0].map(part => cageFrom(part, solution)),
    ].sort((a, b) => a.cells[0] - b.cells[0])
    splits++
  }
  return null
}

/**
 * Everything that has to be true of a cage list, checked rather than assumed.
 *
 * Worth having as shipped code rather than only in tests: a saved or synced
 * game rebuilds its cages from a record, and a cage list that has lost a cell
 * in transit produces a board that looks completely normal and is unsolvable.
 * Returns the problems it found, empty meaning sound.
 */
export function cageProblems(cages, solution = null) {
  const bad = []
  const owner = new Int8Array(81).fill(-1)
  for (let c = 0; c < cages.length; c++) {
    const { cells, sum } = cages[c]
    if (!cells.length) bad.push(`cage ${c} is empty`)
    for (const cell of cells) {
      if (cell < 0 || cell > 80) bad.push(`cage ${c} holds cell ${cell}`)
      else if (owner[cell] !== -1) bad.push(`cell ${cell} is in cages ${owner[cell]} and ${c}`)
      else owner[cell] = c
    }
    if (cells.length && !cellsConnected(cells)) bad.push(`cage ${c} is in more than one piece`)
    if (sum < minSum(cells.length) || sum > maxSum(cells.length)) {
      bad.push(`cage ${c} of ${cells.length} cannot sum to ${sum}`)
    }
    if (solution) {
      const digits = cells.map(i => solution[i])
      if (new Set(digits).size !== digits.length) bad.push(`cage ${c} repeats a digit`)
      if (digits.reduce((t, d) => t + d, 0) !== sum) bad.push(`cage ${c} does not add up`)
    }
  }
  for (let i = 0; i < 81; i++) if (owner[i] === -1) bad.push(`cell ${i} is in no cage`)
  return bad
}
