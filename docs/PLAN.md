# Zsudoku build plan

Written 2026-07-30. Source prototype: `../zsudoku-handoff/reference/zsudoku-artifact.jsx` (705 lines, single React component, tested and working).

Goal: an offline-first PWA installed on iPhone and Mac. No backend, no accounts, no ads, no network calls of any kind. One player: Zsomb.

## Read this first

The prototype is good. It already has: a correct solver, a symmetric-dig generator, a logical grader, honest difficulty labelling, pencil marks with auto-erase, auto-pencil, unlimited undo, mistake highlighting, a pausing timer, best times, full keyboard control, same-number highlighting, remaining counts, restart, and autosave with resume.

What it does not have is everything that makes it a product rather than a demo: real difficulty tiers, statistics, themes, hints, analytics, and the PWA shell. That is what this plan builds.

## Ship order

The single most important sequencing decision: **get it installed and playable on the iPhone before building any features.** Phase 0 and Phase 1 are one sitting. Everything after that is enrichment on a thing that already works, and every later phase can be shipped independently because the service worker updates itself.

---

## Phase 0: scaffold and port

Target: identical gameplay to the prototype, running from `npm run dev`, in git.

- Vite + React, plain JS (no TypeScript, per the handoff brief).
- `git init` at commit 1. Milestone = tag. Newest-first `CHANGELOG.md`.
- Split the single component into modules. Not over-engineered, just legible:
  - `src/logic/topology.js` - ROWS, COLS, BOXES, UNITS, PEERS, rowOf/colOf/boxOf, candsAt
  - `src/logic/solver.js` - countSolutions
  - `src/logic/generator.js` - generateFull, dig, makePuzzle
  - `src/logic/grader.js` - the technique ladder (rebuilt in Phase 2)
  - `src/lib/storage.js` - localStorage wrapper, same async signature as the artifact's `window.storage`, try/catch preserved
  - `src/components/` - Board, Cell, NumberPad, Toolbar, StatusBar, Sheet, Veil
  - `src/hooks/` - useGame, useTimer, useKeyboard
- CSS out of the template string into real files, with a token layer at the top (this is what makes Phase 4 themes cheap).
- Self-host the font with `@fontsource/ibm-plex-mono`. No Google Fonts link. Zero third-party requests is a hard constraint.
- Drop `lucide-react`; inline the ten icons used as local SVG components. Smaller, and nothing to resolve at runtime.

Two fixes that go in here because everything downstream depends on them:

1. **Timestamp-based timer.** The prototype counts `setInterval` ticks. That drifts, and it silently stops when the phone locks or the tab backgrounds. Every statistic would inherit that lie. Replace with accumulated `performance.now()` deltas plus a `visibilitychange` handler that auto-pauses.
2. **Seeded RNG.** Replace `Math.random` in the generator with a seedable PRNG (mulberry32). Costs nothing now, and it is the only way to get daily puzzles, reproducible bugs, and shareable puzzles later.

Tag `v0.1.0`.

## Phase 1: PWA shell, deploy, install

Target: on the home screen, playable in airplane mode.

- `vite-plugin-pwa`, `registerType: 'autoUpdate'`, precache the app shell.
- `manifest.webmanifest`: name, `short_name: "Zsudoku"`, `display: "standalone"`, `theme_color`/`background_color` `#14161d`, icons 192 + 512 + maskable 512.
- iOS ignores manifest icons for the home screen. Also ship a real 180x180 `apple-touch-icon` PNG with no alpha channel, linked from `index.html`.
- Meta: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport` with `viewport-fit=cover`.
- `100dvh` everywhere, never `100vh`. `env(safe-area-inset-*)` padding on the sheet and the bottom row.
- Call `navigator.storage?.persist?.()` once on load. Note it is a no-op in Safari; on iOS the real protection against storage eviction is being installed to the home screen rather than browsed. Verify this holds.
- No install banner. iOS has no `beforeinstallprompt`; installation is Share, then Add to Home Screen.
- Deploy over HTTPS (required for the service worker on the phone), install, then verify in airplane mode.

Tag `v0.2.0`. **This is the point where the thing is real.**

## Phase 2: the honest difficulty engine

This is the largest piece of new work and the one Zsomb actually asked for.

### What is wrong with the current grader

It solves with three techniques and returns the hardest one used: naked singles (1), hidden singles (2), pointing pairs plus naked pairs (3), and everything else falls through to 4. So "Expert" is a catch-all bucket that means "our three techniques ran out". It cannot distinguish a puzzle that needs a clean X-Wing from one that can only be finished by guessing. A puzzle that requires guessing is not hard, it is broken, and right now both are labelled Expert.

### The rebuild

`grader.js` becomes a technique ladder. Each technique is a pure function that takes the board plus candidate sets and returns either null or a description of what it did: which technique, which unit, which cells, which candidates eliminated. That return shape matters, because it makes the grader double as the hint engine in Phase 3 for free.

Ladder, cheapest first:

1. Naked single
2. Hidden single
3. Locked candidates: pointing, and claiming (box-line reduction)
4. Naked pair, naked triple, naked quad
5. Hidden pair, hidden triple
6. X-Wing
7. XY-Wing
8. Swordfish

Grading is a **weighted score**, not just the hardest technique used. Each application adds a cost, with a higher cost for the first use of a technique than for repeats. Total score buckets into a tier. A puzzle needing one X-Wing and nothing else is meaningfully easier than one needing three X-Wings and a Swordfish, and a single number captures that where "hardest technique" does not.

Starting costs, to be **calibrated empirically** by generating several hundred puzzles and reading the actual distribution rather than guessing at thresholds:

| technique | first use | repeat |
|---|---|---|
| naked single | 10 | 10 |
| hidden single | 15 | 12 |
| pointing | 50 | 40 |
| claiming | 55 | 45 |
| naked pair | 60 | 50 |
| hidden pair | 70 | 60 |
| naked triple | 80 | 70 |
| hidden triple | 100 | 90 |
| X-Wing | 140 | 120 |
| XY-Wing | 160 | 140 |
| Swordfish | 200 | 180 |

Six tiers instead of four: Gentle, Easy, Medium, Hard, Expert, Diabolical. Band boundaries set after calibration.

**Hard rule that survives from the prototype and gets stronger: the label is always the grader's verdict, never the requested difficulty.** In addition, any puzzle the ladder cannot finish is rejected outright and regenerated. Every puzzle Zsudoku ever serves is solvable by pure logic. That is what "honest" has to mean, and the current version does not guarantee it.

### Generation changes

- Dig **to a difficulty band**, not to a clue count. The current code digs to a fixed clue target and then hopes the grade lands right. Grade as you dig and stop inside the target band. Far higher hit rate.
- Symmetric digging stays the default because it looks better, but the top two tiers may need to drop symmetry to reach their scores. Make it a per-tier flag.
- Move generation into a **Web Worker**. Grading eight techniques across many attempts will blow the frame budget on an iPhone.
- **Pre-generate ahead.** Keep two ready puzzles per tier in IndexedDB and refill in the background after each one is consumed. New game becomes instant, and it works offline.

### Tests

This is the one place tests earn their keep, because the grader is the product. Vitest over the logic layer:

- every generated puzzle has exactly one solution
- the technique list the grader claims actually solves the puzzle when replayed
- no shipped puzzle requires guessing
- grade distribution across 200 puzzles per tier lands in band
- generation time budget per tier

Tag `v0.3.0`.

## Phase 3: hints and assists

All of this rides on Phase 2's ladder returning structured results.

### Quick input (digit-first mode)

Requested 2026-07-30. Today the game is cell-first: select a cell, then choose a digit. Quick input inverts it. Pick a digit once, then every cell you tap gets that digit. Far fewer taps on a phone, and it matches how people actually fill a grid, in runs of the same number.

- A toggle in the toolbar. The active digit stays lit on the number pad.
- While a digit is active, **every cell already holding it is highlighted**, which as Zsomb noted makes number highlighting fall out of the mode for free instead of needing its own control.
- Works in notes mode too: tap cells to toggle that pencil mark.
- Tapping a cell that already holds the active digit clears it, matching the current same-digit-clears behaviour.
- Cell-first stays available. This is a mode, not a replacement, and the setting persists.

### Auto-complete

Requested 2026-07-30, for the point where "there is literally no thinking left to do, it is just filling in the cells". A button that appears only when that is true, and fills everything in one tap.

**Open decision, to settle when this gets built.** Two readings of the trigger, and they feel very different:

1. **Strict.** Every empty cell has exactly one candidate right now. Appears very late, usually the last handful of cells. Pure mop-up, cannot possibly rob you of a puzzle.
2. **Cascade.** The rest of the board is solvable by naked singles alone, each one revealing the next. This is closer to the intent, because "no thinking left" is exactly what a naked-singles-only tail means. But on an Easy puzzle it can light up with thirty cells still empty, which is a big chunk of the game to hand away.

Leaning cascade, because it matches what was asked for, but gated so it never appears before the board is meaningfully filled. Needs to be felt rather than argued about, so build it behind a setting and try both.

Either way the check is nearly free: it reuses the Phase 2 ladder restricted to its first rung. Using it is recorded in stats, since a game finished with auto-complete is not the same as one finished by hand.

### The rest

- **Hints, three escalating levels.** First: name the technique and the unit ("there is a hidden single in the middle-left box"). Second: point at the cell. Third: fill it. This teaches rather than solves, and it is counted in stats.
- **Auto-maintain pencil marks** as a proper mode. Auto-pencil already fills them; the missing half is keeping them correct continuously as you place, erase, and undo. That is the "auto remove pencil marks" ask done fully rather than the one-directional version in the prototype.
- **Check board** with two modes, chosen in settings: against the solution (tells you a digit is wrong), or against the rules (tells you two of the same digit share a unit, which is a lighter form of help).
- Undo history persisted with the save so resuming a game keeps its undo stack.

Tag `v0.4.0`.

## Phase 4: themes and the animation layer

Theme system: CSS custom properties driven by `data-theme` on the root, saved in settings, with a "System" option that follows `prefers-color-scheme`.

Themes:

- Ink and Brass (the current dark default)
- Paper (the current light)
- Midnight OLED, true black, easier on the phone battery
- Nord
- Newsprint, warm sepia
- High Contrast, aiming at WCAG AAA on text and controls

Zsomb's verdict after playing v0.2.0 on the phone: the game feels good, the UI needs a lot of work, and the animations should be more expressive. His call, and the right one, is that all of it is final polish rather than something to chase now. So Phase 4 is where the interface gets taken seriously, not just recoloured, and it happens once the mechanics underneath have stopped moving.

Animations, all gated behind `prefers-reduced-motion`:

- board entrance stagger
- digit placement pop, already present, plus a ripple on the peer marks it erases
- row, column and box completion flash
- number pad digit fading out as it is exhausted
- win sequence: a sweep across the board into the trophy card, keeping the restrained ink-and-brass look rather than confetti
- pause blur, already present

Haptics on iPhone: `navigator.vibrate` is not supported in Safari. There is a known workaround using the `switch` attribute on a checkbox input from iOS 17.4 onwards. Treat as investigate-and-report, not a promise.

Tag `v0.5.0`.

## Phase 5: statistics and local analytics

Everything local. Nothing leaves the device.

### Data

IndexedDB store `games`, one record per game:

```
id, startedAt, endedAt, durationMs, difficultyRequested, difficultyGraded,
score, clues, techniquesUsed[], mistakes, hintsUsed, undos, autoPencilUsed,
completed, abandoned, seed, moveLog?
```

The optional `moveLog` is what turns statistics into analytics: `{t, cell, value, kind, correct}` per action. Roughly 12KB for an hour-long game, which is why the game log goes in IndexedDB and only settings and the current game stay in localStorage. localStorage would hit its ceiling within a couple of years of daily play.

### Stats page

- Overview: games played, completed, win rate, total time played, current streak, longest streak
- Per tier: best, average, median, and a trend line over the last ten
- Solve time histogram
- Play calendar heatmap by day
- Time-of-day radial: when do you actually play
- Mistakes and hints over time
- Rolling ten-game average per tier, which is the honest "am I improving" chart

Charts hand-rolled in SVG. No chart library: it keeps the bundle small and the offline story pure.

### Analytics, from the move log

- time to first move, longest stall, and a stall heatmap over the grid
- solve replay you can scrub through
- accuracy across the arc of a game

### The coach

This is the payoff for logging moves, and the reason the data model is worth its size. Three sources get cross-referenced: what the puzzle **required** (the grader's technique list, per puzzle), what was actually **done** (the move log), and **where the time went** (gaps between moves, attributed to the technique that unblocked the next placement).

That yields recommendations that are specific and checkable rather than generic:

- **Technique weak spots.** Median stall before each placement, grouped by the technique that unblocked it, compared against personal baseline. If stalls before pointing-pair placements run three times baseline, that is a measured weakness, not a guess.
- **Scanning bias.** Same stall analysis split by whether the unblocking unit was a row, a column or a box. Most players are measurably slower on columns and have never been told.
- **Pencil discipline.** Correlate pencil density and auto-pencil use against time and mistakes, per tier. Answers whether pencilling actually helps this player, at this level, rather than whether it helps in general.
- **Mistake shape.** Are errors clustered in the opening, which suggests misreading givens, or in the endgame, which suggests fatigue. Are they concentrated in particular boxes.
- **Pace curve.** Where in a solve the slowdown happens: opening, middle, or endgame.
- **Tier readiness.** Rolling ten-game time and mistake rate against the band above. "Your last ten Hard puzzles average 8:20 with 0.3 mistakes, which is Expert pace."
- **Time of day.** Whether performance actually varies by hour, answered from data rather than assumed.

Each recommendation is actionable inside the app, which is what stops it being a dashboard nobody reads:

- **Practice mode.** Generate a puzzle that specifically requires your weakest technique, by filtering on the grader's technique list at generation time. The engine already knows what each puzzle needs, so this is a filter rather than new machinery.
- **Drill the technique.** Jump straight to the hint engine's explanation of that technique with a worked example from a puzzle you have already played.

Recommendations only appear once there is enough data to support them. A confidence floor per recommendation, with the sample size shown. Telling someone they are weak on Swordfish after two games would be noise dressed as insight.

### Backup

Export and import the whole store as a JSON file. Browser storage can be evicted; a personal record of a few thousand games deserves an escape hatch.

Tag `v0.6.0`.

## Phase 6: the whole works

- **Daily puzzle.** Seed the PRNG from the date, so every device generates the same puzzle with no server. Its own streak counter.
- Local achievements.
- Sound, off by default, generated with WebAudio so there are no audio files to ship.
- A real settings page pulling together assists, themes, animations, sound, and data export.
- Multiple saved games.

Tag `v1.0.0`.

## Explicitly not in v1

Killer sudoku and other variants, any kind of sync between Mac and iPhone, sharing, and anything that touches a network.

## Time

Phase 0 and 1 are one sitting, and at the end of it the game is on the phone. Phase 2 is the biggest single chunk and deserves its own sitting because of the calibration pass. Phases 3 through 6 are each an evening or less and ship independently.
