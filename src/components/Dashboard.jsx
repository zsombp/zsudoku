import { useEffect, useState } from 'react'
import { TIERS } from '../logic/difficulty.js'
import { fmtMs } from '../lib/format.js'
import * as gameLog from '../lib/gameLog.js'
import * as compute from '../stats/compute.js'
import { dailyStreak } from '../logic/daily.js'
import { Calendar, Chart, Gear, Play, Trophy } from './Icons.jsx'

/**
 * The home screen.
 *
 * The app used to drop you straight onto a board, which meant the daily, the
 * streaks and the history were all things you had to go looking for. This is
 * the front door: what is in progress, what today's puzzle is, how you are
 * doing, and every way in.
 */
export default function Dashboard({ inProgress, daily, records, onResume, onPick, onDaily, onStats, onSettings }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    gameLog.all().then(games => {
      setSummary({ ...compute.overview(games), daily: dailyStreak(games) })
    })
  }, [])

  const pctDone = inProgress
    ? Math.round(((81 - inProgress.empty) / 81) * 100)
    : 0

  return (
    <div className="dash">
      <header className="dashTop">
        <div className="brand">ZSUDOKU</div>
        <div className="topBtns">
          <button className="iconBtn" aria-label="Statistics" onClick={onStats}><Chart size={17} /></button>
          <button className="iconBtn" aria-label="Settings" onClick={onSettings}><Gear size={17} /></button>
        </div>
      </header>

      <div className="dashGrid">
        <div className="dashCol">
          {inProgress ? (
            <button className="card cardPrimary" onClick={onResume}>
              <span className="cardKicker">Continue</span>
              <span className="cardTitle">
                {inProgress.mode === 'daily' ? `${daily.weekday} puzzle` : inProgress.graded}
              </span>
              <span className="cardMeta">
                {fmtMs(inProgress.elapsedMs)} · {pctDone}% filled
                {inProgress.mode !== 'daily' && ` · ${inProgress.tech}`}
              </span>
              <span className="cardTrack"><span className="cardFill" style={{ width: `${pctDone}%` }} /></span>
              <span className="cardGo"><Play size={16} /></span>
            </button>
          ) : (
            <button className="card cardPrimary" onClick={() => onPick('Medium')}>
              <span className="cardKicker">Start</span>
              <span className="cardTitle">New puzzle</span>
              <span className="cardMeta">Medium · pointing, box-line</span>
              <span className="cardGo"><Play size={16} /></span>
            </button>
          )}

          <button
            className={'card cardDaily' + (daily.done ? ' isDone' : '')}
            onClick={onDaily}
          >
            <span className="cardKicker">
              <Calendar size={13} /> Daily
              {daily.streak > 0 && <span className="streakPip">{daily.streak}</span>}
            </span>
            <span className="cardTitle">{daily.weekday}</span>
            <span className="cardMeta">
              {daily.done
                ? `Done in ${fmtMs(daily.durationMs)}`
                : daily.inProgress
                  ? `${daily.tier} · in progress`
                  : `${daily.tier} · same for everyone`}
            </span>
            {daily.done && <span className="cardGo done"><Trophy size={16} /></span>}
          </button>
        </div>

        <div className="dashCol">
          <div className="dashStats">
            <Stat label="Streak" value={summary ? summary.currentStreak : '–'} sub="days" />
            <Stat label="Solved" value={summary ? summary.completed : '–'} sub="puzzles" />
            <Stat
              label="Clean"
              value={summary ? summary.cleanGames : '–'}
              sub="no help"
            />
          </div>

          <div className="dashPick">
            <div className="dashPickHead">New game</div>
            <div className="tierGrid">
              {TIERS.map(t => (
                <button key={t.name} className="tierChip" onClick={() => onPick(t.name)}>
                  <span className="tierChipName">{t.name}</span>
                  <span className="tierChipMeta">
                    {records[t.name] !== undefined ? fmtMs(records[t.name]) : t.tech}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="dashStat">
      <div className="dashStatValue">{value}</div>
      <div className="dashStatLabel">{label}</div>
      <div className="dashStatSub">{sub}</div>
    </div>
  )
}
