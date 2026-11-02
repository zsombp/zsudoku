// Every way it can go.
//
// Every elimination technique on the ladder is the same argument wearing a
// different shape. The pattern is a handful of constraints: these cells must
// each take one of their notes, or this digit must land somewhere in this unit.
// List every way those constraints can be met (a "world"). A note that dies in
// all of them can be removed, and a note that survives in even one cannot.
//
// That is why text explanations of an XY-Wing are hard to follow: the argument
// is a case split, and a paragraph can only walk one case at a time. Here the
// cases are enumerated, so they can be shown side by side, and breaking a
// pattern is nothing more than changing a note and enumerating again.
//
// Nothing is hand-written per technique except which constraints a step rests
// on. A property test walks real solve paths and checks that, for every step,
// every elimination the ladder made dies in every world this file finds. If the
// two ever disagree, one of them is wrong.

import { marksToList, hasMark } from './marks.js'
import { CLASSIC, unitCellsOf } from './topology.js'

/** Past this many worlds a picture stops being readable; no classic step gets near it. */
export const WORLD_LIMIT = 120

/**
 * The constraints a step's argument rests on.
 *
 * A slot is either `{ cell }`, a cell that must take one of its notes, or
 * `{ digit, cells }`, a digit that must land in one of these cells. Cell slots
 * can share a sumGroup: their digits must make its sum, without repeats when
 * distinct is true. Fixed digits stay in the group so subtraction and the
 * no-repeat rule use exactly the same cells as the printed cage.
 */
export function slotsFor(step, topo = CLASSIC) {
  const unit = () => {
    const s = unitCellsOf(topo, step)
    return s ? [...s] : null
  }
  switch (step?.technique) {
    case 'cageCombo':
    case 'cageSum':
    case 'cageSingle':
    case 'cageLocked': {
      const index = topo.cageOf?.[step.cells[0]]
      const cage = topo.cages?.[index]
      return cage ? sumSlots({ ...cage, distinct: true, cageIndex: index }) : null
    }
    case 'sum45': {
      const group = remainderFor(step, topo)
      return group ? sumSlots(group) : null
    }
    case 'nakedSingle':
      return [{ cell: step.cells[0] }]
    case 'hiddenSingle':
    case 'pointing':
    case 'claiming': {
      const cells = unit()
      return cells ? [{ digit: step.digits[0], cells }] : null
    }
    case 'nakedPair':
    case 'nakedTriple':
    case 'nakedQuad':
    case 'xyWing':
      return step.cells.map(cell => ({ cell }))
    case 'hiddenPair':
    case 'hiddenTriple': {
      const cells = unit()
      return cells ? step.digits.map(digit => ({ digit, cells })) : null
    }
    case 'xWing':
    case 'swordfish': {
      if (!step.lines || !step.base) return null
      const lines = step.base === 'row' ? topo.rows : topo.cols
      return step.lines.map(l => ({ digit: step.digits[0], cells: lines[l] }))
    }
    // Two strong links: the digit lands somewhere in each of their lines. The
    // whole line rather than the two link cells, so that a flaw adding a third
    // home actually adds an option; on the real position only the two cells
    // hold the digit, so the worlds are the same.
    case 'skyscraper': {
      if (!step.lines || !step.base) return null
      const lines = step.base === 'row' ? topo.rows : topo.cols
      return step.lines.map(l => ({ digit: step.digits[0], cells: lines[l] }))
    }
    case 'twoStringKite':
      return step.lines
        ? [
            { digit: step.digits[0], cells: topo.rows[step.lines[0]] },
            { digit: step.digits[0], cells: topo.cols[step.lines[1]] },
          ]
        : null
    // Two x/y cells, and the strong link on x that bridges them.
    case 'wWing': {
      const bridge = unit()
      return step.wings && bridge
        ? [{ cell: step.wings[0] }, { cell: step.wings[1] }, { digit: step.digits[0], cells: bridge }]
        : null
    }
    case 'xyzWing':
      return step.cells.map(cell => ({ cell }))
    default:
      return null
  }
}

export const sumSlots = group => group.cells.map(cell => ({ cell, sumGroup: group }))

/** Read the 45 equation from the topology, never from the answer on the step. */
export function remainderFor(step, topo) {
  const unit = [...(unitCellsOf(topo, step) || [])]
  if (!topo.cages || unit.length !== 9 || unit.some(c => topo.cageOf[c] < 0)) return null
  const inside = new Set(unit)
  const touching = [...new Set(unit.map(c => topo.cageOf[c]))]
  const innie = inside.has(step.cells[0])
  const indices = innie
    ? touching.filter(i => topo.cages[i].cells.every(c => inside.has(c)))
    : touching
  const covered = new Set(indices.flatMap(i => topo.cages[i].cells))
  const total = indices.reduce((n, i) => n + topo.cages[i].sum, 0)
  return {
    cells: innie ? unit.filter(c => !covered.has(c)) : [...covered].filter(c => !inside.has(c)),
    sum: innie ? 45 - total : total - 45,
    // Spillover cells need not see each other and can repeat across cages.
    distinct: innie,
    innie,
    total,
    cageIndices: indices,
  }
}

/** What each slot could be, read off the candidates every time. */
export function optionsOf(slots, board, cands) {
  return slots.map(s =>
    s.cell != null
      ? (board[s.cell] ? [board[s.cell]] : marksToList(cands[s.cell])).map(d => [s.cell, d])
      : s.cells.filter(c => board[c] === 0 && hasMark(cands[c], s.digit)).map(c => [c, s.digit])
  )
}

/** The cells a pattern is made of, as the slots see it right now. */
export function patternCellsOf(slots, board, cands) {
  return [...new Set(optionsOf(slots, board, cands).flat().map(([c]) => c))]
}

function seer(topo) {
  const sets = []
  return (a, b) => a !== b && (sets[a] ||= new Set(topo.peers[a])).has(b)
}

/**
 * Every assignment of the slots that breaks no rule among themselves.
 *
 * Two slots may land on the same placement (a cell slot and a unit slot naming
 * the same digit in the same cell), which is one placement, not a clash. Two
 * different digits in one cell clash, and so does one digit twice in cells that
 * see each other.
 */
export function worldsOf(slots, board, cands, topo = CLASSIC, { limit = WORLD_LIMIT } = {}) {
  const sees = seer(topo)
  const opts = optionsOf(slots, board, cands)
  const groups = [...new Set(slots.map(s => s.sumGroup).filter(Boolean))]
  const cellOptions = new Map(slots.flatMap((s, i) => s.cell != null ? [[s.cell, opts[i].map(([, d]) => d)]] : []))
  const out = []
  const seen = new Set()
  const place = new Map()
  let truncated = false

  // Reject an impossible partial total before visiting its permutations. The
  // bounds can be loose, but never exclude a way of making the sum.
  const sumsFit = () => groups.every(g => {
    let sum = 0, low = 0, high = 0
    const used = new Set()
    for (const c of g.cells) {
      if (!place.has(c)) continue
      const d = place.get(c)
      if (g.distinct && used.has(d)) return false
      used.add(d)
      sum += d
    }
    for (const c of g.cells) {
      if (place.has(c)) continue
      const ds = (cellOptions.get(c) || []).filter(d => !g.distinct || !used.has(d))
      if (!ds.length) return false
      low += Math.min(...ds)
      high += Math.max(...ds)
    }
    return sum + low <= g.sum && sum + high >= g.sum
  })

  const fits = (c, d) => {
    if (place.has(c)) return place.get(c) === d
    for (const [x, v] of place) if (v === d && sees(x, c)) return false
    return true
  }
  const rec = i => {
    if (truncated || !sumsFit()) return
    if (i === opts.length) {
      const key = [...place].sort((a, b) => a[0] - b[0]).map(p => p.join(':')).join(',')
      if (!seen.has(key)) {
        if (out.length >= limit) { truncated = true; return }
        seen.add(key)
        out.push(new Map(place))
      }
      return
    }
    for (const [c, d] of opts[i]) {
      if (!fits(c, d)) continue
      const fresh = !place.has(c)
      if (fresh) place.set(c, d)
      rec(i + 1)
      if (fresh) place.delete(c)
    }
  }
  rec(0)
  return { worlds: out, truncated }
}

/**
 * Does the note `digit` in `cell` survive this world?
 *
 * It dies when the cell is already taken by another digit, or when it sees the
 * same digit placed. `from` names the cells it sees, for drawing the line.
 */
export function judge(world, cell, digit, topo = CLASSIC) {
  if (world.has(cell)) {
    const v = world.get(cell)
    return v === digit ? { dies: false, how: 'is', from: [] } : { dies: true, how: 'taken', by: v, from: [] }
  }
  const peers = topo.peers[cell]
  const from = []
  for (const [x, v] of world) if (v === digit && peers.includes(x)) from.push(x)
  return from.length ? { dies: true, how: 'sees', from } : { dies: false, how: 'free', from: [] }
}

/**
 * The whole argument for one step: its worlds, and what dies in all of them.
 *
 * `targets` defaults to the step's own eliminations, which is what the property
 * test holds this to. A lesson can pass the same targets with a flaw applied to
 * the candidates and watch a world open up where they live.
 */
export function argue(step, board, cands, topo = CLASSIC, { targets, slots } = {}) {
  const s = slots || slotsFor(step, topo)
  if (!s) return null
  const tg = targets || (step.eliminations || []).map(e => [e.cell, e.digit])
  const { worlds, truncated } = worldsOf(s, board, cands, topo)
  const per = worlds.map(w => tg.map(([c, d]) => ({ c, d, ...judge(w, c, d, topo) })))
  const dead = tg.filter((_, i) => worlds.length > 0 && per.every(row => row[i].dies))
  const survivorWorlds = per.map((row, i) => (row.some(x => !x.dies) ? i : -1)).filter(i => i >= 0)
  return {
    slots: s,
    worlds,
    truncated,
    targets: tg,
    per,
    dead,
    survivorWorlds,
    intact: worlds.length > 0 && dead.length === tg.length,
  }
}
