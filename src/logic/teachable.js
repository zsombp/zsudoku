// Which rungs a lesson exists for, kept on its own so a screen can decide
// whether to offer one without loading the lesson engine. The engine is split
// into its own chunk (src/components/lazyLesson.js) and only arrives the first
// time a lesson is opened.
//
// The naked single is left out on purpose: it is bookkeeping, the grader scores
// it zero, and nothing counts as being stuck on it. The cage rungs are left out
// because their argument is a sum, which a list of placements cannot show.

export const TEACHABLE = new Set([
  'hiddenSingle',
  'pointing',
  'claiming',
  'nakedPair',
  'hiddenPair',
  'nakedTriple',
  'hiddenTriple',
  'nakedQuad',
  'xWing',
  'swordfish',
  'xyWing',
])

export const canTeach = technique => TEACHABLE.has(technique)
