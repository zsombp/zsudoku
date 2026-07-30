# Changelog

Newest first.

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
