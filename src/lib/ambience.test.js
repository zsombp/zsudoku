import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'

/**
 * The ambience is the one sound that runs for minutes, so the battery rule is
 * the thing to test: it runs only while wanted and visible, and when it stops
 * the shared context suspends rather than idling on.
 *
 * WebAudio is a stub here, as in sound.test.js, and the clock is faked.
 */
function stubAudio() {
  const param = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  })
  const made = { oscillators: 0, started: 0, stopped: 0 }
  const node = () => ({
    connect(next) { return next },
    disconnect() {},
    start() { made.started++ },
    stop() { made.stopped++ },
    frequency: param(),
    detune: param(),
    gain: param(),
    Q: param(),
    delayTime: param(),
    type: '',
  })
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createOscillator() { made.oscillators++; return node() },
    createGain: node,
    createBiquadFilter: node,
    createDelay: node,
    suspends: 0,
    suspend() { this.state = 'suspended'; this.suspends++ },
    resume() { this.state = 'running' },
  }
  globalThis.AudioContext = function () { return ctx }
  return { ctx, made }
}

let ambience, sound, ctx, made
let hidden = false

beforeEach(async () => {
  vi.useFakeTimers()
  ;({ ctx, made } = stubAudio())
  hidden = false
  globalThis.document = {
    get visibilityState() { return hidden ? 'hidden' : 'visible' },
    listeners: [],
    addEventListener(type, fn) { if (type === 'visibilitychange') this.listeners.push(fn) },
  }
  vi.resetModules()
  sound = await import('./sound.js')
  ambience = await import('./ambience.js')
})

afterEach(() => {
  ambience.setActive(false)
  vi.runAllTimers()
  vi.useRealTimers()
  delete globalThis.AudioContext
  delete globalThis.document
})

const setHidden = h => {
  hidden = h
  for (const fn of globalThis.document.listeners) fn()
}

describe('the pad plays only while you are solving', () => {
  it('makes nothing at all until it is wanted', () => {
    ambience.placed()
    expect(made.oscillators).toBe(0)
    expect(ambience.isPlaying()).toBe(false)
  })

  it('starts four voices when wanted, and suspends the context after it stops', () => {
    ambience.setActive(true)
    expect(ambience.isPlaying()).toBe(true)
    expect(made.oscillators).toBe(4)
    expect(ctx.state).toBe('running')

    ambience.setActive(false)
    expect(ambience.isPlaying()).toBe(false)
    vi.advanceTimersByTime(2000)
    expect(made.stopped).toBe(4)
    expect(ctx.state).toBe('suspended')
  })

  it('stops at once when the page is hidden, and comes back when it is shown', () => {
    ambience.setActive(true)
    setHidden(true)
    expect(ambience.isPlaying()).toBe(false)
    // No fade timer to wait on: a hidden page's timers may not fire for a minute.
    expect(ctx.state).toBe('suspended')

    setHidden(false)
    expect(ambience.isPlaying()).toBe(true)
  })

  it('keeps playing when the clicks are switched off, and keeps the context up', () => {
    sound.setEnabled(true)
    ambience.setActive(true)
    sound.setEnabled(false)
    expect(ctx.state).toBe('running')
    vi.advanceTimersByTime(30000)
    expect(ctx.state).toBe('running')
    expect(ambience.isPlaying()).toBe(true)
  })

  it('suspends once both the pad and the last click are done', () => {
    // The pad stopping must not cut off a click scheduled a moment before.
    sound.setEnabled(true)
    ambience.setActive(true)
    sound.place()
    ambience.setActive(false)
    vi.advanceTimersByTime(8000)
    expect(ctx.state).toBe('suspended')
  })

  it('never runs a frame loop', () => {
    const src = fs.readFileSync(new URL('./ambience.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/requestAnimationFrame|setInterval/)
  })
})

describe('it follows the solve', () => {
  it('reads a run of placements as flow, a minute of nothing as a stall', () => {
    const now = 1_000_000
    expect(ambience.moodAt([now - 1000, now - 5000, now - 9000, now - 20000], now - 1000, now)).toBe('flow')
    expect(ambience.moodAt([now - 1000, now - 40000], now - 1000, now)).toBe('steady')
    expect(ambience.moodAt([], now - 61000, now)).toBe('stall')
    expect(ambience.moodAt([], 0, now)).toBe('steady')
  })

  it('opens on steady after a pause rather than on the drone', () => {
    ambience.setActive(true)
    ambience.placed()
    ambience.setActive(false)
    vi.advanceTimersByTime(5 * 60000)
    expect(ambience.currentMood()).toBe('stall')
    ambience.setActive(true)
    expect(ambience.currentMood()).toBe('steady')
  })

  it('thins out on a run of placements', () => {
    ambience.setActive(true)
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(3000)
      ambience.placed()
    }
    expect(ambience.currentMood()).toBe('flow')
  })
})
