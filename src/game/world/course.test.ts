import { describe, expect, it } from 'vitest'

import { FLIGHT_TUNING } from '../flight/flightModel'
import {
  SKYKNOT_COURSE,
  START_ANCHOR,
  getCourseDistance,
  getCourseSegment,
  getRespawnAnchor,
} from './course'

describe('Skyknot course data', () => {
  it('defines twelve finite, forward-facing checkpoints', () => {
    expect(SKYKNOT_COURSE).toHaveLength(12)

    for (const checkpoint of SKYKNOT_COURSE) {
      const normalLength = Math.hypot(
        checkpoint.normal.x,
        checkpoint.normal.y,
        checkpoint.normal.z,
      )

      expect(Number.isFinite(checkpoint.center.x)).toBe(true)
      expect(Number.isFinite(checkpoint.center.y)).toBe(true)
      expect(Number.isFinite(checkpoint.center.z)).toBe(true)
      expect(normalLength).toBeCloseTo(1)
      expect(checkpoint.radius).toBeGreaterThan(0)
    }
  })

  it('targets a two-to-four minute direct flight before steering losses', () => {
    const directSeconds =
      getCourseDistance(SKYKNOT_COURSE, START_ANCHOR.position) /
      FLIGHT_TUNING.cruiseSpeed

    expect(directSeconds).toBeGreaterThanOrEqual(120)
    expect(directSeconds).toBeLessThanOrEqual(240)
  })

  it('uses the previous checkpoint and active checkpoint as course bounds', () => {
    expect(getCourseSegment(0)).toEqual({
      start: START_ANCHOR.position,
      end: SKYKNOT_COURSE[0]?.center,
    })
    expect(getCourseSegment(4)).toEqual({
      start: SKYKNOT_COURSE[3]?.center,
      end: SKYKNOT_COURSE[4]?.center,
    })
  })

  it('places a respawn past the previous gate and aims at the next gate', () => {
    const previous = SKYKNOT_COURSE[0]
    const next = SKYKNOT_COURSE[1]
    const anchor = getRespawnAnchor(1)

    expect(previous).toBeDefined()
    expect(next).toBeDefined()
    expect(anchor.position.z).toBeLessThan(previous?.center.z ?? 0)

    const expectedHeading = Math.atan2(
      (next?.center.x ?? 0) - (previous?.center.x ?? 0),
      -((next?.center.z ?? 0) - (previous?.center.z ?? 0)),
    )
    expect(anchor.headingRadians).toBeCloseTo(expectedHeading)
  })
})
