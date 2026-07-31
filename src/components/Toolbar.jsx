import { Undo, Redo, Eraser, Pencil, Sparkles, Zap, Bulb, Check } from './Icons.jsx'

export default function Toolbar({
  canUndo, canRedo, notes, quick, disabled, showCheck,
  onUndo, onRedo, onErase, onToggleNotes, onAutoPencil, onToggleQuick, onHint, onCheck,
}) {
  return (
    <div className="tools">
      <button className="tool" disabled={disabled || !canUndo} onClick={onUndo}>
        <Undo size={19} />
        <span>Undo</span>
      </button>
      <button className="tool" disabled={disabled || !canRedo} onClick={onRedo}>
        <Redo size={19} />
        <span>Redo</span>
      </button>
      <button className="tool" disabled={disabled} onClick={onErase}>
        <Eraser size={19} />
        <span>Erase</span>
      </button>
      <button
        className={'tool' + (notes ? ' on' : '')}
        disabled={disabled}
        onClick={onToggleNotes}
        aria-pressed={notes}
      >
        <Pencil size={19} />
        <span>Notes</span>
      </button>
      <button className="tool" disabled={disabled} onClick={onAutoPencil}>
        <Sparkles size={19} />
        <span>Auto</span>
      </button>
      <button
        className={'tool' + (quick ? ' on' : '')}
        disabled={disabled}
        onClick={onToggleQuick}
        aria-pressed={quick}
        title="Pick a number, then tap cells to fill them"
      >
        <Zap size={19} />
        <span>Quick</span>
      </button>
      <button
        className="tool"
        disabled={disabled}
        onClick={onHint}
        title="Fill in the easiest cell available"
      >
        <Bulb size={19} />
        <span>Hint</span>
      </button>
      {/* Redundant when "Show mistakes" is on: a wrong digit is already marked
          the instant it is placed, so asking is asking a question you can
          already see the answer to. It only earns a slot when you are playing
          without that net. */}
      {showCheck && (
        <button
          className="tool"
          disabled={disabled}
          onClick={onCheck}
          title="Briefly show any wrong digits"
        >
          <Check size={19} />
          <span>Check</span>
        </button>
      )}
    </div>
  )
}
