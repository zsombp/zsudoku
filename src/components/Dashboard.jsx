import { useEffect, useState } from 'react'
import { TIERS } from '../logic/difficulty.js'
import { fmtMs } from '../lib/format.js'
import * as gameLog from '../lib/gameLog.js'
import * as compute from '../stats/compute.js'
import { dailyStreak } from '../logic/daily.js'
import { VARIANTS } from '../logic/variants.js'
import { TierEmblem } from './Emblems.jsx'

const boardName = id => (id && id !== 'classic' ? ` · ${VARIANTS[id]?.name}` : '')
import { hintsByTechnique } from '../stats/compute.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { Calendar, Chart, Gear, Play, Trophy } from './Icons.jsx'
import { recordKey } from './NewGameSheet.jsx'
import ThemeMenu from './ThemeMenu.jsx'
import { Term, TermButton, TermGroup, termLabel } from './Term.jsx'

/**
 * The home screen.
 *
 * The app used to drop you straight onto a board, which meant the daily, the
 * streaks and the history were all things you had to go looking for. This is
 * the front door: what is in progress, what today's puzzle is, how you are
 * doing, and every way in.
 */
export default function Dashboard({ handoff, inProgress, daily, records, variant = 'classic', theme, onTheme, onResume, onPick, onDaily, onStats, onSettings, onPractice, onTailored }) {
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
          {/* A game another device left. Offered, never applied: the rule that
              the longer log wins is right nearly always, and nearly always is
              not good enough when being wrong overwrites a game in progress. */}
          {handoff && (
            <div className="card cardHandoff">
              <span className="cardKicker">On your other device</span>
              <span className="cardTitle">
                {handoff.graded}
                {handoff.variant && handoff.variant !== 'classic' ? ` · ${VARIANTS[handoff.variant]?.name}` : ''}
              </span>
              <span className="cardMeta">
                {handoff.moves} moves in, {fmtMs(handoff.elapsedMs)} on the clock
              </span>
              <span className="handoffBtns">
                <button className="newBtn" onClick={handoff.onTake}>Pick it up</button>
                <button className="linkBtn" onClick={handoff.onIgnore}>not now</button>
              </span>
            </div>
          )}
          {inProgress ? (
            <button className="card cardPrimary" onClick={onResume}>
              <span className="cardKicker">Continue</span>
              <span className="cardTitle">
                {inProgress.mode === 'daily'
                  ? `${daily.weekday} puzzle`
                  : /* Named here as it is on the daily card and the handoff
                       card. Resuming a killer said "Expert" and nothing else,
                       so the board you were on was a surprise on arrival. */
                    inProgress.graded + boardName(inProgress.variant)}
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
          {/* Three figures on the front door, and none of them said what it
              counted. Clean is the surprising one: checks and pencil marks do
              not spoil a game, and a wrong digit you undid does not count. The
              daily is here too, because the card above is a button and cannot
              hold a trigger. */}
          <TermGroup hint={null}>
            <div className="dashStats">
              <Stat term="currentStreak" label="Streak" value={summary ? summary.currentStreak : '–'} sub="days" />
              <Stat term="puzzlesSolved" label="Solved" value={summary ? summary.completed : '–'} sub="puzzles" />
              <Stat
                term="clean"
                label={termLabel('clean', 'Clean')}
                value={summary ? summary.cleanGames : '–'}
                sub="no help"
              />
            </div>
            <p className="termHint">
              Tap a figure for what it counts. Also: <Term id="daily" />
            </p>
          </TermGroup>

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
            <div className="dashPickHead">
              New game{variant !== 'classic' && <span className="dashPickBoard">{VARIANTS[variant]?.name}</span>}
            </div>
            <div className="tierGrid">
              {TIERS.map(t => (
                <button key={t.name} className="tierChip" onClick={() => onPick(t.name)}>
                  {/* The emblem carries the tier's place on the scale as a
                      shape, so the six buttons read as a ramp before the words
                      are read at all. It is decoration only if it disagrees
                      with the label, which is why it is keyed off the same
                      name. */}
                  <TierEmblem tier={t.name} size={22} className="tierChipMark" />
                  <span className="tierChipName">{t.name}</span>
                  <span className="tierChipMeta">
                    {/* Keyed on the board these buttons will actually deal.
                        Reading `records[tier]` showed the classic best beside a
                        button that starts a killer, so the number was real and
                        belonged to a different game. */}
                    {records[recordKey(variant, t.name)] !== undefined
                      ? fmtMs(records[recordKey(variant, t.name)])
                      : t.tech}
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

/**
 * Labels here stay short rather than taking the glossary's, because three of
 * them share a 105px column on the phone: "Puzzles solved" wraps to two lines
 * where "Solved" does not, and the definition it opens says the same thing in
 * full.
 */
function Stat({ label, value, sub, term }) {
  const body = (
    <>
      <span className="dashStatValue">{value}</span>
      <span className="dashStatLabel">{label}</span>
      <span className="dashStatSub">{sub}</span>
    </>
  )
  if (!term) return <div className="dashStat">{body}</div>
  return <TermButton id={term} className="dashStat">{body}</TermButton>
}
