import { useMemo, useState } from 'react'
import * as ex from '../stats/experiments.js'

/**
 * Experiments you run on yourself.
 *
 * The app's defaults are guesses. This settles one of them with evidence, for
 * one particular player, which is honest difficulty pointed at the assists
 * instead of the puzzles.
 *
 * Everything here is arranged to stop it flattering itself. The outcome that
 * decides it is declared before any games are played, no verdict appears until
 * the declared number of games is in, and both limitations that matter, that it
 * cannot be blinded and that it can only find large effects, are stated on the
 * screen rather than buried.
 */
export default function Experiments({ games, onChange }) {
  const [state, setState] = useState(() => ex.load())
  const [confirmStop, setConfirmStop] = useState(false)

  const run = useMemo(() => (state && games ? ex.analyse(games, state) : null), [games, state])

  const begin = id => {
    const next = ex.start(id)
    ex.save(next)
    setState(next)
    onChange?.()
  }

  const stop = () => {
    ex.save(null)
    setState(null)
    setConfirmStop(false)
    onChange?.()
  }

  if (!games) return null

  return (
    <section className="statSection">
      <h2 className="statHeading">Experiments</h2>

      {!state ? (
        <>
          <p className="dataNote">
            The defaults in this app are guesses. Pick one and it gets settled with evidence: the
            assist is switched on and off at random behind the scenes, half your games each way, and
            after thirty games the difference is measured properly.
          </p>
          <div className="expList">
            {Object.values(ex.EXPERIMENTS).map(e => (
              <div className="expCard" key={e.id}>
                <div className="expTitle">{e.title}</div>
                <div className="expBody">{e.question}</div>
                <div className="expMeta">
                  {e.games} games, judged on {ex.OUTCOMES[e.primary].label.toLowerCase()}
                </div>
                <button className="newBtn" onClick={() => begin(e.id)}>Run this</button>
              </div>
            ))}
          </div>
          <p className="dataNote">
            Two things it cannot do. It cannot hide which half you are in, because you can see
            whether your board came with notes in it, so wanting one to win could make it win. And
            it can only find large differences: thirty games catch a difference of about a third
            nine times in ten, and a difference of a fifth only four times in ten.
          </p>
        </>
      ) : !run ? null : (
        <>
          <div className="expTitle">{run.exp.title}</div>
          <p className="dataNote">{run.exp.question}</p>

          {!run.complete ? (
            <>
              <div className="expProgress">
                <div className="expBar">
                  <span style={{ width: `${Math.round((run.played / run.target) * 100)}%` }} />
                </div>
                <div className="expMeta">
                  {run.played} of {run.target} games. {run.onN} with it on, {run.offN} with it off.
                </div>
              </div>
              <p className="dataNote">
                Nothing is reported until all {run.target} are in. Checking as you go and stopping
                the moment it looks convincing is the most reliable way to find an effect that is
                not there.
              </p>
            </>
          ) : (
            <>
              <p className="verdict">{ex.verdictFor(run.exp, run.primary)}</p>
              <table className="statTable expTable">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>On</th>
                    <th>Off</th>
                    <th>Chance</th>
                  </tr>
                </thead>
                <tbody>
                  {run.results.map(r => (
                    <tr key={r.outcome} className={r.outcome === run.exp.primary ? 'primaryRow' : ''}>
                      <td>
                        {ex.OUTCOMES[r.outcome].label}
                        {r.outcome === run.exp.primary && <span className="expTag">decides it</span>}
                      </td>
                      <td>{r.enough ? fmt(r.onMean, r.outcome) : '—'}</td>
                      <td>{r.enough ? fmt(r.offMean, r.outcome) : '—'}</td>
                      <td>{r.enough ? ex.pctShort(r.p) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dataNote">
                "Chance" is how often reshuffling which games were in which half produces a gap at
                least this big. Ten thousand reshuffles, seeded, so the number does not move when
                you look again. Only the row marked "decides it" was chosen in advance; the others
                are worth a glance and nothing more, because testing four things and believing
                whichever came out best is how noise gets mistaken for a finding.
              </p>
            </>
          )}

          <div className="dataRow">
            {confirmStop ? (
              <span className="quitAsk">
                {run.complete ? 'Clear this run?' : 'Abandon it? Nothing is kept.'}
                <button className="linkBtn danger" onClick={stop}>yes</button>
                <button className="linkBtn" onClick={() => setConfirmStop(false)}>no</button>
              </span>
            ) : (
              <button className="newBtn" onClick={() => setConfirmStop(true)}>
                {run.complete ? 'Clear and pick another' : 'Stop this experiment'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

const fmt = (v, outcome) => {
  if (outcome === 'time') return `${v.toFixed(2)}x`
  if (outcome === 'justified') return `${v.toFixed(0)}%`
  return v.toFixed(1)
}
