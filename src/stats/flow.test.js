import { describe, it, expect } from 'vitest'
import {
  cadence,
  spreadOf,
  flowSegments,
  flowSummary,
  tiltAfterMistake,
  flowTotals,
  FLOW_DEFAULTS,
  NOTABLE_MOVE_SHARE,
} from './flow.js'

/**
 * A move log with the given gaps in milliseconds, one placement each.
 *
 * Gaps rather than timestamps because every threshold in the module is about
 * gaps, and writing timestamps by hand in a test is how a fixture ends up
 * asserting something other than what it says.
 */
const logOf = (gaps, over = () => ({})) => {
  let t = 0
  return gaps.map((gap, i) => {
    t += gap
    return { t, kind: 'place', cell: i, value: (i % 9) + 1, correct: true, ...over(i) }
  })
}

const rep = (n, gap) => Array.from({ length: n }, () => gap)
const rec = moveLog => ({ moveLog })

// A quick steady stretch inside a game that is otherwise slow. The slow parts
// are the majority, so the game's own median comes from them.
const QUICK_INSIDE_SLOW = [...rep(12, 20000), ...rep(16, 4000), ...rep(12, 20000)]

describe('reading the cadence out of a move log', () => {
  it('measures each gap from the previous placement, not the previous log entry', () => {
    // Pencilling between two placements is part of the work that produced the
    // second one. Measuring from the last log entry would report the gap as the
    // few seconds since the last pencil mark and call a two minute think quick.
    const log = [
      { t: 10000, kind: 'place', cell: 0, value: 1, correct: true },
      { t: 40000, kind: 'pencil', cell: 5, value: 3 },
      { t: 70000, kind: 'pencil', cell: 6, value: 3 },
      { t: 100000, kind: 'place', cell: 1, value: 2, correct: true },
    ]
    expect(cadence(rec(log)).map(p => p.gap)).toEqual([10000, 90000])
  })

  it('charges the opening study to the first placement', () => {
    const log = [{ t: 95000, kind: 'place', cell: 0, value: 1, correct: true }]
    expect(cadence(rec(log))[0].gap).toBe(95000)
  })

  it('keeps the index into the move log, so a caller can find the move again', () => {
    const log = [
      { t: 1000, kind: 'autoPencil' },
      { t: 5000, kind: 'place', cell: 40, value: 5, correct: true },
    ]
    expect(cadence(rec(log))[0].index).toBe(1)
  })

  it('counts a hint as a placement and marks it as one', () => {
    const log = [
      { t: 5000, kind: 'place', cell: 0, value: 1, correct: true },
      { t: 9000, kind: 'hint', cell: 1, value: 2, correct: true, technique: 'hiddenSingle' },
    ]
    const cad = cadence(rec(log))
    expect(cad).toHaveLength(2)
    expect(cad[1].hint).toBe(true)
  })
})

describe('the spread of a set of gaps', () => {
  it('is the same for a stretch replayed at any speed', () => {
    // The whole point of measuring spread over the logs. An additive measure
    // calls forty seconds against eighty ten times worse than four against
    // eight, which would make every slow player look erratic.
    const gaps = [4000, 6000, 5000, 9000, 4500]
    expect(spreadOf(gaps.map(g => g * 10))).toBeCloseTo(spreadOf(gaps), 6)
  })

  it('is 1 for a metronome and grows with unevenness', () => {
    expect(spreadOf(rep(5, 8000))).toBeCloseTo(1, 6)
    expect(spreadOf([8000, 8000, 8000, 8000, 96000])).toBeGreaterThan(2.5)
  })

  it('survives two placements sharing a millisecond', () => {
    // A quick-input double tap can land two placements on the same rounded
    // timestamp. ln(0) is -Infinity and would make the whole window's spread
    // NaN, which fails no test and quietly stops the detector detecting.
    expect(Number.isFinite(spreadOf([0, 4000, 4000, 4000, 4000]))).toBe(true)
  })
})

describe('finding the notable stretches of a game', () => {
  it('finds a quick steady run inside a slower game', () => {
    const segs = flowSegments(rec(logOf(QUICK_INSIDE_SLOW)))
    const flow = segs.filter(s => s.kind === 'flow')
    expect(flow).toHaveLength(1)
    expect(flow[0].moves).toBeGreaterThanOrEqual(FLOW_DEFAULTS.minFlowRun)
    expect(flow[0].msPerMove).toBe(4000)
    // Inside the planted block, which runs from placement 12 to placement 27.
    expect(flow[0].from).toBeGreaterThanOrEqual(12)
    expect(flow[0].to).toBeLessThanOrEqual(27)
  })

  it('leaves ordinary play unlabelled rather than tiling the game', () => {
    // The honesty rule of the module. Most of a game is neither, and a segment
    // list that covered every placement would be inventing a shape.
    const segs = flowSegments(rec(logOf(QUICK_INSIDE_SLOW)))
    const covered = segs.reduce((a, s) => a + s.moves, 0)
    expect(covered).toBeLessThan(QUICK_INSIDE_SLOW.length)
  })

  it('never overlaps two segments, and returns them in order', () => {
    const gaps = [...rep(12, 6000), ...rep(10, 60000), ...rep(14, 6000)]
    const segs = flowSegments(rec(logOf(gaps)))
    expect(segs.length).toBeGreaterThan(1)
    for (let i = 1; i < segs.length; i++) expect(segs[i].from).toBeGreaterThan(segs[i - 1].to)
  })

  it('calls a stalled stretch struggle when the rest of the game was quicker', () => {
    const gaps = [...rep(12, 6000), ...rep(10, 60000), ...rep(14, 6000)]
    const struggle = flowSegments(rec(logOf(gaps))).filter(s => s.kind === 'struggle')
    expect(struggle).toHaveLength(1)
    expect(struggle[0].msPerMove).toBeGreaterThan(FLOW_DEFAULTS.stallFloorMs)
  })

  it('catches being stuck by the spread, since the pace stays ordinary', () => {
    // Being stuck is not a stretch of slow placements: someone who is stuck
    // places nothing at all, so it reaches the log as one enormous gap among
    // ordinary ones. The window median is untouched by it, so only the erratic
    // test can see it, and a detector reading pace alone reports the whole
    // stretch as unremarkable.
    const gaps = [...rep(14, 9000), 120000, 9000, 120000, ...rep(14, 9000)]
    const struggle = flowSegments(rec(logOf(gaps))).filter(s => s.kind === 'struggle')
    expect(struggle).toHaveLength(1)
    expect(struggle[0].spread).toBeGreaterThan(FLOW_DEFAULTS.spreadBad)
    expect(struggle[0].msPerMove).toBeLessThan(FLOW_DEFAULTS.stallFloorMs * 6)
    expect(struggle[0].from).toBeLessThanOrEqual(14)
    expect(struggle[0].to).toBeGreaterThanOrEqual(16)
  })

  it('needs more than one stall before calling a stretch a struggle', () => {
    // One pause is a moment rather than a stretch, and the single longest pause
    // of a game is already reported by replay.js. Reporting it here as well
    // would be two names for one fact, and would put a four placement segment
    // on a timeline to describe something that happened between two of them.
    const gaps = [...rep(14, 9000), 120000, ...rep(14, 9000)]
    expect(flowSegments(rec(logOf(gaps))).some(s => s.kind === 'struggle')).toBe(false)
  })

  it('refuses to call a stretch flow when a digit in it was wrong', () => {
    // Fast, steady and half wrong is flailing, and cadence alone rates it the
    // best part of the game: forty placements at three seconds each read as
    // 100% flow, mistakes or no mistakes, until something says otherwise.
    const gaps = rep(40, 3000)
    const clean = flowSegments(rec(logOf(gaps)))
    const flailing = flowSegments(rec(logOf(gaps, i => ({ correct: i % 2 === 0 }))))
    expect(clean.some(s => s.kind === 'flow')).toBe(true)
    expect(flailing.some(s => s.kind === 'flow')).toBe(false)
  })

  it('costs a steady game only the window around a single wrong digit', () => {
    // The guard is local. One mistake in forty placements is not evidence that
    // the rhythm was a fiction, and blanking the whole game for it would make
    // the feature useless on any real game.
    const oneWrong = flowSummary(rec(logOf(rep(40, 3000), i => ({ correct: i !== 20 }))))
    expect(oneWrong.flowMoveShare).toBeGreaterThan(0.9)
  })

  it('refuses to call a stretch flow when a hint carried it', () => {
    const gaps = rep(40, 3000)
    const helped = logOf(gaps, i => (i % 5 === 4 ? { kind: 'hint' } : {}))
    expect(flowSegments(rec(logOf(gaps))).some(s => s.kind === 'flow')).toBe(true)
    expect(flowSegments(rec(helped)).some(s => s.kind === 'flow')).toBe(false)
  })

  it('stops calling a metronome flow once it is slower than a long pause', () => {
    // The absolute anchor, borrowed from analysis.js, which has called a pause
    // of 12 seconds long since v1.5.0. Without it, relative thresholds alone
    // rate a game of one placement a minute as pure flow, because half its
    // windows sit under its own median by construction.
    const share = period => flowSummary(rec(logOf(rep(40, period)))).flowMoveShare
    expect(share(12000)).toBeGreaterThan(0.5)
    expect(share(13000)).toBe(0)
  })

  it('reports the same segments for the same game played at half speed', () => {
    // Everything except the two absolute anchors is scale free, so a quicker
    // player and a slower one get the same reading of the same rhythm. The
    // fixture keeps both speeds inside the band the anchors define: 40 and 8
    // seconds a placement, halving to 20 and 4.
    const shape = [...rep(12, 40000), ...rep(16, 8000), ...rep(12, 40000)]
    const full = flowSegments(rec(logOf(shape)))
    const half = flowSegments(rec(logOf(shape.map(g => g / 2))))
    expect(full.some(s => s.kind === 'flow')).toBe(true)
    expect(half.map(s => [s.kind, s.from, s.to])).toEqual(full.map(s => [s.kind, s.from, s.to]))
  })

  it('reads more of a game as flow once the whole game fits under the anchor', () => {
    // The price of an absolute anchor, and it is deliberate rather than a
    // wrinkle. Play the same shape four times as fast and its slow stretches
    // are down to 10 seconds a placement, which is not slow, so they stop being
    // ordinary and start being flow. This test exists so that changing the
    // anchor cannot happen silently.
    const shape = [...rep(12, 40000), ...rep(16, 8000), ...rep(12, 40000)]
    const at = speed => flowSummary(rec(logOf(shape.map(g => g * speed)))).flowMoveShare
    expect(at(0.25)).toBeGreaterThan(at(1))
  })

  it('indexes segments by move log position, not by placement number', () => {
    // The UI highlights moves by these indices. Counting placements instead
    // would point at the wrong move in any game with pencil marks in it, which
    // is every real game, and nothing would fail.
    const log = []
    let t = 0
    logOf(QUICK_INSIDE_SLOW).forEach(m => {
      t = m.t
      log.push({ t: t - 500, kind: 'pencil', cell: m.cell, value: 1 })
      log.push(m)
    })
    const seg = flowSegments(rec(log)).find(s => s.kind === 'flow')
    expect(log[seg.from].kind).toBe('place')
    expect(log[seg.to].kind).toBe('place')
    expect(seg.cells[0]).toBe(log[seg.from].cell)
  })
})

describe('summarising the rhythm of a game', () => {
  it('says a game was too short rather than reporting zeros as a finding', () => {
    // A game with no flow in it and a game nobody could read are different
    // statements, and an interface that showed 0% for both would be lying
    // about one of them.
    const short = flowSummary(rec(logOf(rep(10, 4000))))
    expect(short.enough).toBe(false)
    expect(short.needs).toBe(FLOW_DEFAULTS.minPlacements)
    expect(short.segments).toEqual([])
  })

  it('reports the share of the clock and the share of the placements separately', () => {
    // They differ by a factor of three on the calibration games, 8% of the
    // minutes against 23% of the digits, because flow is quick by definition.
    // Reporting one under the other's name would be the most flattering
    // available lie.
    const s = flowSummary(rec(logOf(QUICK_INSIDE_SLOW)))
    expect(s.enough).toBe(true)
    expect(s.flowMoveShare).toBeGreaterThan(s.flowShare * 2)
    expect(s.flowShare + s.struggleShare + s.plainShare).toBeCloseTo(1, 6)
  })

  it('keys notable on the placements, since the clock share cannot separate anything', () => {
    // Measured against featureless games: a cutoff on the share of the clock
    // catches 3% of games with planted flow, one on the share of placements
    // catches 60%.
    const s = flowSummary(rec(logOf(QUICK_INSIDE_SLOW)))
    expect(s.notable).toBe(s.flowMoveShare >= NOTABLE_MOVE_SHARE)
  })

  it('returns the longest flow run, not the first', () => {
    const gaps = [...rep(10, 4000), ...rep(8, 30000), ...rep(20, 4000), ...rep(8, 30000)]
    const s = flowSummary(rec(logOf(gaps)))
    const flow = s.segments.filter(x => x.kind === 'flow')
    expect(flow.length).toBeGreaterThan(1)
    expect(s.longest.moves).toBe(Math.max(...flow.map(x => x.moves)))
  })

  it('counts the entry into a run as part of it', () => {
    // A run starts when the previous placement went in, because the gap before
    // its first placement is the thinking that entered it. Timing it from the
    // first placement of the run instead would lose one gap per segment and
    // report a rhythm slightly quicker than the one that was played.
    const s = flowSummary(rec(logOf(QUICK_INSIDE_SLOW)))
    const flow = s.segments.find(x => x.kind === 'flow')
    expect(flow.ms).toBe(flow.moves * 4000)
  })
})

describe('whether the rhythm breaks after a wrong digit', () => {
  it('says nothing about a game with too few mistakes to ask', () => {
    expect(tiltAfterMistake(rec(logOf(rep(40, 5000), i => ({ correct: i !== 20 }))))).toBeNull()
  })

  it('reports the direction when the placements after a mistake come slower', () => {
    // Injected slowdowns are recovered in direction but understated in size,
    // so the assertion is about direction. A simulated 2.0x came back as 1.71x
    // at a 5% mistake rate and 1.47x at 12%.
    const wrongAt = new Set([8, 20, 32])
    const gaps = Array.from({ length: 44 }, (_, i) => {
      const shocked = [...wrongAt].some(w => i > w && i <= w + 5)
      return shocked ? 12000 : 4000
    })
    const t = tiltAfterMistake(rec(logOf(gaps, i => ({ correct: !wrongAt.has(i) }))))
    expect(t.sample).toBe(3)
    expect(t.ratio).toBeGreaterThan(1.5)
  })

  it('reports no change when there was none', () => {
    const wrongAt = new Set([8, 20, 32])
    const t = tiltAfterMistake(rec(logOf(rep(44, 5000), i => ({ correct: !wrongAt.has(i) }))))
    expect(t.ratio).toBe(1)
  })
})

describe('flow across a history', () => {
  it('leaves out games too short to have been asked, rather than scoring them zero', () => {
    // Counting them as zero flow would drag the number down with games that
    // were never in a position to answer.
    const long = rec(logOf(QUICK_INSIDE_SLOW))
    const short = rec(logOf(rep(6, 4000)))
    expect(flowTotals([long, short, short]).sample).toBe(1)
    expect(flowTotals([]).sample).toBe(0)
  })

  it('pools over the clock rather than averaging over games', () => {
    // Otherwise a two minute game weighs as much as a forty minute one in the
    // answer to "how much of my sudoku time is spent in flow".
    const one = rec(logOf(QUICK_INSIDE_SLOW))
    const totals = flowTotals([one, one])
    expect(totals.flowShare).toBeCloseTo(flowSummary(one).flowShare, 6)
    expect(totals.bestRun.moves).toBe(flowSummary(one).longest.moves)
  })
})
