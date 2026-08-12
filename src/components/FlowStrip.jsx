import { useState } from 'react'
import { fmtMs } from '../lib/format.js'
import { Term, TermGroup } from './Term.jsx'

/**
 * Where the flow and the struggle actually sat, along the game's own clock.
 *
 * The heatmap next to this says where the time went on the grid. This says when
 * it went, which is a different question and the one the cadence answers: the
 * two together are the whole of "how did that game feel".
 *
 * The segments do not tile the bar and are not meant to. The gaps between them
 * are ordinary play, which is most of a game and is not a finding. The track
 * behind them is drawn in the plain panel colour for exactly that reason.
 *
 * Every segment is a button rather than a title attribute. A title is nothing at
 * all on a phone, which is the device this app is mostly played on, so tapping a
 * band opens its line of detail underneath. The title is there as well, so a
 * pointer gets the hover for free.
 */
/** Nothing narrower than this is a target, and a one-move struggle is real. */
const MIN_BAND = 1.2

/**
 * Every segment as a percentage of the game's own clock.
 *
 * Pure, and separate from the drawing, because the arithmetic is the part that
 * can be silently wrong: a game whose whole log carries `t: 0` gives a total of
 * zero, and dividing by it puts NaN into a style attribute, which renders as an
 * empty bar rather than as an error. Clamped as well, so a segment can never be
 * drawn hanging off the end of the track it belongs to.
 */
export function bandsFor(summary) {
  const total = summary?.totalMs > 0 ? summary.totalMs : 0
  if (!total) return []
  return (summary.segments || []).map(s => {
    const width = Math.min(100, Math.max(MIN_BAND, (s.ms / total) * 100))
    // The minimum has to be applied before the clamp, not after: widening a
    // segment that already ends at the last placement pushed it a fraction past
    // the end of the track, where the overflow hid it. A late sliver is pulled
    // back instead of being allowed to grow rightwards off the bar.
    const left = Math.max(0, Math.min(100 - width, (s.startMs / total) * 100))
    return { seg: s, left, width }
  })
}

export default function FlowStrip({ summary }) {
  const [open, setOpen] = useState(null)

  if (!summary.enough) {
    return (
      <p className="dataNote">
        Only {summary.placements} placements here, and it takes {summary.needs} before a game has a
        rhythm worth reading. A short game and a game with no rhythm in it are different statements,
        so this says nothing rather than drawing an empty bar.
      </p>
    )
  }

  const bands = bandsFor(summary)
  const seg = summary.segments[open] || null

  return (
    <div className="flowWrap">
      <div className="flowBar" aria-label="Flow and struggle across the game">
        {bands.map(({ seg: s, left, width }, i) => (
          <button
            key={s.from}
            className={'flowSeg ' + s.kind + (open === i ? ' on' : '')}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${s.kind === 'flow' ? 'Flow' : 'Struggle'}: ${s.moves} placements from ${fmtMs(s.startMs)}`}
            aria-label={`${s.kind === 'flow' ? 'Flow' : 'Struggle'} at ${fmtMs(s.startMs)}, ${s.moves} placements`}
            onClick={() => setOpen(open === i ? null : i)}
          />
        ))}
      </div>
      <div className="flowScale">
        <span>0:00</span>
        <span>{fmtMs(summary.totalMs)}</span>
      </div>

      {seg ? (
        <p className={'timeNote ' + (seg.kind === 'flow' ? 'good' : 'warn')}>
          {seg.kind === 'flow' ? 'Flow' : 'Struggle'} from {fmtMs(seg.startMs)} to {fmtMs(seg.endMs)}:{' '}
          {seg.moves} placements at {(seg.msPerMove / 1000).toFixed(1)} seconds each
          {seg.wrong > 0 && `, ${seg.wrong} of them wrong`}. Gaps spread by {seg.spread.toFixed(2)}x
          inside it.
        </p>
      ) : (
        <p className="dataNote">
          {summary.segments.length === 0
            ? 'No stretch of this game was steady enough to call flow or broken enough to call a struggle. That is most games.'
            : 'Tap a band for what happened in it. Everything between them was ordinary play.'}
        </p>
      )}

      {/* Flow and struggle are both read off the cadence and neither is what
          the words normally mean here: eight placements at a steady pace, and
          four that were slow or wildly uneven. The bands are colours, so the
          words in the key are what you press. */}
      <TermGroup hint="Tap a word here for how it is measured.">
        <div className="flowKey">
          <span><i className="flowSwatch flow" /> <Term id="flow">flow</Term></span>
          <span><i className="flowSwatch struggle" /> <Term id="struggle">struggle</Term></span>
          <span><i className="flowSwatch" /> ordinary</span>
          {/* Two shares, and they are not the same number. Flow is quick by
              definition, so a stretch holding a quarter of the digits holds a
              twelfth of the minutes. Showing one without saying which it is would
              be the misleading half. */}
          <span className="flowShares">
            <Term id="flowShare">
              {Math.round(summary.flowMoveShare * 100)}% of digits in flow
            </Term>
            {' · '}
            {Math.round(summary.flowShare * 100)}% of the clock
          </span>
        </div>
      </TermGroup>
    </div>
  )
}
