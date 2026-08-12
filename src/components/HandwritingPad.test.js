import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import HandwritingPad, { offerFor } from './HandwritingPad.jsx'
import { recognise } from '../lib/handwriting.js'

const sure = { digit: 7, sure: true, alternatives: [7, 1, 3, 2, 5, 4, 9, 8, 6] }
const shaky = { digit: 3, sure: false, alternatives: [3, 8, 9, 2, 5, 1, 4, 7, 6] }

const render = props =>
  renderToStaticMarkup(
    createElement(HandwritingPad, { selected: 0, editable: true, notes: false, onCommit: () => {}, ...props })
  )

describe('what the pad offers to do', () => {
  it('offers nothing to press until something has been read', () => {
    // The promise the whole feature rests on. A pad that could place a digit
    // before there was a reading, or without one being pressed, would write a
    // misread onto the board as a mistake against a record the player did not
    // make.
    expect(offerFor(null, { editable: true, notes: false }).place).toEqual([])
    const markup = render({})
    expect(markup).not.toContain('hwPlace')
    expect(markup).toContain('Nothing is placed until you press')
  })

  it('puts the reading first and its near misses behind it', () => {
    // A misread has to be as cheap to correct as a good read is to confirm, and
    // the recogniser already knows which digits nearly won.
    const offer = offerFor(sure, { editable: true, notes: false })
    expect(offer.place[0]).toBe(7)
    expect(offer.place).toEqual([7, 1, 3, 2])
  })

  it('never lists the same digit twice', () => {
    // `alternatives` is every digit best first, so it begins with the reading
    // itself. Slicing without filtering would offer "7, or 7, 1, 3".
    const offer = offerFor(sure, { editable: true, notes: false })
    expect(new Set(offer.place).size).toBe(offer.place.length)
  })

  it('says out loud when it is not certain', () => {
    // Two channels, not one: the caveat is a sentence as well as a colour, the
    // same rule a wrong digit on the board follows. A guess that looked the
    // same whether it was certain or a coin toss would make the pad read as
    // reliable when the measurement says it is right about two times in three
    // at this confidence.
    expect(offerFor(shaky, { editable: true, notes: false }).caveat).toBeTruthy()
    expect(offerFor(sure, { editable: true, notes: false }).caveat).toBeNull()
  })

  it('refuses to place into a cell that cannot take a digit', () => {
    // A given, a finished game or a paused one. The reducer would refuse it
    // anyway, so the point is that the button says so rather than looking live
    // and doing nothing.
    const offer = offerFor(sure, { editable: false, notes: false })
    expect(offer.enabled).toBe(false)
    expect(render({ editable: false, selected: 4 })).toContain('cannot be changed')
  })

  it('says pencil rather than place while notes mode is on', () => {
    // It goes through the same action the number pad does, so notes mode
    // applies whether the pad knows it or not. The label has to agree, or the
    // pad would promise a digit and leave a pencil mark.
    expect(offerFor(sure, { editable: true, notes: true }).label).toBe('Pencil in 7')
    expect(offerFor(sure, { editable: true, notes: false }).label).toBe('Place 7')
  })

  it('asks for a cell before it asks for a digit', () => {
    expect(render({ selected: -1, editable: false })).toContain('Tap a cell on the board first')
    expect(render({ selected: 30, editable: true })).toContain('r4c4')
  })

  it('offers a real reading of a real stroke, all the way through', () => {
    // The two halves joined up. Recognising well and offering well are tested
    // apart above, and this is the only place that checks the shapes they pass
    // each other actually fit: `recognise` returning `alternatives` in the
    // order `offerFor` assumes, with the reading at the front of it.
    const seven = [[0.04, 0.06], [0.4, 0.03], [0.72, 0.05], [0.5, 0.5], [0.3, 1]]
    const points = []
    for (let i = 1; i < seven.length; i++) {
      for (let s = 0; s <= 8; s++) {
        const t = s / 8
        points.push({
          x: 24 + (seven[i - 1][0] + t * (seven[i][0] - seven[i - 1][0])) * 82,
          y: 14 + (seven[i - 1][1] + t * (seven[i][1] - seven[i - 1][1])) * 132,
        })
      }
    }
    const offer = offerFor(recognise([points]), { editable: true, notes: false })
    expect(offer.place[0]).toBe(7)
    expect(offer.label).toBe('Place 7')
    expect(offer.caveat).toBeNull()
  })
})
