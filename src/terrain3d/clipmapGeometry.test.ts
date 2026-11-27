import { describe, expect, it } from 'vitest'

import {
  buildClipmapGeometryData,
  computeClipmapLevelStates,
  computeMorphFactor,
  verifyClipmapPartition,
} from './clipmapGeometry'

describe('clipmapGeometry', () => {
  it('snaps each LOD level to 2 * spacing and keeps trim offsets strictly in {0, 1}', () => {
    const sampleCoords: readonly [number, number][] = [
      [0, 0],
      [0.1, -0.1],
      [-0.01, -0.01],
      [15.9, -37.3],
      [-128.4, 255.9],
      [511.5, -511.5],
      [1024.75, -999.25],
    ]

    for (const [camX, camZ] of sampleCoords) {
      const levels = computeClipmapLevelStates(camX, camZ, 1, 5)
      expect(levels).toHaveLength(5)

      for (let lod = 0; lod < levels.length; lod += 1) {
        const current = levels[lod]
        const expectedSpacing = 2 ** lod
        expect(current.spacing).toBe(expectedSpacing)

        // Origin must be an exact even multiple of spacing (i.e. multiple of 2 * spacing)
        expect(Math.abs(current.originX % (2 * expectedSpacing))).toBe(0)
        expect(Math.abs(current.originZ % (2 * expectedSpacing))).toBe(0)

        // Trim offsets are strictly 0 or 1
        expect(current.trimOffsetX === 0 || current.trimOffsetX === 1).toBe(true)
        expect(current.trimOffsetZ === 0 || current.trimOffsetZ === 1).toBe(true)

        if (lod > 0) {
          const finer = levels[lod - 1]
          const deltaX = (finer.originX - current.originX) / current.spacing
          const deltaZ = (finer.originZ - current.originZ) / current.spacing
          expect(deltaX).toBe(current.trimOffsetX)
          expect(deltaZ).toBe(current.trimOffsetZ)
        }
      }
    }
  })

  it('builds a single-draw-call clipmap buffer with exact ring and L-trim geometry counts', () => {
    const data = buildClipmapGeometryData({
      gridHalfExtent: 32,
      lodCount: 5,
    })

    // LOD 0: 64*64 = 4096 quads
    // Each ring l >= 1: (64*64) - (33*33) = 4096 - 1089 = 3007 ring quads
    // Each L-trim l >= 1: vertical (33) + horizontal (32) = 65 trim quads
    const expectedRingQuads = 4096 + 4 * 3007
    const expectedTrimQuads = 4 * (33 + 32)
    const expectedTriangles = (expectedRingQuads + expectedTrimQuads) * 2

    expect(data.stats.drawCalls).toBe(1)
    expect(data.stats.ringQuadCount).toBe(expectedRingQuads)
    expect(data.stats.trimQuadCount).toBe(expectedTrimQuads)
    expect(data.stats.triangleCount).toBe(expectedTriangles)
    expect(data.indices.length).toBe(expectedTriangles * 3)
    expect(data.grids.length).toBe(data.stats.vertexCount * 2)
    expect(data.lods.length).toBe(data.stats.vertexCount)
    expect(data.parts.length).toBe(data.stats.vertexCount)
    expect(data.morphOffsets.length).toBe(data.stats.vertexCount * 2)
  })

  it('partitions every LOD transition with zero gaps and zero overlapping cells for all 4 trim states', () => {
    const offsets: readonly (0 | 1)[] = [0, 1]
    for (const trimOffsetX of offsets) {
      for (const trimOffsetZ of offsets) {
        const result = verifyClipmapPartition(16, trimOffsetX, trimOffsetZ)
        expect(result.gapCount).toBe(0)
        expect(result.overlapCount).toBe(0)
        expect(result.coveredCellCount).toBe(32 * 32)
      }
    }
  })

  it('morphs outer-boundary vertices onto exact coarse LOD lattice points with zero T-junctions', () => {
    const halfExtent = 16
    const morphStart = 0.72
    const levels = computeClipmapLevelStates(23.7, -41.2, 1, 3)

    // Verify every vertex on the outer edge of LOD 0 snaps onto an exact integer LOD 1 grid vertex
    const lod0 = levels[0]
    const lod1 = levels[1]

    for (let ix = -halfExtent; ix <= halfExtent; ix += 1) {
      for (let iz = -halfExtent; iz <= halfExtent; iz += 1) {
        const onOuterEdge =
          Math.abs(ix) === halfExtent || Math.abs(iz) === halfExtent
        const m = computeMorphFactor(ix, iz, halfExtent, morphStart, 0, 3)

        if (onOuterEdge) {
          expect(m).toBe(1)
          const morphedGridX = ix - m * (ix & 1)
          const morphedGridZ = iz - m * (iz & 1)
          const worldX = lod0.originX + morphedGridX * lod0.spacing
          const worldZ = lod0.originZ + morphedGridZ * lod0.spacing

          const coarseLocalX = (worldX - lod1.originX) / lod1.spacing
          const coarseLocalZ = (worldZ - lod1.originZ) / lod1.spacing

          expect(Number.isInteger(coarseLocalX)).toBe(true)
          expect(Number.isInteger(coarseLocalZ)).toBe(true)
        } else if (Math.max(Math.abs(ix), Math.abs(iz)) <= halfExtent / 2 + 1) {
          expect(m).toBe(0)
        }
      }
    }

    // Outermost LOD never morphs because there is no coarser ring outside it
    expect(computeMorphFactor(halfExtent, 0, halfExtent, morphStart, 2, 3)).toBe(0)
  })
})
