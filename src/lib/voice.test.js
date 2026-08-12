import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseCommand, pickHeard, describeCommand, actionsFor,
  voiceMode, createListener, privacyNote, listeningNote, errorNote,
  MAX_LISTEN_MS, ALTERNATIVES,
} from './voice.js'

describe('hearing a command', () => {
  it('takes the digit, the row and the column in any order they are said', () => {
    // A recogniser returns whatever was said, and people do not say the words
    // in one fixed order. All four of these are the same move.
    const want = { type: 'place', digit: 5, row: 3, col: 2 }
    expect(parseCommand('five in row three column two')).toEqual(want)
    expect(parseCommand('row three column two five')).toEqual(want)
    expect(parseCommand('put 5 in row 3 column 2')).toEqual(want)
    expect(parseCommand('Five in row three, column two.')).toEqual(want)
  })

  it('reads numbers as words or as numerals, because both come back', () => {
    // Engines differ, and the same engine differs with the phrasing: "row three"
    // often returns "row 3". Refusing one form would make it work half the time.
    expect(parseCommand('seven')).toEqual({ type: 'digit', digit: 7 })
    expect(parseCommand('7')).toEqual({ type: 'digit', digit: 7 })
  })

  it('reads the ordinal in front of the noun as well as the number behind it', () => {
    // "the third row" is how English puts it, and it was one of three phrasings
    // out of forty that the first version of this grammar threw away.
    expect(parseCommand('five in the third row second column')).toEqual({
      type: 'place', digit: 5, row: 3, col: 2,
    })
  })

  it('does not treat an ordinal on its own as a number', () => {
    // Otherwise "the third attempt" is a digit. An ordinal only counts when the
    // next word is the thing it counts.
    expect(parseCommand('third')).toBeNull()
    expect(parseCommand('the third attempt')).toBeNull()
  })

  it('takes a homophone for a digit only where nothing else can go there', () => {
    // Recognisers hear "row two" as "row to" constantly. In a coordinate slot,
    // or as the value of a command that already has both coordinates, only a
    // number can be meant, so the substitution is safe to undo.
    expect(parseCommand('to in row three column to')).toEqual({
      type: 'place', digit: 2, row: 3, col: 2,
    })
    expect(parseCommand('for in row won column nine')).toEqual({
      type: 'place', digit: 4, row: 1, col: 9,
    })
  })

  it('refuses a bare homophone, because it is far more likely to be speech', () => {
    // This is the whole reason homophones are positional. "to" and "for" alone
    // would otherwise drop a digit into the grid every time one was overheard.
    expect(parseCommand('to')).toBeNull()
    expect(parseCommand('for')).toBeNull()
    expect(parseCommand('two')).toEqual({ type: 'digit', digit: 2 })
  })

  it('understands both verbs, and the ways they get said', () => {
    expect(parseCommand('clear')).toEqual({ type: 'clear' })
    expect(parseCommand('clear the cell')).toEqual({ type: 'clear' })
    expect(parseCommand('erase')).toEqual({ type: 'clear' })
    expect(parseCommand('undo')).toEqual({ type: 'undo' })
    expect(parseCommand('undo that')).toEqual({ type: 'undo' })
    expect(parseCommand('go back')).toEqual({ type: 'undo' })
  })

  it('refuses a verb that carries a number it cannot honour', () => {
    // "undo row three" means something, and it is not something this grammar can
    // do. Half-honouring it as a plain undo would undo the wrong move.
    expect(parseCommand('undo row three')).toBeNull()
    expect(parseCommand('clear row three column two')).toBeNull()
  })

  it('refuses coordinates with no digit, and a digit with half a coordinate', () => {
    // Both are things somebody might say. Neither is in the grammar, and
    // guessing at the missing half would put a digit somewhere nobody asked for.
    expect(parseCommand('row three column two')).toBeNull()
    expect(parseCommand('five in row three')).toBeNull()
    expect(parseCommand('five in row three column')).toBeNull()
  })

  it('refuses a coordinate outside the grid', () => {
    // Ten is not a row. `actionsFor` would compute an index off the end of the
    // board and the reducer would write into nothing.
    expect(parseCommand('five in row ten column two')).toBeNull()
    expect(parseCommand('five in row 0 column 2')).toBeNull()
    expect(parseCommand('12')).toBeNull()
  })

  it('refuses two of the same coordinate', () => {
    // "row three row four" is a correction mid-sentence, and there is no way to
    // know which half was meant.
    expect(parseCommand('five in row three row four column two')).toBeNull()
  })

  it('says nothing about an empty or silent result', () => {
    expect(parseCommand('')).toBeNull()
    expect(parseCommand(null)).toBeNull()
    expect(parseCommand('   ')).toBeNull()
  })
})

/**
 * The measurement the grammar's strictness rests on, kept as a test rather than
 * as a comment, because a comment cannot fail.
 *
 * The corpus is this project's own prose: 2300 sentences about a grid, full of
 * "row", "column" and every number word, which makes it far harder than ordinary
 * speech would be. Nothing in it may parse as a command.
 */
describe('ordinary English is not a command', () => {
  const sentences = ['docs/DECISIONS.md', 'docs/VISION.md', 'CHANGELOG.md']
    .map(f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'))
    .join('\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n{2,}|\n[-|#*]/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 3 && s.length < 300)

  it('parses none of two thousand sentences of prose as a command', () => {
    expect(sentences.length).toBeGreaterThan(1500)
    const hits = sentences.filter(s => parseCommand(s))
    expect(hits).toEqual([])
  })

  it('would parse hundreds of them if unknown words were merely ignored', () => {
    // The alternative design, and the reason it was not taken. Dropping words
    // the grammar does not know turns any heading with a number in it into a
    // digit: measured at 387 of 2318 sentences, 16.7%.
    const KNOWN =
      /^(row|rows|column|columns|col|cols|clear|erase|delete|undo|back|one|two|three|four|five|six|seven|eight|nine|[1-9]|won|to|too|for|fore|ate|tree|free|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|in|into|at|on|put|place|set|write|goes|go|and|is|a|the|please|number|cell|square|it|that|this)$/
    const lenient = s =>
      parseCommand(
        s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(t => KNOWN.test(t)).join(' ')
      )
    const hits = sentences.filter(lenient)
    expect(hits.length).toBeGreaterThan(100)
  })
})

describe('choosing between the recogniser guesses', () => {
  it('takes the first guess that is a command, not the first guess', () => {
    // "row" and "Rome" sound identical, and the recogniser has no idea which of
    // them means anything here. This is most of the accuracy the feature has.
    const heard = pickHeard(['five in Rome three column two', 'five in row three column two'])
    expect(heard.command).toEqual({ type: 'place', digit: 5, row: 3, col: 2 })
    expect(heard.taken).toBe('five in row three column two')
  })

  it('still reports the top guess as what was heard', () => {
    // The screen has to show what was heard, not a tidied version of it, or the
    // player cannot tell a misheard command from a misparsed one.
    const heard = pickHeard(['five in Rome three column two', 'five in row three column two'])
    expect(heard.text).toBe('five in Rome three column two')
  })

  it('leaves taken empty when the top guess was the one used', () => {
    const heard = pickHeard(['undo', 'undo it'])
    expect(heard.taken).toBeNull()
    expect(heard.command).toEqual({ type: 'undo' })
  })

  it('reports what was heard even when none of it is a command', () => {
    // Silence is not an answer here: showing the words and doing nothing is how
    // a player learns what the grammar wants.
    const heard = pickHeard(['what time is it'])
    expect(heard.text).toBe('what time is it')
    expect(heard.command).toBeNull()
  })

  it('is null only when nothing at all was heard', () => {
    expect(pickHeard([])).toBeNull()
    expect(pickHeard(['', '  '])).toBeNull()
  })
})

describe('turning a command into moves', () => {
  it('selects the cell before filling it, which is what a tap and a pad press are', () => {
    // Voice inherits notes mode, the move log, the mistake count and undo by
    // going through the same two actions as every other input.
    expect(actionsFor({ type: 'place', digit: 5, row: 3, col: 2 })).toEqual([
      { type: 'select', index: 19 },
      { type: 'digit', value: 5 },
    ])
  })

  it('counts rows and columns from one, the way they are spoken', () => {
    // r1c1 is index 0 and r9c9 is index 80. An off-by-one here would place every
    // digit one cell along and nothing would throw.
    expect(actionsFor({ type: 'place', digit: 1, row: 1, col: 1 })[0].index).toBe(0)
    expect(actionsFor({ type: 'place', digit: 9, row: 9, col: 9 })[0].index).toBe(80)
    expect(actionsFor({ type: 'place', digit: 4, row: 1, col: 9 })[0].index).toBe(8)
    expect(actionsFor({ type: 'place', digit: 4, row: 9, col: 1 })[0].index).toBe(72)
  })

  it('leaves the selection alone for a bare digit', () => {
    expect(actionsFor({ type: 'digit', digit: 7 })).toEqual([{ type: 'digit', value: 7 }])
  })

  it('maps the verbs onto the reducer actions the toolbar uses', () => {
    expect(actionsFor({ type: 'clear' })).toEqual([{ type: 'erase' }])
    expect(actionsFor({ type: 'undo' })).toEqual([{ type: 'undo' }])
    expect(actionsFor(null)).toEqual([])
  })

  it('describes every command it can produce', () => {
    // The strip shows this before anything happens. A command with no
    // description would act invisibly, which is the one thing voice must not do.
    for (const cmd of [
      { type: 'place', digit: 5, row: 3, col: 2 },
      { type: 'digit', digit: 7 },
      { type: 'clear' },
      { type: 'undo' },
    ]) {
      expect(describeCommand(cmd)).toBeTruthy()
    }
    expect(describeCommand({ type: 'place', digit: 5, row: 3, col: 2 })).toContain('row 3')
  })
})

// ---- where the audio goes ----
//
// The important tests in this file. A bug in the grammar puts a wrong digit on
// a board; a bug here sends somebody's voice to a company without being asked.

const fakeSR = ({ local }) => {
  const started = []
  class SR {
    constructor() { this.args = {} }
    start() { started.push(this) }
    stop() { this.stopped = true }
    abort() { this.aborted = true }
  }
  if (local) SR.prototype.processLocally = false
  SR.started = started
  return SR
}

describe('which mode this browser is in', () => {
  it('is unsupported where there is no speech recognition at all', () => {
    // Which is most browsers. Nothing renders and nothing is said about it.
    expect(voiceMode(null)).toBe('unsupported')
    expect(voiceMode(undefined)).toBe('unsupported')
  })

  it('is local only where the browser can be told to keep the audio on device', () => {
    expect(voiceMode(fakeSR({ local: true }))).toBe('local')
  })

  it('is remote where it cannot, which is Safari and so the iPhone', () => {
    // The device this app is mostly played on. If this ever silently reported
    // local, the settings screen would promise something untrue.
    expect(voiceMode(fakeSR({ local: false }))).toBe('remote')
  })
})

describe('never listening in a way that sends audio away unasked', () => {
  it('refuses to build a listener at all where audio would leave the device', () => {
    // The single most important line in the feature. `allowOffDevice` defaults
    // to false, so reaching the network takes an explicit argument from a caller
    // that has an explicit switch behind it.
    const SR = fakeSR({ local: false })
    expect(createListener({ SR })).toBeNull()
    expect(createListener({ SR, allowOffDevice: false })).toBeNull()
    expect(createListener({ SR, allowOffDevice: true })).not.toBeNull()
  })

  it('demands local processing whenever the browser understands the demand', () => {
    // Not "prefers": the spec says a browser that cannot manage it locally must
    // fail rather than fall back to a server, which is exactly the behaviour the
    // settings copy promises.
    const SR = fakeSR({ local: true })
    const l = createListener({ SR })
    l.start()
    expect(SR.started[0].processLocally).toBe(true)
    expect(SR.started[0].continuous).toBe(false)
    expect(SR.started[0].maxAlternatives).toBe(ALTERNATIVES)
  })

  it('does not set the local flag where allowing remote was the point', () => {
    // Setting it on a browser that has no such property is harmless, but a
    // truthy flag nobody reads is how a false promise gets made later.
    const SR = fakeSR({ local: false })
    createListener({ SR, allowOffDevice: true }).start()
    expect(SR.started[0].processLocally).toBeUndefined()
  })

  it('asks for English rather than whatever the device is set to', () => {
    // The grammar is English words. A phone set to Hungarian would return
    // Hungarian text for the same speech and nothing would ever parse.
    const SR = fakeSR({ local: true })
    createListener({ SR }).start()
    expect(SR.started[0].lang).toBe('en-GB')
  })

  it('opens the microphone only when start is called', () => {
    // Building the listener must not begin listening. Nothing may open a
    // microphone except a press.
    const SR = fakeSR({ local: true })
    createListener({ SR })
    expect(SR.started).toHaveLength(0)
  })

  it('cuts the microphone off after a fixed time even if nothing else does', () => {
    // The backstop for a browser that does not end the session itself. The
    // longest command takes 3.6 seconds to say at 100 words a minute.
    expect(MAX_LISTEN_MS).toBeGreaterThan(3600 * 2)
    expect(MAX_LISTEN_MS).toBeLessThanOrEqual(10000)
  })

  it('stops reporting results once it has been aborted', () => {
    // Abort is what unmount and a hidden page call. A result arriving after it
    // would place a digit into a game that is no longer on screen.
    const SR = fakeSR({ local: true })
    let got = null
    const l = createListener({ SR, onResult: alts => { got = alts } })
    l.start()
    const rec = SR.started[0]
    l.abort()
    expect(rec.aborted).toBe(true)
    expect(rec.onresult).toBeNull()
    expect(got).toBeNull()
  })

  it('passes only final results on, and shows interim ones without acting', () => {
    // Interim text changes under you as the recogniser revises itself. Acting on
    // a revision is acting on something the player never saw settled.
    const SR = fakeSR({ local: true })
    const seen = { interim: [], final: null }
    const l = createListener({
      SR,
      onInterim: t => seen.interim.push(t),
      onResult: alts => { seen.final = alts },
    })
    l.start()
    const rec = SR.started[0]
    const result = (isFinal, ...alts) => {
      const r = alts.map(t => ({ transcript: t }))
      r.isFinal = isFinal
      r.length = alts.length
      return { results: [r] }
    }
    rec.onresult(result(false, 'five in row'))
    expect(seen.final).toBeNull()
    expect(seen.interim).toEqual(['five in row'])
    rec.onresult(result(true, 'five in row three column two', 'five in Rome three column two'))
    expect(seen.final).toEqual(['five in row three column two', 'five in Rome three column two'])
  })
})

describe('what the player is told about where their voice goes', () => {
  it('says plainly that speech is sent away, in the mode where it is', () => {
    const note = privacyNote('remote')
    expect(note).toMatch(/sent to/i)
    expect(note).toMatch(/Apple|Google/)
    // "may leave your device" is the softening this copy is not allowed to do.
    expect(note).not.toMatch(/\bmay\b|\bmight\b|possibly/i)
  })

  it('claims the audio stays put only in the mode where that is enforced', () => {
    expect(privacyNote('local')).toMatch(/on the device/i)
    expect(privacyNote('unsupported')).not.toMatch(/sent/i)
  })

  it('says which of the two is happening while the microphone is actually open', () => {
    // A setting read once is not a thing you remember. The strip says it at the
    // moment it is true, and the two lines have to differ.
    expect(listeningNote('local')).not.toBe(listeningNote('remote'))
    expect(listeningNote('remote')).toMatch(/audio/i)
  })

  it('explains a refusal to listen locally as the refusal it is', () => {
    // A browser with no on-device model declining to send the audio away is the
    // system working. Phrasing it as a failure would invite turning the second
    // switch on to make the error go away.
    expect(errorNote('language-not-supported', 'local')).toMatch(/refused to send/i)
    expect(errorNote('not-allowed', 'local')).toMatch(/microphone/i)
    expect(errorNote('anything-else', 'local')).toBeTruthy()
  })
})

describe('the cutoff that shuts the microphone whatever else happens', () => {
  it('tears down the same way a deliberate abort does', async () => {
    // Found in a browser: the cutoff called the recogniser's own abort rather
    // than the controller's, which left `onresult` attached after the microphone
    // was supposed to be shut. A result arriving then would have placed a digit
    // several seconds after anyone stopped talking.
    vi.useFakeTimers()
    try {
      const SR = fakeSR({ local: true })
      let got = null
      const l = createListener({ SR, onResult: alts => { got = alts } })
      l.start()
      const rec = SR.started[0]
      vi.advanceTimersByTime(MAX_LISTEN_MS + 1)
      expect(rec.aborted).toBe(true)
      expect(rec.onresult).toBeNull()
      // And it still tells the caller, so the button stops saying it is
      // listening rather than lying about it until the next press.
      expect(rec.onend).toBeTypeOf('function')
      expect(got).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
