import { TECHNIQUES } from '../logic/techniques.js'

/**
 * What the hints you took were standing in for, shown after the game.
 *
 * This is where the teaching lives. Zsomb's call, and the right one: during
 * play an explanation interrupts the thing you are enjoying, so the hint button
 * stays one tap and one number. Afterwards, the same information is useful
 * rather than intrusive, because it tells you which pattern you kept failing to
 * spot instead of solving one cell for you.
 *
 * Phase 5 grows this into the real coach, which compares what a puzzle required
 * against where your time actually went.
 */
export default function HintSummary({ hintLog, mistakes }) {
  if (!hintLog?.length && !mistakes) return null

  const counts = {}
  for (const h of hintLog || []) {
    const key = h.technique || 'unknown'
    counts[key] = (counts[key] || 0) + 1
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div className="hintSummary">
      {mistakes > 0 && (
        <div className="hsRow">
          <span className="hsCount">{mistakes}</span>
          <span>{mistakes === 1 ? 'mistake' : 'mistakes'}</span>
        </div>
      )}
      {ranked.map(([key, n]) => (
        <div className="hsRow" key={key}>
          <span className="hsCount">{n}</span>
          <span>
            {n === 1 ? 'hint' : 'hints'} on{' '}
            {key === 'unknown' ? 'a cell we could not prove' : `${TECHNIQUES[key].label}${n > 1 ? 's' : ''}`}
          </span>
        </div>
      ))}
    </div>
  )
}
