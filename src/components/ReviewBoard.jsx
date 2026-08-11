import { rowOf, colOf, range, UNITS, UNIT_META } from '../logic/topology.js'
import { hasMark } from '../logic/marks.js'

/**
 * The board, read-only, with everything the review knows drawn onto it.
 *
 * It replaced a grid that showed digits and nothing else, which was the
 * review's central weakness: the analysis would say "r3c1 still showed 2/3/6"
 * and then show you a board with no candidates on it, so the claim could not be
 * checked. Every layer here exists to make a stated reason visible.
 *
 *   cands      what the board proved at that moment, computed from the digits
 *   marks      what you had actually written down, rebuilt from the move log
 *   pattern    the cells, unit and eliminations of the technique in question
 *   focus      the cell under discussion, and the one you could have played
 *
 * Deliberately not the playable Board component. Nothing here takes input, and
 * threading a read-only mode through a component whose entire job is input
 * would make both of them worse.
 */
export default function ReviewBoard({
  puzzle,
  board,
  solution,
  cands = null,
  marks = null,
  settled = null,
  showing = 'cands',
  pattern = null,
  focus = -1,
  alternative = -1,
  heat = null,
  heatLevel = null,
  onCell = null,
  picked = null,
  cellAction = 'show history',
}) {
  // A unit is drawn whole when it is the evidence: a hidden single means
  // nothing without the row it was hidden in.
  const unitCells = pattern?.unitCells
    ? new Set(pattern.unitCells)
    : pattern?.unit
      ? new Set(
          UNITS[
            UNIT_META.findIndex(u => u.type === pattern.unit.type && u.index === pattern.unit.index)
          ] || []
        )
      : null

  const patternCells = new Set(pattern?.cells || [])
  const patternDigits = new Set(pattern?.digits || [])
  // Which candidate in which cell the pattern kills, so the strike-through
  // lands on the digit that actually died rather than the whole cell.
  const killed = new Map()
  for (const e of pattern?.eliminations || []) {
    if (!killed.has(e.cell)) killed.set(e.cell, new Set())
    killed.get(e.cell).add(e.digit)
  }

  // A derived pattern carries the candidate state it was found in. Showing the
  // raw set instead would draw a pattern over cells that contradict it.
  const shown = pattern?.cands || cands
  const source = showing === 'marks' ? marks : showing === 'none' ? null : shown

  return (
    <div className="reviewBoard rbFull">
      {range(81).map(i => {
        const given = puzzle[i] !== 0
        const v = board[i]
        const cls = ['rvCell']
        if (colOf(i) % 3 === 2 && colOf(i) !== 8) cls.push('bR')
        if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cls.push('bB')
        if (given) cls.push('given')
        if (!given && v !== 0 && solution && v !== solution[i]) cls.push('bad')
        if (heat && heatLevel && !given && heat[i] > 0) cls.push('h' + heatLevel(heat[i]))
        if (unitCells?.has(i)) cls.push('inUnit')
        if (patternCells.has(i)) cls.push('inPattern')
        if (killed.has(i)) cls.push('hasKill')
        if (i === focus) cls.push('now')
        if (i === alternative) cls.push('alt')
        // Cells the player has chosen, while they are still choosing.
        if (picked?.includes(i)) cls.push('picked')

        // Only becomes a control when there is something to open, so a board
        // that is purely a picture keeps 81 cells out of the tab order.
        const Tag = onCell ? 'button' : 'div'
        return (
          <Tag
            key={i}
            className={cls.join(' ')}
            {...(onCell
              ? {
                  onClick: () => onCell(i),
                  'aria-label': `row ${rowOf(i) + 1} column ${colOf(i) + 1}, ${cellAction}`,
                  'aria-pressed': picked ? picked.includes(i) : undefined,
                }
              : {})}
          >
            {v !== 0 ? (
              <span className="rvVal">{v}</span>
            ) : (
              source && source[i] !== 0 && (
                <span className="rvMarks">
                  {range(9).map(k => {
                    const d = k + 1
                    if (!hasMark(source[i], d)) return <span key={k} className="rvM" />
                    const dead = killed.get(i)?.has(d)
                    // A mark you kept after the board had ruled it out. Only
                    // meaningful when looking at your own notes: the computed
                    // candidates are never stale by definition.
                    // Measured against everything the ladder can rule out, not
                    // just what a peer scan finds: the interesting stale note is
                    // the one a pattern killed while you were not looking.
                    const ref = settled || shown
                    const stale = showing === 'marks' && ref && !hasMark(ref[i], d)
                    const lit = patternCells.has(i) && patternDigits.has(d)
                    return (
                      <span
                        key={k}
                        className={
                          'rvM on' +
                          (dead ? ' killed' : '') +
                          (stale ? ' stale' : '') +
                          (lit ? ' lit' : '')
                        }
                      >
                        {d}
                      </span>
                    )
                  })}
                </span>
              )
            )}
            {/* Sits in the corner, so it coexists with the digit. The heatmap
                shows the finished grid, so gating this on an empty cell hid it
                everywhere. */}
            {heat && heatLevel && !given && heat[i] > 0 && (
              <span className="rvTime">{Math.round(heat[i] / 1000)}s</span>
            )}
          </Tag>
        )
      })}
    </div>
  )
}
