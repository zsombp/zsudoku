import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { TierEmblem, BadgeMark, EmptyMark, TIER_EMBLEMS } from './Emblems.jsx'
import Companion from './Companion.jsx'
import { TIERS } from '../logic/difficulty.js'

const draw = (C, props) => renderToStaticMarkup(createElement(C, props))

describe('a mark for every tier, and only for real tiers', () => {
  it('draws one for each tier the grader can actually award', () => {
    // The set has to track `difficulty.js`, not a list copied beside it. A
    // seventh tier added there with no emblem here would otherwise show as a
    // gap on the dashboard that nothing reports.
    for (const t of TIERS) {
      expect(TIER_EMBLEMS, `no emblem for ${t.name}`).toContain(t.name)
      expect(draw(TierEmblem, { tier: t.name })).toContain('<svg')
    }
  })

  it('draws nothing at all for a tier it has not been taught', () => {
    // Deliberately not a fallback shape. A generic mark beside an unknown tier
    // is indistinguishable from a real one, which turns a bug into a design.
    expect(draw(TierEmblem, { tier: 'Impossible' })).toBe('')
    expect(draw(TierEmblem, { tier: undefined })).toBe('')
  })

  it('gives every tier a visibly different mark', () => {
    // Gentle and Easy shipped identical for one build: Easy's arc traced the
    // circle's own edge and vanished at the 22px these render at. Comparing the
    // drawn geometry is the only version of this check that would have caught
    // it, since both were valid SVG and both rendered.
    const shapes = TIER_EMBLEMS.map(t => draw(TierEmblem, { tier: t }))
    expect(new Set(shapes).size).toBe(TIER_EMBLEMS.length)
  })

  it('takes its colour from the theme rather than naming one', () => {
    // Every mark has to recolour with the six themes. A literal hex here is the
    // same bug as a hardcoded colour anywhere outside tokens.css.
    const all = TIER_EMBLEMS.map(t => draw(TierEmblem, { tier: t })).join('')
    expect(all).not.toMatch(/#[0-9a-f]{3,6}/i)
    expect(all).toContain('currentColor')
  })
})

describe('badges and the empty mark', () => {
  it('draws the four badges and refuses an unknown one', () => {
    for (const k of ['clean', 'fast', 'unaided', 'streak']) {
      expect(draw(BadgeMark, { kind: k })).toContain('<svg')
    }
    expect(draw(BadgeMark, { kind: 'nonsense' })).toBe('')
  })

  it('draws the empty mark at a stated aspect rather than a square', () => {
    const svg = draw(EmptyMark, { size: 120 })
    expect(svg).toContain('width="120"')
    expect(svg).toContain('height="76"')
  })
})

describe('the companion', () => {
  it('draws every mood, and falls back to idle rather than to nothing', () => {
    for (const m of ['idle', 'solved', 'streak', 'thinking', 'stuck']) {
      expect(draw(Companion, { mood: m })).toContain('<svg')
    }
    // Unlike the tier emblem, an unknown mood is not a bug worth a blank space:
    // the companion is decoration, and a missing one on the win screen would be
    // a hole where the emblem's absence is a silent wrong label.
    expect(draw(Companion, { mood: 'elated' })).toBe(draw(Companion, { mood: 'idle' }))
  })

  it('lights up only for the two moods that mean something went right', () => {
    const lit = m => draw(Companion, { mood: m }).includes('stroke="var(--accent)"')
    expect(lit('solved')).toBe(true)
    expect(lit('streak')).toBe(true)
    expect(lit('idle')).toBe(false)
    expect(lit('stuck')).toBe(false)
  })

  it('names no colour of its own', () => {
    const all = ['idle', 'solved', 'streak', 'thinking', 'stuck']
      .map(m => draw(Companion, { mood: m }))
      .join('')
    expect(all).not.toMatch(/#[0-9a-f]{3,6}/i)
  })
})
