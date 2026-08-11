# Zsudoku decisions log

Newest first. Every entry records what was decided, why, and what it rules out. Open questions live at the bottom until they are answered, then they move up here.

---

## 2026-07-31: Phase 4, the interface

### The board scales by container query, not viewport

Zsomb's report: too small on the Mac, needing zoom; fine on the phone but at
risk of clutter as features landed. The old layout was a fixed 430px column, so
a 27-inch display got a phone-sized game.

The app now grows in three steps (480 / 600 / 1040) and the board grows with it,
up to 642px on a desktop against 402px before. The important part is that
everything inside the board sizes in **`cqw` against the board itself**, not in
`vw` against the viewport. Digit and pencil-mark sizes then hold their
proportion to the grid at any board size, which is what makes one set of rules
serve a 350px phone board and a 642px desktop one.

Rules out: separate mobile and desktop type scales, and any `vw`-based sizing
inside the board.

### Two columns on desktop, and a 3x3 keypad

Above 1080px the controls move beside the board instead of below it, so the
whole game fits without scrolling. The number pad becomes a 3x3 keypad there:
nine across in a 340px column would be 35px targets, and 3x3 is both the
familiar shape and 108px targets.

### A dashboard, because the app was hiding its own features

It used to open straight onto a board, which left the daily, the streaks, the
achievements and the history as things you had to go looking for. Home is now a
dashboard: what is in progress with its progress bar, today's puzzle with its
streak, three headline numbers, and every difficulty one tap away.

Cost: one extra tap to resume. Worth it, and the Continue card is the first and
largest thing on the screen.

### Six themes, every ramp validated

ink, paper, midnight, nord, newsprint, contrast. Each defines the full token set
and its own sequential ramp, and every ramp passed the validator on its own
panel colour: monotone lightness, adjacent gaps >= 0.06, light end clearing 2:1,
single hue. Accent hues sit at least 41.5 degrees apart in OKLab.

`contrast` is light rather than dark deliberately. Ink reaches 21:1 either way,
so the tiebreak is functional: a user-entered digit must be tellable from a
given one. Light gives accent-vs-ink 2.62:1; the dark equivalent only 1.98:1.

### Themes are scoped to `[data-theme]`, not `:root[data-theme]`

So that the theme picker can render a real miniature of the board inside each
card using that theme's own tokens. The swatch cannot drift from the theme
because it **is** the theme.

This was originally written as `:root[data-theme="x"]`, which meant every
preview silently rendered in whichever theme was already active: six identical
swatches.

### A wrong digit is never signalled by colour alone

It carries an error wash and an underline as well as the error colour.

This surfaced from the newsprint theme, where the accent is a brick red and the
error a crimson, so a wrong digit differed from a correct one mostly by chroma.
But colour-only encoding was the wrong answer in every theme, not just that one,
so the second channel is global rather than a patch.

### Motion acknowledges, never delays

Nothing blocks input, everything is under 600ms, and the whole layer is switched
off by `prefers-reduced-motion`. The one genuinely new piece is the flash when a
row, column or box completes: that is the small satisfaction the game runs on,
and nothing had ever acknowledged it.

Hover lifts are gated behind `(hover: hover) and (pointer: fine)`, because on a
touchscreen a hover style fires on tap and reads as a bug.

## 2026-07-31: Phase 6

### Two save slots, not general multi-save

The plan said "multiple saved games". What was actually needed is narrower: the
daily must not destroy a casual game in progress. So there are exactly two
slots, `zsudoku.game.v1` and `zsudoku.daily.v1`, and switching between them is
explicitly not an abandon.

Rules out: a general save-slot system nobody asked for.

### The daily seed is offset from the date seed

`dailySeed` XORs the plain date seed with a constant. Without it, a casual game
seeded from the same date would be the identical puzzle. Cheap insurance
against a coincidence that would look like a bug.

### Difficulty rises through the week

Monday Gentle to Sunday Diabolical, like a newspaper crossword. It gives the
week a shape, and it means the hardest puzzle lands on the day there is time
for it. Sunday's Diabolical can take seconds to generate, which is fine: it is
built in the worker.

### Achievements are derived, never stored

Each one is a pure question asked of the game history rather than a flag written
when it is earned. Nothing can drift out of sync with reality, importing a
backup restores them for free, and adding a new achievement retroactively awards
it for games already played. The cost is recomputing them on each stats view,
which is nothing.

### Sound is synthesised and off by default

WebAudio oscillators, no files: nothing to download, nothing to precache,
nothing to go missing offline. Off by default because a sudoku that makes noise
you did not ask for is worse than a silent one.

It is driven off the move log rather than from the input handlers. The log
already records what happened and whether it was correct, so one effect covers
cell-first input, quick input, hints and auto-complete without touching any of
them.

### Delete history takes two taps

The only irreversible action in the app. One tap arms it and changes the label,
a second confirms, and a cancel appears alongside.

## 2026-07-31: Phase 5, statistics

### Abandoned games are recorded too

A record is written when a game is won and when one in progress is walked away
from. A win rate computed only from wins is not a win rate, and "how often do I
actually finish a Diabolical" is one of the more interesting questions the
history can answer.

Games with zero moves are not recorded: opening the difficulty sheet and
changing your mind is not a loss.

### The move log uses elapsed time, not wall clock

Timestamps are milliseconds since the game started, taken from the same
pause-aware timer the display uses. Wall clock would make every stall look
enormous whenever the phone locked mid-game, which is the same class of lie the
Phase 0 timer rewrite existed to remove.

It is written in the reducer, which is what the single-funnel design from Phase 0
bought: one hook rather than instrumentation in a dozen handlers.

### Puzzle and solution are stored despite being regenerable

Every record is reproducible from its seed, so in principle the boards are
redundant. They are stored anyway: regenerating a Diabolical puzzle costs
seconds, and the pair is about 350 bytes against a 7.6KB record.

### Small multiples instead of a categorical palette

Six tiers on one plot would need six categorical hues. That would fight an app
built on one accent colour, and worse, it buries the only question the chart
answers: is the line going down. One small chart per tier, all in the accent.

The whole stats screen therefore uses a single hue plus a de-emphasis gray. The
only ramp is the calendar heatmap, and it is sequential single-hue.

### The heatmap ramp was validated, not chosen by eye

The first dark-theme ramp failed light-end contrast at 1.55:1 against the panel;
the first light-theme ramp failed at 1.58:1 against white, and two further
attempts failed the adjacent-lightness-gap check. The shipped values pass
monotone lightness, adjacent gaps and contrast in both themes.

Constraint recorded in `tokens.css`: change a ramp value and re-run the
validator.

### The coach withholds

Every insight declares a threshold and reports its sample. Telling someone they
are weak on Swordfish after two games is noise dressed as insight, and once one
claim is unfounded none of the others can be trusted either. When nothing
qualifies, the screen says what is still missing rather than showing an empty
panel.

Every insight also has to say what to do about it. Observations nobody can act
on are decoration.

Rules out: any insight without a stated sample size.

## 2026-07-31: hints fill a cell, teaching moves to the post-game screen

Zsomb weighed a simple hint (put a correct number on the board) against an
educational one (name the technique, point at the unit, then the cell). He
leaned simple, for game flow, on the grounds that "if you want to learn just
check the after game statistics".

Taken, with one correction and one addition.

**Correction: not a random cell.** The hint fills the cell the ladder would do
next. The interaction is identical, one tap and a digit appears, but a random
empty cell may not be derivable from the board yet, so it is arbitrary *and*
fails to unblock anything. The ladder is ordered cheapest-first and restarts
after each success, so its first placement is the easiest move actually
available: the one worth giving away. It also costs less code than picking
randomly, because `nextStep` already existed.

**Addition: record what it stood in for.** Every hint logs its technique. The
hint itself stays silent during play, and the win screen reports "2 hints on
hidden singles, 1 on a pointing pair". That is Zsomb's own suggestion, and it
composes better than an in-game explanation: during a game an explanation
interrupts the thing you are enjoying, afterwards the same information tells you
which pattern you keep failing to spot.

Details:

- Steps past elimination-only moves. A hint has to put a number on the board to
  be worth a tap.
- Verified against the solution before being applied. A wrong digit already on
  the board poisons the candidate sets, so the ladder can be confidently wrong;
  in that case it falls back to the most constrained empty cell and records
  `derived: false`.
- Always places, even in notes mode. Pencilling a hint in would not be a hint.
- Marked on the board until the next move, otherwise a hint reads as nothing
  having happened.
- Undoable, and never counted as a mistake.

Rules out: escalating multi-level hints, and any in-game technique explanation.
The `detail` sentence each technique returns is still produced and still tested;
it is simply not shown during play. It is there for Phase 5.

## 2026-07-31: quick input keeps the keyboard cell-first

Quick input arms a digit and fills whatever cell you tap. The obvious question
is what a digit *key* should then do: arm the brush, matching the mode, or place
into the selected cell, matching every other keyboard sudoku.

It places into the selected cell, in both modes.

Reason: the mode exists to save taps on a touchscreen, and a keyboard has no tap
to save. Arrow keys plus digits is already the fastest possible input, and it
needs no brush. Making digit keys arm instead would mean the same keystroke did
different things depending on a setting that was toggled on a phone, which is
the kind of hidden state that makes an app feel unpredictable.

So the mode changes what a **tap on a cell** does, and nothing else. `Q` toggles
it, `Escape` disarms.

Rules out: a keyboard-driven brush, and any future divergence where the two
modes handle placement differently. Both route through one `placeDigit` helper
in the reducer for exactly that reason.

Also decided: with no digit armed, quick input behaves identically to
cell-first. Without that there would be no way to just look at a cell, and
tapping to inspect is something you do constantly.

## 2026-07-31: auto-complete uses the strict trigger

Zsomb's call, and the reasoning is worth keeping because it corrects the way the
choice was originally framed.

The two candidates were strict (every remaining cell has exactly one candidate
right now) and cascade (the rest falls to naked singles, each revealing the
next). Cascade was presented as closer to "no thinking left". It is not. Cascade
still asks the player to notice which cell has become forced, and a cell being
forced is not always visible: a cell can hold several pencil marks while some
digit has only one home left in its box. Noticing that is a hidden single, which
is a genuinely harder spot than a lone candidate, and it is thinking.

Strict fires only when there is nothing left to notice at all.

Two implementation choices follow from the same principle:

- The trigger reads the **true candidates**, not the player's pencil marks. If
  it read the marks, the button would appear or not depending on how thoroughly
  they had pencilled, which makes an objective property of the board look like a
  reward for bookkeeping.
- A contradiction on the board fails the single-candidate test, so a wrecked
  board never offers to finish itself.

Rules out: the cascade trigger, and any setting toggling between the two. One
correct answer, not a preference.

### Measured gap, 2026-07-31

Zsomb noted the button fires later than the equivalent in sudoku.com, and
guessed it was because our rule is stricter. Measured with
`npm run calibrate -- autocomplete`, walking each solve in the grader's order:

| tier | strict p50 | cascade p50 |
|---|---|---|
| Gentle | 6 | 36 |
| Easy | 7 | 29 |
| Medium | 6 | 29 |
| Hard | 5 | 26 |
| Expert | 5 | 31 |
| Diabolical | 6 | 27 |

Overall median 5 cells left for strict against 29 for cascade. The guess was
right in direction, and the gap is large.

Cascade is very generous: on Gentle it would appear with 36 of 45 blanks left,
which is most of the puzzle. There is no principled trigger in between the two,
since "forced now" and "forced eventually by lone candidates" are the only two
natural definitions.

No claim is made here about what sudoku.com actually implements.

### Resolved: capped cascade at 12

Zsomb chose the cap. `AUTO_COMPLETE_MAX = 12`: the rest of the board must fall
to lone candidates **and** at most 12 cells may remain.

The number is arbitrary and the code says so. It is a dial, not a discovery.

Worth understanding what it actually produces: the cascade condition, once true,
stays true as long as you keep filling correctly. Since cascade becomes true
around 29 cells, capping at 12 means the button appears the moment the board
drops to 12. Measured across all six tiers, shipped p50 and max are both exactly
12, and it never fails to appear. So in practice this is "the last 12 cells",
with the cascade check acting as the guard that stops it offering on a board
that still needs real work.

That supersedes the strict trigger in the section above. The reasoning about
hidden singles still stands and is why the cap exists at all rather than plain
cascade: without it, the button would appear while a third of the puzzle is
still open.

Button copy changed from "every cell is forced" to "only lone candidates left",
because under the capped rule the cells become forced in turn rather than all at
once, and the old wording would have been false.

## 2026-07-30: Phase 2, the scoring model

### Naked singles cost nothing, and that is the whole fix

The first attempt at weighted scoring priced every technique by difficulty,
naked singles included at 10 apiece. Calibration killed it immediately. Sampling
520 grids, the median score climbed smoothly from 360 at 46 clues to 611 at 22
clues, in lockstep with the clue count and almost independently of which
techniques the puzzle needed.

The reason is arithmetic: a puzzle contains 81 minus clues placements, and if
each one carries a cost then the score mostly counts blank cells. A trivial
22-clue puzzle outscored a genuinely hard 34-clue one. That is the same
dishonesty the Phase 2 rebuild exists to remove, wearing a different hat.

Writing a digit that has only one possible value is bookkeeping, not deduction.
It is not what makes a sudoku hard. So naked singles now cost zero and hidden
singles cost very little, because scanning is the basic motion of the game
rather than a skill that separates tiers. First-use costs are far larger than
repeat costs, so the hardest thing you have to *spot* sets the tier and repeats
refine within it.

The regression test that guards this asserts naked-singles-only puzzles score
exactly 0 regardless of clue count. If that ever fails, the scale is measuring
board size again.

Rules out: any future cost table where routine placements carry weight.

### Nothing that needs a guess ever ships

Every tier rejects puzzles the ladder cannot finish, and the generator puts a
clue back rather than shipping one. Measured across the calibration run, zero
unfair puzzles reach the caller.

This is the concrete meaning of "honest difficulty". The old grader labelled
guess-only puzzles "Expert", which made Expert a bucket for broken puzzles as
much as hard ones.

### One function grades puzzles and explains moves

Each technique returns a structured step: which technique, which cells, which
unit, what it eliminates, and a sentence describing it. The grader and the
Phase 3 hint button call the same function, so a hint can never contradict the
difficulty rating. The soundness test asserts no technique ever eliminates a
candidate that belongs to the solution, which guards the rating and the hint
text together.

### Generation moved to a Web Worker

The full ladder digs and re-grades repeatedly, and Diabolical can take nine
seconds. Verified in the browser by comparing timer jitter at idle against
jitter during generation: identical, so the main thread is untouched.

One ready puzzle per tier is generated ahead in localStorage, so New Game is
usually instant even at the top tier.

### The grader carries a version number

Scores are only comparable within one version of the ladder, and puzzles are
cached with their tier baked in. `GRADER_VERSION` is part of the cache key and
is stamped into saves; a saved game from an older grader is regraded on load.
Without it, a cached puzzle would keep showing a label from a scoring system
that no longer exists.

## 2026-07-30: what this project is for

Zsomb's own words: he loves sudoku and is tired of ads and paywalled features,
so he is building the one he wants. It is for him, on his phone and his Mac.

Three standing constraints follow from that, and they outrank any feature:

1. **Nothing gets paid for.** Free hosting, free tooling, no App Store, no
   developer account, no native wrapper. A PWA is the whole delivery mechanism.
2. **Maintenance has to stay near zero.** Every dependency is a future chore, so
   the dependency list stays at seven and nothing gets added without a real
   reason. No CI beyond a deploy, no update bots, no services with a dashboard
   to check.
3. **No audience.** No sharing, no accounts, no leaderboards, no telemetry, no
   error reporting. One player.

Rules out: anything that would need a paid tier to keep working, and any
"engagement" feature that assumes other people exist.

## 2026-07-30: initial decisions from reading the handoff

### Project lives in its own repo, handoff stays read-only

`zsudoku/` is the real project. `zsudoku-handoff/` is never edited: it is the source of truth for what the working prototype did, in case a port introduces a regression. Same pattern as `the_other_4/` in the GNL folder.

Rules out: editing the artifact in place, losing the reference.

### Stack held from the handoff brief

Vite plus React, plain JS, `vite-plugin-pwa`, no UI framework, git from commit 1. No reason found to deviate.

### lucide-react dropped, icons inlined

The prototype imports ten icons from `lucide-react`. Inlining them as local SVG components removes a dependency and keeps the "no third-party anything" story clean. Ten icons is not a burden.

Rules out: an icon library, and any future temptation to pull more from it.

### Timer rewritten to timestamps, not interval ticks

The prototype increments a counter on a one-second `setInterval`. That drifts, and it stops entirely when the phone locks or the tab is backgrounded, so recorded times would be shorter than reality. Since statistics are a headline feature and the whole product positions itself on honesty, the timer has to be honest too. Accumulated `performance.now()` deltas plus a `visibilitychange` auto-pause.

Rules out: trusting any time recorded by the current prototype. Existing best times do not carry over.

### Seeded PRNG replaces Math.random in the generator

Costs nothing in Phase 0 and is the only route to daily puzzles, reproducible bug reports, and sharing a puzzle by seed. Retrofitting it after the generator has grown would be much worse.

### Storage split: localStorage for state, IndexedDB for history

Settings and the single in-progress game stay in localStorage, because a synchronous read on boot means no flash of empty board. The completed-game log goes to IndexedDB, because a game record with a move log runs to roughly 12KB and a few years of daily play would exceed the localStorage ceiling.

Note this contradicts the handoff brief's "IndexedDB is overkill". That was correct for game state alone and stops being correct once there is a game history.

### Ship the PWA before building features

Phase 0 and Phase 1 come before difficulty, stats, themes and everything else. The service worker updates itself, so every later phase reaches the phone on its own. Building six phases of features before the first install would mean a long stretch with nothing playable on the device it is actually for.

### No network requests, ever

No fonts from Google, no CDNs, no analytics endpoint, no error reporting. Self-hosted font, inlined icons, local-only analytics. This is a hard constraint, not a preference: the app has to work in airplane mode and there is nobody to send data to.

---

### Difficulty grader gets rebuilt, overriding the handoff brief

The handoff brief says preserve the game logic 1:1 and do not improve the algorithms, noting the grader tested at 20/20 on target. Zsomb's ask for this build says "proper honest difficulty levels". Asked which wins, he chose the rebuild.

Reason it matters: the current grader collapses everything above naked pairs into a single level 4, so "Expert" means "our three techniques ran out". It cannot tell a puzzle needing one clean X-Wing apart from a puzzle that can only be finished by guessing, and it ships both under the same label. A puzzle that needs guessing is not difficult, it is defective.

Rules out: the 20/20 result from the prototype as a benchmark. It gets replaced by a new calibrated distribution measured across several hundred generated puzzles per tier. The old grader stays readable in the handoff folder for comparison.

### Full move log, and a coaching layer on top of it

Every action gets timestamped into the game record: cell, value, kind, whether it was correct. Roughly 12KB per game, IndexedDB.

Zsomb additionally asked for recommendations on top of the analytics. This is the reason the move log is worth its weight: the grader already records which techniques each puzzle required, and the move log records what was actually done and where the time went. Cross-referencing the two produces genuine coaching instead of vanity metrics. Detail in `PLAN.md` Phase 5.

Rules out: localStorage for the game history, and any summary-only data model that would have to be migrated later.

### GitHub Pages from a public repo

Resolved at Phase 1. Live at https://zsombp.github.io/zsudoku/, repo
`zsombp/zsudoku`, deploying from `main` on push.

Chosen over Cloudflare Pages and Vercel because it is the only option with no
new account, no extra dashboard and nothing that can lapse. `gh` was already
authenticated. Free Pages requires a public repo, which for a personal sudoku
costs nothing; nothing personal goes in the repo.

Rules out: private source, and any hosting feature that would need a paid tier.

### base is keyed on mode, not command

`vite preview` runs as command `serve`, so `command === 'build' ? '/zsudoku/' : '/'`
served the built app from the root while its HTML pointed at `/zsudoku/`. Assets
fell through to the SPA fallback and the service worker refused to register.
Keyed on `mode === 'development'` instead.

Worth recording because a broken base looks like a working preview right up
until the install fails on the phone.

### The move classifier grades justification, not brilliance

Resolved at v1.5.0, when the review gained a per-move report.

Chess reviews work because an engine can say what the position offered. The
technique ladder does the same job here, so the natural move was to reuse it.
What did not carry over is the axis. In chess a move is better for being harder
to find; in sudoku a placement is either justified by the board or it is not,
and a hard-won deduction and a lucky guess can put the same digit in the same
cell. So the classes measure "could you know this at the moment you played it",
and a correct-but-unproven placement is called Lucky rather than praised.

The consequence worth remembering: **Sharp must be earned, never assumed.** It
began as the fallthrough branch, which classed a digit dropped on an empty grid
as brilliant deduction. It now runs the ladder's eliminations and only holds if
they turn the cell into a lone candidate or a hidden single.

Rules out: any scoring that rewards difficulty for its own sake, and any
classifier that reads the player's own pencil marks as evidence. Marks are what
someone believes, and the whole question is whether the board agreed.

### Candidates are re-derived, never read from the board alone

`createState` computes candidates from the placed digits, so every elimination
established by a pointing pair, a claiming pair or a subset is absent. Anything
asking "was this derivable" has to replay those eliminations first, or it will
report that moves the ladder itself derived were unprovable.

This was found by `scripts/classcheck.mjs`, which is the pattern to reach for
whenever a judgment call gets automated: run two players whose results must
differ, not one whose results look plausible. A ladder-perfect player must score
zero Lucky and zero Mistake, and a reading-order player must score Lucky often.
A classifier that always answers the same thing passes either test alone.

### Giving up is recorded as a loss

Resolved at v1.5.0. Abandoning by starting a new game was already recorded, but
there was no way to say "I am done with this one" and see the answer.

Forfeiting records the game with `completed: false, forfeited: true` and reveals
the solution at render time. The board is never written to: the move log stays a
record of what was actually played, so the review still works on a game you gave
up on. The save slot's `completed` flag means "over, do not resume" rather than
"won", so a forfeited game does not come back as a game in progress.

Rules out: a give-up that silently discards the game, which would make the win
rate a measure of how often you remembered to quit cleanly.

### The clock runs only where the game is

The timestamp clock was always right, and stays. What was wrong was the
condition: `status === 'playing'` only ever meant "not paused", so the clock ran
on the dashboard, in statistics and in settings. It now also requires the game
view to be the one in front of you.

Recorded because the obvious diagnosis was the wrong one. Every statistic in the
app divides by this number, and the bug looked like a timing bug while being a
scoping bug.

### GitHub backup is an exception to the no-network rule, stated as one

Resolved at v1.6.0. Browser storage gets evicted, `navigator.storage.persist()`
is a no-op in Safari, and the manual export is the kind of thing that happens
once and then never. The history was one cache purge from gone.

Backing up to a repository Zsomb owns is not what "no third-party requests" was
defending against, but it is a violation of it as written, so `CLAUDE.md` now
carries the exception explicitly with the bar a second one would have to clear:
opt-in, the user's own infrastructure, useless to anyone else, and nothing in
the app may depend on it.

Three decisions inside it worth keeping:

- **The token has its own storage key.** Settings get exported, pasted into
  notes and read by anything that knows the key. A write token has no business
  travelling with them, so it does not share their container, and the export
  path cannot reach it.
- **The token is only saved once GitHub confirms it works.** "Saved" is not the
  same as "works", and a backup you believe in that has been failing silently
  for three weeks is worse than knowing you have none.
- **Sharded by month.** A game record runs about 7KB with its move log, so a
  single file outgrows what the contents API returns in one read within a few
  hundred games. Monthly files also make an evening's push tiny.

The merge is a union by game id and already computes what the remote holds that
this device does not, which is exactly what two-way sync would apply locally.
Sync was deferred, not designed out.

Rules out: any dependency on the network for normal operation, a classic
repo-scoped token, and last-write-wins on a whole-history file, which would
silently lose games the moment a second device existed.

### A review must draw its evidence, not assert it

Resolved at v1.6.0, after the first version of the move report shipped without
candidates on the board. It would say "r3c1 still showed 2/3/6" over a grid that
showed no candidates at all, so every claim had to be taken on faith. That is
the one thing a review cannot be.

The consequence that cost the most to get right: **a pattern must be drawn over
the candidate state it was found in.** A naked quad discovered after a pointing
pair has cleared the way does not look like a quad on the raw board, and the
first attempt outlined four cells whose visible candidates contradicted the
label. The candidate set is now carried with the pattern, and the panel says
when what is on screen includes eliminations.

Rules out: rendering any pattern against `createState` candidates, which are
peer-only and therefore not what most techniques operate on.

### Stale notes are measured against everything the ladder proves

The game only erases pencil marks when you place a digit. Anything killed by a
pointing pair or a naked pair sits in your notes looking valid for the rest of
the game, and that is the mark most worth knowing about.

Finding them by comparing against the naive candidate set finds almost nothing,
because that set is also peer-only. `settledCands` runs every elimination the
ladder can make to exhaustion, and the difference against the reconstructed
notes is the answer. Computed only for the position on screen, so the ladder run
costs a few milliseconds rather than being paid per move.

The wording matters and was chosen deliberately: some of those eliminations take
a real pattern to see, so the copy reports what the board knew rather than what
the player should have spotted.

### Marks are reconstructible, but snapshot restores had to start recording

Every rule that changes a pencil mark was already derivable from the log except
one. Undo, redo and returning to a bookmark restore a whole position, and only
the board half was ever written down, so the marks went unknowable after the
first undo.

Those entries now carry a mark diff alongside the board diff. Games recorded
before this replay approximately after the first undo, and `stateAt` reports
that rather than hiding it, which is the same principle as `requested` versus
`graded`: when the app cannot be certain, it says so.

### The hint explains before it answers, and only if asked

Resolved at v1.7.0. Phase 3 asked whether the hint should be a digit or a
lesson, and the answer was the digit: it is better for flow, and the post-game
review is where learning belongs. That still holds, so this does not replace it.
It adds a rung below: the first press points at the pattern, the second gives up
the digit.

Practice mode forces it on. A drill whose hint hands you the answer is not a
drill, and practice is the one place where interrupting flow is the point.

The consequence worth keeping: **the explanation and the grader are one piece of
code**, now in `src/logic/explain.js`. The review asking "why was this move
justified" and the hint button asking "why is this the move" are the same
function, for the same reason the grader and the hint engine always were. Two
implementations of "why" could give a player two different answers about the
same board.

Rules out: a hint that describes a pattern in words only, which is useful only
to someone who can already find one, and any second copy of the deduction logic.

### Worked examples come from the player's own grid

The practice screen can explain an X-Wing in the abstract. The Patterns tab
shows the X-Wing that was in the puzzle just played, at the position it came up
in, because that board has already had ten minutes of attention spent on it.

Singles are skipped. A worked example of "this cell had one candidate left" is
not an example of anything.

Rules out: a static illustrated glossary, which would be a second source of
truth about what a technique looks like and could drift from the ladder.

### Time and judgment are only interesting crossed

The review showed a gap and a class side by side for a version and never
compared them. Everything useful is in the crossing: a long think before a move
that was always available is a scanning problem, an instant placement nothing
proved is not thinking at all, and a long think before a genuinely hard move is
time well spent and worth saying so.

Thresholds are relative to the game's own median rather than absolute. An
absolute cutoff tells a fast player they stalled constantly and a slow player
they never did.

### A shipped feature that never reaches the device did not ship

Resolved at v1.7.1, after the GitHub backup was reported missing from a build
that demonstrably contained it. The bundle on GitHub Pages had it; the installed
app did not, because `autoUpdate` gives a new service worker control without
touching the page that is already running.

Two lessons worth keeping:

- **"Deployed" is not "delivered" for a PWA.** Verifying the live bundle
  contains a string proves the deploy, not the delivery. An installed app is the
  place to check, and it is the place that is hardest to check.
- The app now reloads when a new worker takes control, and asks for an update on
  every return to the foreground. Reloading is only acceptable because the game
  persists its whole position on every change; in an app where it was not, this
  would need a prompt instead.

Rules out: any update strategy that depends on the user knowing to reload, and
any assumption that a green deploy means the feature is in front of anyone.

### A cache of what was sent is not a record of what is there

Found at v1.7.2, when a shard deleted on GitHub was skipped by every subsequent
push. The per-shard fingerprint answers "has this month changed on this device",
and the push was reading it as "is this month already backed up". Those differ
the moment anything touches the other end.

The fix is not to abandon the cache, which is what keeps a push after an evening
of play down to one small file. It is to stop trusting it indefinitely: once a
day every shard is checked against the remote, which writes nothing when all is
well.

The general form is worth remembering: **any optimisation that skips work based
on local state is asserting something about remote state, and needs an expiry.**

### Deleting one game, and what that does not do

Added at v1.7.3. Until then the only delete was "everything", which meant a
single test or misclicked game left a choice between a wrong median and no
history.

Two things stated rather than assumed:

- **Deletes do not propagate to a backup.** The merge is a union by id, so a
  game already pushed stays in that shard until the month is written again. The
  notice says so instead of implying the record is gone everywhere.
- **The repository is the safety net.** Every push is a commit, so a game
  removed by mistake is recoverable from git history. That is worth knowing
  before reaching for a delete, and is a real argument for having the backup on
  before doing any tidying.

### Sync is a union, plus tombstones, because a union alone cannot delete

Resolved at v1.8.0. Merging by game id is safe and needs no coordination: ids
are `endedAt-seed`, two devices cannot mint the same one, and nothing is ever
lost by playing in two places. That covers everything except removal.

A union has no vocabulary for absence. A game deleted on one device is simply a
game the other device still has, so the next sync restores it, and the one after
that restores it again. With a delete button in the app this is not a corner
case; it is the first thing anyone would try.

So each month's file carries the ids deleted from it and both ends honour the
list. Three details that matter:

- **A tombstone lives in the month of the game it refers to**, not in every
  file. The alternative bloats every shard with every deletion ever made.
- **It expires after a year.** By then every device has read it many times, and
  a tombstone outliving all memory of the game is just a file that grows.
- **The local pending list is cleared only once the file that must carry it has
  been written.** Clearing on any successful pass would drop a deletion that
  never reached the repository.

Rules out: last-write-wins on a whole-history file, which loses games the moment
two devices exist, and any scheme where deleting requires touching both devices
by hand.

### The repository listing is what makes it sync rather than backup

A device pushes the months it has. A device that has never played in August has
no August shard and would never think to look for one, so the phone's August
would never reach the Mac. A full pass lists `games/` first and pulls what it
finds.

That listing is the whole difference, and it is why the routine post-game path
and the foreground path are not the same call: after a game only the current
month is touched, which is one small file, while coming back to the app does the
full pass.

### The classification is stored, because measuring said it had to be

Resolved at v1.9.0. The obvious implementation is to classify on demand: the
move log is on every record and `analyseGame` is pure. Measuring first killed
that. Aggregate statistics and the coach run in single-digit milliseconds even
at a thousand games, but classifying every move of every game costs 3.7 seconds,
and it would be paid on every visit to the statistics screen.

So each record carries its own summary, written when the game ends. About 190
bytes against a record that is already seven kilobytes, and aggregating them is
then addition.

Two things that keep it honest:

- **The summary is versioned twice**, by its own version and the grader's.
  Change how the app classifies, or change the ladder, and old summaries are
  recomputed rather than averaged in alongside new ones. Silently mixing two
  definitions of "lucky" would be exactly the kind of dishonest statistic this
  app exists to avoid.
- **It stores aggregates only, never per-move detail.** The move log is already
  on the record and the review recomputes from it. Storing both would be storing
  the same thing twice and inviting them to disagree.

Rules out: computing classification on demand for anything that spans games, and
any summary that outlives the definition it was computed under.

### False beliefs are notes that went stale, not notes that are wrong

Resolved at v1.10.0. The natural definition of a false belief is "a note the
board had ruled out", and measuring killed it before a line of interface was
written: auto-pencil writes peer-scan candidates and the ladder is stricter, so
53 of 158 notes on a Hard grid are dead the moment the button is pressed. That
definition blames the player for the app's own candidate set.

The definition that means something is narrower. A note that **was** true and
**became** false while it was kept. That is the belief that gets reasoned from,
and the only one the player could have been expected to notice.

Notes that were never possible even by a peer scan are kept separately and
called misreads, because writing something impossible is a different error from
failing to notice the world moved.

The summary needed the same care. Adding the durations of overlapping beliefs
reported two and a half hours inside a seven minute game. It reports the union
instead, plus the worst number wrong at the same time, both of which are things
a person can check against their own memory of the game.

Rules out: any measure of "wrongness" that counts what the app itself wrote, and
any total that adds overlapping intervals.

### A permutation test, and three guards against flattering it

Resolved at v1.11.0. The test is a permutation test rather than a t-test because
solve times are skewed and the samples are tiny, and rather than any table
because the method explains itself: reshuffle which games were in which half ten
thousand times and count how often the gap is this big. Someone can check what
that means without trusting a formula.

Validated before any interface was built, by simulating the null: at p<0.05 it
fires 5.2% of the time and at p<0.01 it fires 1.3%, which is what a sound test
does. A miscalibrated test here would produce confident nonsense indefinitely.

The same simulation set the sample size. Twenty games catch a one-fifth
difference only 27% of the time, so twenty was raised to thirty, and the
remaining limit is stated in the interface rather than left for the player to
discover. **A null result that does not declare its own power is the most common
way an honest-looking experiment misleads**, and this app cannot afford that
particular dishonesty.

Three guards, all of them about not fooling yourself:

- The deciding outcome is declared before the first game.
- No verdict until the declared number of games is in, because optional stopping
  manufactures significance.
- The p-value is seeded from the game ids, so it cannot be re-rolled.

Rules out: reporting whichever of several measures came out best, any verdict
computed mid-run, and any claim of no effect without a statement of what size of
effect could have been seen.

### Wiring an experiment is how you find a setting that does nothing

`autoPencilOnStart` sat in the defaults from Phase 6 to v1.11.0, read by no code
and shown on no screen. Nothing failed, because nothing ever asked it anything.

It was found only because an experiment was built to vary it, which would have
spent thirty games measuring a disconnected switch and reported a null. Worth
remembering as a class of bug: a setting with no reader is invisible to tests,
to types and to review, and the thing that catches it is code that depends on it
having an effect.
