import { useEffect, useMemo, useRef, useState } from 'react'
import { StatTile, Calendar, Histogram, HourBars, TierTrend } from './stats/charts.jsx'
import * as compute from '../stats/compute.js'
import { insights, needed } from '../stats/coach.js'
import { achievements } from '../stats/achievements.js'
import { dailyStreak } from '../logic/daily.js'
import GameReview from './GameReview.jsx'
import * as gameLog from '../lib/gameLog.js'
import { fmtMs } from '../lib/format.js'

const pct = n => `${Math.round(n * 100)}%`

function shortDuration(ms) {
  const h = ms / 3600000
  if (h >= 1) return `${h.toFixed(h >= 10 ? 0 : 1)}h`
  return `${Math.round(ms / 60000)}m`
}

export default function StatsView({ onClose, onPractice }) {
  const [games, setGames] = useState(null)
  const [showNumbers, setShowNumbers] = useState(false)
  const [notice, setNotice] = useState(null)
  const [reviewing, setReviewing] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    gameLog.all().then(g => setGames(g.sort((a, b) => a.endedAt - b.endedAt)))
  }, [])

  const derived = useMemo(() => {
    if (!games) return null
    return {
      overview: compute.overview(games),
      tiers: compute.byTier(games),
      calendar: compute.calendar(games),
      histogram: compute.durationHistogram(games),
      hours: compute.byHour(games),
      coach: insights(games),
      daily: dailyStreak(games),
      badges: achievements(games),
    }
  }, [games])

  async function doExport() {
    const json = await gameLog.exportJson()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `zsudoku-backup-${compute.dayKey(Date.now())}.json`
    a.click()
    URL.revokeObjectURL(url)
    setNotice(`Exported ${games.length} games.`)
  }

  async function doImport(file) {
    try {
      const result = await gameLog.importJson(await file.text())
      const fresh = await gameLog.all()
      setGames(fresh.sort((a, b) => a.endedAt - b.endedAt))
      setNotice(`Imported ${result.added} games, skipped ${result.skipped} already here.`)
    } catch (err) {
      setNotice(String(err.message || err))
    }
  }

  if (!derived) {
    return (
      <div className="statsView">
        <StatsHeader onClose={onClose} />
        <div className="statsEmpty">Loading…</div>
      </div>
    )
  }

  if (reviewing) {
    return (
      <div className="statsView">
        <GameReview
          game={reviewing}
          onBack={() => setReviewing(null)}
          onPractice={onPractice}
          onDelete={async g => {
            await gameLog.removeGame(g.id, g.endedAt)
            setReviewing(null)
            const rest = await gameLog.all()
            setGames(rest.sort((a, b) => a.endedAt - b.endedAt))
            setNotice('Game deleted. The next sync removes it from your other device too.')
          }}
        />
      </div>
    )
  }

  const { overview: o, tiers, coach } = derived

  if (!games.length) {
    return (
      <div className="statsView">
        <StatsHeader onClose={onClose} />
        <div className="statsEmpty">
          <p>Nothing recorded yet.</p>
          <p className="statsEmptySub">
            Finish a game and it appears here. Nothing is uploaded anywhere; the history lives on this
            device only.
          </p>
          <ImportRow fileRef={fileRef} onImport={doImport} notice={notice} />
        </div>
      </div>
    )
  }

  return (
    <div className="statsView">
      <StatsHeader onClose={onClose} />

      {/* Exactly one hero figure per view. */}
      <div className="hero">
        <div className="heroValue">{o.completed}</div>
        <div className="heroLabel">
          {o.completed === 1 ? 'puzzle solved' : 'puzzles solved'}
          {o.played > o.completed && ` · ${o.played} started`}
        </div>
      </div>

      <div className="tiles">
        <StatTile label="Win rate" value={pct(o.winRate)} sub={`${o.completed}/${o.played}`} />
        <StatTile label="Current streak" value={o.currentStreak} sub={`best ${o.longestStreak}`} />
        <StatTile
          label="Time played"
          value={shortDuration(o.totalMs)}
          sub={`${o.daysPlayed} ${o.daysPlayed === 1 ? 'day' : 'days'}`}
        />
        <StatTile label="Median solve" value={fmtMs(o.medianMs)} sub={`fastest ${fmtMs(o.fastest)}`} />
        <StatTile label="Mistakes" value={o.mistakesPerGame.toFixed(1)} sub="per solve" />
        <StatTile
          label="Daily streak"
          value={derived.daily.current}
          sub={derived.daily.total ? `${derived.daily.total} done` : 'none yet'}
        />
      </div>

      <Section title="What the numbers say">
        {coach.length ? (
          coach.map(c => (
            <div className="insight" key={c.id}>
              <div className="insightTitle">{c.title}</div>
              <div className="insightBody">{c.body}</div>
              <div className="insightSample">based on {c.sample}</div>
              {c.practice && onPractice && (
                <button className="newBtn insightAct" onClick={() => onPractice(c.practice)}>
                  Practise this now
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="insightBody">{needed(games)}</div>
        )}
      </Section>

      <Section title={`Achievements · ${derived.badges.filter(b => b.earned).length}/${derived.badges.length}`}>
        <div className="badges">
          {derived.badges.map(b => (
            <div className={'badge' + (b.earned ? ' earned' : '')} key={b.id}>
              <div className="badgeTop">
                <span className="badgeName">{b.name}</span>
                {b.detail && <span className="badgeDetail">{b.detail}</span>}
              </div>
              <div className="badgeDesc">{b.description}</div>
              {!b.earned && b.progress > 0 && (
                <div className="badgeTrack">
                  <div className="badgeFill" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recent games">
        <div className="gameList">
          {[...games].reverse().slice(0, 12).map(g => (
            <button className="gameRow" key={g.id} onClick={() => setReviewing(g)}>
              <span className="grTier">{g.graded}</span>
              <span className="grMeta">
                {new Date(g.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {g.daily && ' · daily'}
                {!g.completed && ' · unfinished'}
              </span>
              <span className="grTime">{fmtMs(g.durationMs)}</span>
              <span className="grFlags">
                {g.mistakes > 0 && <em title="mistakes">{g.mistakes}✕</em>}
                {g.hints > 0 && <em title="hints">{g.hints}?</em>}
                {g.mistakes === 0 && g.hints === 0 && <em className="clean">clean</em>}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Last 17 weeks">
        <Calendar days={derived.calendar} />
      </Section>

      <Section title="Solve times by tier">
        <div className="trends">
          {tiers.map(t => (
            <TierTrend key={t.tier} label={t.tier} values={t.recent} best={t.best} />
          ))}
        </div>
      </Section>

      {derived.histogram.length > 0 && (
        <Section title="How long solves take">
          <Histogram bins={derived.histogram} />
        </Section>
      )}

      <Section title="When you play">
        <HourBars hours={derived.hours} />
      </Section>

      <Section title="Data">
        <label className="toggle">
          <input type="checkbox" checked={showNumbers} onChange={e => setShowNumbers(e.target.checked)} />
          <span>Show numbers</span>
        </label>

        {showNumbers && (
          <div className="tableWrap">
          <table className="statTable">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Played</th>
                <th>Done</th>
                <th>Best</th>
                <th>Median</th>
                <th>Mistakes</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => (
                <tr key={t.tier}>
                  <td>{t.tier}</td>
                  <td>{t.played}</td>
                  <td>{t.completed}</td>
                  <td>{t.best ? fmtMs(t.best) : '–'}</td>
                  <td>{t.medianMs ? fmtMs(t.medianMs) : '–'}</td>
                  <td>{t.completed ? t.mistakes.toFixed(1) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <div className="dataRow">
          <button className="newBtn" onClick={doExport}>Export backup</button>
          <ImportRow fileRef={fileRef} onImport={doImport} />
        </div>
        <p className="dataNote">
          Browser storage can be cleared without warning. An export is a plain JSON file you keep
          yourself, and importing it merges rather than overwrites.
        </p>
        {notice && <p className="dataNote notice">{notice}</p>}
      </Section>
    </div>
  )
}

function StatsHeader({ onClose }) {
  return (
    <header className="top">
      <div className="brand">STATISTICS</div>
      <button className="newBtn" onClick={onClose}>Back to game</button>
    </header>
  )
}

function Section({ title, children }) {
  return (
    <section className="statSection">
      <h2 className="statHeading">{title}</h2>
      {children}
    </section>
  )
}

function ImportRow({ fileRef, onImport, notice }) {
  return (
    <>
      <button className="newBtn" onClick={() => fileRef.current?.click()}>Import backup</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onImport(f)
          e.target.value = ''
        }}
      />
      {notice && <p className="dataNote notice">{notice}</p>}
    </>
  )
}
