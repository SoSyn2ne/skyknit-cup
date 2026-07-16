import { FIXED_STEP_SECONDS } from './fixedStep'

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180
const BOOST_EPSILON = 1e-9

export const FLIGHT_TUNING = {
  cruiseSpeed: 24,
  boostSpeedMultiplier: 1.6,
  boostCapacity: 100,
  boostDrainPerSecond: 40,
  boostRechargeDelaySeconds: 0.5,
  boostRechargePerSecond: 20,
  maxMovementPitchRadians: degreesToRadians(22),
  maxVisualPitchRadians: degreesToRadians(18),
  maxBankRadians: degreesToRadians(30),
  yawRateRadiansPerSecond: 1.4,
  pitchFollowRate: 8,
  bankFollowRate: 10,
  maxClimbSpeedPenalty: 0.15,
  maxDiveSpeedBonus: 0.2,
} as const

export interface Vec3Value {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface FlightInput {
  readonly pitch: number
  readonly yaw: number
  readonly boost: boolean
}

export interface FlightState {
  readonly position: Vec3Value
  readonly headingRadians: number
  readonly pitchRadians: number
  readonly bankRadians: number
  readonly boostRemaining: number
  readonly boostRechargeDelaySeconds: number
  readonly distanceTravelled: number
  readonly speed: number
  readonly isBoosting: boolean
}

export type InitialFlightState = Partial<FlightState>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function normalizeInput(value: number): number {
  return clamp(finiteOr(value, 0), -1, 1)
}

function wrapRadians(radians: number): number {
  const fullTurn = Math.PI * 2
  return ((radians + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

function follow(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export function createInitialFlightState(
  initial: InitialFlightState = {},
): FlightState {
  const position = initial.position ?? { x: 0, y: 0, z: 0 }

  return {
    position: { x: position.x, y: position.y, z: position.z },
    headingRadians: wrapRadians(finiteOr(initial.headingRadians ?? 0, 0)),
    pitchRadians: clamp(
      finiteOr(initial.pitchRadians ?? 0, 0),
      -FLIGHT_TUNING.maxMovementPitchRadians,
      FLIGHT_TUNING.maxMovementPitchRadians,
    ),
    bankRadians: clamp(
      finiteOr(initial.bankRadians ?? 0, 0),
      -FLIGHT_TUNING.maxBankRadians,
      FLIGHT_TUNING.maxBankRadians,
    ),
    boostRemaining: clamp(
      finiteOr(
        initial.boostRemaining ?? FLIGHT_TUNING.boostCapacity,
        FLIGHT_TUNING.boostCapacity,
      ),
      0,
      FLIGHT_TUNING.boostCapacity,
    ),
    boostRechargeDelaySeconds: clamp(
      finiteOr(initial.boostRechargeDelaySeconds ?? 0, 0),
      0,
      FLIGHT_TUNING.boostRechargeDelaySeconds,
    ),
    distanceTravelled: Math.max(
      0,
      finiteOr(initial.distanceTravelled ?? 0, 0),
    ),
    speed: Math.max(
      0,
      finiteOr(initial.speed ?? FLIGHT_TUNING.cruiseSpeed, 0),
    ),
    isBoosting: initial.isBoosting ?? false,
  }
}

export function getForwardVector(state: FlightState): Vec3Value {
  const horizontalScale = Math.cos(state.pitchRadians)

  return {
    x: Math.sin(state.headingRadians) * horizontalScale,
    y: Math.sin(state.pitchRadians),
    z: -Math.cos(state.headingRadians) * horizontalScale,
  }
}

export function getVisualPitchRadians(state: FlightState): number {
  const pitchRatio = clamp(
    state.pitchRadians / FLIGHT_TUNING.maxMovementPitchRadians,
    -1,
    1,
  )

  return pitchRatio * FLIGHT_TUNING.maxVisualPitchRadians
}

export function applyExternalVelocity(
  state: FlightState,
  velocity: Vec3Value,
  dt: number,
): FlightState {
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(velocity.x) ||
    !Number.isFinite(velocity.y) ||
    !Number.isFinite(velocity.z) ||
    (velocity.x === 0 && velocity.y === 0 && velocity.z === 0)
  ) {
    return state
  }

  return {
    ...state,
    position: {
      x: state.position.x + velocity.x * dt,
      y: state.position.y + velocity.y * dt,
      z: state.position.z + velocity.z * dt,
    },
  }
}

export function stepFlight(
  state: FlightState,
  input: FlightInput,
  dt = FIXED_STEP_SECONDS,
  externalSpeedMultiplier = 1,
): FlightState {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state
  }

  const pitchInput = normalizeInput(input.pitch)
  const yawInput = normalizeInput(input.yaw)
  const targetPitch =
    pitchInput * FLIGHT_TUNING.maxMovementPitchRadians
  const pitchRadians = follow(
    state.pitchRadians,
    targetPitch,
    FLIGHT_TUNING.pitchFollowRate,
    dt,
  )
  const headingRadians = wrapRadians(
    state.headingRadians +
      yawInput * FLIGHT_TUNING.yawRateRadiansPerSecond * dt,
  )
  const bankRadians = follow(
    state.bankRadians,
    -yawInput * FLIGHT_TUNING.maxBankRadians,
    FLIGHT_TUNING.bankFollowRate,
    dt,
  )

  const boostRequested = input.boost === true
  const isBoosting =
    boostRequested && state.boostRemaining > BOOST_EPSILON
  let boostRemaining = state.boostRemaining
  let boostRechargeDelaySeconds = state.boostRechargeDelaySeconds

  if (boostRequested) {
    boostRechargeDelaySeconds = FLIGHT_TUNING.boostRechargeDelaySeconds

    if (isBoosting) {
      boostRemaining = Math.max(
        0,
        boostRemaining - FLIGHT_TUNING.boostDrainPerSecond * dt,
      )
    }
  } else {
    const rechargeSeconds = Math.max(
      0,
      dt - boostRechargeDelaySeconds,
    )
    boostRechargeDelaySeconds = Math.max(
      0,
      boostRechargeDelaySeconds - dt,
    )
    boostRemaining = Math.min(
      FLIGHT_TUNING.boostCapacity,
      boostRemaining + FLIGHT_TUNING.boostRechargePerSecond * rechargeSeconds,
    )
  }

  if (boostRemaining < BOOST_EPSILON) {
    boostRemaining = 0
  }

  const pitchRatio = pitchRadians / FLIGHT_TUNING.maxMovementPitchRadians
  const pitchSpeedMultiplier =
    pitchRatio >= 0
      ? 1 - pitchRatio * FLIGHT_TUNING.maxClimbSpeedPenalty
      : 1 + -pitchRatio * FLIGHT_TUNING.maxDiveSpeedBonus
  const boostMultiplier = isBoosting
    ? FLIGHT_TUNING.boostSpeedMultiplier
    : 1
  const safeExternalSpeedMultiplier = clamp(
    finiteOr(externalSpeedMultiplier, 1),
    0,
    1,
  )
  const speed =
    FLIGHT_TUNING.cruiseSpeed *
    pitchSpeedMultiplier *
    boostMultiplier *
    safeExternalSpeedMultiplier
  const forward = getForwardVector({
    ...state,
    headingRadians,
    pitchRadians,
  })
  const distance = speed * dt

  return {
    position: {
      x: state.position.x + forward.x * distance,
      y: state.position.y + forward.y * distance,
      z: state.position.z + forward.z * distance,
    },
    headingRadians,
    pitchRadians,
    bankRadians,
    boostRemaining,
    boostRechargeDelaySeconds,
    distanceTravelled: state.distanceTravelled + distance,
    speed,
    isBoosting,
  }
}
