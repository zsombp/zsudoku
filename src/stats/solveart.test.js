import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toArt, toSvg, PALETTES, ART_VERSION } from './solveart.js'
import { makePuzzle } from '../logic/generator.js'
import { createState, nextStep, applyStep } from '../logic/grader.js'

/**
 * A game played the way the ladder would play it, at a steady pace. Real enough
 * that the marks, the classes and the clue positions all come from a puzzle
 * that could exist, rather than from a board invented to make a point.
 */
function ladderGame(tier, seed, gapMs = 4000) {
  const made = makePuzzle(tier, { seed })
  const st = createState(made.puzzle)
  const log = []
  let t = 0
  for (let guard = 0; guard < 900 && st.board.includes(0); guard++) {
    const step = nextStep(st)
    if (!step) break
    for (const p of step.placements) {
      t += gapMs
      log.push({ t, kind: 'place', cell: p.cell, value: p.digit, correct: true })
    }
    applyStep(st, step)
  }
  return {
    puzzle: made.puzzle,
    solution: made.solution,
    moveLog: log,
    graded: tier,
    durationMs: t,
    completed: true,
  }
}

/** A record with exactly the entries given, on a real board. */
function withLog(moveLog, tier = 'Easy', seed = 77) {
  const made = makePuzzle(tier, { seed })
  return { puzzle: made.puzzle, solution: made.solution, moveLog, graded: tier, durationMs: 60000 }
}

/** The first `n` empty cells of a puzzle, so a hand-built log is playable. */
const blanks = (record, n) => {
  const out = []
  for (let i = 0; i < 81 && out.length < n; i++) if (!record.puzzle[i]) out.push(i)
  return out
}

describe('what gets drawn at all', () => {
  it('draws nothing at all for a game with no log, rather than an empty frame', () => {
    // An empty frame reads as a broken feature. Nothing reads as "this game has
    // no picture", which is the truth.
    expect(toArt({ moveLog: [] })).toBeNull()
    expect(toArt({})).toBeNull()
    expect(toArt(null)).toBeNull()
    expect(toSvg(null)).toBe('')
    expect(toSvg(toArt({ moveLog: [] }))).toBe('')
  })

  it('draws nothing for a game where nothing was ever placed', () => {
    // Pencilling, checking and an auto-pencil are a log, but they are not a
    // solve path. This used to be the difference between an empty picture and
    // no picture at all.
    const r = withLog([
      { t: 1000, kind: 'autoPencil' },
      { t: 4000, kind: 'pencil', cell: 1, value: 3 },
      { t: 9000, kind: 'check' },
    ])
    expect(toArt(r)).toBeNull()
  })

  it('draws a single placement without a thread and without throwing', () => {
    const r = withLog([])
    const art = toArt({ ...r, moveLog: [{ t: 3000, kind: 'place', cell: blanks(r, 1)[0], value: 1 }] })
    expect(art.marks).toHaveLength(1)
    // One point is not a spline. The thread needs two placements to exist.
    expect(art.spine).toHaveLength(1)
    expect(toSvg(art)).toContain('<circle')
  })
})

describe('every mark is a real cell of the real game', () => {
  const record = ladderGame('Medium', 4242)
  const art = toArt(record)

  it('names a cell on the board for every mark', () => {
    for (const m of art.marks) {
      expect(Number.isInteger(m.cell)).toBe(true)
      expect(m.cell).toBeGreaterThanOrEqual(0)
      expect(m.cell).toBeLessThan(81)
      // The row and column carried on the mark have to agree with the cell, or
      // anything that draws a legend beside the picture will point at the
      // wrong square.
      expect(m.row).toBe(Math.floor(m.cell / 9))
      expect(m.col).toBe(m.cell % 9)
    }
  })

  it('marks only cells the player actually filled, in the order they filled them', () => {
    const played = record.moveLog.filter(m => m.kind === 'place' || m.kind === 'hint')
    expect(art.marks.map(m => m.cell)).toEqual(played.map(m => m.cell))
    expect(art.marks.map(m => m.order)).toEqual(played.map((_, i) => i + 1))
    // A given was never placed by anyone, so it can never be a mark.
    for (const m of art.marks) expect(record.puzzle[m.cell]).toBe(0)
  })

  it('splits the board into the clues you were given and the cells you had to fill', () => {
    expect(art.grid.length + art.clues.length).toBe(81)
    for (const c of art.clues) expect(record.puzzle[c.cell]).toBeGreaterThan(0)
    for (const g of art.grid) expect(record.puzzle[g.cell]).toBe(0)
  })

  it('keeps everything it draws inside the frame, and fills it', () => {
    // Both halves matter. Outside the frame is clipped, and well inside it is a
    // picture floating in a border of dead canvas. The spine is checked as well
    // as the marks because a spline bows outside the points it runs between.
    const all = [...art.marks, ...art.spine, ...art.grid, ...art.clues]
    const xs = all.map(p => p.x)
    const ys = all.map(p => p.y)
    expect(Math.min(...xs, ...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs, ...ys)).toBeLessThanOrEqual(1)
    expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(0.9)
  })

  it('draws the same picture every time, since a keepsake that changed would not be one', () => {
    expect(toArt(record)).toEqual(toArt(record))
    expect(toSvg(art)).toBe(toSvg(toArt(record)))
  })

  it('puts a placement in the middle of the board in the middle of the board', () => {
    // The one cell the turn cannot move, because it is the point everything
    // turns about. So a mark there has to land exactly on that cell's own dot,
    // and it only does if the path and the lattice went through the same
    // transform. Getting this wrong draws a picture that still looks fine.
    const r = withLog([])
    const drawn = toArt({
      ...r,
      moveLog: [
        { t: 2000, kind: 'place', cell: 40, value: 1 },
        { t: 4000, kind: 'place', cell: 0, value: 2 },
        { t: 6000, kind: 'place', cell: 80, value: 3 },
      ],
    })
    const centre = [...drawn.grid, ...drawn.clues].find(c => c.cell === 40)
    const mark = drawn.marks.find(m => m.cell === 40)
    expect(mark.x).toBeCloseTo(centre.x, 10)
    expect(mark.y).toBeCloseTo(centre.y, 10)

    // And the board underneath is drawn square: opposite corners sit either
    // side of the middle, the same distance away.
    const dot = cell => [...drawn.grid, ...drawn.clues].find(c => c.cell === cell)
    expect(dot(0).x + dot(80).x).toBeCloseTo(centre.x * 2, 10)
    expect(dot(0).y + dot(80).y).toBeCloseTo(centre.y * 2, 10)
    expect(dot(8).y).toBeCloseTo(dot(0).y, 10)
  })
})

describe('time', () => {
  it('charges a placement with everything that happened since the last entry', () => {
    // The gap before a placement is the thinking that produced it, pencil marks
    // included. This is the same rule the stall heatmap uses, and the two would
    // disagree about the same game if it changed here.
    const r = withLog([])
    const [a, b] = blanks(r, 2)
    const art = toArt({
      ...r,
      moveLog: [
        { t: 5000, kind: 'place', cell: a, value: 1 },
        { t: 8000, kind: 'pencil', cell: b, value: 4 },
        { t: 20000, kind: 'place', cell: b, value: 2 },
      ],
    })
    expect(art.marks.map(m => m.dwellMs)).toEqual([5000, 12000])
    expect(art.stats.medianDwellMs).toBe(12000)
    expect(art.stats.longestDwellMs).toBe(12000)
    expect(art.stats.longestCell).toBe(b)
  })

  it('draws a longer think as a wider thread', () => {
    const r = withLog([])
    const cells = blanks(r, 4)
    const art = toArt({
      ...r,
      moveLog: [
        { t: 2000, kind: 'place', cell: cells[0], value: 1 },
        { t: 4000, kind: 'place', cell: cells[1], value: 1 },
        { t: 6000, kind: 'place', cell: cells[2], value: 1 },
        { t: 66000, kind: 'place', cell: cells[3], value: 1 },
      ],
    })
    const w = art.marks.map(m => m.w)
    expect(w[3]).toBeGreaterThan(w[0])
  })

  it('adds about as much width for each doubling of the time, wherever you are', () => {
    // The whole reason the mapping is logarithmic rather than linear. Under a
    // linear map the step from four times the median to eight is four times the
    // step from one to two, so a single stall takes the width range and the
    // rest of the game is drawn at one weight. Measured here at 1.4 against the
    // 4.0 a linear map gives on the same dwells.
    const r = withLog([])
    const cells = blanks(r, 8)
    const dwells = [5000, 5000, 5000, 5000, 5000, 10000, 20000, 40000]
    let t = 0
    const art = toArt({
      ...r,
      moveLog: cells.map((cell, i) => {
        t += dwells[i]
        return { t, kind: 'place', cell, value: 1 }
      }),
    })
    expect(art.stats.medianDwellMs).toBe(5000)
    const [w1, w2, w4, w8] = [art.marks[4].w, art.marks[5].w, art.marks[6].w, art.marks[7].w]
    expect(w8 - w4).toBeLessThan(2.5 * (w2 - w1))
    // And it is still a rising scale, not a flat one.
    expect(w2).toBeGreaterThan(w1)
    expect(w8).toBeGreaterThan(w4)
  })

  it('survives the same cell being filled twice in a row without producing a hole', () => {
    // The centre cell is the one point the turn never moves, so two placements
    // there land on top of each other and the spline's knots collapse. Before
    // the floor on the knot spacing this divided by zero and the whole thread
    // came out as NaN, which draws nothing at all and reports no error.
    const r = withLog([])
    const art = toArt({
      ...r,
      moveLog: [
        { t: 1000, kind: 'place', cell: 40, value: 1 },
        { t: 2000, kind: 'place', cell: 40, value: 2 },
        { t: 3000, kind: 'place', cell: blanks(r, 1)[0], value: 3 },
      ],
    })
    for (const p of art.spine) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
    expect(toSvg(art)).not.toContain('NaN')
  })
})

describe('colour comes from the classification', () => {
  it('gives a mark the role its class earns', () => {
    const record = ladderGame('Hard', 909)
    const art = toArt(record)
    // A ladder-perfect player is never lucky and never wrong, so every mark
    // here should be earned. If this ever fails, either the classifier or the
    // role table has moved underneath the drawing.
    expect(new Set(art.marks.map(m => m.role))).toEqual(new Set(['earned', 'sharp']))
    for (const m of art.marks) expect(['routine', 'solid', 'sharp']).toContain(m.cls)
  })

  it('says it does not know rather than flattering a record it cannot classify', () => {
    // A record with no solution stored cannot be classified at all. The picture
    // still exists, and every mark says unknown rather than claiming the board
    // proved it.
    const r = withLog([])
    const cells = blanks(r, 3)
    const art = toArt({
      puzzle: r.puzzle,
      moveLog: cells.map((cell, i) => ({ t: (i + 1) * 3000, kind: 'place', cell, value: 1 })),
    })
    expect(art.marks.every(m => m.role === 'unknown')).toBe(true)
    expect(art.marks.every(m => m.cls === null)).toBe(true)
  })

  it('marks what filled a cell and nothing else that touched one', () => {
    // The thread is a record of attention, so only the entries that put a digit
    // on the board are marks. Erasing, undoing and auto-completing all name a
    // cell too, and drawing them would add placements that never happened.
    const r = withLog([])
    const cells = blanks(r, 4)
    const art = toArt({
      ...r,
      moveLog: [
        { t: 3000, kind: 'place', cell: cells[0], value: 1 },
        { t: 5000, kind: 'erase', cell: cells[0] },
        { t: 6000, kind: 'place', cell: cells[1], value: 1 },
        { t: 7000, kind: 'undo', cell: cells[1], changes: [[cells[1], 0]] },
        { t: 9000, kind: 'autoComplete', count: 2, changes: [[cells[2], 1], [cells[3], 1]] },
      ],
    })
    expect(art.marks.map(m => m.cell)).toEqual([cells[0], cells[1]])
    expect(art.stats.autoFilled).toBe(2)
  })

  it('marks a wrong digit with a shape as well as a colour', () => {
    // Colour alone is not a signal in this app: it fails in a mono print and it
    // fails for anyone who cannot separate the accent from the error colour.
    const r = withLog([])
    const cells = blanks(r, 3)
    const wrong = (r.solution[cells[1]] % 9) + 1
    const art = toArt({
      ...r,
      moveLog: [
        { t: 3000, kind: 'place', cell: cells[0], value: r.solution[cells[0]], correct: true },
        { t: 6000, kind: 'place', cell: cells[1], value: wrong, correct: false },
        { t: 9000, kind: 'place', cell: cells[2], value: r.solution[cells[2]], correct: true },
      ],
    })
    expect(art.marks[1].cls).toBe('mistake')
    expect(art.marks[1].role).toBe('mistake')
    // Drawn as an open ring: no fill, a stroke, and one circle per mistake.
    const ring = toSvg(art).match(/<g style="fill:none;stroke:var\(--error\)[^"]*">(.*?)<\/g>/)
    expect(ring).toBeTruthy()
    expect(ring[1].match(/<circle/g)).toHaveLength(1)
  })
})

describe('the SVG', () => {
  const art = toArt(ladderGame('Medium', 4242))

  it('never names a colour, only custom properties', () => {
    // Six themes, and a literal colour anywhere outside tokens.css is a bug.
    // This is the test that catches one, because five of the six themes are
    // never looked at while the feature is being built.
    for (const palette of Object.keys(PALETTES)) {
      const svg = toSvg(art, { palette })
      expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(svg).not.toMatch(/\b(?:rgba?|hsla?|color-mix|oklch|oklab)\(/i)
      expect(svg).not.toMatch(
        /\b(?:black|white|red|green|blue|gray|grey|silver|orange|yellow|purple|brown|pink|navy|teal|olive|maroon|lime|aqua|fuchsia|currentColor)\b/i
      )
      // Everything that takes a colour takes it from a variable. `none` is the
      // only other value allowed, and it is an absence rather than a colour.
      for (const [, value] of svg.matchAll(/(?:fill|stroke):([^;"]+)/g)) {
        expect(value.trim()).toMatch(/^(?:none|var\(--[a-z0-9-]+\))$/i)
      }
    }
  })

  it('only names custom properties that every theme actually defines', () => {
    // A misspelled property name renders black and throws nothing, and a
    // property defined in one theme but not another is invisible until someone
    // switches theme. Both are silent, so they are checked against the file.
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
      sel: m[1].trim(),
      props: new Set([...m[2].matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(p => p[1])),
    }))
    const base = blocks.find(b => b.sel === ':root')?.props || new Set()
    const themes = blocks.filter(b => b.sel.includes('[data-theme='))
    expect(themes.length).toBe(6)

    // Every entry of every palette, not only the ones this sample game happens
    // to draw: a game with no mistakes in it never renders the mistake colour,
    // so scraping one picture would check about half of them.
    const used = new Set(Object.values(PALETTES).flatMap(p => Object.values(p)))
    expect(used.size).toBeGreaterThan(5)
    for (const theme of themes) {
      for (const name of used) {
        expect(base.has(name) || theme.props.has(name), `${name} missing from ${theme.sel}`).toBe(true)
      }
    }

    // And the picture may only name colours the palette gave it.
    for (const [, name] of toSvg(art).matchAll(/var\((--[a-z0-9-]+)\)/g)) expect(used.has(name)).toBe(true)
  })

  it('refuses a palette that names a colour instead of a property', () => {
    // Without this the rule above holds only for the palettes shipped today.
    expect(() => toSvg(art, { palette: { thread: '#e2a63d' } })).toThrow(/custom property/)
    expect(() => toSvg(art, { palette: { earned: 'red' } })).toThrow(/custom property/)
    expect(() => toSvg(art, { palette: 'nonesuch' })).toThrow(/Unknown palette/)
  })

  it('offers every palette for every role, so a picture can never lose one', () => {
    const roles = Object.keys(PALETTES.solve)
    for (const [name, palette] of Object.entries(PALETTES)) {
      expect(Object.keys(palette).sort(), name).toEqual(roles.sort())
    }
  })

  it('draws one mark for every placement and nothing over', () => {
    // Marks are grouped by role to render, from a list of roles kept by hand.
    // A role missing from that list drops every mark that has it, silently:
    // the picture still draws, still looks like a solve path, and is missing
    // part of the game. Counting is the only thing that notices.
    const sharps = art.marks.filter(m => m.role === 'sharp').length
    expect(sharps).toBeGreaterThan(0)
    const circles = toSvg(art).match(/<circle/g).length
    // Every cell of the board is a dot, every placement is a bead, and a sharp
    // placement carries a ring as well.
    expect(circles).toBe(81 + art.marks.length + sharps)
  })

  it('scales to whatever size it is asked for, and says what it is', () => {
    expect(toSvg(art, { size: 1200 })).toContain('viewBox="0 0 1200 1200"')
    expect(toSvg(art, { size: 240 })).toContain('width="240"')
    expect(toSvg(art)).toContain('<title>Solve path: ')
    expect(toSvg(art)).toContain('role="img"')
    // Every coordinate has to be inside the box, at any size.
    for (const [, v] of toSvg(art, { size: 300 }).matchAll(/c[xy]="([\d.-]+)"/g)) {
      expect(Number(v)).toBeGreaterThanOrEqual(0)
      expect(Number(v)).toBeLessThanOrEqual(300)
    }
  })

  it('lays the thread down in rising steps of ink, so where you finished shows', () => {
    // The only channel the order has once the path is drawn. With one flat
    // opacity the picture is still pretty and no longer says which end of the
    // tangle is the end.
    const steps = [...toSvg(art).matchAll(/<path style="opacity:([\d.]+)"/g)].map(m => Number(m[1]))
    expect(steps).toHaveLength(4)
    expect(new Set(steps).size).toBe(4)
    expect([...steps].sort((a, b) => a - b)).toEqual(steps)
  })

  it('leaves the background out when asked, for printing onto paper', () => {
    expect(toSvg(art)).toContain('<rect')
    expect(toSvg(art, { background: false })).not.toContain('<rect')
  })

  it('stays small enough to sit in the document', () => {
    // It goes in the page rather than in an image, because a var() in a
    // detached image has nothing to resolve against.
    expect(toSvg(art, { size: 640 }).length).toBeLessThan(20000)
  })

  it('carries a version, so a picture kept from an older drawing can be spotted', () => {
    expect(art.v).toBe(ART_VERSION)
  })
})
