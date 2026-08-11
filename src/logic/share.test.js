import { describe, it, expect } from 'vitest'
import { encodePuzzle, decodePuzzle, isPuzzleCode } from './share.js'

describe('a puzzle as a word', () => {
  it('round-trips every board and tier', () => {
    for (const variant of ['classic', 'jigsaw', 'x', 'windoku', 'antiknight']) {
      for (const tier of ['Gentle', 'Easy', 'Medium', 'Hard', 'Expert', 'Diabolical']) {
        const code = encodePuzzle({ variant, tier, seed: 123456789 })
        expect(decodePuzzle(code)).toEqual({ variant, tier, seed: 123456789 })
      }
    }
  })

  it('survives being read aloud badly', () => {
    const code = encodePuzzle({ variant: 'jigsaw', tier: 'Hard', seed: 42 })
    // Lower case, missing dashes, stray spaces: all the ways a person types.
    expect(decodePuzzle(code.toLowerCase())).toEqual(decodePuzzle(code))
    expect(decodePuzzle(code.replace(/-/g, ''))).toEqual(decodePuzzle(code))
    expect(decodePuzzle(' ' + code + ' ')).toEqual(decodePuzzle(code))
  })

  it('avoids the characters people mistype', () => {
    for (let seed = 0; seed < 400; seed++) {
      const code = encodePuzzle({ variant: 'classic', tier: 'Hard', seed })
      expect(code).not.toMatch(/[01IO]/)
    }
  })

  it('handles the largest seed the generator can produce', () => {
    const seed = 0xffffffff
    expect(decodePuzzle(encodePuzzle({ variant: 'x', tier: 'Expert', seed })).seed).toBe(seed)
  })

  it('refuses nonsense rather than inventing a puzzle', () => {
    expect(decodePuzzle('')).toBeNull()
    expect(decodePuzzle('!!')).toBeNull()
    expect(decodePuzzle('QQ')).toBeNull()
    expect(isPuzzleCode('hello there')).toBe(false)
  })

  it('is short enough to say out loud', () => {
    const code = encodePuzzle({ variant: 'classic', tier: 'Hard', seed: 3735928559 })
    expect(code.length).toBeLessThanOrEqual(12)
  })
})
