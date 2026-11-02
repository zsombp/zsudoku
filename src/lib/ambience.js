// Ambience: a slow generated pad under the game. Opt-in, off by default.
//
// Four voices on a loop of four chords, through one low-pass filter and one
// short echo. No samples, no reverb impulse to download, and nothing that
// costs more than a handful of oscillators: a ConvolverNode would sound
// richer and cost real CPU for the whole of a solve, which is the wrong trade
// on a phone.
//
// It follows how the solve is going rather than looping blindly:
//
//   steady   the default: all four voices, a chord change every nine seconds
//   flow     four or more placements in the last thirty seconds: the upper
//            voices fall away and the filter opens, so the pad gets out of
//            the way of a run that is going well
//   stall    nothing placed for a minute: one low drone, the filter closed,
//            the chords stop moving. Room to think, not a nudge.
//
// The battery rule. A running AudioContext holds a real-time audio thread for
// as long as it runs, audible or not (see sound.js), so this plays only while
// you are actually solving: the game screen, the clock running, the page
// visible and the switch on. Anything else stops it and lets the context
// suspend. Its timers are a chord change every few seconds, never a frame loop.

import { acquire, release } from './sound.js'

// Dm9, Bbmaj7, Fmaj7, Csus2, voiced low. Each row is one chord, one frequency
// per voice, so a change glides every voice to its new note.
export const CHORDS = [
  [146.83, 220.0, 261.63, 329.63],
  [116.54, 174.61, 220.0, 293.66],
  [87.31, 130.81, 220.0, 329.63],
  [130.81, 196.0, 293.66, 392.0],
]
const VOICE_GAIN = [0.32, 0.24, 0.17, 0.12]
const LEVEL = 0.05
const STEADY_MS = 9000
const FLOW_MS = 7000
const FLOW_WINDOW_MS = 30000
const FLOW_PLACEMENTS = 4
const STALL_MS = 60000

let wanted = false
let live = null
// A pad fading out after a stop, and the clean-up that releases the context
// once it is quiet. Hiding the page runs it at once rather than waiting on a
// timer a backgrounded page may never fire.
let fading = null
let placedAt = []
let lastPlaced = 0

/** Which of the three states the pad should be in, from the placement times. */
export function moodAt(times, last, now) {
  const recent = times.filter(t => now - t <= FLOW_WINDOW_MS).length
  if (recent >= FLOW_PLACEMENTS) return 'flow'
  if (last && now - last >= STALL_MS) return 'stall'
  return 'steady'
}

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

function sync() {
  if (!visible() && fading) fading()
  const want = wanted && visible()
  if (want && !live) start()
  else if (!want && live) stop({ now: !visible() })
}

/** On or off. Called by the app with whether you are solving right now. */
export function setActive(on) {
  const was = wanted
  wanted = Boolean(on)
  // Coming back to the board is a fresh start, not a minute-long stall: a
  // pause for tea should not open on the drone.
  if (wanted && !was) {
    lastPlaced = Date.now()
    placedAt = []
  }
  sync()
}

/** A digit went in. Feeds the flow and stall reading; costs nothing when off. */
export function placed() {
  const now = Date.now()
  lastPlaced = now
  placedAt = [...placedAt.filter(t => now - t <= FLOW_WINDOW_MS), now]
  if (live) shape(moodAt(placedAt, lastPlaced, now))
}

function start() {
  const c = acquire()
  if (!c) return
  try {
    const t = c.currentTime
    const master = c.createGain()
    master.gain.setValueAtTime(0.0001, t)
    master.gain.exponentialRampToValueAtTime(LEVEL, t + 4)

    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, t)
    filter.Q.setValueAtTime(0.4, t)

    // A short echo for space: one delay line feeding back through a darker
    // filter, so each repeat is quieter and duller than the last.
    const delay = c.createDelay(1)
    delay.delayTime.setValueAtTime(0.42, t)
    const feedback = c.createGain()
    feedback.gain.setValueAtTime(0.28, t)
    const dull = c.createBiquadFilter()
    dull.type = 'lowpass'
    dull.frequency.setValueAtTime(700, t)

    filter.connect(master)
    filter.connect(delay)
    delay.connect(dull).connect(feedback).connect(delay)
    feedback.connect(master)
    master.connect(c.destination)

    const chord = Math.floor(Math.random() * CHORDS.length)
    const voices = CHORDS[chord].map((f, i) => {
      const osc = c.createOscillator()
      osc.type = i === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(f, t)
      // A few cents apart, so the voices beat slowly against each other.
      osc.detune.setValueAtTime((i % 2 ? 1 : -1) * (3 + i), t)
      const amp = c.createGain()
      amp.gain.setValueAtTime(VOICE_GAIN[i], t)
      osc.connect(amp).connect(filter)
      osc.start(t)
      return { osc, amp }
    })

    live = { c, master, filter, delay, feedback, dull, voices, chord, mood: 'steady', timer: null }
    shape(moodAt(placedAt, lastPlaced, Date.now()))
    schedule()
  } catch {
    release({ now: true })
    live = null
  }
}

function schedule() {
  if (!live) return
  clearTimeout(live.timer)
  live.timer = setTimeout(tick, live.mood === 'flow' ? FLOW_MS : STEADY_MS)
}

function tick() {
  if (!live) return
  const mood = moodAt(placedAt, lastPlaced, Date.now())
  shape(mood)
  if (mood !== 'stall') {
    live.chord = (live.chord + 1) % CHORDS.length
    const t = live.c.currentTime
    // A glide rather than a cut: every voice slides to its next note.
    CHORDS[live.chord].forEach((f, i) => live.voices[i].osc.frequency.setTargetAtTime(f, t, 1.1))
  }
  schedule()
}

/** Move the voices and the filter to a mood. Ramps only, never a jump. */
function shape(mood) {
  if (!live || live.mood === mood) return
  live.mood = mood
  const t = live.c.currentTime
  const gains =
    mood === 'flow'
      ? [VOICE_GAIN[0], VOICE_GAIN[1], 0.0001, 0.0001]
      : mood === 'stall'
        ? [VOICE_GAIN[0] * 1.2, 0.0001, 0.0001, 0.0001]
        : VOICE_GAIN
  live.voices.forEach((v, i) => {
    v.amp.gain.cancelScheduledValues(t)
    v.amp.gain.setTargetAtTime(gains[i], t, 1.5)
  })
  live.filter.frequency.cancelScheduledValues(t)
  live.filter.frequency.setTargetAtTime(mood === 'flow' ? 1400 : mood === 'stall' ? 450 : 900, t, 2)
  if (mood === 'stall') {
    // The drone sits an octave under the chord's root.
    live.voices[0].osc.frequency.setTargetAtTime(CHORDS[live.chord][0] / 2, t, 2)
  } else {
    live.voices[0].osc.frequency.setTargetAtTime(CHORDS[live.chord][0], t, 1.1)
  }
}

function stop({ now = false } = {}) {
  const l = live
  live = null
  clearTimeout(l.timer)
  const t = l.c.currentTime
  const fade = now ? 0.05 : 1.2
  try {
    l.master.gain.cancelScheduledValues(t)
    l.master.gain.setTargetAtTime(0.0001, t, fade / 4)
    for (const v of l.voices) v.osc.stop(t + fade + 0.1)
  } catch {
    /* Already stopped is stopped. */
  }
  let finished = false
  let timer = null
  const done = () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    if (fading === done) fading = null
    try {
      for (const v of l.voices) v.osc.disconnect()
      l.master.disconnect()
      l.feedback.disconnect()
      l.delay.disconnect()
    } catch {
      /* Disconnected is disconnected. */
    }
    release({ now: true })
  }
  // Hidden means now: a backgrounded page's timers are throttled, and the
  // context must not run on behind a timer that may not fire for a minute.
  if (now) done()
  else {
    fading = done
    timer = setTimeout(done, (fade + 0.2) * 1000)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', sync)
}

/** For tests: whether a pad is running right now, and the mood it would take. */
export const isPlaying = () => Boolean(live)
export const currentMood = () => moodAt(placedAt, lastPlaced, Date.now())
