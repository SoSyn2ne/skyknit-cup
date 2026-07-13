import { describe, expect, it } from 'vitest'

import {
  OPEN_WORLD_REGIONS,
  getCurrentRegion,
  getDestinationGuidance,
  getDiscoveredRegionIds,
  getLoadedRegionIds,
} from './openWorldRegions'

describe('small open-world regions', () => {
  it('defines three distinct regions with landing pads', () => {
    expect(OPEN_WORLD_REGIONS.map((region) => region.id)).toEqual([
      'festival-hub',
      'wind-canyon',
      'cloud-ruins',
    ])
    expect(new Set(OPEN_WORLD_REGIONS.map((region) => region.visualTheme)).size).toBe(3)
    expect(OPEN_WORLD_REGIONS.every((region) => region.landingPad.radius >= 18)).toBe(true)
    expect(
      OPEN_WORLD_REGIONS.find((region) => region.id === 'cloud-ruins')
        ?.landingPad.position.y,
    ).toBeGreaterThan(22)
  })

  it('loads nearby regions and keeps loaded regions until the unload radius', () => {
    expect(getLoadedRegionIds({ x: 0, y: 8, z: -40 }, [])).toEqual([
      'festival-hub',
    ])

    expect(
      getLoadedRegionIds(
        { x: 0, y: 8, z: 440 },
        ['festival-hub'],
      ),
    ).toEqual(['festival-hub'])
    expect(
      getLoadedRegionIds(
        { x: 0, y: 8, z: 470 },
        ['festival-hub'],
      ),
    ).toEqual([])
  })

  it('discovers a region once and preserves existing discoveries', () => {
    expect(
      getDiscoveredRegionIds(
        { x: 495, y: 24, z: -675 },
        ['festival-hub'],
      ),
    ).toEqual(['festival-hub', 'wind-canyon'])
    expect(
      getDiscoveredRegionIds(
        { x: 495, y: 24, z: -675 },
        ['festival-hub', 'wind-canyon'],
      ),
    ).toEqual(['festival-hub', 'wind-canyon'])
  })

  it('returns the closest region as the current region', () => {
    expect(getCurrentRegion({ x: 420, y: 30, z: 170 })?.id).toBe(
      'cloud-ruins',
    )
  })

  it('reports destination distance and signed relative bearing', () => {
    const north = getDestinationGuidance(
      { x: 0, y: 8, z: -40 },
      0,
      'wind-canyon',
    )
    expect(north?.distance).toBeCloseTo(812.16, 1)
    expect(north?.relativeBearingRadians).toBeGreaterThan(0)

    const facingDestination = getDestinationGuidance(
      { x: 0, y: 8, z: -40 },
      north?.absoluteBearingRadians ?? 0,
      'wind-canyon',
    )
    expect(facingDestination?.relativeBearingRadians).toBeCloseTo(0)
    expect(getDestinationGuidance({ x: 0, y: 0, z: 0 }, 0, null)).toBeNull()
  })
})
