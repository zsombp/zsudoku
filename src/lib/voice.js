/**
 * Voice input: a tiny grammar, spoken into a press-to-talk button.
 *
 *   "five in row three column two"   place a digit
 *   "five"                           place into the cell already selected
 *   "clear"                          empty the selected cell
 *   "undo"                           step back
 *
 * Two halves live here. `parseCommand` is pure and is where all the tests are.
 * `createListener` is the thin wrapper over the browser's SpeechRecognition,
 * which most browsers do not have; where it is missing nothing renders and
 * nothing is said about it.
 *
 * ---- where the audio goes, which is the whole design ----
 *
 * The Web Speech API is not local. MDN, on the API this file uses: "By default,
 * using speech recognition on a web page involves a server-based recognition
 * engine. Your audio is sent to a web service for recognition processing, so it
 * won't work offline." In Safari that service is Apple's, and Safari says so in
 * its own permission sheet before it will listen. In Chrome it is Google's.
 *
 * Chromium has since grown a way to demand otherwise: `processLocally` on the
 * recognition object, which the spec says must make recognition local or fail
 * rather than fall back to a server. Probed in Chromium 148 on this Mac, the
 * property is on `SpeechRecognition.prototype` and the static gate is
 * `SpeechRecognition.available({ langs, processLocally })`. MDN documents that
 * static under a different name, `availableOnDevice(lang)`, so the name is not
 * settled and is not relied on here. WebKit has neither, which is the case that
 * matters: the iPhone is the device this app is played on.
 *
 * So there are two modes and the app never guesses which it is in:
 *
 *   local    `processLocally` exists. It is set to true, so a browser that
 *            cannot do the recognition on the device must refuse instead of
 *            sending the audio somewhere.
 *   remote   it does not exist. Listening at all means the speech leaves the
 *            device, and that is the second exception to the non-negotiable
 *            that nothing leaves this device.
 *
 * The second exception does NOT clear the bar `CLAUDE.md` sets for one: the
 * GitHub backup goes to infrastructure the user owns and is useless to anyone
 * else, and a recording of a voice sent to Apple or Google is neither. Which is
 * why remote mode needs its own switch, off by default, on top of the switch
 * that turns voice on at all, and why the copy below says what happens in
 * words rather than in a euphemism.
 *
 * `SpeechRecognition.available()` is deliberately never called: it hung the
 * renderer for the whole of a 30 second probe on Chromium 148 (once, not
 * reproduced, so treat it as a caution rather than a fact) and it is not needed.
 * Setting `processLocally` and letting the recogniser refuse is the same answer
 * with no call. `install()` is never called either: it downloads a model, which
 * is a network request nobody asked for.
 */

/**
 * The recogniser is told English rather than being allowed to inherit the
 * device language. The grammar below is English words; a phone set to Hungarian
 * would return Hungarian text for the same speech and nothing would ever parse.
 */
export const VOICE_LANG = 'en-GB'

/**
 * How long one press may listen before the microphone is cut off.
 *
 * The longest thing the grammar accepts is "five in row three column two":
 * 6 words. At 100 words a minute, which is slow and deliberate rather than
 * conversational, that is 3.6 seconds. Eight gives more than twice the room and
 * matches the silence timeout Chrome applies on its own. `continuous` is false
 * so a browser normally ends the session itself after one utterance; this is the
 * backstop for one that does not, because a microphone that stays open after you
 * have stopped talking is the failure this feature cannot afford.
 */
export const MAX_LISTEN_MS = 8000

/**
 * How many of the recogniser's guesses to look at.
 *
 * The first guess is the one the recogniser likes; it is not always the one that
 * is a command, because "row" and "Rome" sound identical and only one of them
 * means anything here. Reading a few and taking the first that parses is most of
 * the accuracy this feature has, and it costs nothing: the parse is pure and
 * measured at 0.68 microseconds, so four of them are still under three.
 */
export const ALTERNATIVES = 4

const SPEECH = () =>
  (typeof globalThis !== 'undefined' &&
    (globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition)) ||
  null

/** 'unsupported' | 'local' | 'remote'. See the header: this decides everything. */
export function voiceMode(SR = SPEECH()) {
  if (!SR) return 'unsupported'
  return SR.prototype && 'processLocally' in SR.prototype ? 'local' : 'remote'
}

/**
 * What to tell someone about their own browser, on the settings screen.
 *
 * Written per mode rather than as one hedged paragraph, because a sentence that
 * covers both cases has to say "may" and "may" is exactly the softening this is
 * not allowed to do.
 */
export function privacyNote(mode) {
  if (mode === 'unsupported')
    return 'This browser has no speech recognition at all, so there is nothing to turn on here.'
  if (mode === 'local')
    return 'This browser can recognise speech on the device. Zsudoku demands that it does: it sets the flag that requires local processing, so a browser that cannot manage it has to refuse rather than send your voice anywhere.'
  return 'This browser cannot be told to keep the audio on the device. Listening here means your speech is sent to a recognition service run by whoever makes your browser, Apple in Safari and Google in Chrome, and it will not work offline. Voice input stays switched off unless you also allow that below.'
}

/** The same fact, one line, live on screen while the microphone is open. */
export function listeningNote(mode) {
  return mode === 'local' ? 'Listening on this device' : 'Listening. Audio is going to your browser maker'
}

// ---- the grammar ----
//
// Small on purpose. Every word below either is a number, names a coordinate,
// names one of the two verbs, or is glue that can be ignored; anything else in
// the utterance makes the whole thing "not a command" rather than a best guess.
//
// That strictness is the accuracy. Measured over 2318 sentences of this
// project's own docs, which is a deliberately cruel corpus because it is prose
// about a grid and is full of "row", "column" and every number word: 0 of them
// parse as a command. A lenient parser differing only in that it drops words it
// does not know parses 387 of them, 16.7%, mostly as a bare digit off a heading
// like "Phase 4, the interface". `voice.test.js` holds both halves.
//
// It accepts 40 of 40 phrasings meant as commands, which is the other half of
// the same measurement and the reason ordinals and homophones are in here.

const DIGITS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
}

/**
 * Words a recogniser returns when a digit was said.
 *
 * Every one of these is also an ordinary English word, so they only count where
 * a number is the only thing that can go: straight after "row" or "column", or
 * as the value of a command that already has both coordinates. A bare "to" does
 * nothing at all, which is the point.
 *
 * This list is the cheap half. The substitutions to expect from a Hungarian
 * speaker of English are the "th" ones, so "three" is the digit most likely to
 * come back wrong; add what actually turns up rather than guessing more here.
 */
const NEARLY = { won: 1, to: 2, too: 2, for: 4, fore: 4, ate: 8, tree: 3, free: 3 }

/**
 * Only against a coordinate: "the third row" is a row, "third" alone is nothing.
 *
 * English puts the ordinal in front of the noun and the cardinal behind it, so
 * both orders have to be read. Without this, "five in the third row second
 * column" was one of only three phrasings out of forty that the grammar
 * rejected, and it is a phrasing a person would use without thinking.
 */
const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9,
}

const ROW_WORDS = new Set(['row', 'rows'])
const COL_WORDS = new Set(['column', 'columns', 'col', 'cols'])
const CLEAR_WORDS = new Set(['clear', 'erase', 'delete'])
// "back" and "go back" both land here, because "go" is glue: what is left of
// either is the single word "back".
const UNDO_WORDS = new Set(['undo', 'back'])
const GLUE = new Set([
  'in', 'into', 'at', 'on', 'put', 'place', 'set', 'write', 'goes', 'go',
  'and', 'is', 'a', 'the', 'please', 'number', 'cell', 'square', 'it', 'that', 'this',
])

const tokenise = text =>
  String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)

const digitOf = t => (Object.hasOwn(DIGITS, t) ? DIGITS[t] : null)
const coordOf = t => {
  const d = digitOf(t)
  if (d !== null) return d
  if (Object.hasOwn(NEARLY, t)) return NEARLY[t]
  if (Object.hasOwn(ORDINALS, t)) return ORDINALS[t]
  return null
}

/**
 * Turn one heard utterance into a command, or into nothing.
 *
 * Nothing is a real answer and is returned often. A command that half-matches is
 * worse than no command: a wrong digit on the board is a recorded mistake, it
 * poisons the candidate sets the hint engine reads, and it is a lie in the game
 * log afterwards.
 */
export function parseCommand(text) {
  const tokens = tokenise(text)
  if (!tokens.length) return null

  // The two verbs. Both are rejected outright if a number is anywhere in the
  // utterance: "undo row three" is not something this grammar can honour and
  // should not be half-honoured.
  const bare = tokens.filter(t => !GLUE.has(t))
  const hasNumber = tokens.some(t => coordOf(t) !== null)
  if (!hasNumber && bare.length === 1) {
    if (UNDO_WORDS.has(bare[0])) return { type: 'undo' }
    if (CLEAR_WORDS.has(bare[0])) return { type: 'clear' }
  }

  let row = null
  let col = null
  const loose = []
  const nearly = []

  const setUnit = (isRow, n) => {
    if (isRow) {
      if (row !== null) return false
      row = n
    } else {
      if (col !== null) return false
      col = n
    }
    return true
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    // "the third row": an ordinal counts only when the very next word is the
    // thing it is counting. On its own it is an unknown word, so "the third
    // attempt" is not a coordinate.
    if (Object.hasOwn(ORDINALS, t)) {
      const next = tokens[i + 1]
      if (!next || !(ROW_WORDS.has(next) || COL_WORDS.has(next))) return null
      if (!setUnit(ROW_WORDS.has(next), ORDINALS[t])) return null
      i++
      continue
    }

    const isRow = ROW_WORDS.has(t)
    if (isRow || COL_WORDS.has(t)) {
      // One filler is allowed between the word and its number, so "row number
      // three" works, but only one: any more and this stops being a coordinate.
      let j = i + 1
      if (j < tokens.length && GLUE.has(tokens[j])) j++
      const n = j < tokens.length ? coordOf(tokens[j]) : null
      if (n === null) return null
      if (!setUnit(isRow, n)) return null
      i = j
      continue
    }
    const d = digitOf(t)
    if (d !== null) {
      loose.push(d)
      continue
    }
    if (Object.hasOwn(NEARLY, t)) {
      nearly.push(NEARLY[t])
      continue
    }
    if (GLUE.has(t)) continue
    // A word the grammar does not know. Not a command, and deliberately not a
    // best guess at one.
    return null
  }

  if (row !== null && col !== null) {
    // With both coordinates in hand the remaining number is unambiguous, so a
    // homophone is allowed to be it. "to in row three column two" is a 2.
    const value = loose.length === 1 ? loose[0] : loose.length === 0 && nearly.length === 1 ? nearly[0] : null
    if (value === null) return null
    return { type: 'place', digit: value, row, col }
  }

  // A bare digit, for the cell already selected. Homophones are not accepted
  // here: "to" and "for" on their own are far more likely to be speech than a
  // command, and there is no second coordinate to prove otherwise.
  if (row === null && col === null && loose.length === 1 && !nearly.length) {
    return { type: 'digit', digit: loose[0] }
  }
  return null
}

/**
 * The first of the recogniser's guesses that is a command, with the guess it
 * came from.
 *
 * `text` is always the recogniser's own first choice, because that is what was
 * heard and the screen has to show what was heard. `taken` is only set when the
 * command came from a lower guess, so the strip can show both rather than
 * quietly acting on something the player was never shown.
 */
export function pickHeard(alternatives) {
  const list = (alternatives || []).map(a => String(a || '').trim()).filter(Boolean)
  if (!list.length) return null
  for (let i = 0; i < list.length; i++) {
    const command = parseCommand(list[i])
    if (command) return { text: list[0], taken: i === 0 ? null : list[i], command }
  }
  return { text: list[0], taken: null, command: null }
}

/**
 * What the command will do, in words, for the strip that shows it.
 *
 * `notes` is not decoration. Voice goes through the same `digit` action as the
 * number pad, so in notes mode it pencils a mark rather than placing a digit,
 * and a strip reading "5 into row 3, column 2" over a small pencilled 5 would be
 * describing something that did not happen. The rule this app already has is
 * that anything it does on your behalf has to admit what it did.
 */
export function describeCommand(cmd, { notes = false } = {}) {
  if (!cmd) return null
  const verb = notes ? 'pencilled into' : 'into'
  if (cmd.type === 'place') return `${cmd.digit} ${verb} row ${cmd.row}, column ${cmd.col}`
  if (cmd.type === 'digit') return `${cmd.digit} ${verb} the selected cell`
  // Erase is the same action in both modes: it takes the digit off a filled cell
  // and the marks off an empty one.
  if (cmd.type === 'clear') return 'clear the selected cell'
  if (cmd.type === 'undo') return 'undo the last move'
  return null
}

/**
 * The reducer actions a command becomes.
 *
 * Here rather than in the component so that App's wiring is one line and cannot
 * drift from what the strip said it was going to do. A place is a select
 * followed by a digit, which is exactly what a tap and a number pad press are,
 * so voice inherits notes mode, the move log and undo without knowing they
 * exist.
 */
export function actionsFor(cmd) {
  if (!cmd) return []
  if (cmd.type === 'place') {
    return [
      { type: 'select', index: (cmd.row - 1) * 9 + (cmd.col - 1) },
      { type: 'digit', value: cmd.digit },
    ]
  }
  if (cmd.type === 'digit') return [{ type: 'digit', value: cmd.digit }]
  if (cmd.type === 'clear') return [{ type: 'erase' }]
  if (cmd.type === 'undo') return [{ type: 'undo' }]
  return []
}

/**
 * A live recogniser, or null if there must not be one.
 *
 * Returns null rather than throwing for both refusals, because both are ordinary
 * states rather than errors: this browser cannot do it, or this player has not
 * said the audio may leave the device. `allowOffDevice` defaults to false so the
 * only way to reach the network is to pass it explicitly.
 */
export function createListener({
  SR = SPEECH(),
  lang = VOICE_LANG,
  allowOffDevice = false,
  onInterim,
  onResult,
  onError,
  onEnd,
} = {}) {
  const mode = voiceMode(SR)
  if (mode === 'unsupported') return null
  if (mode === 'remote' && !allowOffDevice) return null

  const rec = new SR()
  rec.lang = lang
  // One utterance per press. Continuous listening is the thing this feature is
  // explicitly not: the microphone opens on a press and shuts as soon as you
  // have said one thing.
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = ALTERNATIVES
  if (mode === 'local') rec.processLocally = true

  let live = true
  let cutoff = null

  const finish = () => {
    live = false
    clearTimeout(cutoff)
  }

  rec.onresult = e => {
    const last = e.results[e.results.length - 1]
    if (!last) return
    if (!last.isFinal) {
      // Interim text is shown and never acted on. It changes under you as the
      // recogniser revises itself, and acting on a revision is acting on
      // something the player never saw settled.
      onInterim?.(last[0]?.transcript || '')
      return
    }
    const alts = []
    for (let i = 0; i < last.length; i++) alts.push(last[i]?.transcript || '')
    finish()
    onResult?.(alts)
  }
  rec.onerror = e => {
    finish()
    onError?.(e?.error || 'error', mode)
  }
  rec.onend = () => {
    finish()
    onEnd?.()
  }

  const api = {
    mode,
    start() {
      rec.start()
      // The cutoff goes through `abort` rather than reaching for the recogniser
      // directly, so the one teardown covers both ways of ending. Written the
      // direct way first, and it left `onresult` live after the microphone was
      // supposed to be shut.
      cutoff = setTimeout(() => {
        if (live) api.abort()
      }, MAX_LISTEN_MS)
    },
    /** Finish the utterance and let the last result through. */
    stop() {
      clearTimeout(cutoff)
      rec.stop()
    },
    /**
     * Drop everything, including anything half-heard. For unmount, for hiding
     * the app, and for the cutoff. `onend` is deliberately left attached: the
     * caller has to find out that it is no longer listening.
     */
    abort() {
      finish()
      rec.onresult = null
      rec.abort()
    },
  }
  return api
}

/**
 * What went wrong, in words a player can act on.
 *
 * `language-not-supported` and `service-not-allowed` are the two the local
 * demand produces: the browser has no model for this language on the device and
 * has correctly refused to send the audio away instead. That is the system
 * working, so it is not phrased as a failure of the app.
 */
export function errorNote(code, mode) {
  if (code === 'not-allowed' || code === 'permission-denied')
    return 'The microphone is blocked for this site. Allow it in your browser settings.'
  if (code === 'no-speech') return 'Nothing was heard.'
  if (code === 'audio-capture') return 'No microphone was found.'
  if ((code === 'language-not-supported' || code === 'service-not-allowed') && mode === 'local')
    return 'Your browser has no on-device speech model for English, and it refused to send the audio away instead. Voice input cannot work here without allowing that in settings.'
  if (code === 'network') return 'The speech service could not be reached.'
  return 'Speech recognition stopped.'
}
