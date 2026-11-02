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
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime() {},
    setTargetAtTime: vi.fn(),
    cancelScheduledValues() {},
  })
  const made = { oscillators: 0, started: 0, stopped: 0, nodes: 0, voices: [], filters: [], delays: [] }
  const node = () => {
    made.nodes++
    return ({
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
  }
  const started = Date.now()
  const ctx = {
    state: 'running',
    get currentTime() { return (Date.now() - started) / 1000 },
    destination: {},
    createOscillator() { made.oscillators++; const n = node(); made.voices.push(n); return n },
    createGain: node,
    createBiquadFilter() { const n = node(); made.filters.push(n); return n },
    createDelay() { const n = node(); made.delays.push(n); return n },
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

  it('suspends at once when the page is hidden in the middle of a fade-out', () => {
    // Stopped, so it is fading and still holding the context; hiding the page
    // must not leave it running until a throttled timer gets round to it.
    ambience.setActive(true)
    ambience.setActive(false)
    expect(ctx.state).toBe('running')
    setHidden(true)
    expect(ctx.state).toBe('suspended')
    // The timer that would have released it later releases nothing twice.
    vi.advanceTimersByTime(5000)
    expect(ctx.state).toBe('suspended')
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

describe('one palette for each theme with the same running cost', () => {
  it('covers exactly the themes in the tokens, with distinct chords and timbres', () => {
    const css = fs.readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
    const themes = [...css.matchAll(/\[data-theme="([^"]+)"\]/g)].map(m => m[1])
    expect(Object.keys(ambience.PALETTES).sort()).toEqual([...new Set(themes)].sort())
    const palettes = Object.values(ambience.PALETTES)
    expect(new Set(palettes.map(p => JSON.stringify(p.chords))).size).toBe(6)
    expect(new Set(palettes.map(p => JSON.stringify(p.types))).size).toBe(6)
    for (const p of palettes) {
      expect(p.chords).toHaveLength(4)
      expect(p.types).toHaveLength(4)
      expect(p.feedback).toBeLessThan(1)
      expect(p.echo).toBeLessThan(1)
      for (const chord of p.chords) {
        expect(chord).toHaveLength(4)
        expect(chord.every(f => Number.isFinite(f) && f > 0)).toBe(true)
      }
    }
  })

  it.each(['ink', 'paper', 'midnight', 'nord', 'newsprint', 'contrast'])('%s uses thirteen nodes and the same chord timer', theme => {
    ambience.setActive(true, theme)
    expect(made.nodes).toBe(13)
    expect(made.oscillators).toBe(4)
    expect(made.voices.map(v => v.type)).toEqual(ambience.PALETTES[theme].types)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(9000)
    expect(made.nodes).toBe(13)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('glides parameters immediately, then changes quieted voices on existing ticks', () => {
    ambience.setActive(true, 'midnight')
    const timers = vi.getTimerCount()
    ambience.setTheme('paper')
    expect(made.nodes).toBe(13)
    expect(made.stopped).toBe(0)
    expect(vi.getTimerCount()).toBe(timers)
    expect(made.voices.map(v => v.type)).toEqual(ambience.PALETTES.midnight.types)
    for (const voice of made.voices) expect(voice.frequency.setTargetAtTime).toHaveBeenCalled()
    expect(made.filters[0].frequency.setTargetAtTime).toHaveBeenCalledWith(1200, 0, 2)
    expect(made.delays[0].delayTime.setTargetAtTime).toHaveBeenCalledWith(0.25, 0, 1.5)
    vi.advanceTimersByTime(9000)
    expect(made.voices[0].type).toBe('triangle')
    expect(made.voices[3].type).toBe('sine')
    vi.advanceTimersByTime(9000)
    expect(made.voices.map(v => v.type)).toEqual(ambience.PALETTES.paper.types)
    expect(made.nodes).toBe(13)
    expect(vi.getTimerCount()).toBe(timers)
  })

  it('changes no nodes or timers while stopped and falls back to ink for an unknown theme', () => {
    ambience.setTheme('paper')
    expect(made.nodes).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    ambience.setActive(true, 'unknown')
    expect(made.voices.map(v => v.type)).toEqual(ambience.PALETTES.ink.types)
  })

  it('survives rapid theme changes, flow, a stall and hiding during the glide', () => {
    ambience.setActive(true, 'newsprint')
    ambience.setTheme('nord')
    ambience.setTheme('contrast')
    for (let i = 0; i < 4; i++) ambience.placed()
    vi.advanceTimersByTime(70000)
    expect(made.voices.map(v => v.type)).toEqual(ambience.PALETTES.contrast.types)
    expect(ambience.currentMood()).toBe('stall')
    expect(made.nodes).toBe(13)
    setHidden(true)
    expect(ctx.state).toBe('suspended')
    expect(vi.getTimerCount()).toBe(0)
  })
})
