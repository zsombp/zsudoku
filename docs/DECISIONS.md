# Zsudoku decisions log

Newest first. Every entry records what was decided, why, and what it rules out. Open questions live at the bottom until they are answered, then they move up here.

---

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
