import { describe, it, expect } from 'vitest'
import { permutationTest, assignArm, analyse, gamesFor, EXPERIMENTS, verdictFor } from './experiments.js'
import { mulberry32 } from '../lib/prng.js'

describe('the permutation test', () => {
  it('finds nothing when there is nothing, at the rate it claims', () => {
    // Both arms from one distribution, so every rejection is a false positive.
    // A sound test at p<0.05 fires about 5% of the time, and a badly wrong one
    // is the kind of bug that produces confident nonsense forever.
    const rng = mulberry32(4242)
    const draw = () => Math.exp(rng() * 1.2) * 300
    let fired = 0
    const RUNS = 200
    for (let r = 0; r < RUNS; r++) {
      const a = Array.from({ length: 10 }, draw)
      const b = Array.from({ length: 10 }, draw)
      if (permutationTest(a, b, { iterations: 1000, seed: r + 1 }) < 0.05) fired++
    }
    expect(fired / RUNS).toBeLessThan(0.12)
  })

  it('finds a large effect that is really there', () => {
    const rng = mulberry32(7)
    const draw = () => Math.exp(rng() * 1.2) * 300
    const a = Array.from({ length: 15 }, () => draw() * 0.5)
    const b = Array.from({ length: 15 }, draw)
    expect(permutationTest(a, b, { iterations: 2000, seed: 1 })).toBeLessThan(0.05)
  })

  it('never returns exactly zero, because an observed result is one arrangement', () => {
    const a = [1, 1, 1, 1, 1]
    const b = [99, 99, 99, 99, 99]
    const p = permutationTest(a, b, { iterations: 500, seed: 1 })
    expect(p).toBeGreaterThan(0)
  })

  it('gives the same answer every time it is asked', () => {
    const a = [3, 5, 7, 9, 11]
    const b = [4, 6, 8, 10, 12]
    const one = permutationTest(a, b, { iterations: 500, seed: 99 })
    const two = permutationTest(a, b, { iterations: 500, seed: 99 })
    expect(one).toBe(two)
  })

  it('refuses to answer on too little data rather than guessing', () => {
    expect(permutationTest([1, 2], [3, 4], { seed: 1 })).toBeNull()
  })
})

describe('assigning games to halves', () => {
  it('keeps the halves level rather than trusting a coin', () => {
    // Twenty coin flips come out 14-6 often enough to waste an experiment.
    const games = []
    for (let i = 0; i < 30; i++) {
      const arm = assignArm(games, mulberry32(i + 1))
      games.push({ experiment: { id: 'x', arm } })
    }
    const on = games.filter(g => g.experiment.arm === 'on').length
    expect(Math.abs(on - (games.length - on))).toBeLessThanOrEqual(1)
  })

  it('is not predictable when the halves are level', () => {
    const arms = new Set()
    for (let s = 1; s < 40; s++) arms.add(assignArm([], mulberry32(s * 7919)))
    expect(arms.size).toBe(2)
  })
})

describe('reporting a run', () => {
  const game = (i, arm, over = {}) => ({
    id: `g${i}`,
    endedAt: 1000 + i,
    completed: true,
    graded: 'Hard',
    durationMs: 300000,
    mistakes: 1,
    hints: 0,
    experiment: { id: 'autopencil', arm },
    ...over,
  })

  it('says nothing at all before the declared number of games', () => {
    const games = Array.from({ length: 10 }, (_, i) => game(i, i % 2 ? 'on' : 'off'))
    const run = analyse(games, { id: 'autopencil' })
    expect(run.complete).toBe(false)
    expect(run.results).toBeNull()
  })

  it('reports once the run is done, and names the outcome declared up front', () => {
    const n = EXPERIMENTS.autopencil.games
    const games = Array.from({ length: n }, (_, i) =>
      game(i, i % 2 ? 'on' : 'off', { mistakes: i % 2 ? 0 : 4 })
    )
    const run = analyse(games, { id: 'autopencil' })
    expect(run.complete).toBe(true)
    expect(run.primary.outcome).toBe('mistakes')
    // A four-to-nothing gap in mistakes is not subtle.
    expect(run.primary.p).toBeLessThan(0.05)
    expect(run.primary.better).toBe('on')
  })

  it('ignores games that belong to a different run', () => {
    const mine = Array.from({ length: 4 }, (_, i) => game(i, 'on'))
    const other = [game(99, 'on', { experiment: { id: 'quick', arm: 'on' } })]
    expect(gamesFor([...mine, ...other], 'autopencil')).toHaveLength(4)
  })

  it('leaves abandoned games out of the timing comparison', () => {
    const n = EXPERIMENTS.mistakes.games
    const games = Array.from({ length: n }, (_, i) =>
      ({ ...game(i, i % 2 ? 'on' : 'off'), experiment: { id: 'mistakes', arm: i % 2 ? 'on' : 'off' }, completed: i > 5 })
    )
    const run = analyse(games, { id: 'mistakes' })
    const time = run.results.find(r => r.outcome === 'time')
    expect(time.onN + time.offN).toBeLessThan(n)
  })

  it('admits how little a null result proves', () => {
    const line = verdictFor(EXPERIMENTS.mistakes, {
      enough: true, outcome: 'time', p: 0.6, relative: 4, better: 'on',
    })
    expect(line).toMatch(/noise/i)
    // The caveat is the point: a null here rules out a large effect only.
    expect(line).toMatch(/a fifth only four times in ten/)
  })
})
