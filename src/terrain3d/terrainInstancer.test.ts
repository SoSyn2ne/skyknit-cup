import { describe, expect, it } from 'vitest'

import {
  applyBrushStroke,
  createTerrainRegionData,
  sampleHeightBilinear,
  sampleNormal,
} from './heightmapData'
import {
  generateTerrainScatter,
  getPresetLandmarks,
  getPresetScatterRules,
  resnapScatterPlacements,
} from './terrainInstancer'
import type { TerrainPresetId } from './terrainTypes'

describe('terrainInstancer', () => {
  it('scatters deterministic biome props strictly within elevation, slope, hole, and clearing rules', () => {
    const region = createTerrainRegionData('sky-highlands', 128, 768)
    // Punch a hole at (-60, 40) to ensure props never spawn inside holes
    applyBrushStroke(
      region,
      { mode: 'hole', radius: 32, strength: 1, paintSlot: 0, eraseHole: false },
      -60,
      40,
      1,
    )

    const rules = getPresetScatterRules('sky-highlands')
    const landmarks = getPresetLandmarks('sky-highlands')
    const first = generateTerrainScatter(region, rules, landmarks, 1)
    const second = generateTerrainScatter(region, rules, landmarks, 1)

    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(80)

    const ruleById = new Map(rules.map((r) => [r.assetId, r]))

    for (const item of first) {
      const rule = ruleById.get(item.assetId)!
      expect(rule).toBeDefined()

      const surfaceY = sampleHeightBilinear(region, item.x, item.z, 1)
      const normal = sampleNormal(region, item.x, item.z, 1)
      const slope = 1 - normal.y

      // Must satisfy elevation and slope rules
      expect(surfaceY).toBeGreaterThanOrEqual(rule.minHeight)
      expect(surfaceY).toBeLessThanOrEqual(rule.maxHeight)
      expect(slope).toBeLessThanOrEqual(rule.maxSlope)

      // Must stay outside landmark clearings
      for (const lm of landmarks) {
        const dist = Math.hypot(item.x - lm.x, item.z - lm.z)
        expect(dist).toBeGreaterThanOrEqual(lm.clearRadius)
      }

      // Must not sit inside the punched terrain hole
      expect(Math.hypot(item.x - -60, item.z - 40)).toBeGreaterThan(16)
    }
  })

  it('produces distinct biome rosters and landmark placements for all 3 presets', () => {
    const presets: readonly TerrainPresetId[] = [
      'sky-highlands',
      'wind-canyon',
      'volcanic-caldera',
    ]
    const signatures = new Set<string>()

    for (const preset of presets) {
      const rules = getPresetScatterRules(preset)
      const landmarks = getPresetLandmarks(preset)
      expect(rules.length).toBeGreaterThanOrEqual(3)
      expect(landmarks.length).toBeGreaterThanOrEqual(2)
      signatures.add(rules.map((r) => r.assetId).join(','))
    }

    expect(signatures.size).toBe(3)
  })

  it('resnaps placements smoothly when terrain is sculpted or heightScale changes and hides holes', () => {
    const region = createTerrainRegionData('sky-highlands', 64, 512)
    const rules = getPresetScatterRules('sky-highlands')
    const landmarks = getPresetLandmarks('sky-highlands')
    const placements = generateTerrainScatter(region, rules, landmarks, 1)
    expect(placements.length).toBeGreaterThan(20)

    const target = placements[0]
    const initialY = target.y

    // Scale terrain height to 1.5x -> placement Y must track new height
    const scaled = resnapScatterPlacements(region, placements, 1.5)
    const scaledTarget = scaled.find(
      (p) => p.x === target.x && p.z === target.z && p.assetId === target.assetId,
    )
    expect(scaledTarget).toBeDefined()
    expect(scaledTarget!.y).toBeGreaterThan(initialY + 1)

    // Punch a hole directly under target -> target is filtered out cleanly
    applyBrushStroke(
      region,
      { mode: 'hole', radius: 24, strength: 1, paintSlot: 0, eraseHole: false },
      target.x,
      target.z,
      1,
    )
    const afterHole = resnapScatterPlacements(region, placements, 1)
    const missing = afterHole.find(
      (p) => p.x === target.x && p.z === target.z && p.assetId === target.assetId,
    )
    expect(missing).toBeUndefined()
  })
})
