import { useEffect, useMemo, useState } from 'react'
import { rowOf, colOf } from '../logic/topology.js'
import { fmtMs } from '../lib/format.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { createState } from '../logic/grader.js'
import { workedExamples } from '../logic/explain.js'
import { boardAt, stateAt, replaySteps, stallHeatmap, summarise, cellHistory } from '../stats/replay.js'
import { analyseGame, verdict, timeShape, settledCands, CLASSES } from '../stats/analysis.js'
import ReviewBoard from './ReviewBoard.jsx'
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
/** Sharp, Solid and the rest are adjectives; these two are nouns and count. */
const plural = (key, n) =>
  n === 1 || (key !== 'mistake' && key !== 'hint') ? CLASSES[key].label : CLASSES[key].label + 's'

export default function GameReview({ game, onBack, onPractice }) {
  const [mode, setMode] = useState('replay')
  const steps = useMemo(() => replaySteps(game), [game])
  const [pos, setPos] = useState(steps.length ? steps.length - 1 : 0)
  const [playing, setPlaying] = useState(false)

  const heat = useMemo(() => stallHeatmap(game), [game])
  const info = useMemo(() => summarise(game), [game])
  // Roughly 1600 operations per placement, so a 60-move game costs about a
  // tenth of a second. Cheap enough to do on open rather than in the worker.
  const analysis = useMemo(() => analyseGame(game), [game])
  const line = useMemo(() => verdict(analysis), [analysis])
  const shape = useMemo(() => timeShape(analysis), [analysis])

  // The patterns this grid actually required, drawn from this grid. Costs a
  // full ladder walk, so it waits until the tab is opened.
  const [patternTab, setPatternTab] = useState(0)
  const examples = useMemo(
    () => (mode === 'patterns' && game.puzzle ? workedExamples(game.puzzle) : []),
    [mode, game.puzzle]
  )
  const example = examples[Math.min(patternTab, examples.length - 1)] || null

  const stepIndex = steps.length ? steps[Math.min(pos, steps.length - 1)] : -1
  const board = useMemo(() => boardAt(game, stepIndex), [game, stepIndex])
  const current = game.moveLog?.[stepIndex]

  // Which move the explanation panel is talking about. The replay scrubber and
  // the move list both point at it, so stepping the board and clicking a row
  // are the same gesture.
  const [selected, setSelected] = useState(null)

  /**
   * What to open on. The review used to land on the last move of the game,
   * where one cell is empty and there is nothing to see. The first mistake is
   * the thing most worth looking at, then the first guess that happened to
   * work, then the first move that needed a real pattern.
   */
  const notable = useMemo(() => {
    const first = cls => analysis.moves.find(m => m.cls === cls)
    return first('mistake') || first('lucky') || first('sharp') || analysis.moves[0] || null
  }, [analysis.moves])

  const move = useMemo(() => {
    if (selected !== null) return analysis.moves.find(m => m.index === selected) || null
    return notable
  }, [analysis.moves, selected, notable])

  // The position immediately before the move under discussion, which is the
  // only position in which its explanation is true.
  const at = move ? move.index - 1 : stepIndex
  const before = useMemo(() => stateAt(game, at), [game, at])
  const trueCands = useMemo(() => createState(before.board).cands, [before])
  // What the board actually proves, eliminations included. Only computed for
  // the one position on screen, so the ladder run costs a few milliseconds.
  const settled = useMemo(() => settledCands(before.board), [before])
  const [layer, setLayer] = useState('cands')
  // A cell you clicked, to read its whole story instead of one move's worth.
  const [cellFocus, setCellFocus] = useState(null)
  const history = useMemo(
    () => (cellFocus === null ? [] : cellHistory(game, cellFocus)),
    [game, cellFocus]
  )

  // The replay board shows the position after the step it is parked on, which
  // is a different moment from the one the move panel explains.
  const replayState = useMemo(() => stateAt(game, stepIndex), [game, stepIndex])
  const replayMarks = replayState.marks
  const replayCands = useMemo(() => createState(replayState.board).cands, [replayState])

  // How many of your own notes had already been ruled out by the board.
  const staleCount = useMemo(() => {
    if (!before.marks) return 0
    let n = 0
    for (let i = 0; i < 81; i++) {
      const bad = before.marks[i] & ~settled[i]
      for (let d = 0; d < 9; d++) if (bad & (1 << d)) n++
    }
    return n
  }, [before, settled])

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
          {/* Walked away and gave up are both incomplete, and only one was a
              decision. The record knows which; say it. */}
          {!game.completed && (
            <span className="reviewTag warn">{game.forfeited ? 'gave up' : 'unfinished'}</span>
          )}
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
              Time
            </button>
            <button role="tab" aria-selected={mode === 'moves'}
              className={'segTab' + (mode === 'moves' ? ' on' : '')} onClick={() => setMode('moves')}>
              {/* "Every move" wrapped onto two lines once a fourth tab existed. */}
              Moves
            </button>
            <button role="tab" aria-selected={mode === 'patterns'}
              className={'segTab' + (mode === 'patterns' ? ' on' : '')} onClick={() => setMode('patterns')}>
              Patterns
            </button>
          </div>

          {mode === 'patterns' && (
            examples.length === 0 ? (
              <p className="dataNote">
                This grid came apart on singles alone, so there is no pattern here worth drawing.
                Patterns show up from Hard onwards.
              </p>
            ) : (
              <>
                <div className="patChips">
                  {examples.map((ex, i) => (
                    <button
                      key={ex.technique}
                      className={'clsPip patChip' + (i === patternTab ? ' on' : '')}
                      onClick={() => setPatternTab(i)}
                    >
                      {TECHNIQUES[ex.technique]?.label || ex.technique}
                    </button>
                  ))}
                </div>
                {example && (
                  <div className="moveStage">
                    <ReviewBoard
                      puzzle={game.puzzle}
                      board={example.board}
                      solution={game.solution}
                      cands={example.cands}
                      showing="cands"
                      pattern={example.step}
                    />
                    <div className="stageSide">
                      <div className="stageHead">
                        <span className="moveWhat">{TECHNIQUES[example.technique]?.label}</span>
                        <span className="moveGap">{example.at}/81 filled</span>
                      </div>
                      <p className="stageWhy">{example.step.detail}</p>
                      <p className="stageNote">{TECHNIQUES[example.technique]?.about}</p>
                      <p className="stageNote">
                        This is the one from this grid, at the point it came up. The outlined cells
                        are the pattern; anything struck through is a candidate it rules out.
                      </p>
                      {onPractice && (
                        <button className="newBtn" onClick={() => onPractice(example.technique)}>
                          Practise {TECHNIQUES[example.technique]?.label}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          )}

          {(mode === 'replay' || mode === 'heatmap') && (
            <ReviewBoard
              puzzle={game.puzzle}
              board={mode === 'replay' ? board : game.solution}
              solution={game.solution}
              cands={mode === 'replay' ? replayCands : null}
              marks={mode === 'replay' ? replayMarks : null}
              showing={mode === 'replay' ? layer : 'none'}
              focus={mode === 'replay' && current && !current.changes ? current.cell : -1}
              heat={mode === 'heatmap' ? heat.cells : null}
              heatLevel={mode === 'heatmap' ? level : null}
            />
          )}

          {mode === 'moves' && (
            <div className="moveReview">
              {line && <p className="verdict">{line}</p>}
              {shape.map(o => (
                <p className={'timeNote ' + o.tone} key={o.id}>{o.text}</p>
              ))}

              <div className="clsRow">
                {['sharp', 'solid', 'routine', 'lucky', 'mistake', 'hint']
                  .filter(k => analysis.counts[k])
                  .map(k => (
                    <span className={'clsPip ' + k} key={k}>
                      {analysis.counts[k]} {plural(k, analysis.counts[k])}
                    </span>
                  ))}
              </div>
              {/* The board the explanation is about, with the pattern drawn on
                  it. Without this the review asserted things about candidates
                  while showing a grid that had none. */}
              {move && (
                <div className="moveStage">
                  <ReviewBoard
                    puzzle={game.puzzle}
                    board={before.board}
                    solution={game.solution}
                    cands={trueCands}
                    marks={before.marks}
                    settled={settled}
                    showing={layer}
                    pattern={move.pattern || move.alternative?.step || null}
                    focus={cellFocus ?? move.cell}
                    alternative={move.alternative?.cell ?? -1}
                    onCell={setCellFocus}
                  />
                  <div className="stageSide">
                    {cellFocus !== null && (
                      <div className="cellStory">
                        <div className="stageHead">
                          <span className="moveWhat">
                            r{Math.floor(cellFocus / 9) + 1}c{(cellFocus % 9) + 1}
                          </span>
                          <button className="linkBtn" onClick={() => setCellFocus(null)}>close</button>
                        </div>
                        {history.length ? (
                          <ol className="storyList">
                            {history.map((h, k) => (
                              <li className={'storyItem ' + h.kind} key={k}>
                                <span className="storyTime">{fmtMs(h.t)}</span>
                                <span className="storyText">{h.text}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="stageNote">Nothing ever happened here. It was filled by auto-complete or never touched.</p>
                        )}
                      </div>
                    )}
                    <div className="stageHead">
                      <span className="moveNo">{move.n}</span>
                      <span className="moveWhat">{move.value} to {move.cellName}</span>
                      <span className={'moveCls ' + move.cls} title={CLASSES[move.cls].about}>
                        {CLASSES[move.cls].label}
                      </span>
                      <span className="moveGap">{(move.gap / 1000).toFixed(1)}s</span>
                    </div>
                    <p className="stageWhy">{move.why}</p>
                    {move.alternative && (
                      <p className="moveAlt">
                        Easier was {move.alternative.digit} to r{Math.floor(move.alternative.cell / 9) + 1}
                        c{(move.alternative.cell % 9) + 1}: {move.alternative.detail}
                      </p>
                    )}
                    <div className="segTabs small" role="tablist">
                      <button role="tab" aria-selected={layer === 'cands'}
                        className={'segTab' + (layer === 'cands' ? ' on' : '')}
                        onClick={() => setLayer('cands')}>
                        What the board proved
                      </button>
                      <button role="tab" aria-selected={layer === 'marks'}
                        className={'segTab' + (layer === 'marks' ? ' on' : '')}
                        onClick={() => setLayer('marks')}>
                        Your notes
                      </button>
                    </div>
                    {layer !== 'marks' && move.pattern?.derived && (
                      <p className="stageNote">
                        These candidates include the eliminations the ladder can make first. On the
                        raw board the pattern is not visible yet, which is exactly what made this
                        move worth more than a scan.
                      </p>
                    )}
                    {layer === 'marks' && (
                      <p className="stageNote">
                        {!before.exact
                          ? 'This game was recorded before undos stored their notes, so these are approximate after the first undo.'
                          : staleCount > 0
                            ? `${staleCount} of your notes here were already impossible, struck through below. Some of those take a pattern to see, so this is what the board knew, not what you should have spotted.`
                            : 'Every note here was still possible.'}
                      </p>
                    )}
                    <ol className="moveList">
                      {analysis.moves.map(mv => (
                        <li
                          className={'moveItem ' + mv.cls + (move?.index === mv.index ? ' on' : '')}
                          key={mv.index}
                        >
                          <button
                            className="moveJump"
                            aria-current={move?.index === mv.index}
                            onClick={() => {
                              // Selecting drives the board above rather than jumping
                              // away to the replay tab: the explanation and the
                              // evidence should be on screen together.
                              setSelected(mv.index)
                              const at = steps.indexOf(mv.index)
                              if (at >= 0) { setPlaying(false); setPos(at) }
                            }}
                            title="Show this move on the board"
                          >
                            <span className="moveHead">
                              <span className="moveNo">{mv.n}</span>
                              <span className="moveWhat">{mv.value} to {mv.cellName}</span>
                              <span className={'moveCls ' + mv.cls}>{CLASSES[mv.cls].label}</span>
                              <span className="moveGap">{(mv.gap / 1000).toFixed(1)}s</span>
                            </span>
                            <span className="moveWhy">{mv.why}</span>
                            {mv.alternative && (
                              <span className="moveAlt">
                                Easier was {mv.alternative.digit} to r{Math.floor(mv.alternative.cell / 9) + 1}
                                c{(mv.alternative.cell % 9) + 1}: {mv.alternative.detail}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'replay' && (
            <div className="segTabs small" role="tablist">
              <button role="tab" aria-selected={layer === 'cands'}
                className={'segTab' + (layer === 'cands' ? ' on' : '')}
                onClick={() => setLayer('cands')}>
                What the board proved
              </button>
              <button role="tab" aria-selected={layer === 'marks'}
                className={'segTab' + (layer === 'marks' ? ' on' : '')}
                onClick={() => setLayer('marks')}>
                Your notes
              </button>
              <button role="tab" aria-selected={layer === 'none'}
                className={'segTab' + (layer === 'none' ? ' on' : '')}
                onClick={() => setLayer('none')}>
                Digits only
              </button>
            </div>
          )}

          {mode === 'replay' && (
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
          )}
          {mode === 'heatmap' && (
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
