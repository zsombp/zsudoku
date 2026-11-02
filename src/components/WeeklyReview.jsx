import { useMemo } from 'react'
import { weeklyReview } from '../stats/weekly.js'
import { Term, TermGroup } from './Term.jsx'

const percent = n => `${(n * 100).toFixed(1)}%`
const seconds = n => `${(n / 1000).toFixed(1)}s`

export default function WeeklyReview({ games, drills, history, now, onClose }) {
  const report = useMemo(() => weeklyReview(games, { drills, history, now }), [games, drills, history, now])
  return <div className="statsView">
    <header className="top">
      <div className="brand">WEEKLY REVIEW</div>
      <button className="newBtn" onClick={onClose}>Back</button>
    </header>
    <h1>Last seven days</h1>
    <p className="dataNote">From {new Date(report.since).toLocaleDateString()} to {new Date(report.now).toLocaleDateString()}. Based on recorded games that ended in this window and decks on this device; games still in progress are not counted.</p>
    <section className="dueCard">
      <h2>Your week</h2>
      <p>{report.played} games played, {report.finished} finished. {report.clean} of {report.finished} finished games were clean: no mistakes and no hints.</p>
      <p>{report.decks} drill decks, {report.cards} cards.</p>
      <p>Session streak: {report.streak} consecutive days, from {report.sessionDays} retained completed session days.</p>
      {report.sparse && <p className="dataNote">Too little activity for a weekly trend: {report.played} games and {report.decks} decks. These counts are all this week can say reliably.</p>}
    </section>
    {report.stopped.length > 0 && <section className="dueCard">
      <h2>What stopped you</h2>
      <p className="dataNote">By the pattern the position needed, across {report.played} recorded games.</p>
      {report.stopped.map(row => <p key={row.technique}>{row.label}: {row.moments} stuck moments in {row.games} games.</p>)}
    </section>}
    {!report.sparse && <>
      <section className="dueCard">
        <TermGroup>
          <h2>Pattern <Term id="strength">strength</Term></h2>
          <p className="dataNote">Compared with the retained history as it stood seven days ago, including drills. A change describes these encounters, not a prediction.</p>
          {report.changes.map(row => <p key={row.technique}>
            {row.label}: {row.delta > 0 ? 'rose' : 'fell'} from {percent(row.before)} to {percent(row.after)}.
            {' '}Before: {row.beforeSample}. Now: {row.afterSample}.
          </p>)}
          {!report.changes.length && <p>No comparable strength changes in the retained history.</p>}
          {report.firstSeen.map(row => <p key={row.technique}>{row.label}: first evidence this week, {row.sample}; no earlier strength to compare.</p>)}
        </TermGroup>
      </section>
      {report.spotting.length > 0 && <section className="dueCard">
        <h2>Seconds to spot</h2>
        <p className="dataNote">First and last timed deck this week, compared only within the same pattern. Times count correctly spotted cards.</p>
        {report.spotting.map(row => <p key={row.technique}>
          {row.label}: {row.decks} decks, {row.cards} cards.
          {row.timedDecks >= 2
            ? ` Median ${seconds(row.firstMs)} on the first timed deck (${row.firstSpots} correct cards), ${seconds(row.lastMs)} on the last (${row.lastSpots} correct cards), across ${row.timedDecks} timed decks.`
            : ` Only ${row.timedDecks} timed decks; not enough for a trend.`}
        </p>)}
      </section>}
    </>}
  </div>
}
