// Pattern flashcards.
//
// The practice screen gives you a whole puzzle that needs a technique, which
// takes ten minutes and teaches the pattern once. A flashcard shows a position
// where the pattern is present and asks one question: where is it. Twenty of
// those in three minutes is a different kind of practice, and it is the one
// that actually builds recognition.
//
// The positions come from real generated puzzles walked to the moment the
// technique fires, so every card is a situation that genuinely arose rather
// than a diagram someone drew.

import { createState, nextStep } from './grader.js'
import { TECHNIQUES } from './techniques.js'
import { removeMark } from './marks.js'
import { CLASSIC } from './topology.js'
import { makePuzzle } from './generator.js'
import { randomSeed } from '../lib/prng.js'

/**
 * Walk a puzzle until the wanted technique fires, and hand back the position
 * it fired in along with the answer.
 *
 * Returns null if the ladder finishes without ever needing it, which is the
 * common case for the rarer rungs and is why the caller retries.
 */
export function cardFrom(puzzle, technique, topo = CLASSIC) {
  const state = createState(puzzle, topo)

  for (let guard = 0; guard < 400; guard++) {
    const step = nextStep(state)
    if (!step) return null

    if (step.technique === technique) {
      return {
        technique,
        board: state.board.slice(),
        cands: state.cands.slice(),
        // What the player has to find: the cells the pattern is made of.
        cells: [...step.cells].sort((a, b) => a - b),
        digits: [...(step.digits || [])],
        unit: step.unit || null,
        detail: step.detail,
      }
    }

    for (const e of step.eliminations) state.cands[e.cell] = removeMark(state.cands[e.cell], e.digit)
    for (const p of step.placements) {
      state.board[p.cell] = p.digit
      state.cands[p.cell] = 0
      for (const q of topo.peers[p.cell]) state.cands[q] = removeMark(state.cands[q], p.digit)
    }
  }
  return null
}

/**
 * A deck of positions for one technique.
 *
 * Searches within a budget and returns however many it found. Saying "here are
 * six" is better than spinning for a full ten, and the rare rungs genuinely do
 * not turn up on demand.
 */
export function buildDeck(technique, { count = 8, budgetMs = 8000, seed = randomSeed() } = {}) {
  const tiers = TIERS_FOR[technique] || ['Hard', 'Expert', 'Diabolical']
  const cards = []
  const t0 = Date.now()
  let n = 0

  while (cards.length < count && Date.now() - t0 < budgetMs) {
    const tier = tiers[n % tiers.length]
    const made = makePuzzle(tier, { seed: (seed + n * 7919) >>> 0 })
    n++
    if (!made) continue
    const card = cardFrom(made.puzzle, technique)
    if (card) cards.push({ ...card, seed: made.seed })
  }
  return cards
}

/** Where each rung tends to show up, so the search starts in the right place. */
const TIERS_FOR = {
  hiddenSingle: ['Gentle', 'Easy'],
  pointing: ['Medium', 'Hard'],
  claiming: ['Medium', 'Hard'],
  nakedPair: ['Hard', 'Expert'],
  hiddenPair: ['Hard', 'Expert'],
  nakedTriple: ['Expert', 'Diabolical'],
  hiddenTriple: ['Expert', 'Diabolical'],
  nakedQuad: ['Expert', 'Diabolical'],
  xWing: ['Expert', 'Diabolical'],
  xyWing: ['Diabolical'],
  swordfish: ['Diabolical'],
}

/** Did the player find it? Order does not matter, only the set of cells. */
export const isCorrect = (card, picked) => {
  if (picked.length !== card.cells.length) return false
  const want = new Set(card.cells)
  return picked.every(c => want.has(c))
}

export const cardLabel = technique => TECHNIQUES[technique]?.label || technique
