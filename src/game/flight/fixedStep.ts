export const FIXED_STEP_SECONDS = 1 / 60
export const MAX_ACCUMULATED_DELTA_SECONDS = 0.1

const STEP_EPSILON = 1e-9

export interface FixedStepClock {
  readonly accumulatorSeconds: number
  readonly totalSteps: number
}

export interface FixedStepConsumption {
  readonly clock: FixedStepClock
  readonly steps: number
  readonly firstStepIndex: number
  readonly alpha: number
}

export function createFixedStepClock(): FixedStepClock {
  return {
    accumulatorSeconds: 0,
    totalSteps: 0,
  }
}

export function consumeFixedSteps(
  clock: FixedStepClock,
  rawDeltaSeconds: number,
): FixedStepConsumption {
  const frameDeltaSeconds =
    Number.isFinite(rawDeltaSeconds) && rawDeltaSeconds > 0
      ? Math.min(rawDeltaSeconds, MAX_ACCUMULATED_DELTA_SECONDS)
      : 0
  const accumulatedSeconds = Math.min(
    MAX_ACCUMULATED_DELTA_SECONDS,
    clock.accumulatorSeconds + frameDeltaSeconds,
  )
  const stepCredit = accumulatedSeconds / FIXED_STEP_SECONDS
  const steps = Math.floor(stepCredit + STEP_EPSILON)
  const rawRemainder = accumulatedSeconds - steps * FIXED_STEP_SECONDS
  const accumulatorSeconds =
    Math.abs(rawRemainder) <= STEP_EPSILON ? 0 : Math.max(0, rawRemainder)

  return {
    clock: {
      accumulatorSeconds,
      totalSteps: clock.totalSteps + steps,
    },
    steps,
    firstStepIndex: clock.totalSteps,
    alpha: accumulatorSeconds / FIXED_STEP_SECONDS,
  }
}
