import {
  createInitialFlightState,
  getForwardVector,
  stepFlight,
  type FlightInput,
  type FlightState,
  type InitialFlightState,
  type Vec3Value,
} from '../flight/flightModel'

export interface ExplorationInput extends FlightInput {
  readonly brake: boolean
}

export interface ExplorationLandingPad {
  readonly id: string
  readonly position: Vec3Value
  readonly radius: number
}

export type ExplorationMovement =
  | 'airborne'
  | 'landing'
  | 'landed'
  | 'taking-off'

export interface ExplorationFlightState {
  readonly flight: FlightState
  readonly movement: ExplorationMovement
  readonly landingPadId: string | null
  readonly movementProgressSeconds: number
  readonly movementStart: Vec3Value | null
}

export const EXPLORATION_TUNING = {
  cruiseSpeed: 18,
  boostSpeed: 30,
  brakePerSecond: 24,
  accelerationPerSecond: 12,
  boostAccelerationPerSecond: 24,
  landingHeightWindow: 8,
  landingDurationSeconds: 0.9,
  landedHeight: 1.2,
  takeoffDurationSeconds: 0.65,
  takeoffHeight: 10,
  takeoffSpeed: 8,
} as const

function moveTowards(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  if (Math.abs(target - current) <= maximumDelta) {
    return target
  }
  return current + Math.sign(target - current) * maximumDelta
}

function findPad(
  state: ExplorationFlightState,
  pads: readonly ExplorationLandingPad[],
): ExplorationLandingPad | null {
  if (state.landingPadId === null) {
    return null
  }
  return pads.find((pad) => pad.id === state.landingPadId) ?? null
}

function withFlight(
  state: ExplorationFlightState,
  flight: FlightState,
  movement: ExplorationMovement = state.movement,
  movementProgressSeconds = state.movementProgressSeconds,
): ExplorationFlightState {
  return {
    ...state,
    flight,
    movement,
    movementProgressSeconds,
  }
}

export function createExplorationFlightState(
  initial: InitialFlightState = {},
): ExplorationFlightState {
  return {
    flight: createInitialFlightState({
      ...initial,
      speed: initial.speed ?? EXPLORATION_TUNING.cruiseSpeed,
    }),
    movement: 'airborne',
    landingPadId: null,
    movementProgressSeconds: 0,
    movementStart: null,
  }
}

export function requestLanding(
  state: ExplorationFlightState,
  pads: readonly ExplorationLandingPad[],
): ExplorationFlightState {
  if (state.movement !== 'airborne') {
    return state
  }

  const pad = pads
    .map((candidate) => ({
      pad: candidate,
      horizontalDistance: Math.hypot(
        state.flight.position.x - candidate.position.x,
        state.flight.position.z - candidate.position.z,
      ),
      height: state.flight.position.y - candidate.position.y,
    }))
    .filter(
      ({ pad, horizontalDistance, height }) =>
        horizontalDistance <= pad.radius &&
        height >= 0 &&
        height <= EXPLORATION_TUNING.landingHeightWindow,
    )
    .sort((left, right) => left.horizontalDistance - right.horizontalDistance)[0]
    ?.pad

  if (pad === undefined) {
    return state
  }

  return {
    ...state,
    movement: 'landing',
    landingPadId: pad.id,
    movementProgressSeconds: 0,
    movementStart: { ...state.flight.position },
  }
}

export function requestTakeoff(
  state: ExplorationFlightState,
  pads: readonly ExplorationLandingPad[],
): ExplorationFlightState {
  if (state.movement !== 'landed' || findPad(state, pads) === null) {
    return state
  }

  return {
    ...state,
    movement: 'taking-off',
    movementProgressSeconds: 0,
    movementStart: { ...state.flight.position },
  }
}

function stepLanding(
  state: ExplorationFlightState,
  dt: number,
  pads: readonly ExplorationLandingPad[],
): ExplorationFlightState {
  const pad = findPad(state, pads)
  const start = state.movementStart
  if (pad === null || start === null) {
    return {
      ...state,
      movement: 'airborne',
      landingPadId: null,
      movementProgressSeconds: 0,
      movementStart: null,
    }
  }

  const progress = Math.min(
    EXPLORATION_TUNING.landingDurationSeconds,
    state.movementProgressSeconds + dt,
  )
  const t = progress / EXPLORATION_TUNING.landingDurationSeconds
  const landed = t >= 1
  const position = landed
    ? {
        x: pad.position.x,
        y: pad.position.y + EXPLORATION_TUNING.landedHeight,
        z: pad.position.z,
      }
    : {
        x: start.x + (pad.position.x - start.x) * t,
        y:
          start.y +
          (pad.position.y + EXPLORATION_TUNING.landedHeight - start.y) * t,
        z: start.z + (pad.position.z - start.z) * t,
      }

  return withFlight(
    state,
    createInitialFlightState({
      ...state.flight,
      position,
      pitchRadians: 0,
      bankRadians: 0,
      speed: 0,
      isBoosting: false,
    }),
    landed ? 'landed' : 'landing',
    progress,
  )
}

function stepTakeoff(
  state: ExplorationFlightState,
  dt: number,
  pads: readonly ExplorationLandingPad[],
): ExplorationFlightState {
  const pad = findPad(state, pads)
  const start = state.movementStart
  if (pad === null || start === null) {
    return state
  }

  const progress = Math.min(
    EXPLORATION_TUNING.takeoffDurationSeconds,
    state.movementProgressSeconds + dt,
  )
  const t = progress / EXPLORATION_TUNING.takeoffDurationSeconds
  const airborne = t >= 1
  const position = {
    x: pad.position.x,
    y: airborne
      ? pad.position.y + EXPLORATION_TUNING.takeoffHeight
      : start.y +
        (pad.position.y + EXPLORATION_TUNING.takeoffHeight - start.y) * t,
    z: pad.position.z,
  }

  return withFlight(
    state,
    createInitialFlightState({
      ...state.flight,
      position,
      pitchRadians: 0,
      bankRadians: 0,
      speed: airborne ? EXPLORATION_TUNING.takeoffSpeed : 0,
      isBoosting: false,
    }),
    airborne ? 'airborne' : 'taking-off',
    progress,
  )
}

export function stepExplorationFlight(
  state: ExplorationFlightState,
  input: ExplorationInput,
  dt: number,
  pads: readonly ExplorationLandingPad[],
): ExplorationFlightState {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state
  }
  if (state.movement === 'landing') {
    return stepLanding(state, dt, pads)
  }
  if (state.movement === 'taking-off') {
    return stepTakeoff(state, dt, pads)
  }
  if (state.movement === 'landed') {
    return state
  }

  const brake = input.brake === true
  const stepped = stepFlight(
    state.flight,
    {
      pitch: input.pitch,
      yaw: input.yaw,
      boost: !brake && input.boost,
    },
    dt,
  )
  const targetSpeed = brake
    ? 0
    : stepped.isBoosting
      ? EXPLORATION_TUNING.boostSpeed
      : EXPLORATION_TUNING.cruiseSpeed
  const speedRate = brake
    ? EXPLORATION_TUNING.brakePerSecond
    : stepped.isBoosting
      ? EXPLORATION_TUNING.boostAccelerationPerSecond
      : EXPLORATION_TUNING.accelerationPerSecond
  const speed = Math.max(
    0,
    moveTowards(state.flight.speed, targetSpeed, speedRate * dt),
  )
  const forward = getForwardVector(stepped)
  const distance = speed * dt
  const flight: FlightState = {
    ...stepped,
    position: {
      x: state.flight.position.x + forward.x * distance,
      y: state.flight.position.y + forward.y * distance,
      z: state.flight.position.z + forward.z * distance,
    },
    distanceTravelled: state.flight.distanceTravelled + distance,
    speed,
  }

  return withFlight(state, flight)
}
