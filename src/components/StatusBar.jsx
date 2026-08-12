import { Pause, Play } from './Icons.jsx'
import { fmtMs } from '../lib/format.js'
import { TECHNIQUES } from '../logic/techniques.js'
import { Term, TermGroup } from './Term.jsx'
import { techniqueTerm, tierTerm } from '../logic/glossary.js'

export default function StatusBar({ graded, tech, requested, hardest, ms, paused, canPause, onTogglePause }) {
  // The label is always the grader's verdict on this puzzle. When it disagrees
  // with what was asked for, say so out loud: quietly showing the requested
  // tier instead would be the exact lie this engine exists to avoid.
  const mismatched = requested && requested !== graded

  return (
    /* No standing prompt here, unlike the statistics screens. This row sits
     * above the board on the phone and a permanent line of instruction would
     * cost board space in every game; the dotted underline is the marker, and
     * the definition drops in under the row only when asked for. */
    <TermGroup>
    <div className="statusRow">
      <div className="chip">
        {/* Three words, and all three are the grader's rather than yours: the
            tier it decided on, the hardest rung it needed, and, when they
            differ, the tier you asked for. */}
        <b><Term id={tierTerm(graded)}>{graded}</Term></b>
        <span className="tech">
          {hardest
            ? <Term id={techniqueTerm(hardest)}>{TECHNIQUES[hardest].label}</Term>
            : tech}
        </span>
        {/* Spelled out rather than hinted at: on a phone the hover that used to
            explain this did not exist, and the whole point of the label is that
            the grader disagreed with the request. */}
        {mismatched && (
          <span className="asked">
            <Term id="requested">you asked for {requested}</Term>
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
    </TermGroup>
  )
}
