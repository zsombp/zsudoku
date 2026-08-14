import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { TierEmblem, BadgeMark, EmptyMark, TIER_EMBLEMS, BADGE_IDS } from './Emblems.jsx'
import { achievements } from '../stats/achievements.js'
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
  it('draws a mark for every achievement that exists', () => {
    // The same rule the tier emblems follow and the glossary follows: the drawn
    // set tracks the real one rather than a list copied beside it. An
    // achievement added to `achievements.js` with no entry here would render as
    // a hole in the grid, which nothing reports and nobody reads as a bug.
    for (const a of achievements([])) {
      expect(BADGE_IDS, `no mark for the "${a.id}" achievement`).toContain(a.id)
      expect(draw(BadgeMark, { id: a.id })).toContain('<svg')
    }
  })

  it('has no marks for achievements that do not exist', () => {
    // The other direction. A mark left behind by a deleted achievement is dead
    // art that still passes the test above.
    const real = new Set(achievements([]).map(a => a.id))
    for (const id of BADGE_IDS) {
      expect(real, `"${id}" has a mark and is not an achievement`).toContain(id)
    }
  })

  it('draws nothing for an id it has not been taught', () => {
    expect(draw(BadgeMark, { id: 'nonsense' })).toBe('')
    expect(draw(BadgeMark, { id: undefined })).toBe('')
  })

  it('gives the categories different silhouettes and shares within them', () => {
    // The point of eight marks for fifteen achievements: the four volume
    // badges are meant to look alike, and a volume badge is meant to look
    // nothing like the stopwatch.
    const art = id => draw(BadgeMark, { id })
    expect(art('first')).toBe(art('hundred'))
    expect(art('daily-7')).toBe(art('daily-30'))
    expect(art('first')).not.toBe(art('quick-medium'))
    expect(art('clean')).not.toBe(art('no-pencil'))
    // Eight distinct drawings across the fifteen.
    expect(new Set(BADGE_IDS.map(art)).size).toBe(8)
  })

  it('names no colour of its own', () => {
    const all = BADGE_IDS.map(id => draw(BadgeMark, { id })).join('')
    expect(all).not.toMatch(/#[0-9a-f]{3,6}/i)
    expect(all).toContain('currentColor')
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
