import { createContext, useContext, useMemo, useState } from 'react'
import { define, defineAll } from '../logic/glossary.js'

/**
 * How the interface reads src/logic/glossary.js.
 *
 * Every explanation on every screen comes through here, so a term cannot be
 * explained one way on the statistics tiles and another way in the review. The
 * label comes from the glossary too, not just the sentence: `<Term id="winRate" />`
 * writes "Win rate" and explains "Win rate", and there is no way for the two to
 * drift apart. Passing children overrides the label and is for the handful of
 * places where the surrounding sentence needs different words; Term.test.js
 * keeps that list short and checks the rest.
 *
 * ---- which of the two shapes a surface gets ----
 *
 * docs/VISION.md: subtext under the label where there is room, tap to reveal
 * where there is not, never hover alone. "Where there is room" was measured in
 * the running app at 375px against this stylesheet, printing the median, the
 * 90th percentile and the longest definition the glossary holds into each real
 * container:
 *
 *   surface              width    bare   +p50    +p90
 *   tile, 1 of 3         111.7    67.8   134.2   187.4
 *   fact, 1 of 4          82.3    53.2   146.3   212.8
 *   badge, 1 of 2        170.5    32.5    78.6   122.7
 *   table cell, 6 cols    61.9    20.5    55.6    90.7
 *   full-width note      347.0    16.5    33.0     49.5
 *   heading + note       347.0    13.0    56.0     72.5
 *
 * A definition costs three to four times the height of the thing it explains in
 * any grid cell, and the widest cell on the phone is 170px. Six tiles would go
 * from 136px of screen to 375px. So the cut is not a judgment call: a container
 * that spans the column gets subtext, a container that is a cell in a grid or a
 * table gets a tap. Nothing between 171px and 347px exists in this app.
 *
 * ---- the tap ----
 *
 * A `title` is invisible on a phone, which is where this app is played, so it is
 * carried everywhere as a bonus for a pointer and is never the only route. The
 * trigger is a real button: dotted underline for the eye, `aria-expanded` for a
 * screen reader, and the whole tile or fact as the target rather than its 10px
 * label, because a 10px label is not a touch target.
 *
 * A group shares one line underneath it rather than each member growing when
 * opened. Growing reflows a three-column grid and moves the thing you just
 * tapped out from under your thumb; measured above, an opened tile is 187px, so
 * the two tiles beside it would jump a row. The shared line also gives the
 * affordance somewhere to live: it holds the prompt when nothing is open and the
 * answer when something is, so it costs exactly one line either way and there is
 * never an unexplained dotted underline with nothing telling you to press it.
 */

const TermCtx = createContext(null)

/** The entry, or null, plus whether this one is the open one. */
function useTerm(id) {
  const group = useContext(TermCtx)
  const [own, setOwn] = useState(false)
  const term = define(id)
  const open = group ? group.open === id : own
  const toggle = () => (group ? group.toggle(id) : setOwn(o => !o))
  return { term, open, toggle, grouped: Boolean(group) }
}

function Note({ term, onClose }) {
  return (
    <button type="button" className="termNote" onClick={onClose}>
      <b>{term.label}</b> {term.definition}
    </button>
  )
}

/**
 * A set of triggers that share one line of explanation, placed after them.
 *
 * `hint` is what that line says while nothing is open. Leave it off only where
 * another visible line already tells you the labels can be pressed.
 */
export function TermGroup({ hint, children }) {
  const [open, setOpen] = useState(null)
  const ctx = useMemo(
    () => ({ open, toggle: id => setOpen(o => (o === id ? null : id)) }),
    [open]
  )
  const term = define(open)
  return (
    <TermCtx.Provider value={ctx}>
      {children}
      {term ? (
        <Note term={term} onClose={() => setOpen(null)} />
      ) : hint ? (
        <p className="termHint">{hint}</p>
      ) : null}
    </TermCtx.Provider>
  )
}

/**
 * A label you can press for what it means, inline.
 *
 * With no term it renders its own text and no control at all. A trigger that
 * opens an empty line is worse than a plain label, and the missing entry is
 * caught by glossary.test.js walking the app's own lists rather than by a hole
 * appearing on screen.
 */
export function Term({ id, children, className = '' }) {
  const { term, open, toggle, grouped } = useTerm(id)
  if (!term) return <>{children ?? null}</>
  return (
    <>
      <button
        type="button"
        className={'term' + (className ? ' ' + className : '') + (open ? ' on' : '')}
        title={term.definition}
        aria-expanded={open}
        onClick={e => {
          // Several of these sit inside cards and rows that are themselves
          // buttons or have their own click. Asking what a word means must not
          // also start a game.
          e.stopPropagation()
          e.preventDefault()
          toggle()
        }}
      >
        {children ?? term.label}
      </button>
      {!grouped && open && <Note term={term} onClose={toggle} />}
    </>
  )
}

/**
 * A whole block as the trigger: a tile, a fact, a badge.
 *
 * The label inside still carries the dotted underline, because that is the part
 * that reads as pressable, but the target is the whole box.
 */
export function TermButton({ id, className = '', children }) {
  const { term, open, toggle, grouped } = useTerm(id)
  if (!term) return <div className={className}>{children}</div>
  return (
    <>
      <button
        type="button"
        className={'termBox ' + className + (open ? ' on' : '')}
        title={term.definition}
        aria-expanded={open}
        onClick={toggle}
      >
        {children}
      </button>
      {!grouped && open && <Note term={term} onClose={toggle} />}
    </>
  )
}

/**
 * The definition as subtext, which is the default shape wherever the container
 * spans the column. Renders nothing at all when there is no such term, so a
 * renamed id leaves a gap rather than an empty paragraph with a border.
 */
export function Explain({ id, className = 'explain' }) {
  const term = define(id)
  if (!term) return null
  return <p className={className}>{term.definition}</p>
}

/** Just the glossary's word for something, for a heading or a sentence. */
export function termLabel(id, fallback = '') {
  return define(id)?.label ?? fallback
}

/**
 * Several terms at once, always visible, for a key under a set of glyphs.
 *
 * Used where the thing being explained is a colour or a mark rather than a word,
 * since there is nothing there to press.
 */
export function TermLegend({ ids, className = 'termLegend' }) {
  const terms = defineAll(ids)
  if (!terms.length) return null
  return (
    <dl className={className}>
      {terms.map(t => (
        <div className="termLegendRow" key={t.id}>
          <dt>{t.label}</dt>
          <dd>{t.definition}</dd>
        </div>
      ))}
    </dl>
  )
}
