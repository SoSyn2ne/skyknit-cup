import type { Vec3Like } from '../race/checkpoint'

export interface SphereObstacle {
  readonly id: string
  readonly center: Vec3Like
  readonly radius: number
}

export interface ObstacleCollisionHit {
  readonly obstacleId: string
  readonly t: number
  readonly point: Vec3Like
}

export interface CollisionState {
  readonly speedMultiplier: number
  readonly recoveryRemainingSeconds: number
  readonly cooldownRemainingSeconds: number
  readonly feedbackRemainingSeconds: number
}

export interface CollisionApplication {
  readonly state: CollisionState
  readonly triggered: boolean
}

export const COLLISION_TUNING = {
  speedMultiplier: 0.45,
  recoverySeconds: 1.25,
  cooldownSeconds: 0.75,
  feedbackSeconds: 0.25,
} as const

function isFiniteVector(vector: Vec3Like): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  )
}

export function findSweptSphereCollision(
  previous: Vec3Like,
  current: Vec3Like,
  movingRadius: number,
  obstacles: readonly SphereObstacle[],
): ObstacleCollisionHit | null {
  if (
    !isFiniteVector(previous) ||
    !isFiniteVector(current) ||
    !Number.isFinite(movingRadius) ||
    movingRadius < 0
  ) {
    return null
  }

  const direction = {
    x: current.x - previous.x,
    y: current.y - previous.y,
    z: current.z - previous.z,
  }
  const segmentLengthSquared =
    direction.x * direction.x +
    direction.y * direction.y +
    direction.z * direction.z
  let earliest: ObstacleCollisionHit | null = null

  for (const obstacle of obstacles) {
    if (
      !isFiniteVector(obstacle.center) ||
      !Number.isFinite(obstacle.radius) ||
      obstacle.radius < 0
    ) {
      continue
    }

    const expandedRadius = obstacle.radius + movingRadius
    const offset = {
      x: previous.x - obstacle.center.x,
      y: previous.y - obstacle.center.y,
      z: previous.z - obstacle.center.z,
    }
    const c =
      offset.x * offset.x +
      offset.y * offset.y +
      offset.z * offset.z -
      expandedRadius * expandedRadius
    let t: number | null = c <= 0 ? 0 : null

    if (t === null && segmentLengthSquared > Number.EPSILON) {
      const b =
        2 *
        (offset.x * direction.x +
          offset.y * direction.y +
          offset.z * direction.z)
      const discriminant = b * b - 4 * segmentLengthSquared * c

      if (discriminant >= 0) {
        const candidate =
          (-b - Math.sqrt(discriminant)) / (2 * segmentLengthSquared)

        if (candidate >= 0 && candidate <= 1) {
          t = candidate
        }
      }
    }

    if (t === null || (earliest !== null && t >= earliest.t)) {
      continue
    }

    earliest = {
      obstacleId: obstacle.id,
      t,
      point: {
        x: previous.x + direction.x * t,
        y: previous.y + direction.y * t,
        z: previous.z + direction.z * t,
      },
    }
  }

  return earliest
}

export function createCollisionState(): CollisionState {
  return {
    speedMultiplier: 1,
    recoveryRemainingSeconds: 0,
    cooldownRemainingSeconds: 0,
    feedbackRemainingSeconds: 0,
  }
}

export function applyObstacleCollision(
  state: CollisionState,
  respawnImmunitySeconds: number,
): CollisionApplication {
  if (
    state.cooldownRemainingSeconds > 0 ||
    respawnImmunitySeconds > 0
  ) {
    return { state, triggered: false }
  }

  return {
    state: {
      speedMultiplier: COLLISION_TUNING.speedMultiplier,
      recoveryRemainingSeconds: COLLISION_TUNING.recoverySeconds,
      cooldownRemainingSeconds: COLLISION_TUNING.cooldownSeconds,
      feedbackRemainingSeconds: COLLISION_TUNING.feedbackSeconds,
    },
    triggered: true,
  }
}

export function stepCollisionState(
  state: CollisionState,
  dt: number,
): CollisionState {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state
  }

  const recoveryRemainingSeconds = Math.max(
    0,
    state.recoveryRemainingSeconds - dt,
  )
  const recoveryRatio =
    recoveryRemainingSeconds / COLLISION_TUNING.recoverySeconds

  return {
    speedMultiplier:
      1 - (1 - COLLISION_TUNING.speedMultiplier) * recoveryRatio,
    recoveryRemainingSeconds,
    cooldownRemainingSeconds: Math.max(
      0,
      state.cooldownRemainingSeconds - dt,
    ),
    feedbackRemainingSeconds: Math.max(
      0,
      state.feedbackRemainingSeconds - dt,
    ),
  }
}
