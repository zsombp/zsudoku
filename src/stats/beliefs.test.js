import { describe, it, expect } from 'vitest'
import { falseBeliefs, beliefVerdict } from './beliefs.js'
import { makePuzzle } from '../logic/generator.js'
import { settledCands } from '../logic/explain.js'
import { createState } from '../logic/grader.js'

/** A game that auto-pencils once and never tidies, at human pace. */
function untidySolve(tier, seed, gapMs = 9000) {
  const made = makePuzzle(tier, { seed })
  if (!made) return null
  const log = [{ t: gapMs, kind: 'autoPencil' }]
  let t = gapMs
  const idx = []
  for (let i = 0; i < 81; i++) if (!made.puzzle[i]) idx.push(i)
  idx.sort((a, b) => (a % 9) - (b % 9) || a - b)
  for (const i of idx) {
    t += gapMs
    log.push({ t, kind: 'place', cell: i, value: made.solution[i], correct: true })
  }
  return { puzzle: made.puzzle, solution: made.solution, moveLog: log, durationMs: t }
}

describe('what counts as a false belief', () => {
  it('does not blame you for what auto-pencil wrote', () => {
    // The ladder is stricter than the peer scan auto-pencil uses, so dozens of
    // its candidates are dead on arrival. Those were never your belief.
    const made = makePuzzle('Hard', { seed: 5150 })
    const naive = createState(made.puzzle).cands
    const settled = settledCands(made.puzzle)
    let deadOnArrival = 0
    for (let i = 0; i < 81; i++) {
      for (let d = 0; d < 9; d++) if (naive[i] & (1 << d) && !(settled[i] & (1 << d))) deadOnArrival++
    }
    expect(deadOnArrival).toBeGreaterThan(20)

    // Auto-pencil and immediately stop: nothing has gone stale, because nothing
    // was ever true and then stopped being true.
    const r = { puzzle: made.puzzle, solution: made.solution, moveLog: [{ t: 1000, kind: 'autoPencil' }] }
    expect(falseBeliefs(r).stale).toEqual([])
  })

  it('catches a note that was true and stopped being true', () => {
    const r = untidySolve('Hard', 5150)
    const out = falseBeliefs(r)
    expect(out.stale.length).toBeGreaterThan(0)
    for (const b of out.stale) {
      expect(b.heldMs).toBeGreaterThanOrEqual(15000)
      expect(b.droppedAt).toBeGreaterThan(b.diedAt)
    }
  })

  it('ignores a note corrected within moments', () => {
    const r = untidySolve('Hard', 5150)
    // Nothing survives a threshold longer than the game itself.
    expect(falseBeliefs(r, { minMs: 10 * 60 * 1000 }).stale).toEqual([])
  })

  it('separates a misread from a note that went stale', () => {
    // A 5 pencilled where a 5 already sits in the same row: impossible on sight.
    const puzzle = new Array(81).fill(0)
    puzzle[0] = 5
    const r = {
      puzzle,
      solution: new Array(81).fill(1),
      moveLog: [
        { t: 1000, kind: 'pencil', cell: 4, value: 5 },
        { t: 90000, kind: 'pencil', cell: 4, value: 5 },
      ],
    }
    const out = falseBeliefs(r)
    expect(out.misreads.map(m => `${m.digit}@${m.cellName}`)).toContain('5@r1c5')
    expect(out.stale).toEqual([])
  })
})

describe('reporting it honestly', () => {
  it('counts overlapping time once', () => {
    const out = falseBeliefs(untidySolve('Hard', 5150))
    // Dozens of notes are stale at the same moment, so adding their durations
    // would report far more time than the game contains.
    const naiveSum = out.stale.reduce((a, b) => a + b.heldMs, 0)
    expect(out.coverageMs).toBeLessThanOrEqual(naiveSum)
    // Bounded by the game, not by the first row: the list is ranked by what
    // each note cost rather than by how long it lasted.
    const lastMoment = Math.max(...out.stale.map(b => b.droppedAt))
    expect(out.coverageMs).toBeLessThanOrEqual(lastMoment)
  })

  it('reports the worst simultaneous count, not just a total', () => {
    const out = falseBeliefs(untidySolve('Hard', 5150))
    expect(out.peak).toBeGreaterThan(0)
    expect(out.peak).toBeLessThanOrEqual(out.considered)
  })

  it('puts a note that sat under a wrong digit at the top of the list', () => {
    const out = falseBeliefs(untidySolve('Hard', 5150))
    const ranks = out.stale.map(b => b.mistakesHere)
    // Sorted by cost first, so the counts never increase down the list.
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1])
  })

  it('says something true when there is nothing to report', () => {
    const line = beliefVerdict({ stale: [], misreads: [], considered: 0 })
    expect(line).toMatch(/every note/i)
  })

  it('survives a record with no log at all', () => {
    expect(falseBeliefs({}).stale).toEqual([])
    expect(falseBeliefs({ moveLog: [], puzzle: [], solution: [] }).stale).toEqual([])
  })

  it('stays fast enough to run when a review is opened', () => {
    const r = untidySolve('Hard', 5150)
    const t0 = Date.now()
    falseBeliefs(r)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
