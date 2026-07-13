import type { Vec3Like } from '../race/checkpoint'
import type { RaceCheckpoint } from '../race/courseProgress'
import type { RespawnAnchor } from '../race/raceRuntime'

export interface CourseCheckpoint extends RaceCheckpoint {
  readonly id: string
}

export interface CourseSegment {
  readonly start: Vec3Like
  readonly end: Vec3Like
}

export const START_ANCHOR: RespawnAnchor = {
  position: { x: 0, y: 8, z: 0 },
  headingRadians: 0,
}

const CHECKPOINT_CENTERS: readonly Vec3Like[] = [
  { x: 0, y: 10, z: -220 },
  { x: 50, y: 24, z: -460 },
  { x: 210, y: 38, z: -650 },
  { x: 450, y: 24, z: -720 },
  { x: 680, y: 12, z: -620 },
  { x: 830, y: 28, z: -420 },
  { x: 850, y: 44, z: -170 },
  { x: 720, y: 28, z: 45 },
  { x: 500, y: 14, z: 170 },
  { x: 250, y: 28, z: 180 },
  { x: 40, y: 42, z: 50 },
  { x: -80, y: 18, z: -170 },
]

function subtract(left: Vec3Like, right: Vec3Like): Vec3Like {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function normalize(vector: Vec3Like): Vec3Like {
  const length = Math.hypot(vector.x, vector.y, vector.z)

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function distance(left: Vec3Like, right: Vec3Like): number {
  return Math.hypot(
    left.x - right.x,
    left.y - right.y,
    left.z - right.z,
  )
}

export const SKYKNOT_COURSE: readonly CourseCheckpoint[] =
  CHECKPOINT_CENTERS.map((center, index) => {
    const previous =
      index === 0
        ? START_ANCHOR.position
        : (CHECKPOINT_CENTERS[index - 1] ?? START_ANCHOR.position)

    return {
      id: `gate-${String(index + 1).padStart(2, '0')}`,
      center,
      normal: normalize(subtract(center, previous)),
      radius: 22,
    }
  })

export function getCourseDistance(
  checkpoints: readonly RaceCheckpoint[],
  start: Vec3Like,
): number {
  let total = 0
  let previous = start

  for (const checkpoint of checkpoints) {
    total += distance(previous, checkpoint.center)
    previous = checkpoint.center
  }

  return total
}

export function getCourseSegment(nextCheckpointIndex: number): CourseSegment {
  const end = SKYKNOT_COURSE[nextCheckpointIndex]

  if (end === undefined) {
    throw new RangeError('Active checkpoint index is outside the course')
  }

  return {
    start:
      nextCheckpointIndex === 0
        ? START_ANCHOR.position
        : (SKYKNOT_COURSE[nextCheckpointIndex - 1]?.center ??
          START_ANCHOR.position),
    end: end.center,
  }
}

export function getRespawnAnchor(
  nextCheckpointIndex: number,
): RespawnAnchor {
  if (nextCheckpointIndex <= 0) {
    return START_ANCHOR
  }

  const previous =
    SKYKNOT_COURSE[
      Math.min(nextCheckpointIndex - 1, SKYKNOT_COURSE.length - 1)
    ]
  const next = SKYKNOT_COURSE[nextCheckpointIndex]

  if (previous === undefined) {
    return START_ANCHOR
  }

  const direction =
    next === undefined
      ? previous.normal
      : normalize(subtract(next.center, previous.center))
  const horizontalLength = Math.hypot(direction.x, direction.z)
  const headingRadians =
    horizontalLength <= Number.EPSILON
      ? START_ANCHOR.headingRadians
      : Math.atan2(direction.x, -direction.z)

  return {
    position: {
      x: previous.center.x + direction.x * 12,
      y: previous.center.y + direction.y * 12,
      z: previous.center.z + direction.z * 12,
    },
    headingRadians,
  }
}
