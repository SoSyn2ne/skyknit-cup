import { describe, expect, it } from 'vitest'

import { createInitialFlightState } from '../flight/flightModel'
import {
  beginRespawn,
  stepOutOfBounds,
  stepRespawnImmunity,
} from './raceRuntime'

const segmentStart = { x: 0, y: 8, z: 0 }
const segmentEnd = { x: 0, y: 8, z: -100 }

describe('automatic out-of-bounds tracking', () => {
  it('respawns only after low altitude persists for 1.5 seconds', () => {
    const almost = stepOutOfBounds(
      { outsideDurationSeconds: 0 },
      { x: 0, y: -12.01, z: -20 },
      segmentStart,
      segmentEnd,
      1.49,
    )
    expect(almost.shouldRespawn).toBe(false)

    const elapsed = stepOutOfBounds(
      almost,
      { x: 0, y: -12.01, z: -21 },
      segmentStart,
      segmentEnd,
      0.01,
    )
    expect(elapsed.shouldRespawn).toBe(true)
  })

  it('treats more than 65 units from the active segment as outside', () => {
    const state = stepOutOfBounds(
      { outsideDurationSeconds: 0 },
      { x: 65.01, y: 8, z: -50 },
      segmentStart,
      segmentEnd,
      1.5,
    )

    expect(state.shouldRespawn).toBe(true)
  })

  it('resets the timer after returning inside the course bounds', () => {
    const outside = stepOutOfBounds(
      { outsideDurationSeconds: 0 },
      { x: 80, y: 8, z: -50 },
      segmentStart,
      segmentEnd,
      1,
    )
    const recovered = stepOutOfBounds(
      outside,
      { x: 10, y: 8, z: -50 },
      segmentStart,
      segmentEnd,
      0.25,
    )

    expect(recovered).toEqual({
      outsideDurationSeconds: 0,
      shouldRespawn: false,
    })
  })
})

describe('respawn state', () => {
  it('moves to the safe anchor while preserving boost and distance', () => {
    const flight = createInitialFlightState({
      position: { x: 75, y: -20, z: -50 },
      headingRadians: 1.2,
      pitchRadians: 0.2,
      bankRadians: -0.3,
      boostRemaining: 37,
      distanceTravelled: 480,
      isBoosting: true,
    })
    const respawned = beginRespawn(flight, {
      position: { x: 2, y: 11, z: -18 },
      headingRadians: -0.4,
    })

    expect(respawned.flight).toMatchObject({
      position: { x: 2, y: 11, z: -18 },
      pitchRadians: 0,
      bankRadians: 0,
      boostRemaining: 37,
      distanceTravelled: 480,
      isBoosting: false,
    })
    expect(respawned.flight.headingRadians).toBeCloseTo(-0.4)
    expect(respawned.immunityRemainingSeconds).toBe(1)
    expect(respawned.outsideDurationSeconds).toBe(0)
  })

  it('counts respawn immunity down without going below zero', () => {
    expect(stepRespawnImmunity(1, 0.4)).toBeCloseTo(0.6)
    expect(stepRespawnImmunity(0.25, 1)).toBe(0)
  })
})
