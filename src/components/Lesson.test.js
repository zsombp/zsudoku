import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Lesson, { LessonBoard } from './Lesson.jsx'
import { stockLesson } from '../logic/lessonBank.js'
import { cageEdges } from '../logic/variants.js'
import { CAGE_TECHNIQUES } from '../logic/techniques.js'

const draw = lesson => renderToStaticMarkup(createElement(Lesson, { lesson }))

describe('the cage argument is visible on the lesson board', () => {
  it('draws each cage total once and every boundary from its topology', () => {
    for (const k of CAGE_TECHNIQUES) {
      const lesson = stockLesson(k)
      const html = draw(lesson)
      const edges = cageEdges(lesson.topo.cages)
      expect(html).toContain('lsBoard caged')
      expect(html.match(/class="cageSum"/g)).toHaveLength(lesson.topo.cages.length)
      expect(html.match(/class="cageBox/g)).toHaveLength(81)
      for (const [side, cls] of [['top', 'cT'], ['right', 'cR'], ['bottom', 'cB'], ['left', 'cL']]) {
        expect(html.match(new RegExp(` ${cls}(?: |")`, 'g'))).toHaveLength(edges.filter(e => e[side]).length)
      }
      for (const cage of lesson.topo.cages) expect(html).toContain(`class="cageSum" aria-hidden="true">${cage.sum}</span>`)
    }
  })

  it('keeps classic lessons free of cage outlines', () => {
    expect(draw(stockLesson('xWing'))).not.toContain('cageBox')
  })

  it('prints the changed total when a flaw is on, without changing the saved topology', () => {
    const lesson = stockLesson('cageCombo')
    const flaw = lesson.flaws.find(f => f.sum != null)
    expect(flaw).toBeTruthy()
    const before = JSON.stringify(lesson.topo.cages)
    const scene = {
      mask: lesson.cands, bandCols: new Set(), bandRows: new Set(), band: new Set(),
      pat: new Set(), tgt: new Set(), ghosts: new Map(), picks: new Map(), notes: new Map(),
      lines: [], crosses: [], hits: [], tags: [],
    }
    const html = renderToStaticMarkup(createElement(LessonBoard, { lesson, scene, flaw, label: flaw.label }))
    const sums = [...html.matchAll(/class="cageSum" aria-hidden="true">(\d+)<\/span>/g)].map(m => Number(m[1]))
    const index = lesson.slots[0].sumGroup.cageIndex
    expect(sums).toEqual(lesson.topo.cages.map((c, i) => i === index ? flaw.sum : c.sum))
    expect(JSON.stringify(lesson.topo.cages)).toBe(before)
  })
})
