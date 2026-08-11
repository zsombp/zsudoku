import { describe, it, expect } from 'vitest'
import { narrate, headline } from './narrate.js'

const move = (over = {}) => ({ cls: 'routine', gap: 5000, cell: 0, cellName: 'r1c1', value: 5, ...over })
const game = (n, over = {}) => ({
  moves: Array.from({ length: n }, (_, i) => move({ n: i + 1 })),
  counts: { routine: n },
  ...over,
})
const info = (over = {}) => ({ timeToFirstMove: 20000, longest: { gap: 10000, cell: 0 }, ...over })

describe('the account of a game', () => {
  it('says nothing about a game too short to have had a shape', () => {
    expect(narrate({ completed: true }, game(5), null, info())).toEqual([])
  })

  it('opens on what actually happened first', () => {
    const slow = narrate({ completed: true }, game(20), null, info({ timeToFirstMove: 120000 }))
    expect(slow[0]).toMatch(/before writing anything/)
    const fast = narrate({ completed: true }, game(20), null, info({ timeToFirstMove: 3000 }))
    expect(fast[0]).toMatch(/within seconds/)
  })

  it('calls a bad opening bad, and blames the right thing', () => {
    const g = game(20)
    g.moves[0].cls = 'mistake'
    g.moves[1].cls = 'mistake'
    const out = narrate({ completed: true }, g, null, info())
    expect(out[0]).toMatch(/opening went badly/)
    expect(out[0]).toMatch(/misread/)
  })

  it('mentions a long stall only when it was genuinely long', () => {
    const short = narrate({ completed: true }, game(20), null, info({ longest: { gap: 20000, cell: 0 } }))
    expect(short.join(' ')).not.toMatch(/longest you sat/)
    const long = narrate({ completed: true }, game(20), null, info({ longest: { gap: 90000, cell: 0 } }))
    expect(long.join(' ')).toMatch(/longest you sat/)
  })

  it('gives credit for what was found unaided', () => {
    const g = game(20)
    g.moves[3] = move({ cls: 'sharp', pattern: { technique: 'xWing' } })
    g.moves[4] = move({ cls: 'sharp', pattern: { technique: 'xWing' } })
    expect(narrate({ completed: true }, g, null, info()).join(' ')).toMatch(/needed a real pattern/)
  })

  it('ends on how it ended', () => {
    expect(narrate({ forfeited: true }, game(20), null, info()).pop()).toMatch(/gave it up/)
    expect(narrate({ completed: false }, game(20), null, info()).pop()).toMatch(/unfinished/)
    expect(narrate({ completed: true }, game(20), null, info()).pop()).toMatch(/clean/)
  })

  it('gets the article right on every part of the day', () => {
    for (const [hour, word] of [[2, 'a late night'], [9, 'a morning'], [15, 'an afternoon'], [21, 'an evening']]) {
      const line = headline({ graded: 'Hard', durationMs: 60000, endedAt: new Date(2026, 7, 11, hour).getTime() })
      expect(line).toContain(word)
    }
  })
})
