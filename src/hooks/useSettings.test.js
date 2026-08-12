import { describe, it, expect } from 'vitest'
import { DEFAULTS } from './useSettings.js'

describe('what the app does before you ask it to', () => {
  it('leaves every assist and every input mode switched off', () => {
    // Each of these changes how the game plays or what it can reach. A default
    // that flipped to true would arrive as a silent change of behaviour in an
    // app that updates itself without asking, which is the worst possible way
    // for one to arrive.
    //
    // Handwriting in particular: the number pad is right every time and the
    // recogniser is not, so writing by hand has to be a thing somebody chose.
    for (const key of [
      'handwriting',
      'quickInput',
      'autoPencilOnStart',
      'explainHints',
      'askFirst',
      'sound',
    ]) {
      expect(`${key} defaults to ${DEFAULTS[key]}`).toBe(`${key} defaults to false`)
    }
  })

  it('has a default for every setting, so an old save gains it rather than a hole', () => {
    // Settings are merged over these defaults, so a key missing here is a key
    // that reads as undefined for anyone who saved their settings before it
    // existed. That is how `autoPencilOnStart` sat unread from Phase 6 to
    // v1.11.0 without anything failing.
    for (const [key, value] of Object.entries(DEFAULTS)) {
      expect(`${key} is ${value === undefined ? 'missing' : 'set'}`).toBe(`${key} is set`)
    }
  })
})
