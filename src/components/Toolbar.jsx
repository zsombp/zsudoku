import { Undo, Eraser, Pencil, Sparkles } from './Icons.jsx'

export default function Toolbar({ canUndo, notes, disabled, onUndo, onErase, onToggleNotes, onAutoPencil }) {
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
        <span>Auto notes</span>
      </button>
    </div>
  )
}
