import { describe, it, expect } from 'vitest'
import { mergeShard, shardFor, pathFor } from './backup.js'

const game = (id, endedAt, over = {}) => ({ id, endedAt, completed: true, ...over })

describe('sharding', () => {
  it('files a game under the month it ended in', () => {
    // Local time on purpose: the shard a game lands in should match the month
    // the player remembers playing it.
    const jan = new Date(2026, 0, 15, 12).getTime()
    const dec = new Date(2026, 11, 3, 12).getTime()
    expect(shardFor(game('a', jan))).toBe('2026-01')
    expect(shardFor(game('b', dec))).toBe('2026-12')
  })

  it('pads the month, so shards sort as strings', () => {
    const shards = [0, 8, 9, 10, 11].map(m => shardFor(game('x', new Date(2026, m, 1, 12).getTime())))
    expect(shards).toEqual([...shards].sort())
  })

  it('puts shards somewhere obvious in the repository', () => {
    expect(pathFor('2026-07')).toBe('games/2026-07.json')
  })
})

describe('merging a shard', () => {
  it('keeps games only the remote had', () => {
    const { merged, remoteOnly, added } = mergeShard([game('a', 1)], [game('b', 2)])
    expect(merged.map(g => g.id)).toEqual(['a', 'b'])
    expect(added.map(g => g.id)).toEqual(['b'])
    // The seam two-way sync needs: what this device is missing.
    expect(remoteOnly.map(g => g.id)).toEqual(['a'])
  })

  it('reports nothing added when the remote already has everything', () => {
    const { added, merged } = mergeShard([game('a', 1), game('b', 2)], [game('a', 1)])
    expect(added).toEqual([])
    expect(merged).toHaveLength(2)
  })

  it('never duplicates a game that exists on both sides', () => {
    const { merged } = mergeShard([game('a', 1)], [game('a', 1)])
    expect(merged).toHaveLength(1)
  })

  it('prefers the local copy on a collision', () => {
    // The device that played the game holds the better record of it.
    const { merged } = mergeShard([game('a', 1, { mistakes: 9 })], [game('a', 1, { mistakes: 2 })])
    expect(merged[0].mistakes).toBe(2)
  })

  it('orders the result by when the games ended', () => {
    const { merged } = mergeShard([game('c', 300), game('a', 100)], [game('b', 200)])
    expect(merged.map(g => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops entries with no id rather than writing junk to the repository', () => {
    const { merged } = mergeShard([{ endedAt: 1 }, game('a', 2)], [{ endedAt: 3 }])
    expect(merged.map(g => g.id)).toEqual(['a'])
  })

  it('handles an empty remote, which is every first push', () => {
    const { merged, added, remoteOnly } = mergeShard([], [game('a', 1), game('b', 2)])
    expect(merged).toHaveLength(2)
    expect(added).toHaveLength(2)
    expect(remoteOnly).toEqual([])
  })
})
