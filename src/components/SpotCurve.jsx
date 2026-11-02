import { useState } from 'react'

/**
 * How fast you spot one pattern, deck by deck: a stat tile with a trend.
 *
 * One measure over time, so one series: the latest deck's median seconds to
 * spot as the figure, the first deck as the comparison, and a line through
 * every deck in the de-emphasis ink with the latest point in the accent. Lower
 * is better, and the line falling is what learning a pattern looks like.
 *
 * Every value is reachable without the line: a tap or a focus on a point reads
 * it out in the caption, and a table carries all of them for a screen reader.
 * Static, so it costs nothing on a resting screen.
 */
export default function SpotCurve({ points }) {
  const pts = points.filter(p => p.medianMs != null)
  const [picked, setPicked] = useState(null)
  if (!pts.length) return null

  const last = pts[pts.length - 1]
  const first = pts[0]
  const secs = ms => `${(ms / 1000).toFixed(1)}s`

  const W = 240
  const H = 64
  const PAD = 10
  const max = Math.max(...pts.map(p => p.medianMs)) * 1.15 || 1
  const x = i => (pts.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (pts.length - 1))
  const y = ms => H - PAD - (ms / max) * (H - PAD * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.medianMs).toFixed(1)}`).join('')
  const at = picked != null ? pts[picked] : null

  return (
    <div className="spotTile">
      <div className="spotHead">
        <span className="spotLabel">Seconds to spot</span>
        <span className="spotValue">{secs(last.medianMs)}</span>
        {pts.length > 1 && <span className="spotDelta">from {secs(first.medianMs)} on deck 1</span>}
      </div>
      {pts.length > 1 && (
        <svg
          className="spotPlot"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Median seconds to spot, deck by deck: ${pts.map(p => secs(p.medianMs)).join(', ')}`}
        >
          <line className="spotBase" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
          <path className="spotLine" d={line} />
          {pts.map((p, i) => {
            const isLast = i === pts.length - 1
            return (
              <g key={p.n}>
                <circle
                  className={'spotDot' + (isLast ? ' last' : '') + (picked === i ? ' on' : '')}
                  cx={x(i)}
                  cy={y(p.medianMs)}
                  r={isLast ? 4.5 : 4}
                />
                {/* The hit target, bigger than the mark: a 9px dot is not a
                    thumb's worth of anything. */}
                <circle
                  className="spotHit"
                  cx={x(i)}
                  cy={y(p.medianMs)}
                  r="12"
                  tabIndex={0}
                  role="button"
                  aria-label={`Deck ${p.n}: ${secs(p.medianMs)} a card`}
                  onClick={() => setPicked(picked === i ? null : i)}
                  onFocus={() => setPicked(i)}
                  onMouseEnter={() => setPicked(i)}
                  onMouseLeave={() => setPicked(null)}
                />
              </g>
            )
          })}
        </svg>
      )}
      <p className="spotReadout" aria-live="polite">
        {at
          ? `Deck ${at.n}: ${secs(at.medianMs)} a card, spotted ${Math.round(at.foundRate * at.cards)} of ${at.cards}` +
            (at.removedRate != null ? `, named what it removes ${Math.round(at.removedRate * 100)}% of the time.` : '.')
          : pts.length > 1
            ? 'Tap a point for that deck.'
            : 'One deck so far. The line starts with the second.'}
      </p>
      <table className="srOnly">
        <caption>Drill decks for this pattern</caption>
        <thead>
          <tr><th>Deck</th><th>Median seconds to spot</th><th>Spotted</th></tr>
        </thead>
        <tbody>
          {pts.map(p => (
            <tr key={p.n}>
              <td>{p.n}</td>
              <td>{secs(p.medianMs)}</td>
              <td>{Math.round(p.foundRate * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
