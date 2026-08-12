import { describe, it, expect, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import VoiceButton, { stripFor } from './VoiceButton.jsx'

const strip = over => stripFor({ mode: 'local', listening: false, heard: null, error: null, ...over })
const kinds = lines => lines.map(l => l.kind)

const placed = {
  text: 'five in row three column two',
  taken: null,
  command: { type: 'place', digit: 5, row: 3, col: 2 },
}

describe('what the strip says before the board moves', () => {
  it('writes down the words above the move they were read as', () => {
    // The promise of the whole feature. If these ever came out the other way
    // round, or the transcript were dropped once a command was found, the board
    // would change on the strength of something the player never saw.
    const lines = strip({ heard: placed })
    expect(kinds(lines).indexOf('heard')).toBeGreaterThanOrEqual(0)
    expect(kinds(lines).indexOf('heard')).toBeLessThan(kinds(lines).indexOf('did'))
  })

  it('shows the transcript even when none of it was a command', () => {
    // Silence would leave somebody pressing the button again and again with no
    // idea whether they were being heard or being misunderstood.
    const lines = strip({ heard: { text: 'what time is it', taken: null, command: null } })
    expect(kinds(lines)).toContain('heard')
    expect(kinds(lines)).toContain('none')
  })

  it('shows the guess it acted on when that was not the guess it heard first', () => {
    const lines = strip({ heard: { ...placed, taken: 'five in row three column two' } })
    expect(lines.find(l => l.kind === 'heard').took).toBe('five in row three column two')
  })

  it('says nothing was done about a half finished sentence', () => {
    // Interim text is on screen while somebody is still talking. It is not a
    // failed command and must not be reported as one.
    const lines = strip({
      listening: true,
      heard: { text: 'five in row', taken: null, command: null, interim: true },
    })
    expect(kinds(lines)).not.toContain('none')
    expect(kinds(lines)).toContain('heard')
  })

  it('offers a way back from anything it placed', () => {
    // A misheard digit is a recorded mistake and it poisons the candidate sets
    // the hint engine reads.
    expect(kinds(strip({ heard: placed }))).toContain('undo')
    expect(kinds(strip({ heard: { text: 'clear', taken: null, command: { type: 'clear' } } })))
      .toContain('undo')
  })

  it('does not offer to undo an undo', () => {
    // The way back from an undo is redo, and a button labelled "undo that"
    // would do the opposite of what it says.
    const lines = strip({ heard: { text: 'undo', taken: null, command: { type: 'undo' } } })
    expect(kinds(lines)).not.toContain('undo')
  })
})

describe('what the strip says while the microphone is open', () => {
  it('says where the audio is going, and says something different in each mode', () => {
    // The setting is read once. This is on screen every single time the
    // microphone is open, which is the only moment the answer matters.
    const local = strip({ listening: true, mode: 'local' })
    const remote = strip({ listening: true, mode: 'remote' })
    expect(kinds(local)).toContain('where')
    expect(kinds(remote)).toContain('where')
    expect(local.find(l => l.kind === 'where').text).not.toBe(
      remote.find(l => l.kind === 'where').text
    )
  })

  it('teaches the grammar while it waits, and gets out of the way once you speak', () => {
    // Four commands nobody will remember, shown at the one moment they are
    // needed. A title attribute would be invisible on the phone.
    expect(kinds(strip({ listening: true }))).toContain('help')
    expect(kinds(strip({ listening: true, heard: placed }))).not.toContain('help')
  })

  it('says nothing at all when the microphone is shut and nothing was heard', () => {
    expect(strip()).toEqual([])
  })
})

/**
 * Whether the control is on screen at all, which is the same question as
 * whether a microphone can be opened.
 *
 * Rendered rather than reasoned about, because the component is what App mounts
 * and a guard that lives only in a helper is a guard somebody can forget to
 * call. Effects do not run under `renderToStaticMarkup`, which is exactly right
 * here: nothing may listen on a render.
 */
describe('when the button is offered at all', () => {
  const fakeSR = local => {
    class SR {
      start() {}
      stop() {}
      abort() {}
    }
    if (local) SR.prototype.processLocally = false
    return SR
  }
  const render = (props, SR) => {
    if (SR) globalThis.SpeechRecognition = SR
    else delete globalThis.SpeechRecognition
    return renderToStaticMarkup(
      createElement(VoiceButton, { enabled: true, onCommand: () => {}, ...props })
    )
  }

  afterEach(() => { delete globalThis.SpeechRecognition })

  it('renders nothing where the browser has no speech recognition', () => {
    // Most browsers. Degrading silently means no button, no notice, no apology.
    expect(render({}, null)).toBe('')
  })

  it('renders nothing while the setting is off', () => {
    expect(render({ enabled: false }, fakeSR(true))).toBe('')
  })

  it('renders nothing where listening would send the audio away unasked', () => {
    // Safari, and so the iPhone. The second switch is what turns this on, and
    // until it is thrown there is no control that could open a microphone.
    expect(render({ allowOffDevice: false }, fakeSR(false))).toBe('')
  })

  it('renders the button once that has been explicitly allowed', () => {
    expect(render({ allowOffDevice: true }, fakeSR(false))).toContain('Speak')
  })

  it('draws no strip at all until there is something to say', () => {
    // It was drawn always, which put an empty bordered pill next to the button
    // on a board nobody had spoken to yet. That reads as something that failed
    // to load rather than as a control waiting to be used.
    expect(render({}, fakeSR(true))).not.toContain('voiceStrip')
  })

  it('renders the button where the audio can be kept on the device', () => {
    expect(render({}, fakeSR(true))).toContain('Speak')
  })

  it('disables the button when the game is not in play', () => {
    // Paused, won, or on another screen. A live microphone with nothing to say
    // to is the state this feature has to be most careful about.
    expect(render({ disabled: true }, fakeSR(true))).toContain('disabled')
  })
})

describe('describing a move in notes mode', () => {
  it('says pencilled, because that is what happens', () => {
    // Voice goes through the same reducer action as the number pad, so in notes
    // mode it pencils a mark. A strip reading "5 into row 3, column 2" over a
    // small pencilled 5 would be describing a move that did not happen.
    const lines = stripFor({ mode: 'local', listening: false, heard: placed, notes: true })
    expect(lines.find(l => l.kind === 'did').text).toContain('pencilled')
  })

  it('does not say pencilled about an erase, which is the same in both modes', () => {
    const heard = { text: 'clear', taken: null, command: { type: 'clear' } }
    const lines = stripFor({ mode: 'local', listening: false, heard, notes: true })
    expect(lines.find(l => l.kind === 'did').text).not.toContain('pencilled')
  })
})
