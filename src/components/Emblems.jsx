/**
 * The drawn marks: one emblem per tier, one per achievement, and the mark a
 * screen shows when it has nothing to show yet.
 *
 * Drawn rather than decorated. The six tier emblems escalate in *geometric
 * complexity*, not in ornament: Gentle is a circle with a centre, and Diabolical
 * is that same centre buried inside a lattice. That is the whole idea, and it is
 * the reason the set reads as a scale rather than as six unrelated badges. A
 * seventh tier, if one ever exists, has to say where it sits on that ramp.
 *
 * Everything here strokes in `currentColor` and fills only with `--panel`, so a
 * mark takes the accent of whichever of the six themes is on and can never
 * disagree with the tier label sitting next to it. No file, no request, no
 * dependency, and it recolours for free.
 *
 * Drawn in the same vocabulary as `Icons.jsx`: round caps and joins, no fill,
 * a square box. The stroke is lighter than the icons' 2px because these render
 * at 3 to 4 times the size and a 2px stroke at 52px looks like a logo from 1998.
 */

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 52 52',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

const Mark = ({ size = 26, width = 1.6, children, ...rest }) => (
  <svg {...base} width={size} height={size} strokeWidth={width} {...rest}>
    {children}
  </svg>
)

/* One centre, and progressively more standing between you and it. */
const TIERS = {
  Gentle: (
    <>
      <circle cx="26" cy="26" r="15" />
      <circle cx="26" cy="26" r="3.2" fill="currentColor" stroke="none" />
    </>
  ),
  /* One division, then three. Easy was drawn as an arc following the top of the
     circle, which at the 22px these render at sat exactly on the circle's own
     edge: Gentle and Easy were indistinguishable on the dashboard, which is the
     one thing a scale may not be. A diameter crosses the shape instead of
     tracing it, so it survives being small. */
  Easy: (
    <>
      <circle cx="26" cy="26" r="15" />
      <path d="M11 26h30" />
      <circle cx="26" cy="26" r="3.2" fill="currentColor" stroke="none" />
    </>
  ),
  /* An inscribed shape rather than three radii from the centre. Three spokes at
     90/210/330 is the Mercedes star, and a tier button is not the place to make
     somebody think about a car. */
  Medium: (
    <>
      <circle cx="26" cy="26" r="15" />
      <path d="M26 11L39 33.5L13 33.5Z" />
      <circle cx="26" cy="26" r="3.2" fill="currentColor" stroke="none" />
    </>
  ),
  Hard: (
    <>
      <rect x="13" y="13" width="26" height="26" rx="2" />
      <rect x="13" y="13" width="26" height="26" rx="2" transform="rotate(45 26 26)" />
      <circle cx="26" cy="26" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  Expert: (
    <>
      <path d="M26 9l4.9 11.6 12.6 1.1-9.5 8.3 2.8 12.3L26 35.8 15.2 42.3 18 30 8.5 21.7l12.6-1.1z" />
      <path d="M26 20.5v11M20.5 26h11" />
    </>
  ),
  Diabolical: (
    <>
      <path d="M26 8l15.6 9v18L26 44 10.4 35V17z" />
      <path d="M26 8v36M10.4 17l31.2 18M41.6 17L10.4 35" />
      {/* Knocked out of the lattice with the panel colour rather than drawn over
          it, so the centre stays a hole at every size instead of turning into a
          smudge where six strokes meet. */}
      <circle cx="26" cy="26" r="4.6" fill="var(--panel)" stroke="none" />
      <circle cx="26" cy="26" r="4.6" />
    </>
  ),
}

/**
 * The mark for a tier. Unknown tiers render nothing rather than a placeholder:
 * a tier this file has not been taught is a bug to notice, not a hole to fill
 * with a generic shape that will be mistaken for a real one.
 */
export function TierEmblem({ tier, size = 26, width = 1.6, className }) {
  const art = TIERS[tier]
  if (!art) return null
  return (
    <Mark size={size} width={width} className={className}>
      {art}
    </Mark>
  )
}

export const TIER_EMBLEMS = Object.keys(TIERS)

/* Silhouette carries the category, so the set is tellable apart across a grid
 * without reading any of it. There are fifteen achievements and eight marks,
 * which is the point: the ones that are the same kind of thing look like it.
 *
 *   count     how many games, a stack of finished boards
 *   clean     a shield, for finishing without a mistake
 *   unaided   the hint, struck out
 *   tiers     difficulty, as a rising ladder
 *   streak    a shield again, for coming back
 *   daily     a calendar, for the dailies specifically
 *   fast      a stopwatch
 *   night     a crescent
 *
 * Two shields on purpose. Spotless and Habit are both "kept a standard up", and
 * the pair reads as a family next to the stopwatch and the moon.
 */
const BADGES = {
  count: (
    <>
      <rect x="9" y="19" width="24" height="24" rx="3" />
      <path d="M17 14h20a3 3 0 0 1 3 3v20" opacity="0.55" />
      <path d="M24 9h16a3 3 0 0 1 3 3v16" opacity="0.3" />
    </>
  ),
  tiers: (
    <>
      <path d="M13 39v-7M21 39v-13M29 39v-19M37 39v-25" strokeWidth="2.4" />
      <path d="M9 43h34" opacity="0.5" />
    </>
  ),
  daily: (
    <>
      <rect x="10" y="13" width="32" height="29" rx="3" />
      <path d="M10 22h32" />
      <path d="M19 9v7M33 9v7" strokeWidth="2.2" />
      <path d="M20 31.5l4 4 8-9" strokeWidth="2.2" />
    </>
  ),
  night: (
    <>
      <path d="M30 8a18 18 0 1 0 12 31A19 19 0 0 1 30 8z" />
      <circle cx="41" cy="13" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  clean: (
    <>
      <path d="M26 7l14 6v13c0 9.5-6 16-14 19-8-3-14-9.5-14-19V13z" />
      <path d="M19 26.5l5 5 10-11" strokeWidth="2.4" />
    </>
  ),
  fast: (
    <>
      <circle cx="26" cy="27" r="14" />
      <path d="M26 19v8l5.5 3.5" strokeWidth="2.4" />
      <path d="M20 8h12" />
    </>
  ),
  unaided: (
    <>
      <path d="M20 34c0-7 12-7 12-15a6 6 0 0 0-12 0" opacity="0.4" />
      <circle cx="26" cy="40" r="1.8" fill="currentColor" stroke="none" opacity="0.4" />
      <path d="M12 12l28 28" strokeWidth="2.4" />
    </>
  ),
  streak: (
    <>
      <path d="M26 7l14 6v13c0 9.5-6 16-14 19-8-3-14-9.5-14-19V13z" />
      <path d="M26 18v9M26 33.5h.01" strokeWidth="2.4" />
    </>
  ),
}

/**
 * Which mark belongs to which achievement.
 *
 * Keyed by the ids in `src/stats/achievements.js`, and a test fails if that file
 * grows an achievement this map has not heard of. Same rule the glossary
 * follows: the drawn set is not allowed to quietly fall behind the real one, and
 * a badge with no mark would render as a hole in the grid rather than as an
 * error anybody notices.
 *
 * The mapping lives here rather than as a field on each achievement, because
 * which picture to draw is a question about this file and `src/stats/` is meant
 * to stay free of anything presentational.
 */
const BADGE_ART = {
  first: 'count',
  ten: 'count',
  fifty: 'count',
  hundred: 'count',
  clean: 'clean',
  'clean-ten': 'clean',
  'all-tiers': 'tiers',
  diabolical: 'tiers',
  'streak-7': 'streak',
  'streak-30': 'streak',
  'daily-7': 'daily',
  'daily-30': 'daily',
  'quick-medium': 'fast',
  'no-pencil': 'unaided',
  'night-owl': 'night',
}

export const BADGE_IDS = Object.keys(BADGE_ART)

export function BadgeMark({ id, size = 30, className }) {
  const art = BADGES[BADGE_ART[id]]
  if (!art) return null
  return (
    <Mark size={size} width={1.6} className={className}>
      {art}
    </Mark>
  )
}

/**
 * What a screen shows before it has anything to say.
 *
 * A box of the board with one cell picked out and empty, which is literally the
 * situation: there is a space here and nothing in it yet. Deliberately not a
 * shrug, a face or an apology.
 */
export function EmptyMark({ size = 92, className }) {
  return (
    <svg
      {...base}
      viewBox="0 0 120 76"
      width={size}
      height={(size * 76) / 120}
      strokeWidth="1.5"
      className={className}
    >
      <g opacity="0.3">
        <rect x="26" y="10" width="18" height="18" rx="2" />
        <rect x="44" y="10" width="18" height="18" rx="2" />
        <rect x="62" y="10" width="18" height="18" rx="2" />
        <rect x="26" y="28" width="18" height="18" rx="2" />
        <rect x="62" y="28" width="18" height="18" rx="2" />
        <rect x="26" y="46" width="18" height="18" rx="2" />
        <rect x="44" y="46" width="18" height="18" rx="2" />
        <rect x="62" y="46" width="18" height="18" rx="2" />
      </g>
      <rect x="44" y="28" width="18" height="18" rx="2" strokeWidth="2" />
    </svg>
  )
}
