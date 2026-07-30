import { Pause, Play } from './Icons.jsx'
import { fmtMs } from '../lib/format.js'

export default function StatusBar({ label, tech, requested, ms, paused, canPause, onTogglePause }) {
  // The label is the grader's verdict. When it disagrees with what was asked
  // for, say so rather than quietly showing the requested level.
  const mismatched = requested && requested !== label

  return (
    <div className="statusRow">
      <div className="chip">
        <b>{label}</b>
        <span className="tech">{tech}</span>
        {mismatched && <span className="asked" title={`You asked for ${requested}`}>asked {requested}</span>}
      </div>
      <div className="timerWrap">
        <span className="timer">{fmtMs(ms)}</span>
        <button
          className="iconBtn"
          aria-label={paused ? 'Resume' : 'Pause'}
          disabled={!canPause}
          onClick={onTogglePause}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </div>
    </div>
  )
}
