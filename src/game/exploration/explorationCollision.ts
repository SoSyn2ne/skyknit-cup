import {
  findSweptSphereCollision,
  type SphereObstacle,
} from '../collision/obstacleCollision'
import type { Vec3Value } from '../flight/flightModel'
import type { ExplorationFlightState } from './explorationFlight'

export interface ExplorationObstacleResolution {
  readonly state: ExplorationFlightState
  readonly obstacleId: string | null
}

function squaredDistance(left: Vec3Value, right: Vec3Value): number {
  const x = left.x - right.x
  const y = left.y - right.y
  const z = left.z - right.z
  return x * x + y * y + z * z
}

function isEscapingObstacle(
  previous: Vec3Value,
  current: Vec3Value,
  movingRadius: number,
  obstacle: SphereObstacle,
): boolean {
  const expandedRadius = obstacle.radius + movingRadius
  const previousDistance = squaredDistance(previous, obstacle.center)
  const currentDistance = squaredDistance(current, obstacle.center)
  const movement = {
    x: current.x - previous.x,
    y: current.y - previous.y,
    z: current.z - previous.z,
  }
  const offset = {
    x: previous.x - obstacle.center.x,
    y: previous.y - obstacle.center.y,
    z: previous.z - obstacle.center.z,
  }
  const outwardMotion =
    offset.x * movement.x +
    offset.y * movement.y +
    offset.z * movement.z
  return (
    previousDistance <= expandedRadius * expandedRadius &&
    currentDistance > previousDistance &&
    (previousDistance <= Number.EPSILON || outwardMotion >= 0)
  )
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

  const blockingObstacles = obstacles.filter(
    (obstacle) =>
      !isEscapingObstacle(
        previousPosition,
        state.flight.position,
        movingRadius,
        obstacle,
      ),
  )
  const hit = findSweptSphereCollision(
    previousPosition,
    state.flight.position,
    movingRadius,
    blockingObstacles,
  )
  if (hit === null) {
    return { state, obstacleId: null }
  }

  return {
    state: {
      ...state,
      flight: {
        ...state.flight,
        position: { ...previousPosition },
        isBoosting: false,
      },
    },
    obstacleId: hit.obstacleId,
  }
}
