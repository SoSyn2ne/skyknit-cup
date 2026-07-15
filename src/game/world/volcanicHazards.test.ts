import { describe, expect, it } from 'vitest'

import {
  LAVA_WAVE_TELEGRAPH_MS,
  ROCKFALL_TELEGRAPH_MS,
  VOLCANIC_HAZARD_STEP_MS,
  getVolcanicHazardCollisionObstacles,
  sampleVolcanicHazardCollision,
  sampleVolcanicHazards,
} from './volcanicHazards'

describe('volcanic hazard timeline', () => {
  it('meets the readable telegraph minimums', () => {
    expect(ROCKFALL_TELEGRAPH_MS).toBeGreaterThanOrEqual(1_500)
    expect(LAVA_WAVE_TELEGRAPH_MS).toBeGreaterThanOrEqual(2_000)
  })

  it('is deterministic and pause-neutral for the same elapsed time and seed', () => {
    const first = sampleVolcanicHazards(4_321, 80741)
    const replay = sampleVolcanicHazards(4_321, 80741)
    const paused = sampleVolcanicHazards(4_321, 80741)

    expect(replay).toEqual(first)
    expect(paused).toEqual(first)
    expect(sampleVolcanicHazards(4_321, 80742)).not.toEqual(first)
  })

  it('quantizes arbitrary input to the fixed 60 Hz hazard timeline', () => {
    const oneStep = VOLCANIC_HAZARD_STEP_MS
    expect(sampleVolcanicHazards(oneStep + 0.1, 21)).toEqual(
      sampleVolcanicHazards(oneStep + 0.9, 21),
    )
    expect(sampleVolcanicHazards(Number.NaN, 21)).toEqual(
      sampleVolcanicHazards(0, 21),
    )
  })

  it('keeps gameplay state identical across quality and reduced-motion metadata', () => {
    const high = sampleVolcanicHazards(2_200, 73, {
      quality: 'high',
      reducedMotion: false,
    })
    const lowReduced = sampleVolcanicHazards(2_200, 73, {
      quality: 'low',
      reducedMotion: true,
    })

    expect(lowReduced.rockfalls).toEqual(high.rockfalls)
    expect(lowReduced.lavaWave).toEqual(high.lavaWave)
    expect(lowReduced.elapsedMs).toBe(high.elapsedMs)
    expect(lowReduced.visualDensity).not.toEqual(high.visualDensity)
  })

  it('has no collision obstacles during rockfall or lava-wave telegraphs', () => {
    const frame = sampleVolcanicHazards(0, 91)

    expect(frame.rockfalls.some(({ phase }) => phase === 'telegraph')).toBe(true)
    expect(frame.lavaWave.phase).toBe('telegraph')
    expect(getVolcanicHazardCollisionObstacles(frame)).toEqual([])
  })

  it('activates fixed gameplay collision proxies after telegraphs', () => {
    const rockfallFrame = sampleVolcanicHazards(ROCKFALL_TELEGRAPH_MS, 91)
    const lavaFrame = sampleVolcanicHazards(LAVA_WAVE_TELEGRAPH_MS, 91)

    expect(rockfallFrame.rockfalls.some(({ collisionActive }) => collisionActive)).toBe(
      true,
    )
    expect(lavaFrame.lavaWave.collisionActive).toBe(true)
    expect(getVolcanicHazardCollisionObstacles(rockfallFrame).length).toBeGreaterThan(
      0,
    )
    expect(getVolcanicHazardCollisionObstacles(lavaFrame).length).toBeGreaterThan(0)
  })
})

describe('volcanic hazard swept collision contract', () => {
  it('detects a high-speed pass through an active proxy', () => {
    const frame = sampleVolcanicHazards(ROCKFALL_TELEGRAPH_MS, 333)
    const obstacle = getVolcanicHazardCollisionObstacles(frame)[0]
    expect(obstacle).toBeDefined()

    const result = sampleVolcanicHazardCollision(frame, {
      previous: {
        x: obstacle.center.x - obstacle.radius - 30,
        y: obstacle.center.y,
        z: obstacle.center.z,
      },
      current: {
        x: obstacle.center.x + obstacle.radius + 30,
        y: obstacle.center.y,
        z: obstacle.center.z,
      },
      movingRadius: 1.2,
      handledEventKeys: [],
    })

    expect(result.hit?.eventKey).toBe(obstacle.eventKey)
    expect(result.hit?.kind).toBe(obstacle.kind)
    expect(result.hit?.t).toBeGreaterThanOrEqual(0)
    expect(result.hit?.t).toBeLessThanOrEqual(1)
    expect(result.handledEventKeys).toContain(obstacle.eventKey)
  })

  it('reports each active event once while allowing the next cycle', () => {
    const frame = sampleVolcanicHazards(ROCKFALL_TELEGRAPH_MS, 333)
    const obstacle = getVolcanicHazardCollisionObstacles(frame)[0]
    const query = {
      previous: { ...obstacle.center },
      current: { ...obstacle.center },
      movingRadius: 1.2,
      handledEventKeys: [] as readonly string[],
    }
    const first = sampleVolcanicHazardCollision(frame, query)
    const repeated = sampleVolcanicHazardCollision(frame, {
      ...query,
      handledEventKeys: first.handledEventKeys,
    })

    expect(first.hit).not.toBeNull()
    expect(repeated.hit).toBeNull()

    const nextCycleFrame = sampleVolcanicHazards(
      ROCKFALL_TELEGRAPH_MS + 6_000,
      333,
    )
    const nextObstacle = getVolcanicHazardCollisionObstacles(nextCycleFrame)[0]
    const next = sampleVolcanicHazardCollision(nextCycleFrame, {
      previous: { ...nextObstacle.center },
      current: { ...nextObstacle.center },
      movingRadius: 1.2,
      handledEventKeys: first.handledEventKeys,
    })

    expect(nextObstacle.eventKey).not.toBe(obstacle.eventKey)
    expect(next.hit?.eventKey).toBe(nextObstacle.eventKey)
  })
})
