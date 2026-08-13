import { useEffect, useMemo, useRef, useState } from 'react'
import { StatTile, Calendar, Histogram, HourBars, TierTrend } from './stats/charts.jsx'
import { Explain, Term, TermButton, TermGroup, termLabel } from './Term.jsx'
import { achievementTerm } from '../logic/glossary.js'
import * as compute from '../stats/compute.js'
import { insights, needed } from '../stats/coach.js'
import { achievements } from '../stats/achievements.js'
import { dailyStreak } from '../logic/daily.js'
import GameReview from './GameReview.jsx'
import Experiments from './Experiments.jsx'
import League from './League.jsx'
import { VARIANT_LIST, VARIANTS } from '../logic/variants.js'
import Companion from './Companion.jsx'

const variantName = id => VARIANTS[id]?.name || id
import * as gameLog from '../lib/gameLog.js'
import { fmtMs } from '../lib/format.js'

const pct = n => `${Math.round(n * 100)}%`

/**
 * Which coach insight rests on which term.
 *
 * Written out rather than derived from the id, because the two do not line up
 * and guessing would be confidently wrong. The insight called `earned` in
 * `timeShape` is about a long think, while the glossary's `earned` is a colour
 * in the solve picture; and `justified` and `guess-rate` are two readings of the
 * same lucky share, so both point at `guessRate`. Insights with no coined term
 * behind them get no line, which is most of them.
 */
export const INSIGHT_TERM = {
  justified: 'guessRate',
  'guess-rate': 'guessRate',
  'missed-easy': 'missedEasier',
  'scanning-stalls': 'slowEasy',
  tilt: 'tilt',
  'tilt-steady': 'tilt',
}

function shortDuration(ms) {
  const h = ms / 3600000
  if (h >= 1) return `${h.toFixed(h >= 10 ? 0 : 1)}h`
  return `${Math.round(ms / 60000)}m`
}

export default function StatsView({ onClose, onPractice, leagueName, onLeagueName }) {
  const [games, setGames] = useState(null)
  const [showNumbers, setShowNumbers] = useState(false)
  const [notice, setNotice] = useState(null)
  const [reviewing, setReviewing] = useState(null)
  const fileRef = useRef(null)

  const [backfill, setBackfill] = useState(null)
  // Every claim on this screen is about one kind of board. Pooling a jigsaw
  // with a classic would put a median between two things that are not the same
  // thing, and the coach would then reason from it.
  const [variant, setVariant] = useState('all')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const first = await gameLog.all()
      if (!alive) return
      setGames(first.sort((a, b) => a.endedAt - b.endedAt))
      // Games recorded before classification was stored, or under an older
      // grader, are caught up here rather than on every open. Chunked, so the
      // screen stays usable while it runs.
      const res = await gameLog.backfillSummaries({
        onProgress: (done, total) => alive && setBackfill({ done, total }),
      })
      if (!alive) return
      setBackfill(null)
      if (res.done) {
        const again = await gameLog.all()
        if (alive) setGames(again.sort((a, b) => a.endedAt - b.endedAt))
      }
    })()
    return () => { alive = false }
  }, [])

  // Which kinds of board have actually been played. The filter only appears
  // once there is more than one, so a classic-only history never sees it.
  const played = useMemo(() => {
    if (!games) return []
    const seen = new Map()
    for (const g of games) {
      const id = g.variant || 'classic'
      seen.set(id, (seen.get(id) || 0) + 1)
    }
    return VARIANT_LIST.filter(v => seen.has(v.id)).map(v => ({ ...v, count: seen.get(v.id) }))
  }, [games])

  const shown = useMemo(() => {
    if (!games) return null
    if (variant === 'all') return games
    return games.filter(g => (g.variant || 'classic') === variant)
  }, [games, variant])

  const derived = useMemo(() => {
    const games = shown
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
  }, [shown])

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
        <div className="statsEmpty emptyState">
          {/* The other place the companion is allowed: a screen with nothing on
              it, where a drawn thing is the only thing to look at. It is not
              apologising and it is not saying anything. */}
          <Companion mood="idle" size={58} />
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
        {/* The one figure with room under it, so it says outright what it
            counts rather than waiting to be asked. */}
        <Explain id="puzzlesSolved" className="explain heroExplain" />
      </div>

      {/* Six tiles, and every one of them is a definition nothing on this
          screen used to state. A tile is 112px wide on the phone and printing
          the sentence inside it takes it from 68px to 187px, so the tile is the
          trigger and the answer lands under the grid. */}
      <TermGroup>
        <div className="tiles">
          <StatTile term="winRate" value={pct(o.winRate)} sub={`${o.completed}/${o.played}`} />
          <StatTile term="currentStreak" value={o.currentStreak} sub={`best ${o.longestStreak}`} />
          <StatTile
            term="timePlayed"
            value={shortDuration(o.totalMs)}
            sub={`${o.daysPlayed} ${o.daysPlayed === 1 ? 'day' : 'days'}`}
          />
          <StatTile term="medianSolve" value={fmtMs(o.medianMs)} sub={`fastest ${fmtMs(o.fastest)}`} />
          {/* "Mistakes / per solve" split a label across a label and a subtext.
              The glossary calls it one thing, so the tile does too. */}
          <StatTile term="mistakesPerSolve" value={o.mistakesPerGame.toFixed(1)} />
          <StatTile
            term="dailyStreak"
            value={derived.daily.current}
            sub={derived.daily.total ? `${derived.daily.total} done` : 'none yet'}
          />
        </div>
        {/* The smaller figure on three of the tiles is a different statistic
            with its own definition, and a tile can only carry one. This row is
            where they are reachable, and it doubles as the visible sign that
            the labels above can be pressed at all. */}
        <p className="termHint">
          Tap a tile for what it counts. The smaller figures: <Term id="longestStreak" />
          {' · '}<Term id="daysPlayed" />{' · '}<Term id="fastest" />
        </p>
      </TermGroup>

      <Section title="What the numbers say">
        {coach.length ? (
          coach.map(c => (
            <TermGroup key={c.id}>
              <div className="insight">
                <div className="insightTitle">{c.title}</div>
                <div className="insightBody">{c.body}</div>
                <div className="insightSample">based on {c.sample}</div>
                {/* Several insights are built on a term the body never names:
                    a guess that worked, an easier move that was available, a
                    run of mistakes after a mistake. The insight already states
                    its own sample, so this adds the definition and nothing
                    else. Only the insights whose measure is a glossary term
                    get a line, which is why the map is explicit rather than a
                    guess from the id. */}
                {INSIGHT_TERM[c.id] && (
                  <p className="termHint">
                    What is being counted: <Term id={INSIGHT_TERM[c.id]} />
                  </p>
                )}
                {c.practice && onPractice && (
                  <button className="newBtn insightAct" onClick={() => onPractice(c.practice, 'classic')}>
                    Practise this now
                  </button>
                )}
              </div>
            </TermGroup>
          ))
        ) : (
          <div className="insightBody">{needed(games)}</div>
        )}
      </Section>

      <Section title={`Achievements · ${derived.badges.filter(b => b.earned).length}/${derived.badges.length}`}>
        {/* The badge's own line says how to earn it; the glossary says what the
            rule actually checks, and the two are not always the same sentence.
            "Play seven days in a row" is finishing a game on seven consecutive
            days, and opening the app does not count. A badge is 170px wide and
            the rule would take it from 33px to 123px, so the rule is a tap. */}
        <TermGroup hint="Tap a badge for the rule it actually checks.">
          <div className="badges">
            {derived.badges.map(b => (
              <TermButton
                id={achievementTerm(b.id)}
                className={'badge' + (b.earned ? ' earned' : '')}
                key={b.id}
              >
                <span className="badgeTop">
                  <span className="badgeName">{b.name}</span>
                  {b.detail && <span className="badgeDetail">{b.detail}</span>}
                </span>
                <span className="badgeDesc">{b.description}</span>
                {!b.earned && b.progress > 0 && (
                  <span className="badgeTrack">
                    <span className="badgeFill" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                  </span>
                )}
              </TermButton>
            ))}
          </div>
        </TermGroup>
      </Section>

      <Section title="Recent games">
        <div className="gameList">
          {[...games].reverse().slice(0, 12).map(g => (
            <button className="gameRow" key={g.id} onClick={() => setReviewing(g)}>
              <span className="grTier">{g.graded}</span>
              <span className="grMeta">
                {new Date(g.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {/* Which board, when there is more than one kind in the list. */}
                {g.variant && g.variant !== 'classic' && ` · ${variantName(g.variant)}`}
                {g.daily && ' · daily'}
                {!g.completed && ' · unfinished'}
              </span>
              <span className="grTime">{fmtMs(g.durationMs)}</span>
              <span className="grFlags">
                {g.mistakes > 0 && <em>{g.mistakes}✕</em>}
                {g.hints > 0 && <em>{g.hints}?</em>}
                {g.mistakes === 0 && g.hints === 0 && <em className="clean">clean</em>}
              </span>
            </button>
          ))}
        </div>
        {/* The glyphs were explained by hover, which is nothing at all on a
            phone. The legend was the fix and it carried its own wording, which
            made it a second answer: it read "wrong digits" over a count that is
            `mistakes`, the ones left standing, not every wrong digit ever
            placed. The words come from the glossary now and the row cannot say
            one thing while the number counts another. The legend cannot sit
            inside the rows, which are buttons themselves. */}
        <TermGroup hint="Tap a word here for what the mark on a row counts.">
          <p className="legend">
            <span><Term id="mistakes">✕ mistakes</Term></span>
            <span><Term id="hints">? hints</Term></span>
            <span><Term id="clean">clean</Term></span>
            {/* Lower case, like its neighbours: this legend describes marks on
                a row rather than headings. */}
            <span><Term id="unfinished">unfinished</Term></span>
            <span>tap a row for the full review</span>
          </p>
        </TermGroup>
      </Section>

      <Section term="calendarHeatmap">
        <Calendar days={derived.calendar} />
      </Section>

      <Section term="tierTrend">
        <div className="trends">
          {tiers.map(t => (
            <TierTrend key={t.tier} label={t.tier} values={t.recent} best={t.best} />
          ))}
        </div>
      </Section>

      {derived.histogram.length > 0 && (
        <Section term="durationHistogram">
          <Histogram bins={derived.histogram} />
        </Section>
      )}

      <Section term="byHour">
        <HourBars hours={derived.hours} />
      </Section>

      {played.length > 1 && (
        <div className="variantFilter">
          <div className="variantRow" role="tablist" aria-label="Which boards">
            <button
              role="tab"
              aria-selected={variant === 'all'}
              className={'variantChip' + (variant === 'all' ? ' on' : '')}
              onClick={() => setVariant('all')}
            >
              {termLabel('boardFilter', 'All boards')}
            </button>
            {played.map(v => (
              <button
                key={v.id}
                role="tab"
                aria-selected={variant === v.id}
                className={'variantChip' + (variant === v.id ? ' on' : '')}
                onClick={() => setVariant(v.id)}
              >
                {v.name} <em>{v.count}</em>
              </button>
            ))}
          </div>
          {/* This used to carry its own paragraph saying the same thing the
              glossary says, which is two answers to one question. The filter
              governs every number on the screen, so its definition is always on
              rather than waiting for the "all boards" case. */}
          <Explain id="boardFilter" />
          {variant === 'all' && (
            <p className="dataNote">Pick one to see figures that mean something on their own.</p>
          )}
        </div>
      )}

      {backfill && (
        <p className="dataNote notice">
          Reading back your older games: {backfill.done} of {backfill.total}.
        </p>
      )}

      <Experiments games={games} />

      {/* Last of the sections and quiet about it: this is the only thing on the
          screen that involves anybody else, and it is off until two switches
          are on. */}
      <League name={leagueName || ''} onName={onLeagueName} />

      <Section title="Data">
        <label className="toggle">
          <input type="checkbox" checked={showNumbers} onChange={e => setShowNumbers(e.target.checked)} />
          <span>Show numbers</span>
        </label>

        {showNumbers && (
          /* Five of these six words mean something different here from what
             they mean elsewhere on the screen: Median is per tier rather than
             over everything, Mistakes is per finished game at this tier. A cell
             is 62px wide on the phone and the definition would take the header
             row from 21px to 91px, so the heads are triggers and the answer
             lands under the table, outside the horizontal scroller. */
          <TermGroup hint="Tap a column head for what it counts at that tier.">
            <div className="tableWrap">
            <table className="statTable">
              <thead>
                <tr>
                  <th><Term id="tier" /></th>
                  <th><Term id="tierPlayed" /></th>
                  <th><Term id="tierDone" /></th>
                  <th><Term id="tierBest" /></th>
                  <th><Term id="tierMedian" /></th>
                  <th><Term id="tierMistakes" /></th>
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
          </TermGroup>
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

/**
 * A heading and, where the heading names a term, its definition under it.
 *
 * Full width, so this is the subtext case and the definition is simply always
 * on: measured at 375px a heading plus its longest definition is 72.5px against
 * 13px bare, which is three lines of a column that has 347px to spend.
 *
 * The heading text comes from the glossary as well, so a chart headed one thing
 * and defined as another is not expressible.
 */
function Section({ title, term, children }) {
  return (
    <section className="statSection">
      <h2 className="statHeading">{term ? termLabel(term, title) : title}</h2>
      {term && <Explain id={term} />}
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
