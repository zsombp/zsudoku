# Zsudoku decisions log

Newest first. Every entry records what was decided, why, and what it rules out. Open questions live at the bottom until they are answered, then they move up here.

---

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

### Deploy target deferred to Phase 1

Build locally first, choose the host when there is something to install. GitHub Pages, Vercel and Netlify all remain on the table. Note for when it comes up: Pages from a private repo needs a paid GitHub plan, so free Pages means a public repo; Vercel and Netlify serve private repos on their free tiers.

Status: **open, revisit at Phase 1.**
