import { describe, it, expect } from 'vitest'
import { withPalette } from './SolveArt.jsx'
import { PALETTES } from '../stats/solveart.js'

const VALUES = {
  '--panel': '#1b1e27',
  '--line': '#2a2e3a',
  '--sub': '#8b90a0',
  '--accent': '#e2a63d',
  '--t1': '#22a06b',
  '--t3': '#e0479e',
  '--t4': '#c98418',
  '--error': '#e2564a',
  '--ink': '#e9eaee',
  '--line-strong': '#4a5062',
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><g style="fill:var(--accent)"/></svg>'

describe('saving the picture as a file of its own', () => {
  it('carries the value of every property the drawing names', () => {
    // Inside the app var(--accent) resolves against the document. In a file on
    // its own nothing defines it, and an SVG whose colours all resolve to
    // nothing renders as an empty frame with no error anywhere.
    const out = withPalette(SVG, 'solve', n => VALUES[n])
    for (const name of new Set(Object.values(PALETTES.solve))) {
      expect(out).toContain(`${name}:${VALUES[name]}`)
    }
  })

  it('puts them on the root element, where they cover the whole drawing', () => {
    const out = withPalette(SVG, 'solve', n => VALUES[n])
    expect(out.startsWith('<svg style="--')).toBe(true)
    // The renderer's own markup is untouched: this adds a declaration, it does
    // not rewrite colours into the file.
    expect(out).toContain('fill:var(--accent)')
  })

  it('leaves out a property that resolves to nothing rather than writing it empty', () => {
    // "--accent:" is not a declaration, and one of them invalidates the whole
    // style attribute, which would lose every other colour with it.
    const out = withPalette(SVG, 'solve', n => (n === '--accent' ? '' : VALUES[n]))
    expect(out).not.toContain('--accent:;')
    expect(out).toContain('--panel:#1b1e27')
  })

  it('hands back the drawing unchanged when nothing resolves at all', () => {
    // Rather than an empty style attribute, which is a lie about having tried.
    expect(withPalette(SVG, 'solve', () => '')).toBe(SVG)
  })

  it('names each property once even when two roles share it', () => {
    // The solve palette points thread and earned at --accent, and a style
    // attribute repeating a declaration is at best noise.
    const out = withPalette(SVG, 'solve', n => VALUES[n])
    expect(out.match(/--accent:/g)).toHaveLength(1)
  })
})
