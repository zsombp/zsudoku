import { useMemo, useState } from 'react'
import { useLeague } from '../hooks/useLeague.js'
import { cleanName, flatten, headToHead, period, standings, MAX_NAME } from '../stats/league.js'
import { fmtMs, fmtWhen } from '../lib/format.js'

/**
 * A private league over the shared repository.
 *
 * No server, no accounts, no leaderboard of strangers. It is the sync mechanism
 * that already exists, pointed at a repository a few friends can all write to,
 * and it is off until two separate switches are on: the GitHub backup, and a
 * display name here.
 *
 * The one thing it must say plainly, and says at the top rather than in a
 * footnote, is that it only works if the others point their own sync at the same
 * repository. Nothing here can arrange that, and a table that quietly stayed
 * empty would look broken rather than unconfigured.
 */
const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'all time' },
]

const days = n => `${n} ${n === 1 ? 'day' : 'days'}`

/**
 * The days only one of them turned up for.
 *
 * Written as a plain sentence with both counts at first, which produced "only
 * you played on 3 days and only Kata on 0". A count of zero is not a fact worth
 * a clause, so each side is named only when it has one.
 */
function missedLine(h2h) {
  const mine = h2h.onlyA.length
  const theirs = h2h.onlyB.length
  if (!mine && !theirs) return 'You have not missed a day between you.'
  const parts = []
  if (mine) parts.push(`you played ${days(mine)} ${h2h.b} did not`)
  if (theirs) parts.push(`${h2h.b} played ${days(theirs)} you did not`)
  const lead = parts.join(', and ')
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}. A day one of you missed is scored for nobody.`
}

export default function League({ name, onName }) {
  const [draft, setDraft] = useState(name || '')
  const [span, setSpan] = useState(30)
  const [against, setAgainst] = useState(null)
  const league = useLeague(name)

  const range = useMemo(() => (span ? period(span) : { from: null, to: null }), [span])
  const table = useMemo(
    () => standings(flatten(league.players), range),
    [league.players, range]
  )

  const me = league.players.find(p => cleanName(p.name) === cleanName(name)) || null
  const rival = league.players.find(p => cleanName(p.name) === against) || null
  const h2h = useMemo(
    () => (me && rival ? headToHead(me, rival, range) : null),
    [me, rival, range]
  )

  return (
    <section className="statSection">
      <h2 className="statHeading">League</h2>

      <p className="dataNote">
        Standings against whoever else writes to the same GitHub repository your backup points at.
        It needs them to do that: this reads and writes files in <code>league/</code> in that one
        repository and talks to nothing else. There is no server to join and nobody to invite, so if
        their sync is pointed somewhere else, nothing here will ever show them.
      </p>

      {!league.configured ? (
        <p className="dataNote">
          Switch on GitHub backup below and the league becomes available. With it off, this makes no
          network request at all.
        </p>
      ) : (
        <>
          <div className="fieldRow">
            <label className="field">
              <span className="fieldLabel">Display name</span>
              <input
                className="fieldInput"
                value={draft}
                maxLength={MAX_NAME}
                placeholder="what the others see"
                onChange={e => setDraft(e.target.value)}
              />
            </label>
          </div>
          <div className="dataRow">
            <button
              className="newBtn"
              disabled={cleanName(draft) === cleanName(name)}
              onClick={() => onName(cleanName(draft))}
            >
              {name ? 'Change name' : 'Take part'}
            </button>
            {name && (
              <>
                <button className="newBtn" disabled={league.busy} onClick={league.publish}>
                  {league.busy ? 'Working…' : 'Publish my dailies'}
                </button>
                <button className="newBtn" disabled={league.busy} onClick={league.refresh}>
                  Refresh
                </button>
              </>
            )}
            {name && (
              <button className="linkBtn" onClick={() => onName('')}>leave</button>
            )}
          </div>

          <p className="dataNote">
            Publishing sends one row per daily: the day, the tier and seed, your time, mistakes,
            hints, and whether you finished. No move log, no puzzle, no solution. It happens when you
            press the button and at no other time.
            {league.fetchedAt && ` Last read ${fmtWhen(league.fetchedAt)}.`}
          </p>

          {league.error && <p className="dataNote bad">{league.error}</p>}
          {league.notice && <p className="dataNote notice">{league.notice}</p>}

          {!name ? (
            <p className="dataNote">
              Set a name and the repository is read for the first time. Until then nothing is
              fetched and nothing is published: taking part is the second of the two switches this
              needs, and it is this one.
            </p>
          ) : table.rows.length === 0 ? (
            <p className="dataNote">
              Nobody has published to this repository yet, including you. Press publish and it will
              hold one player until somebody else joins.
            </p>
          ) : (
            <>
              <div className="variantRow" role="tablist" aria-label="Period">
                {WINDOWS.map(w => (
                  <button
                    key={w.days}
                    role="tab"
                    aria-selected={w.days === span}
                    className={'variantChip' + (w.days === span ? ' on' : '')}
                    onClick={() => setSpan(w.days)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              <div className="tableWrap">
                <table className="statTable leagueTable">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Played</th>
                      <th>Won</th>
                      <th>Median</th>
                      <th>Pace</th>
                      <th>Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map(r => (
                      <tr key={r.name} className={cleanName(r.name) === cleanName(name) ? 'primaryRow' : ''}>
                        <td>{r.name}</td>
                        <td>{r.played}</td>
                        <td>
                          {r.contested ? `${r.wins}/${r.contested}` : '–'}
                          {r.winRate !== null && <em> {Math.round(r.winRate * 100)}%</em>}
                        </td>
                        <td>{r.medianMs ? fmtMs(r.medianMs) : '–'}</td>
                        <td>{r.pace ? r.pace.toFixed(2) : '–'}</td>
                        <td>{r.streak.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Every column here carries a definition nothing else states, and
                  two of them are easy to read as the opposite of what they are. */}
              <p className="legend">
                <span>played: days you turned up for, never days you missed</span>
                <span>won: fastest on a day at least two of you played the same puzzle</span>
                <span>pace: your time against the day median, under 1 is quicker</span>
                <span>streak: your whole history, not this window</span>
              </p>

              {table.mismatched.length > 0 && (
                <p className="timeNote warn">
                  {table.mismatched.length}{' '}
                  {table.mismatched.length === 1 ? 'day is' : 'days are'} not comparable: the entries
                  disagree about which puzzle was played, which happens when someone is on a
                  different version. Those days count for nobody rather than being dropped quietly.
                </p>
              )}

              {name && table.rows.length > 1 && (
                <>
                  <h3 className="statHeading">Head to head</h3>
                  <div className="variantRow" role="tablist" aria-label="Against">
                    {table.rows
                      .filter(r => cleanName(r.name) !== cleanName(name))
                      .map(r => (
                        <button
                          key={r.name}
                          role="tab"
                          aria-selected={r.name === against}
                          className={'variantChip' + (r.name === against ? ' on' : '')}
                          onClick={() => setAgainst(r.name === against ? null : r.name)}
                        >
                          {r.name}
                        </button>
                      ))}
                  </div>
                  {h2h && (
                    <div className="h2h">
                      {/* Two numbers side by side say nothing about whose is
                          whose. Named above each, so the score cannot be read
                          backwards. */}
                      <div className="h2hScore">
                        <span className="h2hSide">
                          <em>{h2h.a}</em>
                          {h2h.wins.a}
                        </span>
                        <i>{h2h.decided + h2h.drawn === 0 ? 'nothing decided yet' : 'won'}</i>
                        <span className="h2hSide">
                          <em>{h2h.b}</em>
                          {h2h.wins.b}
                        </span>
                      </div>
                      <p className="dataNote">
                        {h2h.both} {h2h.both === 1 ? 'day' : 'days'} you both played
                        {h2h.drawn > 0 && `, ${h2h.drawn} drawn`}
                        {h2h.bothFinished > 0 &&
                          `, ${h2h.bothFinished} finished by both of you: ${fmtMs(h2h.medianA)} against ${fmtMs(h2h.medianB)}`}
                        . {missedLine(h2h)}
                        {h2h.ratio !== null &&
                          ` On a typical shared day you take ${h2h.ratio.toFixed(2)}x their time.`}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
