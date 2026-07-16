import { describe, expect, it } from 'vitest'

import { FIXED_STEP_SECONDS } from './fixedStep'
import {
  FLIGHT_TUNING,
  applyExternalVelocity,
  createInitialFlightState,
  getForwardVector,
  getVisualPitchRadians,
  stepFlight,
  type FlightInput,
  type FlightState,
} from './flightModel'

const NEUTRAL_INPUT: FlightInput = { pitch: 0, yaw: 0, boost: false }

function runSteps(
  initial: FlightState,
  input: FlightInput,
  count: number,
): FlightState {
  let state = initial

  for (let index = 0; index < count; index += 1) {
    state = stepFlight(state, input, FIXED_STEP_SECONDS)
  }

  return state
}

describe('flight model', () => {
  it('auto-forwards 24 world units in one neutral second', () => {
    const initial = createInitialFlightState()
    const state = runSteps(initial, NEUTRAL_INPUT, 60)

    expect(state.position.x).toBeCloseTo(0, 10)
    expect(state.position.y).toBeCloseTo(0, 10)
    expect(state.position.z).toBeCloseTo(-24, 10)
    expect(state.distanceTravelled).toBeCloseTo(24, 10)
    expect(state.speed).toBeCloseTo(24, 10)
    expect(state.boostRemaining).toBe(100)
    expect(initial.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('follows positive pitch upward and applies the climb speed penalty', () => {
    const state = runSteps(
      createInitialFlightState(),
      { pitch: 1, yaw: 0, boost: false },
      60,
    )
    const expectedPitch =
      FLIGHT_TUNING.maxMovementPitchRadians * (1 - Math.exp(-8))

    expect(state.pitchRadians).toBeCloseTo(expectedPitch, 10)
    expect(state.position.y).toBeGreaterThan(0)
    expect(state.speed).toBeLessThan(FLIGHT_TUNING.cruiseSpeed)
    expect(getVisualPitchRadians(state)).toBeGreaterThan(0)
    expect(getVisualPitchRadians(state)).toBeLessThanOrEqual(
      FLIGHT_TUNING.maxVisualPitchRadians,
    )
  })

  it('dives downward and applies the dive speed bonus', () => {
    const state = runSteps(
      createInitialFlightState(),
      { pitch: -1, yaw: 0, boost: false },
      60,
    )

    expect(state.pitchRadians).toBeLessThan(0)
    expect(state.position.y).toBeLessThan(0)
    expect(state.speed).toBeGreaterThan(FLIGHT_TUNING.cruiseSpeed)
    expect(getVisualPitchRadians(state)).toBeLessThan(0)
  })

  it('turns right with positive yaw and banks right visually', () => {
    const state = runSteps(
      createInitialFlightState(),
      { pitch: 0, yaw: 1, boost: false },
      60,
    )
    const expectedBank =
      -FLIGHT_TUNING.maxBankRadians * (1 - Math.exp(-10))

    expect(state.headingRadians).toBeCloseTo(1.4, 10)
    expect(state.bankRadians).toBeCloseTo(expectedBank, 10)
    expect(state.position.x).toBeGreaterThan(0)
    expect(getForwardVector(state).x).toBeGreaterThan(0)
  })

  it('keeps bank out of the movement direction', () => {
    const leftBank = createInitialFlightState({
      headingRadians: 0.5,
      pitchRadians: 0.2,
      bankRadians: -0.45,
    })
    const rightBank = createInitialFlightState({
      headingRadians: 0.5,
      pitchRadians: 0.2,
      bankRadians: 0.45,
    })

    expect(getForwardVector(leftBank)).toEqual(getForwardVector(rightBank))

    const nextLeft = stepFlight(leftBank, NEUTRAL_INPUT)
    const nextRight = stepFlight(rightBank, NEUTRAL_INPUT)
    expect(nextLeft.position).toEqual(nextRight.position)
  })

  it('drains 40 boost and multiplies speed by 1.6 for one second', () => {
    const state = runSteps(
      createInitialFlightState(),
      { pitch: 0, yaw: 0, boost: true },
      60,
    )

    expect(state.boostRemaining).toBeCloseTo(60, 10)
    expect(state.speed).toBeCloseTo(38.4, 10)
    expect(state.distanceTravelled).toBeCloseTo(38.4, 10)
    expect(state.isBoosting).toBe(true)
  })

  it('exhausts boost without going negative and stays empty while held', () => {
    const heldBoost = { pitch: 0, yaw: 0, boost: true }
    const exhausted = runSteps(createInitialFlightState(), heldBoost, 151)
    const stillHeld = runSteps(exhausted, heldBoost, 30)

    expect(exhausted.boostRemaining).toBe(0)
    expect(exhausted.isBoosting).toBe(false)
    expect(exhausted.speed).toBeCloseTo(24, 10)
    expect(stillHeld.boostRemaining).toBe(0)
    expect(stillHeld.boostRechargeDelaySeconds).toBeCloseTo(0.5, 10)
  })

  it('waits half a second after release before recharging boost', () => {
    const empty = createInitialFlightState({
      boostRemaining: 0,
      boostRechargeDelaySeconds: 0.5,
    })
    const afterDelay = runSteps(empty, NEUTRAL_INPUT, 30)
    const firstRechargeStep = stepFlight(afterDelay, NEUTRAL_INPUT)

    expect(afterDelay.boostRemaining).toBe(0)
    expect(afterDelay.boostRechargeDelaySeconds).toBeCloseTo(0, 10)
    expect(firstRechargeStep.boostRemaining).toBeCloseTo(1 / 3, 10)
  })

  it('never recharges above the boost capacity', () => {
    const almostFull = createInitialFlightState({
      boostRemaining: 99.9,
      boostRechargeDelaySeconds: 0,
    })
    const state = runSteps(almostFull, NEUTRAL_INPUT, 60)

    expect(state.boostRemaining).toBe(100)
  })

  it('clamps oversized and non-finite inputs', () => {
    const initial = createInitialFlightState()
    const clamped = stepFlight(initial, { pitch: 1, yaw: -1, boost: false })
    const oversized = stepFlight(initial, {
      pitch: 5,
      yaw: -4,
      boost: false,
    })
    const invalid = stepFlight(initial, {
      pitch: Number.NaN,
      yaw: Number.POSITIVE_INFINITY,
      boost: false,
    })
    const neutral = stepFlight(initial, NEUTRAL_INPUT)

    expect(oversized).toEqual(clamped)
    expect(invalid).toEqual(neutral)
  })
})

describe('external speed multiplier', () => {
  it('applies obstacle slowdown to speed and travelled distance', () => {
    const state = createInitialFlightState()
    const slowed = stepFlight(
      state,
      { pitch: 0, yaw: 0, boost: false },
      1,
      0.45,
    )

    expect(slowed.speed).toBeCloseTo(FLIGHT_TUNING.cruiseSpeed * 0.45)
    expect(slowed.distanceTravelled).toBeCloseTo(
      FLIGHT_TUNING.cruiseSpeed * 0.45,
    )
  })

  it('clamps invalid external multipliers to the safe zero-to-one range', () => {
    const state = createInitialFlightState()
    const negative = stepFlight(
      state,
      { pitch: 0, yaw: 0, boost: false },
      1,
      -2,
    )
    const excessive = stepFlight(
      state,
      { pitch: 0, yaw: 0, boost: false },
      1,
      5,
    )

    expect(negative.speed).toBe(0)
    expect(excessive.speed).toBe(FLIGHT_TUNING.cruiseSpeed)
  })
})

describe('external environmental velocity', () => {
  it('moves every guardian equally without changing flight balance state', () => {
    const state = createInitialFlightState({
      position: { x: 2, y: 4, z: 6 },
      speed: 31,
      boostRemaining: 72,
      distanceTravelled: 180,
    })
    const lifted = applyExternalVelocity(
      state,
      { x: -2, y: 12, z: 4 },
      0.5,
    )

    expect(lifted.position).toEqual({ x: 1, y: 10, z: 8 })
    expect(lifted.speed).toBe(state.speed)
    expect(lifted.boostRemaining).toBe(state.boostRemaining)
    expect(lifted.distanceTravelled).toBe(state.distanceTravelled)
    expect(state.position).toEqual({ x: 2, y: 4, z: 6 })
  })

  it('ignores invalid timing and velocity components', () => {
    const state = createInitialFlightState()

    expect(
      applyExternalVelocity(state, { x: 1, y: 2, z: 3 }, 0),
    ).toBe(state)
    expect(
      applyExternalVelocity(state, { x: 0, y: 0, z: 0 }, FIXED_STEP_SECONDS),
    ).toBe(state)
    expect(
      applyExternalVelocity(
        state,
        { x: 1, y: Number.NaN, z: 3 },
        FIXED_STEP_SECONDS,
      ),
    ).toBe(state)
  })
})
