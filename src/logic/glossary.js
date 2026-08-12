// Every term this app coins, defined once.
//
// The app has invented a lot of vocabulary: six tiers, seventeen techniques,
// six move classes, justified placements, stale notes, missed-easier, pace,
// flow, strength, dwell. Nobody should have to remember all of it, and the
// statistics screens were built with bare labels above numbers whose definition
// is nowhere on the device.
//
// Two rules from docs/VISION.md shape this file.
//
// **Defined once, used everywhere.** A term must not be explained two ways in
// two places, the same rule that keeps the grader and the hint engine as one
// piece of code. So where a definition already lives in a module, this file
// points at it rather than restating it: techniques keep their `about` in
// techniques.js, tiers their `blurb` in difficulty.js, variants theirs in
// variants.js. Every entry carries `source`, which says where its sentence
// lives. Everything else has no home anywhere and gets one here.
//
// The move classes are the ragged edge. `CLASSES` in src/stats/analysis.js
// carries an `about` line for each of them and this file cannot import it:
// src/logic/ is the layer underneath src/stats/ and must not reach up into it.
// So the six class entries are written here and glossary.test.js asserts their
// labels against `CLASSES`, which catches a rename but not a rewording. When
// the review is wired to read from here, `CLASSES.about` should be deleted
// rather than left as a second answer.
//
// **Nothing explains itself by hover.** These are sentences meant to be printed
// under a label or opened by a tap. A `title` attribute is invisible on a
// phone, which is where this app is mostly played, so no interface may use this
// file as tooltip text and nothing else.
//
// ---- how long a definition may be ----
//
// Measured rather than chosen, over the 62 pieces of explanatory copy the app
// already ships and that are known to fit on the phone: technique `about`
// (76-166 characters), technique `short` (17-25), tier blurbs (39-51), variant
// blurbs (36-94), move class `about` (27-46) and the toolbar's hold-to-explain
// lines (27-140). Across all of them: p50 51, p90 135, max 166.
//
// So a definition here is capped at 180 characters, a little above the longest
// thing that already ships, and held to one sentence. glossary.test.js enforces
// both. The one entry that would not fit in 180 was split rather than trimmed:
// justified placements means one thing on the review and another in the
// experiments table, and a sentence trying to cover both said neither.
//
// ---- what the numbers actually count ----
//
// Several of these were verified by driving the reducer rather than by reading
// it, because the plausible answer and the real one differ. Placing two wrong
// digits and undoing one leaves `mistakes` at 1 and the review's Wrong at 2.
// Pencilling one note in and rubbing it out again counts 2 pencil marks, not 1
// and not 0. A game abandoned is in the win rate's denominator. Those three are
// the reason this file exists at all: nothing on screen said any of it.

import { TIERS } from './difficulty.js'
import { LADDER, TECHNIQUES } from './techniques.js'
import { VARIANT_LIST } from './variants.js'

/**
 * Ids for the four families that are enumerated somewhere else.
 *
 * Namespaced so a tier called Hard and a technique called hidden single can
 * never collide with a statistic, and so an interface can go straight from a
 * record field to its entry: `define(techniqueTerm(game.hardest))`.
 */
export const techniqueTerm = key => `technique.${key}`
export const tierTerm = name => `tier.${name}`
export const variantTerm = id => `variant.${id}`
export const classTerm = key => `class.${key}`
export const achievementTerm = id => `achievement.${id}`

/** The experiment outcomes, which are keyed rather than namespaced. */
export const outcomeTerm = key => `outcome${key.charAt(0).toUpperCase()}${key.slice(1)}`

/**
 * Whether an entry is about the game in front of you or about your history.
 *
 * Set on every number where the question is answerable and the answer is not
 * obvious, which is most of them: "Mistakes" is per game on a review row, per
 * solve on a tile, and per arm in an experiment. The test asserts a `game`
 * entry says "this game" and a `many` entry never does.
 */
const GAME = 'game'
const MANY = 'many'

// ---- the words everything else is written in ----
//
// These are here so that no definition below has to use an undefined term. The
// test walks a list of the app's jargon and fails if a definition uses a word
// that has no entry.

const WRITTEN = {
  candidate: {
    label: 'Candidate',
    definition:
      'A digit that could still legally go in a cell, given every digit already on the board and every rule this puzzle plays by.',
  },
  unit: {
    label: 'Unit',
    definition:
      'Any group of nine cells that has to hold one to nine between them, which on a classic board means a row, a column or a box.',
  },
  peer: {
    label: 'Peer',
    definition:
      'A cell that is not allowed to hold the same digit as another one, usually because the two share a unit.',
  },
  given: {
    label: 'Given',
    definition:
      'A digit printed on the board before you started, which you cannot change and which never counts as one of your placements.',
  },
  ladder: {
    label: 'The ladder',
    definition:
      'The techniques the app knows, ordered cheapest first and walked by the grader, the hint button and the review so that all three agree.',
  },
  technique: {
    label: 'Technique',
    definition:
      'One named way of proving where a digit goes or what it cannot be, each of them a rung of the ladder.',
  },
  score: {
    label: 'Score',
    definition:
      'What the grader charges for solving this puzzle by logic, which is what decides its tier and which measures deduction rather than how many cells were blank.',
    scope: GAME,
  },
  tier: {
    label: 'Tier',
    definition:
      'One of six bands over the score, always the grader’s verdict on the puzzle in front of you and never the difficulty you asked for.',
  },
  graded: {
    label: 'Graded',
    definition:
      'The tier the grader gave this puzzle, which is the only difficulty this app ever shows you.',
    scope: GAME,
  },
  requested: {
    label: 'You asked for',
    definition:
      'The tier you asked for, kept apart from the graded one so that the app can say so when this puzzle is not the difficulty you wanted.',
    scope: GAME,
  },
  hardest: {
    label: 'Hardest',
    definition:
      'The most expensive technique the grader needed to finish this puzzle, so it describes the puzzle and not how you played it.',
    scope: GAME,
  },
  variant: {
    label: 'Variant',
    definition:
      'Which kind of board this is, meaning whatever rules it adds on top of nine rows, nine columns and nine boxes.',
  },
  cage: {
    label: 'Cage',
    definition:
      'A dashed group of cells in a killer puzzle that adds up to the small number in its corner and cannot use any digit twice.',
  },
  daily: {
    label: 'Daily',
    definition:
      'One puzzle a day, built from the date so that every device gets the same one, rising through the week from a gentle Monday to a diabolical Sunday.',
  },
  autoPencil: {
    label: 'Auto',
    definition:
      'The button that rewrites every note from the board as it stands, replacing what you had written, and worth pressing again as the grid fills.',
  },
  autoComplete: {
    label: 'Auto-complete',
    definition:
      'The button that finishes the board once the rest falls to lone candidates and at most twelve cells are left, so it never appears while there is real work.',
  },
  boardProved: {
    label: 'What the board proved',
    definition:
      'The candidates left once every elimination the ladder can make has been applied, which is stricter than a plain scan of the cells a cell shares a unit with.',
  },
  yourNotes: {
    label: 'Your notes',
    definition:
      'The pencil marks you actually had written down at that moment, whether or not the board still allowed them.',
  },

  // ---- the review, all of it about one game ----

  placements: {
    label: 'Placements',
    definition:
      'How many digits you put on the board yourself in this game, not counting hints or the cells auto-complete filled in for you.',
    scope: GAME,
  },
  wrong: {
    label: 'Wrong',
    definition:
      'How many digits you placed in this game that were not the answer, counting every one you ever made, including the ones you undid.',
    scope: GAME,
  },
  mistakes: {
    label: 'Mistakes',
    definition:
      'Wrong digits you left standing in this game, since undoing one takes it back off this count, which is why the review’s Wrong can be the larger number.',
    scope: GAME,
  },
  undos: {
    label: 'Undos',
    definition:
      'How many times you stepped back a move in this game, where stepping back a whole auto-complete counts as one.',
    scope: GAME,
  },
  hints: {
    label: 'Hints',
    definition:
      'How many times the app filled a cell in for you in this game, counted only when a digit lands, so asking for a question or a pattern first is free.',
    scope: GAME,
  },
  checks: {
    label: 'Checks',
    definition:
      'How many times you pressed Check in this game to redden any wrong digit, which counts as an assist because it is one.',
    scope: GAME,
  },
  firstMove: {
    label: 'First move',
    definition:
      'How long the clock ran before your first move of any kind in this game, where a pencil mark counts for as much as a digit.',
    scope: GAME,
  },
  longestPause: {
    label: 'Longest pause',
    definition:
      'The longest you went in this game without putting a digit down, with the cell that ended the wait named underneath.',
    scope: GAME,
  },
  pencilMarks: {
    label: 'Pencil marks',
    definition:
      'How many times you pencilled a note in or rubbed one out in this game, and plus auto if you also filled every candidate with the Auto button.',
    scope: GAME,
  },
  clean: {
    label: 'Clean',
    definition:
      'A game you finished with no mistakes and no hints, where checks and pencil marks do not spoil it and a wrong digit you undid does not count.',
  },
  unfinished: {
    label: 'Unfinished',
    definition:
      'A game you walked away from, recorded as it stood when you started another one, because a win rate counted only from wins is not a win rate.',
  },
  gaveUp: {
    label: 'Gave up',
    definition:
      'A game you ended by asking to see the answer, recorded as a loss so that the win rate cannot be improved by quitting tidily.',
  },

  // ---- judgment: what the board could prove when you moved ----

  justifiedPlacements: {
    label: 'Justified placements',
    definition:
      'The share of the moves in this game that the board could already prove when you made them, with hints and wrong digits counted in the total.',
    scope: GAME,
  },
  guessRate: {
    label: 'Guess rate',
    definition:
      'The share of placements across your recorded games that were lucky: right, but not yet proved by the board at the moment you played them.',
    scope: MANY,
  },
  easierWas: {
    label: 'Easier was',
    definition:
      'At this point in this game the board was offering a simpler placement in a different cell, and that is the cell named here.',
    scope: GAME,
  },
  missedEasier: {
    label: 'Missed easier',
    definition:
      'How often across your recorded games you placed a digit while a cheaper move sat elsewhere on the grid, counted only for sharp and lucky moves.',
    scope: MANY,
  },
  longThink: {
    label: 'Long think',
    definition:
      'A pause of at least twelve seconds and three times this game’s own middle gap, which is what the review counts as a pause worth remarking on.',
    scope: GAME,
  },
  slowEasy: {
    label: 'Slow on an easy one',
    definition:
      'A long think that ended in a routine or solid placement, which points at a scanning problem rather than at a hard grid.',
  },
  fastGuess: {
    label: 'Fast guess',
    definition:
      'A placement made quickly with nothing on the board proving it, which is the combination that turns into mistakes on a harder grid.',
  },
  earned: {
    label: 'Earned',
    definition:
      'In the picture, a placement the board had already made routine or solid, as against one that needed a pattern to find.',
  },
  tilt: {
    label: 'Tilt',
    definition:
      'Whether your placements go wrong more often in the five minutes after a mistake, compared inside each game and then pooled across your games.',
    scope: MANY,
  },

  // ---- notes, and what happened to them ----

  staleNote: {
    label: 'Stale note',
    definition:
      'A pencil mark that was genuinely possible when you wrote it and had been ruled out by the board before you rubbed it out or filled the cell.',
  },
  misread: {
    label: 'Misread',
    definition:
      'A pencil mark that was already impossible by a plain scan of the cells it shares a unit with, the moment you wrote it, which is not the same as a note going stale.',
  },

  // ---- the statistics screen ----

  puzzlesSolved: {
    label: 'Puzzles solved',
    definition:
      'How many of your recorded games you finished, with the second number counting every game you started, finished or not.',
    scope: MANY,
  },
  winRate: {
    label: 'Win rate',
    definition:
      'The share of your recorded games you finished, with abandoned games in the total; a puzzle you opened and never touched is not recorded at all.',
    scope: MANY,
  },
  currentStreak: {
    label: 'Current streak',
    definition:
      'How many days in a row up to today or yesterday you finished at least one game, so that it does not die at midnight while you are still awake.',
    scope: MANY,
  },
  longestStreak: {
    label: 'Best streak',
    definition:
      'The longest run of consecutive days you have ever finished a game on, over your whole history rather than the period on screen.',
    scope: MANY,
  },
  dailyStreak: {
    label: 'Daily streak',
    definition:
      'How many days in a row up to today or yesterday you finished the daily, with the smaller number counting every daily you have ever finished.',
    scope: MANY,
  },
  timePlayed: {
    label: 'Time played',
    definition:
      'Every second the clock ran across your recorded games, finished or not, with pauses and time spent on other screens left out.',
    scope: MANY,
  },
  daysPlayed: {
    label: 'Days played',
    definition:
      'How many separate days you finished at least one game on, which is never more than the number of days you opened the app.',
    scope: MANY,
  },
  medianSolve: {
    label: 'Median solve',
    definition:
      'The middle time of your finished games, so that half were quicker and half slower, with the games you did not finish left out.',
    scope: MANY,
  },
  fastest: {
    label: 'Fastest',
    definition:
      'The quickest of your finished games among the ones this screen is counting.',
    scope: MANY,
  },
  mistakesPerSolve: {
    label: 'Mistakes per solve',
    definition:
      'Wrong digits per game, averaged over the games you finished rather than over every game you started.',
    scope: MANY,
  },
  boardFilter: {
    label: 'All boards',
    definition:
      'Which kind of board the games behind every number on this screen were played on, because a median across a jigsaw and a classic describes neither.',
    scope: MANY,
  },
  tierPlayed: {
    label: 'Played',
    definition:
      'Games the grader graded at this tier that you started, whether or not you went on to finish them.',
    scope: MANY,
  },
  tierDone: {
    label: 'Done',
    definition:
      'Games the grader graded at this tier that you finished.',
    scope: MANY,
  },
  tierBest: {
    label: 'Best',
    definition:
      'The quickest of the games you have finished at this tier.',
    scope: MANY,
  },
  tierMedian: {
    label: 'Median',
    definition:
      'The middle time of your finished games at this tier.',
    scope: MANY,
  },
  tierMistakes: {
    label: 'Mistakes',
    definition:
      'Wrong digits per finished game at this tier, averaged over the games you completed there.',
    scope: MANY,
  },
  calendarHeatmap: {
    label: 'Last 17 weeks',
    definition:
      'One square per day over the last 119 days, darker where you recorded more games, finished or not, with the most recent week at the right.',
    scope: MANY,
  },
  tierTrend: {
    label: 'Solve times by tier',
    definition:
      'Your last ten finished games at each tier in the order you played them, with your best time at that tier marked.',
    scope: MANY,
  },
  durationHistogram: {
    label: 'How long solves take',
    definition:
      'Your finished games sorted into ten equal bands between your fastest and your slowest, showing where most of them land.',
    scope: MANY,
  },
  byHour: {
    label: 'When you play',
    definition:
      'How many of your games ended in each hour of the day by the clock on this device, counting the ones you abandoned as well.',
    scope: MANY,
  },

  // ---- flow ----

  flow: {
    label: 'Flow',
    definition:
      'A run of at least eight placements at a steady pace quicker than this game’s own middle, read off the clock and never off what the puzzle required.',
    scope: GAME,
  },
  struggle: {
    label: 'Struggle',
    definition:
      'A run of at least four placements in this game that were slow, wildly uneven or wrong twice over, which is what being stuck looks like in the log.',
    scope: GAME,
  },
  flowShare: {
    label: 'Flow share',
    definition:
      'How much of this game sat inside a flow stretch, counted in placements rather than in minutes, because flow is quick and so holds little of the clock.',
    scope: GAME,
  },
  cadence: {
    label: 'Cadence',
    definition:
      'The gap between one placement and the next, which is the only thing flow and struggle are read from.',
  },

  // ---- racing a ghost ----

  ghost: {
    label: 'Ghost',
    definition:
      'A past solve of the same grid, or the engine, replayed beside this game as a count of correct cells against the clock.',
    scope: GAME,
  },
  ghostRacing: {
    label: 'Ghost racing',
    definition:
      'Running a ghost alongside this game and comparing the two at the same point on the clock, which is why it is only offered before you start.',
    scope: GAME,
  },
  raceCells: {
    label: 'Cells up or down',
    definition:
      'How far ahead or behind the ghost you are in this game, counting only cells that hold the answer, so a wrong digit can never put you in front.',
    scope: GAME,
  },
  raceClock: {
    label: 'Clock margin',
    definition:
      'How far apart the two runs are on the clock: how long ago the ghost was at the number of cells you have in this game.',
    scope: GAME,
  },
  enginePace: {
    label: 'Engine pace',
    definition:
      'The engine ghost places a digit at the middle gap from your own past games rather than at a fixed speed, so that it paces you rather than winning by miles.',
    scope: MANY,
  },

  // ---- the league ----

  league: {
    label: 'League',
    definition:
      'Standings over the dailies everybody publishes to the same repository your backup points at, with no server anywhere and no way to verify a time.',
    scope: MANY,
  },
  leaguePlayed: {
    label: 'Played',
    definition:
      'Days in the period shown that you published a daily for, since days you missed count against nobody.',
    scope: MANY,
  },
  leagueWon: {
    label: 'Won',
    definition:
      'Days at least two of you played the same daily and you were the quickest to finish it, over the days shown.',
    scope: MANY,
  },
  leagueContested: {
    label: 'Contested',
    definition:
      'A day at least two of you turned up for and the entries agree on which puzzle it was, which is the only kind of day a win can come from.',
  },
  leagueMedian: {
    label: 'Median',
    definition:
      'Your middle daily time over the days shown, which decides nothing, because two people rarely play the same set of days.',
    scope: MANY,
  },
  leaguePace: {
    label: 'Pace',
    definition:
      'Your time against the middle time everyone who finished that day took, over the days you contested, so under 1 means quicker than the room.',
    scope: MANY,
  },
  leagueStreak: {
    label: 'Streak',
    definition:
      'Your run of consecutive dailies finished, counted over your whole history rather than over the period the table is showing.',
    scope: MANY,
  },
  headToHead: {
    label: 'Head to head',
    definition:
      'The two of you compared over the days you both played, where a day only one of you turned up for is scored for nobody.',
    scope: MANY,
  },
  notComparable: {
    label: 'Not comparable',
    definition:
      'A day whose entries disagree about which puzzle was played, usually because somebody is on an older version, so it counts for nobody.',
  },

  // ---- experiments ----

  experiment: {
    label: 'Experiment',
    definition:
      'A run in which the app switches one assist on and off at random behind the scenes, half your games each way, and measures the difference at the end.',
    scope: MANY,
  },
  experimentArm: {
    label: 'On and off',
    definition:
      'Which half of the experiment a game landed in, fixed when the game starts so that no game can belong to both.',
  },
  chance: {
    label: 'Chance',
    definition:
      'How often reshuffling which games were in which half gives a gap at least this big, over ten thousand seeded reshuffles, so a smaller number is less like luck.',
    scope: MANY,
  },
  pValue: {
    label: 'p-value',
    definition:
      'The usual name for the Chance column: how often a gap this big would turn up if the assist made no difference at all.',
  },
  decidesIt: {
    label: 'Decides it',
    definition:
      'The one measure declared before the first game and the only one allowed to settle the experiment, since the other rows are worth a glance and nothing more.',
  },
  outcomeTime: {
    label: 'Time',
    definition:
      'Each game’s time against your own middle time for that tier and board, averaged over the games in each half, so a hard run cannot look like an effect.',
    scope: MANY,
  },
  outcomeMistakes: {
    label: 'Mistakes',
    definition:
      'Wrong digits per game, averaged over the games in each half of the experiment.',
    scope: MANY,
  },
  outcomeHints: {
    label: 'Hints',
    definition:
      'Hints per game, averaged over the games in each half of the experiment.',
    scope: MANY,
  },
  outcomeJustified: {
    label: 'Justified placements',
    definition:
      'The share of proved placements in a game, averaged over the games in each half of the experiment.',
    scope: MANY,
  },

  // ---- practice, and what is due ----

  practice: {
    label: 'Practice',
    definition:
      'A generated puzzle the grader confirms actually needs the pattern you picked, so it is a filter over real puzzles rather than a promise.',
  },
  spacedRepetition: {
    label: 'Spaced repetition',
    definition:
      'Meeting a pattern again shortly before you would have forgotten it, with the wait growing each time it goes well and collapsing when it does not.',
  },
  due: {
    label: 'Due',
    definition:
      'A pattern whose wait has run out and that your games have something to say about, which is what makes it worth a drill now.',
    scope: MANY,
  },
  waiting: {
    label: 'Waiting',
    definition:
      'A pattern you have met recently enough that it is not due yet.',
  },
  thin: {
    label: 'Thin',
    definition:
      'A pattern your puzzles have contained but that nothing in your games says you have either used unaided or needed help with.',
    scope: MANY,
  },
  strength: {
    label: 'Strength',
    definition:
      'How well your games say you know a pattern, from 0 to 1, starting at 0.5 meaning unknown and moving every time a game meets it.',
    scope: MANY,
  },
  strengthBand: {
    label: 'Shaky to solid',
    definition:
      'The four words for a strength, shaky, settling, steady and solid, used because two hundredths of strength is not a real difference.',
  },
  interval: {
    label: 'Interval',
    definition:
      'The wait a pattern’s strength earns before it is worth looking at again, from half a day at the bottom of the scale to three weeks at the top.',
  },
  flashcards: {
    label: 'Flashcards',
    definition:
      'A real position from a real puzzle, shown for a few seconds, where you name the cells the pattern uses rather than the digit it places.',
  },
  socraticQuestion: {
    label: 'Question',
    definition:
      'The first rung of the hint button: it names a unit or a digit and never a cell, and it is free because it gives nothing away.',
  },
  hintRungs: {
    // Not "Hints explain first", which is the name of the switch directly above
    // it on the settings screen: the line read as a link back to the control it
    // was meant to be explaining.
    label: 'The three rungs',
    definition:
      'The hint button can offer a question, then the pattern, then the digit, and only the digit ever spends a hint.',
  },

  // ---- the picture ----

  solveArt: {
    label: 'Solve art',
    definition:
      'This game drawn as the path you took through it, one bead per placement in the order you made them, leaving out whatever auto-complete filled.',
    scope: GAME,
  },
  bead: {
    label: 'Bead',
    definition:
      'One placement in the picture, drawn larger the longer you sat on it, measured against this game’s own middle rather than a fixed number of seconds.',
    scope: GAME,
  },
  thread: {
    label: 'Thread',
    definition:
      'The line joining your placements in order, swelling where you stalled and drifting off the lattice as this game goes on.',
    scope: GAME,
  },
  dwell: {
    label: 'Dwell',
    definition:
      'How long you sat before a placement in this game, which is what the picture draws with and what typical dwell is the middle of.',
    scope: GAME,
  },
}

// ---- move classes ----
//
// Written here rather than derived, because `CLASSES` lives in src/stats/ and
// nothing in src/logic/ may import upwards. The test asserts every class has an
// entry and that the labels match, so a new class or a rename cannot slip
// through; only a reworded `about` can, and the fix for that is to delete it and
// read from here.

const CLASS_TERMS = {
  routine: {
    label: 'Routine',
    definition: 'The cell had only one candidate left when you played it, so there was nothing to spot.',
  },
  solid: {
    label: 'Solid',
    definition: 'The digit had only one home left in a unit, which is a scan rather than a pattern.',
  },
  sharp: {
    label: 'Sharp',
    definition: 'The cell was only forced once a real pattern had been applied, so a scan alone would not have found it.',
  },
  lucky: {
    label: 'Lucky',
    definition: 'Right, but nothing on the board proved it at the moment you played it.',
  },
  mistake: {
    label: 'Mistake',
    definition: 'A digit that is not the answer for that cell, whether or not you noticed at the time.',
  },
  hint: {
    label: 'Hint',
    definition: 'The app filled this cell in because you asked, so it is not counted as your deduction.',
  },
}

// ---- achievements ----
//
// The badge carries a one-line description of how to earn it and this says what
// the rule actually is, which is not always the same thing: "Play seven days in
// a row" is implemented as finishing at least one game on seven consecutive
// days, and opening the app does not count.

const ACHIEVEMENT_TERMS = {
  first: { label: 'First blood', definition: 'Finish one puzzle, at any tier and on any board.' },
  ten: {
    label: 'Getting the hang of it',
    definition: 'Finish ten puzzles altogether, counted over all your games and in no particular order.',
    scope: MANY,
  },
  fifty: {
    label: 'Regular',
    definition: 'Finish fifty puzzles altogether, counted over all your games.',
    scope: MANY,
  },
  hundred: {
    label: 'Centurion',
    definition: 'Finish a hundred puzzles altogether, counted over all your games.',
    scope: MANY,
  },
  clean: {
    label: 'Spotless',
    definition: 'Finish one puzzle clean, meaning no hints and no wrong digit left standing at the end.',
  },
  'clean-ten': {
    label: 'Surgical',
    definition: 'Finish ten clean puzzles, counted over all your games and not necessarily in a row.',
    scope: MANY,
  },
  'all-tiers': {
    label: 'Full sweep',
    definition: 'Finish a puzzle the grader graded at each of the six tiers, counted over all your games.',
    scope: MANY,
  },
  diabolical: {
    label: 'Nerves of steel',
    definition: 'Finish one puzzle the grader graded Diabolical, whatever tier you asked for.',
  },
  'streak-7': {
    label: 'Habit',
    definition: 'Finish at least one game on seven days in a row, which is what playing seven days running means here.',
    scope: MANY,
  },
  'streak-30': {
    label: 'Devotion',
    definition: 'Finish at least one game on thirty days in a row.',
    scope: MANY,
  },
  'daily-7': {
    label: 'Week of dailies',
    definition: 'Finish the daily puzzle on seven days in a row.',
    scope: MANY,
  },
  'daily-30': {
    label: 'Month of dailies',
    definition: 'Finish the daily puzzle on thirty days in a row.',
    scope: MANY,
  },
  'quick-medium': {
    label: 'Quickfire',
    definition: 'Finish a puzzle the grader graded Medium in under five minutes.',
  },
  'no-pencil': {
    label: 'All in your head',
    definition: 'Finish a Hard, Expert or Diabolical puzzle without writing a single pencil mark, Auto included.',
  },
  'night-owl': {
    label: 'Night owl',
    definition: 'Finish a puzzle between midnight and four in the morning, by the clock on this device.',
  },
}

/**
 * The whole glossary, built once.
 *
 * Frozen because an interface reading a definition has no business editing one,
 * and because a term that could be rewritten at runtime is a term that can be
 * explained two ways again.
 */
function build() {
  const out = {}
  const add = (id, entry, source) => {
    // A duplicate id would silently replace one definition with another, which
    // is the exact failure this file exists to prevent.
    if (out[id]) throw new Error(`glossary: ${id} is defined twice`)
    out[id] = Object.freeze({
      id,
      label: entry.label,
      definition: entry.definition,
      scope: entry.scope || null,
      source,
    })
  }

  for (const [id, entry] of Object.entries(WRITTEN)) add(id, entry, 'glossary.js')
  for (const [key, entry] of Object.entries(CLASS_TERMS)) add(classTerm(key), entry, 'glossary.js')
  for (const [id, entry] of Object.entries(ACHIEVEMENT_TERMS)) {
    add(achievementTerm(id), entry, 'glossary.js')
  }

  // The three families whose copy already has a home. Labels keep the case the
  // source gives them, because these read inline as often as they head a panel:
  // "needed pointing pair" is a sentence, "Pointing Pair" is not.
  for (const key of LADDER) {
    add(techniqueTerm(key), { label: TECHNIQUES[key].label, definition: TECHNIQUES[key].about }, 'techniques.js')
  }
  for (const tier of TIERS) {
    add(tierTerm(tier.name), { label: tier.name, definition: tier.blurb }, 'difficulty.js')
  }
  for (const variant of VARIANT_LIST) {
    add(variantTerm(variant.id), { label: variant.name, definition: variant.blurb }, 'variants.js')
  }

  return Object.freeze(out)
}

export const GLOSSARY = build()

export const TERM_IDS = Object.freeze(Object.keys(GLOSSARY))

/**
 * One term, or null when there is no such term.
 *
 * Null rather than a throw on purpose: this is read from render, and an
 * exception there blanks the whole statistics screen over a typo in a label.
 * A missing term is caught by glossary.test.js instead, which walks every list
 * in the app and fails when one of them grows a member nothing defines.
 */
export const define = id => GLOSSARY[id] || null

/** Several at once, skipping any that do not exist, for a legend or a key. */
export const defineAll = ids => ids.map(define).filter(Boolean)
