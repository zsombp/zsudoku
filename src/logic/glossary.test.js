import { describe, it, expect } from 'vitest'
import {
  GLOSSARY,
  TERM_IDS,
  define,
  defineAll,
  achievementTerm,
  classTerm,
  outcomeTerm,
  techniqueTerm,
  tierTerm,
  variantTerm,
} from './glossary.js'
import { LADDER, TECHNIQUES } from './techniques.js'
import { TIERS } from './difficulty.js'
import { VARIANT_LIST } from './variants.js'
// Reaching up into src/stats/ from a test in src/logic/ on purpose, the way
// daily.test.js already does. These three lists are the whole point of the
// coverage tests: a rung, a class, a badge or an outcome added up there must
// not be able to reach a screen with no definition anywhere. The shipped module
// still imports downwards only.
import { CLASSES } from '../stats/analysis.js'
import { achievements } from '../stats/achievements.js'
import { OUTCOMES } from '../stats/experiments.js'

const entries = () => TERM_IDS.map(id => GLOSSARY[id])
const authored = () => entries().filter(e => e.source === 'glossary.js')

describe('every list the app enumerates is defined', () => {
  // Each of these fails when a feature adds a member to a list and gives it no
  // definition, which is the way vocabulary got ahead of explanation in the
  // first place: seventeen techniques and five extra variants arrived while the
  // statistics screens were still showing bare labels.

  it('defines every rung of the ladder', () => {
    for (const key of LADDER) {
      const term = define(techniqueTerm(key))
      expect(term, `no glossary entry for technique ${key}`).toBeTruthy()
      // Derived, so the ladder and the glossary cannot disagree about a name.
      expect(term.label).toBe(TECHNIQUES[key].label)
      expect(term.source).toBe('techniques.js')
    }
  })

  it('defines every tier', () => {
    for (const tier of TIERS) {
      const term = define(tierTerm(tier.name))
      expect(term, `no glossary entry for tier ${tier.name}`).toBeTruthy()
      expect(term.label).toBe(tier.name)
    }
  })

  it('defines every variant, killer included', () => {
    for (const variant of VARIANT_LIST) {
      const term = define(variantTerm(variant.id))
      expect(term, `no glossary entry for variant ${variant.id}`).toBeTruthy()
      expect(term.label).toBe(variant.name)
    }
    expect(define(variantTerm('killer'))).toBeTruthy()
  })

  it('defines every move class', () => {
    for (const key of Object.keys(CLASSES)) {
      const term = define(classTerm(key))
      expect(term, `no glossary entry for move class ${key}`).toBeTruthy()
      // The class copy is written in the glossary and the label is checked
      // against analysis.js, because src/logic/ cannot import src/stats/ to
      // derive it. This catches a rename; only a reworded `about` gets past.
      expect(term.label).toBe(CLASSES[key].label)
    }
  })

  it('defines every achievement', () => {
    for (const badge of achievements([])) {
      const term = define(achievementTerm(badge.id))
      expect(term, `no glossary entry for achievement ${badge.id}`).toBeTruthy()
      expect(term.label).toBe(badge.name)
    }
  })

  it('defines every measure an experiment reports', () => {
    for (const key of Object.keys(OUTCOMES)) {
      const term = define(outcomeTerm(key))
      expect(term, `no glossary entry for outcome ${key}`).toBeTruthy()
      expect(term.label).toBe(OUTCOMES[key].label)
    }
  })

  it('defines the statistics that carry no definition anywhere else', () => {
    // The audit in docs/VISION.md, entry by entry. Losing one of these to a
    // rename would put a bare number back on a screen with nothing to explain
    // it, and nothing else in the app would notice.
    const audited = [
      'winRate', 'medianSolve', 'placements', 'wrong', 'undos', 'firstMove',
      'longestPause', 'pencilMarks', 'checks', 'justifiedPlacements', 'hardest',
      'clean', 'currentStreak', 'dailyStreak', 'guessRate', 'missedEasier',
      'staleNote', 'chance', 'pValue', 'flow', 'ghostRacing', 'league', 'due',
      'solveArt',
    ]
    for (const id of audited) expect(define(id), `no glossary entry for ${id}`).toBeTruthy()
  })
})

describe('a definition is one sentence a person can read on a phone', () => {
  // The band is measured, not chosen. The 62 pieces of explanatory copy the app
  // already ships and that are known to fit run 17 to 166 characters, p50 51 and
  // p90 135. So 180 is a little over the longest thing on the device today, and
  // anything under 25 is a label pretending to be a definition.
  const MIN = 25
  const MAX = 180

  it('holds every definition inside the length the app already ships', () => {
    for (const term of entries()) {
      expect(term.definition.length, `${term.id} is ${term.definition.length} characters`)
        .toBeGreaterThanOrEqual(MIN)
      expect(term.definition.length, `${term.id} is ${term.definition.length} characters`)
        .toBeLessThanOrEqual(MAX)
    }
  })

  it('writes one sentence for every definition that lives here', () => {
    // Only the copy this file owns. The derived families carry whatever their
    // own module says, and two of those blurbs are two sentences.
    for (const term of authored()) {
      const sentences = (term.definition.match(/[.!?](\s|$)/g) || []).length
      expect(sentences, `${term.id}: "${term.definition}"`).toBe(1)
      expect(term.definition.endsWith('.'), `${term.id} does not end in a full stop`).toBe(true)
    }
  })

  it('gives every term a label short enough to sit above a number', () => {
    // Shipped tile labels run 5 to 14 characters. A few terms genuinely need
    // more than that ("Justified placements"), and 24 is the point past which
    // no tile could hold one.
    for (const term of entries()) {
      expect(term.label.length, `${term.id} has no label`).toBeGreaterThan(0)
      expect(term.label.length, `${term.id}: "${term.label}"`).toBeLessThanOrEqual(24)
      expect(term.label.trim()).toBe(term.label)
    }
  })

  it('keeps to the house style, which no build or lint checks', () => {
    for (const term of entries()) {
      const text = `${term.label} ${term.definition}`
      expect(text, `${term.id} uses an em-dash`).not.toMatch(/[—–]/)
      // Anything outside Latin-1 plus the curly apostrophe and quotes: emoji,
      // arrows, symbols. Copy in this app is words.
      expect(text.replace(/[’‘“”]/g, ''), `${term.id} has a non-text character`)
        .toMatch(/^[\x20-\x7e\xa0-\xff]*$/)
    }
  })
})

describe('a number says which games it covers', () => {
  // The ambiguity the whole exercise exists to remove: "Mistakes" is one game
  // on a review row, an average per solve on a tile, and an average per arm in
  // an experiment. An entry that claims a scope has to say so in words, because
  // the words are the only part anybody reads.

  it('says "this game" when it is about the game in front of you', () => {
    for (const term of entries().filter(e => e.scope === 'game')) {
      expect(term.definition, `${term.id} claims one game and never says so`)
        .toMatch(/\bthis (game|puzzle)\b/i)
    }
  })

  it('never says "this game" when it spans more than one', () => {
    for (const term of entries().filter(e => e.scope === 'many')) {
      expect(term.definition, `${term.id} spans many games but talks about this one`)
        .not.toMatch(/\bthis (game|puzzle)\b/i)
      expect(term.definition, `${term.id} spans many games and says nothing about which`)
        .toMatch(/\b(games|days|dailies|history|solve)\b/i)
    }
  })

  it('scopes every statistic that is shown in more than one place', () => {
    // These four are the ones that appear both per game and pooled. Leaving the
    // scope off would let a definition say nothing about which it is.
    for (const id of ['mistakes', 'hints', 'placements', 'justifiedPlacements']) {
      expect(define(id).scope, `${id} has no scope`).toBeTruthy()
    }
  })
})

describe('a definition never leans on a term nothing defines', () => {
  // The rule from docs/VISION.md: no jargon inside a definition unless that
  // term is itself defined here. Watched word to the entry that has to exist,
  // so deleting or renaming an entry that others lean on fails here rather than
  // leaving a sentence that explains one unknown word with another.
  const WATCHED = [
    ['candidate', 'candidate'],
    ['unit', 'unit'],
    ['peer', 'peer'],
    ['given', 'given'],
    ['cage', 'cage'],
    ['ladder', 'ladder'],
    ['tier', 'tier'],
    ['score', 'score'],
    ['daily', 'daily'],
    ['variant', 'variant'],
    ['clean', 'clean'],
    ['flow', 'flow'],
    ['struggle', 'struggle'],
    ['cadence', 'cadence'],
    ['ghost', 'ghost'],
    ['strength', 'strength'],
    ['dwell', 'dwell'],
    ['bead', 'bead'],
    ['thread', 'thread'],
    ['pace', 'leaguePace'],
    ['placement', 'placements'],
    ['mistake', 'mistakes'],
    ['hint', 'hints'],
    ['auto-complete', 'autoComplete'],
    ['auto button', 'autoPencil'],
    ['stale', 'staleNote'],
    ['routine', classTerm('routine')],
    ['solid', classTerm('solid')],
    ['sharp', classTerm('sharp')],
    ['lucky', classTerm('lucky')],
    ['naked single', techniqueTerm('nakedSingle')],
    ['hidden single', techniqueTerm('hiddenSingle')],
    ['pointing', techniqueTerm('pointing')],
    ['x-wing', techniqueTerm('xWing')],
  ]

  it('defines every piece of jargon its own definitions use', () => {
    for (const term of entries()) {
      const text = term.definition.toLowerCase()
      for (const [word, needs] of WATCHED) {
        if (!new RegExp(`\\b${word}s?\\b`).test(text)) continue
        expect(GLOSSARY[needs], `${term.id} uses "${word}" and ${needs} is not defined`).toBeTruthy()
      }
    }
  })

  it('watches words that are actually in use, so the check is not decorative', () => {
    // A watch list nothing matches passes forever and protects nothing.
    const used = WATCHED.filter(([word]) =>
      entries().some(t => new RegExp(`\\b${word}s?\\b`).test(t.definition.toLowerCase()))
    )
    expect(used.length).toBeGreaterThan(WATCHED.length / 2)
  })
})

describe('looking a term up', () => {
  it('answers null for a term that does not exist', () => {
    // Never a throw: this is read from render, and an exception there would
    // blank the statistics screen over a mistyped label.
    expect(define('noSuchTerm')).toBeNull()
    expect(define(techniqueTerm('telepathy'))).toBeNull()
    expect(define(undefined)).toBeNull()
  })

  it('skips the unknown ones rather than putting a hole in a legend', () => {
    const found = defineAll(['winRate', 'nothingLikeThis', 'checks'])
    expect(found.map(t => t.id)).toEqual(['winRate', 'checks'])
  })

  it('cannot be rewritten at runtime', () => {
    // A term that can be edited in place is a term that can be explained two
    // ways again, which is the one thing this file exists to prevent.
    expect(() => {
      GLOSSARY.winRate.definition = 'something else'
    }).toThrow()
    expect(define('winRate').definition).toMatch(/share of your recorded games/)
  })

  it('keeps the namespaced families apart from the plain statistics', () => {
    // The move class Hint and the count of hints are different terms that would
    // otherwise both want the id "hint".
    for (const id of TERM_IDS) {
      const namespaced = /^(technique|tier|variant|class|achievement)\./.test(id)
      expect(id.includes('.'), `${id} is namespaced inconsistently`).toBe(namespaced)
    }
    expect(define(classTerm('hint')).definition).not.toBe(define('hints').definition)
  })
})
