import { useEffect, useRef } from 'react'
import { rowOf, colOf, boxOf, range, UNITS, UNIT_META } from '../logic/topology.js'
import { hasMark } from '../logic/marks.js'
import { isWrong, highlightDigit } from '../state/gameReducer.js'

export default function Board({ state, checkErrors, canGo, revealWrong, onCellTap, onCellTint, blurred, reveal }) {
  const { board, puzzle, marks, selected, activeDigit, hintCell, flash, flashSeq, status, tints, solution, explain } = state
  const flashSet = flash?.length ? new Set(flash) : null
  const ready = Boolean(board)
  const litDigit = ready ? highlightDigit(state) : 0
  const gridRef = useRef(null)

  // The pattern the hint button is pointing at. Drawn on the live board rather
  // than described in a bar, because "there is an X-Wing on rows 2 and 6" is
  // only useful to someone who can already find one.
  const pattern = explain?.pattern || null
  const patternCells = pattern ? new Set(pattern.cells || []) : null
  const patternUnit = pattern?.unitCells
    ? new Set(pattern.unitCells)
    : pattern?.unit
      ? new Set(
          UNITS[
            UNIT_META.findIndex(u => u.type === pattern.unit.type && u.index === pattern.unit.index)
          ] || []
        )
      : null
  const killed = new Map()
  for (const e of pattern?.eliminations || []) {
    if (!killed.has(e.cell)) killed.set(e.cell, new Set())
    killed.get(e.cell).add(e.digit)
  }
  // Long-press on touch, right-click on a pointer device. Deliberately not a
  // toolbar button: the toolbar is already at eight, and tinting is a thing you
  // do to a cell, so it belongs on the cell.
  const pressRef = useRef({ timer: null, cell: -1, fired: false })

  const startPress = i => {
    clearTimeout(pressRef.current.timer)
    pressRef.current = {
      cell: i,
      fired: false,
      timer: setTimeout(() => {
        pressRef.current.fired = true
        onCellTint(i)
      }, 450),
    }
  }
  const endPress = () => {
    clearTimeout(pressRef.current.timer)
    pressRef.current.timer = null
  }
  useEffect(() => () => clearTimeout(pressRef.current.timer), [])

  // Roving tabindex: exactly one cell is in the tab order, so Tab moves from
  // the board to the toolbar in one press instead of eighty-one. Arrow keys
  // move the selection, and the effect below carries DOM focus along with it so
  // the two never drift apart.
  const tabCell = selected >= 0 ? selected : 40

  useEffect(() => {
    if (selected < 0 || !gridRef.current) return
    // Only follow the selection when focus is already inside the board,
    // otherwise clicking a cell would yank focus away from wherever the player
    // actually was.
    if (!gridRef.current.contains(document.activeElement)) return
    const target = gridRef.current.children[selected]
    if (target && target !== document.activeElement) target.focus()
  }, [selected])

  function cellClass(i) {
    const cls = ['cell']
    if (colOf(i) % 3 === 2 && colOf(i) !== 8) cls.push('bR')
    if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cls.push('bB')
    if (!ready) return cls.join(' ')

    if (selected === i) cls.push('sel')
    else if (
      selected >= 0 &&
      (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected))
    ) cls.push('peer')

    // With a digit armed, every cell holding it lights up, including the
    // selected one. Without one, keep the old rule of not double-marking the
    // cell you are already sitting on.
    if (litDigit && board[i] === litDigit && (activeDigit || i !== selected)) cls.push('same')

    if (puzzle[i] !== 0) cls.push('given')
    else if (board[i] !== 0) cls.push('user')
    // Otherwise a hint looks like nothing happened. Cleared by the next move.
    if (i === hintCell) cls.push('hinted')
    // Always-on mistake marking, or the brief reveal from the Check button.
    if ((checkErrors || revealWrong) && isWrong(state, i)) cls.push('wrong')
    // Empty cells the highlighted digit could still legally occupy.
    if (canGo?.has(i)) cls.push('canGo')
    // After giving up, the cells you never filled carry the answer, marked as
    // the app's digits rather than yours.
    if (reveal && board[i] === 0) cls.push('revealed')
    if (tints?.[i]) cls.push('tint' + tints[i])
    if (patternUnit?.has(i)) cls.push('inUnit')
    if (patternCells?.has(i)) cls.push('inPattern')
    if (explain && i === explain.cell) cls.push('explained')
    return cls.join(' ')
  }

  return (
    // Keyed on the puzzle so a new board remounts its cells and the entrance
    // stagger actually replays. Without the key React reuses the same elements
    // and the animation only ever runs once, on first load.
    <div
      key={state.seed ?? 'empty'}
      ref={gridRef}
      className={'board' + (blurred ? ' blurred' : '') + (status === 'won' ? ' isWon' : '')}
    >
      {range(81).map(i => {
        const own = ready ? board[i] : 0
        const v = own === 0 && reveal && solution ? solution[i] : own
        const isFlashing = flashSet?.has(i)
        return (
          <button
            key={i}
            className={cellClass(i) + (isFlashing ? ' flash' : '')}
            tabIndex={i === tabCell ? 0 : -1}
            style={{
              '--d': rowOf(i) + colOf(i),
              // Two identical keyframes alternating by sequence number. This is
              // what retriggers the flash when the same cells complete twice in
              // a row. The obvious approach, changing the element's key, forces
              // a remount, and a fresh node restarts the board's entrance
              // animation: the completed cells blinked out and re-dealt at the
              // exact moment they were meant to be celebrated.
              '--flash-anim': flashSeq % 2 ? 'unitFlashA' : 'unitFlashB',
            }}
            onClick={() => {
              // Swallow the click that ends a long press, or tinting a cell
              // would also select or fill it.
              if (pressRef.current.fired) { pressRef.current.fired = false; return }
              onCellTap(i)
            }}
            onContextMenu={e => { e.preventDefault(); onCellTint(i) }}
            onPointerDown={() => startPress(i)}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            onPointerCancel={endPress}
            aria-label={`row ${rowOf(i) + 1} column ${colOf(i) + 1}${v ? `, ${v}` : ', empty'}`}
          >
            {v !== 0 ? (
              <span className="val">{v}</span>
            ) : (
              ready && marks[i] !== 0 && (
                <span className="marks">
                  {range(9).map(k => {
                    const d = k + 1
                    const on = hasMark(marks[i], d)
                    const dead = killed.get(i)?.has(d)
                    const lit = patternCells?.has(i) && pattern.digits?.includes(d)
                    return (
                      <span
                        key={k}
                        className={
                          'm' +
                          (on && litDigit === d ? ' mHi' : '') +
                          (on && dead ? ' mDead' : '') +
                          (on && lit ? ' mPat' : '')
                        }
                      >
                        {on ? d : ''}
                      </span>
                    )
                  })}
                </span>
              )
            )}
          </button>
        )
      })}
    </div>
  )
}
