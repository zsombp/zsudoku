// Lessons: one pattern, on one real position, taught as every way it can go.
//
// A written explanation of an XY-Wing walks one case at a time and asks you to
// hold the others in your head, which is exactly the part that does not stick.
// `worlds.js` turns every elimination on the ladder into the same argument: list
// each way the pattern's cells can be filled, and a note that dies in all of
// them can go. This file wraps that argument in a short walk through it: what
// to look at first, the question the pattern answers, every world side by side,
// what dies, and then a flaw you can switch on to watch the argument fail.
//
// Nothing here draws or animates. A lesson is data: the position, the notes to
// show, the steps and their copy, and the flaws. The component renders it and
// asks `analyse` for the worlds of whichever flaw is switched on.
//
// The position is always a real one. A lesson is built from the step the ladder
// actually took, on the candidates it took it in: the hint you just asked for,
// the moment a game review says stopped you, a flashcard, or one of the stock
// examples in lessonBank.json, which were picked out of real solves too. Before
// a lesson is handed out it is checked against its own argument: if the worlds
// do not kill every elimination, or a flaw fails to open a world, it is not
// shown. A lesson that teaches a broken argument is worse than none.

import { argue, slotsFor, patternCellsOf, sumSlots } from './worlds.js'
import { TECHNIQUES } from './techniques.js'
import { CLASSIC, unitName, unitCellsOf, rowOf, colOf } from './topology.js'
import { hasMark, addMark, removeMark, marksToList, countMarks } from './marks.js'
import { cellName as nm } from './explain.js'

import { TEACHABLE, canTeach } from './teachable.js'

export { TEACHABLE, canTeach }

// ---- words ----

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
const join = (xs, word) =>
  xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`
const and = xs => join(xs, 'and')
const or = xs => join(xs, 'or')
const cells = cs => and(cs.map(nm))
const sorted = xs => [...xs].sort((a, b) => a - b)

/** "in both worlds", said the way a person would say it. */
export const inAll = n => (n === 1 ? 'in the only world' : n === 2 ? 'in both worlds' : `in all ${n} worlds`)

/** The notes that can still be placed in a world, grouped the way you would say them. */
export function survivorPhrase(row) {
  const byCell = new Map()
  for (const x of row) if (!x.dies) byCell.set(x.c, [...(byCell.get(x.c) || []), x.d])
  const groups = new Map()
  for (const [c, ds] of byCell) {
    const k = or(sorted(ds))
    groups.set(k, [...(groups.get(k) || []), nm(c)])
  }
  return [...groups].map(([ds, cs]) => `${and(cs)} can still be ${ds}`).join('. ')
}

// ---- the argument, for whichever flaw is switched on ----

/** The candidates with a flaw applied. A flaw adds notes, removes them, or both. */
export function withFlaw(cands, flaw) {
  const out = Int16Array.from(cands)
  if (!flaw) return out
  for (const [c, d] of flaw.add || []) out[c] = addMark(out[c], d)
  for (const [c, d] of flaw.remove || []) out[c] = removeMark(out[c], d)
  return out
}

/** Every world of the lesson, and what dies in all of them, with a flaw or without. */
export function analyse(lesson, flaw = null, targets = lesson.targets) {
  const cands = withFlaw(lesson.cands, flaw)
  const slots = flaw?.sum != null
    ? sumSlots({ ...lesson.slots[0].sumGroup, sum: flaw.sum })
    : lesson.slots
  const a = argue(null, lesson.board, cands, lesson.topo, { slots, targets })
  return { ...a, cands }
}

/**
 * Could this note honestly have been there? The cell is empty, does not already
 * hold it, and no digit it sees rules it out. A flaw has to be a position you
 * could actually meet, or breaking the pattern teaches nothing about real ones.
 */
function plausible({ board, cands, topo }, cell, digit) {
  if (board[cell] !== 0 || hasMark(cands[cell], digit)) return false
  for (const p of topo.peers[cell]) if (board[p] === digit) return false
  return true
}

/**
 * Where a flaw could go, most believable first. Late in a solve a cell with two
 * notes usually has every other digit sitting in a peer, so a strictly
 * plausible third note often does not exist. The flaw is a what-if either way,
 * and the break step says so; plausible ones just come first.
 */
function ranked(base, options) {
  const open = options.filter(([c, d]) => base.board[c] === 0 && !hasMark(base.cands[c], d))
  return [...open.filter(([c, d]) => plausible(base, c, d)), ...open.filter(([c, d]) => !plausible(base, c, d))]
}

const unitBand = (meta, unitCells) =>
  meta?.type === 'row'
    ? { rows: [meta.index], cols: [], cells: [] }
    : meta?.type === 'col'
      ? { rows: [], cols: [meta.index], cells: [] }
      : { rows: [], cols: [], cells: unitCells }

const NO_BAND = { rows: [], cols: [], cells: [] }
const mergeBands = (...bands) => ({
  rows: bands.flatMap(b => b.rows),
  cols: bands.flatMap(b => b.cols),
  cells: bands.flatMap(b => b.cells),
})

const slotNotes = 'slotNotes'
const allTargets = 'targets'

// ---- one builder per family ----

/**
 * Hidden single. Not a case split at all, so no worlds and no flaw: the skill
 * is the scan. Pick a digit, pick a unit, and check every empty cell for a copy
 * of the digit it can see. The step that draws a line from each blocker to the
 * cell it blocks is the whole lesson.
 */
function single(base, step) {
  const { topo, board, cands } = base
  const cell = step.cells[0]
  const d = step.digits[0]
  const meta = step.unit
  const unitCells = [...(unitCellsOf(topo, step) || [])]
  const uname = unitName(meta)
  const others = unitCells.filter(c => c !== cell && board[c] === 0)
  const blocks = []
  const lost = []
  for (const c of others) {
    const by = topo.peers[c].find(p => board[p] === d)
    if (by == null) lost.push(c)
    else blocks.push({ from: by, to: c })
  }
  const rest = marksToList(cands[cell]).filter(x => x !== d)
  const band = unitBand(meta, unitCells)
  return {
    ...base,
    kicker: TECHNIQUES.hiddenSingle.label,
    lens: d,
    // Only the unit's notes: the scan is over one unit, and a copy of the digit
    // somewhere else on the board is noise until it blocks a cell in it.
    focus: new Set(unitCells),
    band,
    targets: rest.map(x => [cell, x]),
    placement: { cell, digit: d },
    steps: [
      {
        title: `${cap(uname)} needs a ${d}`,
        text: `This board shows only the ${d}s. ${cap(uname)} has ${NUM[others.length + 1]} empty ${others.length ? 'cells' : 'cell'}. Which of them can still take a ${d}?`,
        hi: { band, pat: [cell, ...others], what: true },
      },
      {
        title: others.length ? 'Every other cell is blocked' : 'Only one cell is empty',
        text: others.length
          ? `Each of the others already sees a ${d}. Follow the lines.` +
            (lost.length ? ` ${cells(lost)} lost ${lost.length === 1 ? 'its' : 'their'} ${d} to an earlier pattern.` : '') +
            ` That leaves ${nm(cell)}.`
          : `${nm(cell)} is the only gap left, so it is the only place for the ${d}.`,
        hi: { band, pat: [cell], lit: [[cell, d]], blocks },
      },
      {
        mode: 'apply',
        title: `So ${nm(cell)} is the ${d}`,
        text: `Nothing else in ${uname} can take the ${d}, so it goes in ${nm(cell)}.`,
        payoff: rest.length
          ? `It hides because ${nm(cell)} still showed ${and(rest)} as well. A hidden single is found by asking where a digit can go, not what a cell can be.`
          : null,
      },
    ],
    caption: () => `The ${d} goes in ${nm(cell)}.`,
    worldKill: `${nm(cell)} is full, so its other notes are out.`,
    intactLine: () => `There is only one place for the ${d}, so ${nm(cell)} is a ${d}.`,
  }
}

/** Pointing and claiming: one digit confined to where two units overlap. */
function locked(base, step) {
  const { topo } = base
  const d = step.digits[0]
  const src = step.cells
  const pointing = step.technique === 'pointing'
  const boxIdx = topo.regionOf[src[0]]
  const boxMeta = topo.unitMeta[topo.regionStart + boxIdx]
  const boxCells = topo.regions[boxIdx]
  const sameRow = src.every(c => rowOf(c) === rowOf(src[0]))
  const lineMeta = pointing
    ? sameRow
      ? { type: 'row', index: rowOf(src[0]) }
      : { type: 'col', index: colOf(src[0]) }
    : step.unit
  const lineCells = lineMeta.type === 'row' ? topo.rows[lineMeta.index] : topo.cols[lineMeta.index]
  // From is the unit the digit is confined in, to is where it gets removed.
  const [fromMeta, fromCells, toMeta, toCells] = pointing
    ? [boxMeta, boxCells, lineMeta, lineCells]
    : [lineMeta, lineCells, boxMeta, boxCells]
  const F = unitName(fromMeta)
  const T = unitName(toMeta)
  const fromBand = unitBand(fromMeta, fromCells)
  const toBand = unitBand(toMeta, toCells)
  const toSet = new Set(toCells)

  const flaws = ranked(base, fromCells.filter(c => !toSet.has(c)).map(c => [c, d])).map(([c]) => ({
    id: 'escape',
    label: `${cap(F)} also has a ${d} at ${nm(c)}, ${pointing ? 'off' : 'outside'} ${T}`,
    add: [[c, d]],
  }))

  return {
    ...base,
    kicker: TECHNIQUES[step.technique].label,
    lens: d,
    // The two units the argument is about, and nothing else.
    focus: new Set([...fromCells, ...toCells]),
    band: mergeBands(fromBand, toBand),
    targets: step.eliminations.map(e => [e.cell, e.digit]),
    flaws,
    steps: [
      {
        title: `Where can the ${d} go in ${F}?`,
        text: `This board shows only the ${d}s. ${cap(F)} needs one, and every ${d} left in it sits ${pointing ? 'in' : 'inside'} ${T}.`,
        hi: { band: fromBand, lit: slotNotes },
      },
      {
        title: `It is ${T}'s ${d} as well`,
        text: `Whichever cell it is, the ${d} of ${F} is also the ${d} of ${T}, and ${T} holds only one. What about the other ${d}s in ${T}?`,
        askText: `Whichever cell it is, the ${d} of ${F} is also the ${d} of ${T}, and ${T} holds only one. Which cells in ${T} lose their ${d}? Tap them.`,
        hi: { band: mergeBands(fromBand, toBand), pat: 'slots', lit: slotNotes, probe: allTargets },
      },
      {
        mode: 'worlds',
        title: 'Every way it can go',
        text: `Each world puts the ${d} in a different cell of ${F}. Step through them and watch ${T}.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `In every world the ${d} of ${T} is inside ${F}, so the ${d}s in ${T} outside it go.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: `Give ${F} a ${d} outside ${T} and see what opens up.`,
      },
    ],
    caption: w => `The ${d} of ${F} is in ${nm([...w.keys()][0])}.`,
    worldKill: `${cap(T)} has its ${d}, so the other ${d}s in it are out.`,
    intactLine: n => `The ${d} of ${T} comes from ${F} ${inAll(n)}. The other ${d}s in ${T} go.`,
  }
}

/** Naked pair, triple and quad: k cells holding k digits between them. */
function naked(base, step) {
  const { topo, cands } = base
  const S = sorted(step.cells)
  const D = sorted(step.digits)
  const k = S.length
  const meta = step.unit
  const unitCells = [...(unitCellsOf(topo, step) || [])]
  const U = unitName(meta)
  const band = unitBand(meta, unitCells)
  const partial = S.some(c => countMarks(cands[c]) < k)

  const flaws = ranked(
    base,
    S.flatMap(c => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(e => !D.includes(e)).map(e => [c, e]))
  ).map(([c, e]) => ({ id: 'outsider', label: `${nm(c)} could also be ${e}`, add: [[c, e]] }))

  return {
    ...base,
    kicker: TECHNIQUES[step.technique].label,
    lens: null,
    focus: new Set(unitCells),
    band,
    targets: step.eliminations.map(e => [e.cell, e.digit]),
    flaws,
    steps: [
      {
        title: `${cap(NUM[k])} cells, ${NUM[k]} digits`,
        text:
          `${cells(S)} hold only ${and(D)} between them.` +
          (partial ? ` Not every cell needs all ${NUM[k]}: what counts is that the set never grows past ${k}.` : ''),
        hi: { band, pat: S, lit: slotNotes },
      },
      {
        title: 'They share them out',
        text: `Each of these cells needs a digit, and only ${NUM[k]} are on offer. So ${and(D)} ${k === 2 ? 'both' : 'all'} land in these cells. What about the other ${or(D)} notes in ${U}?`,
        askText: `Each of these cells needs a digit, and only ${NUM[k]} are on offer. So ${and(D)} ${k === 2 ? 'both' : 'all'} land in these cells. Which other cells in ${U} lose a note? Tap them.`,
        hi: { band, pat: S, lit: slotNotes, probe: allTargets },
      },
      {
        mode: 'worlds',
        title: 'Every way it can go',
        text: `Each world shares ${and(D)} out between the ${NUM[k]} cells a different way. Step through them.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `In every world ${and(D)} are used up inside these cells, so every other ${or(D)} in ${U} goes.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: 'Give one of the cells a note outside the set and see what opens up.',
      },
    ],
    caption: w => `Here ${and(S.map(s => `${nm(s)} is ${w.get(s)}`))}.`,
    worldKill: `${cap(and(D))} are all inside these cells, so they are out of the rest of ${U}.`,
    intactLine: n => `${cap(and(D))} stay inside these cells ${inAll(n)}. They go from the rest of ${U}.`,
  }
}

/** Hidden pair and triple: k digits with only k homes in a unit. */
function hidden(base, step) {
  const { topo, board, cands } = base
  const D = sorted(step.digits)
  const S = sorted(step.cells)
  const k = D.length
  const meta = step.unit
  const unitCells = [...(unitCellsOf(topo, step) || [])]
  const U = unitName(meta)
  const band = unitBand(meta, unitCells)
  const homes = d => unitCells.filter(c => board[c] === 0 && hasMark(cands[c], d))
  const targets = step.eliminations.map(e => [e.cell, e.digit])
  const others = sorted([...new Set(targets.map(([, d]) => d))])

  const inS = new Set(S)
  const flaws = ranked(
    base,
    D.flatMap(d => unitCells.filter(c => !inS.has(c)).map(c => [c, d]))
  ).map(([c, d]) => ({ id: 'escape', label: `A ${d} also fits in ${nm(c)}`, add: [[c, d]] }))

  const scan = D.map((d, i) => {
    const h = homes(d)
    const lit = D.slice(0, i + 1).flatMap(x => homes(x).map(c => [c, x]))
    const same = i > 0 && h.length === homes(D[i - 1]).length && h.every(c => homes(D[i - 1]).includes(c))
    return {
      title: i === 0 ? `Where can the ${d} go?` : `And the ${d}?`,
      text:
        i === 0
          ? `${cap(U)} still needs a ${d}. Only ${cells(h)} ${h.length === 1 ? 'has' : 'have'} one in ${h.length === 1 ? 'its' : 'their'} notes.`
          : same
            ? `The same ${NUM[h.length]} cells, and nowhere else in ${U}.`
            : `Only ${cells(h)}.`,
      hi: { band, lit },
    }
  })

  return {
    ...base,
    kicker: TECHNIQUES[step.technique].label,
    lens: null,
    focus: new Set(unitCells),
    band,
    targets,
    flaws,
    steps: [
      ...scan,
      {
        title: `${cap(NUM[k])} digits, ${NUM[k]} cells`,
        text: `${cap(and(D))} each have to land in one of ${cells(S)}, so those cells belong to them. What happens to their other notes?`,
        askText: `${cap(and(D))} each have to land in one of ${cells(S)}, so those cells belong to them. Which digits leave those cells? Pick them.`,
        hi: { band, pat: S, lit: slotNotes, probe: allTargets },
      },
      {
        mode: 'worlds',
        title: 'Every way it can go',
        text: `Each world places ${and(D)} a different way. Step through them and watch ${cells(S)}.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `In every world ${cells(S)} are taken by ${and(D)}. Their other notes can never be placed, so they go.`,
        payoff: `What is left is a naked ${k === 2 ? 'pair' : 'triple'} you can see: ${and(D)}, in ${NUM[k]} cells.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: 'Give one of the digits a home outside these cells and see what happens.',
      },
    ],
    caption: w => {
      const at = d => [...w].find(([, v]) => v === d)?.[0]
      return `Here ${and(D.filter(d => at(d) != null).map(d => `the ${d} is in ${nm(at(d))}`))}.`
    },
    worldKill: `${k === 2 ? 'Both' : `All ${NUM[k]}`} cells are taken, so their other notes are out.`,
    intactLine: n => `These cells are full ${inAll(n)}. ${cap(and(others))} can never go there.`,
  }
}

/** X-Wing and Swordfish: one digit, lines that share their columns. */
function fishLesson(base, step) {
  const { topo, board, cands } = base
  const d = step.digits[0]
  const byRow = step.base === 'row'
  const L = byRow ? 'row' : 'column'
  const X = byRow ? 'column' : 'row'
  const lines = [...step.lines].sort((a, b) => a - b)
  const cover = step.cover
  const lineCells = l => (byRow ? topo.rows[l] : topo.cols[l])
  const crossOf = c => (byRow ? colOf(c) : rowOf(c))
  const lineOf = c => (byRow ? rowOf(c) : colOf(c))
  const homes = l => lineCells(l).filter(c => board[c] === 0 && hasMark(cands[c], d))
  const lineBand = ls => (byRow ? { rows: ls, cols: [], cells: [] } : { rows: [], cols: ls, cells: [] })
  const crossBand = xs => (byRow ? { rows: [], cols: xs, cells: [] } : { rows: xs, cols: [], cells: [] })
  const lineNames = `${L}s ${and(lines.map(l => l + 1))}`
  const coverNames = `${X}s ${and(cover.map(x => x + 1))}`
  const size = lines.length
  const targets = step.eliminations.map(e => [e.cell, e.digit])
  const inPattern = new Set(lines.flatMap(homes))
  const isTarget = new Set(targets.map(([c]) => c))
  const coverSet = new Set(cover)
  const lineSet = new Set(lines)

  // Notes of the same digit that sit outside both sets of lines. They look like
  // they should go and do not, which is the half of the pattern that is easy to
  // over-apply.
  const controls = []
  for (let c = 0; c < 81 && controls.length < 2; c++) {
    if (board[c] !== 0 || !hasMark(cands[c], d) || inPattern.has(c) || isTarget.has(c)) continue
    if (coverSet.has(crossOf(c)) || lineSet.has(lineOf(c))) continue
    controls.push([c, d])
  }

  const outside = l => lineCells(l).filter(c => !coverSet.has(crossOf(c))).map(c => [c, d])
  const flaws = [
    ...ranked(base, lines.flatMap(outside)).map(([c]) => ({
      id: 'escape',
      label: `${cap(L)} ${lineOf(c) + 1} also has a ${d} at ${nm(c)}`,
      add: [[c, d]],
    })),
    ...[...lines].reverse().flatMap(l => {
      const h = homes(l)
      if (h.length !== 2) return []
      return ranked(base, outside(l)).map(([c]) => ({
        id: 'skew',
        label: `${cap(L)} ${l + 1} has its ${d} in ${X} ${crossOf(c) + 1}, not ${crossOf(h[1]) + 1}`,
        add: [[c, d]],
        remove: [[h[1], d]],
      }))
    }),
  ]

  const first = lines[0]
  return {
    ...base,
    kicker: TECHNIQUES[step.technique].label,
    lens: d,
    focus: null,
    band: crossBand(cover),
    targets,
    controls,
    controlsLine: list =>
      `The ${d}s in ${cells(list.map(([c]) => c))} stay. They are outside the ${size === 2 ? 'two' : 'three'} ${X}s.`,
    flaws,
    steps: [
      {
        title: 'One digit at a time',
        text: `This board shows only the ${d}s. In ${L} ${first + 1} a ${d} fits in just ${cells(homes(first))}.`,
        hi: { band: lineBand([first]), lit: homes(first).map(c => [c, d]) },
      },
      size === 2
        ? {
            title: `${cap(L)} ${lines[1] + 1} matches`,
            text: `${cap(L)} ${lines[1] + 1} is the same: its ${d} can only go in ${coverNames}.`,
            hi: { band: lineBand(lines), lit: slotNotes },
          }
        : {
            title: 'Gaps are fine',
            text: `In ${lineNames} the ${d} only fits in ${coverNames}. Not every ${L} needs all three. What matters is that no ${L} reaches outside these ${X}s.`,
            hi: { band: mergeBands(lineBand(lines), crossBand(cover)), lit: slotNotes },
          },
      {
        title: `${cap(NUM[size])} ${L}s, ${NUM[size]} ${X}s`,
        text: `Each ${L} needs its ${d}, and a ${X} can hold only one. So ${lineNames} put one ${d} in each of ${coverNames}. What about the other ${d}s in those ${X}s?`,
        askText: `Each ${L} needs its ${d}, and a ${X} can hold only one. So ${lineNames} put one ${d} in each of ${coverNames}. Which cells lose their ${d}? Tap them.`,
        hi: { band: crossBand(cover), pat: 'slots', lit: slotNotes, probe: allTargets },
      },
      {
        mode: 'worlds',
        title: 'Every way it can go',
        text: `Each world gives every ${L} its ${d} a different way. Step through them and watch ${coverNames}.`,
      },
      {
        mode: 'apply',
        title: `${cap(coverNames)} are spoken for`,
        text: `In every world ${coverNames} get their ${d} from ${lineNames}. Every other ${d} in them goes.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: `Let a ${L} reach outside these ${X}s and see what opens up.`,
      },
    ],
    caption: w =>
      [...w]
        .sort((a, b) => lineOf(a[0]) - lineOf(b[0]))
        .map(([c]) => `${cap(L)} ${lineOf(c) + 1} puts its ${d} in ${X} ${crossOf(c) + 1}.`)
        .join(' '),
    worldKill: `${cap(coverNames)} each have a ${d}, so the other ${d}s in them are out.`,
    intactLine: n => `${cap(coverNames)} get their ${d} from these ${L}s ${inAll(n)}. The other ${d}s in them go.`,
  }
}

/** XY-Wing: a pivot and two pincers, and whichever way the pivot goes. */
function wing(base, step) {
  const { topo, board, cands } = base
  const [P, A, B] = step.cells
  const [x, y, z] = step.digits
  const targets = step.eliminations.map(e => [e.cell, e.digit])
  const T = targets.map(([c]) => c)
  const sees = (a, b) => topo.peers[a].includes(b)
  const one = T.length === 1

  // A cell with the same note that sees only one pincer. It dies in the worlds
  // where that pincer is the shared digit and lives in the others, which is the
  // clearest way to show why seeing both is the rule.
  const controls = []
  const skip = new Set([P, A, B, ...T])
  for (let c = 0; c < 81 && controls.length < 2; c++) {
    if (skip.has(c) || board[c] !== 0 || !hasMark(cands[c], z)) continue
    if (sees(c, A) !== sees(c, B)) controls.push([c, z])
  }

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const flaws = [
    ...ranked(base, digits.filter(w => w !== x && w !== y).map(w => [P, w])).map(([, w]) => ({
      id: 'third',
      label: `The pivot has a third note, a ${w}`,
      add: [[P, w]],
    })),
    ...ranked(base, digits.filter(w => w !== y && w !== z).map(w => [B, w])).map(([, w]) => ({
      id: 'noshare',
      label: `${nm(B)} holds ${y} and ${w}, no ${z}`,
      add: [[B, w]],
      remove: [[B, z]],
    })),
  ]

  const pincers = sees(A, B)
    ? `They see each other, so at most one of them is ${z}, but which one depends on the pivot.`
    : `They do not see each other, so both could be ${z} at once.`

  return {
    ...base,
    kicker: TECHNIQUES.xyWing.label,
    lens: null,
    focus: new Set([P, A, B, ...T]),
    band: NO_BAND,
    targets,
    controls,
    controlsLine: list =>
      list
        .map(([c]) => {
          const q = sees(c, A) ? A : B
          const other = q === A ? x : y
          return `${nm(c)} keeps its ${z}: it sees only ${nm(q)}, and in some worlds ${nm(q)} is a ${other}.`
        })
        .join(' '),
    flaws,
    steps: [
      {
        title: 'Three cells, two notes each',
        text: `${nm(P)}, ${nm(A)} and ${nm(B)} are each down to two notes.`,
        hi: { pat: [P, A, B], lit: slotNotes },
      },
      {
        title: 'The pivot links them',
        text: `${nm(P)} is the pivot. It shares a ${x} with ${nm(A)} and a ${y} with ${nm(B)}, and it sees both of them.`,
        hi: {
          pat: [P, A, B],
          lit: [[P, x], [A, x], [P, y], [B, y]],
          links: [{ a: P, b: A, label: x }, { a: P, b: B, label: y }],
        },
      },
      {
        title: `The pincers share a ${z}`,
        text: `${nm(A)} and ${nm(B)} both have a ${z}. ${pincers}`,
        hi: { pat: [P, A, B], lit: [[A, z], [B, z]] },
      },
      {
        title: one ? 'One cell sees both pincers' : `${cap(NUM[T.length])} cells see both pincers`,
        text: one
          ? `${nm(T[0])} sees ${nm(A)} and ${nm(B)}. Can ${nm(T[0])} be ${z}?`
          : `${cells(T)} each see ${nm(A)} and ${nm(B)}. Can any of them be ${z}?`,
        askTitle: 'Your guess first',
        askText: `Whichever way the pivot goes, one pincer ends up a ${z}. So which cells can never be ${z}? Tap them.`,
        hi: {
          pat: [A, B],
          tgt: T,
          lit: [[A, z], [B, z]],
          probe: allTargets,
          links: T.flatMap(t => [{ a: A, b: t, dashed: true, toTarget: true }, { a: B, b: t, dashed: true, toTarget: true }]),
        },
      },
      {
        mode: 'worlds',
        title: `The pivot is ${x} or ${y}. Follow both.`,
        text: `Each world fills the three cells one way. Watch where the ${z} ends up.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `Whatever the pivot is, one pincer is a ${z}, and ${one ? nm(T[0]) : cells(T)} ${one ? 'sees' : 'see'} it. So ${one ? `${nm(T[0])} cannot` : 'none of them can'} be ${z}.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: `Pick a flaw. One world where the ${z} survives is enough to stop the elimination.`,
      },
    ],
    caption: (w, notes) => {
      const p = w.get(P)
      const forced = [A, B].filter(q => hasMark(notes[q], p))
      const free = [A, B].filter(q => !forced.includes(q))
      let s = `The pivot is ${p}. `
      s += forced.length
        ? forced.map(q => `${nm(q)} sees it, so ${nm(q)} is ${w.get(q)}.`).join(' ')
        : 'Neither pincer is forced.'
      if (forced.length && free.length) s += ` ${nm(free[0])} is ${w.get(free[0])} here.`
      return s
    },
    worldKill: one
      ? `${nm(T[0])} sees a ${z}, so it cannot be ${z}.`
      : `${cells(T)} each see a ${z}, so none of them can be ${z}.`,
    intactLine: n =>
      `One pincer is a ${z} ${inAll(n)}, and ${one ? `${nm(T[0])} sees` : `${cells(T)} see`} both. ${one ? 'It cannot' : 'None of them can'} be ${z}.`,
  }
}

/** The line a strong link runs along, named the way a person would. */
function linkLine(topo, a, b) {
  if (rowOf(a) === rowOf(b)) return { meta: { type: 'row', index: rowOf(a) }, cells: topo.rows[rowOf(a)] }
  if (colOf(a) === colOf(b)) return { meta: { type: 'col', index: colOf(a) }, cells: topo.cols[colOf(a)] }
  const r = topo.regionOf[a]
  return { meta: topo.unitMeta[topo.regionStart + r], cells: topo.regions[r] }
}

/**
 * Skyscraper and 2-String Kite: two strong links, joined at one end. The skill
 * is seeing a strong link as a fact ("one of these two is the digit") and then
 * chaining two of them.
 */
function chain(base, step) {
  const { topo } = base
  const d = step.digits[0]
  const [[a1, a2], [b1, b2]] = step.links
  const A = linkLine(topo, a1, a2)
  const B = linkLine(topo, b1, b2)
  const An = unitName(A.meta)
  const Bn = unitName(B.meta)
  const kite = step.technique === 'twoStringKite'
  const targets = step.eliminations.map(e => [e.cell, e.digit])
  const T = targets.map(([c]) => c)
  const one = T.length === 1
  const join = kite
    ? `${nm(a1)} and ${nm(b1)} sit in the same box`
    : `${nm(a1)} and ${nm(b1)} line up in ${rowOf(a1) === rowOf(b1) ? `row ${rowOf(a1) + 1}` : `column ${colOf(a1) + 1}`}`
  const bandA = unitBand(A.meta, A.cells)
  const bandB = unitBand(B.meta, B.cells)
  const linkSet = new Set(step.cells)

  // A third home in either link is the obvious way to break it. For a
  // skyscraper, so is a base that does not line up.
  const flaws = [
    ...ranked(base, A.cells.filter(c => !linkSet.has(c)).map(c => [c, d])).map(([c]) => ({
      id: 'thirdA',
      label: `${cap(An)} has a third ${d}, at ${nm(c)}`,
      add: [[c, d]],
    })),
    ...ranked(base, B.cells.filter(c => !linkSet.has(c)).map(c => [c, d])).map(([c]) => ({
      id: 'thirdB',
      label: `${cap(Bn)} has a third ${d}, at ${nm(c)}`,
      add: [[c, d]],
    })),
  ]

  const focus = new Set([...A.cells, ...B.cells, ...T])
  return {
    ...base,
    kicker: TECHNIQUES[step.technique].label,
    lens: d,
    focus,
    band: mergeBands(bandA, bandB),
    targets,
    flaws,
    steps: [
      {
        title: 'A strong link',
        text: `This board shows only the ${d}s. In ${An} a ${d} fits in just two cells, ${nm(a1)} and ${nm(a2)}. Whichever it is, one of the two is the ${d}. That is a strong link.`,
        hi: { band: bandA, lit: [[a1, d], [a2, d]], links: [{ a: a1, b: a2 }] },
      },
      {
        title: 'And a second one',
        text: `${cap(Bn)} is the same: its ${d} is in ${nm(b1)} or ${nm(b2)}.`,
        hi: {
          band: mergeBands(bandA, bandB),
          lit: [[a1, d], [a2, d], [b1, d], [b2, d]],
          links: [{ a: a1, b: a2 }, { a: b1, b: b2 }],
        },
      },
      {
        title: kite ? 'Tied in a box' : 'Joined at the base',
        text: `${cap(join)}, so they cannot both be the ${d}. So at least one of the far ends, ${nm(a2)} or ${nm(b2)}, is a ${d}. What about ${one ? nm(T[0]) : cells(T)}, which ${one ? 'sees' : 'see'} both?`,
        askText: `${cap(join)}, so they cannot both be the ${d}. So at least one of the far ends, ${nm(a2)} or ${nm(b2)}, is a ${d}. Which cells can never be ${d}? Tap them.`,
        hi: {
          pat: step.cells,
          tgt: T,
          lit: [[a1, d], [a2, d], [b1, d], [b2, d]],
          probe: allTargets,
          links: [{ a: a1, b: a2 }, { a: b1, b: b2 }, { a: a1, b: b1, dashed: true }],
        },
      },
      {
        mode: 'worlds',
        title: 'Every way it can go',
        text: `Each world puts one ${d} in each link. The two joined ends never both get one. Watch the far ends.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `In every world ${nm(a2)} or ${nm(b2)} is a ${d}, and ${one ? `${nm(T[0])} sees` : `${cells(T)} see`} both. So ${one ? `${nm(T[0])} cannot` : 'none of them can'} be ${d}.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: 'Give one of the links a third home and the fact it rested on is gone.',
      },
    ],
    caption: w => {
      const at = cs => cs.find(c => w.get(c) === d)
      const ia = at([a1, a2])
      const ib = at([b1, b2])
      return `${cap(An)} puts its ${d} in ${nm(ia)}. ${cap(Bn)} puts its ${d} in ${nm(ib)}.`
    },
    worldKill: one
      ? `${nm(T[0])} sees a ${d}, so it cannot be ${d}.`
      : `${cells(T)} each see a ${d}, so none of them can be ${d}.`,
    intactLine: n =>
      `One of the far ends is a ${d} ${inAll(n)}, and ${one ? `${nm(T[0])} sees` : `${cells(T)} see`} both. ${one ? 'It cannot' : 'None of them can'} be ${d}.`,
  }
}

/** W-Wing: two identical pairs, bridged by a strong link on one of their digits. */
function wWingLesson(base, step) {
  const { topo } = base
  const [x, y] = step.digits
  const [c1, c2] = step.wings
  const [l1, l2] = step.bridge
  const bridgeUnit = step.unit
  const bridgeCells = [...(unitCellsOf(topo, step) || [])]
  const Un = unitName(bridgeUnit)
  const targets = step.eliminations.map(e => [e.cell, e.digit])
  const T = targets.map(([c]) => c)
  const one = T.length === 1
  const band = unitBand(bridgeUnit, bridgeCells)
  const inBridge = new Set([l1, l2])
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  const flaws = [
    ...ranked(base, bridgeCells.filter(c => !inBridge.has(c) && c !== c1 && c !== c2).map(c => [c, x])).map(([c]) => ({
      id: 'third',
      label: `${cap(Un)} has a third ${x}, at ${nm(c)}`,
      add: [[c, x]],
    })),
    ...ranked(base, digits.filter(w => w !== x && w !== y).map(w => [c2, w])).map(([, w]) => ({
      id: 'unlike',
      label: `${nm(c2)} holds ${x} and ${w}, no ${y}`,
      add: [[c2, w]],
      remove: [[c2, y]],
    })),
  ]

  return {
    ...base,
    kicker: TECHNIQUES.wWing.label,
    lens: null,
    focus: new Set([c1, c2, ...bridgeCells, ...T]),
    band,
    targets,
    flaws,
    steps: [
      {
        title: 'Two cells, the same two notes',
        text: `${nm(c1)} and ${nm(c2)} both hold just ${x} and ${y}, and they do not see each other. On their own they prove nothing.`,
        hi: { pat: [c1, c2], lit: [[c1, x], [c1, y], [c2, x], [c2, y]] },
      },
      {
        title: `A bridge on ${x}`,
        text: `In ${Un}, ${x} has only two homes, ${nm(l1)} and ${nm(l2)}. ${nm(l1)} sees ${nm(c1)}, and ${nm(l2)} sees ${nm(c2)}.`,
        hi: {
          band,
          pat: [c1, c2],
          lit: [[l1, x], [l2, x], [c1, x], [c2, x]],
          links: [{ a: l1, b: l2 }, { a: c1, b: l1, dashed: true }, { a: c2, b: l2, dashed: true }],
        },
      },
      {
        title: `Follow the ${x}`,
        text: `If ${nm(c1)} is ${x}, ${nm(l1)} is not, so ${nm(l2)} is, so ${nm(c2)} cannot be ${x}: it is ${y}. Either way one of the two cells is a ${y}. What about ${one ? nm(T[0]) : cells(T)}, which ${one ? 'sees' : 'see'} both?`,
        askText: `If ${nm(c1)} is ${x}, ${nm(l1)} is not, so ${nm(l2)} is, so ${nm(c2)} cannot be ${x}: it is ${y}. Either way one of the two cells is a ${y}. Which cells can never be ${y}? Tap them.`,
        hi: {
          pat: [c1, c2],
          tgt: T,
          lit: [[c1, y], [c2, y]],
          probe: allTargets,
          links: T.flatMap(t => [{ a: c1, b: t, dashed: true, toTarget: true }, { a: c2, b: t, dashed: true, toTarget: true }]),
        },
      },
      {
        mode: 'worlds',
        title: 'Every way it can go',
        text: `Each world fills the two cells and the bridge one way. Watch where the ${y} ends up.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `In every world ${nm(c1)} or ${nm(c2)} is a ${y}, and ${one ? `${nm(T[0])} sees` : `${cells(T)} see`} both. So ${one ? `${nm(T[0])} cannot` : 'none of them can'} be ${y}.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: 'Pick a flaw. One world where the note survives is enough to stop the elimination.',
      },
    ],
    caption: w => {
      const at = [l1, l2].find(c => w.get(c) === x)
      return `Here ${nm(c1)} is ${w.get(c1)} and ${nm(c2)} is ${w.get(c2)}, and the ${x} of ${Un} is in ${nm(at)}.`
    },
    worldKill: one
      ? `${nm(T[0])} sees a ${y}, so it cannot be ${y}.`
      : `${cells(T)} each see a ${y}, so none of them can be ${y}.`,
    intactLine: n =>
      `One of the two cells is a ${y} ${inAll(n)}, and ${one ? `${nm(T[0])} sees` : `${cells(T)} see`} both. ${one ? 'It cannot' : 'None of them can'} be ${y}.`,
  }
}

/** XYZ-Wing: the XY-Wing whose pivot holds the third digit too. */
function xyzLesson(base, step) {
  const [P, A, B] = step.cells
  const [x, y, z] = step.digits
  const targets = step.eliminations.map(e => [e.cell, e.digit])
  const T = targets.map(([c]) => c)
  const one = T.length === 1
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  const flaws = [
    ...ranked(base, digits.filter(w => w !== x && w !== y && w !== z).map(w => [P, w])).map(([, w]) => ({
      id: 'fourth',
      label: `The pivot has a fourth note, a ${w}`,
      add: [[P, w]],
    })),
    ...ranked(base, digits.filter(w => w !== y && w !== z).map(w => [B, w])).map(([, w]) => ({
      id: 'noshare',
      label: `${nm(B)} holds ${y} and ${w}, no ${z}`,
      add: [[B, w]],
      remove: [[B, z]],
    })),
  ]

  return {
    ...base,
    kicker: TECHNIQUES.xyzWing.label,
    lens: null,
    focus: new Set([P, A, B, ...T]),
    band: NO_BAND,
    targets,
    flaws,
    steps: [
      {
        title: 'A pivot with three notes',
        text: `${nm(P)} holds ${x}, ${y} and ${z}. It sees ${nm(A)}, which holds ${x} and ${z}, and ${nm(B)}, which holds ${y} and ${z}.`,
        hi: {
          pat: [P, A, B],
          lit: 'slotNotes',
          links: [{ a: P, b: A, label: x }, { a: P, b: B, label: y }],
        },
      },
      {
        title: `All three hold a ${z}`,
        text: `Whatever the pivot turns out to be, the ${z} ends up in one of the three cells. Can you see why before stepping through it?`,
        hi: { pat: [P, A, B], lit: [[P, z], [A, z], [B, z]] },
      },
      {
        title: one ? 'One cell sees all three' : `${cap(NUM[T.length])} cells see all three`,
        text: one
          ? `${nm(T[0])} sees ${nm(P)}, ${nm(A)} and ${nm(B)}. Can it be ${z}?`
          : `${cells(T)} each see ${nm(P)}, ${nm(A)} and ${nm(B)}. Can any of them be ${z}?`,
        askTitle: 'Your guess first',
        askText: `The ${z} lands in one of the three cells whatever the pivot is. So which cells can never be ${z}? Tap them.`,
        hi: {
          pat: [P, A, B],
          tgt: T,
          lit: [[P, z], [A, z], [B, z]],
          probe: allTargets,
          links: T.flatMap(t => [
            { a: P, b: t, dashed: true, toTarget: true },
            { a: A, b: t, dashed: true, toTarget: true },
            { a: B, b: t, dashed: true, toTarget: true },
          ]),
        },
      },
      {
        mode: 'worlds',
        title: `The pivot is ${x}, ${y} or ${z}. Follow all three.`,
        text: `Each world fills the three cells one way. Watch where the ${z} lands.`,
      },
      {
        mode: 'apply',
        title: 'Gone in every world',
        text: `If the pivot is ${z}, ${one ? nm(T[0]) : 'they'} ${one ? 'sees' : 'see'} it. If not, the wing that shares the pivot's digit is forced to ${z}, and ${one ? 'it sees that too' : 'they see that too'}. So ${one ? `${nm(T[0])} cannot` : 'none of them can'} be ${z}.`,
      },
      {
        mode: 'break',
        title: 'Now break it',
        text: `Pick a flaw. One world where the ${z} survives is enough to stop the elimination.`,
      },
    ],
    caption: (w, notes) => {
      const p = w.get(P)
      if (p === z) return `The pivot is ${z} itself. Here ${nm(A)} is ${w.get(A)} and ${nm(B)} is ${w.get(B)}.`
      const forced = [A, B].filter(q => hasMark(notes[q], p))
      const free = [A, B].filter(q => !forced.includes(q))
      let s = `The pivot is ${p}. `
      s += forced.length
        ? forced.map(q => `${nm(q)} sees it, so ${nm(q)} is ${w.get(q)}.`).join(' ')
        : 'Neither wing is forced.'
      if (forced.length && free.length) s += ` ${nm(free[0])} is ${w.get(free[0])} here.`
      return s
    },
    worldKill: one
      ? `${nm(T[0])} sees a ${z}, so it cannot be ${z}.`
      : `${cells(T)} each see a ${z}, so none of them can be ${z}.`,
    intactLine: n =>
      `A ${z} lands in one of the three cells ${inAll(n)}, and ${one ? `${nm(T[0])} sees` : `${cells(T)} see`} all three. ${one ? 'It cannot' : 'None of them can'} be ${z}.`,
  }
}

/** A different total tests the arithmetic premise without pretending a forbidden
 * digit could make the original sum. The board prints the changed clue too. */
function totalFlaws(base) {
  const group = base.slots[0].sumGroup
  const n = group.cells.length
  const low = n * (n + 1) / 2
  const high = n * (19 - n) / 2
  return Array.from({ length: high - low + 1 }, (_, i) => low + i)
    .filter(sum => sum !== group.sum)
    .sort((a, b) => Math.abs(a - group.sum) - Math.abs(b - group.sum))
    .map(sum => ({ id: 'total', label: `What if this cage added to ${sum} instead of ${group.sum}?`, sum }))
}

/** Shared arithmetic picture; the families below supply the particular claim. */
function cageLesson(base, step, words) {
  const group = base.slots[0].sumGroup
  const { board, cands, topo } = base
  const placement = step.placements?.[0] || null
  const targets = placement
    ? marksToList(cands[placement.cell]).filter(d => d !== placement.digit).map(d => [placement.cell, d])
    : step.eliminations.map(e => [e.cell, e.digit])
  const unit = [...(unitCellsOf(topo, step) || [])]
  const band = unit.length ? unitBand(step.unit, unit) : { ...NO_BAND, cells: group.cells }
  const external = step.technique === 'cageLocked'
  const empty = group.cells.filter(c => board[c] === 0)
  const held = group.cells.filter(c => board[c] !== 0).reduce((n, c) => n + board[c], 0)
  const controls = empty.flatMap(c => marksToList(cands[c]).map(d => [c, d]))
    .filter(([c, d]) => !targets.some(([x, v]) => x === c && v === d))
  return {
    ...base,
    kicker: TECHNIQUES[step.technique].label,
    lens: null,
    focus: new Set([...group.cells, ...unit, ...targets.map(([c]) => c)]),
    band,
    targets,
    placement,
    controls,
    flaws: totalFlaws(base),
    steps: [
      {
        title: words.title,
        text: `This cage has ${group.cells.length} cells adding to ${group.sum}, with no repeated digit.` +
          (held ? ` The written digits already total ${held}, leaving ${group.sum - held} for ${cells(empty)}.` : '') +
          ` ${words.start}`,
        hi: { band, pat: group.cells, lit: slotNotes },
      },
      {
        title: words.questionTitle,
        text: words.question,
        askText: words.question + (external ? ' Which cells outside the cage lose it? Tap them.' :
          ` Which digits leave ${cells([...new Set(targets.map(([c]) => c))])}? Pick them.`),
        hi: { band, pat: group.cells, lit: slotNotes, probe: allTargets },
      },
      {
        mode: 'worlds', title: 'Every way to make the total',
        text: 'Each world fills the cage using its notes, with no repeats and exactly the printed total. Step through them.',
      },
      { mode: 'apply', title: placement ? `So ${nm(placement.cell)} is ${placement.digit}` : 'Gone in every world', text: words.result },
      {
        mode: 'break', title: 'Now break it',
        text: 'What if the printed total were different? Keep the notes and watch a ruled-out digit find a place.',
      },
    ],
    caption: w => `${group.cells.map(c => w.get(c)).join(' + ')} = ${group.cells.reduce((n, c) => n + w.get(c), 0)}. ${and(empty.map(c => `${nm(c)} is ${w.get(c)}`))}.`,
    worldKill: words.result,
    intactLine: n => `${words.result} That holds ${inAll(n)}.`,
  }
}

function cageComboLesson(base, step) {
  return cageLesson(base, step, {
    title: 'One set makes the sum',
    start: `With these notes, the only set left is ${and(step.digits)}. The order can still change.`,
    questionTitle: 'The set stays the same',
    question: 'Try every order that fits the notes. A digit outside the set cannot help make this total.',
    result: `Every filling uses only ${and(step.digits)} in the empty cells, so their other notes go.`,
  })
}

function cageSumLesson(base, step) {
  return cageLesson(base, step, {
    title: 'Several sets, one total',
    start: 'There is more than one set left. Keep a digit if even one filling can use it.',
    questionTitle: 'What no filling can use',
    question: 'A digit can go only if every way of making the total leaves it out.',
    result: `Every filling uses only ${and(step.digits)} in the empty cells. A note outside that list never fits the sum.`,
  })
}

function cageSingleLesson(base, step) {
  const { cell, digit } = step.placements[0]
  const lesson = cageLesson(base, step, {
    title: `Every set needs a ${digit}`,
    start: `Every surviving set uses ${digit}, so the cage must put it somewhere.`,
    questionTitle: 'One home for a required digit',
    question: `Only ${nm(cell)} still has ${digit} in its notes. It must take the cage's ${digit}.`,
    result: `Every filling puts ${digit} in ${nm(cell)}, so that cell's other notes go.`,
  })
  const group = base.slots[0].sumGroup
  lesson.flaws.unshift(...ranked(base, group.cells.filter(c => c !== cell).map(c => [c, digit]))
    .map(([c, d]) => ({ id: 'home', label: `${nm(c)} could also take the ${d}`, add: [[c, d]] })))
  lesson.steps.at(-1).text = 'Give the required digit another home, or change the printed total. Watch whether the placement still follows.'
  return lesson
}

function cageLockedLesson(base, step) {
  const d = step.digits[0]
  const U = unitName(step.unit)
  const lesson = cageLesson(base, step, {
    title: `The cage must use ${d}`,
    start: `Every surviving set needs ${d}.`,
    questionTitle: `It is also the ${d} of ${U}`,
    question: `Every home for the cage's ${d} lies in ${U}. Whichever home it takes, ${U} has its ${d}.`,
    result: `The cage supplies the ${d} of ${U}, so the other ${d}s in that unit go.`,
  })
  const unit = [...unitCellsOf(base.topo, step)]
  lesson.flaws.unshift(...ranked(base, base.slots[0].sumGroup.cells.filter(c => !unit.includes(c)).map(c => [c, d]))
    .map(([c]) => ({ id: 'escape', label: `${nm(c)} could take ${d} outside ${U}`, add: [[c, d]] })))
  // A cage wholly inside the unit has nowhere to escape. If its notes already
  // form a naked set, even changing the total cannot free the digit. Give that
  // set an alternative note as well, and state both changed premises.
  const alternatives = ranked(base, base.slots.flatMap(s =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => [s.cell, v])))
  for (const [c, v] of alternatives) {
    lesson.flaws.push(...totalFlaws(base).map(f => ({
      ...f, add: [[c, v]], label: `What if the cage added to ${f.sum} and ${nm(c)} could also be ${v}?`,
    })))
  }
  lesson.steps.at(-1).text = `Give the ${d} a home outside ${U}, or change the total so the cage need not use it.`
  return lesson
}

function sum45Lesson(base, step) {
  const group = base.slots[0].sumGroup
  const { cell, digit } = step.placements[0]
  const U = unitName(step.unit)
  const held = group.cells.reduce((n, c) => n + base.board[c], 0)
  const targets = marksToList(base.cands[cell]).filter(d => d !== digit).map(d => [cell, d])
  const unit = [...unitCellsOf(base.topo, step)]
  const band = unitBand(step.unit, unit)
  const equation = group.innie
    ? `The cages wholly inside ${U} add to ${group.total}. The leftover cells must total 45 - ${group.total} = ${group.sum}.`
    : `The cages touching ${U} add to ${group.total}. Their cells outside it must total ${group.total} - 45 = ${group.sum}.`
  const result = `${nm(cell)} is the only unknown in that remainder: ${group.sum} - ${held} = ${digit}.`
  // This is subtraction with one unknown, not a choice of homes. Adding notes
  // cannot change the remainder. Changing a total would replace the given
  // equation rather than expose another case under it, so there is no break
  // step with this board fixed.
  return {
    ...base, kicker: TECHNIQUES.sum45.label, lens: null,
    focus: new Set([...unit, ...group.cells, ...group.cageIndices.flatMap(i => base.topo.cages[i].cells)]),
    band, targets, placement: { cell, digit },
    steps: [
      { title: `${cap(U)} adds to 45`, text: `It holds one of each digit from 1 to 9. ${equation}`, hi: { band, pat: group.cells, lit: slotNotes } },
      {
        title: 'Subtract what is already written', text: `${equation} The written digits in the remainder add to ${held}.`,
        askText: `The remainder totals ${group.sum}, and its written digits add to ${held}. Which digits leave ${nm(cell)}? Pick them.`,
        hi: { band, pat: group.cells, probe: allTargets },
      },
      { mode: 'worlds', title: 'Only one way to finish the remainder', text: result },
      { mode: 'apply', title: `So ${nm(cell)} is ${digit}`, text: result },
    ],
    caption: w => `${group.sum} - ${held} = ${w.get(cell)}.`,
    worldKill: result,
    intactLine: () => result,
  }
}

const FAMILIES = {
  cageCombo: cageComboLesson,
  cageSum: cageSumLesson,
  cageSingle: cageSingleLesson,
  sum45: sum45Lesson,
  cageLocked: cageLockedLesson,
  hiddenSingle: single,
  pointing: locked,
  claiming: locked,
  nakedPair: naked,
  nakedTriple: naked,
  nakedQuad: naked,
  hiddenPair: hidden,
  hiddenTriple: hidden,
  xWing: fishLesson,
  swordfish: fishLesson,
  xyWing: wing,
  skyscraper: chain,
  twoStringKite: chain,
  wWing: wWingLesson,
  xyzWing: xyzLesson,
}

// ---- what the elimination leads to ----

function directAfter(lesson, cands, cell, digit) {
  const { board, topo } = lesson
  if (board[cell] !== 0 || !hasMark(cands[cell], digit)) return null
  if (countMarks(cands[cell]) === 1) return { cell, digit, how: 'naked' }
  for (let u = 0; u < topo.units.length; u++) {
    const unit = topo.units[u]
    if (!unit.includes(cell)) continue
    let homes = 0
    for (const i of unit) if (board[i] === 0 && hasMark(cands[i], digit)) homes++
    if (homes === 1) return { cell, digit, how: 'hidden', unit: topo.unitMeta[u] }
  }
  return null
}

/**
 * A digit the elimination makes placeable straight away, so the apply step can
 * end on a digit landing rather than on notes disappearing. Prefers the hint's
 * own cell when a lesson was opened from the hint button, because that is the
 * digit the player was trying to find.
 */
function payoffOf(lesson, hint) {
  const after = Int16Array.from(lesson.cands)
  for (const [c, d] of lesson.targets) after[c] = removeMark(after[c], d)
  if (hint) {
    const h = directAfter(lesson, after, hint.cell, hint.digit)
    if (h) return h
  }
  const touched = sorted([...new Set(lesson.targets.map(([c]) => c))])
  for (const c of touched) {
    if (countMarks(after[c]) === 1) return { cell: c, digit: marksToList(after[c])[0], how: 'naked' }
  }
  const { topo, board } = lesson
  for (const d of sorted([...new Set(lesson.targets.map(([, d]) => d))])) {
    for (const c of touched) {
      for (let u = 0; u < topo.units.length; u++) {
        const unit = topo.units[u]
        if (!unit.includes(c)) continue
        const homes = unit.filter(i => board[i] === 0 && hasMark(after[i], d))
        if (homes.length === 1) return { cell: homes[0], digit: d, how: 'hidden', unit: topo.unitMeta[u] }
      }
    }
  }
  return null
}

const payoffLine = p =>
  p.how === 'naked'
    ? `Only the ${p.digit} is left, so ${nm(p.cell)} is a ${p.digit}.`
    : `Now the ${p.digit} has one place left in ${unitName(p.unit)}: ${nm(p.cell)}.`

// ---- building one ----

/**
 * A lesson for one step, on the position it fired in.
 *
 *   board, cands   the position, with the candidates the step was found in
 *   step           the ladder's step, or anything shaped like one
 *   topo           the board's topology, so a jigsaw lesson argues jigsaw rules
 *   source         where it came from, which only changes the kicker
 *   hint           the cell and digit a hint was heading for, if any
 *
 * Returns null for a rung no lesson exists for, and for a lesson whose own
 * argument does not hold, which the tests assert never happens on a real solve.
 */
export function buildLesson({ board, cands, step, topo = CLASSIC, source = 'example', hint = null }) {
  if (!step || !TEACHABLE.has(step.technique)) return null
  const slots = slotsFor(step, topo)
  if (!slots) return null
  const base = {
    technique: step.technique,
    label: TECHNIQUES[step.technique].label,
    topo,
    board: Array.from(board),
    cands: Int16Array.from(cands),
    step,
    slots,
    source,
  }
  const lesson = {
    controls: [],
    flaws: [],
    placement: null,
    payoff: null,
    controlsLine: null,
    ...FAMILIES[step.technique](base, step),
  }

  const a = analyse(lesson)
  if (!a.intact || a.truncated) return null

  // Every flaw has to break the argument, or switching it on shows nothing.
  // The families offer several of each kind, most believable first, and the
  // first one of each kind that actually opens a world is the one shown.
  const kept = new Map()
  for (const f of lesson.flaws) {
    if (kept.has(f.id)) continue
    const b = analyse(lesson, f)
    if (!b.truncated && b.worlds.length > 0 && !b.intact) kept.set(f.id, f)
  }
  lesson.flaws = [...kept.values()]
  if (!lesson.flaws.length) lesson.steps = lesson.steps.filter(s => s.mode !== 'break')

  // A control that dies in every world is an elimination, not a control.
  if (lesson.controls.length) {
    const c = analyse(lesson, null, lesson.controls)
    const dead = new Set(c.dead.map(([cell, d]) => cell + ':' + d))
    lesson.controls = lesson.controls.filter(([cell, d]) => !dead.has(cell + ':' + d))
    // A control is drawn, so its cell's notes have to be on the board.
    if (lesson.focus) for (const [cell] of lesson.controls) lesson.focus.add(cell)
  }

  if (!lesson.placement) lesson.payoff = payoffOf(lesson, hint)
  // Opened from a hint whose digit does not fall out straight away: say how
  // this step connects to it. The step is the hardest on the hint's path, so
  // everything between it and the digit is easier, which is the honest claim.
  const onward =
    hint && !(lesson.payoff && lesson.payoff.cell === hint.cell && lesson.payoff.digit === hint.digit)
      ? `Everything after this on the way to ${hint.digit} in ${nm(hint.cell)} is easier than this step.`
      : null
  const apply = lesson.steps.find(s => s.mode === 'apply')
  if (apply) {
    const extra = [
      lesson.controls.length && lesson.controlsLine ? lesson.controlsLine(lesson.controls) : null,
      lesson.payoff ? payoffLine(lesson.payoff) : null,
      onward,
    ].filter(Boolean)
    if (extra.length) apply.payoff = [apply.payoff, ...extra].filter(Boolean).join(' ')
  }
  // The question step asks for your guess before anything is shown. Guessing
  // first and then seeing the answer sticks far better than reading it, and it
  // turns the step that used to say "what about the other 9s?" into one that
  // waits for an answer. Cells for most patterns; digits for the hidden
  // subsets, whose eliminations sit inside the pattern's own cells, where
  // "which cells" would be a question with the answer already drawn.
  const ask = lesson.steps.find(st => (st.mode || 'build') === 'build' && st.hi?.probe === 'targets')
  if (ask) {
    const pat = new Set(patternCellsOf(lesson.slots, lesson.board, lesson.cands))
    const tcells = [...new Set(lesson.targets.map(([c]) => c))].sort((x, y) => x - y)
    lesson.predict = tcells.every(c => pat.has(c))
      ? {
          kind: 'digits',
          answer: [...new Set(lesson.targets.map(([, d]) => d))].sort((x, y) => x - y),
          cells: tcells,
          offer: [...new Set(tcells.flatMap(c => marksToList(lesson.cands[c])))].sort((x, y) => x - y),
        }
      : { kind: 'cells', answer: tcells }
    ask.predict = true
  }

  lesson.worldCount = a.worlds.length
  return lesson
}

/**
 * How a guess at the question step went: what you named that is right, what
 * you missed, and what you named that keeps its notes, in words.
 */
export function judgePrediction(lesson, picks) {
  const p = lesson.predict
  if (!p) return null
  const want = new Set(p.answer)
  const got = new Set(picks)
  const hits = p.answer.filter(x => got.has(x))
  const missed = p.answer.filter(x => !got.has(x))
  const extra = [...got].filter(x => !want.has(x)).sort((a, b) => a - b)
  const exact = !missed.length && !extra.length
  const say = xs => (p.kind === 'cells' ? cells(xs) : and(xs))
  let text
  if (exact) {
    text =
      p.kind === 'cells'
        ? `Exactly right: ${say(p.answer)} ${p.answer.length === 1 ? 'loses' : 'lose'} a note.`
        : `Exactly right: ${say(p.answer)} ${p.answer.length === 1 ? 'goes' : 'go'} from ${cells(p.cells)}.`
  } else {
    const parts = [`You named ${hits.length} of ${p.answer.length}.`]
    if (missed.length) {
      parts.push(
        p.kind === 'cells'
          ? `${cap(say(missed))} ${missed.length === 1 ? 'loses' : 'lose'} a note too.`
          : `${cap(say(missed))} ${missed.length === 1 ? 'goes' : 'go'} as well.`
      )
    }
    if (extra.length) {
      parts.push(
        p.kind === 'cells'
          ? `${cap(say(extra))} ${extra.length === 1 ? 'keeps its' : 'keep their'} notes.`
          : `${cap(say(extra))} ${extra.length === 1 ? 'stays' : 'stay'}.`
      )
    }
    text = parts.join(' ')
  }
  return { hits, missed, extra, exact, text }
}

export const SOURCE_LABEL = {
  example: 'an example',
  game: 'from your game',
  hint: 'the step behind your hint',
  card: 'from your drill',
}
