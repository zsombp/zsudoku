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
import { TECHNIQUES, CAGE_TECHNIQUES } from './techniques.js'
import { removeMark } from './marks.js'
import { CLASSIC } from './topology.js'
import { makePuzzle, generateFull, dig } from './generator.js'
import { makeVariantPuzzle, topologyFromRecord } from './variants.js'
import { randomSeed, mulberry32 } from '../lib/prng.js'

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
        ...(topo.cages ? { variant: 'killer', cages: structuredClone(topo.cages) } : {}),
        board: state.board.slice(),
        cands: state.cands.slice(),
        // What the player has to find: the cells the pattern is made of.
        cells: [...step.cells].sort((a, b) => a - b),
        digits: [...(step.digits || [])],
        unit: step.unit || null,
        detail: step.detail,
        // The second question: what does it remove. Finding a pattern and
        // knowing what it buys you are separate skills, and the second is the
        // one a hint never asks.
        eliminations: step.eliminations.map(e => ({ cell: e.cell, digit: e.digit })),
        // The step whole, so the card can open as a lesson on the same board.
        step: JSON.parse(JSON.stringify(step)),
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

  if (CAGE_TECHNIQUES.includes(technique)) {
    while (cards.length < count && Date.now() - t0 < budgetMs) {
      // A card needs a real position, not an exact tier. One shaping attempt
      // avoids spending the deck's budget chasing an irrelevant score band.
      const made = makeVariantPuzzle('killer', ['cageCombo', 'cageSum'].includes(technique) ? 'Medium' : 'Expert', {
        seed: (seed + n++ * 7919) >>> 0, attempts: 1,
        layoutOptions: { candidates: 1, maxNodes: 2000 },
        budgetMs: Math.max(1, budgetMs - (Date.now() - t0)),
      })
      if (!made) continue
      const card = cardFrom(made.puzzle, technique, topologyFromRecord(made))
      if (card) cards.push({ ...card, seed: made.seed })
    }
    return cards
  }

  // The rungs above the swordfish only fire where nothing older can move, so
  // a puzzle shaped to a tier band contains one rarely: an XYZ-Wing deck came
  // back with two cards in twelve seconds. A grid dug straight to 22 to 27
  // clues reaches that kind of position in milliseconds, and the position is
  // as real as any other: unique, and reached by the ladder's own logic. It
  // does not matter for a card whether the ladder could finish the grid.
  if (DUG.has(technique)) {
    while (cards.length < count && Date.now() - t0 < budgetMs) {
      const rng = mulberry32((seed + n * 7919) >>> 0)
      n++
      const solution = generateFull(rng)
      if (!solution) continue
      const puzzle = dig(solution, 22 + (n % 6), rng, { symmetric: false })
      const card = cardFrom(puzzle, technique)
      if (card) cards.push({ ...card, seed: (seed + n * 7919) >>> 0 })
    }
    return cards
  }

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

const DUG = new Set(['skyscraper', 'twoStringKite', 'wWing', 'xyzWing'])

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
  skyscraper: ['Diabolical', 'Infernal'],
  twoStringKite: ['Diabolical', 'Infernal'],
  wWing: ['Diabolical', 'Infernal'],
  xyzWing: ['Diabolical', 'Infernal'],
}

/** Did the player find it? Order does not matter, only the set of cells. */
export const isCorrect = (card, picked) => {
  if (picked.length !== card.cells.length) return false
  const want = new Set(card.cells)
  return picked.every(c => want.has(c))
}

/** The cells a card's pattern removes at least one candidate from. */
export const removalCells = card => [...new Set((card.eliminations || []).map(e => e.cell))].sort((a, b) => a - b)

/** Did the player name the cells that lose a note? Again only the set matters. */
export const removesCorrect = (card, picked) => {
  const want = removalCells(card)
  if (picked.length !== want.length) return false
  const set = new Set(want)
  return picked.every(c => set.has(c))
}

export const cardLabel = technique => TECHNIQUES[technique]?.label || technique
