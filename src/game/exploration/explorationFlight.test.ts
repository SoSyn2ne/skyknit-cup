import { describe, expect, it } from 'vitest'

import {
  createExplorationFlightState,
  requestLanding,
  requestTakeoff,
  stepExplorationFlight,
  type ExplorationLandingPad,
} from './explorationFlight'

const PAD: ExplorationLandingPad = {
  id: 'festival-pad',
  position: { x: 0, y: 4, z: -20 },
  radius: 18,
}

describe('exploration flight', () => {
  it('brakes to a hover without reversing and resumes cruise', () => {
    let state = createExplorationFlightState({
      position: { x: 0, y: 18, z: 0 },
      speed: 18,
    })

    for (let frame = 0; frame < 60; frame += 1) {
      state = stepExplorationFlight(
        state,
        { pitch: 0, yaw: 0, boost: false, brake: true },
        1 / 60,
        [PAD],
      )
    }

    expect(state.flight.speed).toBe(0)
    const stoppedZ = state.flight.position.z
    state = stepExplorationFlight(
      state,
      { pitch: 0, yaw: 0, boost: false, brake: false },
      0.5,
      [PAD],
    )
    expect(state.flight.speed).toBeGreaterThan(0)
    expect(state.flight.position.z).toBeLessThan(stoppedZ)
  })

  it('turns freely while moving and preserves race boost capacity rules', () => {
    const initial = createExplorationFlightState({
      position: { x: 0, y: 18, z: 0 },
      speed: 18,
    })
    const turned = stepExplorationFlight(
      initial,
      { pitch: 0.4, yaw: 1, boost: true, brake: false },
      0.5,
      [PAD],
    )

    expect(turned.flight.headingRadians).toBeGreaterThan(0)
    expect(turned.flight.pitchRadians).toBeGreaterThan(0)
    expect(turned.flight.speed).toBeGreaterThan(18)
    expect(turned.flight.speed).toBeLessThanOrEqual(30)
    expect(turned.flight.boostRemaining).toBeLessThan(
      initial.flight.boostRemaining,
    )
  })

  it('adds authored wind velocity only while freely airborne', () => {
    const initial = createExplorationFlightState({
      position: { x: 0, y: 18, z: 0 },
      speed: 18,
    })
    const input = { pitch: 0, yaw: 0, boost: false, brake: false }
    const calm = stepExplorationFlight(initial, input, 0.5, [PAD])
    const windy = stepExplorationFlight(initial, input, 0.5, [PAD], {
      windVelocity: { x: 6, y: 4, z: -2 },
    })

    expect(windy.flight.position.x - calm.flight.position.x).toBeCloseTo(3)
    expect(windy.flight.position.y - calm.flight.position.y).toBeCloseTo(2)
    expect(windy.flight.position.z - calm.flight.position.z).toBeCloseTo(-1)
    expect(windy.flight.distanceTravelled).toBe(calm.flight.distanceTravelled)
  })

  it.each(['landing', 'landed', 'taking-off'] as const)(
    'does not let wind displace the dragon while %s',
    (movement) => {
      const base = createExplorationFlightState({
        position: { x: 0, y: 10, z: -20 },
        speed: 3,
      })
      const state = {
        ...base,
        movement,
        landingPadId: PAD.id,
        movementStart: { ...base.flight.position },
      }
      const calm = stepExplorationFlight(
        state,
        { pitch: 0, yaw: 0, boost: false, brake: false },
        0.2,
        [PAD],
      )
      const windy = stepExplorationFlight(
        state,
        { pitch: 0, yaw: 0, boost: false, brake: false },
        0.2,
        [PAD],
        { windVelocity: { x: 100, y: 100, z: 100 } },
      )

      expect(windy).toEqual(calm)
    },
  )

  it('applies collision recovery as an optional speed multiplier', () => {
    const initial = createExplorationFlightState({
      position: { x: 0, y: 18, z: 0 },
      speed: 18,
    })
    const input = { pitch: 0, yaw: 0, boost: false, brake: false }
    const calm = stepExplorationFlight(initial, input, 0.5, [PAD])
    const slowed = stepExplorationFlight(initial, input, 0.5, [PAD], {
      speedMultiplier: 0.45,
    })

    expect(slowed.flight.speed).toBeLessThan(calm.flight.speed)
    expect(slowed.flight.distanceTravelled).toBeLessThan(
      calm.flight.distanceTravelled,
    )
  })

  it('rejects landing outside the pad radius or altitude window', () => {
    const far = createExplorationFlightState({
      position: { x: 50, y: 10, z: -20 },
      speed: 4,
    })
    const high = createExplorationFlightState({
      position: { x: 0, y: 20, z: -20 },
      speed: 4,
    })

    expect(requestLanding(far, [PAD])).toBe(far)
    expect(requestLanding(high, [PAD])).toBe(high)
  })

  it('lands, remains still, and takes off from a valid pad', () => {
    let state = createExplorationFlightState({
      position: { x: 4, y: 10, z: -18 },
      speed: 3,
    })
    state = requestLanding(state, [PAD])
    expect(state.movement).toBe('landing')

    state = stepExplorationFlight(
      state,
      { pitch: 0, yaw: 0, boost: false, brake: false },
      0.9,
      [PAD],
    )
    expect(state.movement).toBe('landed')
    expect(state.flight.speed).toBe(0)
    expect(state.flight.position).toEqual({ x: 0, y: 5.2, z: -20 })

    const landed = state
    state = stepExplorationFlight(
      state,
      { pitch: 1, yaw: 1, boost: true, brake: false },
      0.5,
      [PAD],
    )
    expect(state.flight.position).toEqual(landed.flight.position)

    state = requestTakeoff(state, [PAD])
    expect(state.movement).toBe('taking-off')
    state = stepExplorationFlight(
      state,
      { pitch: 0, yaw: 0, boost: false, brake: false },
      0.7,
      [PAD],
    )
    expect(state.movement).toBe('airborne')
    expect(state.flight.position.y).toBe(14)
    expect(state.flight.speed).toBe(8)
  })

  it('does not advance flight or landing while paused', () => {
    const state = requestLanding(
      createExplorationFlightState({
        position: { x: 0, y: 10, z: -20 },
        speed: 3,
      }),
      [PAD],
    )

    expect(
      stepExplorationFlight(
        state,
        { pitch: 1, yaw: 1, boost: true, brake: false },
        0,
        [PAD],
      ),
    ).toBe(state)
  })
})
