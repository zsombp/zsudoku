# Vision

Where this could go, agreed 2026-08-11. `PLAN.md` was the build. This is the
argument for what to build next, and what never to build.

Nothing here is committed. It exists so that a good idea is not lost and a bad
one is not rediscovered.

## The thesis

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

## Pillar 1: the mirror

Self-knowledge. The one that is genuinely unprecedented, and the cheapest,
because the data is already sitting there.

- **Belief archaeology.** Marks are reconstructible at any moment and the truth
  is computable at any moment. So the app can say: this note was already
  impossible at 3:40, you kept it until 7:12, and you reasoned from it in
  between. Nothing else can say that, because nothing else records both halves.
- **Self-experiments.** Randomly vary one assist over twenty games and report
  the result with a p-value. "Auto-pencil is not making you faster, it is making
  you safer." Honest difficulty, extended into honest self-knowledge. Needs no
  new technology at all.
- **Tilt.** Does accuracy drop in the five minutes after a mistake? Measurable
  per person rather than assumed.
- **Flow.** Steady cadence is flow, erratic cadence is struggle. When flow is
  detected the correct behaviour is to get out of the way: hide everything.
- **The nemesis file.** One pattern that keeps winning, tracked across months,
  with escalating intervention rather than the same gentle suggestion forever.
- **Fatigue and circadian curves**, and an honest answer to "am I improving",
  controlling for the possibility of simply playing easier puzzles.

## Pillar 2: the grid

- **Variants**: killer, jigsaw, X-sudoku, sandwich, thermo, arrow, kropki,
  anti-knight, chess constraints. The real move is turning the grader into a
  constraint engine with pluggable rules, so a variant is a rule set rather
  than a fork of everything.
- **A rule language**, so a variant can be described rather than coded, with the
  engine reporting whether puzzles under it are generatable and where they land
  on the scale.
- **The setter.** Design puzzles; the engine reports what yours requires,
  whether the solution is unique, and how the clue symmetry reads.
- **Personalised generation.** Not "Hard" but "requires the two techniques I am
  worst at, solvable in the twelve minutes I have". The grader already records
  what each puzzle needs, so this is a filter.
- **Time prediction** from personal history rather than a global average.

## Pillar 3: the teacher

- **A curriculum of only what this player gets wrong**, scheduled by spaced
  repetition against real failures instead of a fixed syllabus.
- **Socratic hints**: "what do you notice about the 4s in column 3", rather than
  showing the answer or the pattern.
- **Pattern flashcards**: a board fragment, a few seconds, name the pattern.
- **A textbook assembled from your own games**, covering only what you have
  demonstrably not learned.
- **Branch exploration**: replay to any move, play a different line, see where it
  leads. Time-travel debugging for your own reasoning.
- **The narrated match report**: the game as prose. Every ingredient exists.

## Pillar 4: the instrument

- **Apple Pencil handwriting** for digits, with real ink.
- **Voice input**, for hands free.
- **Keyboard speedrunning**, vim-style.
- **Generative ambient audio** that responds to solve state, thinning out in
  flow and marking a stall without saying anything.
- **Solve-path as generative art.** The order cells were filled, weighted by the
  time spent on each, as a printable piece. Every game a unique image.

## Pillar 5: the others, with no server, ever

Every social idea here works with no accounts and no backend, using what is
already built.

- **A puzzle is a seed string**, so sending someone a puzzle is sending a word.
- **Ghost racing** against a past self or against the engine, live.
- **A private league on a shared repository**, exactly the sync mechanism
  already built, pointed at a repo a few friends can write to. Standings,
  head to head on the same daily, shared replays. Free forever, and nothing
  that can be shut down by anyone but you.
- **Puzzle exchange**: post a hand-set puzzle, compare replays move by move.

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
- **Ads, accounts, energy systems, cosmetics as currency, streaks weaponised
  into guilt, notifications engineered for re-engagement, leaderboards of
  strangers, anything requiring a server, anything that phones home.** This app
  exists because of these. The ambitious version is the same restraint applied
  to a larger idea, not a relaxation of it.

## Order of work

1. **Belief archaeology.** Unprecedented, and close to free: both halves are
   already computable.
2. **Self-experiments.** No new technology, and the purest extension of the
   honesty rule.
3. **The constraint engine and variants.** The largest lift by a wide margin,
   and the one that turns a sudoku app into a puzzle engine.

Everything else waits until one of those is done.
