import { it, expect } from 'vitest'
import { byTier, improvement, overview } from './compute.js'
import { schedule } from './curriculum.js'
import { gameReducer, initialState } from '../state/gameReducer.js'
import { buildRecord } from '../lib/gameLog.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StatusBar from '../components/StatusBar.jsx'

it('excludes session puzzles from tier times but keeps their curriculum evidence', () => {
  const games = Array.from({ length: 20 }, (_, i) => ({
    endedAt: 1000 + i, completed: true, graded: 'Hard', durationMs: 1,
    sessionPuzzle: true, hints: 1, mistakes: 0,
    hintLog: [{ technique: 'nakedSingle', needed: 'xWing' }],
  }))
  expect(byTier(games).find(t => t.tier === 'Hard')).toMatchObject({ best: 0, medianMs: 0, recent: [] })
  expect(improvement(games)).toBeNull()
  expect(overview(games)).toMatchObject({ played: 20, fastest: 0 })
  expect(schedule(games).find(t => t.technique === 'xWing').strength).toBeLessThan(0.5)
})

it('carries the session marker through ready, resume and a recorded result', () => {
  const made = { puzzle: Array(81).fill(0), solution: Array(81).fill(1), seed: 1, graded: 'Hard', sessionPuzzle: true }
  const ready = gameReducer(initialState, { type: 'ready', made, now: 100, sessionDay: '2026-11-02' })
  expect(ready.sessionPuzzle).toBe(true)
  const resumed = gameReducer(initialState, { type: 'hydrate', saved: ready })
  expect(resumed).toMatchObject({ sessionPuzzle: true, sessionDay: '2026-11-02' })
  const record = buildRecord(ready, { completed: false, durationMs: 1000, endedAt: 1100 })
  expect(record).toMatchObject({ sessionPuzzle: true, sessionDay: '2026-11-02' })
  const normal = gameReducer(ready, { type: 'ready', made: { ...made, sessionPuzzle: false }, now: 200 })
  expect(normal.sessionPuzzle).toBe(false)
  expect(normal.sessionDay).toBeNull()
})

it('labels the game as a session puzzle without a requested tier', () => {
  const html = renderToStaticMarkup(createElement(StatusBar, { sessionPuzzle: true, graded: 'Hard', requested: 'Expert', ms: 0 }))
  expect(html).toContain('Session puzzle')
  expect(html).not.toContain('Hard')
  expect(html).not.toContain('you asked for')
})
