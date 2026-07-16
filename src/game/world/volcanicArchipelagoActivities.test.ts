import { describe, expect, it } from 'vitest'

import { findSweptSphereCollision } from '../collision/obstacleCollision'
import { EXPLORATION_TUNING } from '../exploration/explorationFlight'
import {
  VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON,
  VOLCANIC_ARCHIPELAGO_COLLIDERS,
  VOLCANIC_ARCHIPELAGO_CENTER,
  VOLCANIC_ARCHIPELAGO_LANDING_PADS,
  VOLCANIC_ARCHIPELAGO_LANDMARKS,
  VOLCANIC_ARCHIPELAGO_THERMAL_ZONES,
  VOLCANIC_THERMAL_MAX_SPEED,
  createVolcanicDiscoveryProgress,
  sampleVolcanicThermalWind,
  stepVolcanicDiscovery,
} from './volcanicArchipelagoActivities'

function distance(
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

function expectFiniteVector(vector: {
  readonly x: number
  readonly y: number
  readonly z: number
}): void {
  expect(Number.isFinite(vector.x)).toBe(true)
  expect(Number.isFinite(vector.y)).toBe(true)
  expect(Number.isFinite(vector.z)).toBe(true)
}

describe('volcanic archipelago activity contract', () => {
  it('defines stable landmarks with one hidden route', () => {
    expect(VOLCANIC_ARCHIPELAGO_LANDMARKS.map(({ id }) => id)).toEqual([
      'emberwatch-landing',
      'obsidian-causeway',
      'cooling-ruins',
      'sunheart-caldera',
      'eruption-escape-arch',
      'hidden-magma-tube',
    ])
    expect(
      VOLCANIC_ARCHIPELAGO_LANDMARKS.filter(({ secret }) => secret),
    ).toHaveLength(1)
  })

  it('defines exactly three unique thermal zones and three landing pads', () => {
    expect(
      new Set(VOLCANIC_ARCHIPELAGO_THERMAL_ZONES.map(({ id }) => id)).size,
    ).toBe(3)
    expect(new Set(VOLCANIC_ARCHIPELAGO_LANDING_PADS.map(({ id }) => id)).size).toBe(
      3,
    )
  })

  it('keeps authored coordinates, radii, velocities, and colliders finite', () => {
    for (const landmark of VOLCANIC_ARCHIPELAGO_LANDMARKS) {
      expectFiniteVector(landmark.position)
      expect(landmark.discoveryRadius).toBeGreaterThan(0)
    }
    for (const zone of VOLCANIC_ARCHIPELAGO_THERMAL_ZONES) {
      expectFiniteVector(zone.center)
      expectFiniteVector(zone.velocity)
      expect(zone.radius).toBeGreaterThan(0)
    }
    for (const pad of VOLCANIC_ARCHIPELAGO_LANDING_PADS) {
      expectFiniteVector(pad.position)
      expect(pad.radius).toBeGreaterThan(0)
    }
    for (const collider of VOLCANIC_ARCHIPELAGO_COLLIDERS) {
      expectFiniteVector(collider.center)
      expect(collider.radius).toBeGreaterThan(0)
    }
  })

  it('leaves landing centers, vertical approaches, and the challenge beacon clear', () => {
    expect(
      Math.hypot(
        VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position.x -
          VOLCANIC_ARCHIPELAGO_CENTER.x,
        VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position.z -
          VOLCANIC_ARCHIPELAGO_CENTER.z,
      ),
    ).toBeGreaterThanOrEqual(90)

    for (const pad of VOLCANIC_ARCHIPELAGO_LANDING_PADS) {
      expect(
        Math.hypot(
          pad.position.x - VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position.x,
          pad.position.z - VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position.z,
        ),
      ).toBeGreaterThan(VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.radius + 1.2)
      for (const collider of VOLCANIC_ARCHIPELAGO_COLLIDERS) {
        expect(distance(pad.position, collider.center)).toBeGreaterThan(
          collider.radius + 1.2,
        )
      }
      expect(
        findSweptSphereCollision(
          {
            ...pad.position,
            y: pad.position.y + EXPLORATION_TUNING.landingHeightWindow,
          },
          {
            ...pad.position,
            y: pad.position.y + EXPLORATION_TUNING.landedHeight,
          },
          1.2,
          VOLCANIC_ARCHIPELAGO_COLLIDERS,
        ),
      ).toBeNull()
    }

    expect(
      findSweptSphereCollision(
        VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position,
        VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position,
        1.2,
        VOLCANIC_ARCHIPELAGO_COLLIDERS,
      ),
    ).toBeNull()
  })

  it('guards the solid caldera bowl and rim while leaving the south route open', () => {
    expect(VOLCANIC_ARCHIPELAGO_COLLIDERS.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'volcanic-caldera-lower-bowl',
        'volcanic-caldera-west',
        'volcanic-caldera-east',
        'volcanic-caldera-north',
      ]),
    )

    expect(
      findSweptSphereCollision(
        VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON.position,
        { x: -240, y: 42, z: -796 },
        1.2,
        VOLCANIC_ARCHIPELAGO_COLLIDERS,
      ),
    ).toBeNull()

    expect(
      findSweptSphereCollision(
        { x: -259, y: 36, z: -792 },
        { x: -259, y: 36, z: -858 },
        1.2,
        VOLCANIC_ARCHIPELAGO_COLLIDERS,
      )?.obstacleId,
    ).toBe('volcanic-caldera-west')
  })
})

describe('volcanic discovery and thermal wind', () => {
  it('discovers landmarks and thermal zones crossed between fixed steps', () => {
    const landmark = VOLCANIC_ARCHIPELAGO_LANDMARKS[2]
    const landmarkStep = stepVolcanicDiscovery(
      createVolcanicDiscoveryProgress(),
      {
        x: landmark.position.x - landmark.discoveryRadius - 20,
        y: landmark.position.y,
        z: landmark.position.z,
      },
      {
        x: landmark.position.x + landmark.discoveryRadius + 20,
        y: landmark.position.y,
        z: landmark.position.z,
      },
    )
    expect(landmarkStep.newLandmarkIds).toEqual([landmark.id])

    const zone = VOLCANIC_ARCHIPELAGO_THERMAL_ZONES[0]
    const thermalStep = stepVolcanicDiscovery(
      landmarkStep.progress,
      { x: zone.center.x - zone.radius - 20, y: zone.center.y, z: zone.center.z },
      { x: zone.center.x + zone.radius + 20, y: zone.center.y, z: zone.center.z },
    )
    expect(thermalStep.newThermalZoneIds).toEqual([zone.id])
  })

  it('normalizes invalid IDs and reports every discovery only once', () => {
    const landmark = VOLCANIC_ARCHIPELAGO_LANDMARKS[0]
    const initial = createVolcanicDiscoveryProgress({
      discoveredLandmarkIds: [landmark.id, landmark.id, 'unknown' as never],
      traversedThermalZoneIds: ['unknown' as never],
    })
    expect(initial).toEqual({
      discoveredLandmarkIds: [landmark.id],
      traversedThermalZoneIds: [],
    })

    const repeated = stepVolcanicDiscovery(
      initial,
      landmark.position,
      landmark.position,
    )
    expect(repeated.newLandmarkIds).toEqual([])
    expect(repeated.progress).toEqual(initial)
  })

  it('returns no wind outside the region and bounded lift inside a thermal', () => {
    expect(sampleVolcanicThermalWind({ x: 1_000, y: 1_000, z: 1_000 })).toEqual({
      velocity: { x: 0, y: 0, z: 0 },
      activeZoneIds: [],
    })

    const zone = VOLCANIC_ARCHIPELAGO_THERMAL_ZONES[0]
    const sample = sampleVolcanicThermalWind(zone.center)
    const speed = Math.hypot(
      sample.velocity.x,
      sample.velocity.y,
      sample.velocity.z,
    )
    expect(sample.activeZoneIds).toContain(zone.id)
    expect(sample.velocity.y).toBeGreaterThan(0)
    expect(speed).toBeGreaterThan(0)
    expect(speed).toBeLessThanOrEqual(VOLCANIC_THERMAL_MAX_SPEED)
  })
})
