// Flow and struggle, read off the clock.
//
// The move log already records when every digit went in, so the rhythm of a
// game is written down whether or not anyone reads it. Flow is a steady, quick
// cadence; struggle is a stalled or erratic one. Nothing here judges the moves
// themselves, which is what analysis.js is for. This asks only how the game was
// moving while they were made.
//
// The first attempt at this defined flow from the board rather than the clock,
// using the ladder as the oracle: a placement is easy when no elimination work
// stood in front of it, so a stretch of easy placements is a stretch of flow.
// Measured over 24 real puzzles, that definition calls 96% to 100% of the
// placements in a game easy, at every tier, with 93% of them inside a run of
// eight or more even on Diabolical. It is true and it is useless: what
// separates a Diabolical from a Gentle is a handful of hard moments, not the
// texture of the solve. So flow has to come from the clock, and the thresholds
// below were calibrated against cadence planted at known positions in
// synthesised logs.
//
// Two things keep it honest, and both cost detections:
//
//   The segments do not tile the game. Most of a game is neither flow nor
//   struggle, and a list that labelled every placement one or the other would
//   be inventing a shape the data does not have. Segments are the notable
//   stretches; everything between them is ordinary play, deliberately unnamed.
//
//   A stretch with a wrong digit or a hint in it is not flow, whatever the
//   clock says. Cadence alone calls fast flailing the best part of the game:
//   forty placements at three seconds each read as 100% flow, and they still do
//   with every second digit wrong unless something says otherwise. With the
//   guard they read as 0%. One wrong digit in the forty costs 7%, because the
//   guard is local to the window rather than a verdict on the whole game.

import { median } from './compute.js'

/**
 * The thresholds, and where the numbers came from.
 *
 * Calibrated on 96 synthesised games over 24 real puzzles (four per tier from
 * `makePuzzle`, seeded). The puzzles supply the skeleton, which is how many
 * placements a game has and in what order; the cadence is planted in blocks of
 * 8 to 20 placements drawn from four regimes: flow (4s a move, gaps varying by
 * about 1.3x), ordinary (9s, 1.6x), grind (30s, 1.5x) and stuck (ordinary
 * cadence with one 90 second stall in it). The detector is then scored on
 * recovering the blocks.
 *
 * At these settings, per placement: flow precision 0.95, recall 0.75, and 4% of
 * ordinary play called flow. Struggle precision 0.90, recall 0.57, 4% of
 * ordinary play called struggle. Recall is deliberately the weaker half in both
 * cases. A false segment is a lie about the game; a missed one is only a
 * quieter report.
 *
 * Sweeping `spreadMax` (precision / recall / ordinary called flow): 1.3 gave
 * 0.98 / 0.39 / 1%, 1.4 gave 0.98 / 0.66 / 2%, 1.5 gave 0.95 / 0.75 / 4%, 1.6
 * gave 0.93 / 0.78 / 5%, 1.8 gave 0.89 / 0.82 / 10%, 2.0 gave 0.87 / 0.84 /
 * 13%. Up to 1.5 recall rises much faster than precision falls and past it the
 * trade reverses, so 1.5 is the knee. `paceMax` behaves the same way: 0.85 gave
 * 0.96 / 0.56 / 2%, 1.0 gave 0.95 / 0.75 / 4%, 1.15 gave 0.93 / 0.81 / 6%, and
 * 1.5 gave 0.86 / 0.83 / 13%.
 *
 * The window was chosen twice, because the first comparison was wrong. It
 * varied the window and the minimum run together, which measured the minimum
 * run and reported it as a fact about the window. Held at a run of 8, and
 * adding what each window does to a featureless game, the head to head is:
 *
 *   window  precision  recall  ordinary  flow found in a featureless game
 *     3       0.95      0.75      4%       3% of the clock, 7% of games notable
 *     5       0.95      0.69      3%       6% of the clock, 15% of games notable
 *     7       0.96      0.62      2%       9% of the clock, 22% of games notable
 *
 * Three wins on the number that matters most, which is how often a game with no
 * rhythm in it at all is reported as having one.
 *
 * How much quicker a stretch has to be before it is found at all, sweeping the
 * planted flow regime against the planted ordinary one: at 1.1x quicker,
 * precision 0.87 and recall 0.46; at 1.25x, 0.92 and 0.54; at 1.5x, 0.93 and
 * 0.65; at 2.25x, 0.95 and 0.75. So this finds a stretch running about half
 * again as quick as the rest of the game, and finds subtler ones only half the
 * time. It does not invent them: precision holds up all the way down.
 *
 * The assumption it rests on, and the one thing here that no amount of
 * simulation can settle, is how steady a real flow stretch is. Sweeping the
 * steadiness of the planted flow blocks, precision barely moves but recall
 * falls off a cliff: gaps within a factor of 1.16 give 0.95 / 0.79, within 1.28
 * give 0.95 / 0.75, within 1.42 give 0.94 / 0.50, within 1.57 give 0.92 / 0.29
 * and within 1.82 give 0.76 / 0.07. If real flow is less even than about 1.4x,
 * this module will report very little of it. That is the intended direction to
 * be wrong in, and it is the first thing to re-measure once there are enough
 * real games to measure on.
 *
 * `paceMax` and `ceilingMs` are the house pattern from analysis.js: relative to
 * this game's own median, with an absolute limit as well. Relative alone calls
 * a metronomic one-minute-a-move game pure flow, since half its windows sit
 * under its own median by construction. The absolute anchor is 12 seconds, and
 * it is borrowed rather than invented: analysis.js has called a pause of 12
 * seconds or more long since v1.5.0. Flow may never be slower than the app's
 * own definition of a long pause, and a stall must be at least it.
 *
 * The price of an absolute anchor is that the answers stop being scale free
 * outside the band it defines. Measured on one planted game replayed at several
 * speeds: the flow share is identical at 0.25x, 0.5x, 1x and 2x, and zero at
 * 4x, where the planted flow stretches run at 16 seconds a placement. That is
 * intended. A player taking 16 seconds a placement is not in flow, however even
 * their rhythm is.
 */
export const FLOW_DEFAULTS = {
  // Placements per rolling window. Three sounds too few to judge a rhythm on,
  // and the measurement disagrees: see the head to head above. A run still has
  // to be eight placements long, so a window of three never means three gaps
  // decided anything.
  window: 3,
  // Flow: the gaps in the window stay within this factor of each other, ...
  spreadMax: 1.5,
  // ... run at or under the game's own median pace, ...
  paceMax: 1.0,
  // ... and are not slow outright whatever the rest of the game did.
  ceilingMs: 12000,
  // A rhythm has to last. A handful of quick placements is a burst, and filling
  // the last cells of a completed box is a burst most games contain.
  minFlowRun: 8,

  // Struggle: stalled, meaning well off the game's own pace and slow outright.
  stallPace: 2.0,
  stallFloorMs: 12000,
  // Or erratic: gaps swinging by this factor inside one window. This is what
  // catches being stuck, which is not a stretch of slow placements at all: a
  // person who is stuck places nothing, so it lands in the log as one enormous
  // gap among ordinary ones. At 2.5 the detector caught 31 of 55 planted
  // stalls; at 4.0 it caught 3 of them.
  spreadBad: 2.5,
  // Or wrong twice inside one window, which is a struggle by any reading.
  wrongInWindow: 2,
  // Shorter than a flow run on purpose: a rhythm has to last to be a rhythm,
  // while two bad minutes is a struggle. Four is still long enough that one
  // stall on its own produces nothing, which is deliberate. `longestStall` in
  // replay.js already reports the single worst pause of a game, and a four
  // placement segment is the wrong shape for something that happened between
  // two of them. Dropping this to 3 would catch 52 of 55 planted stalls rather
  // than 31, at the cost of calling 6% of ordinary play a struggle instead of
  // 4%.
  minStruggleRun: 4,

  // Below this many placements a game has no rhythm to report. A Gentle grid
  // takes about 45 placements and a Diabolical about 55, so this only excludes
  // games abandoned early.
  minPlacements: 20,
}

/**
 * The share of placements above which a game is worth calling a flowing one.
 *
 * This number was measured against a null, and the measurement changed the
 * design. The null is a featureless game: one cadence from the first placement
 * to the last, no planted structure at all, so every segment found in it is
 * chance. Running 480 of those against 480 games with flow planted in them:
 *
 *   statistic          null p90   catches this share of the planted games
 *   share of clock       14%                   14%
 *   share of placements  18%                   83%
 *   longest flow run      9 moves              85%
 *
 * The share of the clock is nearly useless as a headline, and the reason is
 * arithmetic rather than a bug: flow is quick by definition, so a stretch
 * holding a quarter of the digits holds a twelfth of the minutes, and a single
 * grind elsewhere in the game outweighs it. Measured on the planted games, flow
 * covered 9% of the clock and 26% of the placements. Both are reported, and
 * `notable` is keyed on the placements, one notch above the null's p90.
 *
 * One honest caveat on the null. It only behaves as a null for a player whose
 * cadence is genuinely uneven. A featureless game whose gaps vary by a factor
 * of 1.8 clears this cutoff 1% of the time and one varying by 1.57 clears it
 * 7% of the time, but one varying by only 1.35 clears it 27% of the time. That
 * last is not a false positive. A player whose whole game runs that evenly is
 * flowing, and saying so is the correct reading of a steady quick game.
 */
export const NOTABLE_MOVE_SHARE = 0.2

// Two placements can share a rounded millisecond, and ln(0) is -Infinity, which
// would poison a whole window's spread. A quarter of a second is below anything
// a person can do twice in a row.
const GAP_FLOOR = 250

/**
 * Every placement, with the gap that produced it.
 *
 * The gap is measured from the previous placement rather than the previous log
 * entry, because pencilling, checking and undoing are part of the work that
 * produced the next digit rather than pauses in it. The first gap runs from the
 * start of the game, so a long opening study shows up as one slow placement.
 *
 * Hints count as placements: they advance the board and the clock. What they do
 * not do is count as flow, because asking for one means the board had you
 * beaten whatever the cadence looked like.
 *
 * `index` is the position in `record.moveLog` and `n` is which placement of the
 * game it was, counted from 1. Both match `analyseGame` in analysis.js, which
 * walks the same entries in the same order, so a caller can line up a segment
 * with the classification of the moves inside it.
 */
export function cadence(record) {
  const log = record?.moveLog || []
  const out = []
  let prev = 0
  for (let i = 0; i < log.length; i++) {
    const m = log[i]
    if (m.kind !== 'place' && m.kind !== 'hint') continue
    out.push({
      index: i,
      n: out.length + 1,
      t: m.t,
      gap: Math.max(0, m.t - prev),
      cell: m.cell,
      value: m.value,
      wrong: m.correct === false,
      hint: m.kind === 'hint',
    })
    prev = m.t
  }
  return out
}

/**
 * The geometric spread of a set of gaps: roughly the factor they vary by, so
 * 1.5 reads as "the gaps stayed within about half again of each other".
 *
 * Gaps are multiplicative, not additive. Four seconds against eight is the same
 * unevenness as forty against eighty, and a plain standard deviation calls the
 * second pair ten times worse. Taking it over the logs makes it scale free, so
 * the same stretch played at half speed scores identically. A test asserts it.
 */
export function spreadOf(gaps) {
  if (gaps.length < 2) return 1
  const logs = gaps.map(g => Math.log(Math.max(g, GAP_FLOOR)))
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length
  const variance = logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length
  return Math.exp(Math.sqrt(variance))
}

/** One verdict per placement: flow, struggle or plain. */
function labelPlacements(cad, o) {
  const n = cad.length
  const gaps = cad.map(p => Math.max(p.gap, GAP_FLOOR))
  const base = median(gaps)
  const paceLimit = Math.min(base * o.paceMax, o.ceilingMs)
  const stallLimit = Math.max(base * o.stallPace, o.stallFloorMs)

  const verdicts = []
  for (let s = 0; s + o.window <= n; s++) {
    const slice = gaps.slice(s, s + o.window)
    const med = median(slice)
    const spread = spreadOf(slice)
    const window = cad.slice(s, s + o.window)
    const wrong = window.filter(p => p.wrong).length
    const helped = window.some(p => p.hint)

    if (!wrong && !helped && spread <= o.spreadMax && med <= paceLimit) verdicts.push('flow')
    else if (med >= stallLimit || spread >= o.spreadBad || wrong >= o.wrongInWindow) verdicts.push('struggle')
    else verdicts.push('plain')
  }

  // Each placement takes the verdict of the window centred on it. The first and
  // last few have no centred window, so they inherit the nearest one: the
  // endgame cascade is the most common flow run there is, and cutting its tail
  // off would misreport it every time.
  const half = o.window >> 1
  return cad.map((_, i) => verdicts[Math.min(Math.max(i - half, 0), verdicts.length - 1)] || 'plain')
}

/** Maximal runs of one label, long enough to be worth naming. */
function runsOf(cad, labels, kind, minRun) {
  const out = []
  let start = -1
  for (let i = 0; i <= labels.length; i++) {
    const inRun = labels[i] === kind
    if (inRun && start === -1) start = i
    if (!inRun && start !== -1) {
      if (i - start >= minRun) out.push(segment(cad, start, i - 1, kind))
      start = -1
    }
  }
  return out
}

function segment(cad, first, last, kind) {
  const moves = last - first + 1
  // A run starts when the previous placement went in, because the gap before
  // its first placement is the thinking that entered it. Before the first
  // placement of the game, that is the start of the game.
  const startMs = first === 0 ? 0 : cad[first - 1].t
  const endMs = cad[last].t
  const ms = Math.max(0, endMs - startMs)
  const run = cad.slice(first, last + 1)
  return {
    kind,
    from: cad[first].index,
    to: cad[last].index,
    startMs,
    endMs,
    ms,
    moves,
    msPerMove: Math.round(ms / moves),
    spread: Number(spreadOf(run.map(p => p.gap)).toFixed(2)),
    wrong: run.filter(p => p.wrong).length,
    cells: run.map(p => p.cell),
  }
}

/**
 * The notable stretches of one game, in order.
 *
 * Each segment is `{ kind, from, to, startMs, endMs, ms, moves, msPerMove,
 * spread, wrong, cells }`. `from` and `to` are indices into `record.moveLog`,
 * inclusive, so a caller can go straight back to the moves. `startMs` and
 * `endMs` are elapsed milliseconds, which is what a timeline wants, and
 * `startMs` is the moment the run was entered rather than the timestamp of its
 * first placement.
 *
 * They never overlap, and they do not tile the game. The stretches between them
 * are ordinary play, which is most of a game and is not a finding.
 */
export function flowSegments(record, opts = {}) {
  const o = { ...FLOW_DEFAULTS, ...opts }
  const cad = cadence(record)
  if (cad.length < o.minPlacements) return []
  const labels = labelPlacements(cad, o)
  return [
    ...runsOf(cad, labels, 'flow', o.minFlowRun),
    ...runsOf(cad, labels, 'struggle', o.minStruggleRun),
  ].sort((a, b) => a.from - b.from)
}

/**
 * What the whole game's rhythm looked like.
 *
 * `enough` is false for a game with too few placements to have had a rhythm,
 * and everything else is then zero. Callers should say so rather than draw an
 * empty bar: a game with no flow in it and a game too short to ask are
 * different statements.
 *
 * Two shares, and they answer different questions. `flowShare` is of the clock
 * and `flowMoveShare` is of the placements, and on the calibration games they
 * differ by a factor of three: 9% of the minutes against 26% of the digits.
 * Neither is wrong, but a caller has to know which one it is showing, and the
 * one worth showing is the placements. See `NOTABLE_MOVE_SHARE`.
 *
 * `flowShare` and `struggleShare` do not sum to 1 and are not meant to.
 * `plainShare` is the rest, and on most games it is the majority.
 *
 * `notable` says whether the flow found here is more than a featureless game
 * produces by chance. Below it, say nothing rather than reporting a number.
 */
export function flowSummary(record, opts = {}) {
  const o = { ...FLOW_DEFAULTS, ...opts }
  const cad = cadence(record)
  if (cad.length < o.minPlacements) {
    return {
      enough: false,
      placements: cad.length,
      needs: o.minPlacements,
      totalMs: 0,
      medianGap: 0,
      flowMoves: 0,
      flowMs: 0,
      flowShare: 0,
      flowMoveShare: 0,
      struggleMoves: 0,
      struggleMs: 0,
      struggleShare: 0,
      struggleMoveShare: 0,
      plainShare: 0,
      notable: false,
      longest: null,
      segments: [],
    }
  }

  const segments = flowSegments(record, o)
  const totalMs = cad[cad.length - 1].t
  const sum = kind =>
    segments
      .filter(s => s.kind === kind)
      .reduce((a, s) => ({ ms: a.ms + s.ms, moves: a.moves + s.moves }), { ms: 0, moves: 0 })
  const flow = sum('flow')
  const struggle = sum('struggle')
  const share = ms => (totalMs > 0 ? ms / totalMs : 0)

  return {
    enough: true,
    placements: cad.length,
    needs: o.minPlacements,
    totalMs,
    medianGap: median(cad.map(p => p.gap)),
    flowMoves: flow.moves,
    flowMs: flow.ms,
    flowShare: share(flow.ms),
    flowMoveShare: flow.moves / cad.length,
    struggleMoves: struggle.moves,
    struggleMs: struggle.ms,
    struggleShare: share(struggle.ms),
    struggleMoveShare: struggle.moves / cad.length,
    plainShare: Math.max(0, 1 - share(flow.ms) - share(struggle.ms)),
    notable: flow.moves / cad.length >= NOTABLE_MOVE_SHARE,
    longest: segments.filter(s => s.kind === 'flow').sort((a, b) => b.moves - a.moves)[0] || null,
    segments,
  }
}

/**
 * Does the rhythm break after a wrong digit?
 *
 * The tilt in compute.js asks whether accuracy falls after a mistake, pooled
 * across games. This asks the other half of the same question inside one game:
 * whether the clock changes. `ratio` above 1 means the placements after a
 * mistake came slower than the ones before it.
 *
 * The mistake's own gap belongs to neither side and is excluded from both. The
 * thinking that produced a wrong digit is not the rhythm before it, and the
 * correction that follows is not a fresh placement.
 *
 * Validated by injecting a known slowdown into simulated games and reading it
 * back. With mistakes on 5% of placements, the reported median was 1.06x for an
 * injected 1.0x, 1.39x for 1.5x, 1.71x for 2.0x and 2.56x for 3.0x. So the null
 * is clean and the direction is right, but the size is understated, and worse
 * the more mistakes there are: at a 12% mistake rate the same four came back as
 * 1.02x, 1.29x, 1.47x and 1.90x. The reason is arithmetic rather than a bug,
 * the window before one mistake containing the wake of the last one. Read this
 * as a direction, never as a measurement of how much.
 *
 * Returns null unless `minMistakes` mistakes have a full window on both sides,
 * which many games do not: 32 of 96 simulated games qualified at a 5% mistake
 * rate and 80 of 96 at 12%.
 */
export function tiltAfterMistake(record, { span = 5, minMistakes = 3 } = {}) {
  const cad = cadence(record)
  const before = []
  const after = []
  let sample = 0

  for (let i = 0; i < cad.length; i++) {
    if (!cad[i].wrong) continue
    if (i < span || i + span >= cad.length) continue
    sample++
    for (let k = 1; k <= span; k++) {
      before.push(cad[i - k].gap)
      after.push(cad[i + k].gap)
    }
  }

  if (sample < minMistakes) return null
  const b = median(before)
  const a = median(after)
  if (!b) return null
  return { sample, beforeMs: b, afterMs: a, ratio: a / b }
}

/**
 * Flow across a history, for the statistics screen.
 *
 * Games too short to have a rhythm are excluded rather than counted as zero
 * flow, which would drag the number down with games that were never asked the
 * question. `sample` says how many were actually read.
 *
 * Shares are pooled over the clock rather than averaged over games, so a long
 * game counts for more than a short one, which is what "how much of my sudoku
 * time is spent in flow" means.
 *
 * Cheap enough to run on demand, which was worth measuring rather than assuming
 * because v1.9.0 had to go the other way and store the move classification on
 * each record. A game of 58 placements and 150 pencil marks costs 0.33ms here
 * and a thousand games cost 33ms, against 3.7 seconds for classifying the same
 * thousand. Nothing about flow needs to be written into a record.
 */
export function flowTotals(games, opts = {}) {
  const read = []
  for (const g of games || []) {
    const s = flowSummary(g, opts)
    if (s.enough) read.push(s)
  }
  if (!read.length) return { sample: 0, flowShare: 0, struggleShare: 0, gamesWithFlow: 0, bestRun: null }

  const totalMs = read.reduce((a, s) => a + s.totalMs, 0)
  const flowMs = read.reduce((a, s) => a + s.flowMs, 0)
  const struggleMs = read.reduce((a, s) => a + s.struggleMs, 0)
  const runs = read.map(s => s.longest).filter(Boolean).sort((a, b) => b.moves - a.moves)
  return {
    sample: read.length,
    flowShare: totalMs ? flowMs / totalMs : 0,
    struggleShare: totalMs ? struggleMs / totalMs : 0,
    gamesWithFlow: read.filter(s => s.notable).length,
    bestRun: runs[0] || null,
  }
}
