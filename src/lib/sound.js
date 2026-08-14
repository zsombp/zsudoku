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
let idleTimer = null
let quietAt = 0

/**
 * How long the context is allowed to idle before it is suspended.
 *
 * A running AudioContext holds a real-time audio thread at the device sample
 * rate and keeps the audio hardware clocked, which blocks deeper CPU sleep
 * whether or not anything is audible. Silencing it is not the same as stopping
 * it: the iPhone ring switch and a volume of zero both leave that thread
 * running, so neither is a battery answer.
 *
 * Five seconds rather than something tighter, because suspending and resuming
 * has its own latency and placements during a solve arrive every few seconds.
 * The cost being avoided is a context left running for hours on the dashboard
 * or in the background, not one running for four seconds between two digits, so
 * there is nothing to buy by cutting this fine and a clipped attack to lose.
 */
const IDLE_MS = 5000

export function setEnabled(on) {
  enabled = Boolean(on)
  // Turning sound off is an explicit "stop", so it does not wait out the grace.
  if (!enabled) quiet()
}

/** Suspend now. Safe to call when there is no context or it is already down. */
export function quiet() {
  clearTimeout(idleTimer)
  idleTimer = null
  try {
    if (ctx && ctx.state === 'running') ctx.suspend()
  } catch {
    /* A context that refuses to suspend is not worth throwing over. */
  }
}

/**
 * Suspend once everything scheduled has finished playing.
 *
 * Sounds are scheduled ahead of the clock rather than played now, so the last
 * one ends at some point in the future and suspending on the call would cut it
 * off. Every sound pushes this out.
 */
function suspendWhenDone(c, endsAt) {
  quietAt = Math.max(quietAt, endsAt)
  clearTimeout(idleTimer)
  const ms = Math.max(0, (quietAt - c.currentTime) * 1000) + IDLE_MS
  idleTimer = setTimeout(quiet, ms)
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

// Backgrounding the app is a definite answer, so it does not wait out the
// grace either. The timer half of this is what covers a phone that is simply
// sitting on the dashboard with the screen on.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') quiet()
  })
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
  suspendWhenDone(c, t0 + duration + 0.02)
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
