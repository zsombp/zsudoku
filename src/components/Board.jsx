import { rowOf, colOf, boxOf, range } from '../logic/topology.js'
import { hasMark } from '../logic/marks.js'
import { isWrong, highlightDigit } from '../state/gameReducer.js'

export default function Board({ state, checkErrors, onCellTap, blurred }) {
  const { board, puzzle, marks, selected, activeDigit, hintCell, flash, flashSeq, status } = state
  const flashSet = flash?.length ? new Set(flash) : null
  const ready = Boolean(board)
  const lit = ready ? highlightDigit(state) : 0

  function cellClass(i) {
    const cls = ['cell']
    if (colOf(i) % 3 === 2 && colOf(i) !== 8) cls.push('bR')
    if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cls.push('bB')
    if (!ready) return cls.join(' ')

    if (selected === i) cls.push('sel')
    else if (
      selected >= 0 &&
      (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected))
    ) cls.push('peer')

    // With a digit armed, every cell holding it lights up, including the
    // selected one. Without one, keep the old rule of not double-marking the
    // cell you are already sitting on.
    if (lit && board[i] === lit && (activeDigit || i !== selected)) cls.push('same')

    if (puzzle[i] !== 0) cls.push('given')
    else if (board[i] !== 0) cls.push('user')
    // Otherwise a hint looks like nothing happened. Cleared by the next move.
    if (i === hintCell) cls.push('hinted')
    if (checkErrors && isWrong(state, i)) cls.push('wrong')
    return cls.join(' ')
  }

  return (
    // Keyed on the puzzle so a new board remounts its cells and the entrance
    // stagger actually replays. Without the key React reuses the same elements
    // and the animation only ever runs once, on first load.
    <div
      key={state.seed ?? 'empty'}
      className={'board' + (blurred ? ' blurred' : '') + (status === 'won' ? ' isWon' : '')}
    >
      {range(81).map(i => {
        const v = ready ? board[i] : 0
        const lit = flashSet?.has(i)
        return (
          <button
            // The flash sequence is part of the key for flashing cells only, so
            // completing two units in a row still animates the second time.
            key={lit ? `${i}-${flashSeq}` : i}
            className={cellClass(i) + (lit ? ' flash' : '')}
            style={{ '--i': i, '--d': rowOf(i) + colOf(i) }}
            onClick={() => onCellTap(i)}
            aria-label={`row ${rowOf(i) + 1} column ${colOf(i) + 1}${v ? `, ${v}` : ', empty'}`}
          >
            {v !== 0 ? (
              <span className="val">{v}</span>
            ) : (
              ready && marks[i] !== 0 && (
                <span className="marks">
                  {range(9).map(k => {
                    const d = k + 1
                    const on = hasMark(marks[i], d)
                    return (
                      <span key={k} className={'m' + (on && lit === d ? ' mHi' : '')}>
                        {on ? d : ''}
                      </span>
                    )
                  })}
                </span>
              )
            )}
          </button>
        )
      })}
    </div>
  )
}
