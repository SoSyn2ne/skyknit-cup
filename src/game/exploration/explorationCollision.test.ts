import { describe, expect, it } from 'vitest'

import type { SphereObstacle } from '../collision/obstacleCollision'
import { createExplorationFlightState } from './explorationFlight'
import { resolveExplorationObstacleCollision } from './explorationCollision'

const OBSTACLE: SphereObstacle = {
  id: 'festival-spire',
  center: { x: 0, y: 18, z: -20 },
  radius: 5,
}

describe('exploration obstacle collision', () => {
  it('blocks a high-speed crossing and cancels boost at the last safe position', () => {
    const previous = { x: -20, y: 18, z: -20 }
    const next = createExplorationFlightState({
      position: { x: 20, y: 18, z: -20 },
      speed: 30,
      isBoosting: true,
    })

    const resolved = resolveExplorationObstacleCollision(
      next,
      previous,
      1.2,
      [OBSTACLE],
    )

    expect(resolved.obstacleId).toBe(OBSTACLE.id)
    expect(resolved.state.flight.position).toEqual(previous)
    expect(resolved.state.flight.speed).toBe(next.flight.speed)
    expect(resolved.state.flight.isBoosting).toBe(false)

    const repeated = resolveExplorationObstacleCollision(
      resolved.state,
      previous,
      1.2,
      [OBSTACLE],
    )
    expect(repeated.state.flight.speed).toBe(next.flight.speed)
  })

  it('returns the original state when the movement is clear', () => {
    const previous = { x: -20, y: 40, z: -20 }
    const next = createExplorationFlightState({
      position: { x: 20, y: 40, z: -20 },
      speed: 18,
    })

    const resolved = resolveExplorationObstacleCollision(
      next,
      previous,
      1.2,
      [OBSTACLE],
    )

    expect(resolved).toEqual({ state: next, obstacleId: null })
    expect(resolved.state).toBe(next)
  })

  it('allows a restored save inside a new collider to fly outward', () => {
    const previous = { ...OBSTACLE.center }
    const next = createExplorationFlightState({
      position: { x: 20, y: 18, z: -20 },
      speed: 18,
    })

    const resolved = resolveExplorationObstacleCollision(
      next,
      previous,
      1.2,
      [OBSTACLE],
    )

    expect(resolved).toEqual({ state: next, obstacleId: null })
  })

  it('does not treat an inward crossing as escape just because its endpoint is farther away', () => {
    const previous = { x: 2, y: 18, z: -20 }
    const next = createExplorationFlightState({
      position: { x: -20, y: 18, z: -20 },
      speed: 18,
    })

    const resolved = resolveExplorationObstacleCollision(
      next,
      previous,
      1.2,
      [OBSTACLE],
    )

    expect(resolved.obstacleId).toBe(OBSTACLE.id)
    expect(resolved.state.flight.position).toEqual(previous)
  })
})
