# Zsudoku

Personal offline sudoku PWA for Zsomb. One player, no backend, no accounts, no ads, no network. Runs installed on iPhone and on macOS.

**Live: https://zsombp.github.io/zsudoku/** — repo `zsombp/zsudoku`, public, deploys from `main` on push. Install on iPhone via Safari, Share, Add to Home Screen.

Read `docs/PLAN.md` for the phased build and `docs/DECISIONS.md` for what was decided and why. `CHANGELOG.md` is newest first. All six phases shipped (v1.0.0). Phases were built 0,1,2,3,5,6,4.

It costs nothing and must keep costing nothing. Seven dependencies; adding an eighth needs a real reason.

## Non-negotiables

1. **Zero third-party requests, with one opted-in exception.** No CDN, no Google Fonts, no analytics endpoint, no error reporting. Font self-hosted, icons inlined. It has to work in airplane mode.
   - The exception is the GitHub backup: off by default, talks only to `api.github.com`, sends only the game log, and goes to a repository the user owns. Nothing in the app may depend on it, and with it off the app makes no network requests at all. Adding a second exception needs the same bar: opt-in, the user's own infrastructure, and useless to anyone else.
   - The token lives in its own localStorage key, never in the settings blob, never in an export, never in the repo.
2. **Honest difficulty.** The difficulty shown is always the grader's verdict on the puzzle in front of you, never the difficulty that was requested. No puzzle ships that the technique ladder cannot finish by pure logic. `requested` and `graded` stay separate fields everywhere; when they disagree the interface says so.
   - Score measures deduction, never board size. Naked singles cost zero on purpose: see `docs/DECISIONS.md`. A regression test asserts naked-singles-only puzzles score exactly 0 at any clue count.
   - Techniques return structured steps, so the grader and the hint engine are the same code and cannot disagree.
   - Change a technique, a cost or a band and you must bump `GRADER_VERSION` and re-run `npm run calibrate -- explore`. Both move the whole scale.
3. **Honest timing.** Timestamp-based, not interval ticks, auto-paused on `visibilitychange`. Every statistic depends on this.
4. **Nothing leaves the device except to the user's own repository.** Analytics are local and are never sent anywhere. Export is a file the user saves themselves. The GitHub backup writes the same data to a repo they own and control, and nothing else ever goes out.
5. **Never delete without an explicit yes.** Tag before anything destructive.
6. **`zsudoku-handoff/` is read-only.** It is the reference for what the working prototype did.

## Stack

Vite + React, plain JS. `vite-plugin-pwa` with `registerType: 'autoUpdate'`. `@fontsource/ibm-plex-mono` self-hosted. localStorage for settings and the in-progress game, IndexedDB for the completed-game log. Vitest over `src/logic/`. No UI framework, no chart library, no icon library.

## Layout

```
src/logic/      topology, solver, generator, grader, techniques   (pure, tested, no React)
src/lib/        storage, idb, prng, format
src/components/ Board, Cell, NumberPad, Toolbar, StatusBar, Sheet, Veil, Stats
src/hooks/      useGame, useTimer, useKeyboard, useTheme
src/styles/     tokens.css then everything else
src/workers/    generator worker
```

Logic is pure and framework-free so it stays testable. React never reaches into it beyond calling exported functions.

## Design

Dark by default: ink-blue `#14161d`, brass `#e2a63d`. IBM Plex Mono for every digit and the timer, system sans for UI chrome. Restrained. The win screen is a sweep and a trophy, not confetti.

Six themes as CSS custom properties driven by `data-theme` on ANY element (not just the root, so the theme picker can render real previews). Anything that hardcodes a colour outside `tokens.css` is a bug. Every sequential ramp is validated with the dataviz validator; re-run it if a ramp changes.

The board scales by container query: everything inside `.boardWrap` sizes in `cqw` against the board, never in `vw`. That is what makes one layout work on a 350px phone board and a 642px desktop one.

Every animation sits behind `prefers-reduced-motion`.

## iOS specifics that bite

- `100dvh`, never `100vh`.
- `env(safe-area-inset-*)` padding on the bottom sheet and the footer row.
- iOS ignores manifest icons for the home screen. Ship a real 180x180 `apple-touch-icon` PNG with no alpha.
- No install prompt exists on iOS. Do not build an install banner.
- `navigator.storage.persist()` is a no-op in Safari. Protection from storage eviction comes from being installed to the home screen.
- Safari has no web haptics API. The `switch` attribute workaround on iOS 17.4+ is unverified; do not promise haptics.

## Working conventions

Milestone equals a git tag plus a CHANGELOG entry, newest first. Anything agreed in conversation gets written into `docs/DECISIONS.md` before the session ends. No emojis and no em-dashes in docs or UI copy.
