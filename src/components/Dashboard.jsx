import { useEffect, useState } from 'react'
import { TIERS } from '../logic/difficulty.js'
import { fmtMs } from '../lib/format.js'
import * as gameLog from '../lib/gameLog.js'
import * as compute from '../stats/compute.js'
import { dailyStreak } from '../logic/daily.js'
import { VARIANTS } from '../logic/variants.js'

const boardName = id => (id && id !== 'classic' ? ` · ${VARIANTS[id]?.name}` : '')
import { hintsByTechnique } from '../stats/compute.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { Calendar, Chart, Gear, Play, Trophy } from './Icons.jsx'
import ThemeMenu from './ThemeMenu.jsx'

/**
 * The home screen.
 *
 * The app used to drop you straight onto a board, which meant the daily, the
 * streaks and the history were all things you had to go looking for. This is
 * the front door: what is in progress, what today's puzzle is, how you are
 * doing, and every way in.
 */
export default function Dashboard({ inProgress, daily, records, theme, onTheme, onResume, onPick, onDaily, onStats, onSettings, onPractice, onTailored }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    gameLog.all().then(games => {
      // Surface the pattern that has cost the most hints, so the practice card
      // says something specific rather than advertising a feature.
      const { counts } = hintsByTechnique(games)
      const ranked = Object.entries(counts)
        .filter(([k]) => TECHNIQUES[k])
        .sort((a, b) => b[1] - a[1])
      const weak = ranked.length >= 1 && ranked[0][1] >= 3
        ? { key: ranked[0][0], count: ranked[0][1], label: TECHNIQUES[ranked[0][0]].label }
        : null
      // The top few, for a puzzle built around all of them rather than a drill
      // on one. Needs a real history behind it, or "tailored" means nothing.
      const wants = ranked.filter(([, n]) => n >= 2).slice(0, 3).map(([k]) => k)
      setSummary({ ...compute.overview(games), daily: dailyStreak(games), weak, wants })
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
          <ThemeMenu theme={theme} onPick={onTheme} />
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
              {/* The board is named before you commit to it: the daily changes
                  shape through the week, and finding that out after tapping
                  would be a surprise rather than a feature. */}
              {daily.done
                ? `Done in ${fmtMs(daily.durationMs)}`
                : `${daily.tier}${boardName(daily.variant)}${daily.inProgress ? ' · in progress' : ' · same for everyone'}`}
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

          <button className="card cardPractice" onClick={onPractice}>
            <span className="cardKicker">Practice</span>
            <span className="cardTitle">Drill a pattern</span>
            <span className="cardMeta">
              {summary?.weak
                ? `You have needed ${summary.weak.count} hints on ${summary.weak.label}`
                : 'Pick a technique and get a puzzle that needs it'}
            </span>
          </button>

          {/* A whole game around your weak spots, as opposed to a drill on one
              of them. Only offered once there is enough history to know what
              they are: a puzzle that claims to be tailored and is not would be
              worse than not offering it. */}
          {summary?.wants?.length >= 2 && onTailored && (
            <button className="card cardTailored" onClick={() => onTailored(summary.wants)}>
              <span className="cardKicker">Built for you</span>
              <span className="cardTitle">Your weak spots</span>
              <span className="cardMeta">
                A full game needing {summary.wants.map(k => TECHNIQUES[k].label).slice(0, 2).join(' and ')}
                {summary.wants.length > 2 ? ', among others' : ''}
              </span>
            </button>
          )}

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
