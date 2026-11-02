import { it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WeeklyReview from './WeeklyReview.jsx'

it('does not pad an empty week with strength or spotting claims', () => {
  const html = renderToStaticMarkup(createElement(WeeklyReview, { games: [], drills: [], history: [], now: 1000000000 }))
  expect(html).toContain('Too little activity')
  expect(html).toContain('0 games played')
  expect(html).not.toContain('Seconds to spot')
  expect(html).not.toContain('Pattern <')
})

it('prints the game and deck samples behind comparable strengths', () => {
  const now = 1000000000
  const before = now - 8 * 86400000
  const games = [before, now - 2, now - 1, now].map(endedAt => ({ endedAt, completed: true, hints: 0, mistakes: 0, techniques: { pointing: 1 } }))
  const html = renderToStaticMarkup(createElement(WeeklyReview, { games, now }))
  expect(html).toContain('rose')
  expect(html).toContain('1 game with it')
  expect(html).toContain('4 games with it')
})
