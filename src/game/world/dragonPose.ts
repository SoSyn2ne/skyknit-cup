import type { CharacterMotionProfile } from '../customization/characterCatalog'

export type GuardianWingMode =
  | 'glide'
  | 'cruise'
  | 'climb'
  | 'dive'
  | 'boost'

export interface DragonPoseInput {
  readonly bankRadians: number
  readonly pitchRadians: number
  readonly isBoosting: boolean
  readonly collisionFeedbackSeconds: number
  readonly animationSeconds: number
  readonly motionProfile?: CharacterMotionProfile
}

export interface DragonPoseState {
  readonly wingMode?: GuardianWingMode
  readonly shoulderBankRadians: number
  readonly bodyBankRadians: number
  readonly bodyPitchRadians?: number
  readonly headPitchRadians: number
  readonly headYawRadians?: number
  readonly wingFoldRadians: number
  readonly wingSpreadRadians?: number
  readonly wingFlapRadians: number
  readonly boostLaunchRadians?: number
  readonly tailYawRadians: readonly number[]
  readonly tailPitchRadians?: readonly number[]
  readonly recoilRadians: number
  readonly breathScale: number
  readonly blinkAmount: number
  readonly jawOpenRadians: number
  readonly boostLaunchRemainingSeconds?: number
  readonly wasBoosting?: boolean
}

interface GuardianPoseProfile {
  readonly flapFrequency: number
  readonly flapPhaseRadians: number
  readonly flapAmplitude: Readonly<Record<GuardianWingMode, number>>
  readonly wingFoldTarget: Readonly<Record<GuardianWingMode, number>>
  readonly wingSpreadTarget: Readonly<Record<GuardianWingMode, number>>
  readonly bodyPitchScale: number
  readonly headYawScale: number
  readonly bodyFollowRate: number
  readonly headFollowRate: number
  readonly tailFollowRates: readonly number[]
  readonly tailPitchScale: number
  readonly boostLaunchAmplitude: number
  readonly breathAmplitude: number
  readonly breathFrequency: number
}

const BOOST_LAUNCH_DURATION_SECONDS = 0.18

const GUARDIAN_POSE_PROFILES: Readonly<
  Record<CharacterMotionProfile, GuardianPoseProfile>
> = Object.freeze({
  dragon: Object.freeze({
    flapFrequency: 2.2,
    flapPhaseRadians: 0,
    flapAmplitude: Object.freeze({
      glide: 0.2,
      cruise: 0.28,
      climb: 0.34,
      dive: 0.14,
      boost: 0.12,
    }),
    wingFoldTarget: Object.freeze({
      glide: 0.02,
      cruise: 0.04,
      climb: -0.08,
      dive: 0.2,
      boost: 0.68,
    }),
    wingSpreadTarget: Object.freeze({
      glide: 0.12,
      cruise: 0.06,
      climb: 0.18,
      dive: -0.08,
      boost: -0.16,
    }),
    bodyPitchScale: 0.22,
    headYawScale: -0.16,
    bodyFollowRate: 5,
    headFollowRate: 7,
    tailFollowRates: [7, 5.5, 4, 3, 2],
    tailPitchScale: -0.18,
    boostLaunchAmplitude: 0.42,
    breathAmplitude: 0.008,
    breathFrequency: 0.55,
  }),
  avian: Object.freeze({
    flapFrequency: 2.85,
    flapPhaseRadians: 0.22,
    flapAmplitude: Object.freeze({
      glide: 0.24,
      cruise: 0.32,
      climb: 0.4,
      dive: 0.16,
      boost: 0.1,
    }),
    wingFoldTarget: Object.freeze({
      glide: -0.04,
      cruise: 0.02,
      climb: -0.14,
      dive: 0.14,
      boost: 0.52,
    }),
    wingSpreadTarget: Object.freeze({
      glide: 0.2,
      cruise: 0.11,
      climb: 0.28,
      dive: -0.04,
      boost: -0.12,
    }),
    bodyPitchScale: 0.16,
    headYawScale: -0.11,
    bodyFollowRate: 6.5,
    headFollowRate: 8,
    tailFollowRates: [8.5, 6.7, 5.1, 3.8, 2.7],
    tailPitchScale: -0.12,
    boostLaunchAmplitude: 0.34,
    breathAmplitude: 0.006,
    breathFrequency: 0.72,
  }),
  feline: Object.freeze({
    flapFrequency: 1.72,
    flapPhaseRadians: -0.16,
    flapAmplitude: Object.freeze({
      glide: 0.15,
      cruise: 0.22,
      climb: 0.3,
      dive: 0.09,
      boost: 0.1,
    }),
    wingFoldTarget: Object.freeze({
      glide: 0.08,
      cruise: 0.1,
      climb: -0.04,
      dive: 0.25,
      boost: 0.58,
    }),
    wingSpreadTarget: Object.freeze({
      glide: 0.08,
      cruise: 0.04,
      climb: 0.15,
      dive: -0.12,
      boost: -0.1,
    }),
    bodyPitchScale: 0.28,
    headYawScale: -0.24,
    bodyFollowRate: 4.1,
    headFollowRate: 5.5,
    tailFollowRates: [5.8, 4.4, 3.3, 2.5, 1.8],
    tailPitchScale: -0.28,
    boostLaunchAmplitude: 0.38,
    breathAmplitude: 0.004,
    breathFrequency: 0.42,
  }),
})

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

function resolveWingMode(input: DragonPoseInput): GuardianWingMode {
  if (input.isBoosting) return 'boost'

  const pitchRadians = finiteOrZero(input.pitchRadians)
  if (pitchRadians >= 0.12) return 'climb'
  if (pitchRadians <= -0.12) return 'dive'

  return Math.abs(finiteOrZero(input.bankRadians)) <= 0.06
    ? 'glide'
    : 'cruise'
}

function getPoseProfile(input: DragonPoseInput): GuardianPoseProfile {
  return GUARDIAN_POSE_PROFILES[input.motionProfile ?? 'dragon']
}

export function createDragonPoseState(): DragonPoseState {
  return {
    wingMode: 'glide',
    shoulderBankRadians: 0,
    bodyBankRadians: 0,
    bodyPitchRadians: 0,
    headPitchRadians: 0,
    headYawRadians: 0,
    wingFoldRadians: 0,
    wingSpreadRadians: 0,
    wingFlapRadians: 0,
    boostLaunchRadians: 0,
    tailYawRadians: GUARDIAN_POSE_PROFILES.dragon.tailFollowRates.map(() => 0),
    tailPitchRadians: GUARDIAN_POSE_PROFILES.dragon.tailFollowRates.map(() => 0),
    recoilRadians: 0,
    breathScale: 1,
    blinkAmount: 0,
    jawOpenRadians: 0,
    boostLaunchRemainingSeconds: 0,
    wasBoosting: false,
  }
}

export function stepDragonPose(
  state: DragonPoseState,
  input: DragonPoseInput,
  dt: number,
): DragonPoseState {
  if (!Number.isFinite(dt) || dt <= 0) return state

  const profile = getPoseProfile(input)
  const wingMode = resolveWingMode(input)
  const shoulderBankRadians = finiteOrZero(input.bankRadians)
  const pitchRadians = finiteOrZero(input.pitchRadians)
  const bodyBankRadians = follow(
    state.bodyBankRadians,
    shoulderBankRadians,
    profile.bodyFollowRate,
    dt,
  )
  const bodyPitchRadians = follow(
    state.bodyPitchRadians ?? 0,
    pitchRadians * profile.bodyPitchScale,
    profile.bodyFollowRate,
    dt,
  )
  const headPitchRadians = follow(
    state.headPitchRadians,
    pitchRadians * 0.35,
    profile.headFollowRate,
    dt,
  )
  const headYawRadians = follow(
    state.headYawRadians ?? 0,
    shoulderBankRadians * profile.headYawScale,
    profile.headFollowRate,
    dt,
  )
  const wingFoldRadians = follow(
    state.wingFoldRadians,
    profile.wingFoldTarget[wingMode],
    10,
    dt,
  )
  const wingSpreadRadians = follow(
    state.wingSpreadRadians ?? 0,
    profile.wingSpreadTarget[wingMode],
    8,
    dt,
  )
  const boostStarted = input.isBoosting && !state.wasBoosting
  const boostLaunchRemainingSeconds = input.isBoosting
    ? boostStarted
      ? BOOST_LAUNCH_DURATION_SECONDS
      : Math.max(0, (state.boostLaunchRemainingSeconds ?? 0) - dt)
    : 0
  const launchProgress =
    1 - boostLaunchRemainingSeconds / BOOST_LAUNCH_DURATION_SECONDS
  const boostLaunchRadians =
    boostLaunchRemainingSeconds > 0
      ? Math.sin(Math.max(0, Math.min(1, launchProgress)) * Math.PI) *
        profile.boostLaunchAmplitude
      : 0
  const animationSeconds = Math.max(0, finiteOrZero(input.animationSeconds))
  const wingFlapRadians =
    Math.sin(
      animationSeconds * Math.PI * 2 * profile.flapFrequency +
        profile.flapPhaseRadians,
    ) * profile.flapAmplitude[wingMode]
  const tailYawRadians: number[] = []
  const tailPitchRadians: number[] = []
  let yawTarget = -shoulderBankRadians * 0.72
  let pitchTarget = pitchRadians * profile.tailPitchScale

  for (const [index, rate] of profile.tailFollowRates.entries()) {
    const yaw = follow(state.tailYawRadians[index] ?? 0, yawTarget, rate, dt)
    const pitch = follow(
      state.tailPitchRadians?.[index] ?? 0,
      pitchTarget,
      rate,
      dt,
    )
    tailYawRadians.push(yaw)
    tailPitchRadians.push(pitch)
    yawTarget = yaw
    pitchTarget = pitch
  }

  const recoilRadians = follow(
    state.recoilRadians,
    input.collisionFeedbackSeconds > 0 ? -0.24 : 0,
    18,
    dt,
  )
  const breathScale =
    1 +
    Math.sin(animationSeconds * Math.PI * 2 * profile.breathFrequency) *
      profile.breathAmplitude
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
    wingMode,
    shoulderBankRadians,
    bodyBankRadians,
    bodyPitchRadians,
    headPitchRadians,
    headYawRadians,
    wingFoldRadians,
    wingSpreadRadians,
    wingFlapRadians,
    boostLaunchRadians,
    tailYawRadians,
    tailPitchRadians,
    recoilRadians,
    breathScale,
    blinkAmount,
    jawOpenRadians,
    boostLaunchRemainingSeconds,
    wasBoosting: input.isBoosting,
  }
}
