// Difficulty tiers.
//
// The honesty rule, which outranks everything: what the player is shown is
// always the grader's verdict on the puzzle in front of them, never the tier
// they asked for. `requested` and `graded` are separate fields everywhere in
// this codebase for that reason.
//
// A tier is a band over the grader's summed technique cost. The bands are
// measured, not invented: `npm run calibrate -- explore` samples the real score
// distribution and the numbers below come from it. Re-run it after any change
// to the ladder or its costs, because both move the whole scale.
//
// `clues` is only a starting point for digging. The generator adjusts from
// there until the score lands in band, so the clue count is an outcome rather
// than a target.

// Bands measured 2026-07-30 from 520 sampled grids. The p50 score by hardest
// technique required came out: naked single 0, hidden single 40, pointing 212,
// claiming 370, naked pair 491, hidden pair 695, hidden triple 756, XY-Wing
// 1464, Swordfish 2168. Boundaries sit in the gaps between those clusters.
//
// `clues` is a starting point for digging, deliberately set lower than the tier
// needs. The generator adjusts from there, and putting a clue back is cheap
// while taking one out costs a uniqueness check, so it is much faster to start
// too hard and climb down than to start too easy and dig.

export const TIERS = [
  {
    name: 'Gentle',
    clues: 45,
    min: 0,
    max: 1,
    tech: 'naked singles',
    blurb: 'Every step is forced. Nothing to hunt for.',
  },
  {
    name: 'Easy',
    clues: 36,
    min: 1,
    max: 150,
    tech: 'hidden singles',
    blurb: 'Scan a unit. One home left for a digit.',
  },
  {
    name: 'Medium',
    clues: 29,
    min: 150,
    max: 420,
    tech: 'pointing, box-line',
    blurb: 'Candidates get locked into a line or a box.',
  },
  {
    name: 'Hard',
    clues: 25,
    min: 420,
    max: 720,
    tech: 'pairs',
    blurb: 'Cells sharing candidates rule them out elsewhere.',
  },
  {
    name: 'Expert',
    clues: 23,
    min: 720,
    max: 1300,
    attempts: 70,
    budgetMs: 12000,
    tech: 'triples, quads, X-Wing',
    blurb: 'Patterns across rows and columns, not single units.',
  },
  {
    // The rarest by a distance: most grids simply cannot be dug this hard while
    // staying solvable by logic. It gets a much larger search budget, which is
    // affordable because puzzles are generated ahead of time in a worker and
    // waiting costs the player nothing.
    name: 'Diabolical',
    clues: 22,
    min: 1300,
    max: Infinity,
    symmetric: false,
    attempts: 140,
    budgetMs: 25000,
    tech: 'XY-Wing, Swordfish',
    blurb: 'Chains of implication. Slow, and always solvable.',
  },
]

export const TIER_NAMES = TIERS.map(t => t.name)
export const tierByName = name => TIERS.find(t => t.name === name) || TIERS[2]

/**
 * The tier a score falls in. This is the only function allowed to decide what
 * a puzzle is called.
 */
export function tierForScore(score) {
  if (!Number.isFinite(score)) return null
  for (const t of TIERS) if (score >= t.min && score < t.max) return t
  return TIERS[TIERS.length - 1]
}

export const labelFor = score => tierForScore(score)?.name || 'Medium'
export const techFor = name => tierByName(name).tech

// Kept so old saves written before the six-tier rebuild still load with a
// sensible label instead of showing undefined.
export const LEGACY_LEVEL_NAME = { 1: 'Gentle', 2: 'Easy', 3: 'Medium', 4: 'Expert' }
