import { describe, expect, it } from 'vitest'

import { SKYKNOT_COURSE, START_ANCHOR } from './course'
import { WORLD_ISLANDS, WORLD_OBSTACLES } from './worldLayout'

function distanceToSegment(
  point: { x: number; y: number; z: number },
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
): number {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  }
  const lengthSquared =
    segment.x * segment.x + segment.y * segment.y + segment.z * segment.z
  const offset = {
    x: point.x - start.x,
    y: point.y - start.y,
    z: point.z - start.z,
  }
  const t = Math.min(
    1,
    Math.max(
      0,
      (offset.x * segment.x +
        offset.y * segment.y +
        offset.z * segment.z) /
        lengthSquared,
    ),
  )

  return Math.hypot(
    point.x - (start.x + segment.x * t),
    point.y - (start.y + segment.y * t),
    point.z - (start.z + segment.z * t),
  )
}

describe('floating archipelago layout', () => {
  it('defines a bounded set of project-authored island and collision data', () => {
    expect(WORLD_ISLANDS.length).toBeGreaterThanOrEqual(16)
    expect(WORLD_OBSTACLES.length).toBeGreaterThanOrEqual(6)
    expect(new Set(WORLD_OBSTACLES.map((obstacle) => obstacle.id)).size).toBe(
      WORLD_OBSTACLES.length,
    )

    for (const island of WORLD_ISLANDS) {
      expect(Number.isFinite(island.center.x)).toBe(true)
      expect(Number.isFinite(island.center.y)).toBe(true)
      expect(Number.isFinite(island.center.z)).toBe(true)
      expect(island.radius).toBeGreaterThan(0)
      expect(island.height).toBeGreaterThan(0)
    }
  })

  it('keeps every active gate center outside obstacle volumes', () => {
    for (const checkpoint of SKYKNOT_COURSE) {
      for (const obstacle of WORLD_OBSTACLES) {
        const clearance = Math.hypot(
          checkpoint.center.x - obstacle.center.x,
          checkpoint.center.y - obstacle.center.y,
          checkpoint.center.z - obstacle.center.z,
        )
        expect(clearance).toBeGreaterThan(
          checkpoint.radius + obstacle.radius,
        )
      }
    }
  })

  it('keeps the ideal centerline clear but places reachable side obstacles', () => {
    let previous = START_ANCHOR.position
    let reachableObstacleCount = 0

    for (const checkpoint of SKYKNOT_COURSE) {
      for (const obstacle of WORLD_OBSTACLES) {
        const clearance = distanceToSegment(
          obstacle.center,
          previous,
          checkpoint.center,
        )

        expect(clearance).toBeGreaterThan(obstacle.radius + 2)
        if (clearance < 45) {
          reachableObstacleCount += 1
        }
      }
      previous = checkpoint.center
    }

    expect(reachableObstacleCount).toBeGreaterThanOrEqual(3)
  })
})
