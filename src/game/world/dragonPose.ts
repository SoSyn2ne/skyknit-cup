export interface DragonPoseInput {
  readonly bankRadians: number
  readonly pitchRadians: number
  readonly isBoosting: boolean
  readonly collisionFeedbackSeconds: number
  readonly animationSeconds: number
}

export interface DragonPoseState {
  readonly shoulderBankRadians: number
  readonly bodyBankRadians: number
  readonly headPitchRadians: number
  readonly wingFoldRadians: number
  readonly wingFlapRadians: number
  readonly tailYawRadians: readonly number[]
  readonly recoilRadians: number
  readonly breathScale: number
  readonly blinkAmount: number
  readonly jawOpenRadians: number
}

const TAIL_FOLLOW_RATES = [7, 5.5, 4, 3, 2] as const

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function didWingDownstrokeStart(
  previousWingFlapRadians: number,
  currentWingFlapRadians: number,
): boolean {
  return (
    Number.isFinite(previousWingFlapRadians) &&
    Number.isFinite(currentWingFlapRadians) &&
    previousWingFlapRadians <= 0 &&
    currentWingFlapRadians > 0
  )
}

function follow(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export function createDragonPoseState(): DragonPoseState {
  return {
    shoulderBankRadians: 0,
    bodyBankRadians: 0,
    headPitchRadians: 0,
    wingFoldRadians: 0,
    wingFlapRadians: 0,
    tailYawRadians: TAIL_FOLLOW_RATES.map(() => 0),
    recoilRadians: 0,
    breathScale: 1,
    blinkAmount: 0,
    jawOpenRadians: 0,
  }
}

export function stepDragonPose(
  state: DragonPoseState,
  input: DragonPoseInput,
  dt: number,
): DragonPoseState {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state
  }

  const shoulderBankRadians = finiteOrZero(input.bankRadians)
  const bodyBankRadians = follow(
    state.bodyBankRadians,
    shoulderBankRadians,
    5,
    dt,
  )
  const headPitchRadians = follow(
    state.headPitchRadians,
    finiteOrZero(input.pitchRadians) * 0.35,
    7,
    dt,
  )
  const wingFoldRadians = follow(
    state.wingFoldRadians,
    input.isBoosting ? 0.68 : 0.04,
    10,
    dt,
  )
  const tailYawRadians: number[] = []
  let target = -shoulderBankRadians * 0.72

  for (const [index, rate] of TAIL_FOLLOW_RATES.entries()) {
    const value = follow(
      state.tailYawRadians[index] ?? 0,
      target,
      rate,
      dt,
    )
    tailYawRadians.push(value)
    target = value
  }

  const recoilRadians = follow(
    state.recoilRadians,
    input.collisionFeedbackSeconds > 0 ? -0.24 : 0,
    18,
    dt,
  )
  const animationSeconds = Math.max(0, finiteOrZero(input.animationSeconds))
  const flapFrequency = input.isBoosting ? 3.4 : 2.2
  const flapAmplitude = input.isBoosting ? 0.12 : 0.28
  const wingFlapRadians =
    Math.sin(animationSeconds * Math.PI * 2 * flapFrequency) * flapAmplitude
  const breathScale =
    1 + Math.sin(animationSeconds * Math.PI * 2 * 0.55) * 0.008
  const blinkPhase = animationSeconds % 4.6
  const blinkProgress = (blinkPhase - 3.7) / 0.12
  const timedBlink =
    blinkProgress >= 0 && blinkProgress <= 1
      ? Math.sin(blinkProgress * Math.PI)
      : 0
  const blinkAmount = Math.max(
    timedBlink,
    input.isBoosting ? 0.28 : 0,
    input.collisionFeedbackSeconds > 0 ? 1 : 0,
  )
  const jawOpenRadians = follow(
    state.jawOpenRadians,
    input.isBoosting ? 0.1 : input.collisionFeedbackSeconds > 0 ? 0.06 : 0,
    12,
    dt,
  )

  return {
    shoulderBankRadians,
    bodyBankRadians,
    headPitchRadians,
    wingFoldRadians,
    wingFlapRadians,
    tailYawRadians,
    recoilRadians,
    breathScale,
    blinkAmount,
    jawOpenRadians,
  }
}
