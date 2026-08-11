import { describe, it, expect } from 'vitest'
import { compareSaves } from './backup.js'

const save = (moves, over = {}) => ({
  puzzle: new Array(81).fill(0),
  seed: 42,
  variant: 'classic',
  moveLog: Array.from({ length: moves }, (_, i) => ({ t: i, kind: 'place' })),
  savedAt: 1000,
  ...over,
})

describe('picking up a game from another device', () => {
  it('takes whichever position has more moves in it', () => {
    // Not "newest wins": a phone left open with the app in the background can
    // write a newer save containing fewer moves, and taking it would throw work
    // away silently.
    expect(compareSaves(save(10), save(30)).take).toBe('theirs')
    expect(compareSaves(save(30), save(10)).take).toBe('mine')
  })

  it('breaks a genuine tie by which was touched last', () => {
    expect(compareSaves(save(10, { savedAt: 1 }), save(10, { savedAt: 2 })).take).toBe('theirs')
    expect(compareSaves(save(10, { savedAt: 5 }), save(10, { savedAt: 2 })).take).toBe('mine')
  })

  it('refuses to merge two different puzzles and asks instead', () => {
    expect(compareSaves(save(5), save(9, { seed: 777 })).take).toBe('ask')
    expect(compareSaves(save(5), save(9, { variant: 'jigsaw' })).take).toBe('ask')
  })

  it('takes whatever exists when only one side has anything', () => {
    expect(compareSaves(null, save(3)).take).toBe('theirs')
    expect(compareSaves(save(3), null).take).toBe('mine')
    expect(compareSaves(save(3), {}).take).toBe('mine')
  })
})
