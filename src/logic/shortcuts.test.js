import { describe, it, expect } from 'vitest'
import { PLAIN, SHORTCUTS, badgeFor, shortcutLine } from './shortcuts.js'

describe('the keyboard is described by the table that drives it', () => {
  it('documents every key it binds', () => {
    // The failure this replaces: erase was bound to Backspace, Delete and 0,
    // and the hand-written summary line listed it under none of them. A bound
    // key that nothing tells you about is a feature nobody has.
    for (const key of Object.keys(PLAIN)) {
      const badge = key.toUpperCase()
      expect(
        SHORTCUTS.some(s => s.badge === badge),
        `${badge} is bound to ${PLAIN[key]} and appears nowhere in SHORTCUTS`
      ).toBe(true)
    }
  })

  it('binds no key twice', () => {
    const keys = Object.keys(PLAIN)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('puts a badge on a tool at most once', () => {
    // Two rows may share a badge, because mark and return are one key on one
    // button in two states. What must not happen is one tool claiming two keys.
    const tools = SHORTCUTS.map(s => s.tool).filter(Boolean)
    expect(new Set(tools).size).toBe(tools.length)
  })

  it('gives a badge only to tools that have one', () => {
    expect(badgeFor('notes')).toBe('N')
    expect(badgeFor('erase')).toBe('⌫')
    expect(badgeFor('mark')).toBe('B')
    expect(badgeFor('return')).toBe('B')
    // Check has no shortcut and must not invent one.
    expect(badgeFor('check')).toBe(null)
    expect(badgeFor('nonsense')).toBe(null)
  })
})

describe('the summary line', () => {
  it('lists erase, which the hand-written version never did', () => {
    expect(shortcutLine()).toContain('⌫ erase')
  })

  it('says what the digits do under each input mode', () => {
    expect(shortcutLine({ quickInput: false })).toContain('1-9 place a digit')
    expect(shortcutLine({ quickInput: true })).toContain('1-9 pick, Enter to place')
    expect(shortcutLine({ quickInput: true })).not.toContain('1-9 place a digit')
  })

  it('offers the finish key only while it would do something', () => {
    // A key that does nothing most of the time is worse than one you were
    // never told about, so this one appears exactly when it is live.
    expect(shortcutLine({ canComplete: false })).not.toContain('C finish')
    expect(shortcutLine({ canComplete: true })).toContain('C finish when forced')
  })

  it('names the bookmark once, not once per tool state', () => {
    const line = shortcutLine()
    expect(line.match(/B mark or return/g)).toHaveLength(1)
  })
})
