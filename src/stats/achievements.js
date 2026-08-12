// Achievements, derived from the game history rather than stored.
//
// Nothing is written when one is earned: each is a pure question asked of the
// records. That means they can never drift out of sync with reality, importing
// a backup restores them for free, and adding a new one retroactively awards it
// for games already played.
//
// They are also deliberately unshowy. There is nobody to show them to.

import { TIERS } from '../logic/difficulty.js'
import { dailyStreak } from '../logic/daily.js'
import { fmtMs } from '../lib/format.js'
import { streaks } from './compute.js'

const done = games => games.filter(g => g.completed)

/** A count-based achievement, with progress toward the next one. */
const counter = (id, name, description, value, target) => ({
  id,
  name,
  description,
  earned: value >= target,
  progress: Math.min(1, target ? value / target : 0),
  detail: `${Math.min(value, target)}/${target}`,
})

export function achievements(games) {
  const finished = done(games)
  const clean = finished.filter(g => g.mistakes === 0 && g.hints === 0)
  const noPencil = finished.filter(g => !(g.moveLog || []).some(m => m.kind === 'pencil' || m.kind === 'autoPencil'))
  const s = streaks(games)
  const daily = dailyStreak(games)

  const fastest = tier => {
    const times = finished.filter(g => g.graded === tier).map(g => g.durationMs)
    return times.length ? Math.min(...times) : Infinity
  }

  const tiersCleared = TIERS.filter(t => finished.some(g => g.graded === t.name)).length

  const nightOwl = finished.some(g => {
    const h = new Date(g.endedAt).getHours()
    return h >= 0 && h < 4
  })

  const list = [
    counter('first', 'First blood', 'Finish a puzzle.', finished.length, 1),
    counter('ten', 'Getting the hang of it', 'Finish ten puzzles.', finished.length, 10),
    counter('fifty', 'Regular', 'Finish fifty puzzles.', finished.length, 50),
    counter('hundred', 'Centurion', 'Finish a hundred puzzles.', finished.length, 100),

    counter('clean', 'Spotless', 'Finish a puzzle with no mistakes and no hints.', clean.length, 1),
    counter('clean-ten', 'Surgical', 'Finish ten puzzles clean.', clean.length, 10),

    counter('all-tiers', 'Full sweep', 'Finish a puzzle at every tier.', tiersCleared, TIERS.length),
    {
      id: 'diabolical',
      name: 'Nerves of steel',
      description: 'Finish a Diabolical puzzle.',
      earned: finished.some(g => g.graded === 'Diabolical'),
      progress: finished.some(g => g.graded === 'Diabolical') ? 1 : 0,
      detail: finished.some(g => g.graded === 'Diabolical') ? 'done' : 'not yet',
    },

    counter('streak-7', 'Habit', 'Play seven days in a row.', s.longestStreak, 7),
    counter('streak-30', 'Devotion', 'Play thirty days in a row.', s.longestStreak, 30),

    counter('daily-7', 'Week of dailies', 'Finish seven daily puzzles in a row.', daily.longest, 7),
    counter('daily-30', 'Month of dailies', 'Finish thirty daily puzzles in a row.', daily.longest, 30),

    {
      id: 'quick-medium',
      name: 'Quickfire',
      description: 'Finish a Medium puzzle in under five minutes.',
      earned: fastest('Medium') < 300000,
      progress: fastest('Medium') < 300000 ? 1 : 0,
      // m:ss, like every other time on this screen. Raw seconds read as a
      // different unit of measurement sitting next to "median solve 7:06".
      detail: Number.isFinite(fastest('Medium')) ? `best ${fmtMs(fastest('Medium'))}` : 'not yet',
    },
    {
      id: 'no-pencil',
      name: 'All in your head',
      description: 'Finish a Hard puzzle or above without a single pencil mark.',
      earned: noPencil.some(g => ['Hard', 'Expert', 'Diabolical'].includes(g.graded)),
      progress: noPencil.some(g => ['Hard', 'Expert', 'Diabolical'].includes(g.graded)) ? 1 : 0,
      detail: noPencil.some(g => ['Hard', 'Expert', 'Diabolical'].includes(g.graded)) ? 'done' : 'not yet',
    },
    {
      id: 'night-owl',
      name: 'Night owl',
      description: 'Finish a puzzle between midnight and 4am.',
      earned: nightOwl,
      progress: nightOwl ? 1 : 0,
      // Every other badge says where it stands. This one said nothing at all,
      // so it rendered as a name over an empty line and read like a bug.
      detail: nightOwl ? 'done' : 'not yet',
    },
  ]

  // Fill in progress for the boolean ones so the bar is never half-rendered.
  return list.map(a => ({ ...a, progress: a.earned ? 1 : a.progress }))
}

export const earnedCount = games => achievements(games).filter(a => a.earned).length
