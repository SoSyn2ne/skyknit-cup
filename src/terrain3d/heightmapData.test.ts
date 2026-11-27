import { describe, expect, it } from 'vitest'

import {
  applyBrushStroke,
  createTerrainRegionData,
  packControlPixel,
  raycastHeightmap,
  sampleHeightBilinear,
  sampleNormal,
  unpackControlPixel,
} from './heightmapData'
import type { ControlPixel, TerrainPresetId } from './terrainTypes'

describe('heightmapData', () => {
  it('packs and unpacks Terrain3D 32-bit control pixels losslessly', () => {
    const samples: readonly ControlPixel[] = [
      { baseId: 0, overlayId: 1, blend: 0, autoShader: true, hole: false, macroTint: 128 },
      { baseId: 3, overlayId: 4, blend: 255, autoShader: false, hole: false, macroTint: 255 },
      { baseId: 2, overlayId: 0, blend: 137, autoShader: false, hole: true, macroTint: 19 },
      { baseId: 4, overlayId: 3, blend: 64, autoShader: true, hole: true, macroTint: 0 },
    ]

    const buffer = new Uint8Array(samples.length * 4)
    samples.forEach((pixel, index) => {
      packControlPixel(buffer, index * 4, pixel)
      expect(unpackControlPixel(buffer, index * 4)).toEqual(pixel)
    })
  })

  it('generates deterministic, finite, distinct terrains for all 3 presets', () => {
    const presets: readonly TerrainPresetId[] = [
      'sky-highlands',
      'wind-canyon',
      'volcanic-caldera',
    ]
    const stats: Record<string, { min: number; max: number; center: number }> = {}

    for (const preset of presets) {
      const a = createTerrainRegionData(preset, 128, 512)
      const b = createTerrainRegionData(preset, 128, 512)

      expect(a.heights).toEqual(b.heights)
      expect(a.control).toEqual(b.control)

      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < a.heights.length; i += 1) {
        const h = a.heights[i]
        expect(Number.isFinite(h)).toBe(true)
        if (h < min) min = h
        if (h > max) max = h
      }

      // Every preset must have significant vertical relief (> 25 world units)
      expect(max - min).toBeGreaterThan(25)
      stats[preset] = {
        min,
        max,
        center: sampleHeightBilinear(a, 0, 0),
      }
    }

    // Presets must produce noticeably different heightfields
    expect(stats['sky-highlands'].center).not.toBeCloseTo(
      stats['volcanic-caldera'].center,
      1,
    )
    expect(stats['wind-canyon'].max).not.toBeCloseTo(
      stats['volcanic-caldera'].max,
      1,
    )
  })

  it('samples exact bilinear heights and accurate unit surface normals', () => {
    const region = createTerrainRegionData('sky-highlands', 16, 160)
    // Replace with a clean analytical tilted plane: h(x, z) = 0.5 * x + 10
    const step = region.worldSize / (region.resolution - 1)
    for (let iz = 0; iz < region.resolution; iz += 1) {
      for (let ix = 0; ix < region.resolution; ix += 1) {
        const wx = -region.worldSize / 2 + ix * step
        region.heights[iz * region.resolution + ix] = 0.5 * wx + 10
      }
    }

    expect(sampleHeightBilinear(region, 0, 0)).toBeCloseTo(10, 4)
    expect(sampleHeightBilinear(region, 20, -15)).toBeCloseTo(20, 4)
    expect(sampleHeightBilinear(region, -12.5, 7.25)).toBeCloseTo(3.75, 4)

    const normal = sampleNormal(region, 0, 0)
    const length = Math.hypot(normal.x, normal.y, normal.z)
    expect(length).toBeCloseTo(1, 4)
    // Plane y = 0.5x + 10 -> normal proportional to (-0.5, 1, 0)
    const expectedLen = Math.hypot(-0.5, 1, 0)
    expect(normal.x).toBeCloseTo(-0.5 / expectedLen, 3)
    expect(normal.y).toBeCloseTo(1 / expectedLen, 3)
    expect(normal.z).toBeCloseTo(0, 3)
  })

  it('supports Terrain3D sculpt, paint, autoshader-restore, and hole brush strokes', () => {
    const region = createTerrainRegionData('sky-highlands', 64, 256)
    region.heights.fill(10)

    const raiseDirty = applyBrushStroke(
      region,
      { mode: 'raise', radius: 24, strength: 18, paintSlot: 1 },
      0,
      0,
      0.5,
    )
    expect(raiseDirty).not.toBeNull()
    const peak = sampleHeightBilinear(region, 0, 0)
    expect(peak).toBeGreaterThan(14)
    // Far outside brush radius remains untouched
    expect(sampleHeightBilinear(region, 80, 80)).toBeCloseTo(10, 5)

    // Lower brings center back down
    applyBrushStroke(
      region,
      { mode: 'lower', radius: 24, strength: 18, paintSlot: 1 },
      0,
      0,
      0.5,
    )
    expect(sampleHeightBilinear(region, 0, 0)).toBeLessThan(peak)

    // Flatten pulls heights toward target elevation
    applyBrushStroke(
      region,
      { mode: 'flatten', radius: 24, strength: 8, paintSlot: 1, flattenHeight: 25 },
      0,
      0,
      1.0,
    )
    expect(sampleHeightBilinear(region, 0, 0)).toBeGreaterThan(18)

    // Smooth reduces sharp spikes
    const centerIdx = 32 * 64 + 32
    region.heights[centerIdx] = 60
    applyBrushStroke(
      region,
      { mode: 'smooth', radius: 18, strength: 4, paintSlot: 1 },
      0,
      0,
      0.5,
    )
    expect(region.heights[centerIdx]).toBeLessThan(58)

    // Manual paint clears autoShader bit and sets overlay slot
    applyBrushStroke(
      region,
      { mode: 'paint', radius: 16, strength: 1, paintSlot: 4 },
      0,
      0,
      1,
    )
    const painted = unpackControlPixel(region.control, centerIdx * 4)
    expect(painted.autoShader).toBe(false)
    expect(painted.overlayId).toBe(4)
    expect(painted.blend).toBeGreaterThan(120)

    // Autoshader brush restores autoShader bit
    applyBrushStroke(
      region,
      { mode: 'autoshader', radius: 16, strength: 1, paintSlot: 1 },
      0,
      0,
      1,
    )
    expect(unpackControlPixel(region.control, centerIdx * 4).autoShader).toBe(true)

    // Hole brush punches hole and eraseHole restores solid ground
    applyBrushStroke(
      region,
      { mode: 'hole', radius: 12, strength: 1, paintSlot: 1, eraseHole: false },
      0,
      0,
      1,
    )
    expect(unpackControlPixel(region.control, centerIdx * 4).hole).toBe(true)

    applyBrushStroke(
      region,
      { mode: 'hole', radius: 12, strength: 1, paintSlot: 1, eraseHole: true },
      0,
      0,
      1,
    )
    expect(unpackControlPixel(region.control, centerIdx * 4).hole).toBe(false)
  })

  it('raycasts onto terrain heightmap accurately and rejects skyward rays', () => {
    const region = createTerrainRegionData('sky-highlands', 64, 256)
    region.heights.fill(15)

    const hit = raycastHeightmap(
      region,
      { x: 12, y: 80, z: -18 },
      { x: 0, y: -1, z: 0 },
      1,
      400,
    )
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(12, 2)
    expect(hit!.y).toBeCloseTo(15, 2)
    expect(hit!.z).toBeCloseTo(-18, 2)
    expect(hit!.distance).toBeCloseTo(65, 2)

    const miss = raycastHeightmap(
      region,
      { x: 0, y: 80, z: 0 },
      { x: 0, y: 1, z: 0 },
      1,
      400,
    )
    expect(miss).toBeNull()
  })
})
