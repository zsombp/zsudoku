# Changelog

Newest first.

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
