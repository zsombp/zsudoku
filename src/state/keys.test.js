import { describe, it, expect } from 'vitest'
import { gameReducer, initialState } from './gameReducer.js'

const board = new Array(81).fill(0)
board[0] = 5
board[1] = 3
const base = { ...initialState, board, status: 'playing', selected: 40 }

describe('moving around the grid', () => {
  it('steps one cell and stops at the edge', () => {
    let s = { ...base, selected: 0 }
    s = gameReducer(s, { type: 'moveSelection', dx: -1, dy: 0 })
    expect(s.selected).toBe(0)
    s = gameReducer(s, { type: 'moveSelection', dx: 1, dy: 0 })
    expect(s.selected).toBe(1)
  })

  it('jumps to the edge without falling off it', () => {
    // Used to do nothing at all: only a single step was handled.
    let s = gameReducer({ ...base, selected: 40 }, { type: 'moveSelection', dx: 8, dy: 0 })
    expect(s.selected).toBe(44)
    s = gameReducer({ ...base, selected: 40 }, { type: 'moveSelection', dx: 0, dy: -8 })
    expect(s.selected).toBe(4)
  })

  it('never wraps around a row', () => {
    const s = gameReducer({ ...base, selected: 8 }, { type: 'moveSelection', dx: 1, dy: 0 })
    expect(s.selected).toBe(8)
  })
})

describe('jumping to the next empty cell', () => {
  it('skips over cells that already hold a digit', () => {
    const s = gameReducer({ ...base, selected: 80 }, { type: 'nextEmpty' })
    // 0 and 1 are filled, so the first empty going forward from 80 is 2.
    expect(s.selected).toBe(2)
  })

  it('goes backwards on request', () => {
    const s = gameReducer({ ...base, selected: 3 }, { type: 'nextEmpty', back: true })
    expect(s.selected).toBe(2)
  })

  it('does nothing at all on a full grid rather than looping', () => {
    const full = { ...base, board: new Array(81).fill(1), selected: 5 }
    expect(gameReducer(full, { type: 'nextEmpty' }).selected).toBe(5)
  })
})
