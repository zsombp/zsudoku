import { Pause, Play } from './Icons.jsx'
import { fmtMs } from '../lib/format.js'
import { TECHNIQUES } from '../logic/techniques.js'

export default function StatusBar({ graded, tech, requested, hardest, ms, paused, canPause, onTogglePause }) {
  // The label is always the grader's verdict on this puzzle. When it disagrees
  // with what was asked for, say so out loud: quietly showing the requested
  // tier instead would be the exact lie this engine exists to avoid.
  const mismatched = requested && requested !== graded

  return (
    <div className="statusRow">
      <div className="chip">
        <b>{graded}</b>
        <span className="tech">{hardest ? TECHNIQUES[hardest].label : tech}</span>
        {mismatched && (
          <span className="asked" title={`You asked for ${requested}. This puzzle graded ${graded}.`}>
            asked {requested}
          </span>
        )}
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
