# Zsudoku decisions log

Every entry records what was decided, why, and what it rules out.

**The order is not newest first, whatever this line used to claim.** The phased
build sits at the top as dated sections, newest phase first. Everything after
the phases is appended at the end, in the order it was decided, so the newest
decision in the project is the last one in the file. That was the actual habit
of every agent that has written here, and it is worth keeping: appending never
has to guess where a new entry belongs, and a reader walking down the file walks
forward through the argument. There is no separate section for open questions;
where one is open, the entry says so.

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

### Anything the app changes on your behalf has to admit it

Added at v1.11.2. The experiment flips one assist at the start of each game, and
the settings screen showed that switch as if the player owned it.

Two failures, and the second is the serious one. A control that changes by
itself with no explanation is alarming. A control that can be changed by hand
while something else depends on its value is a data bug: the game plays one way,
the record claims the other, and the experiment reports a result drawn from
games that were not in the arm they say they were.

So it is locked while a run is going, and it says who is holding it and where to
take it back. The general rule for this app: if the app sets something for you,
the screen that shows it must say so, and must not let you fight it silently.

### A variant is a topology, and that is the whole design

Resolved at v2.0.0. The question was whether variants meant forking the engine.
They did not, because of a property the code already had: the twelve techniques
reason about "units" and "peers" and never about arithmetic on three. One line
assumed square boxes, `claiming` asking `boxOf(cell)`, and it was the only one.

So units and peers became data. Everything above that line, the grader, the hint
engine, the explanations, the move classifier, belief archaeology, works on any
of them without knowing which it got.

The line this draws is worth keeping. **A variant expressible as different units
and peers is nearly free. A variant needing arithmetic is a project.** Killer
cages and thermometer orderings are not sets of nine cells holding nine digits,
so they need new constraint types and new techniques.

Killer was built at v2.18.0 and v2.19.0 and the estimate held: it took its own
solver, its own generator and five new rungs, against zero new code for the four
topology variants. Thermometers, arrows, kropki dots and sandwich sums are still
unbuilt and are each the same size of job. Read the killer entries below before
starting one.

Rules out: any per-variant copy of a technique, and any rendering that decides
where the heavy rules go by its own arithmetic rather than by asking the
topology.

### Build the shapes and the solution together, not one then the other

The jigsaw generator failed twice before this, and both failures were silent
fallbacks to square boxes, which is the worst possible way to fail: the variant
would have shipped as classic sudoku with a different name.

The lesson underneath is about ordering. Generating a constraint structure and
then searching for something that satisfies it invites a structure nothing
satisfies, and proving that is far more expensive than finding a solution when
one exists. Generating both together, by only accepting mutations that preserve
validity, makes the search unnecessary and failure impossible.

Also worth keeping: **this search is heavy-tailed.** A run either succeeds in a
couple of hundred steps or thrashes for tens of thousands, and that is true even
when a solution certainly exists and only the random ordering was unlucky.
Abandoning a slow run and reshuffling beats letting it grind, which is why the
grid filler has a step budget and restarts rather than just better ordering.

### Difficulty bands did not need recalibrating per variant

Measured rather than assumed, and the result was better than expected: every
variant at every tier lands in the band requested, uniquely solvable and
solvable by pure logic, on the bands calibrated for classic.

That falls out of scoring deduction rather than board size, the decision made
back in Phase 2. The techniques a puzzle needs cost the same whatever shape the
regions are, so "Hard" means the same amount of thinking on a jigsaw as on a
classic grid. Clue counts differ a lot and should: an anti-knight Medium needs
twenty clues where classic needs twenty-nine, because the extra constraint is
doing some of the work. Clue count was never the target.

### A tooltip is not an explanation on a touch screen

Fixed at v2.0.1. Thirteen `title` attributes had been written across the app,
and every one of them was invisible on the iPhone, which is where most games are
played. They were not bad explanations; they were unreachable ones, and nothing
in a build or a test can notice that.

Tools explain themselves on press and hold, matching the idiom the board already
uses for tinting. Compact glyphs get a visible legend. Labels with room say the
thing outright. `title` stays everywhere it was, as a bonus for a pointer, and
is never the only route.

The general rule, and the reason this is written down rather than just fixed:
**an explanation reachable only by hovering does not exist on the device this
app is for.** Any future help text has to be readable with a thumb.

### A race counts the cells that are right, not the cells that are filled

Added at v2.11.0, with ghost racing. The obvious progress count is "cells that
are not empty", and measuring killed it before any interface existed: on a Hard
game with wrong digits left standing, that count and the honest one disagree at
59% of board changes with two wrong digits down and 85% with five, and the gap
is exactly the number standing.

That matters here more than it looks, because a race is decided by one, two or
three cells. The error is the same size as the signal, and it points the wrong
way: you would be told you were two cells ahead precisely because two of your
digits were wrong. So a cell counts once it holds the digit the solution has.

The consequence for anything that races: **both sides must count with the same
function.** `progressOf` is exported for the live board rather than left to the
caller, because the natural thing to write there is `board.filter(Boolean)`,
which includes the givens and would report the player a clue count ahead for a
whole game while nothing anywhere looked broken.

Rules out: any progress measure that credits a digit the board disagrees with,
and any second count of "how far along am I" living in a component.

### A ghost is a scalar over time, and reuses the replay it came from

A replay wants every cell and every mark. A race wants one number it can compare
sixty times a second, so a ghost is exactly that: the filled count as a function
of the clock, plus the same timeline read backwards to answer "when did it reach
this many". The counts are not sorted, since a ghost that erases a correct digit
goes backwards, so that second direction is precomputed rather than searched.

The timeline is built by asking `replay.js` for the board at each move rather
than folding the log again here. Folding it here measured 0.01ms against 0.11ms
per ghost, and the tenth of a millisecond is the right thing to spend: the
alternative is a second description of what an undo does, free to drift from the
first, for a saving nobody can perceive.

Also decided: **the ghost reports the gap in cells and the gap on the clock.**
Cells are not equal, level on cells is often five seconds down, and the clock
half is the one that still moves while both players are stuck on the same cell.

### A league is one file per player, and nobody merges anybody else's

Added at v2.12.0. The game log needs a union merge with tombstones because two
devices write the same months. A league does not: a player writes only
`league/<name>.json`, so no two people ever touch the same path and there is
nothing to reconcile. The only collision left is one player on two devices,
which is a union by day rather than by game id.

It is also not sharded, and that is measured rather than assumed. A league entry
is 128 bytes at its widest against 7KB for a game record, so a year is 47KB and
the 1MB the contents API returns in one read lasts about a decade. The reason
`games/` is sharded is the move log, and a league file does not carry one.

The rule that keeps a published result honest: **a result that has been
published stands, and the only thing that can replace it is finishing a day that
was published unfinished.** Otherwise a second device could improve a time on a
puzzle it had already seen. The same rule picks between several local attempts
at one day: the first completed attempt counts, never the fastest.

Rules out: a shared results file anyone can write, best-of-several-attempts, and
any merge that lets a later attempt at a seen puzzle overwrite an earlier time.

### Comparing two people means proving they played the same puzzle

The daily is derived from the date, so everyone gets the same grid with nothing
sent anywhere. That is the whole reason a league works with no server, and it is
an assumption rather than a fact: a friend on an older build, or one from before
the boards rotated through the week, plays a different puzzle on the same date.

So an entry carries the seed, the board and the tier the grader gave, and a day
where those disagree is excluded and reported instead of compared. Only the
fields actually present are compared, so a client that records less than this
one does not make a day uncomparable.

This is the same class of failure as a code that rebuilds a different puzzle:
every number still computes and every one of them is meaningless. Nothing fails,
and nothing looks wrong.

Also stated rather than left implied: **nothing here can verify a time.**
Everyone writes their own file and there is no referee. That is the price of no
server, and the interface should not pretend otherwise.

### A missed day is not a loss, and a raw median is not a ranking

Two people in a league almost never play the same set of days, and both halves
of that need handling.

**Missing a day costs nothing.** It appears in no denominator: wins, days
contested and days finished all count only days you turned up for. A day only
one person played is not a win, since winning a race you were the only entrant
in is not winning, and a day two people played where only one finished is a win,
since the other player was there.

**A median over different days compares nothing.** Measured across three weeks
of real dailies, Monday's Gentle scores 0 and Sunday's Diabolical a p50 of 1830,
the full width of the scale. Played out over a generated week with three
players, the one who skipped the two hardest days had the best median in the
league at 360s against the winner's 420s, having lost every day they contested.
So the comparable column is `pace`: your time against what that day cost
everyone else, median over the days you contested. The raw median stays, because
it is the number people want, and it decides nothing.

**A streak belongs to a player, not to a window.** It is computed over the whole
history even when the table shows seven days, and it is judged against the
player's own last day when that is ahead of ours. The daily is keyed on the
local date, so a friend six hours ahead publishes a day before we reach it, and
the existing "today or yesterday" grace reads a future day as no streak at all.
Measured: the same three day run scores 0 against our today and 3 against
theirs.

Rules out: ranking on a raw median, any denominator that includes days a player
was absent for, and any statistic in a league table that is silently truncated
by the period being viewed.

### A question is a phrasing of a step, never a second opinion

Resolved at v2.13.0. Socratic hints could have been written as their own reading
of the board, and that would have been a second deduction path: the question
could point at a pattern the grader does not rate and the hint does not use.
Instead there is one phrasing per technique over the step `nextStep` already
returns, which is the same rule that keeps the grader, the hint and `explain.js`
as one piece of code.

One phrasing per technique rather than one for all of them. A question that fits
every technique ("what can you see here?") points at nothing, and the point of
the rung is to point.

**The question names a unit or a digit and never a cell.** A question that names
the cell is a hint with a question mark on the end, and it leaves the two rungs
above it, the pattern and the digit, with nothing to reveal.

The naked single needed a decision, because it is the only placement that
carries no unit: it is proved by its peers, not by any one unit, so the question
has to choose where to send you. Naming the region is the natural scanning
motion and gives the answer away 22% of the time, measured over 1637 naked
singles on real solve paths, because the region holds exactly one blank. Choosing
the widest unit containing the cell drops that to 3.7%, and those are cells that
are the last blank of their row, their column and their region at once, where
there is nothing left to protect.

### Asking again has to be able to move on, and only over eliminations

An elimination step changes no digit, so a caller that rebuilds from the board
gets the identical question next time it asks. That is why `askAbout` takes a
`skip`, and measuring turned it from a nicety into the main path: at skip zero
only six of the twelve rungs can ever be the question, and every hidden pair,
naked triple, hidden triple and swordfish seen across 9090 questions was behind
at least one skip.

It never walks past a placement. Behind a placement is a board with a digit the
player has not written, and a question about a position they cannot see is worse
than no question. Everything reached through a skip carries the candidate state
it was found in and the techniques it assumes, for the same reason the review
draws a pattern over the candidates it was true in rather than the raw board.

Rules out: any question about a position the player is not in, and any escalation
that re-asks the ladder for each rung, which could describe one move and then
draw another.

### The teaching rungs need the same guard against a wrong digit as the hint does

`hintPlacement` checks its answer against the solution because a wrong digit
poisons every candidate set. A question needs it more, not less: a hint that is
wrong is one wrong digit, while a question that is wrong sends someone hunting
for a pattern that does not exist and teaches them that they cannot see patterns.

Measured by planting one wrong digit in 197 real positions: the cheapest step
claimed a digit the solution contradicts 39.6% of the time, and the board gave
no sign of it. Only 18.8% had a cell with no candidates left and not one had a
duplicate in a unit, so a board that is quietly broken looks completely normal
from the inside.

So with a solution in hand the question becomes one about the player's own
digits, and without one the cell that has run out of candidates is still proof
enough to ask. Both are still questions, and neither names the cell.

### A curriculum is scheduled against evidence, and exposure is not evidence

Resolved at v2.14.0. The scheduler has three signals on every record: the hint
log says which pattern beat you, `summary.sharpBy` says which ones the classifier
credited to you unaided, and `techniques` says what the grader's own solve path
required. They are not interchangeable and the difference is the whole design.

The first two are evidence about the player. The third is evidence about the
puzzle. A rung whose entire history is "a puzzle you finished contained it" is
never suggested, because the player's solve path is not the grader's and they may
never have used it; it still moves the strength, and that is the only thing that
lets the bottom of the ladder recover.

It has to recover, and measuring is what showed it. Across 72 ladder-perfect
games `sharpBy` credited every elimination rung and credited naked and hidden
singles exactly zero times, because `justification` answers routine or solid for
those two and never reaches the branch that names a pattern. Without the weak
signal, one hint on a hidden single would have left it at the bottom of the class
permanently, with no way for anything to ever say otherwise.

Rules out: treating what a puzzle contained as a demonstration of skill, and any
scheduler whose weakest signal is also its only one.

### Overdue is a poor proxy for weak

Same version, and the ordering was wrong until real games were run through it.
Ranking purely by how far past its due date a rung was put an X-Wing that two
puzzles happened to contain ahead of a pointing pair that had been hinted 57
times, because the pointing pair had been met yesterday and so was not technically
due. Both statements were true and the suggestion was still absurd.

So the list is three groups, due before waiting before thin, and within a group
the weakest band first rather than the most overdue. Bands rather than raw
strength, because two hundredths apart is not a real difference in how well
somebody knows a pattern.

The related fix was the starting strength. From zero, a rung met twice in twenty
games reads as weak no matter how well it went, which on the rare rungs is every
rung: a player who found four hidden triples unaided and never needed help read
0.58 and was offered a drill on it. It starts at 0.5, meaning unknown rather than
weak.

Worth keeping as a general habit rather than a fact about this module: both of
these were plausible, passed their tests, and were only visibly wrong when the
output was read as a sentence about a real player.

### The picture draws what was attended to, and nothing else

Added at v2.15.0 with the solve-path art. The obvious thing to draw is every
cell that ended up filled. What it draws instead is every cell the player
filled, which is not the same list: auto-complete puts up to twelve digits on
the board in one press, and a hint is the app's deduction rather than yours.

Auto-completed cells are left out entirely and counted separately, because the
thread is a record of attention and nobody attended to those. Hints are drawn,
because you were there and you asked, but they carry their own colour rather
than being folded in with what you worked out.

Rules out: any version of this picture built from the finished board rather
than from the move log. The finished board is the same for everyone who solved
that puzzle, which is the opposite of the point.

### Every drawn size is relative to the game it came from

The width of the thread comes from dwell against **that game's own median**, not
against a fixed number of seconds, which is the same rule the review and the
coach already use for what counts as a long think. It falls out of measurement
rather than taste: dwell is heavy-tailed enough that a linear map spends the
whole width range on two or three stalls and draws the other fifty placements
identically. Numbers in the changelog.

The consequence worth stating: a picture is a portrait of one game and not a
comparison between games. A fast player's thread and a slow player's thread look
alike, and both show where the time went inside that game.

### A drawing is data, and the SVG is a separate string builder

`toArt` returns marks and a spine in a unit square with no notion of pixels, and
`toSvg` is the only part that has a size. That split is what lets the same
drawing be a thumbnail on the review, a full-width print, and eventually
anything else, without a second implementation deciding where the marks go.

It also keeps the colour rule enforceable. The SVG names no colour at all, only
custom properties, and a palette handed in that names a literal is refused with
an error rather than rendered. Without that check the rule would hold only for
the palettes that exist today, and a literal would ship looking correct in
whichever theme it was written in.

Two consequences for anything that embeds it:

- It has to go **in the document**, not in an `img` or a background. A `var()`
  in a detached image has nothing to resolve against and every fill falls back
  to black. Saving one as a file needs the computed values substituted first.
- Colours are set as inline `style`, not as `fill` attributes. A presentation
  attribute is not reliably parsed as a CSS value everywhere, and an SVG
  `<style>` block is document-scoped rather than scoped to the SVG, so its rules
  would leak into the app.

### Flow is a fact about the clock, not about the grid

Added at v2.16.0. The natural way to detect flow in this codebase is to ask the
ladder, which is the only thing that knows what a board offered: a placement is
easy when no elimination work stood in front of it, so a run of easy placements
is a run of flow. Measuring killed it before any interface existed. Across 24
real puzzles, 96% to 100% of the placements in a game are easy by that
definition at every tier, and 93% sit inside a run of eight or more even on
Diabolical. The definition is true and it describes every game identically.

What actually separates a Diabolical from a Gentle is a handful of hard moments,
not the texture of the solve. So flow has to be read off the cadence, and the
thresholds have to be calibrated against cadence planted at known positions
rather than against anything the grader can say.

Rules out: any future reading of flow, fatigue or engagement that infers a
mental state from what the puzzle required rather than from what the player did.

### The share of the clock is the wrong headline for anything quick

The same feature reported flow as a share of the game's minutes, which is what
the phrase "how much of the game" sounds like it means. Tested against a null of
games with no cadence structure at all, a cutoff on the clock share catches 14%
of games that genuinely had flow in them, where the same cutoff on the share of
placements catches 83%.

The cause is arithmetic and it generalises: flow is quick by definition, so a
stretch holding a quarter of the digits holds a twelfth of the minutes, and one
slow patch elsewhere outweighs it. Any statistic about a fast thing, measured in
time, is mostly a statistic about the slow things around it.

Both numbers are reported, each named for what it is, and every derived claim is
keyed to the count rather than the clock.

### A null is worth building before a threshold is chosen

The permutation test at v1.11.0 was validated by simulating its own null, and
the same move paid again here. Running the detector over games with no rhythm in
them at all is what set the cutoff for reporting anything, and it is what
revealed that the clock share could not carry a claim.

It also produced the caveat that keeps the feature honest: a null is only a null
for a player whose cadence is uneven. A featureless game whose gaps vary by a
factor of 1.8 clears the cutoff 1% of the time; one varying by only 1.35 clears
it 27% of the time, and that is not a false positive, because a player whose
whole game runs that evenly is flowing.

### Two knobs turned together measure the pair, not either one

The rolling window was chosen twice. The first sweep moved the window and the
minimum run length together, found that a window of five beat a window of three,
and recorded it as a fact about the window. Held at a fixed run of eight the
result reverses: three gives recall 0.75 against five's 0.69, and finds flow in
3% of a structureless game against 6%.

Worth keeping as a shape of mistake rather than for the parameter. A sweep over
two things that move together produces a result that is true of the pair and
gets written down as a property of one of them, and nothing about the number
looks wrong afterwards.

### A hint is a ladder, and every rung is opt-in

Agreed 2026-08-12, wiring the Socratic questions.

The hint button now has three rungs: the question, the pattern, the digit. Both
teaching rungs are separate settings and both are off by default. Phase 3 settled
that the plain hint is the right default for flow, and adding rungs below it must
not quietly change what the button does for somebody who never asked to be
taught. Practice mode forces both on, on the existing grounds that a drill which
hands you the answer is not a drill.

The question is free. It costs no hint, because it gives nothing away: it names a
unit or a digit and never a cell. The hint counter moves when a digit lands, and
only then.

The rung state lives in a hook rather than in the reducer. It changes nothing on
the board, is worth nothing after a reload, and the reducer stays the record of
the game rather than of the interface. It is cleared by the same rule
`KEEPS_EXPLAIN` applies to the explanation: any move at all, but not selecting a
cell, because looking around the unit is what the question asked for.

### Two modules agreeing is a measurement, not an assumption

Agreed 2026-08-12.

`askAbout` and `hintPlacement` walk the same ladder for different answers, and
the three-rung hint depends on them naming the same cell. Nothing in either
module enforces it. It was measured over 636 positions from 22 games (591
placements, 45 eliminations, agreement on all 591) and the measurement is kept as
a test rather than as a comment, because a comment cannot fail.

The general shape: when a feature depends on two independent modules agreeing,
the test belongs with the feature, not with either module.

### An opponent is set from the player, not from the engine

Agreed 2026-08-12, wiring ghost racing.

The engine ghost runs at the player's own median gap between placements rather
than at `ENGINE_STEP_MS`. Three seconds a rung finishes a Diabolical in 3:18,
which is a line nobody is ever near, and a race nobody can win is a pacemaker
wearing a scoreboard. The pace is stated in the label so nothing about it is
hidden.

The offer is made only while the game has not started, measured rather than
guessed: 16 of 17 real games saw their first digit inside a minute. The race
compares the two runs at the same point on the clock, which is the only honest
comparison available, and that means one joined late opens with the ghost already
gone. The fix is to not offer it late, never to bend the clock.

### The league is opt in twice, and reads nothing until both

Agreed 2026-08-12.

GitHub backup is the first switch and a display name is the second. Before both,
the league section explains itself and makes no request of any kind. After both,
it reads the repository on open only when the cached table is more than an hour
old, because a day's results cannot arrive before that day.

Its GitHub plumbing is a thirty line copy of the one in `src/lib/backup.js`,
which does not export a general helper. The right home for it is next to
`readShard` and `writeShard`, and folding it in is a tidy-up for the next time
that file is open. It is written down here so the duplication is a known debt
rather than a discovery.

---

## Written up on 2026-08-12, closing the run

Ten decisions that were made in code and never written down here. Ordered by the
version they belong to rather than by when this page was typed, because the
argument only reads in that order. Everything below is taken from the modules and
their measurements, not from memory.

### A prediction is a range, and a tailored puzzle that was not tailored is a failure

Shipped at v2.5.0. `predictTime` reports your own middle 50% for that tier on
that board and refuses to answer at all under five finished games. A point
estimate for a quantity this variable is a lie with a decimal place on it, and
the spread is the useful half: a consistent player gets a tight range and an
erratic one gets an honest wide one out of the same arithmetic.

`makeTailoredPuzzle` returns null when its budget runs out. That is not defensive
coding, it is the feature: measured over eight seeds a rung, a pointing pair is
found in 257ms and three attempts, an X-Wing in 5 of 8 tries, a naked quad in 1
of 8, and a swordfish in none of eight full twelve second searches. v2.14.0
measured the same fact from the other end, that a swordfish appears in none of 72
generated puzzles. A search that returned an ordinary puzzle rather than nothing
would send the player hunting for a pattern that is not on the board, which is
the exact failure the Socratic questions were also built to avoid.

Rules out: a single predicted time anywhere in the interface, a prediction that
pools boards, and any "tailored" or "practice" puzzle that quietly falls back to
an ordinary one.

### A shared code names the tier that was asked for, not the one that came back

Fixed at v2.7.0. A puzzle here is a seed, a requested tier and a board, and
generation takes the request. A code built from `graded` therefore rebuilds a
different puzzle on the other device: it round-tripped the board correctly, the
grid was valid, the tier label was right, and the puzzle was not the one that was
shared. Producing the wrong answer confidently is worse than failing.

The same rule is why practice and tailored puzzles get no code at all. They come
out of a different search, so a seed and a tier cannot rebuild them, and a code
that looked authoritative and produced something else would be the same bug
wearing a nicer interface.

### The in-progress game merges on move count, and never on its own

Shipped at v2.10.0. Finished games union safely because they never change again.
A position in progress is the one record both devices rewrite, so a union means
nothing and last-write-wins silently discards moves: a phone left open in a
pocket writes a newer save holding fewer moves than the Mac.

The rule is that the longer move log wins and a tie goes to the more recently
touched, which is sound only because both logs start from the same puzzle, so the
longer one contains the shorter. Two different puzzles are not merged at all,
they are offered as a choice.

**And it is never applied automatically.** The rule is right nearly always, and
nearly always is not the standard when being wrong means overwriting a game
somebody is in the middle of. The dashboard offers it with how far along it is
and how much clock is on it, and the player decides.

### Cages ride on the topology, so nothing above the ladder had to learn about killer

Resolved at v2.19.0, and it is the whole of the wiring. `createState` already
carried `topo` into every technique, so five functions reading `topo.cages` gave
the grader, the hint button, `explain.js`, the Socratic questions, the post-game
review, the move classifier and belief archaeology a killer board with no change
to any of them.

That is the payoff of the Phase 2 rule that one function grades and explains, and
of the v2.0.0 rule that a variant is data. The cost of breaking either would have
been seven surfaces that can disagree with each other about a caged board.

The five arithmetic rungs were priced by measuring, not by taste, and the danger
they posed has a name in this file already. On an empty board of 32 cages, cage
combination and cage sum fire 22 and 28 times, about once per cage: they are the
pass everybody makes before starting. Priced like a pointing pair they would have
contributed 1300 of a 2100 score, which is the naked-singles disease of Phase 2
returning in a new costume, where the score measures how many cages the grid has
rather than how much deduction it needs. They sit just above a hidden single, and
the tier comes from the 45 rule, the cage lock and the ordinary patterns.

Rules out: a killer-only copy of any technique, a second explanation path for
caged boards, and pricing a rung by how clever it feels rather than by how often
it fires.

### The cage layout is a pure function of the seed, and that is worth a tier

Resolved at v2.19.0, and it is the decision to argue with if killer is revisited.
Redrawing the cages on each generation attempt would give tier targeting another
knob, and it was refused, because the seed alone would then no longer rebuild the
board. That property is what makes a saved killer safe: verified in the browser, a
killer game saved without its cages reloads with all thirty redrawn and their
totals adding to 405. A record whose cage list did not survive a round trip is
recoverable rather than lost.

The price is paid in the top tier. Within a seed the layout is the hardest of four
deterministic candidates, ranked by what the ladder scores on the empty board,
because a layout can be made easier by giving clues and never harder. Four is the
knee: over 30 seeds, one candidate reaches Diabolical on 7 of them, four reaches
it on 21 and five on 21 as well, at 43ms against 55ms. Five Diabolical requests in
25 still land Expert, and the interface says so under the existing `requested` and
`graded` rule.

### Clues make a killer gentle; they are not what makes it unique

Resolved at v2.18.0 and v2.19.0, and it inverts the classic intuition badly
enough to be worth stating on its own.

The classic `dig` is not slow on a killer, it is wrong: it asks `countSolutions`,
which knows nothing about cages, so on a caged board with no givens it reports
many answers and refuses to remove anything. Uniqueness comes from the cages, and
a layout is only accepted once the empty board has exactly one answer under it, so
every subset of the solution is unique too and digging pays no uniqueness check at
all. That is why a killer is the cheapest board this app makes: a Diabolical
killer generates in a mean 59ms against 2645ms for a classic Diabolical and
8451ms for a Windoku one.

What clues buy instead is gentleness. Score against clue count, p50 over 16
layouts: 1295 at zero givens, 226 at four, 151 at twelve, 15 at forty. The whole
scale lives between zero and about eight, and a Gentle killer carries 44 givens,
which looks absurd until you remember that Gentle here means every step forced,
which on a caged board means never having to reason about a cage at all.

Two failures from the same work, both silent. Growing cages while ignoring the
digits underneath put a repeated digit in 57 of 915 cages across 30 grids, and 26
of those 30 layouts held at least one: nothing throws, the sums are right, the
grid is a legal sudoku solution, and the puzzle breaks its own stated rules. And
a flat lookup table keyed the sum into six bits, so a one-cell cage summing 70
collided with one summing 6 and answered "no combinations" for the life of the
process, which meant puzzles with a 6 in a one-cell cage simply had no solutions.
The table was measured and removed; recomputing at 0.033us beats a Map at 0.046us.

### Voice input is a second exception, and it does not clear the bar the first one did

Resolved at v2.20.0. The Web Speech API is not local. MDN is explicit that
recognition is server-based by default and will not work offline; in Safari the
service is Apple's and in Chrome it is Google's. Chromium has grown a
`processLocally` flag that must make recognition local or fail rather than fall
back; WebKit has neither it nor the static that gates it, and the iPhone is the
device this app is played on.

So there are two modes and the app never guesses which it is in. Where
`processLocally` exists it is set, and a browser that cannot manage local
recognition must refuse. Where it does not, listening at all means the speech
leaves the device.

**That second case does not clear the bar `CLAUDE.md` sets for an exception.** The
GitHub backup goes to infrastructure Zsomb owns and is useless to anyone else; a
recording of a voice sent to Apple or Google is neither. So it is not folded into
the voice switch. It gets its own, off by default, on top of the switch that turns
voice on at all, and the copy says what happens in words rather than in a
euphemism. On an iPhone voice does not work until the second switch is thrown, and
the settings screen has to say so. The strip says which mode it is in while the
microphone is open, because a setting read once months ago is not the same as a
statement on screen at the moment it is true.

`SpeechRecognition.available()` is never called: it hung the renderer for a full
30 second probe once, unreproduced, and setting the flag and letting the recogniser
refuse is the same answer with no call. `install()` is never called either,
because it downloads a model, which is a network request nobody asked for.

**As of this entry the feature is not mounted.** `src/lib/voice.js`,
`src/components/VoiceButton.jsx` and the two settings keys exist and are tested;
nothing imports the button and `SettingsView.jsx` has no rows for the switches, so
there is no way to turn it on. By the rule at "A shipped feature that never
reaches the device did not ship", voice input has not shipped, and `CLAUDE.md`
states the exception as conditional for exactly that reason.

Rules out: one switch covering both modes, any copy that says "processed
elsewhere" instead of naming what leaves, a wake word, restarting the recogniser
when it ends, and listening while the app is in the background.

### The recogniser asks before it writes, because it cannot know when it is wrong

Resolved at v2.21.0. Handwriting recognition here is 400 lines of arithmetic over
the stroke, no model file, no dependency, no network. It is right 83.6% of the
time at the messier end of the honest guess and 93.7% at the tidier end, and
nobody knows where a real thumb sits between them: synthetic ink is tidier than a
finger, and the author of the recogniser wrote the test set.

**There is no cheap way to detect "that is not a digit", and this was measured
rather than assumed.** Gating on how close the best match got cannot work: a
circle matches its nearest digit at 0.218 and a zigzag at 0.171, while real
strokes from an unsteady hand run to a median of 0.181 and a p90 of 0.283. The two
populations sit on top of each other. So the confidence number is a margin, how
far ahead the winner is, and not a distance, and drawing a circle on the pad will
get you a fairly confident 8.

Every path therefore ends at a button: the reading, three ranked near misses, and
clear. A misread written straight onto the board would be a mistake against the
player's record that the player did not make, and this app's whole position is
that the record is honest. Where the margin is thin the guess goes grey and a
sentence says so, which is the same two-channel rule a wrong digit on the board
already follows. The 55% of strokes offered without a caveat are right 96.6% of
the time, so the caveat is doing real work rather than covering for the feature.

**It is not on the board, and that is not a compromise.** A cell on a 350px phone
board is 39px across and a fingertip covers about 40px, so there is nowhere to
draw, and ink on a cell would have to share the gesture space with tap-to-select
and hold-to-tint. The cell is chosen the way it always was and the digit is
written large underneath.

Also recorded, because each is the obvious thing to try next and each measured
worse than nothing: endpoint positions cost 2.5 points and overfit visibly,
helping prototyped forms by 1.6 and hurting held-out ones by 4.6; net turning is
worth 0.2 at best; aspect ratio costs 0.9 overall and costs the digit 1 itself 5.3
points, because a bare 1 leans and the feature then argues against the right
answer.

### A term the app coins is defined once, in the glossary, and read from there

Resolved at v2.22.0 and v2.23.0, delivering the requirement `VISION.md` recorded
on 2026-08-11. `src/logic/glossary.js` holds 153 terms and every screen reads it,
label as well as sentence, so a tile headed one thing and explaining another is
not expressible. Where a definition already lived somewhere true, the glossary
derives from it rather than copying: techniques keep their sentence in
`techniques.js`, tiers in `difficulty.js`, variants in `variants.js`, and every
entry carries `source` saying where its sentence lives. Copying would have broken
the rule on day one.

Wiring it up found four terms that were already explained twice in different
words, which is what the rule exists to prevent, and one number reported under a
label that did not describe it: the recent-games legend said "wrong digits" over
`mistakes`, the wrong digits left standing. Over 32 generated games driven through
the real reducer the two differ in 20 of them.

**Which surface gets subtext and which gets a tap was measured, not judged.**
Printing the median, the 90th percentile and the longest definition into each real
container at 375px: a definition costs three to four times the height of the thing
it explains in any grid cell, and six statistics tiles would go from 136px of
screen to 375px. The widest grid cell on the phone is 170px and the full-width
column is 347px, and nothing in this app is between the two, so there is no
judgment call and no third case. A full-width container carries its definition
outright; a cell in a grid or a table carries a dotted underline and one shared
line underneath the group, which holds the prompt while nothing is open and the
definition when something is. Growing the tapped tile instead reflows the grid and
moves it out from under your thumb.

Rules out: a separate help page, an explanation reachable only by hover, a second
place any term is defined, and a per-trigger expansion inside a grid.

### The grader version moves even when no number moves

Amended at v2.19.0. The original rule was to bump `GRADER_VERSION` when a
technique, a cost or a band changes, and to recalibrate. Killer added five rungs
and bumped the stamp to 3 while the classic scale did not move at all: 168 puzzles
at twelve fixed seeds for classic and four each for the other four boards, over
all six tiers, generated before and after, and the JSON is byte identical. Same
boards, same scores, same tiers, same hardest technique, same clue counts.

That is not luck. Every arithmetic rung returns null the moment it finds no cages,
so a classic grid pays one property read per rung. But the stamp moved anyway,
because **a version that only changes when a number changes is a version nobody
can trust when one does.** The stamp is cheap: it regrades saves and drops the
pre-generated cache, both of which are recoverable in seconds.

What the ladder change did not need was a recalibration of the bands, and that
too was measured rather than assumed: the before-and-after comparison is the
evidence, and it is the comparison that decides, not the bump.

### The cages travel with the record, even though the seed could rebuild them

Resolved at v3.0.0. `makeVariantPuzzle` returns a killer puzzle's cage list, and
every layer between it and storage was dropping it: the reducer copied `regions`
and not `cages`, and so did the in-progress save and the finished record. The
branch of `topologyFromRecord` that reads a stored cage list could therefore
never fire for a real game.

Nothing was visibly wrong, and that is the whole reason it survived a full day of
work on killer. `killerLayout` is a pure function of the seed, so every killer
board was rebuilt correctly from the record, every time, and the second line of
defence was quietly doing all the work while the comments described a first line
that did not exist.

**Storing them is the decision, and the seed rebuild stays as the fallback it was
meant to be.** A derived value is only as stable as the function that derives it,
and that function is ours to change. The failure it prevents is not a crash: it
is a saved game that opens one day with different cages over the same digits, a
board that is wrong in a way nothing can detect and the player cannot even
describe. The stored list costs about 700 bytes on a record that already carries
two 81-cell arrays.

Rules out: deriving the cages at read time as the primary path, and trusting a
comment that describes an invariant no test asserts. `src/state/cages.test.js`
walks the list from generator to reducer to record to rebuilt topology, and
checks that the stored cages are the ones the single solution depends on rather
than merely a well-formed list.

### An animation that cannot be tested does not get to break the behaviour

Resolved at v3.0.0. The review's six tabs are wider than a 375px phone. The strip
scrolls, so nothing was broken, but selecting "Picture" left the label under the
right bezel, which reads as a broken layout rather than a scrollable row. It
scrolls the selected tab into view now.

The first attempt asked for `behavior: 'smooth'` and did nothing at all: smooth
scrolling is a no-op in the browser this was verified in. Moving the motion into
CSS as `scroll-behavior: smooth` broke it the same way, because `behavior: 'auto'`
resolves to whatever the stylesheet says.

So the scroll is instant, and the stylesheet says so in a comment rather than
leaving the next person to rediscover it. **The rule this settles: where a piece
of polish cannot be verified in the browser it will be verified in, and its
failure mode is to disable the behaviour underneath it, the behaviour wins.** The
jump is slightly less pleasant than a glide and it is always correct.

### Voice is mounted where the audio stays put, and nowhere else

Resolved at v3.0.0. v2.20.0 built voice input, tested it and wired it to nothing,
which by the rule at "A shipped feature that never reaches the device did not
ship" means it had not shipped.

It is mounted now, with `allowOffDevice` deliberately not passed. `VoiceButton`
returns null unless `voiceMode()` is `local`, so the button exists in Chrome on
the Mac, where the recogniser is told to process on the device and has to refuse
rather than send audio anywhere, and does not exist in Safari at all. The iPhone
therefore has no voice input, which is the cost of the promise and is worth it.

**The off-device path stays unreachable rather than merely switched off.**
`voiceOffDevice` remains false, no screen offers it, and nothing passes
`allowOffDevice`. Turning it on is Zsomb's decision and nobody else's, and it
needs the second switch and the copy that says the audio leaves the device in
those words. With backup off, the app still makes no network request at all.

### A press moves the control, it does not shrink the picture of it

Resolved at v3.1.0. Four visual directions were built as a live pressable
comparison rather than argued about, because the difference between them is
mostly in how they answer a touch and that does not survive being described.
Tactile won: same palette, physical chrome.

The mechanism is the lip. A blurred shadow under a control reads as a sticker; a
solid two pixel edge beneath it reads as height, and pressing collapses that edge
so the control travels. What was there before was `transform: scale(0.96)`, and
the reason the whole interface read as a diagram of itself is that scaling says
"here is a picture of a button, now smaller" while translation says "that moved".

**Elevation is tokens, never literal shadows in `app.css`.** Three of the six
themes are light, and the dark theme's white top sheen at 7% over a white panel
is invisible while its 55% black lip is a bruise. Each theme states its own
`--sheen`, `--lip` and `--cast`. `contrast` states no cast at all and a solid
black lip: that theme exists so every edge is unambiguous, and a blur is exactly
what it is for avoiding.

Two levels, not one. The lip that reads correctly under a full-width card is far
too heavy under six tool buttons sitting in a row, and a disabled control gets no
elevation at all, which turned out to matter more than any of the rest: a greyed
tool still standing on a lip made the entire row read as a picture of controls.

Rules out: scale on press, one elevation for everything, hover lift on touch
where it fights the press, and any shadow written as rgba outside `tokens.css`.

### Mono has to earn its place, and it had not on 56 selectors

Resolved at v3.1.0. IBM Plex Mono was applied by 56 rules, which is why an app
about deduction read as a terminal emulator. It is applied by 33 now.

The test a selector has to pass is "what would misalign without it". A column of
times, a share code, pencil marks in a 3x3 grid inside a cell, the running clock:
all real answers. A tier name, a heading, a button label and the digits on the
board: not answers, they were just wearing the same coat.

Digits moved to a display face at 700 and 800 with tabular figures, which is most
of what makes the board feel like a game rather than a spreadsheet. **That face
is the system face.** On the only two devices this app runs on it resolves to SF
Pro Display, which is better than anything that could be shipped for it, and it
costs no bytes, no request and no eighth dependency. It is named `--display`
rather than used inline precisely so that swapping in a self-hosted face later is
one line rather than an audit.

### The companion is allowed on two screens

Resolved at v3.1.0. A drawn character was wanted and is genuinely the biggest
visual payoff available, and it is also the easiest thing here to get wrong.

It appears on the win screen and on empty screens. It does not appear during a
solve and it never says anything. The reason is the same one that keeps `flow.js`
post-game: a thing that reacts while you are thinking is a thing that implies it
is watching how you are doing, during the exact minutes you have decided you do
not want to be told. The failure mode is not mild annoyance, it is that the app
stops being somewhere quiet.

It is built from the board cell's own rounded square at the same radius, so it
belongs to the interface rather than visiting from another product, and it has no
face beyond eyes and a mouth line. The moment it gets eyebrows it becomes a
mascot and the rest of the app has to live with it.

`thinking` and `stuck` are drawn and mounted nowhere. The set is only coherent as
a set and redrawing them later from memory would produce a different character,
but by the rule at "A shipped feature that never reaches the device did not ship"
they have not shipped, and the CHANGELOG says so rather than implying five moods
are in use.

### Draw the mark at the size it will be seen

Resolved at v3.1.0. The six tier emblems escalate in geometric complexity rather
than in ornament, which is the idea that makes them a scale rather than six
unrelated badges: Gentle is a circle with a centre and Diabolical is that same
centre buried inside a lattice.

Two of the six were wrong on first draw and both were only wrong at the size they
actually render. Easy was an arc following the top of its circle, which at 22px
sits exactly on the circle's own stroke, so Gentle and Easy were indistinguishable
on the dashboard, which is the one thing a scale may not be. Medium was three
radii at 90, 210 and 330 degrees, which is the Mercedes star, and a tier button is
not the place to make somebody think about a car. Easy became a diameter, which
crosses the shape rather than tracing it, and Medium an inscribed triangle.

Both were obvious on sight and invisible in the source. The test that now guards
this asserts that no two emblems render identical markup, which is the only form
of the check that would have caught Easy, since both shapes were valid SVG and
both drew fine.

### The desktop breakpoint was set for a maximised window, and nobody maximises

Resolved at v3.2.0. The two-column play layout, the 3x3 keypad, the larger tools
and the summary line all started at 1080px. At 1000px, which is an ordinary size
for a window that is not full screen, the app fell back to the phone layout and
put a 572px board on screen with the number pad below the fold.

That is the worst of both: the board took the room a big screen offers and the
controls paid for it. The breakpoint is 900px now, and a 1000x760 window fits
with no scrolling. Nothing else had to change, because `--app-w` was already
`min(var(--app-w), 100%)`, so the grid takes what the window gives it and the
board column shrinks with it.

**All four wide-screen blocks share the number and say so in a comment.** They
are one layout expressed in four places, and the file already records what
happens when they are separated: a nine-across pad squeezed into a 340px column.

Rules out: a breakpoint chosen from a device width rather than from the width at
which this particular layout stops fitting, and moving any one of the four blocks
on its own.

### A pointer has to know what it is about to hit

Resolved at v3.2.0. The board answered a hover with nothing at all. On a phone
that is correct and unavoidable, since there is no hover; on a Mac it meant 81
identical squares with no indication of which one the cursor was on until it had
already been selected.

A playable cell now takes a quiet version of the ring the selection already uses,
so the two read as one idea at two strengths rather than as two unrelated states,
and it takes a pointer cursor. A given takes neither. **The affordance may only
appear where the action is possible**, or it is a promise the board does not
keep.

All of it sits behind `(hover: hover) and (pointer: fine)`, matching the rest of
the file rather than `hover` alone: a stylus and some hybrid laptops report hover
while being touched, where a lift fires on tap and reads as a bug.

### The shortcut belongs on the control, and there is one list of them

Resolved at v3.2.0. The keyboard support was real and thorough and was documented
in a single line of small grey text under the number pad, which is the least
likely place anybody learns anything. Each tool carries its key in the corner
now, lit when the tool is armed, brightened on hover, and hidden completely where
there is no fine pointer.

The reason this needed a module rather than eight string literals is that there
were already two lists: the `else if` chain that handles keys and the sentence
that claimed to describe it. They had drifted. Erase is bound to Backspace,
Delete and 0, and the sentence listed it under none of them, so it was a feature
nobody had. `src/logic/shortcuts.js` is now the source for the badges, the
summary line, and the handler for every shortcut that is only ever "dispatch this
action", which is most of them.

The ones still written out in `App.jsx` are the ones that are not a plain
dispatch: the hint, which goes through the hint engine; the bookmark, which means
three things depending on shift and on whether one is set; auto-complete, which
needs its fills computed first; and movement, which is eight keys onto one action
with four arguments. Those are worth an explicit branch. A test asserts every
bound plain key has a row, so the two lists cannot part company again.

Rules out: a badge typed onto a button, a summary line maintained by hand, and
inventing a shortcut for Check, which has none.

### Silence is not the same as stopped

Resolved at v3.3.0. The AudioContext was created on the first sound and left
running for the rest of the session. A running context holds a real-time audio
thread at the device sample rate and keeps the audio hardware clocked, which
blocks deeper CPU sleep whether or not anything is audible.

**Neither the ring switch nor a gain of zero is a battery answer**, and both look
like one. They silence the output and leave the thread running, so the cheapest
sounding fix here is the one that does nothing.

It suspends five seconds after the last scheduled sound ends, and immediately on
`setEnabled(false)` and on being backgrounded. The grace exists because suspend
and resume have their own latency and a solve places a digit every few seconds;
the cost being avoided is a context running for hours on the dashboard, not one
running for four seconds between two digits, so there is nothing to buy by
cutting it fine and a clipped attack to lose.

The timer keys off the end of the longest *scheduled* sound rather than the
moment of the call. Sounds are scheduled ahead of the clock, so suspending on the
call would cut the win fanfare off in the middle.

This is also what makes ambient audio viable later: the answer to "does it drain
the battery" is a context that suspends when nothing is playing, not a switch the
user has to remember and not the phone's mute button.

Rules out: relying on the hardware ring switch, muting by gain, and closing the
context rather than suspending it, which would need a new one and a new gesture.

### An unearned badge is the badge, dimmed

Resolved at v3.3.0. The fifteen achievements were text and a progress bar. The
marks for them had been drawn and tested and mounted nowhere, which is the
failure the working conventions already name, sitting in the tree unnoticed
because a drawn thing nobody renders looks exactly like a drawn thing nobody
needed.

**Eight marks for fifteen achievements, grouped by category**, so a row says what
it is about before any of its text is read: one silhouette for the four volume
badges, one for the two dailies, a ladder for difficulty, a shield shared by
Spotless and Habit because both are about keeping a standard up. Giving all
fifteen their own drawing would have been more work and less legible.

Unearned is the same mark at low opacity, never a silhouette and never a padlock.
**The mark you are working towards has to be the mark you get**, or the reward
for earning it is finding out what it actually looked like.

`BadgeMark` takes an achievement id, not an art name, and the id-to-art map lives
with the drawings rather than as a field on each achievement, because which
picture to draw is a question about the component and `src/stats/` stays free of
presentation. A test fails in both directions: an achievement with no mark, and a
mark whose achievement has been deleted.

Rules out: a padlock, a generic fallback shape for an unmapped id, and putting
the art name in `achievements.js`.
