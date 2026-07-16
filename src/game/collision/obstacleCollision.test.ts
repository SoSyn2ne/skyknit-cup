import { describe, expect, it } from 'vitest'

import {
  applyObstacleCollision,
  createCollisionState,
  findSweptSphereCollision,
  resolveEscapeAwareObstacleMovement,
  stepCollisionState,
} from './obstacleCollision'

const obstacles = [
  { id: 'island-1', center: { x: 0, y: 8, z: -20 }, radius: 4 },
]

describe('swept obstacle collision', () => {
  it('detects a high-speed segment crossing an expanded sphere', () => {
    const hit = findSweptSphereCollision(
      { x: 0, y: 8, z: 0 },
      { x: 0, y: 8, z: -50 },
      1,
      obstacles,
    )

    expect(hit).not.toBeNull()
    expect(hit?.obstacleId).toBe('island-1')
    expect(hit?.t).toBeCloseTo(0.3)
  })

  it('returns the earliest collision when multiple obstacles are crossed', () => {
    const hit = findSweptSphereCollision(
      { x: 0, y: 8, z: 0 },
      { x: 0, y: 8, z: -100 },
      1,
      [
        ...obstacles,
        { id: 'island-2', center: { x: 0, y: 8, z: -50 }, radius: 5 },
      ],
    )

    expect(hit?.obstacleId).toBe('island-1')
  })

  it('rejects a segment outside every obstacle radius', () => {
    expect(
      findSweptSphereCollision(
        { x: 7, y: 8, z: 0 },
        { x: 7, y: 8, z: -50 },
        1,
        obstacles,
      ),
    ).toBeNull()
  })

  it('rewinds an inward crossing to the previous safe position', () => {
    const previous = { x: 0, y: 8, z: 0 }
    const current = { x: 0, y: 8, z: -50 }

    const resolved = resolveEscapeAwareObstacleMovement(
      previous,
      current,
      1,
      obstacles,
    )

    expect(resolved.hit?.obstacleId).toBe('island-1')
    expect(resolved.position).toEqual(previous)
    expect(resolved.position).not.toBe(previous)
  })

  it('lets an embedded flight move outward or tangentially to escape', () => {
    const embedded = { x: 0, y: 8, z: -20 }
    const outward = resolveEscapeAwareObstacleMovement(
      embedded,
      { x: 8, y: 8, z: -20 },
      1,
      obstacles,
    )
    const tangential = resolveEscapeAwareObstacleMovement(
      { x: 4, y: 8, z: -20 },
      { x: 4, y: 8, z: -19 },
      1,
      obstacles,
    )

    expect(outward.hit).toBeNull()
    expect(outward.position).toEqual({ x: 8, y: 8, z: -20 })
    expect(tangential.hit).toBeNull()
    expect(tangential.position).toEqual({ x: 4, y: 8, z: -19 })
  })

  it('does not mistake a through-center crossing for escape', () => {
    const previous = { x: 2, y: 8, z: -20 }
    const current = { x: -20, y: 8, z: -20 }

    const resolved = resolveEscapeAwareObstacleMovement(
      previous,
      current,
      1,
      obstacles,
    )

    expect(resolved.hit?.obstacleId).toBe('island-1')
    expect(resolved.position).toEqual(previous)
  })
})

describe('collision response state', () => {
  it('drops speed to 0.45 and starts recovery, cooldown, and feedback', () => {
    const result = applyObstacleCollision(createCollisionState(), 0)

    expect(result.triggered).toBe(true)
    expect(result.state).toEqual({
      speedMultiplier: 0.45,
      recoveryRemainingSeconds: 1.25,
      cooldownRemainingSeconds: 0.75,
      feedbackRemainingSeconds: 0.25,
    })
  })

  it('recovers speed linearly to 1.0 over 1.25 seconds', () => {
    const collided = applyObstacleCollision(createCollisionState(), 0).state
    const halfway = stepCollisionState(collided, 0.625)
    const recovered = stepCollisionState(halfway, 0.625)

    expect(halfway.speedMultiplier).toBeCloseTo(0.725)
    expect(recovered.speedMultiplier).toBe(1)
    expect(recovered.recoveryRemainingSeconds).toBe(0)
  })

  it('ignores repeated collisions during the 0.75 second cooldown', () => {
    const collided = applyObstacleCollision(createCollisionState(), 0).state
    const duringCooldown = stepCollisionState(collided, 0.5)
    const ignored = applyObstacleCollision(duringCooldown, 0)

    expect(ignored.triggered).toBe(false)
    expect(ignored.state).toBe(duringCooldown)
  })

  it('allows a new collision after the cooldown ends', () => {
    const collided = applyObstacleCollision(createCollisionState(), 0).state
    const cooldownEnded = stepCollisionState(collided, 0.75)
    const retriggered = applyObstacleCollision(cooldownEnded, 0)

    expect(retriggered.triggered).toBe(true)
    expect(retriggered.state.speedMultiplier).toBe(0.45)
    expect(retriggered.state.recoveryRemainingSeconds).toBe(1.25)
  })

  it('ignores collisions while respawn immunity remains', () => {
    const initial = createCollisionState()
    const ignored = applyObstacleCollision(initial, 0.01)

    expect(ignored).toEqual({ state: initial, triggered: false })
  })

  it('does not modify checkpoint or timer data', () => {
    const raceProgress = { elapsedMs: 48_000, nextCheckpointIndex: 4 }
    const before = { ...raceProgress }

    applyObstacleCollision(createCollisionState(), 0)

    expect(raceProgress).toEqual(before)
  })
})
