import { useEffect, useMemo, useState } from 'react'
import { rowOf, colOf, range } from '../logic/topology.js'
import { fmtMs } from '../lib/format.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { boardAt, replaySteps, stallHeatmap, summarise } from '../stats/replay.js'
import { Play, Pause } from './Icons.jsx'

/**
 * One finished game, read back out of its move log.
 *
 * Two views of the same data. Replay walks the solve forward so you can watch
 * how it actually unfolded, and the heatmap collapses it into where the time
 * went. The board is deliberately not the playable Board component: nothing
 * here is interactive, and reusing it would mean threading a read-only mode
 * through a component whose whole job is input.
 */
export default function GameReview({ game, onBack }) {
  const [mode, setMode] = useState('replay')
  const steps = useMemo(() => replaySteps(game), [game])
  const [pos, setPos] = useState(steps.length ? steps.length - 1 : 0)
  const [playing, setPlaying] = useState(false)

  const heat = useMemo(() => stallHeatmap(game), [game])
  const info = useMemo(() => summarise(game), [game])

  const stepIndex = steps.length ? steps[Math.min(pos, steps.length - 1)] : -1
  const board = useMemo(() => boardAt(game, stepIndex), [game, stepIndex])
  const current = game.moveLog?.[stepIndex]

  useEffect(() => {
    if (!playing) return
    if (pos >= steps.length - 1) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setPos(p => Math.min(p + 1, steps.length - 1)), 260)
    return () => clearTimeout(id)
  }, [playing, pos, steps.length])

  const level = ms => {
    if (!heat.max || !ms) return 0
    const share = ms / heat.max
    return share > 0.66 ? 4 : share > 0.4 ? 3 : share > 0.18 ? 2 : 1
  }

  const noLog = !game.moveLog?.length

  return (
    <div className="review">
      <header className="top">
        <div className="brand">GAME REVIEW</div>
        <button className="newBtn" onClick={onBack}>Back</button>
      </header>

      <div className="reviewHead">
        <div className="reviewTitle">
          {game.graded}
          {game.daily && <span className="reviewTag">daily</span>}
          {!game.completed && <span className="reviewTag warn">unfinished</span>}
        </div>
        <div className="reviewMeta">
          {new Date(game.endedAt).toLocaleString()} · {fmtMs(game.durationMs)}
          {game.hardest && ` · needed ${TECHNIQUES[game.hardest]?.label || game.hardest}`}
        </div>
      </div>

      {noLog ? (
        <p className="dataNote">
          This game has no move log, so there is nothing to replay. Games recorded
          before move logging was added only kept their summary.
        </p>
      ) : (
        <>
          <div className="segTabs" role="tablist">
            <button role="tab" aria-selected={mode === 'replay'}
              className={'segTab' + (mode === 'replay' ? ' on' : '')} onClick={() => setMode('replay')}>
              Replay
            </button>
            <button role="tab" aria-selected={mode === 'heatmap'}
              className={'segTab' + (mode === 'heatmap' ? ' on' : '')} onClick={() => setMode('heatmap')}>
              Where the time went
            </button>
          </div>

          <div className="reviewBoard">
            {range(81).map(i => {
              const given = game.puzzle[i] !== 0
              const v = mode === 'replay' ? board[i] : game.solution[i]
              const cls = ['rvCell']
              if (colOf(i) % 3 === 2 && colOf(i) !== 8) cls.push('bR')
              if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cls.push('bB')
              if (given) cls.push('given')
              if (mode === 'heatmap' && !given) cls.push('h' + level(heat.cells[i]))
              if (mode === 'replay' && current && !current.changes && current.cell === i) cls.push('now')
              if (mode === 'replay' && current?.changes?.some(([c]) => c === i)) cls.push('now')
              if (mode === 'replay' && !given && v !== 0 && v !== game.solution[i]) cls.push('bad')
              return (
                <div key={i} className={cls.join(' ')}>
                  {v !== 0 && <span className="rvVal">{v}</span>}
                  {mode === 'heatmap' && !given && heat.cells[i] > 0 && (
                    <span className="rvTime">{Math.round(heat.cells[i] / 1000)}s</span>
                  )}
                </div>
              )
            })}
          </div>

          {mode === 'replay' ? (
            <div className="scrubRow">
              <button className="iconBtn" aria-label={playing ? 'Pause replay' : 'Play replay'}
                onClick={() => {
                  if (pos >= steps.length - 1) setPos(0)
                  setPlaying(p => !p)
                }}>
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <input
                className="scrub"
                type="range"
                min="0"
                max={Math.max(0, steps.length - 1)}
                value={pos}
                aria-label="Replay position"
                onChange={e => { setPlaying(false); setPos(Number(e.target.value)) }}
              />
              <span className="scrubMeta">
                {pos + 1}/{steps.length} · {fmtMs(current?.t || 0)}
              </span>
            </div>
          ) : (
            <div className="heatKey">
              <span>quick</span>
              <span className="hkSwatch h1" /><span className="hkSwatch h2" />
              <span className="hkSwatch h3" /><span className="hkSwatch h4" />
              <span>slow · up to {Math.round(heat.max / 1000)}s on one cell</span>
            </div>
          )}

          <div className="reviewStats">
            <Fact label="Placements" value={info.placements} />
            <Fact label="Wrong" value={info.wrong} />
            <Fact label="Undos" value={info.undos} />
            <Fact label="Hints" value={game.hints} />
            <Fact label="First move" value={fmtMs(info.timeToFirstMove)} />
            <Fact
              label="Longest pause"
              value={fmtMs(info.longest.gap)}
              sub={info.longest.cell >= 0
                ? `r${rowOf(info.longest.cell) + 1}c${colOf(info.longest.cell) + 1}`
                : ''}
            />
            <Fact label="Pencil marks" value={info.pencilMarks + (info.usedAutoPencil ? '+auto' : '')} />
            <Fact label="Checks" value={game.checks ?? 0} />
          </div>
        </>
      )}
    </div>
  )
}

function Fact({ label, value, sub }) {
  return (
    <div className="fact">
      <div className="factValue">{value}</div>
      <div className="factLabel">{label}</div>
      {sub && <div className="factSub">{sub}</div>}
    </div>
  )
}
