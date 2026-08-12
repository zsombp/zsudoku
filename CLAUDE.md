# Zsudoku

Personal offline sudoku PWA for Zsomb. One player, no backend, no accounts, no ads. Runs installed on iPhone and on macOS.

**Live: https://zsombp.github.io/zsudoku/**, repo `zsombp/zsudoku`, public, deploys from `main` on push. Install on iPhone via Safari, Share, Add to Home Screen.

`docs/DECISIONS.md` is what was decided and why, and it outranks any instinct you have about this code. `docs/PLAN.md` is the phased build that produced v1.0.0. `docs/VISION.md` is what has been built against the ambition and what genuinely remains. `CHANGELOG.md` is newest first.

It costs nothing and must keep costing nothing. Seven dependencies; adding an eighth needs a real reason.

## What it is now

Six boards: classic, jigsaw, X-Sudoku, Windoku, anti-knight and killer. Seventeen techniques on the ladder, five of them arithmetic and only reachable on a caged board.

Beyond playing: a post-game review that draws its evidence, a coach that reasons across games, belief archaeology, self-experiments with a permutation test, a curriculum scheduled against your own failures, flashcards, Socratic questions as the rung below the hint, ghost racing, a private league over the sync repository, the solve path as a saveable picture, handwritten digit entry, and a glossary every screen reads from. `docs/VISION.md` records what shipped against the original ambition, what genuinely remains, and the one feature that is written, tested and not wired.

## Non-negotiables

1. **Zero third-party requests, with exceptions that are stated, opt-in and counted.** No CDN, no Google Fonts, no analytics endpoint, no error reporting. Font self-hosted, icons inlined. It has to work in airplane mode.
   - **The GitHub backup** is the first exception: off by default, talks only to `api.github.com`, sends only the game log and the league file, and goes to a repository the user owns. Nothing in the app may depend on it. The token lives in its own localStorage key, never in the settings blob, never in an export, never in the repo.
   - **Voice input is the second, and it does not clear the same bar.** The Web Speech API is server-based unless the browser offers `processLocally`, which WebKit does not, so on the iPhone listening at all means the audio goes to Apple. That is not the user's own infrastructure, so it may never be folded into the voice switch: it needs a second switch of its own, off by default, and copy that says the audio leaves the device in those words. `src/lib/voice.js` implements this correctly. **As of 2026-08-12 nothing mounts it**, so today the app still makes no request with backup off. Do not describe voice as shipped until it is on screen, and do not mount it without its second switch.
   - A third exception needs the backup's bar, not voice's: opt-in, the user's own infrastructure, and useless to anyone else.
2. **Honest difficulty.** The difficulty shown is always the grader's verdict on the puzzle in front of you, never the difficulty that was requested. No puzzle ships that the technique ladder cannot finish by pure logic. `requested` and `graded` stay separate fields everywhere; when they disagree the interface says so.
   - Score measures deduction, never board size and never board shape. Naked singles cost zero on purpose: see `docs/DECISIONS.md`. A regression test asserts naked-singles-only puzzles score exactly 0 at any clue count. The same disease nearly returned with killer, where the two routine cage rungs fire once per cage.
   - Techniques return structured steps, so the grader, the hint engine, the Socratic questions, the post-game review and the drawn explanations are all the same code and cannot disagree. `src/logic/explain.js` is the single answer to "why does this digit go here"; never write a second one.
   - **Bump `GRADER_VERSION` (currently 3) whenever a technique, a cost or a band changes, even if you have proved no score moved.** Killer added five rungs and left the classic scale byte identical over 168 puzzles, and the stamp still went to 3: a version that only changes when a number changes is a version nobody can trust when one does. The stamp is cheap, it regrades saves and drops the pre-generated cache.
   - Recalibration is a separate question from the stamp, and it is answered by measurement. Generate the same fixed seeds before and after and diff the JSON. If scores moved, `npm run calibrate -- explore` and re-derive the bands; if they did not, say so in the CHANGELOG with the numbers.
3. **Honest timing.** Timestamp-based, not interval ticks, auto-paused on `visibilitychange`. Every statistic depends on this.
4. **Nothing leaves the device except to the user's own repository.** Analytics are local and are never sent anywhere. Export is a file the user saves themselves. The GitHub backup writes the same data to a repo they own and control. The one thing that could ever leave for anyone else is speech, under non-negotiable 1, and only behind its own switch with the consequence spelled out.
5. **Everything explains itself, and each term exactly once.** `src/logic/glossary.js` holds every word the app coins and every screen reads from it. Where a definition already lives somewhere true it derives from there rather than copying. A `title` attribute is invisible on iPhone, so hover is never the only route: full-width containers carry their definition as subtext, grid and table cells carry a dotted underline with one shared line under the group. Adding a term without an entry is a test failure, and it should stay one.
6. **Never delete without an explicit yes.** Tag before anything destructive.
7. **`zsudoku-handoff/` is read-only.** It is the reference for what the working prototype did.

## Stack

Vite + React, plain JS. `vite-plugin-pwa` with `registerType: 'autoUpdate'`. `@fontsource/ibm-plex-mono` self-hosted. localStorage for settings and the in-progress game, IndexedDB for the completed-game log. Vitest over the pure modules and over the components that can be rendered to a string with `renderToStaticMarkup`. No UI framework, no chart library, no icon library, and no DOM test environment, which is why anything behind a real tap has to be driven in a browser before it is called done.

## Layout

```
src/logic/      topology, solver, generator, grader, techniques, explain,
                variants, killer, socratic, flashcards, share, glossary
src/stats/      analysis, replay, coach, beliefs, experiments, curriculum,
                ghost, league, flow, solveart, narrate   (recorded games)
src/lib/        storage, idb, prng, format, backup, sound, voice, handwriting
src/state/      gameReducer
src/components/ Board, NumberPad, Toolbar, StatusBar, Dashboard, GameReview,
                StatsView, SettingsView, Term, and the rest
src/hooks/      useTimer, useKeyboard, useGenerator, useHint, useRace,
                useLeague, useSettings
src/styles/     tokens.css then everything else
src/workers/    generator worker
scripts/        measurement harnesses, run with node
```

`src/logic/` and `src/stats/` are pure and framework-free so they stay testable. React never reaches into them beyond calling exported functions. `src/logic/` may not import from `src/stats/`; the dependency runs one way only.

## Design

Dark by default: ink-blue `#14161d`, brass `#e2a63d`. IBM Plex Mono for every digit and the timer, system sans for UI chrome. Restrained. The win screen is a sweep and a trophy, not confetti.

Six themes as CSS custom properties driven by `data-theme` on ANY element (not just the root, so the theme picker can render real previews). Anything that hardcodes a colour outside `tokens.css` is a bug, including anything written into a saved SVG, which has to carry resolved values instead. Every sequential ramp is validated with the dataviz validator; re-run it if a ramp changes.

The board scales by container query: everything inside `.boardWrap` sizes in `cqw` against the board, never in `vw`. That is what makes one layout work on a 350px phone board and a 642px desktop one.

Region outlines and cage outlines come from the topology, never from arithmetic in a component, so an outline cannot disagree with the constraint being enforced. On a caged board the pencil marks sit lower in all 81 cells, because a mark's position is information and has to mean the same thing everywhere.

Every animation sits behind `prefers-reduced-motion`.

## iOS specifics that bite

- `100dvh`, never `100vh`.
- `env(safe-area-inset-*)` padding on the bottom sheet and the footer row.
- iOS ignores manifest icons for the home screen. Ship a real 180x180 `apple-touch-icon` PNG with no alpha.
- No install prompt exists on iOS. Do not build an install banner.
- `navigator.storage.persist()` is a no-op in Safari. Protection from storage eviction comes from being installed to the home screen.
- Safari has no web haptics API. The `switch` attribute workaround on iOS 17.4+ is unverified; do not promise haptics.
- `touch-action: none` on anything that takes a drawn gesture, or the browser scrolls the page instead.
- There is no hover. Anything reachable only by hovering is not reachable.

## Working conventions

Milestone equals a git tag plus a CHANGELOG entry, newest first. Every commit that changes behaviour gets an entry; a version number with no entry is a release that did not happen, which is how v2.5.0 went missing for a day. Anything agreed in conversation gets written into `docs/DECISIONS.md` before the session ends, appended at the end, in the order it was decided. No emojis and no em-dashes in docs or UI copy.

A feature that is written, tested and not mounted has not shipped. Say so plainly in the CHANGELOG rather than describing it as delivered.
