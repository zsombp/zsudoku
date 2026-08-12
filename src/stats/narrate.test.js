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

/**
 * The rhythm paragraph reads the move log rather than the analysis, so these
 * records carry both: `moves` for everything else in the account, and a real
 * `moveLog` for `flowSummary` to find a cadence in.
 */
const logOf = gaps => {
  let t = 0
  return gaps.map((gap, i) => {
    t += gap
    return { t, kind: 'place', cell: i, value: (i % 9) + 1, correct: true }
  })
}
const rep = (n, gap) => Array.from({ length: n }, () => gap)

describe('the account of the rhythm', () => {
  it('says nothing at all about a game with no move log to read', () => {
    // Games recorded before move logging kept only their summary, and the
    // account of one must not gain a paragraph about a cadence nobody has.
    const out = narrate({ completed: true }, game(20), null, info())
    expect(out.join(' ')).not.toMatch(/rhythm|pace broke/)
  })

  it('names the run when the cadence actually found one', () => {
    // Twenty even placements at four seconds inside a game that is otherwise
    // slow. That is what the detector was calibrated to find.
    const moveLog = logOf([...rep(12, 20000), ...rep(20, 4000), ...rep(12, 20000)])
    const out = narrate({ completed: true, moveLog }, game(44), null, info())
    expect(out.join(' ')).toMatch(/You found a rhythm: \d+ placements in a row/)
    expect(out.join(' ')).toMatch(/of the digits in the game went in like that/)
  })

  it('calls a game that ran at one pace throughout what it was', () => {
    // A real Hard solved at an even 9.2 seconds a placement came back as one
    // segment covering all 58 of them, and the paragraph described the whole
    // game as if it were a passage inside it.
    const out = narrate({ completed: true, moveLog: logOf(rep(44, 9000)) }, game(44), null, info())
    expect(out.join(' ')).toMatch(/The whole thing ran at one pace/)
    expect(out.join(' ')).not.toMatch(/placements in a row/)
  })

  it('never calls a slow game flow, however even its rhythm was', () => {
    // Written the other way round first, asserting that a perfectly metronomic
    // game reports nothing, and it failed: 44 placements at exactly 9 seconds
    // came back as 100% flow. That is the module behaving as documented rather
    // than a bug, because a whole game running that evenly and that quickly is
    // flowing. The real floor is absolute: the same metronome at 16 seconds a
    // placement is slower than the app's own definition of a long pause, and
    // must never be called flow whatever its spread.
    const out = narrate({ completed: true, moveLog: logOf(rep(44, 16000)) }, game(44), null, info())
    expect(out.join(' ')).not.toMatch(/You found a rhythm/)
  })

  it('says where the clock went when most of it went on being stuck', () => {
    const moveLog = logOf([...rep(10, 5000), ...rep(8, 120000), ...rep(10, 5000)])
    const out = narrate({ completed: true, moveLog }, game(28), null, info())
    expect(out.join(' ')).toMatch(/the pace broke/)
  })

  it('keeps the opening first and the ending last, whatever it adds in between', () => {
    // The account is an account: it reports what happened in the order it
    // happened, and a paragraph inserted in the middle must not change that.
    const moveLog = logOf([...rep(12, 20000), ...rep(20, 4000), ...rep(12, 20000)])
    const out = narrate({ completed: true, moveLog }, game(44), null, info({ timeToFirstMove: 3000 }))
    expect(out[0]).toMatch(/within seconds/)
    expect(out[out.length - 1]).toMatch(/clean/)
  })
})
