import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Explain, Term, TermButton, TermGroup, TermLegend, termLabel } from './Term.jsx'
import { StatTile, Fact } from './stats/charts.jsx'
import { INSIGHT_TERM } from './StatsView.jsx'
import { GLOSSARY, TERM_IDS, define } from '../logic/glossary.js'

// Rendered rather than mounted, and written with `createElement` rather than
// JSX, because `vite.config.js` runs vitest over `src/**/*.test.js` only.
// `renderToStaticMarkup` runs the real component with its real hooks, needs no
// DOM and adds no dependency, which matches the rest of this repo: every other
// component test here checks a pure export.
const html = node => renderToStaticMarkup(node)

// `fileURLToPath`, not `url.pathname`: this project lives under a directory
// with a space in its name, and the raw pathname keeps it percent-encoded, so
// every read fails with ENOENT on a path that looks correct in the message.
const HERE = dirname(fileURLToPath(import.meta.url))
const sourceFiles = () => {
  const out = []
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.jsx')) out.push(path)
    }
  }
  walk(HERE)
  return out.map(path => ({ path, name: path.split('/').pop(), text: readFileSync(path, 'utf8') }))
}

/** Comments are prose about the code and may quote whatever they like. */
const codeOnly = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('a label and its definition come from one place', () => {
  it('writes the glossary label when nothing overrides it', () => {
    // The failure this stops: a tile headed "Win rate" wired to the definition
    // of "Median solve". Both come from one id, so the two cannot disagree
    // unless somebody passes a label on purpose.
    expect(html(h(Term, { id: 'winRate' }))).toContain('Win rate')
    expect(html(h(StatTile, { term: 'medianSolve', value: '8:09' }))).toContain('Median solve')
    expect(html(h(Fact, { term: 'pencilMarks', value: 19 }))).toContain('Pencil marks')
  })

  it('lets a caller override the word when the figure is not the term itself', () => {
    // "Typical dwell" is the middle of a game's dwell rather than a dwell, and
    // "Solved" is "Puzzles solved" in a 105px column. Both are deliberate, and
    // the next test fixes how many such places there may be.
    const out = html(h(Fact, { term: 'dwell', label: 'Typical dwell', value: '2.7s' }))
    expect(out).toContain('Typical dwell')
    expect(out).toContain(define('dwell').definition)
  })

  it('keeps the list of overridden labels short and named', () => {
    // A drift guard rather than a style rule. Every one of these is a place
    // where the word on screen is not the glossary's, which is the one crack
    // through which a label and its definition can part company, so adding one
    // has to be a decision rather than a habit.
    const overrides = []
    for (const { name, text } of sourceFiles()) {
      // A term and a label on the same element, in either order.
      const re = /term="([A-Za-z]+)"[^>]*?\blabel=|label=[^>]*?\bterm="([A-Za-z]+)"/gs
      for (const m of text.matchAll(re)) overrides.push(`${name}:${m[1] || m[2]}`)
    }
    expect(overrides.sort()).toEqual([
      'Dashboard.jsx:clean',
      'Dashboard.jsx:currentStreak',
      'Dashboard.jsx:puzzlesSolved',
      'SolveArt.jsx:dwell',
    ])
  })

  it('answers with the plain fallback when a term is renamed away', () => {
    expect(termLabel('noSuchTerm', 'Something')).toBe('Something')
    expect(termLabel('winRate')).toBe('Win rate')
  })
})

describe('every explanation is reachable by touch', () => {
  it('makes a term a real button carrying the definition, not a bare word', () => {
    // The rule from docs/VISION.md: never hover alone. The title rides along
    // for a pointer, and the button is what a thumb gets.
    const out = html(h(Term, { id: 'winRate' }))
    expect(out).toMatch(/<button[^>]*aria-expanded="false"/)
    expect(out).toContain(define('winRate').definition)
  })

  it('makes the whole tile the target, because a 10px label is not one', () => {
    const out = html(h(StatTile, { term: 'winRate', value: '86%' }))
    expect(out).toMatch(/^<button/)
    expect(out).toContain('class="termBox tile"')
  })

  it('says the labels can be pressed while nothing is open', () => {
    // The group's one line holds the prompt or the answer, never neither. Take
    // the prompt away and the dotted underline is the only sign there is
    // anything there, which is a marker nobody has been told about.
    const out = html(
      h(TermGroup, { hint: 'Tap a tile for what it counts.' },
        h(StatTile, { term: 'winRate', value: '86%' }))
    )
    expect(out).toContain('Tap a tile for what it counts.')
    expect(out).not.toContain('termNote')
  })

  it('prints the definition outright wherever the container spans the column', () => {
    // Measured at 375px: a heading plus its longest definition is 72.5px
    // against 13px bare, so this one is simply always on.
    expect(html(h(Explain, { id: 'calendarHeatmap' })))
      .toContain(define('calendarHeatmap').definition)
  })
})

describe('a term nothing defines leaves no hole and no dead control', () => {
  it('renders the words and no button when the id is unknown', () => {
    // A trigger that opens an empty line is worse than a plain label. This is
    // the render-time half; glossary.test.js is what actually catches a missing
    // entry.
    expect(html(h(Term, { id: 'noSuchTerm' }, 'gave up'))).toBe('gave up')
    expect(html(h(Term, { id: 'noSuchTerm' }))).toBe('')
  })

  it('renders nothing at all rather than an empty bordered paragraph', () => {
    expect(html(h(Explain, { id: 'noSuchTerm' }))).toBe('')
    expect(html(h(TermLegend, { ids: ['noSuchTerm'] }))).toBe('')
  })

  it('falls back to a plain box when a whole tile has no term', () => {
    const out = html(h(TermButton, { id: 'noSuchTerm', className: 'tile' }, h('span', null, 'x')))
    expect(out).toMatch(/^<div class="tile"/)
    expect(out).not.toContain('<button')
  })
})

describe('the interface asks for terms that exist', () => {
  // Every literal id written into a component, checked against the module. The
  // failure this stops is silent: a renamed glossary entry leaves `define` to
  // answer null, `Explain` to render nothing, and a statistics screen to go
  // back to bare numbers with nothing anywhere throwing.
  const used = () => {
    const found = new Map()
    for (const { name, text } of sourceFiles()) {
      const re = /<(?:Term|TermButton|Explain)\s+id="([A-Za-z][A-Za-z0-9]*)"|\bterm="([A-Za-z][A-Za-z0-9]*)"/g
      for (const m of text.matchAll(re)) found.set(m[1] || m[2], name)
    }
    return found
  }

  it('names a defined term everywhere it hardcodes one', () => {
    for (const [id, file] of used()) {
      expect(GLOSSARY[id], `${file} asks for "${id}" and the glossary has no such term`).toBeTruthy()
    }
  })

  it('is actually reading the components, so the check is not decorative', () => {
    // A scan that silently matches nothing passes forever. These four are on
    // four different screens, so a broken pattern or a moved directory fails
    // here rather than quietly approving everything.
    const ids = used()
    expect(ids.size).toBeGreaterThan(40)
    for (const id of ['winRate', 'placements', 'leaguePace', 'due']) {
      expect(ids.has(id), `nothing on any screen asks for "${id}"`).toBe(true)
    }
  })

  it('ties every coach insight to the measure it is actually about', () => {
    // Written out in StatsView rather than derived from the insight id, because
    // the two do not line up: `timeShape` has an insight called `earned` that
    // is about a long think, while the glossary's `earned` is a colour in the
    // solve picture. Mapping by name would have explained one with the other
    // and nothing would have failed.
    const coach = readFileSync(join(HERE, '..', 'stats', 'coach.js'), 'utf8')
    for (const [insight, term] of Object.entries(INSIGHT_TERM)) {
      expect(define(term), `${insight} points at "${term}", which is not a term`).toBeTruthy()
      expect(coach.includes(`id: '${insight}'`), `no coach insight is called "${insight}"`).toBe(true)
    }
  })
})

describe('a screen that uses a term has imported it', () => {
  it('imports every piece of this module it names', () => {
    // Found the hard way, and worth a test rather than a resolution to be
    // careful. `<TermGroup>` was added to NewGameSheet.jsx with no import: the
    // build was clean, all 655 tests passed, and the new-game sheet rendered a
    // blank screen the moment it was opened, because an undefined component is
    // a runtime ReferenceError and nothing before runtime looks for one. Every
    // one of these screens is behind a tap that no test performs.
    const names = ['Term', 'TermGroup', 'TermButton', 'TermLegend', 'Explain', 'termLabel']
    for (const { name, text } of sourceFiles()) {
      if (name === 'Term.jsx') continue
      const imported = new Set()
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*Term\.jsx'/g)) {
        for (const part of m[1].split(',')) imported.add(part.trim())
      }
      for (const symbol of names) {
        const used = new RegExp(symbol === 'termLabel' ? '\\btermLabel\\(' : `<${symbol}[\\s/>]`)
        if (!used.test(text)) continue
        expect(imported.has(symbol), `${name} uses ${symbol} without importing it`).toBe(true)
      }
    }
  })
})

describe('no screen keeps a second copy of a definition', () => {
  it('states no definition the glossary owns as a literal in a component', () => {
    // The concrete failure: the toolbar's hold-to-explain line for Auto and the
    // glossary's `autoPencil` made the same claim in different words, and the
    // league table carried its own four-line key for four terms defined here.
    // Both read from the module now, and this fails if either comes back.
    for (const { name, text } of sourceFiles()) {
      const code = codeOnly(text)
      for (const id of TERM_IDS) {
        expect(
          code.includes(GLOSSARY[id].definition),
          `${name} spells out the definition of "${id}" instead of reading it`
        ).toBe(false)
      }
    }
  })

  it('reads a technique, a tier, a variant and a class through the glossary', () => {
    // Those four families keep their sentence in their own module and the
    // glossary points at it. A component reaching for `.about` or `.blurb`
    // directly is a second door to the same copy, and two doors drift.
    for (const { name, text } of sourceFiles()) {
      expect(codeOnly(text), `${name} reads a blurb or an about directly`)
        .not.toMatch(/\.(about|blurb)\b/)
    }
  })
})
