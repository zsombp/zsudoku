import { useEffect, useMemo, useState } from 'react'
import { rowOf, colOf } from '../logic/topology.js'
import { fmtMs } from '../lib/format.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { createState } from '../logic/grader.js'
import { workedExamples } from '../logic/explain.js'
import { boardAt, stateAt, replaySteps, stallHeatmap, summarise, cellHistory } from '../stats/replay.js'
import { analyseGame, verdict, timeShape, settledCands, CLASSES } from '../stats/analysis.js'
import { falseBeliefs, beliefVerdict } from '../stats/beliefs.js'
import { narrate, headline } from '../stats/narrate.js'
import { flowSummary } from '../stats/flow.js'
import ReviewBoard from './ReviewBoard.jsx'
import FlowStrip from './FlowStrip.jsx'
import SolveArt from './SolveArt.jsx'
import { Play, Pause } from './Icons.jsx'
import { Fact } from './stats/charts.jsx'
import { Explain, Term, TermGroup, termLabel } from './Term.jsx'
import { classTerm, define, techniqueTerm } from '../logic/glossary.js'

/**
 * The move classes, out of the glossary rather than out of `CLASSES.about`.
 *
 * `analysis.js` carries a second sentence for each class, which this screen used
 * to print, and a class explained one way here and another way in a legend is
 * exactly what the glossary exists to stop. Labels still come from `CLASSES`,
 * because that is where the classifier's own word for a class lives and
 * glossary.test.js asserts the two agree.
 */
const classAbout = key => define(classTerm(key))?.definition

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

export default function GameReview({ game, onBack, onPractice, onDelete }) {
  const [mode, setMode] = useState('replay')
  const steps = useMemo(() => replaySteps(game), [game])
  const [pos, setPos] = useState(steps.length ? steps.length - 1 : 0)
  const [playing, setPlaying] = useState(false)

  const heat = useMemo(() => stallHeatmap(game), [game])
  const info = useMemo(() => summarise(game), [game])
  // Where the clock went, as opposed to where on the grid it went. 0.03ms on a
  // full game, so it is computed on open like the rest rather than gated on the
  // tab: the account of a game should not change depending on what you tapped.
  const flow = useMemo(() => flowSummary(game), [game])
  // Roughly 1600 operations per placement, so a 60-move game costs about a
  // tenth of a second. Cheap enough to do on open rather than in the worker.
  const analysis = useMemo(() => analyseGame(game), [game])
  const line = useMemo(() => verdict(analysis), [analysis])
  const shape = useMemo(() => timeShape(analysis), [analysis])

  // The patterns this grid actually required, drawn from this grid. Costs a
  // full ladder walk, so it waits until the tab is opened.
  const [patternTab, setPatternTab] = useState(0)

  // A full ladder pass per board-changing move, so about a tenth of a second
  // for a game. Waits until the tab is opened.
  const [beliefTab, setBeliefTab] = useState(0)
  // Computed on open rather than when the Notes tab is reached. It costs about
  // twenty milliseconds on a full game, and gating it made the account of the
  // game change depending on which tab you happened to be looking at, which is
  // worse than the cost by a wide margin.
  const beliefs = useMemo(() => falseBeliefs(game), [game])
  const belief = beliefs?.stale[Math.min(beliefTab, beliefs.stale.length - 1)] || null
  // The position at the moment the note stopped being true.
  const beliefAt = useMemo(
    () => (belief ? stateAt(game, belief.diedAtIndex) : null),
    [game, belief]
  )
  const beliefTruth = useMemo(() => (beliefAt ? settledCands(beliefAt.board) : null), [beliefAt])

  // The account of the game, above the numbers. Declared after `beliefs`
  // because a dependency array is evaluated the moment the hook is called, so
  // naming it any earlier is a use-before-initialisation and a blank screen.
  const story = useMemo(
    () => narrate(game, analysis, beliefs, info),
    [game, analysis, beliefs, info]
  )
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
  const [confirmDelete, setConfirmDelete] = useState(false)
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
        <div className="topBtns">
          {/* Two-step, like giving up. Every statistic is computed from this
              log, so a game that was not really played is not a harmless extra
              row: it moves medians, win rates and the coach's thresholds. */}
          {onDelete && (
            confirmDelete ? (
              <span className="quitAsk">
                Delete this game?
                <button className="linkBtn danger" onClick={() => onDelete(game)}>yes</button>
                <button className="linkBtn" onClick={() => setConfirmDelete(false)}>no</button>
              </span>
            ) : (
              <button className="linkBtn" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
          <button className="newBtn" onClick={onBack}>Back</button>
        </div>
      </header>

      <div className="reviewHead">
        <div className="reviewTitle">
          {/* The grader's verdict on the puzzle, never the tier that was asked
              for, which is the distinction the whole engine is built on. */}
          <Term id="graded">{game.graded}</Term>
          {game.daily && <span className="reviewTag">daily</span>}
          {/* Walked away and gave up are both incomplete, and only one was a
              decision. The record knows which; say it. */}
          {/* Both tags carry a rule nothing on this screen states: an
              unfinished game is still in the win rate's denominator, and giving
              up is recorded as a loss so that quitting tidily cannot improve
              it. Pressable, because there is no room beside a title. */}
          {!game.completed && (
            <span className="reviewTag warn">
              <Term id={game.forfeited ? 'gaveUp' : 'unfinished'}>
                {game.forfeited ? 'gave up' : 'unfinished'}
              </Term>
            </span>
          )}
        </div>
        <div className="reviewMeta">
          {new Date(game.endedAt).toLocaleString()} · {fmtMs(game.durationMs)}
          {/* "needed X" describes the puzzle, not the player, and both halves
              of it are terms: what hardest means, and what that rung is. */}
          {game.hardest && (
            <>
              {' · '}<Term id="hardest">needed</Term>{' '}
              <Term id={techniqueTerm(game.hardest)}>
                {TECHNIQUES[game.hardest]?.label || game.hardest}
              </Term>
            </>
          )}
        </div>
      </div>

      {/* The account of the game, before any of the numbers, because what a
          game was like is the thing anyone actually remembers. */}
      {story.length > 0 && (
        <div className="story">
          <p className="storyLead">{headline(game)}</p>
          {story.map((line, i) => (
            <p className="storyLine" key={i}>{line}</p>
          ))}
        </div>
      )}

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
            <button role="tab" aria-selected={mode === 'beliefs'}
              className={'segTab' + (mode === 'beliefs' ? ' on' : '')} onClick={() => setMode('beliefs')}>
              Notes
            </button>
            <button role="tab" aria-selected={mode === 'art'}
              className={'segTab' + (mode === 'art' ? ' on' : '')} onClick={() => setMode('art')}>
              Picture
            </button>
          </div>

          {mode === 'art' && <SolveArt game={game} analysis={analysis} />}

          {mode === 'beliefs' && beliefs && (
            <div className="moveReview">
              <p className="verdict">{beliefVerdict(beliefs)}</p>
              {/* A stale note is a narrow and unobvious idea: a note that was
                  true and stopped being true while you kept it, which is not
                  the same as a note that is wrong. Full width, so it is said
                  rather than waited for. */}
              <Explain id="staleNote" />
              {!beliefs.stale.length ? (
                <p className="dataNote">
                  A note counts here only if it was genuinely possible and then stopped being so
                  while you kept it. Notes that were never on, including the ones auto-pencil writes
                  that a pattern had already ruled out, are not your belief and are not counted.
                </p>
              ) : (
                <>
                  <div className="patChips">
                    {beliefs.stale.slice(0, 8).map((b, i) => (
                      <button
                        key={b.cell * 10 + b.digit}
                        className={'clsPip patChip' + (i === beliefTab ? ' on' : '')}
                        onClick={() => setBeliefTab(i)}
                      >
                        {b.digit} in {b.cellName}
                        {b.mistakesHere > 0 && ' !'}
                      </button>
                    ))}
                  </div>
                  {belief && beliefAt && (
                    <div className="moveStage">
                      <ReviewBoard
                        puzzle={game.puzzle}
                        board={beliefAt.board}
                        solution={game.solution}
                        cands={beliefTruth}
                        marks={beliefAt.marks}
                        settled={beliefTruth}
                        showing="marks"
                        focus={belief.cell}
                      />
                      <div className="stageSide">
                        <div className="stageHead">
                          <span className="moveWhat">{belief.digit} in {belief.cellName}</span>
                          <span className="moveGap">{fmtMs(belief.diedAt)}</span>
                        </div>
                        <p className="stageWhy">
                          This is the moment it stopped being possible. You kept it for{' '}
                          {belief.heldMs >= 60000
                            ? `${(belief.heldMs / 60000).toFixed(1)} minutes`
                            : `${Math.round(belief.heldMs / 1000)} seconds`}
                          {belief.reason === 'kept'
                            ? ', all the way to the end of the game.'
                            : belief.reason === 'erased'
                              ? ', then rubbed it out.'
                              : ', then filled the cell in.'}
                        </p>
                        {belief.mistakesHere > 0 && (
                          <p className="timeNote warn">
                            {belief.mistakesHere === 1 ? 'A wrong digit' : `${belief.mistakesHere} wrong digits`} went
                            into this cell while that note was still sitting in it. The app cannot know what you were
                            thinking, only what was in front of you.
                          </p>
                        )}
                        <p className="stageNote">
                          Struck through on the board: every note that was impossible at this point. The
                          board shows what you had written down, not what was true.
                        </p>
                        {beliefs.stale.length > 8 && (
                          <p className="stageNote">
                            Notes go out of date as the grid fills, and nothing rubs them out for you
                            except placing a digit. Pressing Auto again rewrites every note from the
                            board as it stands, which is the whole fix.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {beliefs.misreads.length > 0 && (
                <p className="timeNote warn">
                  {beliefs.misreads.length} {beliefs.misreads.length === 1 ? 'note was' : 'notes were'} impossible
                  the moment you wrote {beliefs.misreads.length === 1 ? 'it' : 'them'}, by a plain scan of the row,
                  column and box. That is a <Term id="misread">misread</Term> rather than a belief going stale:{' '}
                  {beliefs.misreads.slice(0, 4).map(m => `${m.digit} in ${m.cellName}`).join(', ')}.
                </p>
              )}
            </div>
          )}

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
                      {/* The rung's own sentence, reached through the glossary
                          rather than off `TECHNIQUES` directly, so every screen
                          that describes a technique goes through one door. */}
                      <p className="stageNote">
                        {define(techniqueTerm(example.technique))?.definition}
                      </p>
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
              {/* The verdict is a percentage of justified placements and never
                  says what that share is over. Full width, so it says it. */}
              {line && <Explain id="justifiedPlacements" />}
              {shape.map(o => (
                <p className={'timeNote ' + o.tone} key={o.id}>{o.text}</p>
              ))}
              {/* These three notes are time crossed with judgment, and all
                  three thresholds are relative to this game rather than
                  absolute. Attached to the group rather than to a paragraph,
                  because two of the four notes rest on the same term and a
                  trigger inside a note would vanish with it. */}
              {shape.length > 0 && (
                <TermGroup>
                  <p className="termHint">
                    Measured against this game's own rhythm: <Term id="longThink" />
                    {' · '}<Term id="slowEasy" />{' · '}<Term id="fastGuess" />
                  </p>
                </TermGroup>
              )}

              {/* Six words the app coined, sitting over six counts. They were
                  explained by a `title` on one of them, which is nothing at all
                  on a phone. */}
              <TermGroup hint="Tap a class for what it means.">
                <div className="clsRow">
                  {['sharp', 'solid', 'routine', 'lucky', 'mistake', 'hint']
                    .filter(k => analysis.counts[k])
                    .map(k => (
                      <Term id={classTerm(k)} className={'clsPip ' + k} key={k}>
                        {analysis.counts[k]} {plural(k, analysis.counts[k])}
                      </Term>
                    ))}
                </div>
              </TermGroup>
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
                      <span className={'moveCls ' + move.cls}>{CLASSES[move.cls].label}</span>
                      <span className="moveGap">{(move.gap / 1000).toFixed(1)}s</span>
                    </div>
                    <p className="stageWhy">{move.why}</p>
                    {/* What the class means, as opposed to why this move earned
                        it. Was a hover, so it did not exist on a phone, and it
                        was a second sentence about a class the glossary already
                        defines. One source, always on: this line is full width
                        and the definition is three lines at worst. */}
                    <p className="stageNote">
                      {CLASSES[move.cls].label}: {classAbout(move.cls)}
                    </p>
                    {move.alternative && (
                      <p className="moveAlt">
                        <Term id="easierWas">Easier was</Term> {move.alternative.digit} to
                        r{Math.floor(move.alternative.cell / 9) + 1}
                        c{(move.alternative.cell % 9) + 1}: {move.alternative.detail}
                      </p>
                    )}
                    {/* The two hardest words on this screen, and the whole
                        point of the review: what the board could prove against
                        what you had written down. A tab cannot hold a trigger,
                        so the definition of whichever one is showing sits under
                        the strip, where there is the full column for it. */}
                    <div className="segTabs small" role="tablist">
                      <button role="tab" aria-selected={layer === 'cands'}
                        className={'segTab' + (layer === 'cands' ? ' on' : '')}
                        onClick={() => setLayer('cands')}>
                        {termLabel('boardProved', 'What the board proved')}
                      </button>
                      <button role="tab" aria-selected={layer === 'marks'}
                        className={'segTab' + (layer === 'marks' ? ' on' : '')}
                        onClick={() => setLayer('marks')}>
                        {termLabel('yourNotes', 'Your notes')}
                      </button>
                    </div>
                    <Explain id={layer === 'marks' ? 'yourNotes' : 'boardProved'} />
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
            <>
              <div className="segTabs small" role="tablist">
                <button role="tab" aria-selected={layer === 'cands'}
                  className={'segTab' + (layer === 'cands' ? ' on' : '')}
                  onClick={() => setLayer('cands')}>
                  {termLabel('boardProved', 'What the board proved')}
                </button>
                <button role="tab" aria-selected={layer === 'marks'}
                  className={'segTab' + (layer === 'marks' ? ' on' : '')}
                  onClick={() => setLayer('marks')}>
                  {termLabel('yourNotes', 'Your notes')}
                </button>
                <button role="tab" aria-selected={layer === 'none'}
                  className={'segTab' + (layer === 'none' ? ' on' : '')}
                  onClick={() => setLayer('none')}>
                  Digits only
                </button>
              </div>
              {/* Nothing for "Digits only", which needs no definition. */}
              <Explain id={layer === 'marks' ? 'yourNotes' : layer === 'cands' ? 'boardProved' : null} />
            </>
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
            <>
              <div className="heatKey">
                <span>quick</span>
                <span className="hkSwatch h1" /><span className="hkSwatch h2" />
                <span className="hkSwatch h3" /><span className="hkSwatch h4" />
                <span>slow · up to {Math.round(heat.max / 1000)}s on one cell</span>
              </div>
              {/* The grid above says where the time went. This says when. */}
              <h3 className="statHeading">Where the rhythm was</h3>
              {/* The one thing flow and struggle are read from, and the reason
                  neither of them asks the grader what the board offered. */}
              <Explain id="cadence" />
              <FlowStrip summary={flow} />
            </>
          )}

          {/* Eight bare numbers, and every one of them was a definition
              nothing on the device stated. Three of them are actively
              surprising: Wrong counts every wrong digit including the ones you
              undid, so it can exceed the Mistakes the record carries; a note
              pencilled in and rubbed out again is two pencil marks; and Hints
              only moves when a digit lands. A fact is 82px wide on the phone
              and the sentence would take it from 53px to 213px, so the fact is
              the trigger and the answer lands under the row. */}
          <TermGroup hint="Tap a figure for what it counts in this game.">
            <div className="reviewStats">
              <Fact term="placements" value={info.placements} />
              <Fact term="wrong" value={info.wrong} />
              <Fact term="undos" value={info.undos} />
              <Fact term="hints" value={game.hints} />
              <Fact term="firstMove" value={fmtMs(info.timeToFirstMove)} />
              <Fact
                term="longestPause"
                value={fmtMs(info.longest.gap)}
                sub={info.longest.cell >= 0
                  ? `r${rowOf(info.longest.cell) + 1}c${colOf(info.longest.cell) + 1}`
                  : ''}
              />
              <Fact term="pencilMarks" value={info.pencilMarks + (info.usedAutoPencil ? '+auto' : '')} />
              <Fact term="checks" value={game.checks ?? 0} />
            </div>
          </TermGroup>
        </>
      )}
    </div>
  )
}
