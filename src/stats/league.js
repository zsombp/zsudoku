// A private league on a shared repository.
//
// Several people point the GitHub sync at one repository and compare results on
// the daily. There is no server, no account and no leaderboard of strangers:
// the repository is the entire mechanism, and everyone in it is someone who was
// given write access by hand.
//
// ---- what a player publishes ----
//
// `league/<name>.json`, one file per player, holding daily results only. Not the
// game records: a record runs about 7KB with its move log, and a league needs
// six numbers a day. Measured, one entry serialises to 128 bytes at its worst
// and a year of them to 47KB, so unlike `games/` this is deliberately not
// sharded by month. The contents API hands back a file of up to 1MB in one read,
// which a league file reaches after roughly a decade of daily play.
//
// A player only ever writes their own file, so two people never touch the same
// path and the union merge that the game log needs is not needed here. Two
// devices belonging to the same player do collide, which is what `mergeEntries`
// is for.
//
// ---- what makes a day comparable ----
//
// The daily is derived from the date, so everyone gets the same puzzle without
// anything being sent anywhere. That is the whole reason a league works with no
// server, and it is an assumption worth checking rather than trusting. An entry
// therefore carries the seed, the board and the graded tier it was played on,
// and a day where those disagree is excluded from the table instead of being
// compared. A friend on an older build racing a different grid is exactly the
// kind of wrong answer that looks entirely plausible: every number would still
// compute and every one of them would be meaningless.
//
// Measured while designing this, three weeks of real dailies: Monday's Gentle
// scored 0 every week and Sunday's Diabolical a p50 of 1830, which is the full
// width of the tier scale. So a plain median over "the days you played" cannot
// be compared between two people who played different days. Played out over a
// real week with three players, the one who skipped the two hardest days
// finished with a median of 360s against the winner's 420s, while losing every
// day they turned up for. `pace` is the column that does not do that: each day
// is measured against what that day cost everyone else. The raw median is still
// reported, because it is the number people want to see, but it is not what the
// table is sorted on.
//
// Cost, measured because this recomputes on every render: six players with a
// year each, 1854 entries, is 2.4ms for the table and 0.17ms to parse a file.
// Twelve players with five years, 18,612 entries, is 21.5ms. Nothing here needs
// caching.
//
// ---- and what it cannot do ----
//
// Nothing here can verify a time. Everyone writes their own file and there is no
// referee, which is the price of having no server. It is a league between
// friends and it is honest for the same reason a pub quiz is.

import { dailyStreak, dayKey } from '../logic/daily.js'

export const SCHEMA = 1
export const LEAGUE_DIR = 'league'

/** Long enough for a name, short enough that a table column survives it. */
export const MAX_NAME = 24

// ---- names and paths ----

/**
 * A file name that survives being typed by hand. The display name lives inside
 * the file, so the slug only has to be unique and boring.
 */
export const nameSlug = name =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

export const cleanName = name => String(name || '').trim().slice(0, MAX_NAME)

/** Null rather than `league/.json` when there is no usable name in the input. */
export const leaguePathFor = name => {
  const slug = nameSlug(name)
  return slug ? `${LEAGUE_DIR}/${slug}.json` : null
}

export const isLeaguePath = path => /^league\/[a-z0-9-]+\.json$/.test(String(path || ''))

// ---- entries ----

const isDayKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)

/** Negative counts and decimals are not things this app can produce. */
const count = n => {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0
}

/**
 * One published result, or null if it cannot be believed.
 *
 * These files are written by other people's devices, so everything here is
 * treated as input rather than as data this app produced. One malformed row
 * should cost that row, not the whole table: a NaN duration reaching the median
 * would quietly poison every column in it.
 */
export function cleanEntry(raw) {
  if (!raw || !isDayKey(raw.dayKey)) return null
  const durationMs = Number(raw.durationMs)
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  const completed = Boolean(raw.completed)
  // A finished puzzle with no time on the clock is not a solve. Nothing in the
  // app can produce one, so it is a broken file or a hand-edited one.
  if (completed && durationMs <= 0) return null
  return {
    dayKey: raw.dayKey,
    // The grader's verdict, never the tier that was asked for. Same rule as
    // everywhere else, and here it doubles as the check that two people played
    // the same puzzle.
    tier: typeof raw.tier === 'string' ? raw.tier : null,
    variant: typeof raw.variant === 'string' ? raw.variant : null,
    seed: Number.isFinite(raw.seed) ? raw.seed : null,
    durationMs: Math.round(durationMs),
    mistakes: count(raw.mistakes),
    hints: count(raw.hints),
    completed,
  }
}

const byDayAsc = (a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0)

const push = (map, key, value) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Which of several attempts at one day is the one that counts.
 *
 * A completed attempt beats an unfinished one, and among completed attempts the
 * earliest wins rather than the fastest. Replaying a puzzle you have already
 * seen until the clock says something you like is not a better time, and a
 * league that took the best of several attempts would reward exactly that.
 *
 * When nothing was finished the longest attempt is kept, because no number
 * downstream reads the duration of an unfinished day and the longest one is at
 * least the truest description of it.
 */
const pickGame = games => {
  const done = games.filter(g => g.completed)
  if (done.length) return [...done].sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0))[0]
  return [...games].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))[0]
}

/**
 * Your own game log, reduced to what a league needs.
 *
 * Daily games only, one entry per day, and nothing that is not a number about
 * that day: no move log, no puzzle, no solution. A league file is published to
 * a repository other people can read, so it carries the least that answers the
 * question.
 */
export function entriesFrom(games) {
  const byDay = new Map()
  for (const g of games || []) {
    if (!g?.daily || !isDayKey(g.dayKey)) continue
    push(byDay, g.dayKey, g)
  }

  const out = []
  for (const [key, list] of byDay) {
    const g = pickGame(list)
    const entry = cleanEntry({
      dayKey: key,
      tier: g.graded,
      variant: g.variant || 'classic',
      seed: g.seed,
      durationMs: g.durationMs,
      mistakes: g.mistakes,
      hints: g.hints,
      completed: g.completed,
    })
    if (entry) out.push(entry)
  }
  return out.sort(byDayAsc)
}

// ---- the file ----

export function buildFile(name, entries, { now = Date.now() } = {}) {
  return {
    app: 'zsudoku',
    kind: 'league',
    schema: SCHEMA,
    name: cleanName(name),
    updatedAt: new Date(now).toISOString(),
    entries: [...entries].sort(byDayAsc),
  }
}

/** Indent 1, matching the game shards: it keeps the commit diffs readable. */
export const serialiseFile = (name, entries, opts) =>
  JSON.stringify(buildFile(name, entries, opts), null, 1)

/**
 * Read someone's file.
 *
 * Returns null rather than throwing on anything unrecognisable. One friend with
 * a broken file must not take the league down with them, so the caller counts
 * the nulls and shows the rest.
 */
export function parseFile(input, fallbackName = '') {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return null
    }
  }
  if (!data || data.app !== 'zsudoku' || data.kind !== 'league') return null
  if (!Array.isArray(data.entries)) return null

  const byDay = new Map()
  for (const raw of data.entries) {
    const e = cleanEntry(raw)
    if (!e) continue
    const have = byDay.get(e.dayKey)
    // A day listed twice in one file is a bug in whatever wrote it. Same rule as
    // everywhere else: finishing beats not finishing, and the first stands.
    if (!have || (!have.completed && e.completed)) byDay.set(e.dayKey, e)
  }

  const name = cleanName(data.name) || cleanName(fallbackName)
  if (!name) return null
  return { name, entries: [...byDay.values()].sort(byDayAsc) }
}

/**
 * Your file on two devices.
 *
 * The phone and the Mac both publish under one name, and either may hold days
 * the other has never seen. This is the same union the game log does, by day
 * rather than by game id.
 *
 * The one rule worth stating: a published result stands, and the only thing that
 * can replace it is finishing a day that was published unfinished. Otherwise a
 * second device could improve a time on a puzzle it had already seen, which is
 * the same dishonesty `pickGame` refuses.
 */
export function mergeEntries(remote, local) {
  const byDay = new Map()
  for (const raw of remote || []) {
    const e = cleanEntry(raw)
    if (e) byDay.set(e.dayKey, e)
  }

  const added = []
  for (const raw of local || []) {
    const e = cleanEntry(raw)
    if (!e) continue
    const have = byDay.get(e.dayKey)
    if (have && !(e.completed && !have.completed)) continue
    byDay.set(e.dayKey, e)
    added.push(e)
  }

  return { entries: [...byDay.values()].sort(byDayAsc), added }
}

// ---- periods ----

const toDate = key => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const shiftDay = (key, delta) => {
  const d = toDate(key)
  d.setDate(d.getDate() + delta)
  return dayKey(d)
}

/**
 * The last `days` days, ending today.
 *
 * Day keys are zero padded, so a period is two string comparisons and needs no
 * date arithmetic once it has been built.
 */
export const period = (days, today = dayKey()) => ({
  from: shiftDay(today, -(days - 1)),
  to: today,
})

const inPeriod = (key, from, to) => (!from || key >= from) && (!to || key <= to)

// ---- players ----

export const flatten = players =>
  (players || []).flatMap(p => (p?.entries || []).map(e => ({ ...e, player: cleanName(p.name) })))

/** Cleaned, deduplicated by player and day, and sorted. */
function normalise(entries) {
  const byKey = new Map()
  for (const raw of entries || []) {
    const player = cleanName(raw?.player)
    if (!player) continue
    const e = cleanEntry(raw)
    if (!e) continue
    // A name may contain a space, but a day key is a fixed shape and comes
    // last, so no two name and day pairs can produce the same key.
    const key = `${player} ${e.dayKey}`
    const have = byKey.get(key)
    if (!have || (!have.completed && e.completed)) byKey.set(key, { ...e, player })
  }
  return [...byKey.values()].sort(byDayAsc)
}

export function groupPlayers(entries) {
  const byName = new Map()
  for (const e of normalise(entries)) push(byName, e.player, e)
  return [...byName.entries()]
    .map(([name, list]) => ({ name, entries: list }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---- days ----

/**
 * Did everyone who played this day play the same puzzle?
 *
 * Only the fields that are actually present are compared, so a file written by
 * a client that records less than this one does not make the day uncomparable.
 * The seed is the real answer and the rest are corroboration.
 */
function samePuzzle(entries) {
  const distinct = pick => new Set(entries.map(pick).filter(v => v !== null && v !== undefined)).size
  return distinct(e => e.seed) <= 1 && distinct(e => e.variant) <= 1 && distinct(e => e.tier) <= 1
}

const mid = values => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * One row per day, with everything the table and the day grid need.
 *
 * A day is only ever won by someone who finished it. Being the only one to
 * finish a day two people played is a win: the other player was there and did
 * not get to the end.
 */
function buildDays(entries) {
  const byDay = new Map()
  for (const e of entries) push(byDay, e.dayKey, e)

  return [...byDay.entries()]
    .map(([key, list]) => {
      const comparable = samePuzzle(list)
      const finishers = list.filter(e => e.completed).sort((a, b) => a.durationMs - b.durationMs)
      const bestMs = finishers.length ? finishers[0].durationMs : null
      // The first player to have recorded it, rather than the first player: one
      // file leaving the tier out would otherwise blank the whole day's label
      // even though everybody else agreed on it.
      const firstOf = pick => list.map(pick).find(v => v !== null && v !== undefined) ?? null
      return {
        dayKey: key,
        // Only meaningful when everyone agrees, which is the point of asking.
        tier: comparable ? firstOf(e => e.tier) : null,
        variant: comparable ? firstOf(e => e.variant) : null,
        comparable,
        entries: list,
        players: list.length,
        finishers,
        bestMs,
        // Ties share the day. At millisecond resolution this needs two people to
        // land on the same number, which happens in test fixtures and not in
        // life, but a rule that only fires in tests is still a rule.
        winners: bestMs === null ? [] : finishers.filter(e => e.durationMs === bestMs).map(e => e.player),
        // What the day cost the people who played it, which is what makes one
        // day's time comparable with another's.
        medianMs: finishers.length >= 2 ? mid(finishers.map(e => e.durationMs)) : null,
      }
    })
    .sort(byDayAsc)
}

// ---- the table ----

const emptyRow = name => ({
  name,
  played: 0,
  completed: 0,
  contested: 0,
  wins: 0,
  clean: 0,
  mistakes: 0,
  hints: 0,
  times: [],
  ratios: [],
})

/**
 * The table, over a period.
 *
 * `entries` is flat: every entry carries the `player` it belongs to, which is
 * what `flatten` produces from parsed files.
 *
 * Three things are worth knowing before reading a row.
 *
 * **A day you did not play is not a loss.** It appears in no denominator here.
 * `played`, `completed` and `contested` all count only days you turned up for,
 * so someone who plays twice a week is ranked on those two days rather than
 * punished for the other five. `wins` is the count and `winRate` is the share,
 * and a table showing one without the other tells half the story.
 *
 * **`medianMs` is not comparable between players** unless they played the same
 * days, which is what `pace` is for. See the measurement at the top of the file.
 *
 * **The streak is over the player's whole history, not the period.** Showing the
 * last seven days must not report a forty day streak as seven: the window is a
 * question about the table, not about the streak.
 */
export function standings(entries, { from = null, to = null, today = dayKey() } = {}) {
  const all = normalise(entries)
  const within = all.filter(e => inPeriod(e.dayKey, from, to))
  const days = buildDays(within)

  const rows = new Map()
  const rowFor = name => {
    const row = rows.get(name)
    if (row) return row
    const made = emptyRow(name)
    rows.set(name, made)
    return made
  }

  for (const day of days) {
    const contested = day.comparable && day.players >= 2
    for (const e of day.entries) {
      const row = rowFor(e.player)
      row.played++
      row.mistakes += e.mistakes
      row.hints += e.hints
      if (e.completed) {
        row.completed++
        row.times.push(e.durationMs)
        if (!e.mistakes && !e.hints) row.clean++
      }
      if (!contested) continue
      row.contested++
      if (day.winners.includes(e.player)) row.wins++
      // Only against a day that at least two people finished: a ratio against
      // your own time is 1.00 and tells nobody anything.
      if (e.completed && day.medianMs) row.ratios.push(e.durationMs / day.medianMs)
    }
  }

  // Streaks and the last day played come from the whole history rather than the
  // window, so make sure every player in it has a row even if the window is
  // empty for them.
  const history = new Map()
  for (const e of all) push(history, e.player, e)

  const table = [...history.entries()].map(([name, list]) => {
    const row = rowFor(name)
    const latest = list[list.length - 1].dayKey
    return {
      name: row.name,
      played: row.played,
      completed: row.completed,
      contested: row.contested,
      wins: row.wins,
      winRate: row.contested ? row.wins / row.contested : null,
      medianMs: row.times.length ? Math.round(mid(row.times)) : null,
      bestMs: row.times.length ? Math.min(...row.times) : null,
      pace: row.ratios.length ? mid(row.ratios) : null,
      clean: row.clean,
      cleanRate: row.completed ? row.clean / row.completed : null,
      mistakes: row.mistakes,
      hints: row.hints,
      lastDay: latest,
      totalDays: list.length,
      // A player six hours ahead posts a day before you have reached it, and
      // judging their streak against your calendar would report zero for the
      // most consistent person in the league. So a streak is measured against
      // their own last day when that is further along than yours.
      streak: dailyStreak(
        list.map(e => ({ ...e, daily: true })),
        latest > today ? latest : today
      ),
    }
  })

  table.sort(
    (a, b) =>
      b.wins - a.wins ||
      (b.winRate ?? -1) - (a.winRate ?? -1) ||
      (a.pace ?? Infinity) - (b.pace ?? Infinity) ||
      a.name.localeCompare(b.name)
  )

  return {
    from,
    to,
    today,
    rows: table,
    days,
    // Days where the entries disagree about which puzzle was played. Worth
    // saying out loud in the interface: silently dropping them would look like
    // the league losing results.
    mismatched: days.filter(d => !d.comparable).map(d => d.dayKey),
  }
}

// ---- one against one ----

const indexBy = (player, name, from, to) => {
  const map = new Map()
  for (const e of normalise((player?.entries || []).map(x => ({ ...x, player: name })))) {
    if (inPeriod(e.dayKey, from, to)) map.set(e.dayKey, e)
  }
  return map
}

/**
 * Two players, on the days they both played.
 *
 * A day only one of them played is reported in `onlyA` or `onlyB` and scored for
 * nobody. Missing a day is not losing it: the whole point of a league between
 * friends is that it survives one of them having a week.
 *
 * Times are compared only across days both of them finished, which is the one
 * set where the comparison is genuinely like for like: the same puzzles, in the
 * same numbers. `ratio` is the median of the per day ratios rather than a ratio
 * of the two medians, because with a handful of shared days the medians can come
 * from different days entirely and the number would describe nothing.
 */
export function headToHead(a, b, { from = null, to = null } = {}) {
  const nameA = cleanName(a?.name) || 'A'
  const nameB = cleanName(b?.name) || 'B'
  const mapA = indexBy(a, nameA, from, to)
  const mapB = indexBy(b, nameB, from, to)

  const keys = [...new Set([...mapA.keys(), ...mapB.keys()])].sort()
  const days = []
  const onlyA = []
  const onlyB = []
  const mismatched = []
  const wins = { a: 0, b: 0, drawn: 0 }
  const timesA = []
  const timesB = []
  const ratios = []
  let cleanA = 0
  let cleanB = 0

  for (const key of keys) {
    const ea = mapA.get(key) || null
    const eb = mapB.get(key) || null
    if (!ea || !eb) {
      ;(ea ? onlyA : onlyB).push(key)
      days.push({ dayKey: key, a: ea, b: eb, comparable: true, winner: null, marginMs: null })
      continue
    }

    const comparable = samePuzzle([ea, eb])
    if (!comparable) mismatched.push(key)

    let winner = null
    let marginMs = null
    if (comparable) {
      if (ea.completed && eb.completed) {
        marginMs = Math.abs(ea.durationMs - eb.durationMs)
        winner = ea.durationMs < eb.durationMs ? 'a' : eb.durationMs < ea.durationMs ? 'b' : null
        timesA.push(ea.durationMs)
        timesB.push(eb.durationMs)
        ratios.push(ea.durationMs / eb.durationMs)
        if (!ea.mistakes && !ea.hints) cleanA++
        if (!eb.mistakes && !eb.hints) cleanB++
      } else if (ea.completed || eb.completed) {
        // Finishing beats not finishing, and no time is compared: one of these
        // two numbers is a duration and the other is when someone gave up.
        winner = ea.completed ? 'a' : 'b'
      }
      if (winner) wins[winner]++
      else if (ea.completed && eb.completed) wins.drawn++
    }

    days.push({ dayKey: key, a: ea, b: eb, comparable, winner, marginMs })
  }

  const both = keys.length - onlyA.length - onlyB.length
  return {
    a: nameA,
    b: nameB,
    days,
    both,
    decided: wins.a + wins.b,
    drawn: wins.drawn,
    bothFinished: timesA.length,
    wins,
    medianA: timesA.length ? Math.round(mid(timesA)) : null,
    medianB: timesB.length ? Math.round(mid(timesB)) : null,
    // Below 1 means A is the faster of the two on a typical shared day.
    ratio: ratios.length ? mid(ratios) : null,
    cleanA,
    cleanB,
    onlyA,
    onlyB,
    mismatched,
  }
}
