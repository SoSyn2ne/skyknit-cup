import type { ClipmapGeometryStats, ClipmapLevelState } from './terrainTypes'

export const CLIPMAP_PART_RING = 0
export const CLIPMAP_PART_VERTICAL_TRIM = 1
export const CLIPMAP_PART_HORIZONTAL_TRIM = 2

export interface BuildClipmapOptions {
  readonly gridHalfExtent: number
  readonly lodCount: number
}

export interface ClipmapGeometryData {
  readonly positions: Float32Array
  readonly grids: Float32Array
  readonly lods: Float32Array
  readonly parts: Float32Array
  readonly morphOffsets: Float32Array
  readonly indices: Uint32Array
  readonly stats: ClipmapGeometryStats
}

export interface ClipmapPartitionReport {
  readonly coveredCellCount: number
  readonly gapCount: number
  readonly overlapCount: number
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

export function computeClipmapLevelStates(
  camX: number,
  camZ: number,
  baseSpacing: number,
  lodCount: number,
): ClipmapLevelState[] {
  const rawOrigins: Array<{
    lod: number
    spacing: number
    originX: number
    originZ: number
  }> = []

  for (let lod = 0; lod < lodCount; lod += 1) {
    const spacing = baseSpacing * 2 ** lod
    const snapStep = spacing * 2
    const originX = normalizeZero(Math.floor(camX / snapStep) * snapStep)
    const originZ = normalizeZero(Math.floor(camZ / snapStep) * snapStep)
    rawOrigins.push({ lod, spacing, originX, originZ })
  }

  return rawOrigins.map((level, index) => {
    if (index === 0) {
      return {
        ...level,
        trimOffsetX: 0,
        trimOffsetZ: 0,
      }
    }
    const finer = rawOrigins[index - 1]
    const rawOffsetX = Math.round(
      (finer.originX - level.originX) / level.spacing,
    )
    const rawOffsetZ = Math.round(
      (finer.originZ - level.originZ) / level.spacing,
    )
    return {
      ...level,
      trimOffsetX: (rawOffsetX === 1 ? 1 : 0) as 0 | 1,
      trimOffsetZ: (rawOffsetZ === 1 ? 1 : 0) as 0 | 1,
    }
  })
}

export function computeMorphFactor(
  gridX: number,
  gridZ: number,
  gridHalfExtent: number,
  morphStart: number,
  lod: number,
  lodCount: number,
): number {
  if (lod >= lodCount - 1) {
    return 0
  }
  const normalized = Math.max(Math.abs(gridX), Math.abs(gridZ)) / gridHalfExtent
  const t = Math.max(
    0,
    Math.min(1, (normalized - morphStart) / Math.max(1e-5, 1 - morphStart)),
  )
  return t * t * (3 - 2 * t)
}

export function buildClipmapGeometryData(
  options: BuildClipmapOptions,
): ClipmapGeometryData {
  const halfExtent = options.gridHalfExtent
  const lodCount = options.lodCount

  if (halfExtent < 4 || halfExtent % 4 !== 0) {
    throw new Error(
      `gridHalfExtent must be a multiple of 4 (>= 4), got ${halfExtent}`,
    )
  }
  if (lodCount < 1 || lodCount > 8) {
    throw new Error(`lodCount must be between 1 and 8, got ${lodCount}`)
  }

  const positions: number[] = []
  const grids: number[] = []
  const lods: number[] = []
  const parts: number[] = []
  const morphOffsets: number[] = []
  const indices: number[] = []

  let ringQuadCount = 0
  let trimQuadCount = 0
  const holeHalf = halfExtent / 2

  const appendSubGrid = (
    lod: number,
    part: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    skipCell?: (cx: number, cz: number) => boolean,
  ): number => {
    const strideX = maxX - minX + 1
    const baseVertex = positions.length / 3
    const scale = 2 ** lod

    for (let gz = minZ; gz <= maxZ; gz += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        positions.push(gx * scale, 0, gz * scale)
        grids.push(gx, gz)
        lods.push(lod)
        parts.push(part)
        if (part === CLIPMAP_PART_RING) {
          morphOffsets.push(gx & 1, gz & 1)
        } else {
          morphOffsets.push(0, 0)
        }
      }
    }

    let emittedQuads = 0
    for (let cz = minZ; cz < maxZ; cz += 1) {
      for (let cx = minX; cx < maxX; cx += 1) {
        if (skipCell?.(cx, cz)) {
          continue
        }
        const a = baseVertex + (cz - minZ) * strideX + (cx - minX)
        const b = a + 1
        const c = a + strideX
        const d = c + 1
        // Diagonal a -> d guarantees crack-free 2x2 geomorph collapse with +Y CCW winding.
        indices.push(a, c, d, a, d, b)
        emittedQuads += 1
      }
    }

    return emittedQuads
  }

  for (let lod = 0; lod < lodCount; lod += 1) {
    if (lod === 0) {
      ringQuadCount += appendSubGrid(
        0,
        CLIPMAP_PART_RING,
        -halfExtent,
        halfExtent,
        -halfExtent,
        halfExtent,
      )
    } else {
      ringQuadCount += appendSubGrid(
        lod,
        CLIPMAP_PART_RING,
        -halfExtent,
        halfExtent,
        -halfExtent,
        halfExtent,
        (cx, cz) =>
          cx >= -holeHalf &&
          cx <= holeHalf &&
          cz >= -holeHalf &&
          cz <= holeHalf,
      )

      // Vertical L-trim: 1 cell wide (x in [0, 1]), (N + 1) cells tall (z in [-N/2, N/2 + 1])
      trimQuadCount += appendSubGrid(
        lod,
        CLIPMAP_PART_VERTICAL_TRIM,
        0,
        1,
        -holeHalf,
        holeHalf + 1,
      )

      // Horizontal L-trim: N cells wide (x in [-N/2, N/2]), 1 cell tall (z in [0, 1])
      trimQuadCount += appendSubGrid(
        lod,
        CLIPMAP_PART_HORIZONTAL_TRIM,
        -holeHalf,
        holeHalf,
        0,
        1,
      )
    }
  }

  const vertexCount = positions.length / 3
  const triangleCount = indices.length / 3

  return {
    positions: new Float32Array(positions),
    grids: new Float32Array(grids),
    lods: new Float32Array(lods),
    parts: new Float32Array(parts),
    morphOffsets: new Float32Array(morphOffsets),
    indices: new Uint32Array(indices),
    stats: {
      lodCount,
      gridHalfExtent: halfExtent,
      vertexCount,
      triangleCount,
      ringQuadCount,
      trimQuadCount,
      drawCalls: 1,
    },
  }
}

export function verifyClipmapPartition(
  gridHalfExtent: number,
  trimOffsetX: 0 | 1,
  trimOffsetZ: 0 | 1,
): ClipmapPartitionReport {
  const holeHalf = gridHalfExtent / 2
  const counts = new Map<string, number>()

  const mark = (cx: number, cz: number): void => {
    const key = `${cx},${cz}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // 1. Static ring body of LOD l
  for (let cz = -gridHalfExtent; cz < gridHalfExtent; cz += 1) {
    for (let cx = -gridHalfExtent; cx < gridHalfExtent; cx += 1) {
      if (
        cx >= -holeHalf &&
        cx <= holeHalf &&
        cz >= -holeHalf &&
        cz <= holeHalf
      ) {
        continue
      }
      mark(cx, cz)
    }
  }

  // 2. Footprint of finer LOD l-1 expressed in LOD l cells
  for (let cz = -holeHalf + trimOffsetZ; cz < holeHalf + trimOffsetZ; cz += 1) {
    for (
      let cx = -holeHalf + trimOffsetX;
      cx < holeHalf + trimOffsetX;
      cx += 1
    ) {
      mark(cx, cz)
    }
  }

  // 3. Vertical L-trim shifted by trimOffsetX
  const vCol = trimOffsetX === 0 ? holeHalf : -holeHalf
  for (let cz = -holeHalf; cz <= holeHalf; cz += 1) {
    mark(vCol, cz)
  }

  // 4. Horizontal L-trim shifted by (trimOffsetX, trimOffsetZ)
  const hRow = trimOffsetZ === 0 ? holeHalf : -holeHalf
  for (let cx = -holeHalf + trimOffsetX; cx < holeHalf + trimOffsetX; cx += 1) {
    mark(cx, hRow)
  }

  let gapCount = 0
  let overlapCount = 0
  let coveredCellCount = 0

  for (let cz = -gridHalfExtent; cz < gridHalfExtent; cz += 1) {
    for (let cx = -gridHalfExtent; cx < gridHalfExtent; cx += 1) {
      const hits = counts.get(`${cx},${cz}`) ?? 0
      if (hits === 0) {
        gapCount += 1
      } else {
        coveredCellCount += 1
        if (hits > 1) {
          overlapCount += hits - 1
        }
      }
    }
  }

  return {
    coveredCellCount,
    gapCount,
    overlapCount,
  }
}
