import { useEffect, useRef, useState } from 'react'
import { Undo, Redo, Eraser, Pencil, Sparkles, Zap, Bulb, Check, Flag, FlagBack } from './Icons.jsx'

/**
 * What each tool is for, in one line.
 *
 * These were `title` attributes, which is the same as not writing them at all
 * on a phone: there is no hover on a touch screen, so every explanation here
 * was invisible on the device this app is mostly played on.
 *
 * They are reachable by press-and-hold now, which is the idiom the board
 * already uses for tinting a cell, and the title stays so a pointer still gets
 * a hover for free. Never hover on its own.
 */
const ABOUT = {
  undo: 'Steps back one move, including a whole auto-complete.',
  redo: 'Puts back a move you undid.',
  erase: 'Clears the selected cell, and restores the notes that digit displaced.',
  notes: 'Pencil mode: numbers go in as small candidates instead of an answer.',
  auto: 'Fills every candidate from the board as it stands, replacing your notes. Worth pressing again later, since notes go stale as the grid fills.',
  quick: 'Pick a number first, then tap cells to place it. Good for filling one digit everywhere.',
  hint: 'Fills in the easiest cell available. With "hints explain first" on, it points at the pattern instead and you press again for the digit.',
  mark: 'Saves this position before you guess, so you can come back to it.',
  return: 'Goes back to the position you marked. Undoable, so returning by mistake costs nothing.',
  check: 'Briefly reddens any wrong digit. Counted as an assist, because it is one.',
}

export default function Toolbar({
  canUndo, canRedo, notes, quick, disabled, showCheck, hasBookmark, onBookmark,
  onUndo, onRedo, onErase, onToggleNotes, onAutoPencil, onToggleQuick, onHint, onCheck,
}) {
  const [explain, setExplain] = useState(null)
  const press = useRef({ timer: null, fired: false })

  useEffect(() => () => clearTimeout(press.current.timer), [])

  // Hold to explain. The click that ends the hold is swallowed, or explaining
  // the hint button would also spend a hint.
  const hold = key => ({
    title: ABOUT[key],
    onPointerDown: () => {
      press.current.fired = false
      clearTimeout(press.current.timer)
      press.current.timer = setTimeout(() => {
        press.current.fired = true
        setExplain(key)
      }, 450)
    },
    onPointerUp: () => clearTimeout(press.current.timer),
    onPointerLeave: () => clearTimeout(press.current.timer),
    onPointerCancel: () => clearTimeout(press.current.timer),
    onContextMenu: e => {
      e.preventDefault()
      setExplain(key)
    },
  })

  const act = fn => () => {
    if (press.current.fired) {
      press.current.fired = false
      return
    }
    setExplain(null)
    fn()
  }

  return (
    <>
      <div className="tools">
        <button className="tool" disabled={disabled || !canUndo} onClick={act(onUndo)} {...hold('undo')}>
          <Undo size={19} />
          <span>Undo</span>
        </button>
        <button className="tool" disabled={disabled || !canRedo} onClick={act(onRedo)} {...hold('redo')}>
          <Redo size={19} />
          <span>Redo</span>
        </button>
        <button className="tool" disabled={disabled} onClick={act(onErase)} {...hold('erase')}>
          <Eraser size={19} />
          <span>Erase</span>
        </button>
        <button
          className={'tool' + (notes ? ' on' : '')}
          disabled={disabled}
          onClick={act(onToggleNotes)}
          aria-pressed={notes}
          {...hold('notes')}
        >
          <Pencil size={19} />
          <span>Notes</span>
        </button>
        <button className="tool" disabled={disabled} onClick={act(onAutoPencil)} {...hold('auto')}>
          <Sparkles size={19} />
          <span>Auto</span>
        </button>
        <button
          className={'tool' + (quick ? ' on' : '')}
          disabled={disabled}
          onClick={act(onToggleQuick)}
          aria-pressed={quick}
          {...hold('quick')}
        >
          <Zap size={19} />
          <span>Quick</span>
        </button>
        <button className="tool" disabled={disabled} onClick={act(onHint)} {...hold('hint')}>
          <Bulb size={19} />
          <span>Hint</span>
        </button>
        {/* One slot, two states, so the flow reads mark, explore, return. A
            separate "return" button would sit disabled most of the time. */}
        <button
          className={'tool' + (hasBookmark ? ' on' : '')}
          disabled={disabled}
          onClick={act(onBookmark)}
          {...hold(hasBookmark ? 'return' : 'mark')}
        >
          {hasBookmark ? <FlagBack size={19} /> : <Flag size={19} />}
          <span>{hasBookmark ? 'Return' : 'Mark'}</span>
        </button>
        {/* Redundant when "Show mistakes" is on: a wrong digit is already marked
            the instant it is placed, so asking is asking a question you can
            already see the answer to. It only earns a slot when you are playing
            without that net. */}
        {showCheck && (
          <button className="tool" disabled={disabled} onClick={act(onCheck)} {...hold('check')}>
            <Check size={19} />
            <span>Check</span>
          </button>
        )}
      </div>

      {explain && (
        <button className="toolAbout" onClick={() => setExplain(null)}>
          {ABOUT[explain]}
        </button>
      )}
    </>
  )
}
