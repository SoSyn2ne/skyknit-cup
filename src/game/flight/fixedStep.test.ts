import { describe, expect, it } from 'vitest'

import {
  FIXED_STEP_SECONDS,
  MAX_ACCUMULATED_DELTA_SECONDS,
  consumeFixedSteps,
  createFixedStepClock,
  type FixedStepClock,
} from './fixedStep'
import {
  createInitialFlightState,
  getForwardVector,
  stepFlight,
  type FlightInput,
  type FlightState,
} from './flightModel'

interface CadenceResult {
  readonly clock: FixedStepClock
  readonly flight: FlightState
  readonly hostFrames: number
  readonly maxStepsPerFrame: number
}

function inputForStep(stepIndex: number): FlightInput {
  if (stepIndex < 120) {
    return { pitch: 0, yaw: 0, boost: false }
  }
  if (stepIndex < 240) {
    return { pitch: 0, yaw: 0.75, boost: false }
  }
  if (stepIndex < 360) {
    return { pitch: 0.5, yaw: 0, boost: false }
  }
  if (stepIndex < 480) {
    return { pitch: 0, yaw: 0, boost: true }
  }
  return { pitch: -0.5, yaw: -0.5, boost: false }
}

function runCadence(pattern: readonly number[]): CadenceResult {
  let clock = createFixedStepClock()
  let flight = createInitialFlightState()
  let wallSeconds = 0
  let hostFrames = 0
  let maxStepsPerFrame = 0

  while (wallSeconds < 10 - 1e-12) {
    const patternDelta = pattern[hostFrames % pattern.length] ?? 0
    const frameDelta = Math.min(patternDelta, 10 - wallSeconds)
    const consumed = consumeFixedSteps(clock, frameDelta)

    for (let offset = 0; offset < consumed.steps; offset += 1) {
      flight = stepFlight(
        flight,
        inputForStep(consumed.firstStepIndex + offset),
        FIXED_STEP_SECONDS,
      )
    }

    clock = consumed.clock
    wallSeconds += frameDelta
    hostFrames += 1
    maxStepsPerFrame = Math.max(maxStepsPerFrame, consumed.steps)
  }

  return { clock, flight, hostFrames, maxStepsPerFrame }
}

function angleBetween(left: FlightState, right: FlightState): number {
  const leftForward = getForwardVector(left)
  const rightForward = getForwardVector(right)
  const dot =
    leftForward.x * rightForward.x +
    leftForward.y * rightForward.y +
    leftForward.z * rightForward.z

  return Math.acos(Math.min(1, Math.max(-1, dot)))
}

describe('fixed step clock', () => {
  it('limits a one-second host hitch to six simulation steps', () => {
    const consumed = consumeFixedSteps(createFixedStepClock(), 1)

    expect(consumed.steps).toBe(6)
    expect(consumed.clock.totalSteps).toBe(6)
    expect(consumed.clock.accumulatorSeconds).toBeCloseTo(0, 12)
    expect(consumed.alpha).toBeCloseTo(0, 12)
  })

  it('caps the accumulated delta including a prior remainder', () => {
    const first = consumeFixedSteps(createFixedStepClock(), 0.015)
    const second = consumeFixedSteps(first.clock, 1)

    expect(first.steps).toBe(0)
    expect(first.clock.accumulatorSeconds).toBeCloseTo(0.015, 12)
    expect(second.steps).toBe(6)
    expect(second.clock.accumulatorSeconds).toBeCloseTo(0, 12)
  })

  it('ignores negative and non-finite frame deltas', () => {
    const initial = createFixedStepClock()

    for (const delta of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const consumed = consumeFixedSteps(initial, delta)
      expect(consumed.steps).toBe(0)
      expect(consumed.clock).toEqual(initial)
    }
  })

  it('preserves sub-step frame time until a full step is available', () => {
    const first = consumeFixedSteps(createFixedStepClock(), 1 / 120)
    const second = consumeFixedSteps(first.clock, 1 / 120)

    expect(first.steps).toBe(0)
    expect(second.steps).toBe(1)
    expect(second.clock.accumulatorSeconds).toBeCloseTo(0, 12)
  })
})

describe('cadence determinism', () => {
  const scenarios = [
    { name: '30fps', pattern: [1 / 30], expectedFrames: 300 },
    { name: '60fps', pattern: [1 / 60], expectedFrames: 600 },
    { name: '120fps', pattern: [1 / 120], expectedFrames: 1_200 },
    {
      name: 'jitter',
      pattern: [1 / 20, 1 / 120, 1 / 45, 1 / 90],
      expectedFrames: 437,
    },
  ] as const
  const baseline = runCadence([1 / 60])

  it('locks the ten-second baseline contract', () => {
    expect(baseline.clock.totalSteps).toBe(600)
    expect(baseline.clock.accumulatorSeconds).toBeCloseTo(0, 12)
    expect(baseline.flight.headingRadians).toBeCloseTo(0.7, 10)
    expect(baseline.flight.boostRemaining).toBeCloseTo(50, 9)
  })

  it.each(scenarios)(
    'keeps $name within the movement, boost, and heading tolerances',
    ({ pattern, expectedFrames }) => {
      const result = runCadence(pattern)
      const distanceError =
        Math.abs(
          result.flight.distanceTravelled - baseline.flight.distanceTravelled,
        ) / baseline.flight.distanceTravelled
      const boostError = Math.abs(
        result.flight.boostRemaining - baseline.flight.boostRemaining,
      )
      const headingErrorDegrees =
        (angleBetween(result.flight, baseline.flight) * 180) / Math.PI

      expect(result.hostFrames).toBe(expectedFrames)
      expect(result.clock.totalSteps).toBe(600)
      expect(result.clock.accumulatorSeconds).toBeCloseTo(0, 12)
      expect(distanceError).toBeLessThanOrEqual(0.02)
      expect(boostError).toBeLessThanOrEqual(2)
      expect(headingErrorDegrees).toBeLessThanOrEqual(1)
      expect(result.flight.distanceTravelled).toBeCloseTo(
        baseline.flight.distanceTravelled,
        9,
      )
    },
  )

  it('never consumes more than the accumulated delta budget', () => {
    expect(runCadence([MAX_ACCUMULATED_DELTA_SECONDS]).maxStepsPerFrame).toBe(
      6,
    )
  })
})
