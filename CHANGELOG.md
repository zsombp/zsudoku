# Changelog

Newest first.

## v2.23.0 - 2026-08-12 - every screen explains itself, out of the one glossary

`src/logic/glossary.js` landed with 153 terms and nothing reading it. Every
screen reads it now: the statistics tiles, the tier and league and experiment
tables, the coach insights, the achievements, the eight figures under a game
review and every one of its six tabs, the status bar during play, the dashboard,
the practice list, the flashcards, the flow strip, the solve picture, the race,
the new game sheet and two settings rows. The label comes from the glossary as
well as the sentence, so a tile headed one thing and explaining another is not
expressible.

### Which surfaces get subtext and which get a tap, measured rather than judged

`docs/VISION.md` says subtext under the label where there is room, tap to reveal
where there is not, never hover alone. "Where there is room" was measured in the
running app at 375px, printing the median, the 90th percentile and the longest
definition the glossary holds into each real container:

| surface | width | bare | +p50 | +p90 |
|---|---|---|---|---|
| tile, 1 of 3 | 111.7 | 67.8 | 134.2 | 187.4 |
| fact, 1 of 4 | 82.3 | 53.2 | 146.3 | 212.8 |
| badge, 1 of 2 | 170.5 | 32.5 | 78.6 | 122.7 |
| table cell, 6 cols | 61.9 | 20.5 | 55.6 | 90.7 |
| full-width note | 347.0 | 16.5 | 33.0 | 49.5 |
| heading and note | 347.0 | 13.0 | 56.0 | 72.5 |

A definition costs three to four times the height of the thing it explains in
any grid cell, and the widest cell on the phone is 170px: six tiles would go from
136px of screen to 375px. So the cut is not a judgment call. A container that
spans the 347px column carries its definition outright, and a cell in a grid or a
table carries a dotted underline instead. Nothing in this app is between 171px
and 347px wide, so there is no third case.

### One line per group, holding either the prompt or the answer

Each set of triggers shares one line underneath it. Growing the tile that was
tapped reflows a three-column grid and moves it out from under your thumb, and at
187px the two tiles beside it jump a row. The shared line also gives the
affordance somewhere to live: it says "tap a tile for what it counts" while
nothing is open and holds the definition when something is, so it costs exactly
one line either way and there is never a dotted underline with nothing telling
you to press it. `title` rides along on every trigger for a pointer and is the
only route to nothing.

### Four places were explaining the same term twice

Found by wiring rather than by reading, and all four now read from the module:

- The toolbar's hold-to-explain line for Auto and the glossary's `autoPencil`
  made the same claim in different words.
- The league table carried a four-line key defining played, won, pace and streak.
- The move review printed `CLASSES.about` under a class the glossary also
  defines, and carried the same sentence again as a `title`.
- The statistics screen had its own paragraph about the board filter.

`CLASSES.about` in `src/stats/analysis.js` is now read by nothing and should be
deleted, which is what its own comment in the glossary asked for.

### A bug found on the way

The recent-games legend read "wrong digits" over a count that is `mistakes`, the
wrong digits left standing, not every wrong digit ever placed. Measured over 32
generated games driven through the real reducer, the two differ in 20 of them:
one game shows Wrong 3 against mistakes 1 with two undos. The row now says
mistakes and the definition says why the review's Wrong can be the larger number.

### Tests

`src/components/Term.test.js`, 17 of them, rendering the real components with
`renderToStaticMarkup` so no DOM library is needed. Beyond the render behaviour
they scan the component sources for three failures nothing else notices: a
hardcoded term id the glossary no longer has, a component spelling out a
definition instead of reading it, and a screen using `<Term>` or `<TermGroup>`
without importing it. The last one is not hypothetical. `<TermGroup>` went into
the new game sheet with no import, the build was clean, all 655 tests passed, and
the sheet rendered a blank screen the moment it was opened, because an undefined
component is a runtime error and every one of these screens sits behind a tap
that no test performs.

## v2.22.0 - 2026-08-12 - every word the app invented, defined once

153 terms in `src/logic/glossary.js`: every tier, every one of the seventeen
techniques, every variant, every move class, every achievement, and every bare
label on a statistics surface. Each is a short label and one sentence saying what
the number means and, where it could be either, whether it covers this game or
all your games.

Logic only in this version. Nothing reads it yet, so no screen has changed.

### Where a definition already exists, this points at it rather than rewriting it

The rule from `docs/VISION.md` is that a term must not be explained two ways in
two places. Copying the technique blurbs into a glossary would have broken that
on day one, so techniques keep their sentence in `techniques.js`, tiers in
`difficulty.js` and variants in `variants.js`, and the glossary derives those 29
entries from them. Every entry carries `source`, which says where its sentence
lives.

The six move classes are the exception and the file says so: `CLASSES` lives in
`src/stats/` and `src/logic/` may not import upwards, so those are written in the
glossary and the test asserts their labels against `analysis.js`. That catches a
rename and not a rewording, which is the remaining hole.

### Three numbers that do not mean what their labels say

Verified by driving the real reducer, not by reading it.

**Undoing a wrong digit unmakes the mistake.** Place two wrong digits, undo one,
and the record carries `mistakes: 1` while the review's Wrong says 2. Both are
defensible and nothing anywhere said which was which, so a game can be Clean on
the statistics screen with a wrong digit in its move log.

**Pencil marks counts toggles, not notes.** One note written and rubbed out again
reads as 2, not 1 and not 0.

**"Play seven days in a row" is not what the Habit badge does.** It is implemented
as finishing at least one game on seven consecutive days, and opening the app
does not count. The badge copy in `achievements.js` is the loose one; the
glossary states the rule.

Win rate keeps abandoned games in its denominator, which is deliberate and
recorded in `DECISIONS.md`, and now says so where it is read.

### How long a definition may be, measured rather than chosen

Over the 62 pieces of explanatory copy already on the device and known to fit:
technique `about` 76-166 characters, technique `short` 17-25, tier blurbs 39-51,
variant blurbs 36-94, move class `about` 27-46, toolbar hold-to-explain lines
27-140. Across all of them p50 51, p90 135, max 166.

So the cap is 180, a little over the longest thing that ships, and one sentence.
The glossary as written runs 36 to 166, p50 119. One term would not fit and was
split instead of trimmed: justified placements means this game on the review and
an average over a run in the experiments table, and a sentence covering both said
neither.

### What the tests protect

They walk the ladder, the tiers, the variants, the move classes, the achievements
and the experiment outcomes, and fail if any member has no entry, so a future
feature cannot add a term without defining it. Checked by deleting a rung from
the derivation and watching it fail rather than by assuming.

Three more that are about the copy rather than the coverage: every definition
sits inside the measured length and is one sentence, an entry that claims to be
about one game has to say "this game" in words and one that spans many must not,
and a definition may not lean on jargon that has no entry of its own. The last
one found nothing on the way in and is there for the next person; deleting the
`candidate` entry fails the eleven definitions that use the word.

Two of those were written before the copy and caught real vagueness in it: an
entry about tilt that never said it pooled across games, and a race statistic
that said "this grid" where it meant this game.

## v2.21.0 - 2026-08-12 - write the digit with a finger

A pad under the number keys. Tap a cell, draw the digit, and the pad shows what
it read and waits. Off by default, no new dependency, no network, no model file:
the recogniser is 400 lines of arithmetic over the stroke, in
`src/lib/handwriting.js`.

### How well it works, which is the part that matters

There is no handwriting dataset here and there is not going to be one, so the
strokes are synthesised by `scripts/handwriting.mjs` and **every number below is
an upper bound rather than a measurement of the feature in use.** Two reasons,
and the second is the serious one. Synthetic ink is tidier than a thumb. And the
author of the recogniser wrote the test set, which is circular; the only defence
available was to describe the thirty forms again from scratch rather than copy
them, with different proportions, and to include eight forms the recogniser has
no description for at all. Those eight are reported separately throughout.

So the number to quote is not a number, it is a curve. `slop` multiplies every
distortion at once: slant, wobble, jitter, width, tilt, and how far the ends
overshoot. 9000 strokes per row.

| slop | overall | held out | right or runner-up | shown plainly | and right |
|---|---|---|---|---|---|
| 0.5 | 100.0% | 100.0% | 100.0% | 96% | 100.0% |
| 1 | 98.8% | 98.8% | 99.9% | 89% | 99.9% |
| 1.5 | 93.7% | 91.6% | 98.7% | 72% | 99.2% |
| 2 | 83.6% | 77.6% | 94.3% | 55% | 96.6% |
| 3 | 61.2% | 48.3% | 80.4% | 37% | 81.0% |
| 4 | 45.6% | 33.0% | 66.2% | 28% | 66.9% |

**Nobody knows where a real thumb sits on that dial.** Slop 1 was written to look
like careful writing on a phone and it produces 98.8%, which is the clearest
evidence available that it is too kind. Somewhere between 1.5 and 2 is the honest
guess, so between 84% and 94%, and it is a guess.

The last two columns are the ones the feature actually rests on. At slop 2, where
the recogniser is right 83.6% of the time, the 55% of strokes it offers without a
caveat are right 96.6% of the time. The confidence number is doing real work.

### Which digits to distrust

Confusion matrix at slop 2, rows are what was drawn.

```
          1     2     3     4     5     6     7     8     9   correct
  1     888    22    11    14    68     3   185     .     9    74.0%
  2       5   644   144     .     4     1    95     .     7    71.6%
  3       2     .   795     .    87     .    11     1     4    88.3%
  4       8     .     .  1076    30    38     .     .    48    89.7%
  5       .     .     5     .   874     .     1     .    20    97.1%
  6       .     .     2     .    58   829     .     9     2    92.1%
  7      94    15   100     .    38     .   949     .     4    79.1%
  8       .     1     6     .     .     .    23   786    84    87.3%
  9       .     .     .    62   110    42     .     2   684    76.0%
```

**1 and 7 are the unreliable pair and they are unreliable in both directions.** A
1 with a flag on it reads as a 7 nearly a fifth of the time, and a 7 with a
crossbar reads as a 1. If you write either of those forms, this feature will
annoy you.

**A 9 goes to a 5** when its tail runs down and to the left, which is 110 of the
216 nines it gets wrong. **A 2 goes to a 3** when its top is round rather than
angular. 5 and 4 are the two it is best at.

By form, the worst are a flagged 1 at 72.3% and a footed 1 at 79.7% (slop 1.5).
A bare 1, a round 3, and both forms of 8 were perfect at that level.

**A stroke order with no description is not recognised at all, and there is no
graceful failure.** An 8 drawn from the bottom up scored 0% before it got a
prototype-free measurement of 80.7%, and the general shape holds: the direction
sequence is ordered, so an unknown order is an unknown digit. The twenty-two
forms in `PROTOTYPES` are the honest limit of the feature.

### Three features were built, measured, and thrown away

Kept in the comments because each is the obvious thing to try, and each measured
worse than nothing. All figures against the held-out forms as well as the total,
because a change that helps only the forms with prototypes is fitting rather than
improving, and that is invisible from the total alone.

- **Endpoint positions.** Where the pen went down and came up. Cost 2.5 points at
  every positive weight. At slop 2 it helped the prototyped forms by 1.6 and hurt
  the held-out ones by 4.6, which is overfitting with a signature on it. The
  direction sequence already implies where the ends are, and slant moves the ends
  while leaving the shape alone.
- **Net turning**, signed rather than absolute. Worth 0.2 points at its best
  weight and negative above 0.2.
- **Aspect ratio**, which ought to be the whole of "1". Cost 0.9 points overall
  and, per digit, cost 1 itself 5.3 points. A bare 1 leans, so it measures 0.2 to
  0.4 wide against an upright prototype at 0.05, and the feature argues against
  the right answer. Shearing the lean out first, estimated from the near-upright
  segments only, cost a further 2.8 points because the estimate is noisiest on
  exactly the drawings that need it.

What survives: the direction sequence is worth 36.5 points, the direction
histogram 7.0, stroke count 3.9, crossings 1.3, total turning 0.6, loops 0.3.

### The loop detector was joining strokes through the air

Found by measurement rather than by reading. The near-closure search walked the
whole drawing as one list of points, so the stem of a two-stroke 4 passing close
to its own bar closed a loop across the gap where the pen had lifted, and every 4
was reported with two holes in it. It showed up as the loop feature measuring
worse than useless at any weight, which is the only reason anyone looked. Loops
are now confined to a single stroke; crossings still count across strokes,
because a crossbar genuinely crosses a leg.

A limit left in place: a one-stroke 8 reports one loop rather than two, because
the second is not a contiguous run of the path. Worth 0.3 points, so not worth a
planar subdivision to fix.

### There is no "that is not a digit" detector, and there cannot be a cheap one

Gating on how close the best match got was the first thing tried. It cannot work:
a circle matches its nearest digit at 0.218 and a zigzag at 0.171, while real
strokes from an unsteady hand run to a median of 0.181 and a ninetieth percentile
of 0.283. The two populations sit on top of each other. So the confidence number
is a margin, how far ahead the winner is, and not a distance.

Draw a circle on the pad and it will offer you an 8, fairly confidently. What
stops that mattering is that the pad asks before it writes.

### It is not on the board, and that is not a compromise

"Draw a digit on the cell" does not survive the device this app is for. A cell on
a 350px phone board is 39px across and a fingertip covers about 40px. There is
nowhere to draw. Ink on a cell would also have to share the gesture space with
tapping to select and holding to tint, and one of the three would have to lose.

So the cell is chosen the way it always was and the digit is written large,
underneath. Tap to select and long-press to tint are untouched; the pad is a
separate element and does not exist unless the setting is on.

### Nothing is placed without a press

The recogniser is wrong somewhere between one time in seventy and one in six, and
a misread written straight onto the board would be a mistake against the player's
record that the player did not make. Every path ends at a button: the reading,
then three near misses ranked by how close each came, then clear. When the margin
is thin the guess goes grey and a sentence says so, two channels rather than one,
the same rule a wrong digit on the board follows.

It re-reads after every stroke rather than waiting for a pause. The obvious
implementation waits a few hundred milliseconds in case a second stroke is
coming, which is a delay on every single-stroke digit and a guess about how long
people pause. Reading again costs 0.054ms, so there is no reason to wait.

### Smaller things

The whole module imports in 6.6ms, nearly all of it building the twenty-two
prototype descriptions once, paid at import rather than on the first stroke where
it would look like the recogniser was slow.

`touch-action: none` on the writing surface. Without it the browser claims the
gesture and scrolls the page, which on a phone means the pad simply does not
work.

The pad is wired into `App.jsx`, so unlike v2.20.0 this one is on screen. Ten
lines, additive, next to the number pad.

The pointer handling has no unit test: there is no DOM test environment in this
project and adding one would mean a dependency. What is tested instead is
`offerFor`, the pure function deciding what the pad offers, which is where the
"nothing is placed without a press" promise actually lives, plus the recogniser
itself. The drawing, the commit, notes mode, undo, both column layouts and two
themes were driven in a real browser with synthetic pointer events.

## v2.20.0 - 2026-08-12 - speak a move, and say where the audio goes

A press-to-talk button, a grammar of four commands, and a strip that writes down
what was heard before anything happens to the board. Off by default. The
microphone opens on a press and on nothing else: no wake word, no restart when
the recogniser ends, and nothing at all while the app is in the background.

    "five in row three column two"   place a digit
    "five"                           into the cell already selected
    "clear"                          empty it
    "undo"                           step back

### The privacy question came first, and it changed the design

Established rather than assumed. MDN, on the API this uses: "By default, using
speech recognition on a web page involves a server-based recognition engine.
Your audio is sent to a web service for recognition processing, so it won't work
offline." In Safari that service is Apple's and Safari says so in its own
permission sheet; in Chrome it is Google's.

Chromium has since grown a way to demand otherwise. Probed in Chromium 148 on
this Mac: `processLocally` is on `SpeechRecognition.prototype`, and the static
gate is `SpeechRecognition.available({ langs, processLocally })`. MDN documents
that static under a different name, `availableOnDevice(lang)`, so the name is not
settled and neither is relied on. WebKit has neither, which is the case that
decides everything here, because the iPhone is the device this app is played on.

So there are two modes and the app never guesses which it is in. Where
`processLocally` exists it is set to true, and a browser that cannot manage local
recognition has to refuse rather than send the audio away. Where it does not
exist, listening at all means the speech leaves the device.

**That second case is a second exception to the non-negotiable, and it does not
clear the bar `CLAUDE.md` sets for one.** The GitHub backup goes to
infrastructure Zsomb owns and is useless to anyone else. A recording of a voice
sent to Apple or Google is neither of those things. So it is not folded into the
voice switch: it gets its own, off by default, and the copy says what happens in
words rather than in a euphemism. On an iPhone voice input does not work at all
until that second switch is thrown, and the settings screen says so.

`SpeechRecognition.available()` is never called. It hung the renderer for a full
30 second probe, once, unreproduced; it is also unnecessary, since setting the
flag and letting the recogniser refuse is the same answer with no call.
`install()` is never called either: it downloads a model, which is a network
request nobody asked for.

The strip says which mode it is in while the microphone is actually open. A
setting is read once, months ago; this is on screen at the moment it is true.

### The grammar is strict, and that is where the accuracy is

Any word the grammar does not know makes the whole utterance "not a command"
rather than a best guess. Measured against the alternative, on 2318 sentences of
this project's own docs, which is a deliberately cruel corpus because it is prose
about a grid, full of "row", "column" and every number word:

| parser | sentences read as a command |
|---|---|
| strict, refuses on any unknown word | 0 of 2318 |
| lenient, drops words it does not know | 387 of 2318, 16.7% |

The lenient ones are mostly headings: "Phase 4, the interface" is a 4. Both
halves are kept as tests rather than as a comment, because a comment cannot fail.

The same measurement from the other end: 40 of 40 phrasings meant as commands are
accepted, and getting there took two additions. Homophones, because a recogniser
hears "row two" as "row to" constantly, resolved only where a number is the only
thing that can go: after "row" or "column", or as the value of a command that
already has both coordinates. A bare "to" does nothing. And ordinals in front of
the noun, because "five in the third row second column" is how a person says it
and was one of three phrasings out of forty that the first grammar threw away.

Four of the recogniser's guesses are read and the first that parses is taken.
"Rome" and "row" sound identical and only one of them means anything here. The
strip shows the top guess as what was heard and the lower one as what it was
taken as, because acting on words the player was never shown is the thing that
strip exists to prevent. A parse costs 0.68 microseconds, so reading four is free.

### Showing before acting, and three bugs found doing it

The command is applied from a passive effect rather than from the recogniser
callback, so React paints the transcript and only then changes the board. A
layout effect would run before the paint and the digit would appear in the same
frame as the words explaining it.

Driven end to end in a browser against a fake recogniser, under StrictMode, which
is what found the rest:

- **StrictMode runs effects twice**, and `placeDigit` treats the same digit twice
  as a clear. Unguarded, voice would have typed the number and rubbed it out
  again in development only. A ref guard on the applied result fixes it.
- **The eight second cutoff bypassed the controller's own teardown.** It called
  the recogniser's `abort` directly, which left `onresult` attached after the
  microphone was supposed to be shut, so a late result could still have placed a
  digit. It goes through the same teardown now.
- **An empty strip rendered as a bare bordered pill** beside the button, which
  reads as something that failed to load. With nothing to say it is not drawn.

Also found in the browser and worth keeping: the visibility guard fired for real
when the pane went to the background mid-probe, and aborted the microphone.

Eight seconds is the cutoff because the longest thing the grammar accepts is six
words, which is 3.6 seconds at a slow and deliberate 100 words a minute. It is a
backstop for a browser that does not end the session itself; `continuous` is
false, so normally one utterance ends it.

Two smaller decisions. Tap to start and tap to stop, not hold to talk: hold is
unusable from a keyboard and awkward with a screen reader, and buys nothing when
the recogniser ends the session by itself after one sentence. And the recogniser
is told `en-GB` rather than inheriting the device language, because the grammar
is English words and a phone set to Hungarian would return Hungarian text for the
same speech and nothing would ever parse.

### Not yet on screen

`App.jsx` is not touched, so nothing mounts the button yet: another agent is in
that file. Six lines of wiring are needed and they are written down in the
handover. Until they land this is a feature that has not shipped, in the sense
v1.7.1 settled.

## v2.19.0 - 2026-08-12 - killer on the ladder and on the screen

Five arithmetic rungs in `techniques.js`, killer registered as a variant, and
cages drawn on both boards. The engine from v2.18.0 could build a killer and
prove it had one answer; it had no way to say what a human should do next, so
nothing could grade one, hint at one or explain a move on one.

The whole of the wiring is one decision: **the cages ride on the topology.**
`createState` already carries `topo` into every technique, so five functions
reading `topo.cages` gave the grader, the hint button, `explain.js`, the socratic
questions, the post-game review, the move classifier and belief archaeology a
killer board with no change to any of them. `GRADER_VERSION` goes to 3.

### The rungs, and what they cost

| rung | first / repeat | what it says |
|---|---|---|
| cage combination | 15 / 4 | the total can be made one way only: 17 in two cells is 8 and 9 |
| cage sum | 25 / 6 | what every way of making the total leaves out |
| cage single | 60 / 20 | a digit every total needs, with one cell of the cage left to take it |
| the 45 rule | 140 / 45 | a unit totals 45, so the cages over it name the one cell they do not settle |
| cage lock | 170 / 55 | a digit the cage needs, confined to one row, column or box |

The prices are the important part and they were set by measuring, not by taste.
On an empty board of 32 cages the first two fire 22 and 28 times, roughly once
per cage: they are the routine motion of killer, the pass everybody makes before
starting. Priced like a pointing pair they would contribute 1300 of a 2100
score, which is exactly the disease naked singles had in Phase 2, where the
score ended up measuring how many blank cells the grid had. So the routine two
sit just above a hidden single and the tier comes from the 45 rule, the cage
lock and the ordinary patterns.

Innies and outies are one rung rather than two. They are the same equation read
from opposite ends, and splitting them would put two prices on one idea. The
other direction of cage-and-unit interaction needed no rung at all: a cage lying
inside a unit whose digits are pinned down is a naked subset of that unit, so
`cageCombo` narrows the cells and `nakedPair` and friends finish the job.

Deliberately left out: the 45 rule across a band of two or three units, which is
stronger and is how a hard killer is really cracked. It is a search over subsets
of units rather than a scan, and single-unit 45 is enough for every puzzle the
generator ships, so it would be a rung nobody could price honestly.

### The classic scale did not move, measured rather than claimed

168 puzzles at twelve fixed seeds for classic and four each for jigsaw, X,
Windoku and anti-knight, over all six tiers, generated before and after. The
JSON is **byte identical**: same boards, same scores, same tiers, same hardest
technique, same clue counts, same per-technique counts. Zero rows differ.

That is not luck. Every arithmetic rung returns null the moment it finds no
cages, so a classic grid pays one property read per rung and nothing else. The
version stamp still moves, because a stamp that only changes when a number
changes is a stamp nobody can trust when one does.

### Generation, and why a killer is the cheapest board this app makes

25 seeds at each tier, every puzzle checked for a unique answer under its cages
and for the ladder finishing it unaided:

| tier | in band | ms mean / p50 / max | clues p50 | score p50 | unique | ladder |
|---|---|---|---|---|---|---|
| Gentle | 25/25 | 46 / 41 / 151 | 44 | 0 | 25/25 | 25/25 |
| Easy | 25/25 | 44 / 39 / 147 | 24 | 111 | 25/25 | 25/25 |
| Medium | 25/25 | 45 / 39 / 146 | 8 | 179 | 25/25 | 25/25 |
| Hard | 25/25 | 48 / 41 / 151 | 4 | 592 | 25/25 | 25/25 |
| Expert | 25/25 | 46 / 38 / 152 | 2 | 927 | 25/25 | 25/25 |
| Diabolical | 20/25 | 59 / 42 / 207 | 0 | 1455 | 25/25 | 25/25 |

Against classic Diabolical at 2645ms and Windoku Diabolical at 8451ms, a killer
is the fastest board here by two orders of magnitude, and the reason is that the
expensive half is already done: a cage layout is only accepted once the empty
board has exactly one answer under it, so every subset of the solution is unique
too and digging pays no uniqueness check at all.

The five Diabolical misses land Expert and the interface says so, which is the
existing rule about `requested` and `graded`. They are a real limit rather than
a budget: the cages are fixed by the seed, and a layout that says too much
cannot be made harder by taking clues away.

### Clues are how a killer is made gentle, not how it is made unique

The classic `dig` is not slow here, it is wrong: it asks `countSolutions`, which
knows nothing about cages, so on a killer with no givens it reports many answers
and refuses to remove anything. Killer digs by choosing which cells to give.

Score against clue count, over 16 layouts, p50:

| clues | 0 | 4 | 8 | 12 | 20 | 30 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|
| score | 1295 | 226 | 175 | 151 | 131 | 75 | 15 | 0 |

The whole scale lives between zero and about eight givens, and from twelve up
every layout measured graded Easy or Medium. That is the shape worth knowing
about killer: a cage layout is a hard puzzle, and clues are the only lever that
makes it gentle. A Gentle killer therefore carries 44 givens, which looks odd
until you remember what Gentle means here: every step forced, nothing to hunt
for, which on a caged board means never having to reason about a cage at all.

### The layout is a pure function of the seed, and is the hardest of four

This is the decision to argue with if any of this is revisited. Redrawing the
cages on each generation attempt would give tier targeting another knob. It was
refused because the seed alone then no longer rebuilds the board, and that
property is what makes a saved killer game safe: a record whose cage list did
not survive a round trip is recoverable rather than a puzzle wearing the wrong
outlines. Verified end to end, in the browser: a killer game saved without its
cages reloads with all thirty of them redrawn, and their totals add to 405.

Within that, the layout is the hardest of four deterministic candidates, ranked
by what the ladder scores on the empty board. A layout can be made easier by
giving clues and never harder, so one candidate leaves most seeds unable to
reach the top tier at all. Over 30 seeds:

| candidates | ceiling p50 | reach Diabolical | layout ms mean / max |
|---|---|---|---|
| 1 | 750 | 7 of 30 | 8.6 / 69 |
| 2 | 1050 | 11 of 30 | 19.5 / 84 |
| 3 | 1370 | 17 of 30 | 35.9 / 141 |
| 4 | 1455 | 21 of 30 | 43.4 / 142 |
| 5 | 1468 | 21 of 30 | 55.0 / 146 |

Four is the knee. The gentle end is unaffected, since a harder layout simply
needs a few more givens.

### Drawing the cages, and the mark that vanished under a sum

Dashed and inset, from `cageEdges` rather than from any arithmetic in the
components: the same rule the region outlines already follow, so an outline
cannot disagree with the constraint being enforced. The inset applies only on
the sides that are actually a boundary, which is the whole trick. Inset on all
four and every dash stops short at each shared cell edge, so a cage three cells
wide draws as three little rectangles with gaps punched through its own top
line.

Two things found by looking at it on a 375px board rather than by reasoning
about it:

- **The sum hid the pencil mark for 1.** A two-digit total at 8px covers that
  whole slot on a 39px cell, in every cage's top-left cell. A halo behind the
  sum made the sum readable and still hid the mark, so the fix is room: on a
  caged board the marks move down, in all 81 cells rather than only the thirty
  that carry a number, because a mark's position is information and can only be
  read at a glance if it means the same thing everywhere. Costs mark height,
  66% of the cell against 88%.
- **The candidate ring swamped the cage outlines.** Both are a thin rounded
  rectangle a couple of pixels inside the cell, and a killer starts with two or
  three givens, so almost every cell shows a ring at once. The cage is the
  puzzle, so the ring gives way and moves inside it.

A dashed outline says nothing to a screen reader, so every cell's label now
carries the cage it is in and what that cage adds to, not only the cell that
prints the number.

### Also

- `makeVariantPractice` and `makeVariantTailored` work on killer, and a cage
  rung asked for on a classic board is refused in 0ms instead of after thirty
  seconds of searching for something that cannot exist.
- `makePracticePuzzle` never used the grid it was handed: the test was
  `attempts === 0` against a counter incremented just above it, so it was never
  true. Harmless for jigsaw, which can refill any layout, and fatal for killer,
  where the sums were read off one particular grid.
- `scripts/variantcheck.mjs` asks `countKillerSolutions` on a caged board. With
  the classic solver it reported 0/3 unique on puzzles that are perfectly sound.

## v2.18.0 - 2026-08-12 - the killer engine

`src/logic/killer.js`. Every variant so far was a topology, and the twelve
techniques handled all of them without a line of change because they reason
about units and peers rather than arithmetic. A cage is a set of cells with a
sum and no repeated digit, which none of them can say, and DECISIONS.md records
that as the reason killer was deferred while jigsaw, X, Windoku and anti-knight
shipped.

Five pieces: the digit combinations behind a sum, the cage model, `cageLayout`
building cages over a finished grid, `killerSolutions` searching with cages, and
`uniqueCageLayout` turning a sound layout into a puzzle with exactly one answer.
Nothing is wired to a screen and no technique reads cages yet.

Measured, on the shipped defaults over 60 grids:

| | mean | p50 | p90 | worst |
|---|---|---|---|---|
| a cage layout | 0.04ms | 0.03ms | | 0.39ms |
| a uniqueness check | 2.8ms | 0.5ms | 8.6ms | 49ms |
| layout to a unique puzzle | 13ms | 5ms | 46ms | 130ms |

A layout is 31 cages averaging 2.6 cells. Cages are a constraint on top of a
topology rather than instead of one, so killer-X, killer-Windoku and
killer-anti-knight all work today, and are faster than plain killer because the
extra units prune the search.

### Building the shapes and the digits together, again

`jigsawLayout` records three ways of building a constraint structure first and
searching for something that satisfies it second, all of which failed. The same
ordering applies here and killer gets it more cheaply than jigsaw did: a jigsaw
region has to be exactly nine cells, so a growth that runs out of legal
neighbours must backtrack, while a cage has no required size and the same dead
end is simply a smaller cage. Growing against the finished grid and refusing any
cell whose digit the cage already holds cannot fail, and needs no search.

Doing it the other way round fails silently, which is why the numbers are in the
file: growing the same shapes while ignoring the digits put a repeated digit in
57 of 915 cages across 30 grids, and 26 of those 30 layouts held at least one.
Nothing throws. The sums are still right and the grid is still a legal sudoku
solution, so what ships is a puzzle whose own answer breaks its stated rules.

### A sound layout is not a puzzle, and repairing beats redrawing

A raw layout has exactly one solution 1 time in 40 with cages up to five cells,
6 in 40 up to four, 11 in 40 up to three, 14 in 40 with nothing but pairs. So
something has to close the gap. Redrawing until one comes out unique took 18.4
attempts and 2443ms on average, and one grid in 25 never got there in sixty
tries.

Splitting instead takes 3.0 splits and 13ms. A second solution says exactly
where the ambiguity is, so the cells the two answers disagree about are the only
ones worth touching, and the largest cage among them gets cut in half. It is
also the only one of the two that must terminate: every split adds a cage, and
eighty-one one-cell cages is the solution written out.

Halves rather than peeling one cell off, which needs marginally fewer splits at
2.7 against 3.0 and leaves 2.7 one-cell cages behind against 2.2. A one-cell
cage is a given digit wearing an outline, so that is the only difference worth
deciding on. Growth gets one-cell cages down to 0.7% and repair puts 2.2 back on
an average board; that is the price of a unique answer, paid in the open.

### Cage size to four, because five barely constrains anything

Hand-set killers run to five cells and this did too. On the same forty grids,
stopping at four takes the whole build-and-repair from a mean of 651ms and a
worst case of 7694ms down to 13ms and 129ms. A sum says less the more cells it
covers, so a two-cell cage has at most four ways to fill it and a five-cell cage
twelve, and both the uniqueness check and the number of repairs it needs blow up
together. Five is still reachable by passing `sizes`, at sixty times the tail.

### The search needed the combinations, and did not need a matching

An empty killer board gives every cell nine candidates, so all the pruning comes
from the cages and the classic solver's approach is not enough. Over 20 layouts,
counting to two solutions:

| | p50 time | p50 nodes |
|---|---|---|
| plain candidates, reading order | 104ms | 19578 |
| plain candidates, tightest cage first | 104ms | 18106 |
| live combinations per cage | 4.2ms | 444 |
| live combinations plus a perfect matching | 18.1ms | 274 |

Keeping the live combinations per cage is worth twenty-five times the node
count. Checking that each one can actually be matched onto the cage's empty
cells is strictly stronger, cuts nodes by a further 38%, and costs four times
the wall clock, so it was rejected on the measurement.

### The cache the brief asked for was measured and removed

The 511-entry combination table is built once at import and is the cache that
pays. A memo on top of it, keyed on cage size, sum and the digits still
available, is the obvious next move because the question is asked constantly,
and it is slower: over 400,000 asks with about thirteen repeats per key, 0.033us
recomputed against 0.046us through a Map and 0.046us through a flat 2MB
Int32Array. The answer is at most twelve masks and two bitwise operations each,
which is cheaper than hashing a key to avoid it.

The flat table also carried a bug worth recording, because it is what a future
attempt would rebuild. The key packed the sum into six bits, so a nonsense cage
of one cell summing 70 landed on the key for one cell summing 6 and answered it
"dead" for the life of the process. Nothing threw. Puzzles with a 6 in a
one-cell cage simply stopped having solutions.

### Two bugs found by disagreeing with something stupider

The propagation is the only part of this complicated enough to be confidently
wrong, so it is checked against an enumeration with no cleverness in it at all,
over 130 boards including deliberately broken ones. It found four disagreements,
all on boards with one digit moved, and all of them the reference's fault: it
never checked that the givens were legal before counting. That is now the shape
of the shipped test.

The second was in the fixpoint. Narrowing a cage can place a digit without any
combination dying, and the loop watched only the combinations, so it could stop
with work still to do. Sound, since less propagation only means more branching,
but the loop did not mean what it said.

`countKillerSolutions` also refuses a cage list that does not cover the board
rather than answering it. That list arrives from a saved game, and the
alternatives are a type error from four calls down, reporting no solutions for a
puzzle that has one, or quietly solving a different puzzle than the one asked
about. `cageProblems` is the way to ask without an exception.

## v2.17.0 - 2026-08-12 - six engines, wired to the interface

Six modules shipped in the last six entries with nothing on a screen: the
Socratic questions, the spaced repetition schedule, ghost racing, flow and
struggle, the solve path as a picture, and the league. This is all of them, at
the surface, on a 375px phone and on a Mac.

**The hint button is a ladder of three rungs.** Question, then pattern, then
answer, each one a separate press and each one a separate switch in settings,
both off by default because Phase 3 settled that the plain hint is the right
default for flow. Practice mode turns both on regardless. The question names a
unit or a digit and never a cell, shows nothing on the board, and does not count
as a hint: nothing is spent until you take one. "I see it" takes the eliminations
as read and asks about what is behind them, which is the only thing that stops
the button repeating itself on a board where the cheapest step changes no digit.

**What is due, at the top of the practice screen.** `nextUp` with its reason
written out, the strength as a word rather than a number, and both a drill and a
deck of flashcards to start from. When nothing is due it says so in the coach's
voice instead of showing an empty panel. Every rung in the list below carries its
own band, so the catalogue says where you stand without being opened.

**A race, if you want one.** On a grid you have finished before, or against the
engine, offered once at the start of a game and never again. During play it is
one line between the clock and the board: how many cells up or down and how many
seconds, with an X that ends it. There is a switch to stop it being offered at
all.

**The rhythm of a game, in the review.** A paragraph in the narrated report, and
a strip in the Time tab showing where flow and struggle actually sat along the
clock. The bands do not tile the bar, because what lies between them is ordinary
play, which is most of a game and is not a finding.

**A Picture tab.** The solve path drawn as a thread that swells where you
stalled, in three palettes, saveable as an SVG file with no network involved.

**A league section in Statistics.** Set a name, publish your dailies, see
standings and head to head. It says plainly, at the top rather than in a
footnote, that it only works if the others point their own sync at the same
repository.

### The question and the answer had to be checked, not assumed

`askAbout` returns the cheapest step the ladder can take, which may be an
elimination. `hintPlacement` returns the cheapest placement, walking past
eliminations to find one. Nothing makes them agree, and a ladder that asked about
one cell and then filled another would be worse than no ladder at all.

Measured over 636 positions taken from 22 generated games: the cheapest step is a
placement in 591 of them and an elimination in 45, and in all 591 the cell the
question named is the cell the hint fills. The other 45 are the interesting case,
and they are why "I see it" carries a skip: an elimination changes no digit, so
asking again about an unchanged board returns the identical question forever.
`src/hooks/useHint.test.js` holds the measurement as a test, so a change to
either module has to notice.

### The engine at its own pace is a pacemaker, not an opponent

`ENGINE_STEP_MS` is three seconds and finishes a Diabolical in 3:18, which is a
line nobody will ever be near. The engine ghost instead runs at this player's own
median gap between placements, taken from their last twenty finished games. On
this device that is nine seconds a step, and the label says so: "The engine, a
step every 9s". With no history to measure it falls back to the module default
rather than inventing a number.

### A race joined late opens with the ghost already gone

Starting one on a board resumed with 5:15 on the clock and nothing placed opened
at 38 cells down. That is true, because the comparison is at the same point on
the clock and that is the only honest comparison there is. It also reads as
broken.

So the offer is only made while the game genuinely has not started. Measured over
the 17 real games on this device: the first digit lands within 30 seconds in 14
of them and within 60 in 16, the outlier being one 123 second study. A minute is
the window, and the offer also takes itself away on the first digit rather than
waiting to be closed.

### Two bugs the tests caught, both invisible without them

The flow strip clamped its bands in the wrong order, applying the minimum width
after the clamp rather than before, so a segment ending on the last placement was
pushed 1.2% past the end of its own track and disappeared into the overflow.
Nothing failed; the band was simply not there.

And the saved SVG names every colour as a custom property, which is right inside
the app and useless in a file on its own, where nothing defines `--accent`. The
download now carries the resolved values on the root `<svg>` element. Verified by
loading the saved file as a standalone document: the accent group computes to
`rgb(226, 166, 61)` and the paper to `rgb(27, 30, 39)`, against an empty frame
before.

### One paragraph described the whole game as if it were part of it

A real Hard solved at an even 9.2 seconds a placement came back as a single flow
segment covering all 58 of them, and the narrator wrote "you found a rhythm: 58
placements in a row". Both halves are true and only one of them is an account of
what happened, so above 90% of the placements it now says the whole thing ran at
one pace. The test that found this was written the other way round and failed:
44 placements at exactly nine seconds is 100% flow, and that is the module
behaving as documented rather than a bug.

### Six tabs no longer fit on a phone

The review's tab row is 420px of tabs in 347px of space at 375px wide, so
"Picture" was clipped at the right edge with no way to reach it. The row scrolls
now, and a tab keeps its own width instead of being squeezed to nothing. The page
never scrolls sideways.

## v2.16.0 - 2026-08-12 - flow, struggle, and how little of a game is either

Every game has recorded when each digit went in, so the rhythm it was played at
was already written down and never read. `src/stats/flow.js` reads it.
`flowSegments` returns the notable stretches of a game, steady and quick against
stalled or erratic, and `flowSummary` says how much of the game each covered and
how long the best run lasted. `tiltAfterMistake` asks whether the rhythm breaks
after a wrong digit, which is the other half of the tilt already in `compute.js`.

Nothing is wired to a screen yet.

### The obvious definition of flow was measured and thrown away

The ladder is the only oracle in the codebase for what a board offered, so the
first design used it: a placement is easy when no elimination work stood in
front of it, and a run of easy placements is a run of flow. It is a clean
definition and it is worthless. Over 24 real puzzles it calls 96% to 100% of
every game easy, at every tier, with 93% of placements inside a run of eight or
more even on Diabolical. What separates a Diabolical from a Gentle is a handful
of hard moments, not the texture of the solve.

So flow is a fact about the clock, not about the grid, and the thresholds were
calibrated against cadence planted at known positions in synthesised logs over
those same real puzzles.

### The share of the clock is the wrong number to show

The first summary reported flow as a share of the game's minutes, which is what
"how much of the game was flow" sounds like it means. Tested against a null,
that number turns out to separate almost nothing. Running 480 games with flow
planted in them against 480 with no cadence structure at all:

| statistic | cutoff at the null's p90 | catches this share of games that really had flow |
|---|---|---|
| share of the clock | 14% | 14% |
| share of the placements | 18% | 83% |
| longest flow run | 9 placements | 85% |

The reason is arithmetic rather than a bug. Flow is quick by definition, so a
stretch holding a quarter of the digits holds a twelfth of the minutes, and one
grind elsewhere outweighs it: on the planted games flow covered 9% of the clock
and 26% of the placements. Both are reported and both are named for what they
are, and the `notable` flag is keyed on the placements.

### What it finds, and what it will not

Per placement: flow precision 0.95 at recall 0.75, with 4% of ordinary play
called flow. Struggle precision 0.90 at recall 0.57. Recall is the weaker half
on purpose, in both. A false segment is a lie about the game and a missed one is
only a quieter report.

It finds a stretch running about half again quicker than the rest of the game
(precision 0.93, recall 0.65) and finds subtler ones about half the time
(precision 0.92, recall 0.54 at 1.25x). It does not invent them as the signal
gets weaker: precision holds up the whole way down.

The assumption underneath, and the one thing simulation cannot settle, is how
steady real flow is. Sweeping that: gaps within a factor of 1.28 of each other
give recall 0.75, within 1.42 give 0.50, within 1.57 give 0.29, within 1.82 give
0.07, while precision only moves from 0.95 to 0.92 across the same range. If
real flow is less even than about 1.4x, this reports very little of it. That is
the direction to be wrong in, and it is the first thing to re-measure when there
are enough real games to measure on.

### Two guards, because cadence alone flatters flailing

Forty placements at three seconds each read as 100% flow. Make every second
digit wrong and, on the clock alone, they still do. With the guard they read as
0%, and a stretch carried by hints reads as 0% the same way. One wrong digit in
the forty costs 7%, because the guard is local to the window rather than a
verdict on the whole game.

A single enormous pause is deliberately not a struggle segment. `longestStall`
in `replay.js` has reported the worst pause of a game since v1.2.0, and a four
placement segment is the wrong shape for something that happened between two of
them. Two stalls close together is a stretch, and that is reported.

### The window was chosen twice, because the first comparison was wrong

The first sweep varied the rolling window and the minimum run length together,
concluded that a window of five beat a window of three, and was measuring the
minimum run. Held at a run of eight, the head to head reverses:

| window | precision | recall | flow found in a game with no rhythm at all |
|---|---|---|---|
| 3 | 0.95 | 0.75 | 3% of the clock, 7% of games called notable |
| 5 | 0.95 | 0.69 | 6% of the clock, 15% of games called notable |
| 7 | 0.96 | 0.62 | 9% of the clock, 22% of games called notable |

Worth remembering as a shape of mistake: two knobs turned together produce a
result that is true of the pair and gets written down as a fact about one of
them.

### One absolute number, borrowed rather than invented

Everything here is relative to the game's own median, which is the house rule,
except one anchor: 12 seconds. Relative thresholds alone call a metronomic game
of one placement a minute pure flow, because half its windows sit under its own
median by construction. `analysis.js` has called a pause of 12 seconds or more
long since v1.5.0, so flow may never be slower than the app's own definition of
a long pause and a stall must be at least it. The measured consequence: a
metronome at 12.0 seconds a placement is flow and one at 12.5 is not, and a game
played four times slower than the model reports no flow at all.

### Tilt reads the direction and understates the size

Injecting a known slowdown after every mistake and reading it back:
with mistakes on 5% of placements, an injected 1.0x reports 1.06x, 1.5x reports
1.39x, 2.0x reports 1.71x and 3.0x reports 2.56x. At a 12% mistake rate the same
four come back as 1.02x, 1.29x, 1.47x and 1.90x, because the window before one
mistake contains the wake of the last one. The null is clean, so the direction
can be trusted and the magnitude cannot. It says so in the docstring, and it
returns null rather than a number when fewer than three mistakes have a full
window on each side.

## v2.15.0 - 2026-08-12 - the solve path as a picture

Every game has recorded the order the cells were filled, how long you sat on
each one, and whether the board had proved the digit at the moment you wrote
it. None of it has ever been visible as a shape. `src/stats/solveart.js` draws
all three at once: a thread through the cells in the order you filled them,
swelling where you stalled, with a bead at each placement coloured by what the
classifier made of it. The grid you were given stays square underneath while
the solve turns around it, so a game is a different picture from any other
game rather than the same tangle with different dots.

Two halves. `toArt` returns a drawing as data, normalised to a unit square and
knowing nothing about pixels. `toSvg` builds the string. No colour is named
anywhere in the output, only custom properties, so one drawing themes six ways,
and a palette that names a literal colour is refused rather than shipped and
found later in the five themes nobody looked at.

Nothing is wired to a screen yet.

### Three numbers that decided the design

**Dwell has to be logarithmic.** On a simulated Expert solve of 58 placements
with a four second median gap, a linear width gives the middle 80% of
placements 30% of the width range, and adding three genuine multi-minute stalls
drops that to 8%: one fat mark and fifty identical ones. Logarithmic against
the game's own median holds it at 68% in both.

**Uniform Catmull-Rom overshoots exactly where this path lives.** A solve path
is long jumps followed by short hops, which is the worst case for it. Across
five simulated solves the worst excursion outside the box formed by the two
points a segment runs between was 0.077 of the canvas uniform and 0.089
chordal, against 0.034 centripetal. An overshoot here is a loop drawn around a
cell nothing ever happened in.

**Six samples a gap, not twelve.** The angle the drawn polyline turns through at
each joint: 10.0 degrees median at four samples, 6.4 at six, 5.0 at eight. The
95th percentile hardly moves (25.3, 23.0, 21.5), because that tail is the
path's own hairpins rather than the sampling, so more samples relocate the
corners instead of removing them while the file grows linearly: 9.8KB, 13.9KB,
18.1KB.

### And two things only looking could settle

The first attempt drew the board square and let it drift, which put every
picture off balance: the whole path leaned one way and left a wedge of empty
canvas on the other. The drift is centred now, and the givens are the still
point it turns about.

The second attempt fitted the board at a fixed fraction of the canvas computed
from the widest possible sweep. That is correct and wasteful: at a third of a
turn it left the drawing at 62% of the frame, which is 39% of the area. The
drawing is scaled to fit what it actually contains instead, over the lattice as
well as the path so that the scale barely moves between games.

### The classifier is twenty times slower on some games than others

Measured while deciding whether the drawing should be handed a ready analysis:
`analyseGame` costs 0.2ms on a game played in the ladder's own order, where the
first technique tried always fires, and 4.7ms on the same puzzle played in
reading order, where the ladder runs to the bottom at every step. The four
milliseconds quoted in `analysis.js` is the second case. Worth knowing before
anything else decides to classify on demand.

## v2.14.0 - 2026-08-12 - a curriculum of your own failures

Which pattern to drill next, decided by what has actually been beating you
rather than by a syllabus. Each rung carries a strength that rises when you find
the pattern unaided and falls when you take a hint on it, plus a due date derived
from that strength: half a day for something you keep failing, three weeks for
something you own.

Logic only in this version, `src/stats/curriculum.js`. Nothing is wired to a
screen yet.

### It can only teach what your own puzzles have contained

Measured over twelve generated puzzles per tier before any of it was written. A
Swordfish turned up in none of the 72 and a naked quad in one, while hidden
singles are in 100% of puzzles from Easy up and pointing pairs in 92% of Mediums.

So a rung you have never met is not on the list at all, and naked singles never
are: they cost zero in the grader on purpose and fire in every puzzle at every
tier, so a scheduler able to suggest them would suggest them for ever.

That table also decides what pushes a rung down the list. The cheap rungs get
their practice whether this asks for them or not, so having met one recently
counts for a lot: you will meet a hidden single tomorrow whatever happens, and
you will not meet an XY-Wing unless you go looking for one.

### Two things measuring found that guessing would not have

**A hidden single can never be credited to you.** Replaying those same 72 puzzles
as a ladder-perfect player and running the real classifier over them, `sharpBy`
credited every elimination rung (pointing 26, XY-Wing 25, X-Wing 13, hidden pair
15) and credited naked and hidden singles exactly zero times. That is structural:
`justification` answers routine or solid for those two and never reaches the
branch that names a pattern. One hint on a hidden single would therefore have
pinned it at the bottom of the class for good. Meeting a rung in a game you then
finished without asking for help counts too, at a lower weight, and it is the
only route back up for the bottom of the ladder. On real games: five games of
hidden-single hints take it to 0.06, and fifteen clean games bring it to 0.90.

**Being overdue is a poor proxy for being weak.** The first ordering ranked
purely by how far past its date a rung was, and on real games that put an X-Wing
which two puzzles happened to contain ahead of a pointing pair that had been
hinted 57 times, because the pointing pair had been met yesterday and so was not
technically due yet. The list is three groups now: due, waiting, and the ones
there is nothing to say about yet. A rung whose whole record is "the grader's
solve path needed it and you did not ask for help" is in that third group, since
that is a record of what the puzzles contained rather than of what you can do.

The starting strength moved for the same reason. From zero, a player who had
found four hidden triples unaided and never once needed help still read 0.58, and
the schedule offered to drill the pattern they had just demonstrated. It starts
at 0.5 now, meaning unknown rather than weak, and the same player reads 0.79.

Costs 0.6ms over a thousand games, so it can be recomputed on every view rather
than stored. Practice puzzles are recorded like any other game, so a drill counts
as the review it is.

## v2.13.0 - 2026-08-12 - a question instead of an answer

The hint button already had two rungs: press once for the pattern, press again
for the digit. This is the rung below both. It asks you something.

    What do you notice about the 6s in row 8?
    Two cells in the top left box can only be 2 or 7. What does that mean for
    the rest of it?
    Where can 3 still go in the top right box? If those cells all sit on one
    line, what does that rule out?

One phrasing per technique, built from the step the grader would take next, so a
question cannot disagree with the difficulty rating any more than a hint can.
Nothing generic: a question that fits every technique points at nothing.

Logic only in this version, `src/logic/socratic.js`. Nothing is wired to a
screen yet.

### Every question names a unit or a digit, and never a cell

Checked over 2643 questions from real solve paths across five tiers and four
variants: not one names the cell it is about, every one ends in a question mark,
every one names the unit and the digits it hands back, and the claim behind each
one holds against the candidate state it was asked in.

A naked single needed care, because it has no unit of its own: it is proved by
its peers, not by any one unit, so the question has to pick a place to search.
Naming the region is the natural scan and gives the answer away outright 22% of
the time, because the region holds exactly one blank. Picking by breadth instead
drops that to 3.7%, which is the cells that are the last blank of their row,
their column and their region at once. Nothing can point at those without
pointing at them, and by then there is nothing left to protect.

### Four of the twelve techniques cannot be asked about at all without this

An elimination step leaves every digit on the board where it was. A caller
rebuilding from the board therefore gets the identical question next time it
asks, forever, so `askAbout` takes a `skip` that walks past eliminations already
given away. That sounded like a nicety until it was measured: over 9090
questions at every skip depth, every hidden pair, naked triple, hidden triple
and swordfish reached was behind at least one skip, and at skip zero only six of
the twelve rungs are reachable at all.

It never walks past a placement. Behind a placement is a board holding a digit
the player has not written, and a question about a grid they are not looking at
is worse than no question.

### It will not send you hunting for a pattern that is not there

A wrong digit poisons every candidate set, and the ladder then derives things
confidently and wrongly. Planting one wrong digit in 197 real positions, the
cheapest step claimed a digit the solution contradicts 39.6% of the time, and
the board looked healthy from the inside: 18.8% had a cell with no candidates
left, and not one had a duplicate in a unit. Given the solution, the question
becomes one about your own digits. Without it, the cell that has run out is
still proof enough for a fifth of them.

### A bug found on the way

The naked single question said "one cell in the top left box" while the result
it handed back carried `unit: null`, because the unit it chose was thrown away
after the sentence was built. The words were right, the highlight would have had
nothing to draw, and no test, build or type could have noticed. `focusUnit` is
now the one place that decides, and both the sentence and the result read it.

Cost of a question: p50 under 0.01ms, worst case 0.23ms, and 0.59ms walking
eight steps ahead. One ladder pass, so nothing here needs the worker.

## v2.12.0 - 2026-08-12 - a private league on a shared repository

Point the GitHub sync at a repository a few friends can write to and the daily
becomes a race. No server, no accounts, nothing anyone but you can switch off.
Everyone publishes `league/<name>.json` beside the game shards, and the table is
computed from whatever files are there.

A league file carries daily results only: the day, the tier, the time, mistakes,
hints and whether it was finished. Measured at 128 bytes an entry and 47KB a
year, which is why it is one file per player rather than sharded by month the
way the game log has to be. A game record is 7KB on its own because it carries a
move log, and a move log is a recording of somebody thinking. It has no business
travelling with a finishing time.

This is the layer underneath: the pure functions in `src/stats/league.js` and
their tests. The screen and the transport come separately.

### The table cannot be ranked on the obvious number

Measured across three weeks of real dailies: Monday's Gentle scores 0 every
week, Sunday's Diabolical a p50 of 1830, which is the full width of the tier
scale. So a median over "the days you played" compares nothing between two
people who played different days. Played out over a real generated week with
three players, the one who skipped the two hardest days finished with the best
median in the league, 360s against the winner's 420s, having lost every single
day they turned up for.

So there is a **pace** column: your time against what that day cost everyone
else, taken as a median over the days you contested. 0.93 means you are
typically 7% inside the field. The raw median is still reported, because it is
the number people want to see, and it is not what anything is decided on.

### A day you missed is not a day you lost

It appears in no denominator. Wins, the days you contested and the days you
finished all count only days you were there for, so someone who plays twice a
week is ranked on those two days rather than punished for the other five.

Two rules follow, and both are stated because neither is the only possible
answer. A day only one person played is not a win, because winning a race you
were the only entrant in is not winning. A day two people played and only one
finished is a win, because the other player was there and did not get to the
end.

### The bug this found: a friend in a timezone ahead had no streak

The daily is keyed on the local date, so somebody six hours ahead publishes a
day before you have reached it. The streak function counts a run as current only
if it ends today or yesterday, so judged against your calendar their last day is
in the future and the run reads as zero. Measured directly: the same three day
run scores 0 against our today and 3 against theirs, and it would have hit the
most consistent player in the league.

A streak is now measured against the player's own last day whenever that is
further along than ours. It is also computed over their whole history rather
than the window on screen, so showing the last seven days cannot report a forty
day streak as seven. Both of those produce a perfectly plausible number when
they are wrong, which is why both have a test.

### Nothing here can verify a time

Everyone writes their own file and there is no referee. That is the price of
having no server, and a league between friends is honest for the same reason a
pub quiz is.

What can be checked is that two people played the same puzzle. An entry carries
the seed, the board and the tier the grader gave, and a day where those disagree
is left out of the table and reported rather than compared. A friend on an older
build racing a different grid is the kind of wrong answer where every number
still computes and every one of them is meaningless.

## v2.11.0 - 2026-08-12 - ghost racing

Race the game you played last week, or race the engine, on the same grid. A
ghost is one number over time: at this moment, how many cells it had filled. A
live game compares itself against that and gets "three cells ahead" or "forty
seconds down" out of one lookup.

This is the timeline and the comparison only, in `src/stats/ghost.js`. Nothing
is wired to a screen yet.

### Filled means filled correctly, and measuring is what settled it

The obvious count is cells that are not empty. Measured on a Hard game with
wrong digits left standing on the board, that count and the honest one disagree
at 59% of board changes with two wrong digits down, and 85% with five, and the
gap is exactly the number standing. A race is decided by one, two or three
cells, so the error is the same size as the signal: you would be told you were
two cells ahead precisely because two of your digits were wrong.

So a cell counts once it holds the digit the solution has, on both sides of the
race. `progressOf` is exported for the live side for the same reason: counting a
live board with `filter(Boolean)` would include the givens and report the player
a clue count ahead of a ghost on the same grid, all game.

### The timeline is replay.js read a different way, not a second board walk

Folding the move log here in one pass measured 0.01ms per ghost against 0.11ms
for reusing `boardAt`, on a 782-entry log. The tenth of a millisecond was worth
paying: the other version is a second description of what an undo does, free to
drift from the first. `replaySteps` already names the entries that can move a
digit, 86 of those 782, so the quadratic-looking version is cheap and is paid
once when a race starts rather than during play.

Verified against an independent recount at 501 sample times through a game with
mistakes, erases, undos and redos in it: no disagreements, and the ghost's line
goes backwards four times, which is the erases and undos showing up as they
should.

### The engine pays for its thinking

The ladder's solve path contains steps that only eliminate candidates: 6 of the
62 steps on the Hard used as a test fixture, 5 of 56 on a Diabolical. Those cost
time and fill nothing, so the engine's line has flat stretches where it is
thinking rather than writing. An engine charged only for placements would finish
six steps early and be a harder race than the ladder actually is.

At three seconds a step it finishes a Gentle in 1:51 and a Diabolical in 3:18,
median over six seeds a tier, so the default pace beats a person on every tier.
It is a dial, and the code says so.

### Two numbers, because cells are not equal

The race reports the gap in cells and the gap on the clock. They are not the
same reading: level on cells can be five seconds down, because the ghost got to
that count earlier and is about to move again. The clock half is also the one
that keeps meaning something while you are both stuck on the same cell.

Costs, warm: 0.09ms to build a ghost from a game record, 0.16ms to build one
from the ladder, and 0.026 microseconds per race readout, so a live display can
ask on every frame.

## v2.10.0 - 2026-08-11 - start on the phone, finish on the Mac

The position you are in the middle of now travels, not just the games you have
finished. Put the phone down mid-puzzle and the Mac offers to pick it up.

### Why it is not the same merge as everything else

Finished games union safely because they never change again. A position in
progress is the opposite: it is one thing both devices rewrite, so a union is
meaningless and last-write-wins would silently discard moves. A phone left open
in a pocket can write a newer save containing fewer moves.

So the longer move log wins, and a tie goes to the more recently touched. That
is not a general conflict-resolution scheme, it is the one fact that matters:
both logs start from the same puzzle, so the longer one contains the shorter.
Two genuinely different puzzles are not merged at all, they are offered as a
choice.

**And it is never applied on its own.** The rule is right nearly always, and
nearly always is not good enough when being wrong means overwriting a game
someone is in the middle of. The dashboard offers it, with how far along it is
and how much clock is on it, and you decide.

Pushed when you leave a game rather than on every move, since each write is a
commit and one per placement would be absurd.

## v2.9.0 - 2026-08-11 - flashcards

Practice mode hands you a whole puzzle that needs a technique, which takes ten
minutes and teaches the pattern once. A flashcard shows a position where the
pattern is present and asks one question: where is it. Eight of those in three
minutes builds recognition in a way one long solve does not.

Every card is a real position. They come from generated puzzles walked forward
to the exact move the technique fires, so nothing here is a diagram drawn to
make a point, and a test re-asks the ladder in each position to confirm it still
names the same pattern in the same cells.

Tap the cells, check, and a wrong answer outlines the real one and explains it.
Correct answers are timed, so the deck can tell you at the end whether the
pattern is automatic yet or only reachable.

Dealt in the worker, because a rare rung genuinely takes ten seconds to find
eight positions for, and it says so rather than spinning if it cannot.

## v2.8.0 - 2026-08-11 - keyboard speedrunning

- **hjkl** moves the selection, so a hand never leaves the home row.
- **Shift with any of them** jumps to that edge of the grid.
- **Tab** goes to the next empty cell, which is what you actually want between
  placements: arrow keys walk into filled cells you have no use for, and on a
  nearly-solved grid that is most of them. Shift-Tab goes back.

Two things this took. **Hint moved from `h` to `?`**, because movement is the
entire point of those four keys and `h` was already taken; pressing it used to
spend a hint, and the new binding was unreachable dead code sitting after it in
the chain.

And **the selection could only ever move one cell**. Jump-to-edge silently did
nothing rather than failing, which is the kind of bug that ships. It handles any
distance now, clamped to the grid, since the clamp is the same work either way.

## v2.7.0 - 2026-08-11 - a puzzle is a word

Every puzzle here has been reproducible from a seed, a tier and a board since
Phase 6, because that is what the daily needs. So sharing one is sharing those
three things, and it needs no server, no account and nothing to upload.

    J4FA-D

That code is a Medium jigsaw. Typing it in rebuilds the identical grid,
irregular regions included, on any device. Base32 without the characters people
mistype, grouped in fours, and it survives being typed in lower case with the
dashes left out.

### Two things it took to make the code honest

The code has to name the tier that was **asked for**, not the one the grader
returned. Generation takes a request, so a code built from the graded tier
rebuilds a different puzzle: it round-tripped the board correctly and produced
the wrong grid, which is worse than failing.

And no code is offered for a practice or tailored puzzle at all. Those come from
a different search, so a tier and a seed cannot rebuild them, and a code that
silently produced something else would be a lie in a place that looks
authoritative.

## v2.6.0 - 2026-08-11 - how it feels

Sound and motion that mark the moments you earned, rather than reporting that
something occurred.

- **Completing a row, column or region has its own sound**, a rising pair under
  the placement rather than instead of it. The flash has acknowledged this since
  Phase 4 and nothing else did.
- **The last digit sounds different.** A held note under the final placement, so
  the moment the grid closes is audibly not the ninety placements before it.
- **A placed digit lands**, dropping in with a slight overshoot rather than
  appearing.
- **A wrong digit is refused**, with a short shake, instead of only turning red.
- **Arming a digit answers**, on the pad and in the ear, both barely there
  because it happens constantly.
- **Undo has a sound**, the placement backwards in feel.
- **A spent digit marks itself done** on the pad with a tick rather than going
  blank. Nine of those accumulating is the quiet progress bar of a solve.

All of it sits behind `prefers-reduced-motion` and the sound switch, as
everything already did.

## v2.4.0 - 2026-08-11 - four things the coach can now tell you

- **Tilt.** Whether a mistake makes the next five minutes worse, measured for
  you rather than assumed. It compares placements in the shadow of a wrong digit
  against the rest of the same game, so someone who is simply error-prone does
  not read as tilting. When it finds nothing it says so, because "stop after a
  mistake" is advice that does not apply to everyone.
- **Am I actually improving.** Compared within each tier, so drifting toward
  easier puzzles cannot masquerade as progress. Twenty finished games before it
  will claim anything.
- **Fatigue within a sitting.** Games within three quarters of an hour of each
  other count as one session; if the fourth game of a session is measurably
  worse than the first, that is your limit before it stops being practice.
- **The nemesis.** Distinct from the existing hint weakness, which names
  whatever is worst today. This one only speaks when the same rung has been the
  worst across both halves of your recent history, so it is a standing problem
  rather than a bad week, and it says whether it is easing or not.

## v2.3.0 - 2026-08-11 - the game as prose

Every game review opens with an account of what the game was like, above any of
the numbers, because what a game was like is the thing anyone actually
remembers a week later.

    A Hard on an evening in 8:51.
    The opening was steady.
    One placement needed more than a scan, and it was pointing pair that got
    you there: 2 into r1c4.
    You finished it clean, with no wrong digits and no help.

Nothing here is new information. The classifier already knew which placements
were earned, the stall analysis already knew where the clock went, and belief
archaeology already knew which notes went stale. None of them had ever been
asked to say what happened.

Written as an account rather than a verdict: it reports in the order things
occurred and leaves the judging to the numbers underneath, because a report that
opened with a grade would be read as a grade and nothing else. A game under a
dozen placements gets no account at all, since three moves is not a story.

### Two bugs it took to get there

- The stall paragraph read `longest.ms` where the data says `gap`, so it could
  never appear, and nothing anywhere failed to mention it. Found by planting a
  ninety-five second stall in a fixture and noticing the sentence about it was
  missing.
- The account changed depending on which tab you were looking at, because the
  belief data was only computed once the Notes tab had paid for it. It costs
  twenty milliseconds on a full game, which is a great deal less than an account
  of your game rewriting itself as you navigate.

## v2.2.0 - 2026-08-11 - the daily changes shape through the week

The daily was classic every day and practice drilled on classic only, neither of
which was ever a decision.

The board now rotates with the weekday, the same way the difficulty always has,
and is derived from the date like everything else here so every device still
gets the same puzzle with no server involved:

    Sunday      Diabolical   classic
    Monday      Gentle       classic
    Tuesday     Easy         X-Sudoku
    Wednesday   Medium       Jigsaw
    Thursday    Medium       Windoku
    Friday      Hard         Anti-knight
    Saturday    Expert       classic

Every variant gets a day and the two heaviest stay classic: a Diabolical is
enough of a fight without also being an unfamiliar shape, and Saturday's Expert
is the one you play against the clock. Measured before choosing, and the
variants are actually faster to generate than classic at the hard end because
the extra constraints help the digger converge.

Both places the daily is offered now name the board, so an unfamiliar grid is
never a surprise after you have already tapped it.

Practice takes a board too. Spotting a naked pair inside an irregular region is
a different skill from spotting one in a square box, so the same rung is worth
drilling more than one way.

## v2.1.0 - 2026-08-11 - statistics know which board you played

Variants shipped with records kept per variant and everything else pooled, so a
median sat between two things rather than describing either. On a history of six
classic games at four minutes and six jigsaws at fifteen, the median read five
minutes, which is true of no board anyone played.

Statistics now filter by board, and the filter only appears once more than one
kind has been played. Every figure under it, the coach included, then describes
one thing. Pooling is still available and says plainly what it is.

The experiment normalises a solve time against your usual time for that tier on
that board, falling back to the tier across all boards when there is not enough
of one yet. Recent games say which board each row was.

## v2.0.1 - 2026-08-11 - explanations that exist on a phone

Thirteen explanations had been written as `title` attributes, which is the same
as not writing them at all on the device this app is mostly played on. There is
no hover on a touch screen, so every one of them was invisible on the iPhone.

- **Press and hold any tool** for a line explaining what it does, dismissed by
  tapping it. The same idiom the board already uses for tinting a cell. All ten
  tools have one now, not just the four that had a tooltip, and the hold does
  not fire the button: holding Hint explains it without spending a hint.
- **A legend under the recent games list.** The compact glyphs were explained by
  hover alone, so `3✕` and `2?` meant nothing on a phone. One line, always
  visible.
- **The status bar spells out the mismatch.** "you asked for Medium" rather than
  "asked Medium" with the sentence hidden behind a hover, on the one label whose
  entire job is admitting the grader disagreed with the request.
- **The move review states what a class means**, not just why this move earned
  it. "Mistake: this digit does not belong here." was a tooltip.

The `title` attributes stay wherever they were, so a pointer still gets a hover.
They are just no longer the only way to find out.

## v2.0.0 - 2026-08-11 - variants

Four new ways to play, and a grader that did not need telling about any of them.

- **Jigsaw** irregular regions instead of square boxes
- **X-Sudoku** both long diagonals must also hold one to nine
- **Windoku** four extra shaded regions, overlapping the boxes
- **Anti-knight** no digit repeats a knight's move away

Every one of them is graded honestly, hinted, explained, reviewed, classified
move by move and checked for stale notes, because none of that code ever knew
what a box was. It reasons about units and peers, so a variant is a different
answer to "which cells constrain which" and nothing above that line changes.

The difficulty scale carried across untouched. Every variant at every tier lands
in the band it was asked for, uniquely solvable and finishable by pure logic,
because the grader measures deduction rather than geometry. Clue counts differ
and should: an anti-knight Medium needs only twenty clues where classic needs
twenty-nine, since the extra constraint does some of the work. Clue count was
never the target.

### The jigsaw generator took three attempts, and the first two failed silently

Both early versions fell back to square boxes when they gave up, which would
have shipped a "Jigsaw" that was ordinary sudoku under a different name.

1. **Growing regions from seeds** stranded cells every single time. Sixty seeds,
   sixty failures, one to twenty-two cells sealed into pockets no region could
   reach.
2. **Trading adjacent cells across a border** disconnects a region every time,
   because the cell it gains touches nothing but the cell it gave away. Two
   hundred seeds, two hundred rejections.
3. **Moving two cells** fixes the shapes, and then a quarter of the layouts turn
   out to admit no valid filling at all. Searching for one is heavy-tailed: good
   layouts fill in about two hundred steps and bad ones burn forty thousand
   proving nothing, and eleven of forty still never filled even with restarts.

What works is building the shapes and the digits together. Start from square
regions and a completed grid, and only accept a move when both regions still
hold nine different digits. The layout arrives with the grid that satisfies it,
so there is no search and no way to fail. Holding one grid fixed leaves the
result five-sixths square, so it works in rounds: mutate, redraw the grid for
the shapes as they now stand, repeat.

### The filler needed restarts regardless

Reading-order backtracking is fine for square boxes and hopeless once the board
is constrained: a jigsaw region can span six rows, so a contradiction planted in
row one is not found until row seven. It fills the most constrained cell first
now, the same ordering the solver has always used, and gives up and reshuffles
after a budget. That second part matters more than the first, because the search
is heavy-tailed even when a solution certainly exists.

### A test that was passing by luck

The practice-puzzle tests allow the search fifteen seconds and ran under a five
second timeout. They passed because the search usually finished early, and broke
the moment a slower machine ran them: changing how the grid filler consumes its
random source shifted which puzzle each seed produces, and one search that used
to finish in two seconds no longer did.

The timeout now exceeds the budget the test itself sets. A test whose own limit
is larger than the harness allows is not a passing test, it is one waiting for a
slow day.

### Smaller

- Region borders are drawn from the same regions the rules are enforced from, so
  the outline cannot disagree with the puzzle. Jigsaw needs all four sides;
  square boxes only ever needed two.
- A Windoku cell belongs to a box and a window, and the box wins when the grid
  is drawn or when `claiming` argues about a region. Windows are shaded instead.
- Personal bests are kept per variant. A Hard jigsaw and a Hard classic are not
  the same achievement.
- Jigsaw shapes travel with the saved game and the synced record. They cannot be
  re-derived if the layout builder ever changes, and a board that silently
  reshaped itself would be worse than one that failed to load.

## v1.11.2 - 2026-08-11 - a switch an experiment is holding says so

A running experiment sets one of the assists itself, at the start of every game.
The settings screen had no idea, which left two problems.

The switch appeared to change on its own, with nothing on screen to explain it.
And it could still be flipped by hand, which leaves that game playing one way
while its record says the other: a quiet corruption of the exact result the
experiment was being run to get.

The switch an experiment is driving is now locked and says why, and points at
where to stop the run. The others stay yours.

## v1.11.1 - 2026-08-11 - a p-value is never zero

The finished experiment panel reported "a gap this big came up in only 0.0% of
reshuffles", which claims the result could not have happened by chance. Ten
thousand reshuffles cannot resolve below one in ten thousand, and the plus-one
correction means the answer is never actually zero, so rounding it down undid
the exact overclaim that correction exists to prevent. It now says "under 0.1%",
and the table column says "<1%".

## v1.11.0 - 2026-08-11 - experiments you run on yourself

The defaults in this app are guesses. Auto-pencil off, mistake marking on, quick
input off: all reasonable, none of them measured. Now one of them can be settled
with evidence, for one particular player, which is honest difficulty pointed at
the assists rather than at the puzzles.

Pick a question, and the assist is switched on and off at random behind the
scenes, half your games each way. After thirty games the difference is measured
with a permutation test: the real gap between the two halves against the gaps
you get by reshuffling which games were in which half, ten thousand times.
Seeded, so the answer does not wobble when you look again.

That test was chosen because the method is its own explanation. "I shuffled the
labels ten thousand times and only 3% of shuffles looked this different" can be
checked for meaning without trusting a formula, which a t-table cannot.

### Three things arranged so it cannot flatter itself

- **The deciding outcome is declared before any games are played.** Testing four
  measures and believing whichever came out best is how noise becomes a finding.
  The others are shown, and labelled as not deciding anything.
- **Nothing is reported until all thirty games are in.** Checking as you go and
  stopping when it looks convincing is the most reliable way to find an effect
  that is not there.
- **A null result states its own reach.** The power was simulated rather than
  assumed: thirty games catch a difference of about a third nine times in ten,
  and a difference of a fifth only four times in ten. So "no difference found"
  is reported as ruling out a large effect and nothing smaller. A null that does
  not admit its limits is the most common way an honest-looking experiment
  misleads.

It also cannot blind you, and says so. You can see whether your board came with
notes in it.

### A dead setting, found by building this

`autoPencilOnStart` has been in the settings defaults since Phase 6, was read by
nothing anywhere in the app, and was never even offered on the settings screen.
Turning it on did nothing at all.

It surfaced because the experiment that varies it would otherwise have spent
thirty games measuring a switch connected to nothing, and then reported "no
difference" with a straight face. It now genuinely fills in every candidate when
a board opens, and appears in settings like any other assist. A game where the
only thing that happened was auto-pencil no longer counts as a game played.

## v1.10.0 - 2026-08-11 - belief archaeology

A fifth tab in the review, and the first thing this app does that nothing else
can. It knows what you had written down at every moment, and what the board
actually proved at every moment. The gap between those is a record of your
false beliefs and how long you held them.

Pick a note and the board goes back to the exact position where it stopped
being true, showing your own notes with every impossible one struck through.

### The obvious definition was wrong

"A note the board had ruled out" sounds like the right test. It is not.
Auto-pencil writes the plain peer-scan candidates, and the full ladder is
stricter: on a Hard grid, 53 of the 158 candidates it writes are already dead to
a pointing pair or a subset. That definition would have announced 53 false
beliefs the instant you pressed a button the app itself offered, which is both
noise and a lie about whose fault it was.

So the test is narrower and means something: a note that **was** true and
**became** false while you kept it. The board moved and you did not notice.
Notes that were never possible are reported separately, because a misread at the
moment of writing is a different mistake from a belief going stale.

### And the obvious summary was wrong too

The first version reported "160.3 minutes" of false belief inside a seven minute
game, by adding up durations that overlap. It now reports the union, which is
how much of the game had at least one wrong note on the board, and the worst
number of notes wrong simultaneously. On a real solve: 97 notes went stale, at
worst 61 wrong at once, and for 7.5 minutes of an 8.5 minute game the map being
read was out of date somewhere.

Which points at the fix, so the panel says it: pressing Auto again rewrites every
note from the board as it stands. Nothing else rubs them out except placing a
digit.

Also new: `docs/VISION.md`, with the ideas worth building, and the ones ruled out
with reasons so they are not proposed again.

## v1.9.0 - 2026-08-11 - the coach knows what the review knows

Everything the move review works out was computed when you opened it and thrown
away when you closed it. So the app could tell you that eleven placements in one
game went in before the board proved them, and had no idea whether that was
normal for you.

Now every game carries its own classification, and the coach reasons across all
of them:

- **How much of your play is actually justified.** A guess that happens to be
  right looks exactly like a deduction in every other statistic here, and only
  one of them keeps working as the grids get harder. Broken down by tier,
  because guessing at Medium and guessing at Diabolical are different habits.
- **Patterns you find unaided, against the ones you spend hints on.** The
  interesting case is a pattern you can clearly find and still reach for the
  bulb on, which is impatience rather than a gap in what you know.
- **Long pauses that ended in a move which had been available the whole time.**
- **How often something easier was sitting elsewhere on the board.**

### Why it is stored rather than computed

Classifying one game costs about four milliseconds. Across a thousand games that
is three and a half seconds of frozen interface, every time the statistics screen
opens. Measured before designing, which is what decided this: the summary is
computed once when the game ends, and is about 190 bytes on a record that already
runs to seven kilobytes. Aggregating a thousand of them is then arithmetic.

Games recorded before this are caught up the next time you open statistics,
ten at a time with the screen left usable in between, and it says so while it
runs. A summary is tied to both its own version and the grader's, so changing
how the app classifies invalidates them rather than quietly averaging old
verdicts with new ones.

### Smaller

- "a X-Wing" is now "an X-Wing". X is the only letter in the ladder spelled with
  a consonant and said with a vowel.

## v1.8.0 - 2026-08-11 - the phone and the Mac share one history

Point both devices at the same repository and they are one history. Statistics,
records and the coach see every game wherever it was played, which they never
could before: a Diabolical solved on the phone was invisible to the Mac, and
each device thought its own half was the whole story.

It runs by itself after each finished game and whenever the app comes back to
the foreground. A full pass lists the repository first, so a month a device has
never seen still arrives. That listing is the entire difference between a backup
and a sync: without it, a Mac that has never opened August never thinks to look
for August.

### Deletes travel now, which they had to

A union merge cannot say "this game is gone". Delete a game on the Mac and the
next sync pulls it back from the phone, which pushes it back to the Mac, for
ever. Two devices would have made deleting anything futile, which matters
immediately: the app has had a delete button for about an hour.

So a month's file carries the ids deleted from it, both ends honour that list,
and a tombstone is dropped after a year, by which time every device has long
since seen it. The tombstone lives in the file for the month the game belonged
to, not copied into all of them.

The integration test is two simulated devices sharing one fake repository:
a game reaching the other side, a month never seen arriving, and a deletion
staying deleted through repeated round trips in both directions.

### Smaller

- Connecting now syncs straight away, so the other device's games arrive
  without anyone knowing to press anything. This took writing the config to
  storage rather than only to React state, since the sync reads it back and the
  effect that persists state had not run yet.
- "Sync now" no longer forces a write. A full pass already ignores the cache,
  and forcing meant a commit on every press with nothing to say.
- A pass that only published a deletion used to report "already in sync", which
  was a small lie about work it had just done.

## v1.7.3 - 2026-08-11 - delete one game

The log offered exactly two options: keep everything, or delete everything. A
game that was not really played is not a harmless extra row, because every
statistic in the app is computed from this log: it moves medians, win rates,
tier readiness and the coach's thresholds. Having to choose between a wrong
median and no history at all is a poor choice to be offered.

Two-step, in the game review, in the same shape as giving up. It says plainly
that a copy already pushed to a backup stays there until that month is written
again, because the merge is a union by id and deletes do not travel.

## v1.7.2 - 2026-08-11 - the backup checks rather than assumes

A shard deleted on GitHub was skipped by every push afterwards. The fingerprint
cache answers "has this month changed on this device", and the push treated that
as the whole question, so it assumed the other end had not changed either. The
result is the failure this whole feature exists to prevent: a backup that
believes it is complete and is not.

Once a day, every shard is checked against the remote instead of trusted. It
costs one read per month of history and writes nothing when all is well, because
a shard the remote already holds in full is skipped after the read. "Back up now"
forces the same check immediately.

## v1.7.1 - 2026-08-11 - new versions actually arrive

The GitHub backup shipped in v1.6.0 and was not there. Not missing from the
build: missing from the running app, which is worse, because everything looked
fine from the outside.

`registerType: 'autoUpdate'` installs a new service worker in the background and
gives it control, but the page already open keeps the JavaScript it booted with.
On a tab you reload constantly that is invisible. On an app installed to the home
screen, which is the entire point of this one, it means running a build from
weeks ago with nothing on screen saying so.

Now a new worker taking over reloads the page, and the app asks for an update
every time it comes back to the foreground, which on an installed app is the only
moment it reliably gets to run. Safe to reload at any point because the position
is written to storage on every change and every ten seconds besides.

Also: the first write to a repository with no commits. An empty repository has no
branches, so naming one in the contents API call comes back 404 and reads as
"repository not found". Retries once without it, and only when creating a file.

## v1.7.0 - 2026-08-11 - hints that teach, and patterns from your own grid

### Hints can explain instead of answering

A setting, off by default. With it on, the first press points at the pattern and
fills nothing in: the cells outlined, the unit tinted, the candidates it kills
struck through, and a sentence saying what it is. Press again and it gives up
the digit as before.

Phase 3 settled that the plain hint is better for flow and that has not changed,
so this is a rung below it rather than a replacement. **Practice mode turns it on
regardless**, because a drill that hands you the answer is not a drill.

The deduction engine behind it moved to `src/logic/explain.js`, so the review's
"why was this move justified" and the hint button's "why is this the move" are
now literally the same function. They could not disagree before; now they cannot
drift either.

### The patterns from the grid you just played

A fourth tab. Every technique the puzzle required, drawn from that puzzle at the
moment it came up, with a button to go and drill it.

The practice screen could already tell you what an X-Wing is in the abstract.
This is the X-Wing that was in the board you spent ten minutes on, which is the
version worth looking at. Singles are skipped: a worked example of "this cell
had one candidate left" teaches nobody anything.

### One cell, start to finish

Click any cell in the review. Pencilled in 3, rubbed out the 3, filled in 2
which was wrong, cleared it, filled in 7. Some cells are the whole story of a
game and the review could previously say a great deal about a move and nothing
about a cell.

Working out whether a pencil entry put a mark in or took it out needs the state
before it, which a single log entry cannot tell you. It reads the reconstructed
position instead.

### What the clock says about the judgment

The review has always shown a gap next to a class and never crossed them. A long
think that ended in a move which was a lone candidate the whole time is a
scanning problem. An instant placement that nothing proved is not thinking at
all. Neither shows up in either number alone.

Thresholds are relative to the game rather than absolute, because a fast
player's long pause and a slow player's are different numbers.

### Fixes

- **Pattern cells were painted as errors.** A hidden pair kills candidates inside
  its own cells, so `.hasKill` and `.inPattern` landed on the same cell and the
  later rule won. Being part of the pattern is the more important fact.
- **The review board lost its width cap**, because the class that made the stage
  board fill its column was on every instance of the board, including the replay
  one.
- **The heatmap lost its second labels.** The new board gated them on an empty
  cell, and the heatmap shows the finished grid.

## v1.6.0 - 2026-08-11 - the review shows its working, and backup to GitHub

### The review draws the evidence

The last version would tell you a move was Sharp because "r3c1 still showed
2/3/6" and then show you a board with no candidates on it. The claim was
uncheckable, which is the one thing a review must not be.

The board now carries everything the analysis is talking about:

- **Candidates in every empty cell**, so a statement about candidates can be read
  off the board it is about.
- **Your own notes**, rebuilt from the move log, on a toggle beside them.
- **The pattern drawn rather than described.** The four cells of a naked quad
  outlined, the unit tinted, the digit it kills struck through. Every technique
  already returned its `cells`, `digits` and `unit`, and all of it was being
  thrown away.
- **The better move marked on the board.** "Easier was 5 to r7c8" used to send
  you hunting for r7c8 yourself.
- The move list sits beside the board, so choosing a move and seeing it are one
  glance, and the review opens on the first mistake rather than the last move of
  the game, where one cell is empty and there is nothing to look at.

**Patterns are drawn over the candidates they were actually found in.** A naked
quad found after a pointing pair has cleared the way does not look like a quad
on the raw board, and the first version drew one over four cells that visibly
contradicted it. The candidate state the pattern fired in is kept with the
pattern, and the panel says when what you are seeing includes eliminations.

### Stale notes

A note you kept after the board had already ruled it out. The game only erases
marks when you place a digit, so anything killed by a pointing pair or a naked
pair sits there looking valid indefinitely.

Finding these needs more than the naive candidate set: a peer scan finds almost
none of them. `settledCands` runs the ladder's eliminations to exhaustion, and
the difference against your notes is the answer. The wording is deliberately not
scolding, because some of those eliminations take a pattern to see.

### Pencil marks are replayable at all now

`stateAt` rebuilds the marks alongside the board. Every rule that changes a mark
was already in the log except one: undo, redo and returning to a bookmark
restore a snapshot, and only the board half of it was recorded. Those entries
now carry a mark diff too. Games recorded before this replay approximately after
the first undo, and the review says so rather than pretending.

### Backup to GitHub

Off until you turn it on. A fine-grained token with Contents write on one
private repository, and the game log goes up as one file per month under
`games/`.

The token lives in its own storage key so it can never travel with the settings
or an export, and it is only saved after GitHub confirms it actually works: a
backup you believe in but that has been failing for three weeks is worse than
none. Sharding by month is because a game record runs about 7KB with its move
log, so a single file would outgrow what the contents API hands back in one read
within a few hundred games.

The merge is a union by game id and already computes what the remote has that
this device does not, which is the half two-way sync needs. Sync is not wired
up, but nothing here has to be rebuilt to add it.

This is a deliberate exception to the rule that the app makes no network
requests, and `CLAUDE.md` now says so explicitly rather than being quietly
violated.

## v1.5.0 - 2026-07-31 - post-game review, and giving up

Seven things off the feedback list. Most of them are the app being quieter about
what it knows.

### The review is a chess-style move report now

A third tab in the game review, **Every move**, that says what each placement
was worth. Six classes, and the axis is deliberately "could you know this",
not "how clever was it", because a sudoku move is not better for being harder.

- **Routine** the cell had one candidate left
- **Solid** the digit had one home left in a unit
- **Sharp** it took a real pattern to rule the rest out, and it names which
- **Lucky** correct, but nothing on the board proved it when you played it
- **Mistake** with the reason, naming the clashing cell where there is one
- **Hint** the app filled it

Each row also carries what was available instead, and clicking a row jumps to
that move in the replay.

**Sharp started out as a bug.** It was the fallthrough case, so a digit dropped
onto an empty grid came back as brilliant deduction. A move is only sharp if
something actually proved it, so it now runs the ladder's eliminations and asks
whether they make the cell a lone candidate or a hidden single. A second bug
turned up underneath: `createState` recomputes candidates from the board alone,
so every elimination a pointing pair had already established was missing, and
moves the ladder itself derived were coming back "lucky".

`scripts/classcheck.mjs` is what caught both. It runs two players over the same
puzzles: one follows the ladder exactly and must never be lucky and never wrong,
one fills correct digits in reading order and must be lucky often. Either test
alone passes for a classifier that always answers the same thing.

The "easier was" line is shown once per cell. An easy placement you keep walking
past stays the cheapest move for as long as you ignore it, so it was printing
one fact thirteen times and reading like a broken template.

### The review comes to you

A **Review** button on the win screen and on the give-up screen. It was only
reachable through the statistics tab, which is the one moment nobody goes
looking for it.

### The coach is clickable

The insight that names the technique you keep needing hints on now carries
**Practise this now**, which starts a puzzle requiring exactly that. Naming a
weakness and then doing nothing about it was half a feature.

### Giving up

A quiet **Give up** in the footer, two-step so it cannot be hit by accident. It
records the game as a loss, because a win rate computed only from wins is not a
win rate, and reveals the rest of the grid in a dimmer ink than your own digits.
The review tells the two apart: a game you walked away from reads "unfinished",
one you gave up on reads "gave up".

### Three things the app was giving away

- **The wrong-digit sound played even with mistake marking off.** If the board
  is not telling you, neither is the speaker.
- **A bookmarked branch is a simulation**, so it no longer marks mistakes at
  all. Speculating is the entire point of the branch. Dropping the mark brings
  marking straight back.
- **The clock ran on the dashboard, in statistics and in settings.** "Playing"
  only ever meant "not paused". It now means the game is actually in front of
  you. The timestamp clock itself was right and stays: the defect was what
  counted as running, not how it counted.

## v1.4.0 - 2026-07-31 - hard-puzzle tools

The last of the four. Both are for Diabolical-grade puzzles, where undo alone is
a clumsy way to explore.

### Bookmark

One toolbar slot, two states. It says **Mark** when nothing is saved and
**Return** when something is, so the flow reads mark, explore, return. A
separate "return" button would have sat disabled most of the time. `B` on the
keyboard, shift-B to drop the mark without using it.

It saves the whole position, not just the board: marks, the stripped-mark
ledger, and your tints all come back with it. And the return is itself
undoable, because returning by mistake should not cost you the branch you were
exploring.

### Cell tints

Long-press on touch, right-click on a pointer device, cycling a cell through
four colours and back to none. Deliberately not a toolbar button: the toolbar
was already at eight, and tinting is something you do *to a cell*, so it belongs
on the cell.

**The first attempt failed validation and was thrown away.** The obvious design
is a background wash, so I picked four hues and blended them at 40% over the
panel. The validator was blunt about it: blending collapses the hues toward grey,
and blue against magenta came out at ΔE 8.8 for **normal** vision, below the 15
floor, before colour blindness enters into it. Four background washes cannot
carry four distinguishable colours.

So identity moved to a saturated inset ring, which keeps its chroma, and the
wash underneath only does the scanning work. The four hues pass as a categorical
palette: chroma floor, lightness band, CVD separation ΔE 14.4 (protan), and
normal-vision separation ΔE 24.1.

The tints are fixed rather than theme-derived. They are the player's own
marking, and a mark that changed meaning with the theme would be worse than one
that clashes slightly.

### Found while verifying

Tinting a run of cells and closing the app lost the lot. The save effect was
keyed on the board, marks, status and mistakes, so nothing about a tint or a
bookmark triggered a write; they only survived if something else happened to
save within ten seconds. Both are now in the dependency list.

134 tests pass, 6 new.

## v1.3.0 - 2026-07-31 - practice mode

The coach has been able to name the pattern you keep needing hints on since
Phase 5, and could do nothing about it. This is the other half.

### Feasibility was measured before any of it was designed

`scripts/practice.mjs` asks whether each rung can actually be generated on
demand. Every technique is reachable; the cost varies a lot:

| technique | hit rate | median |
|---|---|---|
| naked / hidden single | 100% | ~1ms |
| pointing, claiming, pairs, XY-Wing | 100% | 0.1-0.6s |
| naked / hidden triple, X-Wing | 100% | 3-5s |
| Swordfish | 100% | 9.2s |
| **naked quad** | **67%** | 10.7s |

Every generated puzzle is checked against the same contracts as a normal one:
unique solution, finishable by pure logic, and it genuinely contains the
technique asked for.

That measurement shaped the interface. The slow rungs carry a warning, the
button says what it is doing, and naked quad can honestly fail.

### The screen

A list of all twelve techniques, each with a one-line label, an explanation of
what it is, and how many hints you have needed on it. It doubles as the
technique reference the app never had.

The dashboard card names your weakest pattern once there is enough evidence
("You have needed 7 hints on pointing pair") rather than advertising a feature.

Generation runs in the worker with a 30 second budget, and is never cached: a
practice request asks for one specific property, not for "a Hard puzzle".

### Found while testing the slow path

A failed search said **nothing at all**: the button reset, no board appeared, no
message. The error was only rendered inside the game screen's generating veil,
which a failed practice search never reaches. It now reports on the practice
screen, where the attempt was made, and invites a retry.

128 tests pass, 7 new. The unit tests cover only the fast rungs on purpose; the
rare ones are measured by the script, because a Swordfish search in the unit
suite would add ten seconds to every run.

## v1.2.0 - 2026-07-31 - game review, replay and heatmap

Zsomb went looking for these after a Diabolical game and could not find them,
because they did not exist yet. They do now.

### Recent games, and a review for each

The stats screen lists recent games; tapping one opens its review. Two views of
the same log:

- **Replay** walks the solve forward with a scrubber and a play button, marking
  the cell each step touched, so you can watch how it actually unfolded.
- **Where the time went** collapses it into a heatmap of how long you sat on
  each cell before filling it, with the time printed in the corner.

Plus the per-game facts: placements, wrong digits, undos, hints, time to first
move, longest pause and where it was, pencil marks, checks.

### The move log had to become a real history first

It recorded *that* an undo happened, not what it undid, and *that* auto-complete
ran, not which cells it filled. Enough to count, not enough to replay. Both now
record an explicit diff of what changed, which makes replay exact rather than
approximate.

Verified on a game played entirely through real actions: replaying the log from
the starting puzzle reproduces the solution exactly, 36 empty cells down to 0.

Games recorded before this replay approximately through undos, which is the
honest limit of what was stored, and games with no log at all say so rather
than showing an empty board.

One detail worth knowing: the review reports a wrong digit even if you undid it.
The mistakes counter is reverted by undo on purpose, but the log is not, so the
review can still tell you a wrong digit was tried.

### Two changes from Zsomb's feedback

- **Check only appears when "Show mistakes" is off.** It was redundant: a wrong
  digit was already marked the instant it was placed, so the button asked a
  question you could already see the answer to. It now earns its slot only when
  you are playing without that net, and Settings says so.
- **In quick input, number keys pick the digit rather than placing it.** Filling
  stays with the cell, by click or by Enter.

  This reverses the Phase 3 decision, which kept the keyboard cell-first on the
  grounds that arming a brush only saves taps on a touchscreen. That was true
  and beside the point: it made one setting mean two different things depending
  on what you were typing on, which is worse than the efficiency it bought.

121 tests pass, 13 new over replay and reconstruction.

## v1.1.0 - 2026-07-31 - four defects, and notes you can trust

Found by going hunting rather than by reading the code: every item below was
reproduced in the running app first.

### The four defects

**Erasing a digit did not put back the pencil marks it displaced.** Placing a 5
strips it from every peer's marks, which is right. Erasing the 5 left them
stripped, so the marks were permanently missing a candidate that had become
valid again. Measured: nine peers held the digit, zero after placing, still zero
after erasing. Your notes quietly stopped being true, which is the worst kind of
bug in a game where the notes are what you reason from.

Fixed with a ledger: every strip records exactly which peers lost which digit,
so the removal is reversed precisely when the digit leaves. Recorded rather than
recomputed, because recomputing cannot tell a mark you never wrote from one the
app removed, and would invent marks you had deliberately cleared.

The ledger also carries the cell's **own** marks, found by a test: placing a
digit clears the notes in that cell too, and erasing has to bring those back. If
you pencil 1/4/6/9, type a 4 and erase it, you want your four candidates back.

**Undo history died on reload.** Close the app mid-game and the stack was empty.
Now persisted, capped at the last 50 states: a full stack of board and mark
snapshots runs to a few hundred KB, which is not worth writing every ten seconds
for undos nobody reaches.

**Pause did not survive a reload** — it came back running, with the clock going.
Now persisted, and verified: blurred board, resume button, clock stopped.

**No redo.** Unlimited undo and no way forward, so over-undoing cost you
retyping. `R`, or shift-cmd-Z. A new move drops the redo branch.

### Notes that stay correct

- **Candidate hints.** With a digit highlighted, empty cells it could still
  legally occupy get a ring.

  It rings only cells that **do not already carry that pencil mark**. The first
  version ringed every legal cell, which on an auto-pencilled board meant 33
  rings almost all sitting on cells whose highlighted chip already said the same
  thing. The ring now means "this fits here and you have not noted it", so the
  two signals never overlap: 33 rings and no chips with marks cleared, 33 chips
  and no rings after auto-pencil.

- **Check.** Briefly flashes any wrong digits rather than marking them
  permanently, so it stays a deliberate act. Counted as an assist, like hints.

The toolbar is now eight controls in two rows of four, which also gives bigger
targets on a phone than six across ever did.

108 tests pass, 9 new over mark restoration and redo.

## v1.0.2 - 2026-07-31 - pencil marks, highlight contrast, theme menu

All three from Zsomb's report after playing v1.0.1.

### Pencil marks moved depending on which other marks were present

He spotted it precisely: a 4 sat lower in a cell using two rows of marks than in
one using three. Reproduced and measured.

| rows of marks used | where the 4 sat |
|---|---|
| 3 | 18.2px |
| 2 | **22.4px** |

Plus a 9.8px case where the top row happened to be empty.

The marks grid declared `grid-template-columns` but not rows, so the rows were
implicit and auto-sized. An empty row collapsed to nothing and the occupied rows
absorbed the free space, which moved every digit in the cell.

This is not cosmetic. A pencil mark's **position is information** — you learn to
read "4 is left-of-centre" without counting — and that only works if the
position never moves. Fixed with `grid-template-rows: repeat(3, 1fr)`. Verified:
1/2/3 at 0px, 4/5/6 at 18.2px, 7/8/9 at 36.4px, in every cell regardless of
which marks are present.

### A highlighted pencil mark is now a filled chip, not a recoloured digit

Zsomb: outside ink and brass it is "almost impossible to tell which number you
have highlighted".

He is right, and the reason is that recolouring only works when the accent sits
far from `--sub` in both hue and lightness. Measured in Nord, the highlighted
mark against a plain one was **1.07:1** — two light blue-greys at 9px, which is
invisible by any standard.

Highlighted marks now swap figure and ground: `--accent` background,
`--accent-ink` text. That removes the comparison entirely, and it is legible in
every theme by construction rather than by luck, because `--accent-ink` is
already validated at 4.5:1 or better against `--accent` in all six. Nord now
measures **7.41:1**.

### Cell highlights were weaker in every theme than in ink

Also his observation, and also true. The `--sel` and `--same` alphas had been
copied from ink rather than computed per theme, so on lighter panels the same
alpha produced far less separation.

| theme | selected, before | after |
|---|---|---|
| ink | 1.86 | 1.86 |
| paper | 1.44 | 1.87 |
| newsprint | 1.47 | 1.86 |
| contrast | 1.48 | 1.88 |
| nord | 1.72 | 1.88 |
| midnight | 1.82 | 1.88 |

Alphas are now computed per theme to land on ink's strength against that theme's
own panel. Same-digit highlight is 1.36 in all six.

### The theme switcher is a menu

Was a button that cycled through six. Cycling is fine for two options and
miserable for six: you cannot see where you are going, and reaching the last one
means passing through four you did not want.

Now a dropdown listing all six, each row rendered in its own theme's tokens with
a miniature board, so you choose from the thing itself rather than from a name.
Closes on selection, Escape, or a click outside; `aria-haspopup`, `aria-expanded`
and `menuitemradio` throughout. Available from both the game and the dashboard.

## v1.0.1 - 2026-07-31 - fixes from an adversarial UI review

An independent review pass over the UI layer, verified in the running app rather
than read off the source. It found six real defects, two of them introduced by
v1.0.0 itself.

### Serious

- **Game keys stayed live behind the Stats and Settings screens.** The keyboard
  handler was mounted unconditionally, so pressing `H` on Settings spent hints
  and `A` overwrote pencil marks on a board you could not see. Measured: 25 to
  27 cells filled and two hints consumed from the Settings screen. Because
  hints feed the "clean solve" count, a stray keystroke on the wrong screen was
  quietly disqualifying games from the honest-stats figure. Keys now only reach
  the reducer on the game screen.
- **The pencil-mark highlight never rendered.** A local `lit` inside the cell
  loop shadowed the outer `lit` holding the highlighted digit, so the comparison
  was boolean-against-number and always false. `.m.mHi` was dead code. Verified:
  0 highlighted marks before, 31 after.
- **Completing a unit made those cells blink out and re-deal.** v1.0.0 changed
  the React `key` of flashing cells to retrigger the animation, which remounts
  them, and a fresh node restarts the board's entrance animation. The reward
  moment read as a rendering glitch. Retriggering now alternates between two
  identical keyframes instead, so the nodes survive; verified 9/9 preserved.

### Layout

- **The per-tier table scrolled the whole page sideways on a 320px phone.** Its
  six columns exceed the viewport and `.app` is a non-growing flex item, so it
  spilled out. Now wrapped in its own scroll container: document width 320 = 320,
  was 337 vs 320.
- **Three of the four charts kept the letterbox bug the calendar had fixed.**
  Histogram, hour bars and tier trends still carried a fixed pixel height beside
  `width: 100%`, so they drew 320px of content in an 872px element. All four now
  measure 100% fill; two were at 37% and 53%.
- **The header theme button destroyed any non-default theme.** It flipped
  between ink and paper only, so picking Midnight and tapping it gave you paper
  with no way back except reopening Settings. It now cycles all six and names
  the current one in its label.
- **Number pad targets.** v1.0.0 justified the nine-across pad above 380px by
  saying it lined up under the board's columns. Measured, it does not: 39.8px
  cells against 35.8px keys, ~4px out at both ends. With the stated reason gone
  the decision rests on target size, so the five-column rewrap now covers every
  phone: keys went from 36x46 to 68x52 at 390px. The six tools stay in one row
  above 380px, which was costing 58px of height and pushing the game below the
  fold.
- Icon buttons 32x32 to 40x40 on phones, and the settings switches grew with
  them.

### Accessibility

- **81 tab stops between the board and the toolbar.** Every cell was in the tab
  order. Roving tabindex now keeps exactly one cell focusable and carries DOM
  focus along with the arrow-key selection. Focusable elements in the game view:
  103 down to 23.
- **Small text failed 4.5:1 in every theme**, including the honest-difficulty
  disclosure and the delete-history confirm button. The cause was decorative
  opacity on already-muted text. Removed from seven rules, and paper's `--sub`
  lifted from 4.12:1 to 4.67:1.
- Unearned achievements were distinguished only by opacity; they now carry a
  dashed border, so the state is not opacity-and-colour alone.
- An active tool was signalled by colour alone; it now also fills.
- `<div>` children inside `<button>` on the dashboard cards, which is invalid
  phrasing content, replaced with `<span>`.

### Also

- An empty hour in the play-by-hour chart drew nothing at all, because the
  column path returns empty at zero height. It now draws a 2px stub, so "no
  games at 4am" reads as a zero rather than as the chart ending.
- Removed 13 lines of dead `.segmented` CSS left over from the old theme toggle.
- Removed an unused `--i` custom property set on all 81 cells.

### Came back clean

All six themes define the complete 19-token set with none missing, which matters
here because `data-theme` sits on the picker cards and a missing token would
inherit from the active theme rather than from ink. The reduced-motion block
covers every animation including those declared after it, confirmed empirically.
No other specificity or source-order bugs. The board never overflows at any
width.

## v1.0.0 - 2026-07-31 - Phase 4, the interface

The last phase, and the only one facing the UI. Everything else had stopped
moving, which is why this waited.

### It fits the Mac now

The app was a fixed 430px column, so a 27-inch display got a phone-sized game.
It now grows in three steps and the board grows with it: **642px on a desktop
against 402px before**, with 40px digits, and the whole game fits without
scrolling.

The mechanism is container queries. Everything inside the board sizes in `cqw`
against **the board**, not in `vw` against the viewport, so digits and pencil
marks hold their proportion to the grid at any size. One set of rules serves a
350px phone board and a 642px desktop one.

Above 1080px the controls move beside the board rather than below it, and the
number pad becomes a 3x3 keypad with 108px targets, because nine across in a
340px column would have been 35px.

### A dashboard

The app used to open straight onto a board, which left the daily, the streaks,
the achievements and the history as things you had to go looking for. Home is
now a dashboard: the game in progress with its progress bar, today's puzzle with
its streak, three headline numbers, and every difficulty one tap away.

### Six themes

ink, paper, midnight, nord, newsprint, contrast. Each has the full token set and
its own sequential ramp, and **every ramp was validated, not eyeballed**:
monotone lightness, adjacent gaps >= 0.06, light end clearing 2:1 against its own
panel, single hue. Accent hues sit at least 41.5 degrees apart in OKLab.

`contrast` is light rather than dark on purpose. Ink reaches 21:1 either way, so
the tiebreak is functional: a user-entered digit has to be tellable from a given
one. Light gives accent-vs-ink 2.62:1, dark only 1.98:1.

The picker renders a real miniature of the board inside each card using that
theme's own tokens, so a swatch cannot drift from the theme it claims to show.

### Motion

Board entrance as a diagonal deal, a flash when a row, column or box completes,
digits fading back on the pad as they run out, a diagonal sweep across the
finished grid into the win card, and cards rising in on the dashboard and stats.

Nothing blocks input, nothing runs past 600ms, and the whole layer is switched
off by `prefers-reduced-motion`. Hover lifts are gated behind
`(hover: hover) and (pointer: fine)`, since on a touchscreen a hover style fires
on tap and reads as a bug.

### A wrong digit is no longer signalled by colour alone

It carries an error wash and an underline too. This surfaced from newsprint,
where the accent is brick red and the error crimson, but colour-only encoding
was wrong in every theme, so the second channel is global.

### Two bugs found while verifying

- **Every theme preview rendered identically.** The token blocks were scoped to
  `:root[data-theme="x"]`, so a `data-theme` on a card matched nothing and all
  six swatches drew in whatever theme was already active. Themes are now scoped
  to `[data-theme="x"]` on any element.
- **The desktop number pad stayed nine across.** Its media-query rule sat near
  the top of the stylesheet and was silently overridden by the base `.pad` rule
  further down at equal specificity. Moved to the end of the file, with a note
  saying why it lives there.

### Verified

102 tests pass. Measured rather than assumed, at 1440x900 and 390x844:

| | desktop | phone |
|---|---|---|
| board | 642px, 40px digits | 362px, 22px digits |
| number pad | 3x3, 108px keys | 9 across, 46px keys |
| fits without scrolling | yes | yes |
| horizontal overflow | none | none |

All six themes confirmed applying distinct backgrounds and accents, and all four
new ramps re-validated independently rather than trusted. The unit flash was
verified firing on exactly the right 21 cells (row, column and box union) both
mid-game and on the winning move, where the win sweep correctly takes over.

## v0.6.0 - 2026-07-31 - Phase 6, the daily puzzle and settings

### Daily puzzle

Seeded from the calendar date, so the same day produces the same puzzle on every
device with no server involved. That is what the seeded PRNG has been sitting
there for since Phase 0.

Difficulty rises through the week the way a newspaper crossword does: Monday
Gentle, through to Saturday Expert and Sunday Diabolical.

**Its own save slot.** Opening the daily never costs you a casual game in
progress, and switching between them is not an abandon. Two slots because there
are exactly two things you can be in the middle of, not because saves needed to
be general.

The daily seed is offset from the plain date seed, so the daily and a casual
game can never come out as the identical puzzle. It has its own streak, with the
same overnight grace as the play streak.

### Achievements

Fifteen, **derived from the history rather than stored**. Each is a pure
question asked of the records, so they cannot drift out of sync with reality,
importing a backup restores them for free, and adding a new one retroactively
awards it for games already played.

### Sound

Synthesised with WebAudio: no audio files to download, precache or lose offline.
Place, erase, wrong, hint and a win triad. Off by default, because a sudoku that
makes noise you did not ask for is worse than a silent one.

Driven off the move log rather than sprinkled through the handlers: the log
already knows what happened and whether it was right, so one effect covers every
input path.

### Settings screen

Theme, quick input, show mistakes, sound, and the data tools. Export and import
moved here from the stats screen, where they never really belonged, and
**Delete history now takes two taps** with a cancel: it is the only irreversible
thing in the app.

### Fixed

The New Game sheet grew to nine rows with the daily on it, which on a short
phone pushed the top row off-screen with no way to reach it. Capped at 88dvh and
scrollable.

### Verified

102 tests pass, 18 new over the daily and achievements, including that the same
date really does produce the identical puzzle and that a streak survives
overnight but not a skipped day.

In the browser: the daily generated as Friday/Hard, was wiped and regenerated
from scratch to confirm it came back **byte-identical**, and a casual game with
a move in it survived the round trip untouched. Delete history refused to fire
on one tap. The sheet was re-checked at 390x667 and stays scrollable with the
daily row reachable. Finished the daily and confirmed the record is tagged
`daily` with its day key and the streak moved to 1. Zero console errors.

Note: the layering scare during verification was a screenshot compositor
artifact in the preview pane, not a bug. Hit-testing showed the sheet correctly
on top and fully opaque. Same family as this pane suspending rAF.

## v0.5.0 - 2026-07-31 - Phase 5, statistics and the coach

Every game is now recorded, and the stats screen is where the move log finally
pays for itself. Chart icon in the header.

### Data

IndexedDB, one record per game, completed **or abandoned**: a win rate computed
only from wins is not a win rate. A record carries the graded tier, score,
duration, mistakes, hints with their techniques, and the full move log, plus the
puzzle and solution. Those last two are regenerable from the seed but stored
anyway, because regenerating a Diabolical puzzle costs seconds and the pair is
350 bytes.

The move log records every action against **elapsed** game time, not wall clock,
so it survives pauses and describes the solve rather than the calendar. It is
written in the reducer, which is why the game was built as a single funnel back
in Phase 0: one hook, not instrumentation scattered across a dozen handlers.

Games with no moves are not recorded. Switching difficulty is not a loss.

### The screen

One hero figure, six stat tiles, a calendar heatmap, small multiples of solve
time per tier, a solve-time histogram, and play-by-hour.

Charts are hand-rolled SVG, no library. Every series is single, so none carries
a legend, and there is no categorical palette anywhere: **small multiples per
tier instead of six competing colours**, which would have fought the app's
two-colour design and buried the only question the chart answers, which is
whether the line goes down.

The calendar's sequential ramp was **validated, not eyeballed**. The first
attempt failed the light-end contrast check at 1.55:1 against the panel, and the
first light-theme attempt failed too; both were re-stepped until monotone
lightness, adjacent gaps and contrast all passed. Values and the constraint are
recorded in `tokens.css`.

"Show numbers" renders the per-tier table, so no value is reachable only by
hovering.

### The coach

Seven insights: hint reliance by technique, mistake timing, pace across the
solve, pencil discipline, tier readiness, time of day, and mistake clustering by
box.

Two rules govern all of them. Nothing appears without enough data behind it, and
every insight reports the sample it used, so a claim can be checked rather than
taken on faith. And every insight says what to do about it. With too little
data the screen says what is still missing instead of looking broken.

### Backup

Export writes a JSON file you keep. Import merges rather than overwrites, skips
records already present, and rejects a file that is not a Zsudoku export.

### Found while verifying

`moveLog` was missing from the persisted save, so a game resumed after a reload
would have been recorded with an empty move log: analytics silently wrong rather
than absent, which is worse. Fixed.

### Verified

84 tests pass, 26 of them new over the stats and coach layer, including that the
coach refuses to draw a conclusion from two games and that every insight it does
emit carries a sample size.

In the browser: empty state, then 46 synthetic games to exercise every chart
(the mistake-timing insight correctly identified the endgame clustering that had
been seeded into the data), then the synthetic games were deleted and a real
game played through — hand placement, deliberate mistake, correction, hint,
finish — and checked end to end. Export/import round-tripped: clear to 0, import
46, import again added 0 and skipped 46, foreign file rejected. Zero console
errors.

## v0.4.1 - 2026-07-31 - hints

One tap, one number. Sixth toolbar button, `H` on the keyboard.

Zsomb weighed a simple hint against an educational one and leaned simple for
game flow, reasoning that the teaching could live in the post-game statistics.
Taken, with one correction and one addition.

**It fills the cell the ladder would do next, not a random one.** Identical
interaction, but a random empty cell may not be derivable from the board yet, so
it would be arbitrary and unblock nothing. The ladder is ordered cheapest-first
and restarts after each success, so its first placement is the easiest move
actually available. It is also less code than picking randomly, since `nextStep`
already existed.

**Every hint records what it stood in for**, and the win screen reports it:
"2 mistakes, 2 hints on hidden singles, 1 hint on a pointing pair". That is
Zsomb's own suggestion and it composes better than an in-game explanation.
During a game an explanation interrupts; afterwards the same information tells
you which pattern you keep failing to spot.

Details:

- Steps past elimination-only moves, because a hint has to put a number on the
  board to be worth a tap.
- Verified against the solution before being applied. A wrong digit already on
  the board poisons the candidate sets, so the ladder can be confidently wrong;
  it then falls back to the most constrained empty cell.
- Always places, even in notes mode. Pencilling a hint in would not be a hint.
- Marked on the board until the next move, otherwise it reads as nothing having
  happened.
- Undoable, and never counted as a mistake.

The escalating three-level hint from the original plan is dropped. The per-step
`detail` sentences each technique returns are still produced and still tested,
just not shown during play; Phase 5's coach uses them.

Toolbar is now six buttons.

**Verified in the browser**: three hints in a row each filled a correct cell,
the marker moved with them and never doubled up, the log recorded the technique
each time, mistakes stayed at zero, and the win screen rendered the summary.
Zero console errors.

58 logic tests pass. The strongest one solves entire puzzles using nothing but
hints and checks every digit against the solution.

## v0.4.0 - 2026-07-31 - quick input

Digit-first entry, requested 2026-07-30. Arm a digit on the pad, then every cell
you tap gets it. Far fewer taps on a phone, because digits get filled in runs.

- Fifth toolbar button, `Q` on the keyboard. The armed digit is filled brass on
  the pad so there is no doubt what a tap will do.
- **Number highlighting comes free.** While a digit is armed every cell holding
  it lights up, which was Zsomb's observation when he asked for the feature:
  arming a digit to place it and arming it to look for it are the same gesture,
  so the mode does not need a separate highlight control.
- Works in notes mode: tapping toggles that pencil mark instead of placing.
- Tapping a cell that already holds the armed digit clears it, matching the
  existing same-digit-clears behaviour.
- Tapping the armed digit on the pad disarms it (`Escape` too), so there is
  always a way to just select a cell without leaving the mode.
- Givens are never edited, but tapping one still moves the selection there.
- Cell-first stays the default and the setting persists.

**The keyboard stays cell-first in both modes.** Digit keys place into the
selected cell, which is what someone at a keyboard expects; arming a brush only
saves taps on a touchscreen. Mixing the two would have made the same keystroke
mean different things depending on a setting the keyboard never needed.

Both modes route through one `placeDigit` helper in the reducer, so they cannot
drift apart on pencil erasure, mistake counting or the win check.

Toolbar went from four buttons to five; "Auto notes" shortened to "Auto" to keep
the row comfortable at phone width.

**Verified in the browser**: arming 3 lit all six existing 3s, two taps placed
two 3s and the digit stayed armed, a third tap on the same cell cleared it, a
given was untouched, notes mode toggled marks instead of placing, turning the
mode off returned taps to plain selection, the keyboard still placed into the
selected cell while the mode was on, and the setting survived a reload. Zero
console errors.

49 logic tests pass, 10 of them covering the new mode.

## v0.3.2 - 2026-07-31 - auto-complete fires earlier

Zsomb reported the button arriving later than the equivalent in his iPad app and
guessed our stricter rule was the cause. Measured rather than assumed, walking
each solve in the grader's order:

| tier | strict | cascade | shipped (capped) |
|---|---|---|---|
| Gentle | 6 | 36 | 12 |
| Easy | 7 | 29 | 12 |
| Medium | 6 | 29 | 12 |
| Hard | 5 | 26 | 12 |
| Expert | 5 | 31 | 12 |
| Diabolical | 6 | 27 | 12 |

Overall median cells remaining: strict 5, cascade 29, shipped 12. The guess was
right in direction and the gap was large.

Plain cascade was too generous to ship: on Gentle it appears with 36 of 45
blanks left, which is most of the puzzle. So the trigger is now **cascade capped
at 12 remaining cells** (`AUTO_COMPLETE_MAX`), which more than doubles the
window versus strict without handing over a third of the board.

The cap is arbitrary and the code says so. It is a dial, not a discovery.

What it actually produces is worth knowing: the cascade condition, once true,
stays true while you fill correctly, so the button appears the moment the board
drops to 12. Shipped p50 and max are both exactly 12 across every tier, and it
never fails to appear. In practice this is "the last 12 cells", with the cascade
check as the guard against offering on a board that still needs real work.

Button copy changed from "every cell is forced" to "only lone candidates left":
under the capped rule the cells become forced in turn rather than all at once,
so the old wording would have been false.

**Verified at the boundary**: hidden at 13 blanks, appears at 12 reading "Fill
the last 12", one click filled all 81, matched the solution, won. 39 tests pass,
including one asserting the cap holds even when the tail is trivially fillable.

## v0.3.1 - 2026-07-31 - auto-complete, strict

The first slice of Phase 3. It was specced in v0.3.0 but not built, which Zsomb
correctly noticed: the button never appeared because it did not exist yet.

**Strict trigger, chosen by Zsomb**, and his reasoning improved the spec. The
cascade alternative still asks you to notice which cell has become forced, and a
cell being forced is not always obvious: a cell can hold several pencil marks
while some digit has only one home left in its box. Spotting that is a hidden
single, and it is thinking. Strict fires only when there is nothing left to
notice at all: every empty cell down to exactly one candidate.

- Computed from the true candidates rather than the player's pencil marks, so
  the button does not depend on how diligently they pencilled.
- A contradiction on the board fails the check, so a wrecked board never offers
  it.
- Goes through undo history, and sets an `autoCompleted` flag for Phase 5 stats.
  A game finished this way is not the same as one finished by hand.
- Keyboard `C`. Appears as a full-width brass bar under the board, because it is
  rare and late and should not hide as a fifth toolbar icon.

**Measured**, `npm run calibrate -- autocomplete`: walking a solve in the
grader's own order, it fires on every puzzle at every tier, median 5 to 7 cells
left, never more than 10. A player filling in a different order can reach the
all-forced state earlier, so it is not strictly a last-six-cells affair.

**Verified in the browser**: seeded a six-cell endgame, button appeared reading
"Fill the last 6, every cell is forced", one click took the board from 75 to 81
filled, matched the solution exactly, won, and set the flag. On a fresh 50-blank
Medium puzzle the button is correctly absent.

36 logic tests pass, including one asserting `forcedFills` only ever offers the
digit from the solution. That matters more than usual here: this button fills
the board for you, so a wrong digit would silently ruin a finished game.

## v0.3.0 - 2026-07-30 - Phase 2, the honest difficulty engine

Four tiers became six, three techniques became twelve, and no puzzle that needs
a guess can reach the board any more.

### The ladder

`src/logic/techniques.js`. Naked single, hidden single, pointing, box-line
reduction (claiming), naked pair/triple/quad, hidden pair/triple, X-Wing,
XY-Wing, Swordfish.

Every technique returns a structured step: which technique, which cells, which
unit, what it eliminates, and a sentence explaining it. That shape is the point.
The grader and the Phase 3 hint button call the same function, so a hint can
never contradict the difficulty rating.

### The scoring model, and the mistake that shaped it

The first attempt priced every technique by difficulty, naked singles included
at 10 apiece. Calibration killed it on sight. Across 520 sampled grids the
median score climbed smoothly from 360 at 46 clues to 611 at 22 clues, tracking
the clue count almost independently of which techniques a puzzle needed. A
puzzle has 81 minus clues placements, so if each carries a cost, the score
mostly counts blank cells: a trivial 22-clue puzzle outscored a genuinely hard
34-clue one. That is the same dishonesty Phase 2 exists to remove, in a
different hat.

Writing a digit that has only one possible value is bookkeeping, not deduction.
Naked singles now cost zero, hidden singles very little, and first-use costs
dwarf repeat costs, so the hardest thing you have to *spot* sets the tier while
repeats refine within it. A regression test asserts naked-singles-only puzzles
score exactly 0 at any clue count.

### Bands measured, not guessed

`npm run calibrate -- explore` samples the real score distribution. Boundaries
sit in the gaps between technique clusters: p50 by hardest technique came out
naked single 0, hidden single 40, pointing 212, claiming 370, naked pair 491,
hidden pair 695, hidden triple 756, XY-Wing 1464, Swordfish 2168.

### Nothing unfair ships

Every tier rejects puzzles the ladder cannot finish. The generator now digs
toward a score band rather than a clue count, and when it digs past the point of
fairness it puts a clue back instead of shipping a guess. Clue count is an
outcome, not a target.

### Generation moved to a Web Worker

The full ladder digs and re-grades repeatedly and Diabolical can take nine
seconds, which on the main thread is a nine second frozen interface. One ready
puzzle per tier is also generated ahead into localStorage, so New Game is
usually instant even at the top tier.

Verified by comparing timer jitter at idle against jitter during generation:
both 999ms median in the preview pane, meaning generation adds exactly nothing
to main-thread load. (The pane clamps timers to ~1s and suspends rAF, so the
baseline comparison is the only valid probe here.)

### Grader versioning

`GRADER_VERSION` is part of the puzzle cache key and is stamped into saves.
Scores only mean anything within one version of the ladder, and a pre-generated
puzzle would otherwise keep displaying a label from a scoring system that no
longer exists. Saved games from an older grader are regraded on load.

### Also

- Six-tier New Game sheet with a one-line description of what each tier asks.
- The status chip now names the hardest technique the puzzle actually needs.
- `scripts/distribution.mjs` removed, superseded by `scripts/calibrate.mjs`.
- Fixed: `useGenerator` returned a fresh object each render, so `startNew` was
  rebuilt constantly and effects keyed on it looped. Memoised.

### Verified

32 logic tests pass, including a soundness test asserting no technique ever
eliminates a candidate that belongs to the solution. That one guards the
difficulty ratings and the future hint text at the same time.

`npm run calibrate -- 18`, 108 puzzles:

| tier | exact hit | median score | median clues | median ms | worst ms | landed |
|---|---|---|---|---|---|---|
| Gentle | 100% | 0 | 45 | 0 | 3 | Gentle 18 |
| Easy | 100% | 28 | 32 | 2 | 11 | Easy 18 |
| Medium | 100% | 278 | 27 | 25 | 481 | Medium 18 |
| Hard | 94% | 574 | 25 | 557 | 1623 | Hard 17, Medium 1 |
| Expert | 100% | 1031 | 24 | 531 | 3473 | Expert 18 |
| Diabolical | 100% | 1574 | 26 | 1593 | 9308 | Diabolical 18 |

**Puzzles requiring a guess that reached the caller: 0.** That is the number
that matters, and it is the one the previous engine could not deliver.

The single Hard miss is labelled Medium, because it is Medium.

Technique usage across the run: naked single 1457, hidden single 405, pointing
41, claiming 18, XY-Wing 13, naked pair 9, hidden pair 8, X-Wing 4, naked triple
1, hidden triple 1, Swordfish 1, naked quad 0. Naked quad never fired in this
sample; it stays in the ladder because without it a puzzle needing one would be
misjudged unfair and thrown away rather than graded.

## v0.2.0 - 2026-07-30 - Phase 1, live and installable

Live at **https://zsombp.github.io/zsudoku/**. Repo `zsombp/zsudoku`, public,
deploys from `main` on push.

- `vite-plugin-pwa` on `autoUpdate`, precaching the whole 307KB app shell. There
  is no runtime caching strategy to reason about, because the app makes no
  network requests at all once it has loaded.
- Icons generated by `scripts/make-icons.mjs`. The brass Z is rasterised from a
  polygon with 4x4 supersampling and written through a from-scratch PNG encoder
  over node's `zlib`. No image dependency, and no binary blobs in the repo that
  nobody can regenerate.
- Apple touch icon is 180x180 with no alpha channel. iOS composites
  transparency to black, and it ignores the manifest icons for the home screen
  entirely.
- Maskable icon keeps the glyph inside the 80% safe zone.
- iOS meta tags: `apple-mobile-web-app-capable`, `black-translucent` status bar,
  app title. Without them the app opens inside browser chrome.
- GitHub Actions deploy, gated on the logic tests. Nothing reaches the phone if
  the generator or grader regresses.

**Bug found while verifying.** `base` was keyed on `command`, but `vite preview`
runs as command `serve`, so the built app was served from the root while its
HTML pointed at `/zsudoku/`. Every asset fell through to the SPA fallback and
the service worker refused to register: "unsupported MIME type ('text/html')".
Keyed on `mode` instead. Worth recording because it would have looked like a
working preview right up until the install failed on the phone.

**Verified offline for real**, by stopping the server and reloading rather than
by toggling a devtools checkbox: 81 cells, 33 givens, font served from cache,
timer running, `fetch` to the origin failing, page served by the service worker.

**Verified live**: HTTPS, service worker active at the right scope, 16 entries
cached, manifest standalone with three icons, zero third-party requests.

### To install on the iPhone

Open the URL in **Safari** (not Chrome, which cannot add to the home screen),
Share, then Add to Home Screen. There is deliberately no install banner: iOS has
no `beforeinstallprompt` event, so any banner would be a lie on the one platform
that matters here.

## v0.1.0 - 2026-07-30 - Phase 0, port complete

Tag `v0.1.0`. Runs on `npm run dev`, plays identically to the prototype.

**Ported.** The 705-line single component became a module tree: `logic/` pure and
framework-free, `state/gameReducer.js`, `components/`, `hooks/`, `styles/`.

**Changed on purpose, all recorded in `docs/DECISIONS.md`.**

- Timer is timestamp-based rather than counting `setInterval` ticks. The old one
  drifted and stopped when the phone locked.
- Generator takes a seedable PRNG instead of `Math.random`. Puzzles are now
  reproducible from a seed, which the daily puzzle needs later.
- Pencil marks are 9-bit masks rather than arrays, roughly a tenth of the
  snapshot size for unlimited undo.
- The game is a pure reducer outside React, so every action passes one point.
  The Phase 5 move log becomes a hook rather than scattered instrumentation.
- `lucide-react` dropped, ten icons inlined. Google Fonts link dropped for a
  self-hosted latin-subset IBM Plex Mono, three weights.
- `100dvh` and safe-area insets replace `100vh`.
- Colours live only in `tokens.css`, keyed on `data-theme`.
- Mistake counter added, since Phase 5 needs it and it costs nothing now.
- Where the grader disagrees with the requested difficulty, the status chip now
  says so out loud instead of just showing the graded label.

**Not changed.** The grader is a 1:1 port and still collapses everything above
naked pairs into level 4. Phase 2 replaces it.

**Verified.** 23 logic tests pass. Board renders, selection and peer
highlighting, placement with auto-erase of peer marks, auto-notes, undo
restoring marks and pad counts, pause blur, theme toggle, new game sheet,
autosave and resume across reload. Zero third-party network requests confirmed
in the browser. Production build is 320KB total.

**Baseline** from `scripts/distribution.mjs`, 25 puzzles per tier:

| requested | exact hit | graded as | median ms | worst ms |
|---|---|---|---|---|
| Easy | 100% | Easy 25 | 1 | 3 |
| Medium | 100% | Medium 25 | 3 | 10 |
| Hard | 96% | Hard 24, Medium 1 | 53 | 162 |
| Expert | 100% | Expert 25 | 35 | 154 |

The single Hard miss is the honesty rule working: it is labelled Medium because
it is Medium. Phase 2 gets measured against this table.

## 2026-07-30 - planning

- Read the handoff prototype (`../zsudoku-handoff/reference/zsudoku-artifact.jsx`, 705 lines) and its brief.
- Wrote `docs/PLAN.md`: seven phases, PWA installed on the phone at the end of Phase 1 before any feature work.
- Wrote `docs/DECISIONS.md`: eight decisions taken.
- Zsomb answered the three open questions. Grader gets rebuilt as a full technique ladder, overriding the handoff brief's preserve-1:1 rule. Full move log, plus a coaching layer that turns the analytics into specific recommendations. Deploy target deferred to Phase 1.
- Expanded `PLAN.md` Phase 5 with the coach: technique weak spots, scanning bias, pencil discipline, mistake shape, pace curve, tier readiness, time of day, each tied to an in-app action.
- Wrote `CLAUDE.md` for the project.
