# Changelog

Newest first.

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
