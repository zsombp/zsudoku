import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyse, survivorPhrase, SOURCE_LABEL } from '../logic/lessons.js'
import { optionsOf, patternCellsOf, judge } from '../logic/worlds.js'
import { regionEdges, rowOf, colOf, range } from '../logic/topology.js'
import { hasMark } from '../logic/marks.js'
import { Explain, Term, TermGroup } from './Term.jsx'

/**
 * A lesson: one pattern on one real position, walked through as every way it
 * can go.
 *
 * The lesson itself is data from `src/logic/lessons.js`. This draws it: the
 * board with only the notes that matter, the step's highlight, and in the world
 * steps a digit dropped into each pattern cell with a beam from each placed
 * digit to every note it kills. The argument is never drawn by hand here; every
 * beam and every strike comes from `analyse`, so what the screen shows is what
 * the engine proved.
 *
 * Motion follows the house rule: every animation runs once on an interaction
 * and settles, and every animated thing rests in its end state with the
 * keyframes running from the start state. So a frame the animation never
 * reaches (reduced motion, a backgrounded tab) still shows the finished
 * picture, never an invisible one. "Play all" steps through the worlds once and
 * stops on its own.
 */
export default function Lesson({ lesson, onClose, onDrill = null }) {
  const [at, setAt] = useState(0)
  const [world, setWorld] = useState(0)
  const [visited, setVisited] = useState(() => new Set([0]))
  const [flawId, setFlawId] = useState(null)
  const [playing, setPlaying] = useState(false)
  const timer = useRef(null)
  const top = useRef(null)

  const steps = lesson.steps
  const step = steps[at]
  const mode = step.mode || 'build'
  const flaw = mode === 'break' ? lesson.flaws.find(f => f.id === flawId) || null : null
  const A = useMemo(() => analyse(lesson, flaw), [lesson, flaw])
  const W = A.worlds[world] || A.worlds[0] || null

  const stop = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    setPlaying(false)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const survivorOf = useCallback(f => analyse(lesson, f).survivorWorlds[0] ?? 0, [lesson])

  const enter = useCallback(
    i => {
      stop()
      const next = Math.max(0, Math.min(i, steps.length - 1))
      setAt(next)
      if (steps[next].mode === 'break' && lesson.flaws.length) {
        const f = lesson.flaws[0]
        const w = survivorOf(f)
        setFlawId(f.id)
        setWorld(w)
        setVisited(new Set([w]))
      } else {
        setFlawId(null)
        setWorld(0)
        setVisited(new Set([0]))
      }
    },
    [lesson, steps, stop, survivorOf]
  )

  const chooseFlaw = id => {
    stop()
    setFlawId(id)
    const f = lesson.flaws.find(x => x.id === id) || null
    const w = f ? survivorOf(f) : 0
    setWorld(w)
    setVisited(new Set([w]))
  }

  const showWorld = i => {
    stop()
    setWorld(i)
    setVisited(v => new Set(v).add(i))
  }

  const play = () => {
    if (playing) return stop()
    const n = A.worlds.length
    let i = 0
    setPlaying(true)
    const tick = () => {
      const k = i
      setWorld(k)
      setVisited(v => new Set(v).add(k))
      i++
      if (i < n) timer.current = setTimeout(tick, 1600)
      else {
        timer.current = null
        setPlaying(false)
      }
    }
    tick()
  }

  // Arrow keys walk the steps on a keyboard. Nothing else listens while a
  // lesson is open, because the views that open one are not the game.
  useEffect(() => {
    const onKey = e => {
      if (e.altKey || e.metaKey || e.ctrlKey) return
      if (e.target?.closest?.('input, textarea')) return
      if (e.key === 'ArrowRight' && at < steps.length - 1) enter(at + 1)
      else if (e.key === 'ArrowLeft' && at > 0) enter(at - 1)
      else if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, steps.length, enter, onClose])

  // A new step starts at the top of the lesson on a phone, where the board and
  // the text do not fit on one screen together.
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'nearest' })
  }, [at])

  const scene = useMemo(() => drawScene(lesson, step, mode, A, W, flaw), [lesson, step, mode, A, W, flaw])
  const sceneKey = `${at}:${world}:${flawId || ''}`

  const n = A.worlds.length
  const showWorlds = (mode === 'worlds' || mode === 'break') && n > 0
  const row = A.per[world] || []
  const killedHere = row.length > 0 && row.every(x => x.dies)

  let verdict = null
  if (mode === 'worlds') {
    verdict = visited.size >= n
      ? { tone: 'ok', text: lesson.intactLine(n) }
      : { tone: 'wait', text: `Checked ${visited.size} of ${n} worlds.` }
  } else if (mode === 'apply') {
    verdict = { tone: 'ok', text: lesson.intactLine(lesson.worldCount) }
  } else if (mode === 'break') {
    if (!flaw || A.intact) verdict = { tone: 'ok', text: lesson.intactLine(n) }
    else {
      const here = A.per[world] || []
      verdict = {
        tone: 'bad',
        text: here.some(x => !x.dies)
          ? `In world ${world + 1}, ${survivorPhrase(here)}. One world is enough, so nothing can be removed.`
          : `This world kills them, but ${A.survivorWorlds.length} of ${n} do not. Nothing can be removed.`,
      }
    }
  }

  const last = at === steps.length - 1
  const kicker = `${lesson.label} · ${SOURCE_LABEL[lesson.source] || SOURCE_LABEL.example}`

  return (
    <div className="statsView lessonView" ref={top}>
      <header className="top">
        <div className="brand">LESSON</div>
        <button className="newBtn" onClick={onClose}>Back</button>
      </header>
      {at === 0 && <Explain id="lesson" className="explain lsLede" />}

      <div className="lsLesson">
        <div className="lsHead">
          <div className="lsKicker">{kicker}</div>
          <h2 className="lsTitle" key={'t' + at}>{step.title}</h2>
        </div>

        <div className="lsBoardArea">
          <LessonBoard lesson={lesson} scene={scene} sceneKey={sceneKey} label={`${step.title}. ${step.text}`} />
          <p className="lsShowing">
            {lesson.lens
              ? lesson.focus
                ? `Only the ${lesson.lens}s that matter here are shown.`
                : `Only the ${lesson.lens}s are shown.`
              : lesson.focus
                ? 'Notes are shown only where they matter.'
                : null}
          </p>
        </div>

        {showWorlds && (
          <div className="lsWorlds">
            <TermGroup>
              <div className="lsWorldRow" role="tablist" aria-label="Worlds">
                <Term id="worlds" className="lsWorldLabel" />
                {A.worlds.map((_, i) => {
                  const mark =
                    mode === 'worlds' && !visited.has(i) ? 'unk' : A.per[i].every(x => x.dies) ? 'die' : 'live'
                  return (
                    <button
                      key={i}
                      role="tab"
                      aria-selected={i === world}
                      aria-label={`World ${i + 1}`}
                      className={'lsChip' + (i === world ? ' on' : '')}
                      onClick={() => showWorld(i)}
                    >
                      {i + 1}
                      <span className={'lsMk ' + mark} aria-hidden="true" />
                    </button>
                  )
                })}
                {n > 1 && (
                  <button className="lsChip lsPlayAll" onClick={play}>
                    {playing ? 'Stop' : 'Play all'}
                  </button>
                )}
              </div>
            </TermGroup>
            {W && (
              <p className="lsCaption" aria-live="polite" key={'c' + sceneKey}>
                {lesson.caption(W, A.cands)}{' '}
                {killedHere ? (
                  <span className="lsKill">{lesson.worldKill}</span>
                ) : (
                  <span className="lsLive">{survivorPhrase(row)} here.</span>
                )}
              </p>
            )}
          </div>
        )}

        <div className="lsText" key={'x' + at}>
          <p>{step.text}</p>
          {mode === 'apply' && step.payoff && <p className="lsPayoff">{step.payoff}</p>}
        </div>

        {verdict && (
          <div className={'lsVerdict ' + verdict.tone} aria-live="polite">
            {verdict.tone === 'ok' && <OkMark />}
            {verdict.tone === 'bad' && <BadMark />}
            <span>{verdict.text}</span>
          </div>
        )}

        {mode === 'break' && lesson.flaws.length > 0 && (
          <div className="lsFlaws">
            <span className="lsSmall">Break it one way</span>
            <div role="radiogroup" aria-label="Flaw" className="lsFlawList">
              {[{ id: null, label: 'Intact' }, ...lesson.flaws].map(o => (
                <button
                  key={o.id || 'intact'}
                  role="radio"
                  aria-checked={o.id === flawId}
                  className={'lsOpt' + (o.id === flawId ? ' on' : '')}
                  onClick={() => chooseFlaw(o.id)}
                >
                  <i aria-hidden="true" />
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {last && onDrill && (
          <div className="dataRow lsAfter">
            <button className="newBtn" onClick={onDrill}>Drill this pattern</button>
          </div>
        )}

        <nav className="lsNav" aria-label="Lesson steps">
          <button className="newBtn" disabled={at === 0} onClick={() => enter(at - 1)}>
            Back
          </button>
          <div className="lsDots">
            {steps.map((_, i) => (
              <button
                key={i}
                className={'lsDot' + (i === at ? ' on' : i < at ? ' past' : '')}
                aria-label={`Step ${i + 1} of ${steps.length}`}
                aria-current={i === at ? 'step' : undefined}
                onClick={() => enter(i)}
              />
            ))}
          </div>
          <button className="newBtn lsNext" onClick={() => (last ? onClose?.() : enter(at + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </nav>
      </div>
    </div>
  )
}

const OkMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="9" r="7.2" />
    <path d="M5.8 9.2l2.2 2.2 4.2-4.6" />
  </svg>
)

const BadMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="9" cy="9" r="7.2" />
    <path d="M9 5.2v4.6M9 12.6v.1" />
  </svg>
)

// ---- what the board shows at this step ----

const key = (c, d) => c + ':' + d

/**
 * Everything the board draws for one step and one world, as plain data: which
 * cells are banded, ringed or probed, what each note looks like, which digits
 * are dropped in, and every line on the overlay. Kept out of the render so the
 * board is a dumb function of it.
 */
function drawScene(lesson, step, mode, A, W, flaw) {
  const { board, topo, slots } = lesson
  const cands = A.cands
  const lens = lesson.lens
  const center = c => [colOf(c) + 0.5, rowOf(c) + 0.5]
  // The note's own position in the cell, so a beam lands on the digit it kills.
  const notePos = (c, d) =>
    lens
      ? center(c)
      : [colOf(c) + 0.05 + (((d - 1) % 3) + 0.5) * 0.3, rowOf(c) + 0.05 + (Math.floor((d - 1) / 3) + 0.5) * 0.3]

  const s = {
    // The candidates being drawn, with the flaw applied when one is on.
    mask: cands,
    band: new Set(),
    bandRows: new Set(),
    bandCols: new Set(),
    pat: new Set(),
    what: false,
    tgt: new Set(),
    notes: new Map(),
    ghosts: new Map(),
    placed: null,
    lines: [],
    hits: [],
    tags: [],
    crosses: [],
  }
  const mark = (c, d, cls, delay) => {
    const k = key(c, d)
    const cur = s.notes.get(k) || { cls: new Set(), delay: null }
    cur.cls.add(cls)
    if (delay != null) cur.delay = delay
    s.notes.set(k, cur)
  }
  const setBand = b => {
    if (!b) return
    for (const r of b.rows || []) {
      s.bandRows.add(r)
      for (const c of topo.rows[r]) s.band.add(c)
    }
    for (const x of b.cols || []) {
      s.bandCols.add(x)
      for (const c of topo.cols[x]) s.band.add(c)
    }
    for (const c of b.cells || []) s.band.add(c)
  }
  const slotNotes = () => optionsOf(slots, board, cands).flat()

  if (mode === 'build') {
    const hi = step.hi || {}
    setBand(hi.band)
    for (const c of hi.pat === 'slots' ? patternCellsOf(slots, board, cands) : hi.pat || []) s.pat.add(c)
    s.what = Boolean(hi.what)
    for (const c of hi.tgt || []) s.tgt.add(c)
    for (const [c, d] of hi.lit === 'slotNotes' ? slotNotes() : hi.lit || []) mark(c, d, 'lit')
    for (const [c, d] of hi.probe === 'targets' ? lesson.targets : hi.probe || []) mark(c, d, 'probe')
    ;(hi.links || []).forEach((ln, i) => {
      const [x1, y1] = center(ln.a)
      const [x2, y2] = center(ln.b)
      s.lines.push({ x1, y1, x2, y2, cls: ln.dashed ? 'lsLink dashed' : 'lsLink', delay: 0.08 + i * 0.12 })
      if (ln.label != null) s.tags.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, label: ln.label, delay: 0.3 + i * 0.12 })
    })
    ;(hi.blocks || []).forEach((b, i) => {
      const [x1, y1] = center(b.from)
      const [x2, y2] = center(b.to)
      s.lines.push({ x1, y1, x2, y2, cls: 'lsBlock', delay: 0.1 + i * 0.09 })
      s.crosses.push({ x: x2, y: y2, delay: 0.32 + i * 0.09 })
    })
  } else {
    setBand(lesson.band)
    for (const c of patternCellsOf(slots, board, cands)) s.pat.add(c)
    for (const [c, d] of lesson.targets) mark(c, d, 'probe')
    for (const [c, d] of flaw?.add || []) mark(c, d, 'stray')

    if (mode === 'apply') {
      const deadSet = new Set(A.dead.map(([c, d]) => key(c, d)))
      lesson.targets.forEach(([c, d], i) => {
        if (deadSet.has(key(c, d))) mark(c, d, 'gone', 0.12 + i * 0.06)
      })
      for (const [c, d] of lesson.controls) mark(c, d, 'keep')
      s.placed = lesson.placement || lesson.payoff
    } else if (W) {
      s.what = true
      let i = 0
      for (const [c, d] of W) s.ghosts.set(c, { d, delay: 0.05 + 0.08 * i++ })
      const judgeAll = (list, faint) =>
        list.forEach(([c, d], i) => {
          const j = judge(W, c, d, topo)
          if (j.dies) {
            mark(c, d, faint ? 'dead soft' : 'dead', 0.6 + i * 0.05)
            j.from.forEach((f, k) => {
              const [x1, y1] = center(f)
              const [x2, y2] = notePos(c, d)
              s.lines.push({ x1, y1, x2, y2, cls: faint ? 'lsBeam faint' : 'lsBeam', delay: 0.28 + i * 0.05 + k * 0.06 })
              if (!faint) s.hits.push({ cx: x2, cy: y2, delay: 0.62 + i * 0.05 })
            })
          } else if (!faint) mark(c, d, 'live', 0.6)
        })
      judgeAll(lesson.targets, false)
      judgeAll(lesson.controls, true)
    }
  }
  return s
}

function LessonBoard({ lesson, scene, sceneKey, label }) {
  const { board, topo } = lesson
  const edges = useMemo(() => regionEdges(topo), [topo])
  const lens = lesson.lens
  // Which cells show their notes at all. The rest of the board is context.
  const flawCells = new Set()
  for (const f of lesson.flaws) for (const [c] of f.add || []) flawCells.add(c)
  const shows = c => !lesson.focus || lesson.focus.has(c) || flawCells.has(c)

  return (
    <div className="lsFrame">
      <span />
      <div className="lsLabels lsCols" aria-hidden="true">
        {range(9).map(k => (
          <span key={k} className={'lsLab' + (scene.bandCols.has(k) ? ' on' : '')}>{k + 1}</span>
        ))}
      </div>
      <div className="lsLabels lsRows" aria-hidden="true">
        {range(9).map(k => (
          <span key={k} className={'lsLab' + (scene.bandRows.has(k) ? ' on' : '')}>{k + 1}</span>
        ))}
      </div>
      <div className={'lsBoard' + (lens ? ' lensed' : '')} role="img" aria-label={label}>
        {range(81).map(c => {
          const e = edges[c]
          const cls = ['lsCell']
          if (e.right && colOf(c) !== 8) cls.push('bR')
          if (e.bottom && rowOf(c) !== 8) cls.push('bB')
          if (scene.band.has(c)) cls.push('band')
          if (scene.pat.has(c)) cls.push(scene.what ? 'pat what' : 'pat')
          if (scene.tgt.has(c)) cls.push('tgt')
          if (scene.ghosts.has(c)) cls.push('hasGhost')
          const solved = scene.placed?.cell === c
          if (solved) cls.push('solved')
          const v = board[c]
          const notes = v === 0 && shows(c) ? noteList(lesson, scene, c) : []
          return (
            <div key={c} className={cls.join(' ')}>
              {v !== 0 && <span className={'lsG' + (lens && v === lens ? ' lensDigit' : '')}>{v}</span>}
              {notes.length > 0 && (
                <span className={'lsNotes' + (lens ? ' solo' : '')} key={sceneKey}>
                  {lens
                    ? notes.map(n => <i key={n.d} className={n.cls} style={n.style}>{n.d}</i>)
                    : range(9).map(k => {
                        const n = notes.find(x => x.d === k + 1)
                        return n ? <i key={k} className={n.cls} style={n.style}>{n.d}</i> : <i key={k} />
                      })}
                </span>
              )}
              {scene.ghosts.has(c) && (
                <span className="lsGhost" key={'g' + sceneKey} style={{ '--delay': scene.ghosts.get(c).delay + 's' }}>
                  {scene.ghosts.get(c).d}
                </span>
              )}
              {solved && (
                <span className="lsPlaced" key={'p' + sceneKey} style={{ '--delay': '0.62s' }}>
                  {scene.placed.digit}
                </span>
              )}
            </div>
          )
        })}
        <svg className="lsWires" viewBox="0 0 9 9" aria-hidden="true" key={'w' + sceneKey}>
          {scene.lines.map((l, i) => (
            <line key={i} className={l.cls} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} pathLength="1" style={{ '--delay': l.delay + 's' }} />
          ))}
          {scene.crosses.map((x, i) => (
            <g key={'x' + i} className="lsCross" style={{ '--delay': x.delay + 's' }} transform={`translate(${x.x} ${x.y})`}>
              <path d="M-0.14 -0.14L0.14 0.14M0.14 -0.14L-0.14 0.14" />
            </g>
          ))}
          {scene.hits.map((h, i) => (
            <circle key={'h' + i} className="lsHit" cx={h.cx} cy={h.cy} r="0.09" style={{ '--delay': h.delay + 's' }} />
          ))}
          {scene.tags.map((t, i) => (
            <g key={'t' + i} className="lsTag" style={{ '--delay': t.delay + 's' }} transform={`translate(${t.x} ${t.y})`}>
              <rect x="-0.21" y="-0.21" width="0.42" height="0.42" rx="0.12" />
              <text textAnchor="middle" dominantBaseline="central">{t.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

/** The notes one cell shows, each with the classes its role in the step gives it. */
function noteList(lesson, scene, c) {
  const out = []
  for (let d = 1; d <= 9; d++) {
    if (lesson.lens && d !== lesson.lens) continue
    if (!hasMark(scene.mask[c], d)) continue
    const n = scene.notes.get(key(c, d))
    const cls = ['lsN', ...(n ? [...n.cls] : [])].join(' ')
    out.push({ d, cls, style: n?.delay != null ? { '--delay': n.delay + 's' } : undefined })
  }
  return out
}
