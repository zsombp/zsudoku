import { it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Flashcards from './Flashcards.jsx'
import { buildDeck } from '../logic/flashcards.js'

it('draws the saved cage totals and boundaries on a drill card', () => {
  const deck = buildDeck('cageCombo', { count: 1, seed: 1234 })
  const html = renderToStaticMarkup(createElement(Flashcards, { technique: 'cageCombo', deck }))
  expect(html).toContain('reviewBoard rbFull caged')
  expect(html.match(/class="cageBox/g)).toHaveLength(81)
  expect(html.match(/class="cageSum"/g)).toHaveLength(deck[0].cages.length)
})
