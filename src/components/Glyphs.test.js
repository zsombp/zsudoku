import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { TechGlyph, GLYPH_IDS } from './Glyphs.jsx'
import { LADDER } from '../logic/techniques.js'

const draw = technique => renderToStaticMarkup(createElement(TechGlyph, { technique }))

describe('a glyph for every rung', () => {
  it('draws one for each rung of the ladder, and none for a rung that is gone', () => {
    // Tracks techniques.js rather than a list copied beside it: a rung added
    // there with no glyph would show as a gap in the practice list.
    for (const k of LADDER) expect(draw(k), `no glyph for ${k}`).toContain('<svg')
    for (const k of GLYPH_IDS) expect(LADDER, `a glyph for ${k}, which is not a rung`).toContain(k)
  })

  it('draws nothing for a key it does not know', () => {
    expect(draw('nope')).toBe('')
    expect(draw(undefined)).toBe('')
  })

  it('gives every rung a different mark', () => {
    const shapes = LADDER.map(draw)
    expect(new Set(shapes).size).toBe(LADDER.length)
  })

  it('takes its colour from the theme and never moves', () => {
    const all = LADDER.map(draw).join('')
    expect(all).not.toMatch(/#[0-9a-f]{3,6}/i)
    expect(all).toContain('currentColor')
    expect(all).not.toMatch(/<animate|animation/)
    expect(all).toContain('aria-hidden="true"')
  })
})
