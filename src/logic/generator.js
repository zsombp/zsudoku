// Puzzle generation.
//
// Two changes from the prototype's approach, both of which exist to make the
// difficulty label mean something:
//
// 1. It digs toward a difficulty band, not a clue count. The old code dug to a
//    fixed number of clues and hoped the grade landed right. Here the puzzle is
//    graded as it is dug and the digging adjusts: too easy, remove another
//    clue; too hard, put one back. Clue count is an outcome, not a target.
//
// 2. Nothing that needs guessing ever ships. If the technique ladder cannot
//    finish a puzzle, it is discarded whatever tier was asked for. "Expert"
//    means hard, not unfair.

import { CLASSIC, range } from './topology.js'
import { countSolutions } from './solver.js'
import { gradePuzzle } from './grader.js'
import { TECHNIQUES } from './techniques.js'
import { TIERS, tierByName, tierForScore } from './difficulty.js'
import { mulberry32, randomSeed, shuffle } from '../lib/prng.js'

const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t.name, i]))

/**
 * A random completed grid.
 *
 * Fills the most constrained cell first rather than walking in reading order.
 * Reading order is fine for square boxes, where it happens to complete one box
 * before starting the next, and is hopeless the moment the regions are
 * irregular or there are extra constraints: a jigsaw region can span six rows,
 * so a contradiction planted in row one is not discovered until row seven and
 * the search thrashes. Anti-knight never finished a single grid that way.
 *
 * Choosing the cell with fewest candidates finds those contradictions
 * immediately. It is the same ordering the solver has always used, for the same
 * reason.
 *
 * It also gives up and starts over, which matters more than the ordering does.
 * This search is heavy-tailed: on a constrained topology a run either finishes
 * in a couple of hundred steps or thrashes for tens of thousands and proves
 * nothing, and that is true even when a solution certainly exists and only the
 * random ordering was unlucky. Abandoning a slow run and reshuffling beats
 * letting it grind, by a wide margin.
 *
 * Returns null if every restart is exhausted, so a caller can pick a different
 * layout rather than hang.
 */
export function generateFull(rng, topo = CLASSIC, { budget = 4000, restarts = 60 } = {}) {
  for (let attempt = 0; attempt < restarts; attempt++) {
    const grid = attemptFill(rng, topo, budget)
    if (grid) return grid
  }
  return null
}

function attemptFill(rng, topo, budget) {
  const b = new Array(81).fill(0)
  let steps = 0

  const fill = () => {
    if (++steps > budget) return null
    let best = -1
    let bestCands = null
    for (let i = 0; i < 81; i++) {
      if (b[i] !== 0) continue
      const options = []
      for (let v = 1; v <= 9; v++) {
        let ok = true
        for (const p of topo.peers[i]) if (b[p] === v) { ok = false; break }
        if (ok) options.push(v)
      }
      // A cell with nowhere to go means this branch is already dead.
      if (options.length === 0) return false
      if (!bestCands || options.length < bestCands.length) {
        best = i
        bestCands = options
        if (options.length === 1) break
      }
    }
    if (best === -1) return true

    for (const v of shuffle(bestCands, rng)) {
      b[best] = v
      const done = fill()
      if (done === null) return null
      if (done) return true
      b[best] = 0
    }
    return false
  }

  return fill() === true ? b : null
}

/**
 * Removes clues while keeping the solution unique.
 *
 * Digs in rotationally symmetric pairs (i and 80-i), which is what gives the
 * finished grid its symmetry. The hardest tiers need asymmetry to reach their
 * scores, so `symmetric` is a per-tier switch rather than a rule.
 */
export function dig(full, targetClues, rng, { symmetric = true, topo = CLASSIC } = {}) {
  const b = full.slice()
  let clues = 81

  if (symmetric) {
    for (const i of shuffle(range(41), rng)) {
      if (clues <= targetClues) break
      const j = 80 - i
      if (b[i] === 0) continue
      const k1 = b[i]
      const k2 = b[j]
      b[i] = 0
      if (j !== i) b[j] = 0
      if (countSolutions(b, 2, topo) !== 1) {
        b[i] = k1
        if (j !== i) b[j] = k2
      } else {
        clues -= j === i ? 1 : 2
      }
    }
  }

  if (clues > targetClues) {
    for (const i of shuffle(range(81), rng)) {
      if (clues <= targetClues) break
      if (b[i] === 0) continue
      const k = b[i]
      b[i] = 0
      if (countSolutions(b, 2, topo) !== 1) b[i] = k
      else clues--
    }
  }

  return b
}

const clueCount = p => p.reduce((n, v) => n + (v ? 1 : 0), 0)

/** One more clue out, keeping uniqueness. Raises difficulty. Null if stuck. */
function digOneMore(puzzle, rng, topo = CLASSIC) {
  for (const i of shuffle(range(81), rng)) {
    if (puzzle[i] === 0) continue
    const next = puzzle.slice()
    next[i] = 0
    if (countSolutions(next, 2, topo) === 1) return next
  }
  return null
}

/** One clue back from the solution. Always safe, and lowers difficulty. */
function restoreOne(puzzle, solution, rng) {
  const holes = range(81).filter(i => puzzle[i] === 0)
  if (!holes.length) return null
  const i = shuffle(holes, rng)[0]
  const next = puzzle.slice()
  next[i] = solution[i]
  return next
}

// ---- killer digs differently, because uniqueness is already settled ----
//
// A cage layout is only shipped once the empty board has exactly one answer
// under it, so every subset of the solution is unique too and there is no
// uniqueness check to pay for. Digging is then just choosing which cells to
// give away, and the classic `dig` is not merely slower here but wrong: it asks
// `countSolutions`, which knows nothing about cages, so on a killer with no
// givens it reports many answers and refuses to remove anything at all.
//
// Where each tier starts, measured over 16 layouts sweeping clue counts, and
// over 6 layouts with 40 random subsets at each of ten counts:
//
//   clues     0      4      8     12     20     30     40     45
//   p50    1295    226    175    151    131     75     15      0
//
// The whole scale lives between zero and about eight givens; from twelve up
// every layout measured graded Easy or Medium. That is the shape to know about
// killer: a cage layout is a hard puzzle, and clues are how it is made gentle.
const KILLER_CLUES = { Gentle: 44, Easy: 24, Medium: 8, Hard: 4, Expert: 2, Diabolical: 1 }

/** `n` givens taken at random from the solution. */
function killerClues(solution, n, rng) {
  const b = new Array(81).fill(0)
  for (const i of shuffle(range(81), rng).slice(0, n)) b[i] = solution[i]
  return b
}

/** One clue out, no uniqueness check needed. Raises difficulty. Null if stuck. */
function dropOne(puzzle, rng) {
  const given = range(81).filter(i => puzzle[i] !== 0)
  if (!given.length) return null
  const next = puzzle.slice()
  next[shuffle(given, rng)[0]] = 0
  return next
}

/**
 * The same adjustment loop as `shapeToBand`, over clue subsets rather than over
 * a symmetric dig, and starting from a fresh random subset every call so the
 * attempts in `makePuzzle` explore different boards rather than the same one.
 *
 * `maxAdjust` is larger than the classic 30 because one clue moves a killer
 * score by hundreds near the bottom of the range, so the walk overshoots and
 * has to come back.
 */
function shapeKillerToBand(solution, tier, rng, topo, { maxAdjust = 40 } = {}) {
  let puzzle = killerClues(solution, KILLER_CLUES[tier.name] ?? tier.clues, rng)
  let grade = gradePuzzle(puzzle, { topo })

  for (let n = 0; n < maxAdjust; n++) {
    // Too few clues to finish by logic is the same failure the classic dig has,
    // and the same answer: give one back rather than ship a guess.
    if (!grade.solved) {
      const back = restoreOne(puzzle, solution, rng)
      if (!back) break
      puzzle = back
      grade = gradePuzzle(puzzle, { topo })
      continue
    }
    if (grade.score >= tier.min && grade.score < tier.max) break

    const next = grade.score < tier.min ? dropOne(puzzle, rng) : restoreOne(puzzle, solution, rng)
    if (!next) break
    puzzle = next
    grade = gradePuzzle(puzzle, { topo })
  }

  return { puzzle, grade }
}

/**
 * The grid an attempt works from.
 *
 * Every topology up to killer could be refilled on each attempt, and that
 * refilling is where the search gets its variety. A caged board cannot: the
 * sums were read off one particular grid, so a fresh grid under the same cages
 * is a puzzle whose own answer breaks its stated totals. Nothing throws and the
 * board looks completely normal, which is exactly why it is stated here rather
 * than left to each caller.
 */
const gridFor = (topo, rng, given, first) =>
  topo.cages ? given : (first && given) || generateFull(rng, topo)

/**
 * Digs a single grid toward the target band, then reports where it landed.
 * The adjustment loop is what lifts the hit rate: without it, a fixed clue
 * count scatters across two or three tiers.
 */
function shapeToBand(solution, tier, rng, { maxAdjust = 30, topo = CLASSIC } = {}) {
  if (topo.cages) return shapeKillerToBand(solution, tier, rng, topo)
  let puzzle = dig(solution, tier.clues, rng, { symmetric: tier.symmetric !== false, topo })
  let grade = gradePuzzle(puzzle, { topo })

  for (let n = 0; n < maxAdjust; n++) {
    // Unsolvable by the ladder means we dug past the point of fairness. Put a
    // clue back rather than shipping a puzzle that needs a guess.
    if (!grade.solved) {
      const back = restoreOne(puzzle, solution, rng)
      if (!back) break
      puzzle = back
      grade = gradePuzzle(puzzle, { topo })
      continue
    }
    if (grade.score >= tier.min && grade.score < tier.max) break

    if (grade.score < tier.min) {
      const harder = digOneMore(puzzle, rng, topo)
      if (!harder) break
      const nextGrade = gradePuzzle(harder, { topo })
      // Refuse a step that lands somewhere unfair.
      if (!nextGrade.solved) {
        const alt = digOneMore(puzzle, rng, topo)
        if (!alt) break
        const altGrade = gradePuzzle(alt, { topo })
        if (!altGrade.solved) break
        puzzle = alt
        grade = altGrade
        continue
      }
      puzzle = harder
      grade = nextGrade
    } else {
      const easier = restoreOne(puzzle, solution, rng)
      if (!easier) break
      puzzle = easier
      grade = gradePuzzle(easier, { topo })
    }
  }

  return { puzzle, grade }
}

/**
 * Generates a puzzle aiming at `wanted`, and reports what it actually got.
 *
 * `graded` is the grader's verdict and is the only thing ever shown to the
 * player. It is not always `requested`, and when it differs the interface says
 * so out loud. The alternative is lying about difficulty, which is the thing
 * this whole engine exists to avoid.
 */
/**
 * Which tiers are worth searching for each technique.
 *
 * Taken from the calibration run rather than guessed: pointing and claiming
 * show up around Medium, pairs around Hard, fish and wings at the top. Trying
 * Gentle for an X-Wing would burn the whole budget on grids that cannot contain
 * one.
 */
const TIERS_FOR = {
  nakedSingle: ['Gentle', 'Easy'],
  hiddenSingle: ['Easy', 'Medium'],
  pointing: ['Medium', 'Hard'],
  claiming: ['Medium', 'Hard'],
  nakedPair: ['Hard', 'Expert'],
  hiddenPair: ['Hard', 'Expert'],
  nakedTriple: ['Expert', 'Diabolical'],
  hiddenTriple: ['Expert', 'Diabolical'],
  nakedQuad: ['Expert', 'Diabolical'],
  xWing: ['Expert', 'Diabolical'],
  xyWing: ['Diabolical', 'Expert'],
  swordfish: ['Diabolical'],
}

/**
 * A puzzle that actually requires `technique` somewhere in its solution.
 *
 * This is what makes the coach actionable: it can already tell you which
 * pattern you keep needing hints on, and until now could do nothing about it.
 * The engine already records which techniques each puzzle needed, so this is a
 * filter over generation rather than new machinery.
 *
 * Returns null if the budget runs out. Some techniques are genuinely rare and
 * saying so is better than spinning.
 */
export function makePracticePuzzle(technique, { seed = randomSeed(), budgetMs = 20000, topo = CLASSIC, solution: given = null } = {}) {
  // A cage rung cannot appear on a board with no cages, so say so at once. The
  // alternative is thirty seconds of searching followed by the same answer,
  // which reads as a slow app rather than an impossible request.
  if (TECHNIQUES[technique]?.cages && !topo.cages) return null
  const search = TIERS_FOR[technique] || TIERS.map(t => t.name)
  const rng = mulberry32(seed)
  const t0 = Date.now()
  let attempts = 0

  while (Date.now() - t0 < budgetMs) {
    for (const tierName of search) {
      if (Date.now() - t0 > budgetMs) break
      attempts++
      const tier = tierByName(tierName)
      // generateFull gives up rather than hanging, so it can return null.
      const solution = gridFor(topo, rng, given, attempts === 1)
      if (!solution) continue
      const { puzzle, grade } = shapeToBand(solution, tier, rng, { topo })
      if (!grade.solved) continue
      if (!grade.counts[technique]) continue

      const graded = tierForScore(grade.score)
      return {
        puzzle,
        solution,
        seed,
        requested: graded.name,
        graded: graded.name,
        score: grade.score,
        hardest: grade.hardest,
        counts: grade.counts,
        clues: clueCount(puzzle),
        variant: topo.id,
        practice: technique,
        attempts,
      }
    }
  }
  return null
}

export function makePuzzle(wanted, opts = {}) {
  const tier = tierByName(wanted)
  const seed = opts.seed ?? randomSeed()
  const topo = opts.topo ?? CLASSIC
  const attempts = opts.attempts ?? tier.attempts ?? 24
  const budgetMs = opts.budgetMs ?? tier.budgetMs ?? 6000
  const rng = mulberry32(seed)
  const t0 = Date.now()
  let best = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    // A variant may arrive with a grid already in hand, because for jigsaw the
    // shapes and a grid that fills them are built together, and for killer the
    // sums are read off one particular grid and cannot outlive it.
    const solution = gridFor(topo, rng, opts.solution, attempt === 0)
    if (!solution) continue
    const { puzzle, grade } = shapeToBand(solution, tier, rng, { topo })

    // Never ship a puzzle the ladder cannot finish, at any tier.
    if (!grade.solved) continue

    const graded = tierForScore(grade.score)
    const cand = {
      puzzle,
      solution,
      seed,
      requested: wanted,
      graded: graded.name,
      variant: topo.id,
      score: grade.score,
      hardest: grade.hardest,
      counts: grade.counts,
      clues: clueCount(puzzle),
    }

    if (graded.name === tier.name) return cand

    // Keep the nearest miss, measured in tiers rather than raw score.
    const distance = Math.abs(TIER_INDEX[graded.name] - TIER_INDEX[tier.name])
    if (!best || distance < best.distance) best = { ...cand, distance }

    if (Date.now() - t0 > budgetMs) break
  }

  return best
}

/**
 * A puzzle aimed at one particular player.
 *
 * Not a tier, a specification: it must need these techniques, and it should
 * take about this long. Both are things the engine already records, so this is
 * a filter over generation rather than new machinery, exactly like practice
 * mode. The difference is that practice drills one rung in isolation and this
 * builds a whole game around what you are worst at.
 *
 * `wants` is a list of technique keys in preference order. A puzzle needing the
 * first is best, needing any of them is acceptable, and needing none is
 * rejected. Returns null if the budget runs out rather than shipping something
 * that does not meet the specification, because a "tailored" puzzle that was
 * not tailored is worse than an honest failure.
 */
export function makeTailoredPuzzle({
  wants = [],
  tiers = ['Medium', 'Hard', 'Expert'],
  seed = randomSeed(),
  budgetMs = 12000,
  topo = CLASSIC,
  solution: given = null,
} = {}) {
  if (!wants.length) return null
  const rng = mulberry32(seed)
  const t0 = Date.now()
  let best = null
  let tries = 0

  while (Date.now() - t0 < budgetMs) {
    for (const tierName of tiers) {
      if (Date.now() - t0 > budgetMs) break
      tries++
      const tier = tierByName(tierName)
      const solution = gridFor(topo, rng, given, tries === 1)
      if (!solution) continue
      const { puzzle, grade } = shapeToBand(solution, tier, rng, { topo })
      if (!grade.solved) continue

      const hit = wants.filter(k => grade.counts[k])
      if (!hit.length) continue

      const graded = tierForScore(grade.score)
      const cand = {
        puzzle,
        solution,
        seed,
        requested: graded.name,
        graded: graded.name,
        score: grade.score,
        hardest: grade.hardest,
        counts: grade.counts,
        clues: clueCount(puzzle),
        variant: topo.id,
        tailored: hit,
        attempts: tries,
      }
      // The first want is what was really asked for; anything else is a
      // fallback worth keeping while the search continues for something better.
      if (hit[0] === wants[0]) return cand
      if (!best || hit.length > best.tailored.length) best = cand
    }
  }
  return best
}
