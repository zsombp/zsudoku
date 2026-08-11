import { describe, it, expect } from 'vitest'
import { cardFrom, buildDeck, isCorrect } from './flashcards.js'
import { makePuzzle } from './generator.js'
import { createState, nextStep } from './grader.js'
import { hasMark } from './marks.js'

describe('a flashcard is a real position', () => {
  it('is the exact position where the technique fires', { timeout: 40000 }, () => {
    const made = makePuzzle('Hard', { seed: 1234 })
    const card = cardFrom(made.puzzle, 'pointing')
    if (!card) return
    // Re-asking the ladder in that position must offer the same technique.
    const step = nextStep({ board: card.board, cands: card.cands, topo: createState(card.board).topo })
    expect(step.technique).toBe('pointing')
    expect([...step.cells].sort((a, b) => a - b)).toEqual(card.cells)
  })

  it('only ever names cells that are still empty', { timeout: 40000 }, () => {
    const deck = buildDeck('pointing', { count: 3, budgetMs: 8000, seed: 99 })
    expect(deck.length).toBeGreaterThan(0)
    for (const card of deck) {
      for (const c of card.cells) expect(card.board[c]).toBe(0)
    }
  })

  it('carries the candidates the pattern is visible in', { timeout: 40000 }, () => {
    const deck = buildDeck('pointing', { count: 2, budgetMs: 8000, seed: 7 })
    for (const card of deck) {
      // Each named digit must actually be a candidate in each named cell.
      for (const cell of card.cells) {
        expect(card.digits.some(d => hasMark(card.cands[cell], d))).toBe(true)
      }
    }
  })

  it('returns nothing rather than a wrong card when the rung never fires', () => {
    // A grid that falls to singles alone never needs a swordfish.
    const made = makePuzzle('Gentle', { seed: 5 })
    expect(cardFrom(made.puzzle, 'swordfish')).toBeNull()
  })
})

describe('marking an answer', () => {
  const card = { cells: [10, 20, 30] }

  it('accepts the right cells in any order', () => {
    expect(isCorrect(card, [30, 10, 20])).toBe(true)
  })

  it('rejects a partial answer', () => {
    expect(isCorrect(card, [10, 20])).toBe(false)
  })

  it('rejects extra cells, so shotgunning the board cannot pass', () => {
    expect(isCorrect(card, [10, 20, 30, 40])).toBe(false)
  })

  it('rejects the right count of the wrong cells', () => {
    expect(isCorrect(card, [1, 2, 3])).toBe(false)
  })
})
