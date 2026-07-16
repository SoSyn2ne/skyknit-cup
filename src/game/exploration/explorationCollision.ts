import {
  resolveEscapeAwareObstacleMovement,
  type SphereObstacle,
} from '../collision/obstacleCollision'
import type { Vec3Value } from '../flight/flightModel'
import type { ExplorationFlightState } from './explorationFlight'

export interface ExplorationObstacleResolution {
  readonly state: ExplorationFlightState
  readonly obstacleId: string | null
}

export function resolveExplorationObstacleCollision(
  state: ExplorationFlightState,
  previousPosition: Vec3Value,
  movingRadius: number,
  obstacles: readonly SphereObstacle[],
): ExplorationObstacleResolution {
  if (state.movement !== 'airborne') {
    return { state, obstacleId: null }
  }

  const resolved = resolveEscapeAwareObstacleMovement(
    previousPosition,
    state.flight.position,
    movingRadius,
    obstacles,
  )
  if (resolved.hit === null) {
    return { state, obstacleId: null }
  }

  return {
    state: {
      ...state,
      flight: {
        ...state.flight,
        position: { ...resolved.position },
        isBoosting: false,
      },
    },
    obstacleId: resolved.hit.obstacleId,
  }
}
