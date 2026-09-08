import { describe, expect, it } from 'vitest'
import { getWindPuzzle, getWindPuzzleView, normalizeWindDraft, rotateWindPiece } from './windPuzzle'

describe('wind circuits', () => {
  it.each(['sheltered-inlet', 'sheltered-bell', 'sheltered-sluice', 'sheltered-heart', 'ridge-vane', 'ridge-sail', 'ridge-chime', 'ridge-heart'])(
    'starts scrambled and has a connected, fully powered solution for %s', id => {
      const puzzle = getWindPuzzle(id)!
      expect(getWindPuzzleView(id)!.connected).toBe(false)
      const solved = getWindPuzzleView(id, Array(puzzle.size ** 2).fill(0))!
      expect(solved.connected).toBe(true)
      expect(solved.powered.filter(Boolean)).toHaveLength(puzzle.pieces.filter(Boolean).length)
    },
  )
  it('rotates cardinal ports and returns to the original after four turns', () => {
    expect(rotateWindPiece(1)).toBe(2)
    expect(rotateWindPiece(8)).toBe(1)
    let piece = 3
    for (let i = 0; i < 4; i++) piece = rotateWindPiece(piece)
    expect(piece).toBe(3)
  })
  it('does not accept a circuit with a disconnected section', () => {
    const rotations = Array(25).fill(0)
    rotations[12] = 1
    const view = getWindPuzzleView('ridge-heart', rotations)!
    expect(view.connected).toBe(false)
    expect(view.powered.filter(Boolean).length).toBeLessThan(25)
  })
  it('rejects unknown device ids', () => {
    expect(getWindPuzzle('keeper')).toBeNull()
    expect(getWindPuzzleView('missing')).toBeNull()
  })
})

describe('wind circuit draft validation', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['primitive', 'ridge-vane'],
    ['array root', []],
    ['missing point', { rotations: Array(9).fill(0) }],
    ['missing rotations', { pointId: 'ridge-vane' }],
    ['wrong point', { pointId: 'sheltered-inlet', rotations: Array(9).fill(0) }],
    ['non-array rotations', { pointId: 'ridge-vane', rotations: '000000000' }],
    ['short rotations', { pointId: 'ridge-vane', rotations: Array(8).fill(0) }],
    ['long rotations', { pointId: 'ridge-vane', rotations: Array(10).fill(0) }],
  ])('rejects %s', (_name, draft) => {
    expect(normalizeWindDraft(draft, 'ridge-vane')).toBeNull()
  })

  it.each([-1, 4, 0.5, Number.NaN, Infinity, -Infinity, '1', null, true])('rejects an invalid rotation value %s', (value) => {
    const rotations: unknown[] = Array(9).fill(0)
    rotations[3] = value
    expect(normalizeWindDraft({ pointId: 'ridge-vane', rotations }, 'ridge-vane')).toBeNull()
  })

  it('rejects sparse rotation arrays rather than accepting missing tiles as solved', () => {
    const rotations = Array(9)
    expect(normalizeWindDraft({ pointId: 'ridge-vane', rotations }, 'ridge-vane')).toBeNull()
  })

  it('rejects an unknown current point even when the draft id matches', () => {
    expect(normalizeWindDraft({ pointId: 'missing-device', rotations: Array(9).fill(0) }, 'missing-device')).toBeNull()
  })

  it('copies valid rotations and clears stone rotations without mutating the input', () => {
    const puzzle = getWindPuzzle('ridge-vane')!
    const rotations = Array(9).fill(3)
    const draft = { pointId: 'ridge-vane', rotations }
    const normalized = normalizeWindDraft(draft, 'ridge-vane')!
    expect(normalized).not.toBe(draft)
    expect(normalized.rotations).not.toBe(rotations)
    expect(normalized.rotations).toEqual(puzzle.pieces.map(piece => piece ? 3 : 0))
    expect(rotations).toEqual(Array(9).fill(3))
    rotations[3] = 0
    expect(normalized.rotations[3]).toBe(3)
  })

  it('falls back to the scrambled puzzle when a supplied view draft is malformed', () => {
    expect(getWindPuzzleView('ridge-vane', [0])).toEqual(getWindPuzzleView('ridge-vane'))
  })
})
