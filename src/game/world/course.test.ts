import { describe, expect, it } from 'vitest'

import { FLIGHT_TUNING } from '../flight/flightModel'
import {
  RACE_COURSE_CATALOG,
  RACE_COURSE_IDS,
  SKYKNOT_COURSE,
  SKYKNOT_COURSE_DEFINITION,
  START_ANCHOR,
  VOLCANIC_ARCHIPELAGO_COURSE,
  VOLCANIC_ARCHIPELAGO_COURSE_DEFINITION,
  VOLCANIC_START_ANCHOR,
  getCourseDistance,
  getCourseDefinition,
  getCourseSegment,
  getRespawnAnchor,
} from './course'

describe('Skyknot course data', () => {
  it('defines eight finite, forward-facing checkpoints', () => {
    expect(SKYKNOT_COURSE).toHaveLength(8)

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

  it('targets a shortened 75-to-135 second direct flight before steering losses', () => {
    const directSeconds =
      getCourseDistance(SKYKNOT_COURSE, START_ANCHOR.position) /
      FLIGHT_TUNING.cruiseSpeed

    expect(directSeconds).toBeGreaterThanOrEqual(75)
    expect(directSeconds).toBeLessThanOrEqual(135)
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

describe('race course catalog', () => {
  it('keeps the original Skyknot course as the default catalog entry', () => {
    expect(RACE_COURSE_IDS).toEqual([
      'skyknot',
      'volcanic-archipelago',
    ])
    expect(RACE_COURSE_CATALOG.skyknot).toBe(
      SKYKNOT_COURSE_DEFINITION,
    )
    expect(getCourseDefinition('skyknot').checkpoints).toBe(
      SKYKNOT_COURSE,
    )
    expect(SKYKNOT_COURSE.every((checkpoint) => checkpoint.kind === 'gate')).toBe(
      true,
    )
  })

  it('defines three cooling seals followed by one eruption escape', () => {
    expect(RACE_COURSE_CATALOG['volcanic-archipelago']).toBe(
      VOLCANIC_ARCHIPELAGO_COURSE_DEFINITION,
    )
    expect(VOLCANIC_ARCHIPELAGO_COURSE).toHaveLength(4)
    expect(
      VOLCANIC_ARCHIPELAGO_COURSE.map((checkpoint) => checkpoint.kind),
    ).toEqual(['cooling-seal', 'cooling-seal', 'cooling-seal', 'escape'])
    expect(
      VOLCANIC_ARCHIPELAGO_COURSE.map((checkpoint) => checkpoint.id),
    ).toEqual(['cooling-seal-01', 'cooling-seal-02', 'cooling-seal-03', 'eruption-escape'])

    for (const checkpoint of VOLCANIC_ARCHIPELAGO_COURSE) {
      expect(Math.abs(checkpoint.center.x - -240)).toBeLessThanOrEqual(180)
      expect(Math.abs(checkpoint.center.z - -820)).toBeLessThanOrEqual(180)
      expect(Math.hypot(
        checkpoint.normal.x,
        checkpoint.normal.y,
        checkpoint.normal.z,
      )).toBeCloseTo(1)
    }
  })

  it('resolves segments and respawns against the requested course', () => {
    expect(getCourseSegment('volcanic-archipelago', 0)).toEqual({
      start: VOLCANIC_START_ANCHOR.position,
      end: VOLCANIC_ARCHIPELAGO_COURSE[0]?.center,
    })
    expect(
      getCourseSegment(VOLCANIC_ARCHIPELAGO_COURSE_DEFINITION, 2),
    ).toEqual({
      start: VOLCANIC_ARCHIPELAGO_COURSE[1]?.center,
      end: VOLCANIC_ARCHIPELAGO_COURSE[2]?.center,
    })

    const volcanicRespawn = getRespawnAnchor('volcanic-archipelago', 1)
    expect(volcanicRespawn.position).not.toEqual(
      getRespawnAnchor('skyknot', 1).position,
    )
    expect(Number.isFinite(volcanicRespawn.headingRadians)).toBe(true)
  })

  it('rejects an out-of-range checkpoint on either course', () => {
    expect(() => getCourseSegment('skyknot', SKYKNOT_COURSE.length)).toThrow(
      RangeError,
    )
    expect(() =>
      getCourseSegment(
        'volcanic-archipelago',
        VOLCANIC_ARCHIPELAGO_COURSE.length,
      ),
    ).toThrow(RangeError)
  })
})
