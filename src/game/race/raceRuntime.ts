import {
  FLIGHT_TUNING,
  createInitialFlightState,
  type FlightState,
} from '../flight/flightModel'
import type { Vec3Like } from './checkpoint'

export interface OutOfBoundsTracker {
  readonly outsideDurationSeconds: number
}

export interface OutOfBoundsResult extends OutOfBoundsTracker {
  readonly shouldRespawn: boolean
}

export interface RespawnAnchor {
  readonly position: Vec3Like
  readonly headingRadians: number
}

export interface RespawnResult extends OutOfBoundsTracker {
  readonly flight: FlightState
  readonly immunityRemainingSeconds: number
}

const MINIMUM_ALTITUDE = -12
const MAXIMUM_SEGMENT_DISTANCE = 65
const OUTSIDE_DURATION_SECONDS = 1.5
const RESPAWN_IMMUNITY_SECONDS = 1

function squaredDistance(left: Vec3Like, right: Vec3Like): number {
  const x = left.x - right.x
  const y = left.y - right.y
  const z = left.z - right.z
  return x * x + y * y + z * z
}

function distanceToSegmentSquared(
  point: Vec3Like,
  start: Vec3Like,
  end: Vec3Like,
): number {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  }
  const lengthSquared =
    segment.x * segment.x +
    segment.y * segment.y +
    segment.z * segment.z

  if (lengthSquared <= Number.EPSILON) {
    return squaredDistance(point, start)
  }

  const offset = {
    x: point.x - start.x,
    y: point.y - start.y,
    z: point.z - start.z,
  }
  const projection =
    (offset.x * segment.x +
      offset.y * segment.y +
      offset.z * segment.z) /
    lengthSquared
  const t = Math.min(1, Math.max(0, projection))

  return squaredDistance(point, {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
    z: start.z + segment.z * t,
  })
}

export function stepOutOfBounds(
  tracker: OutOfBoundsTracker,
  position: Vec3Like,
  segmentStart: Vec3Like,
  segmentEnd: Vec3Like,
  dt: number,
): OutOfBoundsResult {
  const outside =
    position.y < MINIMUM_ALTITUDE ||
    distanceToSegmentSquared(position, segmentStart, segmentEnd) >
      MAXIMUM_SEGMENT_DISTANCE * MAXIMUM_SEGMENT_DISTANCE

  if (!outside) {
    return { outsideDurationSeconds: 0, shouldRespawn: false }
  }

  const elapsed =
    tracker.outsideDurationSeconds +
    (Number.isFinite(dt) && dt > 0 ? dt : 0)

  return {
    outsideDurationSeconds: elapsed,
    shouldRespawn: elapsed >= OUTSIDE_DURATION_SECONDS,
  }
}

export function beginRespawn(
  flight: FlightState,
  anchor: RespawnAnchor,
): RespawnResult {
  return {
    flight: createInitialFlightState({
      ...flight,
      position: anchor.position,
      headingRadians: anchor.headingRadians,
      pitchRadians: 0,
      bankRadians: 0,
      speed: FLIGHT_TUNING.cruiseSpeed,
      isBoosting: false,
      boostRechargeDelaySeconds: 0,
    }),
    immunityRemainingSeconds: RESPAWN_IMMUNITY_SECONDS,
    outsideDurationSeconds: 0,
  }
}

export function stepRespawnImmunity(
  currentSeconds: number,
  dt: number,
): number {
  const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0
  return Math.max(0, currentSeconds - elapsed)
}
