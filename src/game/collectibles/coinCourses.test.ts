import { describe, expect, it } from 'vitest'

import { OPEN_WORLD_REGIONS } from '../world/openWorldRegions'
import {
  COINS_PER_COURSE,
  COIN_COURSES,
  getCoinCourse,
} from './coinCourses'

describe('regional sky-coin course data', () => {
  it('defines exactly ten uniquely identified coins for every region', () => {
    expect(COIN_COURSES).toHaveLength(OPEN_WORLD_REGIONS.length)
    expect(COIN_COURSES.map((course) => course.regionId)).toEqual(
      OPEN_WORLD_REGIONS.map((region) => region.id),
    )

    for (const course of COIN_COURSES) {
      expect(course.coins).toHaveLength(COINS_PER_COURSE)
      expect(new Set(course.coins.map((coin) => coin.id)).size).toBe(
        COINS_PER_COURSE,
      )
      expect(course.coins.map((coin) => coin.index)).toEqual(
        Array.from({ length: COINS_PER_COURSE }, (_, index) => index),
      )
    }
  })

  it('keeps finite positive pickups inside their region and off the landing pad', () => {
    for (const course of COIN_COURSES) {
      const region = OPEN_WORLD_REGIONS.find(
        (candidate) => candidate.id === course.regionId,
      )
      expect(region).toBeDefined()

      for (const coin of course.coins) {
        expect(Number.isFinite(coin.position.x)).toBe(true)
        expect(Number.isFinite(coin.position.y)).toBe(true)
        expect(Number.isFinite(coin.position.z)).toBe(true)
        expect(coin.radius).toBeGreaterThan(0)
        expect(
          Math.hypot(
            coin.position.x - (region?.center.x ?? 0),
            coin.position.z - (region?.center.z ?? 0),
          ),
        ).toBeLessThanOrEqual(140)
        expect(
          Math.hypot(
            coin.position.x - (region?.landingPad.position.x ?? 0),
            coin.position.z - (region?.landingPad.position.z ?? 0),
          ),
        ).toBeGreaterThan((region?.landingPad.radius ?? 0) + coin.radius)
      }
    }
  })

  it('uses ten cooling crystals for the volcanic route without changing existing coin visuals', () => {
    expect(
      COIN_COURSES.filter(
        (course) => course.regionId !== 'volcanic-archipelago',
      ).every((course) => course.visualKind === 'sky-coin'),
    ).toBe(true)

    const volcanicCourse = getCoinCourse('volcanic-archipelago')
    expect(volcanicCourse.visualKind).toBe('cooling-crystal')
    expect(volcanicCourse.coins).toHaveLength(COINS_PER_COURSE)
    expect(
      new Set(
        volcanicCourse.coins.map(
          (coin) => `${coin.position.x}:${coin.position.y}:${coin.position.z}`,
        ),
      ).size,
    ).toBe(COINS_PER_COURSE)
  })
})
