// The game, as prose.
//
// Everything here is already computed somewhere: the classifier knows which
// placements were earned, the stall analysis knows where the clock went, the
// belief archaeology knows which notes went stale. What none of them do is say
// what the game was like, and that is the thing a person actually remembers.
//
// Written as an account rather than a verdict. It reports what happened, in the
// order it happened, and leaves the judging to the numbers underneath. A report
// that opened with a grade would be read as a grade and nothing else.

import { CLASSES } from './analysis.js'
import { flowSummary } from './flow.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { fmtMs } from '../lib/format.js'

const secs = ms => (ms >= 60000 ? `${(ms / 60000).toFixed(1)} minutes` : `${Math.round(ms / 1000)} seconds`)

/**
 * Below this share of the clock a struggle is a moment rather than a shape, and
 * `longestStall` in replay.js already reports the single worst pause. This
 * paragraph is only worth writing when the broken rhythm was most of the game.
 */
const STRUGGLE_WORTH_SAYING = 0.3

/**
 * Above this share of the placements, "a stretch of flow" is the wrong noun.
 *
 * Found on a real game rather than reasoned about: a Hard solved at an even 9.2
 * seconds a placement came back as one segment covering all 58 of them, and the
 * paragraph read "you found a rhythm: 58 placements in a row", which describes
 * the whole game as if it were a passage inside it. Both sentences are true and
 * only one of them is an account of what happened.
 */
const WHOLE_GAME = 0.9

/**
 * The rhythm of it, which is the half of a game nothing else here describes.
 *
 * Computed rather than passed in: `flowSummary` costs 0.03ms on a full game,
 * measured over 22 real solves, so threading it through every caller would buy
 * nothing. Silent on a game too short to have had a rhythm, which is the module's
 * own `enough`, and silent on flow below `NOTABLE_MOVE_SHARE`, because below that
 * a featureless game produces as much by chance.
 */
function rhythm(record) {
  const f = flowSummary(record)
  if (!f.enough) return []
  const out = []

  if (f.notable && f.longest) {
    const run = f.longest
    const pace = (run.msPerMove / 1000).toFixed(1)
    out.push(
      f.flowMoveShare >= WHOLE_GAME
        ? `The whole thing ran at one pace, ${pace} seconds a placement from the first digit to the last, without a stall worth the name in it.`
        : `You found a rhythm: ${run.moves} placements in a row at ${pace} seconds each, and ${Math.round(
            f.flowMoveShare * 100
          )}% of the digits in the game went in like that.`
    )
  }

  const worst = f.segments
    .filter(s => s.kind === 'struggle')
    .sort((a, b) => b.ms - a.ms)[0]
  if (worst && f.struggleShare >= STRUGGLE_WORTH_SAYING) {
    out.push(
      `The clock went somewhere else, though: ${Math.round(
        f.struggleShare * 100
      )}% of it sat in stretches where the pace broke, the worst of them ${secs(worst.ms)} for ${
        worst.moves
      } placements.`
    )
  }

  return out
}

/** The opening: how the board went from empty to moving. */
function opening(moves, info) {
  if (!moves.length) return null
  const firstTen = moves.slice(0, 10)
  const guessed = firstTen.filter(m => m.cls === 'lucky').length
  const wrong = firstTen.filter(m => m.cls === 'mistake').length

  if (info.timeToFirstMove > 90000) {
    return `You spent ${secs(info.timeToFirstMove)} before writing anything, which is a long look at a grid.`
  }
  if (wrong >= 2) {
    return `The opening went badly: ${wrong} of your first ten placements were wrong, which usually means a given was misread rather than the puzzle being hard.`
  }
  if (guessed >= 5) {
    return `You opened fast and loose, with ${guessed} of the first ten placements going in before the board proved them.`
  }
  if (info.timeToFirstMove < 8000) {
    return 'You were placing digits within seconds, so the opening was a scan rather than a study.'
  }
  return 'The opening was steady.'
}

/**
 * How a class reads at the end of "and it came out ...".
 *
 * Four of the six labels are adjectives and lowercasing them was enough. Two
 * are nouns, and the same template produced "it came out hint" and "it came out
 * mistake". Both are reachable: a hint is the longest stall in any game where
 * one was taken on the cell that was stared at, which is the common case.
 */
const cameOut = cls =>
  (cls === 'hint' || cls === 'mistake' ? 'a ' : '') + CLASSES[cls].label.toLowerCase()

/** The middle: where the game was actually decided. */
function middle(moves, beliefs, info) {
  const out = []
  const worstStall = info?.longest

  // `longestStall` reports `gap`, not `ms`. Reading the wrong field meant this
  // paragraph could never appear, and nothing failed to say so.
  if (worstStall && worstStall.gap > 45000) {
    const at = moves.find(m => m.cell === worstStall.cell)
    out.push(
      `The longest you sat on anything was ${secs(worstStall.gap)}, on ${
        at ? at.cellName : 'one cell'
      }${at ? `, and it came out ${cameOut(at.cls)}` : ''}.`
    )
  }

  if (beliefs?.stale?.length >= 3) {
    const worst = beliefs.stale[0]
    out.push(
      `Your notes drifted out of date underneath you: ${beliefs.stale.length} of them stayed on the board after they were impossible, the ${worst.digit} in ${worst.cellName} for ${secs(worst.heldMs)}.`
    )
  }

  return out
}

/** What you found without help, which is the part worth being told. */
function credit(moves, counts) {
  const sharp = moves.filter(m => m.cls === 'sharp')
  if (!sharp.length) return null

  const named = sharp.map(m => m.pattern?.technique).filter(Boolean)
  const label = named.length ? TECHNIQUES[named[0]]?.label : null
  if (sharp.length === 1) {
    return `One placement needed more than a scan${label ? `, and it was ${label} that got you there` : ''}: ${sharp[0].value} into ${sharp[0].cellName}.`
  }
  return `${sharp.length} placements needed a real pattern rather than a scan${
    label ? `, ${label} among them` : ''
  }. That is the part of the game that was actually yours.`
}

/** How it ended. */
function ending(record, moves, counts) {
  if (record.forfeited) return 'You gave it up in the end.'
  if (!record.completed) return 'You left it unfinished.'

  const late = moves.slice(-10)
  const lateWrong = late.filter(m => m.cls === 'mistake').length
  if (record.autoCompleted) return 'The last few cells were forced, and auto-complete took them.'
  if (lateWrong >= 2) return `The endgame got ragged: ${lateWrong} of the last ten placements were wrong, which is usually haste rather than difficulty.`
  if (!counts.mistake && !counts.hint) return 'You finished it clean, with no wrong digits and no help.'
  if (!counts.mistake) return 'You finished without a wrong digit.'
  return 'You got there.'
}

/**
 * The whole account, as an array of paragraphs.
 *
 * Returns nothing rather than padding when a game is too short to have had a
 * shape. Three placements is not a story.
 */
export function narrate(record, analysis, beliefs, info) {
  const { moves, counts } = analysis
  if (!moves || moves.length < 12) return []

  const parts = [
    opening(moves, info),
    ...middle(moves, beliefs, info),
    ...rhythm(record),
    credit(moves, counts),
    ending(record, moves, counts),
  ].filter(Boolean)

  return parts
}

/** A single line for the top, naming the game rather than judging it. */
export function headline(record) {
  const when = new Date(record.endedAt)
  const hour = when.getHours()
  const part = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  // "an evening", "an afternoon". Only two of the four start with a consonant.
  const article = w => (/^[aeiou]/i.test(w) ? 'an' : 'a')
  // The tier needs the same treatment and was not getting it, so every game at
  // one of the six opened "A Easy on an afternoon". Expert is the other one.
  const tier = article(record.graded)
  return `${tier[0].toUpperCase()}${tier.slice(1)} ${record.graded} on ${article(part)} ${part} in ${fmtMs(record.durationMs)}.`
}
