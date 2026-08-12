import { useMemo, useState } from 'react'
import * as ex from '../stats/experiments.js'
import { Explain, Term, TermGroup } from './Term.jsx'
import { outcomeTerm } from '../logic/glossary.js'

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
      {/* The heading stays plural and the glossary's label stays singular: this
          section holds several of a thing the glossary defines one of. */}
      <h2 className="statHeading">Experiments</h2>
      {/* Full width, so what an experiment is does not wait to be asked. */}
      <Explain id="experiment" />

      {!state ? (
        <>
          <p className="dataNote">
            The defaults in this app are guesses. Pick one and it gets settled with evidence, and
            it decides on one measure declared before the first game: <Term id="decidesIt" />.
          </p>
          <div className="expList">
            {Object.values(ex.EXPERIMENTS).map(e => (
              <div className="expCard" key={e.id}>
                <div className="expTitle">{e.title}</div>
                <div className="expBody">{e.question}</div>
                <div className="expMeta">
                  {e.games} games, judged on{' '}
                  <Term id={outcomeTerm(e.primary)}>
                    {ex.OUTCOMES[e.primary].label.toLowerCase()}
                  </Term>
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
              {/* Every word in the header row is a term, and two of them are
                  the ones that mislead: Chance is a p-value under a plainer
                  name, and each Measure row means something different from the
                  statistic of the same name on the tiles above. The table
                  scrolls sideways on the phone, so the answer lands outside
                  it. The row labels come from OUTCOMES, which glossary.test.js
                  asserts against these same entries. */}
              <TermGroup hint="Tap a heading or a measure for what it is.">
                <div className="tableWrap">
                <table className="statTable expTable">
                  <thead>
                    <tr>
                      <th>Measure</th>
                      {/* Both heads carry the same term on purpose, so pressing
                          either lights both: On and Off are the two halves of
                          one split, not two ideas. */}
                      <th><Term id="experimentArm">On</Term></th>
                      <th><Term id="experimentArm">Off</Term></th>
                      <th><Term id="chance" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.results.map(r => (
                      <tr key={r.outcome} className={r.outcome === run.exp.primary ? 'primaryRow' : ''}>
                        <td>
                          <Term id={outcomeTerm(r.outcome)}>{ex.OUTCOMES[r.outcome].label}</Term>
                          {r.outcome === run.exp.primary && (
                            <span className="expTag"><Term id="decidesIt">decides it</Term></span>
                          )}
                        </td>
                        <td>{r.enough ? fmt(r.onMean, r.outcome) : '—'}</td>
                        <td>{r.enough ? fmt(r.offMean, r.outcome) : '—'}</td>
                        <td>{r.enough ? ex.pctShort(r.p) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </TermGroup>
              {/* What Chance is now lives in the glossary, so this says only
                  the thing the glossary cannot: why the other rows do not
                  count. It is also where the p-value gets its usual name, since
                  nothing else on screen ever writes it. */}
              <p className="dataNote">
                Only the row marked "decides it" was chosen in advance; the others are worth a
                glance and nothing more, because testing four things and believing whichever came
                out best is how noise gets mistaken for a finding. Chance is a{' '}
                <Term id="pValue">p-value</Term>.
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
