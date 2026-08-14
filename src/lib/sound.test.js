import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

/**
 * The context has to stop, not just go quiet.
 *
 * A running AudioContext holds a real-time audio thread and keeps the audio
 * hardware clocked whether or not anything is audible, so neither the iPhone
 * ring switch nor a gain of zero is a battery answer. Before this, the context
 * was created on the first sound and left running for the rest of the session,
 * including on the dashboard and in the background.
 *
 * WebAudio does not exist in this environment and a real one would make these
 * tests wait in real time, so the context is a stub and the clock is faked.
 */
function stubAudio() {
  const node = () => ({
    connect(next) { return next },
    start() {},
    stop() {},
    frequency: { setValueAtTime() {} },
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    type: '',
  })
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createOscillator: node,
    createGain: node,
    suspends: 0,
    resumes: 0,
    suspend() { this.state = 'suspended'; this.suspends++ },
    resume() { this.state = 'running'; this.resumes++ },
  }
  globalThis.AudioContext = function () { return ctx }
  return ctx
}

let sound
let ctx

beforeEach(async () => {
  vi.useFakeTimers()
  ctx = stubAudio()
  vi.resetModules()
  sound = await import('./sound.js')
  sound.setEnabled(true)
})

afterEach(() => {
  vi.useRealTimers()
  delete globalThis.AudioContext
})

describe('the audio context stops when nothing is playing', () => {
  it('runs while a sound is scheduled and suspends after it', () => {
    sound.place()
    expect(ctx.state).toBe('running')

    // Still inside the grace: a solve places a digit every few seconds and
    // should not thrash suspend and resume between them.
    vi.advanceTimersByTime(2000)
    expect(ctx.state).toBe('running')

    vi.advanceTimersByTime(6000)
    expect(ctx.state).toBe('suspended')
  })

  it('waits for the longest scheduled sound rather than the call', () => {
    // The win fanfare is four notes, the last delayed well past the first.
    // Suspending on the call would cut it off.
    sound.win()
    vi.advanceTimersByTime(700)
    expect(ctx.state).toBe('running')
    vi.advanceTimersByTime(6000)
    expect(ctx.state).toBe('suspended')
  })

  it('pushes the suspend out when another sound arrives', () => {
    sound.place()
    vi.advanceTimersByTime(4000)
    sound.place()
    vi.advanceTimersByTime(4000)
    // Would have suspended at 5s had the second sound not reset the grace.
    expect(ctx.state).toBe('running')
    vi.advanceTimersByTime(6000)
    expect(ctx.state).toBe('suspended')
  })

  it('resumes for the next sound after suspending', () => {
    sound.place()
    vi.advanceTimersByTime(9000)
    expect(ctx.state).toBe('suspended')

    sound.place()
    expect(ctx.state).toBe('running')
    expect(ctx.resumes).toBeGreaterThan(0)
  })

  it('stops immediately when sound is switched off, without waiting', () => {
    sound.place()
    sound.setEnabled(false)
    expect(ctx.state).toBe('suspended')
  })

  it('creates no context at all while sound is off', () => {
    vi.resetModules()
    delete globalThis.AudioContext
    let built = 0
    globalThis.AudioContext = function () { built++; return ctx }
    return import('./sound.js').then(fresh => {
      fresh.setEnabled(false)
      fresh.place()
      fresh.win()
      expect(built).toBe(0)
    })
  })
})
