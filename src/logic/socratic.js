// Socratic hints: a question that leads you to the move, instead of the move.
//
// The hint button has two rungs already. Press once and it draws the pattern,
// press again and it fills the digit. This is the rung below both: it asks you
// something. It names the unit or the digit worth looking at and then stops,
// so the finding is still yours.
//
// The question is built from the step the grader would take next, so a question
// can no more disagree with the difficulty rating than a hint can: same ladder,
// same step, a different sentence. There is one phrasing per technique and
// nothing generic, because a question that fits every technique ("what can you
// see here?") points at nothing at all.
//
// ---- what the measurements said ----
//
// Walking the grader's own solve path over 40 puzzles (Gentle to Expert, 2104
// steps), the cheapest step is a naked single 77.8% of the time and a hidden
// single a further 17.7%. Only 4.5% of steps are the elimination patterns, and
// they exist at all only from Medium up: non-single steps per puzzle come out
// at 0.0 Gentle, 0.0 Easy, 2.1 Medium, 5.0 Hard, 4.6 Expert. So most questions
// will be about a single, and that is right rather than a defect: if a single
// is available then the honest answer to "where do I look" is that you have
// missed an easy one. The pattern questions are for the positions where a
// player actually stalls, and there are only a handful of those per grid.
//
// A question costs a p50 under 0.01ms and a worst case of 0.23ms, over 709
// positions, which is one ladder pass. Walking eight steps ahead costs 0.59ms.
// Nothing here needs a worker.

import { createState, nextStep, applyStep } from './grader.js'
import { CLASSIC, unitName } from './topology.js'
import { countMarks } from './marks.js'

const COUNT = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four' }
const HOMES = { 2: 'two', 3: 'three', 4: 'four' }

/** "2 or 7", "2, 5 and 7". */
function listOf(digits, conj) {
  if (digits.length < 2) return String(digits[0] ?? '')
  return `${digits.slice(0, -1).join(', ')} ${conj} ${digits[digits.length - 1]}`
}

/**
 * The word for a region on this board.
 *
 * A jigsaw has no boxes, and its topology says so in the names it gives its own
 * regions. Reading the word off the topology rather than hardcoding "box" is
 * the same rule the board follows when it draws its heavy rules: ask the
 * topology, never do the arithmetic yourself.
 */
const regionWord = topo => ((topo.unitMeta[topo.regionStart]?.name || '').includes('box') ? 'box' : 'region')

/** Every unit containing a cell, with its metadata and how much of it is open. */
function unitsAround(cell, board, topo) {
  const out = []
  for (let u = 0; u < topo.units.length; u++) {
    const cells = topo.units[u]
    if (!cells.includes(cell)) continue
    out.push({ meta: topo.unitMeta[u], cells, open: board ? cells.filter(i => board[i] === 0).length : 9 })
  }
  return out
}

/**
 * Which unit to send the player to when the step names none, which is the case
 * for a naked single: the cell is proved by its peers, not by any one unit.
 *
 * Measured over 1637 naked singles on real solve paths. Naming the region is
 * the natural scanning motion, but the region holds exactly one empty cell 22%
 * of the time, and "the only blank left in the top left box" is not a question,
 * it is the answer. Taking the widest unit instead drops that to 3.7%. So:
 * the region when it still has something to search, otherwise whichever unit
 * has the most blanks.
 *
 * The residual 3.7% is a cell that is the last blank in its row, its column and
 * its region at once. Nothing can point at it without pointing at it, and by
 * then there is nothing left to give away.
 */
function whereToLook(cell, board, topo) {
  const units = unitsAround(cell, board, topo)
  if (!units.length) return null
  const region = units.find(u => u.meta.type === 'region')
  if (region && region.open >= 2) return region.meta
  return units.reduce((a, b) => (b.open > a.open ? b : a)).meta
}

/**
 * Where to send someone looking for a digit of their own that is wrong.
 *
 * The same idea as `whereToLook` and it counts the opposite thing, which is the
 * reason it is a second function rather than a flag. That one hides a blank
 * cell among other blanks; this one hides a written digit among other written
 * digits, so a unit with one digit in it would name the culprit outright.
 */
function whereItIsWrong(cell, board, topo) {
  const units = unitsAround(cell, board, topo).map(u => ({ ...u, filled: 9 - u.open }))
  if (!units.length) return null
  const region = units.find(u => u.meta.type === 'region')
  if (region && region.filled >= 2) return region.meta
  return units.reduce((a, b) => (b.filled > a.filled ? b : a)).meta
}

/**
 * The unit a question points at, which is not always the one on the step.
 *
 * A naked single carries no unit: the cell is proved by its peers, not by any
 * one unit, so the question picks a place to search and this is where it is
 * picked. The fishes and the XY-Wing genuinely have no unit, because their
 * argument runs across several, and their questions name only the digits.
 *
 * Split out because `askAbout` has to return the same unit the sentence names.
 * It did not, at first: the question said "one cell in the top left box" while
 * the result carried unit: null, so the pattern rung had nothing to draw and
 * nothing failed anywhere.
 */
export function focusUnit(step, topo = CLASSIC, board = null) {
  if (step.unit) return step.unit
  if (step.technique === 'nakedSingle') return whereToLook(step.placements[0].cell, board, topo)
  return null
}

// ---- one phrasing per technique ----
//
// Every one of these names a unit, a digit, or both, and none of them names a
// cell. That is the whole contract: a question that names the cell is a hint
// wearing a question mark.

const nakedSubsetAsk = k => step => {
  const where = unitName(step.unit)
  if (k === 2) {
    return `Two cells in ${where} can only be ${listOf(step.digits, 'or')}. What does that mean for the rest of it?`
  }
  return `${COUNT[k]} cells in ${where} hold nothing but ${listOf(step.digits, 'and')} between them. What does that mean for the rest of it?`
}

const hiddenSubsetAsk = k => step =>
  `In ${unitName(step.unit)}, ${listOf(step.digits, 'and')} are down to the same ${HOMES[k]} cells. What else could those cells hold?`

const fishAsk = k => step =>
  `Look at every place ${step.digits[0]} can still go. Do ${HOMES[k]} rows, or ${HOMES[k]} columns, hold it in exactly the same ${HOMES[k]} positions?`

const ASK = {
  nakedSingle: (step, topo, board) =>
    `One cell in ${unitName(focusUnit(step, topo, board))} has only one digit left that will fit. Which cell is it?`,

  // The phrasing the vision asked for, more or less word for word.
  hiddenSingle: step => `What do you notice about the ${step.digits[0]}s in ${unitName(step.unit)}?`,

  // Pointing and claiming open the same way on purpose. They are mirror images
  // and the parallel wording is what makes the difference between them visible.
  pointing: step =>
    `Where can ${step.digits[0]} still go in ${unitName(step.unit)}? If those cells all sit on one line, what does that rule out?`,

  claiming: (step, topo) =>
    `Where can ${step.digits[0]} still go in ${unitName(step.unit)}? If they all sit inside one ${regionWord(topo)}, what does that rule out?`,

  nakedPair: nakedSubsetAsk(2),
  nakedTriple: nakedSubsetAsk(3),
  nakedQuad: nakedSubsetAsk(4),
  hiddenPair: hiddenSubsetAsk(2),
  hiddenTriple: hiddenSubsetAsk(3),
  xWing: fishAsk(2),
  swordfish: fishAsk(3),

  xyWing: step => {
    const [x, y, z] = step.digits
    return `Somewhere a cell holds just ${x} and ${y}, and it sees two cells that each hold ${z}. Whichever way that cell falls, what happens to ${z}?`
  },

  // The cage rungs. They name a total and never the cage's position, for the
  // same reason the rest name a unit and never the cell: the finding stays
  // yours. A killer board has thirty-odd cages and only a handful share a total,
  // so "the cage adding to 17" is a search rather than an answer.
  cageCombo: () => `One cage on this board can be made in only one way. Which total is it, and what has to go in it?`,

  cageSum: () => `Every way of making one cage's total leaves the same digits out. Which cage, and which digits?`,

  cageSingle: () =>
    `One digit turns up in every way of making its cage, and the cage has only one cell left that will take it. Which digit?`,

  sum45: step => `${unitName(step.unit)} adds to 45, and the cages over it almost settle it. What is left over?`,

  cageLocked: (step, topo) =>
    `${step.digits[0]} has to appear in one particular cage. If every place left for it in that cage sits in one row, column or ${regionWord(topo)}, what does that rule out?`,
}

/**
 * The question for a step, and nothing else.
 *
 * Separate from `askAbout` so anything already holding a step can pose it: the
 * review screen has the worked examples from the game just played, and asking
 * about one of those is the same sentence.
 *
 * `board` is optional and only affects the naked single, which has no unit of
 * its own and uses the board to pick one worth searching.
 */
export function questionFor(step, topo = CLASSIC, board = null) {
  const ask = ASK[step?.technique]
  return ask ? ask(step, topo, board) : null
}

/** How many elimination steps `skip` may walk past before it gives up. */
const MAX_SKIP = 20

/**
 * A question about the position, or null when there is nothing to ask.
 *
 * Returns the whole escalation, so the caller can go question, then pattern,
 * then answer without asking twice and risking two different replies:
 *
 *   question      the words. names a unit or a digit, never a cell
 *   technique     the rung, for the pattern rung and for recording what was used
 *   cells         the cells the pattern is made of, to outline at rung two
 *   digits        the digits involved
 *   unit          the unit metadata, or null for the fishes and the XY-Wing
 *   detail        the ladder's own sentence about the step, for rung two
 *   placements    what it proves, for rung three
 *   eliminations  what it rules out, for rung three
 *   cands         the candidate state the pattern is true in
 *   assumed       techniques whose eliminations this question already assumes
 *
 * `cands` matters for the same reason it does in the review: a pattern drawn
 * over the wrong candidate state shows cells that visibly contradict their own
 * label.
 *
 * ---- skip ----
 *
 * An elimination step changes no digit on the board, so a caller that rebuilds
 * from the board gets the identical question next time it asks, forever. Over
 * 2010 presses along real solves only 1.9% needed to walk past anything, but
 * that number is misleading twice over. Those are exactly the positions where a
 * player is stuck and would actually press the button, the tail runs to seven
 * elimination steps in a row, and without this only six of the twelve rungs can
 * ever be the question: across 9090 questions asked at every depth, every
 * hidden pair, naked triple, hidden triple and swordfish reached was behind at
 * least one skip.
 *
 * So `skip` walks past that many elimination steps and asks about what is
 * behind them. It never walks past a placement, because a question about a
 * board that has a digit the player has not written is a question about a
 * position they cannot see. Pass it only after the previous question has been
 * escalated to its answer: what comes back stands on those eliminations, which
 * is what `assumed` and `cands` record.
 *
 * ---- solution ----
 *
 * Optional, and worth passing. A wrong digit poisons every candidate set, and
 * the ladder then derives things confidently and wrongly. Measured by planting
 * one wrong digit in 197 real positions: 39.6% of the time the cheapest step
 * claimed a digit the solution contradicts, and the board looked fine from the
 * inside in the rest, 18.8% had a cell with no candidates left and not one had
 * a duplicate in a unit. Sending someone hunting for a pattern that is not
 * there is worse than saying nothing, so with a solution in hand the question
 * becomes one about their own digits instead.
 */
export function askAbout(board, topo = CLASSIC, { skip = 0, solution = null } = {}) {
  const state = createState(board, topo)

  const wrong = contradiction(state, board, topo, solution)
  if (wrong) return wrong

  const assumed = []

  for (let n = 0; n < Math.min(skip, MAX_SKIP); n++) {
    const ahead = nextStep(state)
    if (!ahead || ahead.placements.length) break
    applyStep(state, ahead)
    assumed.push(ahead.technique)
  }

  const step = nextStep(state)
  if (!step) return null

  const question = questionFor(step, topo, state.board)
  // A rung with no phrasing would otherwise hand back an empty question and
  // nothing would fail. Better to say nothing than to say nothing loudly.
  if (!question) return null

  return {
    question,
    technique: step.technique,
    cells: [...step.cells],
    digits: [...step.digits],
    unit: focusUnit(step, topo, state.board),
    detail: step.detail,
    placements: step.placements.map(p => ({ ...p })),
    eliminations: step.eliminations.map(e => ({ ...e })),
    cands: state.cands.slice(),
    assumed,
  }
}

/**
 * The question to ask when the board itself is wrong.
 *
 * Two levels of the same check. With a solution in hand any placed digit that
 * disagrees is caught. Without one, a cell with no candidates left is still
 * proof that something before it was wrong, which covers 18.8% of the cases the
 * solution catches and costs nothing.
 *
 * `digits` stays empty here, unlike every other answer. Everywhere else the
 * digits are named in the question anyway, and here they would be the digits
 * that belong in the cells the player got wrong: the answer, sitting in a field
 * a caller has every reason to render beside the question. The corrections are
 * in `placements`, which is the third rung and nowhere else.
 */
function contradiction(state, board, topo, solution) {
  if (solution) {
    const bad = []
    for (let i = 0; i < 81; i++) if (board[i] !== 0 && board[i] !== solution[i]) bad.push(i)
    if (bad.length) {
      const unit = whereItIsWrong(bad[0], board, topo)
      const inUnit = topo.units[topo.unitMeta.indexOf(unit)].filter(i => bad.includes(i))
      return {
        question: `One of the digits you have placed in ${unitName(unit)} does not belong there. Which would you check first?`,
        technique: null,
        cells: inUnit,
        digits: [],
        unit,
        detail: `${inUnit.length} wrong digit${inUnit.length === 1 ? '' : 's'} in ${unitName(unit)}`,
        placements: inUnit.map(i => ({ cell: i, digit: solution[i] })),
        eliminations: [],
        cands: state.cands.slice(),
        assumed: [],
        contradiction: true,
      }
    }
    return null
  }

  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0 || countMarks(state.cands[i]) > 0) continue
    const unit = whereToLook(i, board, topo)
    return {
      question: `Nothing will fit one of the cells in ${unitName(unit)} any more, so a digit already on the board must be wrong. Which would you check first?`,
      technique: null,
      cells: [i],
      digits: [],
      unit,
      detail: `a cell in ${unitName(unit)} has no candidates left`,
      placements: [],
      eliminations: [],
      cands: state.cands.slice(),
      assumed: [],
      contradiction: true,
    }
  }
  return null
}

/**
 * Is there anything to ask about this board?
 *
 * The same work as asking, not a cheap precheck. It exists so a caller deciding
 * whether to offer the control does not have to know that a broken board still
 * counts as having a question. False means the board is finished or the ladder
 * cannot reason about it, which is not the same as the board being wrong.
 */
export const hasQuestion = (board, topo = CLASSIC) => askAbout(board, topo) !== null
