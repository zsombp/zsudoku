// Sound, synthesised with WebAudio.
//
// No audio files: nothing to download, nothing to precache, nothing to go
// missing offline. Every sound here is a couple of oscillators and an envelope,
// which is all a UI blip ever needed to be.
//
// Off by default. A sudoku that makes noise when you did not ask it to is worse
// than a silent one.

let ctx = null
let enabled = false

export function setEnabled(on) {
  enabled = Boolean(on)
}

function audio() {
  if (!enabled) return null
  try {
    // Created lazily and only after a gesture, because browsers refuse to start
    // an AudioContext before the user has interacted with the page.
    if (!ctx) ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * One note. Short attack, exponential decay: a click rather than a beep.
 * `gain` stays low; these play next to someone's ear on a phone.
 */
function tone(freq, { duration = 0.09, gain = 0.05, type = 'sine', delay = 0 } = {}) {
  const c = audio()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const amp = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(amp).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export const place = () => tone(660, { duration: 0.07, gain: 0.04 })
export const erase = () => tone(320, { duration: 0.06, gain: 0.03, type: 'triangle' })
export const wrong = () => {
  tone(180, { duration: 0.14, gain: 0.05, type: 'sawtooth' })
  tone(120, { duration: 0.16, gain: 0.035, type: 'sine', delay: 0.03 })
}
export const hint = () => {
  tone(520, { duration: 0.07, gain: 0.035 })
  tone(780, { duration: 0.09, gain: 0.035, delay: 0.06 })
}
/** A major triad, unhurried. The only sound allowed to last longer than a blink. */
/**
 * Completing a unit. A small rising pair, quieter than a placement, because it
 * happens on top of one: the placement sound has already fired and this sits
 * behind it rather than competing.
 */
export const unitDone = () => {
  tone(784, { duration: 0.06, gain: 0.028 })
  tone(1046, { duration: 0.08, gain: 0.024, delay: 0.05 })
}

/**
 * The last digit going in before the win fanfare. A held note under the final
 * placement, so the moment the grid closes is audibly different from the ninety
 * placements that led to it.
 */
export const lastCell = () => {
  tone(523, { duration: 0.18, gain: 0.03, type: 'triangle' })
}

/** Arming a digit on the pad. Barely there: it happens constantly. */
export const arm = () => tone(880, { duration: 0.035, gain: 0.018, type: 'sine' })

/** Undo. The place sound backwards, in feel if not in fact. */
export const undo = () => {
  tone(520, { duration: 0.05, gain: 0.03, type: 'triangle' })
  tone(390, { duration: 0.06, gain: 0.025, type: 'triangle', delay: 0.04 })
}

export const win = () => {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => tone(f, { duration: 0.4, gain: 0.045, delay: i * 0.09 }))
}
