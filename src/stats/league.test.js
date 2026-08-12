import { describe, it, expect } from 'vitest'
import {
  cleanEntry,
  entriesFrom,
  flatten,
  groupPlayers,
  headToHead,
  isLeaguePath,
  leaguePathFor,
  mergeEntries,
  nameSlug,
  parseFile,
  period,
  serialiseFile,
  standings,
} from './league.js'

const day = n => `2026-08-${String(n).padStart(2, '0')}`

/**
 * A published result. The defaults are a clean finish on a Medium classic, so
 * each test only has to say the part it is about.
 *
 * The seed is derived from the day, because that is the property the whole
 * league rests on: the same day is the same puzzle for everyone.
 */
const res = (n, ms, over = {}) => ({
  dayKey: day(n),
  tier: 'Medium',
  variant: 'classic',
  seed: 1000 + n,
  durationMs: ms,
  mistakes: 0,
  hints: 0,
  completed: true,
  ...over,
})

const player = (name, entries) => ({ name, entries })

/** A finished daily as the game log records it. */
const game = (n, ms, over = {}) => ({
  id: `${n}-x`,
  daily: true,
  dayKey: day(n),
  graded: 'Medium',
  requested: 'Medium',
  variant: 'classic',
  seed: 1000 + n,
  endedAt: new Date(2026, 7, n, 20).getTime(),
  durationMs: ms,
  mistakes: 0,
  hints: 0,
  completed: true,
  moveLog: [{ t: 1, cell: 0, value: 5 }],
  puzzle: '00000',
  solution: '12345',
  ...over,
})

describe('naming a player file', () => {
  it('turns a display name into something typeable', () => {
    expect(nameSlug('Zsomb P.')).toBe('zsomb-p')
    expect(leaguePathFor('Zsomb P.')).toBe('league/zsomb-p.json')
  })

  it('refuses a name with nothing in it rather than writing league/.json', () => {
    // A path built from an empty name would collide with every other empty name
    // and look like a real file in the repository.
    expect(leaguePathFor('   ')).toBeNull()
    expect(leaguePathFor('!!!')).toBeNull()
  })

  it('recognises its own files and not the game shards', () => {
    expect(isLeaguePath('league/zsomb.json')).toBe(true)
    expect(isLeaguePath('games/2026-08.json')).toBe(false)
    expect(isLeaguePath('league/nested/zsomb.json')).toBe(false)
  })
})

describe('publishing your own results', () => {
  it('publishes the dailies and leaves casual games alone', () => {
    const entries = entriesFrom([game(1, 100), { ...game(2, 200), daily: false, dayKey: null }])
    expect(entries.map(e => e.dayKey)).toEqual([day(1)])
  })

  it('carries the numbers and nothing else', () => {
    // This file goes to a repository other people can read. A move log is a
    // recording of someone thinking, and it has no business travelling with a
    // finishing time.
    const [entry] = entriesFrom([game(1, 100)])
    expect(Object.keys(entry).sort()).toEqual(
      ['completed', 'dayKey', 'durationMs', 'hints', 'mistakes', 'seed', 'tier', 'variant'].sort()
    )
  })

  it('publishes the tier the grader gave, not the one that was asked for', () => {
    const [entry] = entriesFrom([game(1, 100, { requested: 'Expert', graded: 'Hard' })])
    expect(entry.tier).toBe('Hard')
  })

  it('takes the first completed attempt at a day, never the fastest', () => {
    // Replaying a puzzle you have already seen until the clock says something
    // you like is not a better time. A league that took the best of several
    // attempts would reward exactly that.
    const entries = entriesFrom([
      game(1, 600000, { id: 'a', endedAt: 100 }),
      game(1, 90000, { id: 'b', endedAt: 200 }),
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].durationMs).toBe(600000)
  })

  it('prefers a finish to an earlier attempt that was abandoned', () => {
    const entries = entriesFrom([
      game(1, 120000, { id: 'a', endedAt: 100, completed: false }),
      game(1, 300000, { id: 'b', endedAt: 200 }),
    ])
    expect(entries[0]).toMatchObject({ completed: true, durationMs: 300000 })
  })

  it('records a day nobody finished as played and unfinished', () => {
    const [entry] = entriesFrom([game(1, 240000, { completed: false })])
    expect(entry).toMatchObject({ completed: false, durationMs: 240000 })
  })
})

describe('reading a file someone else wrote', () => {
  it('round-trips what it writes', () => {
    const entries = [res(1, 100000), res(2, 200000)]
    const parsed = parseFile(serialiseFile('Zsomb', entries))
    expect(parsed.name).toBe('Zsomb')
    expect(parsed.entries).toEqual(entries)
  })

  it('refuses anything that is not a league file', () => {
    // The game shards live in the same repository, and reading one as a league
    // file would produce a player with no results rather than an error.
    expect(parseFile('not json at all')).toBeNull()
    expect(parseFile(JSON.stringify({ app: 'zsudoku', schema: 1, games: [] }))).toBeNull()
    expect(parseFile(JSON.stringify({ app: 'something-else', kind: 'league', entries: [] }))).toBeNull()
  })

  it('drops a row it cannot believe rather than the whole file', () => {
    // One NaN reaching the median poisons every column computed from it, and
    // nothing about the output would look wrong.
    const file = {
      app: 'zsudoku',
      kind: 'league',
      schema: 1,
      name: 'Sam',
      entries: [
        res(1, 100000),
        { ...res(2, 200000), durationMs: 'quick' },
        { ...res(3, 0) },
        { ...res(4, 100000), dayKey: 'yesterday' },
      ],
    }
    const parsed = parseFile(JSON.stringify(file))
    expect(parsed.entries.map(e => e.dayKey)).toEqual([day(1)])
  })

  it('keeps one row per day when a file lists a day twice', () => {
    const file = {
      app: 'zsudoku',
      kind: 'league',
      schema: 1,
      name: 'Sam',
      entries: [res(1, 100000, { completed: false }), res(1, 300000)],
    }
    const parsed = parseFile(JSON.stringify(file))
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].completed).toBe(true)
  })

  it('falls back to the file name when the file forgot to say who it is', () => {
    const parsed = parseFile(
      JSON.stringify({ app: 'zsudoku', kind: 'league', entries: [res(1, 1000)] }),
      'from-the-path'
    )
    expect(parsed.name).toBe('from-the-path')
  })
})

describe('one player, two devices', () => {
  it('keeps days the other device published', () => {
    const { entries, added } = mergeEntries([res(1, 100000)], [res(2, 200000)])
    expect(entries.map(e => e.dayKey)).toEqual([day(1), day(2)])
    expect(added).toHaveLength(1)
  })

  it('lets finishing replace a day that was published unfinished', () => {
    const { entries } = mergeEntries([res(1, 60000, { completed: false })], [res(1, 300000)])
    expect(entries[0]).toMatchObject({ completed: true, durationMs: 300000 })
  })

  it('never replaces a time that has already been published', () => {
    // The same anti-replay rule as picking an attempt, in the one place a second
    // device could quietly improve on a result the league has already seen.
    const { entries, added } = mergeEntries([res(1, 300000)], [res(1, 60000)])
    expect(entries[0].durationMs).toBe(300000)
    expect(added).toEqual([])
  })

  it('reports nothing added when there is nothing new, so no commit is made', () => {
    const { added } = mergeEntries([res(1, 100000), res(2, 200000)], [res(1, 100000)])
    expect(added).toEqual([])
  })
})

describe('the table', () => {
  const table = (players, opts = {}) => standings(flatten(players), { today: day(9), ...opts })

  it('gives the day to whoever finished it fastest', () => {
    const t = table([
      player('Ann', [res(1, 300000)]),
      player('Bo', [res(1, 200000)]),
      player('Cal', [res(1, 400000)]),
    ])
    expect(t.rows[0].name).toBe('Bo')
    expect(t.rows[0].wins).toBe(1)
    expect(t.days[0].winners).toEqual(['Bo'])
  })

  it('does not count a day you were the only one to play', () => {
    // Winning a race you were the only entrant in is not winning.
    const t = table([player('Ann', [res(1, 300000)]), player('Bo', [res(2, 200000)])])
    expect(t.rows.map(r => r.wins)).toEqual([0, 0])
    expect(t.rows.every(r => r.contested === 0)).toBe(true)
  })

  it('gives the day to the only player who finished it', () => {
    // Two people played, one got to the end. That is a win, and it is the same
    // rule head to head uses.
    const t = table([
      player('Ann', [res(1, 900000, { completed: false })]),
      player('Bo', [res(1, 400000)]),
    ])
    expect(t.rows[0].name).toBe('Bo')
    expect(t.rows[0].wins).toBe(1)
    // And showing up and not finishing is a contested day, not an absence.
    const ann = t.rows.find(r => r.name === 'Ann')
    expect(ann).toMatchObject({ contested: 1, wins: 0, winRate: 0 })
  })

  it('never treats a day you missed as a day you lost', () => {
    // Ann plays two of the four days and wins both. Nothing in her row may be
    // divided by the days she was not there for.
    const days = [1, 2, 3, 4]
    const t = table([
      player('Ann', [res(1, 100000), res(3, 100000)]),
      player('Bo', days.map(n => res(n, 200000))),
    ])
    const ann = t.rows.find(r => r.name === 'Ann')
    expect(ann).toMatchObject({ played: 2, completed: 2, contested: 2, wins: 2, winRate: 1 })
    expect(ann.medianMs).toBe(100000)
    // And Bo is not credited with the two days nobody contested him on.
    expect(t.rows.find(r => r.name === 'Bo')).toMatchObject({ contested: 2, wins: 0 })
  })

  it('shares a day when two people finish on the same millisecond', () => {
    const t = table([player('Ann', [res(1, 200000)]), player('Bo', [res(1, 200000)])])
    expect(t.days[0].winners.sort()).toEqual(['Ann', 'Bo'])
    expect(t.rows.every(r => r.wins === 1)).toBe(true)
  })

  it('takes the median over the days you finished, not the days you played', () => {
    const t = table([
      player('Ann', [res(1, 100000), res(2, 300000), res(3, 999999, { completed: false })]),
      player('Bo', [res(1, 150000), res(2, 350000), res(3, 150000)]),
    ])
    expect(t.rows.find(r => r.name === 'Ann').medianMs).toBe(200000)
  })

  it('counts a hint or a mistake as not clean', () => {
    const t = table([
      player('Ann', [res(1, 100000), res(2, 100000, { hints: 1 }), res(3, 100000, { mistakes: 2 })]),
      player('Bo', [res(1, 200000), res(2, 200000), res(3, 200000)]),
    ])
    const ann = t.rows.find(r => r.name === 'Ann')
    expect(ann).toMatchObject({ clean: 1, completed: 3, hints: 1, mistakes: 2 })
    expect(ann.cleanRate).toBeCloseTo(1 / 3)
  })

  it('does not let someone who only plays the easy day top the time column', () => {
    // The measurement that made pace necessary: three weeks of real dailies put
    // Monday's Gentle at score 0 and Sunday's Diabolical at 1830, so a raw
    // median over "the days you played" compares nothing between two people who
    // played different days. Here Ann is the slowest player on the one day she
    // turned up for, and her raw median is still four times better than Bo's.
    const t = table([
      player('Ann', [res(1, 120000)]),
      player('Bo', [res(1, 90000), res(2, 600000), res(3, 620000), res(4, 640000)]),
      player('Cal', [res(1, 100000), res(2, 700000), res(3, 720000), res(4, 740000)]),
    ])
    const ann = t.rows.find(r => r.name === 'Ann')
    const bo = t.rows.find(r => r.name === 'Bo')
    expect(ann.medianMs).toBeLessThan(bo.medianMs)
    expect(ann.pace).toBeGreaterThan(bo.pace)
    expect(ann.pace).toBeCloseTo(1.2)
  })

  it('measures pace only against days more than one person finished', () => {
    // A ratio against your own time is 1.00 and says nothing about anybody.
    const t = table([player('Ann', [res(1, 100000)]), player('Bo', [res(1, 200000, { completed: false })])])
    expect(t.rows.find(r => r.name === 'Ann').pace).toBeNull()
  })

  it('reports a streak over the whole history, not over the window', () => {
    // A window is a question about the table, not about the streak. Reporting a
    // ten day run as three because the table is showing three days would be
    // wrong in a way nothing else in the output would contradict.
    const entries = Array.from({ length: 10 }, (_, i) => res(i + 1, 100000))
    const t = table([player('Ann', entries)], { from: day(8), to: day(10), today: day(10) })
    const ann = t.rows[0]
    expect(ann.played).toBe(3)
    expect(ann.streak.current).toBe(10)
    expect(ann.totalDays).toBe(10)
  })

  it('still gives a streak to a friend whose day is ahead of yours', () => {
    // The daily is keyed on the local date, so someone six hours ahead publishes
    // a day before you have reached it. Judged against your calendar their last
    // day is in the future, which reads as no streak at all, and it would hit
    // the most consistent player in the league.
    const t = table([player('Kiwi', [res(8, 100000), res(9, 100000), res(10, 100000)])], {
      today: day(9),
    })
    expect(t.rows[0].streak.current).toBe(3)
  })

  it('leaves out a day where two people played different puzzles', () => {
    // Same date, different grid: someone is on an older build. Every number
    // would still compute, and every one of them would be meaningless.
    const t = table([
      player('Ann', [res(1, 100000)]),
      player('Bo', [res(1, 200000, { seed: 999999, tier: 'Hard' })]),
    ])
    expect(t.mismatched).toEqual([day(1)])
    expect(t.rows.every(r => r.wins === 0 && r.contested === 0)).toBe(true)
    // The day was still played, so it still counts as a day played.
    expect(t.rows.every(r => r.played === 1)).toBe(true)
  })

  it('compares files that record less than this one does', () => {
    // An older client might publish no seed and no board. That is not a
    // disagreement, so the day still counts.
    const t = table([
      player('Ann', [{ dayKey: day(1), durationMs: 100000, completed: true }]),
      player('Bo', [res(1, 200000)]),
    ])
    expect(t.mismatched).toEqual([])
    expect(t.rows[0].name).toBe('Ann')
    expect(t.rows[0].wins).toBe(1)
    // And the day still knows what it was, because somebody recorded it.
    expect(t.days[0]).toMatchObject({ tier: 'Medium', variant: 'classic' })
  })

  it('keeps a row for someone who has not played in the window', () => {
    const t = table([player('Ann', [res(1, 100000)]), player('Bo', [res(9, 100000)])], {
      from: day(8),
      to: day(9),
    })
    const ann = t.rows.find(r => r.name === 'Ann')
    expect(ann).toMatchObject({ played: 0, wins: 0, medianMs: null, cleanRate: null })
    expect(ann.lastDay).toBe(day(1))
  })

  it('holds up on an empty league without dividing by zero', () => {
    const t = standings([], { today: day(9) })
    expect(t.rows).toEqual([])
    expect(t.days).toEqual([])
  })

  it('takes the last n days as a period', () => {
    expect(period(7, day(9))).toEqual({ from: day(3), to: day(9) })
  })
})

describe('grouping and cleaning', () => {
  it('turns a pile of entries back into players', () => {
    const players = groupPlayers(flatten([player('Bo', [res(1, 1000)]), player('Ann', [res(1, 2000)])]))
    expect(players.map(p => p.name)).toEqual(['Ann', 'Bo'])
    expect(players[0].entries).toHaveLength(1)
  })

  it('drops an entry with nobody attached to it', () => {
    const t = standings([{ ...res(1, 1000) }, { ...res(1, 2000), player: 'Ann' }], { today: day(9) })
    expect(t.rows).toHaveLength(1)
  })

  it('refuses a finish with no time on the clock', () => {
    expect(cleanEntry(res(1, 0))).toBeNull()
    expect(cleanEntry(res(1, -5))).toBeNull()
    // An unfinished day with no time is possible: it is a game barely started.
    expect(cleanEntry(res(1, 0, { completed: false }))).not.toBeNull()
  })
})

describe('one against one', () => {
  const ann = entries => player('Ann', entries)
  const bo = entries => player('Bo', entries)

  it('only counts days both of them played', () => {
    const h = headToHead(
      ann([res(1, 100000), res(2, 100000), res(3, 100000)]),
      bo([res(2, 200000), res(4, 50000)])
    )
    expect(h.both).toBe(1)
    expect(h.onlyA).toEqual([day(1), day(3)])
    expect(h.onlyB).toEqual([day(4)])
    expect(h.wins).toEqual({ a: 1, b: 0, drawn: 0 })
  })

  it('does not score a day one of them missed, however fast the other was', () => {
    const h = headToHead(ann([res(1, 60000)]), bo([res(2, 60000)]))
    expect(h.wins).toEqual({ a: 0, b: 0, drawn: 0 })
    expect(h.decided).toBe(0)
  })

  it('gives the day to whoever finished when the other did not', () => {
    const h = headToHead(ann([res(1, 900000, { completed: false })]), bo([res(1, 800000)]))
    expect(h.wins.b).toBe(1)
    // And no time is compared: one of those numbers is a solve and the other is
    // when somebody gave up.
    expect(h.bothFinished).toBe(0)
    expect(h.medianA).toBeNull()
  })

  it('compares times only across days both of them finished', () => {
    const h = headToHead(
      ann([res(1, 100000), res(2, 900000, { completed: false })]),
      bo([res(1, 200000), res(2, 200000)])
    )
    expect(h.bothFinished).toBe(1)
    expect(h.medianA).toBe(100000)
    expect(h.medianB).toBe(200000)
  })

  it('reports a typical day rather than a ratio of two medians', () => {
    // With an even number of shared days a ratio of medians averages two days
    // that were nothing like each other. Here that would give 250/350, which is
    // a number neither day produced.
    const h = headToHead(ann([res(1, 100000), res(2, 400000)]), bo([res(1, 200000), res(2, 500000)]))
    expect(h.ratio).toBeCloseTo(0.65)
    expect(h.wins).toEqual({ a: 2, b: 0, drawn: 0 })
  })

  it('leaves out a day where they played different puzzles', () => {
    const h = headToHead(ann([res(1, 100000)]), bo([res(1, 200000, { seed: 4242 })]))
    expect(h.mismatched).toEqual([day(1)])
    expect(h.decided).toBe(0)
    expect(h.bothFinished).toBe(0)
  })

  it('honours the period it was given', () => {
    const h = headToHead(ann([res(1, 100000), res(9, 100000)]), bo([res(1, 50000), res(9, 200000)]), {
      from: day(5),
      to: day(9),
    })
    expect(h.both).toBe(1)
    expect(h.wins).toEqual({ a: 1, b: 0, drawn: 0 })
  })

  it('gives no answer at all rather than a wrong one when they never overlap', () => {
    const h = headToHead(ann([res(1, 100000)]), bo([res(2, 100000)]))
    expect(h.ratio).toBeNull()
    expect(h.medianA).toBeNull()
    expect(h.medianB).toBeNull()
  })

  it('counts an exact tie as drawn rather than giving it to whoever sorts first', () => {
    const h = headToHead(ann([res(1, 200000)]), bo([res(1, 200000)]))
    expect(h.wins).toEqual({ a: 0, b: 0, drawn: 1 })
  })
})
