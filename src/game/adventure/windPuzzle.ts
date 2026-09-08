export interface WindPuzzle {
  readonly size: number
  readonly start: number
  readonly end: number
  readonly pieces: readonly number[]
  readonly initialRotations: readonly number[]
}

export interface WindPuzzleDraft {
  readonly pointId: string
  readonly rotations: readonly number[]
}

export interface WindPuzzleView {
  readonly pointId: string
  readonly size: number
  readonly start: number
  readonly end: number
  readonly masks: readonly number[]
  readonly powered: readonly boolean[]
  readonly connected: boolean
}

// Clockwise ports: north, east, south, west. Paths grow in complexity, not in wait time.
const PATHS = [
  { size: 3, cells: [3, 0, 1, 4, 5, 8] },
  { size: 4, cells: [4, 0, 1, 5, 9, 8, 12, 13, 14, 10, 11] },
  { size: 4, cells: [0, 4, 8, 12, 13, 9, 5, 1, 2, 6, 10, 14, 15] },
  { size: 5, cells: [10, 5, 0, 1, 6, 11, 16, 15, 20, 21, 22, 17, 12, 7, 2, 3, 8, 13, 18, 23, 24, 19, 14, 9, 4] },
] as const
const DEVICE_INDEX: Readonly<Record<string, number>> = {
  'sheltered-inlet': 0, 'sheltered-bell': 1, 'sheltered-sluice': 2, 'sheltered-heart': 3,
  'ridge-vane': 0, 'ridge-sail': 1, 'ridge-chime': 2, 'ridge-heart': 3,
}

export function rotateWindPiece(mask: number): number {
  return ((mask << 1) & 15) | ((mask >> 3) & 1)
}

const PUZZLES: readonly WindPuzzle[] = PATHS.map(({ size, cells }, patternIndex) => {
  const pieces: number[] = Array(size * size).fill(0)
  const port = (from: number, to: number): number => to === from - size ? 1 : to === from + 1 ? 2 : to === from + size ? 4 : 8
  cells.forEach((cell, i) => {
    pieces[cell] = (i === 0 ? 8 : port(cell, cells[i - 1])) | (i === cells.length - 1 ? 2 : port(cell, cells[i + 1]))
  })
  return {
    size, start: cells[0], end: cells[cells.length - 1], pieces,
    initialRotations: pieces.map((piece, i) => piece ? (i + patternIndex) % 3 + 1 : 0),
  }
})

export function getWindPuzzle(pointId: string): WindPuzzle | null {
  const index = DEVICE_INDEX[pointId]
  return index === undefined ? null : PUZZLES[index]
}

export function normalizeWindDraft(value: unknown, pointId: string): WindPuzzleDraft | null {
  if (!value || typeof value !== 'object' || !('pointId' in value) || value.pointId !== pointId || !('rotations' in value)) return null
  const puzzle = getWindPuzzle(pointId)
  const rotations = value.rotations
  if (!puzzle || !Array.isArray(rotations) || rotations.length !== puzzle.pieces.length || !Array.from(rotations).every(n => Number.isInteger(n) && n >= 0 && n <= 3)) return null
  return { pointId, rotations: rotations.map((n, i) => puzzle.pieces[i] ? n : 0) }
}

export function getWindPuzzleView(pointId: string, rotations?: readonly number[]): WindPuzzleView | null {
  const puzzle = getWindPuzzle(pointId)
  if (!puzzle) return null
  const turns = normalizeWindDraft({ pointId, rotations }, pointId)?.rotations ?? puzzle.initialRotations
  const masks = puzzle.pieces.map((piece, index) => {
    let mask = piece
    for (let n = 0; n < turns[index]; n++) mask = rotateWindPiece(mask)
    return mask
  })
  const powered: boolean[] = Array(masks.length).fill(false)
  const pending = (masks[puzzle.start] & 8) !== 0 ? [puzzle.start] : []
  const deltas = [-puzzle.size, 1, puzzle.size, -1]
  while (pending.length > 0) {
    const index = pending.pop()!
    if (powered[index]) continue
    powered[index] = true
    for (let dir = 0; dir < 4; dir++) {
      if ((masks[index] & (1 << dir)) === 0) continue
      if (dir === 1 && index % puzzle.size === puzzle.size - 1) continue
      if (dir === 3 && index % puzzle.size === 0) continue
      const neighbor = index + deltas[dir]
      if (neighbor < 0 || neighbor >= masks.length || (masks[neighbor] & (1 << ((dir + 2) % 4))) === 0) continue
      pending.push(neighbor)
    }
  }
  return {
    pointId, size: puzzle.size, start: puzzle.start, end: puzzle.end, masks, powered,
    connected: powered[puzzle.end] && (masks[puzzle.end] & 2) !== 0 && masks.every((mask, i) => mask === 0 || powered[i]),
  }
}
