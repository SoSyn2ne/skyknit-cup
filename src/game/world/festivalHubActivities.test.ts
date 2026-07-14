import { describe, expect, it } from 'vitest'

import { COIN_PICKUP_RADIUS, getCoinCourse } from '../collectibles/coinCourses'
import { findSweptSphereCollision } from '../collision/obstacleCollision'
import { EXPLORATION_TUNING } from '../exploration/explorationFlight'
import {
  FESTIVAL_HUB_CHALLENGE_BEACON,
  FESTIVAL_HUB_COLLIDERS,
  FESTIVAL_HUB_LANDMARKS,
  FESTIVAL_HUB_LANDING_PADS,
  FESTIVAL_HUB_WIND_ZONES,
  FESTIVAL_WIND_MAX_SPEED,
  createFestivalDiscoveryProgress,
  getFestivalJourney,
  sampleFestivalWind,
  stepFestivalDiscovery,
} from './festivalHubActivities'
import { OPEN_WORLD_REGIONS } from './openWorldRegions'

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

describe('festival hub activity contract', () => {
  it('defines five stable landmarks with exactly one secret place', () => {
    expect(FESTIVAL_HUB_LANDMARKS.map(({ id }) => id)).toEqual([
      'dawnwing-airfield',
      'sunweave-spire',
      'crown-race-arch',
      'wind-loom',
      'whispering-grotto',
    ])
    expect(FESTIVAL_HUB_LANDMARKS.filter(({ secret }) => secret)).toHaveLength(1)
  })

  it('defines three unique wind zones and three unique landing pads', () => {
    expect(new Set(FESTIVAL_HUB_WIND_ZONES.map(({ id }) => id)).size).toBe(3)
    expect(new Set(FESTIVAL_HUB_LANDING_PADS.map(({ id }) => id)).size).toBe(3)
  })

  it('aligns the primary Festival Hub pad with the authored deck surface', () => {
    const festivalPad = FESTIVAL_HUB_LANDING_PADS.find(
      ({ id }) => id === 'festival-hub-pad',
    )
    const regionPad = OPEN_WORLD_REGIONS.find(
      ({ id }) => id === 'festival-hub',
    )?.landingPad

    expect(festivalPad?.position.y).toBe(5.2)
    expect(regionPad).toEqual(festivalPad)
  })

  it('keeps every authored position, radius, and wind vector finite', () => {
    for (const landmark of FESTIVAL_HUB_LANDMARKS) {
      expectFiniteVector(landmark.position)
      expect(landmark.discoveryRadius).toBeGreaterThan(0)
    }
    for (const zone of FESTIVAL_HUB_WIND_ZONES) {
      expectFiniteVector(zone.center)
      expectFiniteVector(zone.velocity)
      expect(zone.radius).toBeGreaterThan(0)
    }
    for (const pad of FESTIVAL_HUB_LANDING_PADS) {
      expectFiniteVector(pad.position)
      expect(pad.radius).toBeGreaterThan(0)
    }
  })

  it('leaves every festival coin center clear of collision proxies', () => {
    for (const coin of getCoinCourse('festival-hub').coins) {
      for (const collider of FESTIVAL_HUB_COLLIDERS) {
        expect(distance(coin.position, collider.center)).toBeGreaterThan(
          collider.radius + COIN_PICKUP_RADIUS,
        )
      }
    }
  })

  it('leaves every landing center clear of collision proxies', () => {
    for (const pad of FESTIVAL_HUB_LANDING_PADS) {
      for (const collider of FESTIVAL_HUB_COLLIDERS) {
        expect(distance(pad.position, collider.center)).toBeGreaterThan(
          collider.radius + 1.2,
        )
      }
    }
  })

  it('keeps every authored coin route segment flyable', () => {
    const coins = getCoinCourse('festival-hub').coins
    for (let index = 1; index < coins.length; index += 1) {
      expect(
        findSweptSphereCollision(
          coins[index - 1].position,
          coins[index].position,
          COIN_PICKUP_RADIUS,
          FESTIVAL_HUB_COLLIDERS,
        ),
      ).toBeNull()
    }
  })

  it('blocks high-speed passes along both loom pylons but keeps the center open', () => {
    for (const [side, x] of [
      ['west', 3],
      ['east', 29],
    ] as const) {
      for (let y = 12; y <= 35; y += 1) {
        const pylonHit = findSweptSphereCollision(
          { x, y, z: -38 },
          { x, y, z: -6 },
          1.2,
          FESTIVAL_HUB_COLLIDERS,
        )

        expect(pylonHit?.obstacleId).toContain(
          `festival-wind-loom-${side}`,
        )
      }
    }

    for (let y = 12; y <= 35; y += 1) {
      expect(
        findSweptSphereCollision(
          { x: 16, y, z: -38 },
          { x: 16, y, z: -6 },
          1.2,
          FESTIVAL_HUB_COLLIDERS,
        ),
      ).toBeNull()
    }
  })

  it('keeps vertical landing approaches and the challenge beacon clear', () => {
    for (const pad of FESTIVAL_HUB_LANDING_PADS) {
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
          FESTIVAL_HUB_COLLIDERS,
        ),
      ).toBeNull()
    }

    expect(
      findSweptSphereCollision(
        FESTIVAL_HUB_CHALLENGE_BEACON.position,
        FESTIVAL_HUB_CHALLENGE_BEACON.position,
        1.2,
        FESTIVAL_HUB_COLLIDERS,
      ),
    ).toBeNull()
  })
})

describe('festival discovery and wind', () => {
  it('discovers a landmark crossed by a high-speed segment', () => {
    const landmark = FESTIVAL_HUB_LANDMARKS[1]
    const result = stepFestivalDiscovery(
      createFestivalDiscoveryProgress(),
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

    expect(result.newLandmarkIds).toEqual([landmark.id])
    expect(result.progress.discoveredLandmarkIds).toContain(landmark.id)
  })

  it('records each landmark and wind zone only once', () => {
    const landmark = FESTIVAL_HUB_LANDMARKS[0]
    const first = stepFestivalDiscovery(
      createFestivalDiscoveryProgress(),
      landmark.position,
      landmark.position,
    )
    const second = stepFestivalDiscovery(
      first.progress,
      landmark.position,
      landmark.position,
    )

    expect(second.newLandmarkIds).toEqual([])
    expect(second.progress.discoveredLandmarkIds).toEqual(
      first.progress.discoveredLandmarkIds,
    )

    const zone = FESTIVAL_HUB_WIND_ZONES[0]
    const windFirst = stepFestivalDiscovery(
      first.progress,
      { x: zone.center.x - zone.radius - 20, y: zone.center.y, z: zone.center.z },
      { x: zone.center.x + zone.radius + 20, y: zone.center.y, z: zone.center.z },
    )
    const windSecond = stepFestivalDiscovery(
      windFirst.progress,
      zone.center,
      zone.center,
    )

    expect(windFirst.newWindZoneIds).toEqual([zone.id])
    expect(windSecond.newWindZoneIds).toEqual([])
    expect(windSecond.progress.traversedWindZoneIds).toEqual([zone.id])
  })

  it('returns no wind outside every authored zone', () => {
    expect(sampleFestivalWind({ x: 1_000, y: 1_000, z: 1_000 })).toEqual({
      velocity: { x: 0, y: 0, z: 0 },
      activeZoneIds: [],
    })
  })

  it('returns bounded nonzero wind at a zone center', () => {
    const sample = sampleFestivalWind(FESTIVAL_HUB_WIND_ZONES[0].center)
    const speed = Math.hypot(
      sample.velocity.x,
      sample.velocity.y,
      sample.velocity.z,
    )

    expect(sample.activeZoneIds).toContain(FESTIVAL_HUB_WIND_ZONES[0].id)
    expect(speed).toBeGreaterThan(0)
    expect(speed).toBeLessThanOrEqual(FESTIVAL_WIND_MAX_SPEED)
  })

  it('derives a completed five-step journey from existing discoveries and records', () => {
    const progress = {
      discoveredLandmarkIds: FESTIVAL_HUB_LANDMARKS.map(({ id }) => id),
      traversedWindZoneIds: FESTIVAL_HUB_WIND_ZONES.map(({ id }) => id),
    }

    expect(getFestivalJourney(progress, 18_000, 150_000)).toEqual({
      completedSteps: 5,
      totalSteps: 5,
      nextObjectiveId: null,
      isComplete: true,
    })
  })
})
