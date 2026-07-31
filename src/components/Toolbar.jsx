import { Undo, Eraser, Pencil, Sparkles, Zap } from './Icons.jsx'

export default function Toolbar({
  canUndo, notes, quick, disabled,
  onUndo, onErase, onToggleNotes, onAutoPencil, onToggleQuick,
}) {
  return (
    <div className="tools">
      <button className="tool" disabled={disabled || !canUndo} onClick={onUndo}>
        <Undo size={19} />
        <span>Undo</span>
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
    </div>
  )
}
