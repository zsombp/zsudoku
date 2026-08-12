import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createListener, pickHeard, describeCommand, voiceMode, listeningNote, errorNote,
} from '../lib/voice.js'

/**
 * Press to talk, and nothing else.
 *
 * Three rules, in the order they matter:
 *
 *   1. The microphone opens on a press and on nothing else. There is no wake
 *      word, no auto-restart when the recogniser ends, and no listening while
 *      the page is in the background.
 *   2. What was heard goes on screen before anything happens to the board.
 *   3. The strip says where the audio is going while it is going there.
 *
 * ---- tap, rather than hold ----
 *
 * Hold-to-talk is the obvious gesture and it was not taken. It is unusable from
 * a keyboard and awkward with a screen reader, and it buys nothing here:
 * `continuous` is false, so the recogniser ends the session by itself after one
 * utterance, and the whole grammar is one short sentence. So this is a plain
 * button that starts listening and a plain button that stops, which is one press
 * either way and works with every input the app already supports.
 *
 * ---- why the icon lives in this file ----
 *
 * `Icons.jsx` holds the ten the app uses. This is the eleventh and the only
 * consumer is here, so it sits here rather than growing that module's surface
 * for one caller. Same lucide geometry, so it cannot look out of place.
 */
const Mic = ({ size = 19 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
)

/** The whole grammar, in one line, where it is needed rather than in settings. */
const GRAMMAR = 'Say "five in row three column two", or "clear", or "undo". With a cell already picked, just the number.'

/**
 * Everything the strip says, in order, as data.
 *
 * Pulled out of the render so it can be tested, because the ordering is the
 * promise: the words that were heard are written down above the move they were
 * read as, every time, and a result that meant nothing still gets said out loud
 * rather than vanishing.
 */
export function stripFor({ mode, listening, heard, error, notes }) {
  const lines = []
  // Where the audio is going, said at the moment it is going there rather than
  // only in a setting read once, months ago.
  if (listening) {
    lines.push({ kind: 'where', text: listeningNote(mode) })
    if (!heard) lines.push({ kind: 'help', text: GRAMMAR })
  }
  // `took` is the lower guess that actually parsed, shown rather than folded in:
  // acting on words the player was never shown is what this strip exists to
  // prevent.
  if (heard?.text) lines.push({ kind: 'heard', text: heard.text, took: heard.taken })
  const said = describeCommand(heard?.command, { notes })
  if (said) lines.push({ kind: 'did', text: said })
  if (heard && !heard.interim && !heard.command) {
    lines.push({ kind: 'none', text: 'not a command, so nothing was done' })
  }
  if (error) lines.push({ kind: 'error', text: error })
  // A misheard digit is a recorded mistake and it poisons the candidate sets the
  // hint engine reads, so the way out sits next to the thing that caused it
  // rather than back in the toolbar. Not offered after an undo, where the way
  // back is redo and calling it "undo that" would be a lie.
  if (heard?.command && heard.command.type !== 'undo') {
    lines.push({ kind: 'undo', text: 'undo that' })
  }
  return lines
}

export default function VoiceButton({ enabled, allowOffDevice, disabled, notes, onCommand }) {
  const mode = useMemo(() => voiceMode(), [])
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState(null)
  const [error, setError] = useState(null)
  const live = useRef(null)

  /**
   * Two ways to stop, and they are not the same.
   *
   * `finish` is the button: it closes the utterance and lets the result through,
   * because somebody who has just said a move and pressed Stop meant that move
   * to land. `cancel` throws the utterance away, and is what unmounting, hiding
   * the app and leaving the game use, where a result arriving afterwards would
   * place a digit into a game that is no longer in front of anyone.
   */
  const finish = useCallback(() => {
    live.current?.stop()
    setListening(false)
  }, [])

  const cancel = useCallback(() => {
    live.current?.abort()
    live.current = null
    setListening(false)
  }, [])

  // The microphone must not be open when the app is not in front of you. This is
  // the same event the timer pauses on, for a stricter reason: a paused clock is
  // an inconvenience and a hot microphone in a backgrounded tab is not.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      cancel()
    }
  }, [cancel])

  // Pausing, winning or leaving the game takes the microphone with it, and the
  // transcript too: a new game should not open showing the last thing said to
  // the previous one, next to an "undo that" pointing at a move in a game that
  // is over.
  useEffect(() => {
    if (!disabled && enabled) return
    cancel()
    setHeard(null)
    setError(null)
  }, [disabled, enabled, cancel])

  /**
   * Act on what was heard, after it has been shown.
   *
   * A passive effect, not a layout effect, and that is the whole point of doing
   * it here rather than inside the recogniser callback: React paints the strip
   * with the transcript in it, and only then does this run and change the board.
   * A layout effect would run before the paint and the digit would appear in the
   * same frame as the words that explain it.
   *
   * The ref guard is not belt and braces. StrictMode runs effects twice in
   * development, and `placeDigit` treats the same digit twice as a clear, so an
   * unguarded dispatch would type the number and then rub it out again.
   */
  const applied = useRef(null)
  useEffect(() => {
    if (!heard || !heard.command || applied.current === heard) return
    applied.current = heard
    onCommand(heard.command)
  }, [heard, onCommand])

  const start = useCallback(() => {
    setError(null)
    setHeard(null)
    const l = createListener({
      allowOffDevice,
      onInterim: text => setHeard({ text, taken: null, command: null, interim: true }),
      onResult: alts => {
        live.current = null
        setListening(false)
        const got = pickHeard(alts)
        if (got) setHeard(got)
      },
      onError: (code, m) => {
        live.current = null
        setListening(false)
        setHeard(null)
        // "Nothing was heard" is a non-event, not a fault worth a red line.
        if (code !== 'no-speech' && code !== 'aborted') setError(errorNote(code, m))
      },
      onEnd: () => {
        // Deliberately does not restart. A recogniser that starts itself again
        // is an always-on microphone wearing a button.
        live.current = null
        setListening(false)
      },
    })
    if (!l) return
    live.current = l
    setListening(true)
    try {
      l.start()
    } catch {
      // Already running, or refused outright. Either way, not listening.
      live.current = null
      setListening(false)
    }
  }, [allowOffDevice])

  // Nothing at all where the browser cannot do it, or where the switch is off,
  // or where the audio would leave the device and that has not been allowed.
  if (!enabled || mode === 'unsupported') return null
  if (mode === 'remote' && !allowOffDevice) return null

  const lines = stripFor({ mode, listening, heard, error, notes })

  return (
    <div className="voiceRow">
      <button
        className={'tool voiceBtn' + (listening ? ' on' : '')}
        disabled={disabled}
        onClick={listening ? finish : start}
        aria-pressed={listening}
        aria-label={listening ? 'Stop listening' : 'Speak a move'}
      >
        <Mic size={19} />
        <span>{listening ? 'Stop' : 'Speak'}</span>
      </button>

      {/* With nothing to say the strip is not drawn at all. An empty bordered
          box beside the button reads as something that failed to load. */}
      {lines.length > 0 && (
        <div className={'voiceStrip' + (listening ? ' live' : '')} aria-live="polite">
          {lines.map(line =>
            line.kind === 'undo' ? (
              <button key="undo" className="linkBtn voiceUndo" onClick={() => onCommand({ type: 'undo' })}>
                {line.text}
              </button>
            ) : line.kind === 'heard' ? (
              <span key="heard" className="voiceHeard">
                <em>heard</em> {line.text}
                {line.took && <span className="voiceTook"> taken as "{line.took}"</span>}
              </span>
            ) : (
              <span key={line.kind} className={LINE_CLASS[line.kind]}>{line.text}</span>
            )
          )}
        </div>
      )}
    </div>
  )
}

const LINE_CLASS = {
  where: 'voiceWhere',
  help: 'voiceHelp',
  did: 'voiceDid',
  none: 'voiceNone',
  error: 'voiceErr',
}
