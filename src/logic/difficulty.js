// Difficulty definitions.
//
// The honesty rule, which survives every rebuild: what the player is shown is
// always the grader's verdict on the puzzle in front of them, never the
// difficulty they asked for. `requested` and `graded` are separate fields
// everywhere in this codebase for exactly that reason.
//
// Phase 2 replaces this four-tier table with six tiers scored by weighted
// technique cost. See docs/PLAN.md.

export const DIFFS = {
  Easy: { clues: 42, level: 1, tech: 'singles only' },
  Medium: { clues: 34, level: 2, tech: 'hidden singles' },
  Hard: { clues: 29, level: 3, tech: 'pairs & pointing' },
  Expert: { clues: 25, level: 4, tech: 'beyond pairs' },
}

export const LEVEL_NAME = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Expert' }

export const DIFF_ORDER = Object.keys(DIFFS)

/** The label to show for a graded level. Never takes the requested difficulty. */
export const labelFor = level => LEVEL_NAME[level] || 'Medium'
export const techFor = label => DIFFS[label]?.tech || ''
