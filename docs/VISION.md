# Vision

Written 2026-08-11 as the argument for what to build next, and for what never to
build. Rewritten 2026-08-12, when most of it had been built, to separate the
record from the remainder.

`PLAN.md` was the phased build. `DECISIONS.md` is why each thing is the way it
is. This page is the shape of the ambition and an honest inventory against it.

## The thesis

Unchanged, and it is still the reason any of the rest is worth doing.

The app has honest timing, a complete move log, a technique ladder that grades
and explains with one piece of code, reconstructable pencil marks, and a
per-move judgment of whether the board actually proved each placement.

Together those mean it does not only know what was played. **It knows what was
believed while it was being played, and whether that belief was justified.**
That is a recording of a mind working a problem, at second resolution, with
ground truth attached, and it is the thing almost nothing else has.

Sudoku is the substrate. The subject is the player. Everything below is
downstream of that, and any idea that does not use it is probably just another
feature.

## What was built

Counted against the twenty-six ideas the original page listed: sixteen shipped
outright, four shipped in part, six are untouched. All of it between 2026-08-11
and 2026-08-12. Versions point at the CHANGELOG entry, which carries the
measurements.

**Pillar 1, the mirror.** Belief archaeology (v1.10.0), self-experiments with a
permutation test (v1.11.0), tilt measured per person rather than assumed
(v2.4.0), an honest answer to "am I improving" compared within tier (v2.4.0),
fatigue within a sitting (v2.4.0), the nemesis file (v2.4.0), the circadian
curve in the coach and in `byHour`, and flow and struggle detected from the
cadence of the move log (v2.16.0, on screen at v2.17.0).

**Pillar 2, the grid.** Jigsaw, X-Sudoku, Windoku and anti-knight as topologies
with no change to any technique (v2.0.0); killer, which needed its own solver,
its own generator and five arithmetic rungs (v2.18.0, v2.19.0). Personalised
generation and time prediction from your own history (v2.5.0). The daily rotates
board as well as tier through the week (v2.2.0), and statistics filter by board
(v2.1.0).

**Pillar 3, the teacher.** A curriculum scheduled against your own failures
(v2.14.0), Socratic questions as the rung below the hint (v2.13.0), pattern
flashcards (v2.9.0), and the narrated match report (v2.3.0). All of it on screen
at v2.17.0.

**Pillar 4, the instrument.** Keyboard speedrunning (v2.8.0), the solve path as
generative art, saveable as an SVG (v2.15.0, v2.17.0), handwritten digits from a
400 line recogniser with no model file (v2.21.0), and sound and motion for the
moments worth marking (v2.6.0). The handwriting asked for ink on the cell and
got a pad under the number keys instead, which takes any pointer including a
Pencil; the reason it is not on the board is under Ruled out.

**Pillar 5, the others.** A puzzle as a word (v2.7.0), ghost racing against a
past self or the engine (v2.11.0, v2.17.0), a private league over the shared sync
repository (v2.12.0, v2.17.0), and the in-progress game travelling between
devices (v2.10.0).

**Everything explains itself.** 153 terms defined once in
`src/logic/glossary.js` (v2.22.0) and read by every screen (v2.23.0). The
requirement is recorded below because the rule outlives the delivery.

## What remains

One thing that is written and not wired, five that were never started, and two
smaller ones after them.

- **Voice input is built and not mounted.** `src/lib/voice.js` and
  `src/components/VoiceButton.jsx` exist and are tested, and nothing imports the
  button; `SettingsView.jsx` has no rows for its two switches, so there is no way
  to turn it on. About six lines of wiring in `App.jsx` and two settings rows.
  Read the voice entry in `DECISIONS.md` first: the second switch, the one that
  admits the audio leaves the device, is not optional and is not a detail.
- **Variants that need new constraint types**: thermometers, arrows, kropki
  dots, sandwich sums, chess constraints beyond the knight. Killer proved the
  estimate on this page was right. A topology variant is nearly free; an
  arithmetic one is its own solver, its own generator and its own rungs, and
  killer took a full day. Do one at a time or not at all.
- **A rule language**, so a variant is described rather than coded, with the
  engine reporting whether puzzles under it are generatable and where they land
  on the scale. Only worth attempting after a second arithmetic variant, because
  one example is not enough to generalise from and killer is currently the only
  one.
- **The setter**, and the puzzle exchange that depends on it. Design a puzzle and
  have the engine report what it requires, whether the answer is unique, and how
  the clue symmetry reads. The uniqueness check and the grader are both already
  there; what is missing is the editing surface.
- **A textbook assembled from your own games**, covering only what you have
  demonstrably not learned. The curriculum knows what that is and the worked
  examples already come from your own grid, so this is assembly rather than
  invention. It is the largest remaining piece of prose in the app and should be
  built last, when there is enough history to make it not embarrassing.
- **Branch exploration**: replay to any move, play a different line, see where it
  leads. Time-travel debugging for your own reasoning. The replay walks the log
  already; what is missing is a board that can be played from a replayed state
  without becoming a recorded game.

Two smaller ones, both deliberately deferred rather than forgotten:

- **Generative ambient audio** that thins out in flow and marks a stall without
  saying anything. v2.6.0 shipped event sounds, which is a different thing.
  `flow.js` is post-game only; making it live is the actual work here.
- **Getting out of the way during flow.** The original argument was that when
  flow is detected the interface should hide everything. Flow is currently
  detected after the fact, in the review, so nothing acts on it during play. Be
  careful: a false positive here removes the interface from under somebody who
  was not in flow, which is a worse failure than a quiet report.

## Ruled out

Recorded so they are not proposed again.

- **Eye tracking.** Technically the most exciting idea considered, and cut on
  purpose. It needs a camera, a model, and a dependency, and an app that watches
  your face to tell you about your scanning habits is unsettling in a way the
  insight does not pay for.
- **Themes generated from a photograph.** Fun, and not needed. Six validated
  themes already cover the ground, and generated ones would have to be validated
  at runtime to keep the contrast promises.
- **Printing to paper with a scan-back loop.** A neat trick with no real place in
  how this app gets used.
- **Writing the digit on the cell itself.** Cut at v2.21.0 on a measurement, not
  a preference: a cell on a 350px phone board is 39px across and a fingertip
  covers about 40px, so there is nowhere to draw, and ink on a cell would have to
  share the gesture space with tap-to-select and hold-to-tint. The pad under the
  keys is the answer, not a stopgap.
- **Ads, accounts, energy systems, cosmetics as currency, streaks weaponised
  into guilt, notifications engineered for re-engagement, leaderboards of
  strangers, anything requiring a server, anything that phones home.** This app
  exists because of these. The ambitious version is the same restraint applied
  to a larger idea, not a relaxation of it.

## Everything explains itself

Agreed 2026-08-11, delivered at v2.22.0 and v2.23.0. Kept here because it is a
standing requirement on everything built afterwards, not a feature that is done.

The app has invented a lot of vocabulary: six tiers, seventeen techniques, six
move classes, justified placements, stale notes, missed-easier, slow-easy,
p-values, six boards. Zsomb will not recall all of it, and nobody should have to.
Every term the app coins explains itself where it appears.

The mechanism matters more than the copy. A `title` tooltip does nothing on a
touch screen, so hover can never be the primitive here. What shipped, and what
anything new has to follow:

- **Subtext under a label** where there is room. Always visible, costs nothing
  to discover, works everywhere. This is the default.
- **Tap to reveal** where there is not: a dotted underline, and one shared line
  under the group that holds the prompt while nothing is open and the definition
  when something is. A `title` rides along so a pointer gets a hover for free,
  and is never the only route.
- **Defined once, used everywhere.** `src/logic/glossary.js` is the one place,
  and where a definition already lives somewhere true it derives from there
  rather than copying. Same rule that keeps the grader and the hint engine as one
  piece of code.

Rules out: a separate help page, which is where explanations go to be unread,
and any explanation that only appears on hover.

## What to do next

The 2026-08-11 order of work is complete: belief archaeology, self-experiments,
and the constraint engine with variants all shipped.

The honest ranking of what is left:

1. **Wire voice input, or delete it.** Checked rather than assumed:
   `VoiceButton.jsx` is the only module under `src/` with no importer outside its
   own test, so it is the only thing here that is written, tested and
   unreachable. That state is the one this project has already been bitten by
   once, at v1.7.1. Either answer is defensible; leaving it as it is, is not.
2. **The setter.** The largest gain per unit of new machinery, because the
   uniqueness check, the grader and the explanation engine are all already there,
   and it unlocks the puzzle exchange behind it.
3. **A second arithmetic variant**, chosen for being unlike killer, so that the
   rule language has two examples to generalise from instead of one.

Everything else waits.
