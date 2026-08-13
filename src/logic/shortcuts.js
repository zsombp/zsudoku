/**
 * The keyboard, in one table.
 *
 * There were two lists before: the `else if` chain that actually handles keys,
 * and a hand-written sentence under the number pad that claimed to describe it.
 * They had drifted by one: erase is bound to Backspace, Delete and 0, and the
 * sentence listed it under none of them. Nobody could have noticed, because a
 * shortcut nobody has been told about is indistinguishable from one that does
 * not exist.
 *
 * So this table is what the interface reads from: the badges on the tools, and
 * the line under the pad. `PLAIN` additionally drives the handler for every
 * shortcut that is nothing more than "dispatch this action", which is most of
 * them, so those cannot drift again by construction.
 *
 * The ones that stay written out in `App.jsx` are the ones that are not a plain
 * dispatch: the hint, which goes through the hint engine; the bookmark, which
 * means three different things depending on shift and on whether one is set;
 * auto-complete, which needs the fills computed first; and movement, which is
 * eight keys onto one action with four different arguments.
 */

/** Key to reducer action, for the shortcuts that are only ever that. */
export const PLAIN = {
  n: 'toggleNotes',
  a: 'autoPencil',
  u: 'undo',
  r: 'redo',
  p: 'togglePause',
}

/**
 * What to show, and where.
 *
 * `tool` matches the ids `Toolbar.jsx` already uses for its buttons, so a badge
 * lands on the right control without a second naming scheme to keep in step.
 * A row with no `tool` still appears in the summary line under the pad.
 */
export const SHORTCUTS = [
  { badge: '1-9', what: 'place a digit', tool: null },
  { badge: 'N', what: 'notes', tool: 'notes' },
  { badge: 'A', what: 'fill notes', tool: 'auto' },
  { badge: 'U', what: 'undo', tool: 'undo' },
  { badge: 'R', what: 'redo', tool: 'redo' },
  { badge: '⌫', what: 'erase', tool: 'erase' },
  { badge: 'Q', what: 'quick input', tool: 'quick' },
  { badge: '?', what: 'hint', tool: 'hint' },
  { badge: 'B', what: 'mark or return', tool: 'mark' },
  { badge: 'B', what: 'mark or return', tool: 'return' },
  // Only offered while it would actually do something, which is the existing
  // behaviour and worth keeping: a key that does nothing most of the time is
  // worse than one you were never told about.
  { badge: 'C', what: 'finish when forced', tool: null, needs: 'canComplete' },
  { badge: 'P', what: 'pause', tool: null },
  { badge: 'Tab', what: 'next empty cell', tool: null },
  { badge: 'Arrows', what: 'move, or hjkl', tool: null },
]

/** The badge for one toolbar button, or null where there is no key for it. */
export const badgeFor = tool => SHORTCUTS.find(s => s.tool === tool)?.badge || null

/**
 * The summary line, built from the table rather than typed beside it.
 *
 * Quick input changes what the digit keys do, so it changes the first entry,
 * which is the one thing here that depends on a setting.
 */
export function shortcutLine({ quickInput = false, canComplete = false } = {}) {
  const on = { canComplete }
  return SHORTCUTS
    // The two bookmark rows are one shortcut wearing two tool ids.
    .filter((s, i) => SHORTCUTS.findIndex(o => o.badge === s.badge && o.what === s.what) === i)
    .filter(s => !s.needs || on[s.needs])
    .map(s =>
      s.badge === '1-9' && quickInput ? '1-9 pick, Enter to place' : `${s.badge} ${s.what}`
    )
    .join(' · ')
}
