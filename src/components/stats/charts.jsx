// Hand-rolled SVG charts. No chart library: it keeps the bundle small and the
// offline story pure, and none of these needs more than a few paths.
//
// Specs held across all of them: bars capped in thickness with a 4px rounded
// data-end and a square baseline, 2px lines with round caps, markers with a 2px
// surface ring, hairline solid gridlines, a 2px surface gap between adjacent
// bars, and text in text tokens rather than the data colour. Every series here
// is single, so none of them carries a legend: the heading says what is
// plotted. Values are reachable without hovering via the "Show numbers" table
// on the stats screen, so tooltips enhance rather than gate.

import { fmtMs } from '../../lib/format.js'
import { TermButton, termLabel } from '../Term.jsx'

/** Column with a rounded top and a square baseline. */
function columnPath(x, y, w, h, r = 4) {
  const radius = Math.min(r, w / 2, h)
  if (h <= 0) return ''
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

/**
 * A number with a label, and the label says what it counts.
 *
 * `term` names the glossary entry, which supplies the label as well as the
 * sentence: a tile headed "Win rate" that explains "Median solve" is the exact
 * failure this whole exercise is against, and reading both from one id makes it
 * unrepresentable. Passing `label` alongside `term` overrides the word on screen
 * and is for the few places where the figure is a summary of the term rather
 * than the term itself, such as the median of a game's dwell; Term.test.js keeps
 * that list short.
 *
 * Measured at 375px: printing the definition inside the tile takes it from 68px
 * to 187px, so the tile is a trigger and the answer appears under the grid.
 */
export function StatTile({ label, value, sub, term }) {
  const body = (
    <>
      <span className="tileLabel">{label ?? termLabel(term)}</span>
      <span className="tileValue">{value}</span>
      {sub && <span className="tileSub">{sub}</span>}
    </>
  )
  if (!term) return <div className="tile">{body}</div>
  return <TermButton id={term} className="tile">{body}</TermButton>
}

/**
 * The smaller version, for the row of figures under a review.
 *
 * Lived twice, in GameReview and in SolveArt, which is one definition of a fact
 * too many now that they all carry an explanation.
 */
export function Fact({ label, value, sub, term }) {
  const body = (
    <>
      <span className="factValue">{value}</span>
      <span className="factLabel">{label ?? termLabel(term)}</span>
      {sub && <span className="factSub">{sub}</span>}
    </>
  )
  if (!term) return <div className="fact">{body}</div>
  return <TermButton id={term} className="fact">{body}</TermButton>
}

/**
 * Calendar heatmap. Sequential ramp, four steps, most recent column on the
 * right. Quantised into four classes rather than a continuous scale, because
 * past about seven bins adjacent classes blur.
 */
export function Calendar({ days }) {
  const CELL = 11
  const GAP = 3
  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  const max = Math.max(1, ...days.map(d => d.count))
  const level = c => (c === 0 ? 0 : c >= max ? 4 : Math.min(3, Math.ceil((c / max) * 3)))

  const w = weeks.length * (CELL + GAP)
  const h = 7 * (CELL + GAP)

  return (
    // height auto rather than a fixed pixel height: with a fixed height the
    // default preserveAspectRatio letterboxes the grid at its natural 238px and
    // floats it in the middle of a wide column. Letting the height follow the
    // width lets it scale, and the max-width in CSS stops it getting silly.
    <svg className="chart calChart" viewBox={`0 0 ${w} ${h}`} width="100%" role="img"
      aria-label={`Games played per day over the last ${days.length} days`}>
      {weeks.map((week, wi) =>
        week.map((d, di) => (
          <rect
            key={d.key}
            x={wi * (CELL + GAP)}
            y={di * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx="2.5"
            className={`cal l${level(d.count)}`}
          >
            <title>{`${d.key}: ${d.count} ${d.count === 1 ? 'game' : 'games'}`}</title>
          </rect>
        ))
      )}
    </svg>
  )
}

/** Solve-time distribution. Single series, so no legend. */
export function Histogram({ bins }) {
  const W = 320
  const PLOT = 90
  const AXIS = 16 // the x-axis band, inside the viewBox so it never gets clipped
  const H = PLOT + AXIS
  const GAP = 2 // surface gap between adjacent bars
  const max = Math.max(1, ...bins.map(b => b.count))
  const slot = W / bins.length
  const barW = Math.min(24, slot - GAP)

  return (
    <svg className="chart flexChart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Distribution of solve times">
      <line x1="0" y1={PLOT} x2={W} y2={PLOT} className="axis" />
      {bins.map((b, i) => {
        const h = (b.count / max) * (PLOT - 8)
        const x = i * slot + (slot - barW) / 2
        return (
          <path key={i} d={columnPath(x, PLOT - h, barW, h)} className="mark">
            <title>{`${fmtMs(b.from)} to ${fmtMs(b.to)}: ${b.count} ${b.count === 1 ? 'game' : 'games'}`}</title>
          </path>
        )
      })}
      <text x="0" y={H - 3} className="tick">{fmtMs(bins[0]?.from || 0)}</text>
      <text x={W} y={H - 3} textAnchor="end" className="tick">{fmtMs(bins[bins.length - 1]?.to || 0)}</text>
    </svg>
  )
}

/** When you actually play. Columns, not a radial: comparing lengths is easier. */
export function HourBars({ hours }) {
  const W = 320
  const PLOT = 70
  const AXIS = 14
  const H = PLOT + AXIS
  const GAP = 2
  const max = Math.max(1, ...hours.map(h => h.count))
  const slot = W / 24
  const barW = Math.min(24, slot - GAP)

  return (
    <svg className="chart flexChart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Games played by hour of day">
      <line x1="0" y1={PLOT} x2={W} y2={PLOT} className="axis" />
      {hours.map((h, i) => {
        // Minimum 2px so an empty hour reads as a zero, not as the chart ending.
        const bh = h.count ? (h.count / max) * (PLOT - 6) : 2
        const x = i * slot + (slot - barW) / 2
        return (
          <path key={i} d={columnPath(x, PLOT - bh, barW, bh)} className={h.count ? 'mark' : 'markEmpty'}>
            <title>{`${String(i).padStart(2, '0')}:00 — ${h.count} ${h.count === 1 ? 'game' : 'games'}`}</title>
          </path>
        )
      })}
      {[0, 6, 12, 18].map(i => (
        <text key={i} x={i * slot} y={H - 2} className="tick">{String(i).padStart(2, '0')}</text>
      ))}
    </svg>
  )
}

/**
 * One small line per tier rather than six coloured lines on one plot.
 *
 * Small multiples instead of a categorical palette: six hues would fight the
 * app's two-colour design and bury the only thing the chart is for, which is
 * whether the line goes down.
 */
export function TierTrend({ label, values, best }) {
  const W = 150
  const H = 40
  const PAD = 5

  if (values.length < 2) {
    return (
      <div className="trend">
        <div className="trendHead">
          <span>{label}</span>
          <span className="trendMeta">{values.length ? fmtMs(best) : 'no games yet'}</span>
        </div>
        <div className="trendEmpty">needs 2 finished games</div>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const x = i => PAD + (i / (values.length - 1)) * (W - PAD * 2)
  const y = v => PAD + (1 - (v - min) / span) * (H - PAD * 2)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const areaFill = `${line} L${x(values.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`
  const lastX = x(values.length - 1)
  const lastY = y(values[values.length - 1])

  return (
    <div className="trend">
      <div className="trendHead">
        <span>{label}</span>
        <span className="trendMeta">best {fmtMs(best)}</span>
      </div>
      <svg className="chart flexChart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`${label} solve times, last ${values.length} games, most recent ${fmtMs(values[values.length - 1])}`}>
        <path d={areaFill} className="area" />
        <path d={line} className="line" />
        {/* Surface ring so the end marker stays legible where it meets the line. */}
        <circle cx={lastX} cy={lastY} r="4.5" className="endDot" />
        <title>{`Most recent: ${fmtMs(values[values.length - 1])}`}</title>
      </svg>
    </div>
  )
}
