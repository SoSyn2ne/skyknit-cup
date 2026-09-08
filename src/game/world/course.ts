import type { Vec3Like } from '../race/checkpoint'
import type { RaceCheckpoint } from '../race/courseProgress'
import type { RespawnAnchor } from '../race/raceRuntime'

export interface CourseCheckpoint extends RaceCheckpoint {
  readonly id: string
  readonly kind: 'gate' | 'cooling-seal' | 'escape'
}

export interface CourseSegment {
  readonly start: Vec3Like
  readonly end: Vec3Like
}

export const RACE_COURSE_IDS = [
  'skyknot',
  'volcanic-archipelago',
] as const

export type RaceCourseId = (typeof RACE_COURSE_IDS)[number]

export interface CourseDefinition {
  readonly id: RaceCourseId
  readonly startAnchor: RespawnAnchor
  readonly checkpoints: readonly CourseCheckpoint[]
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
]

export const VOLCANIC_START_ANCHOR: RespawnAnchor = {
  position: { x: -240, y: 34, z: -720 },
  headingRadians: Math.atan2(-55, 123),
}

const VOLCANIC_CHECKPOINTS = [
  {
    id: 'cooling-seal-01',
    kind: 'cooling-seal',
    center: { x: -295, y: 45, z: -843 },
    radius: 16,
  },
  {
    id: 'cooling-seal-02',
    kind: 'cooling-seal',
    center: { x: -196, y: 44, z: -786 },
    radius: 16,
  },
  {
    id: 'cooling-seal-03',
    kind: 'cooling-seal',
    center: { x: -212, y: 45, z: -875 },
    radius: 16,
  },
  {
    id: 'eruption-escape',
    kind: 'escape',
    center: { x: -240, y: 53, z: -902 },
    radius: 20,
  },
] as const

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
      kind: 'gate',
      center,
      normal: normalize(subtract(center, previous)),
      radius: 22,
    }
  })

export const VOLCANIC_ARCHIPELAGO_COURSE: readonly CourseCheckpoint[] =
  VOLCANIC_CHECKPOINTS.map((checkpoint, index) => {
    const previous =
      index === 0
        ? VOLCANIC_START_ANCHOR.position
        : (VOLCANIC_CHECKPOINTS[index - 1]?.center ??
          VOLCANIC_START_ANCHOR.position)

    return {
      ...checkpoint,
      normal: normalize(subtract(checkpoint.center, previous)),
    }
  })

export const SKYKNOT_COURSE_DEFINITION: CourseDefinition = {
  id: 'skyknot',
  startAnchor: START_ANCHOR,
  checkpoints: SKYKNOT_COURSE,
}

export const VOLCANIC_ARCHIPELAGO_COURSE_DEFINITION: CourseDefinition = {
  id: 'volcanic-archipelago',
  startAnchor: VOLCANIC_START_ANCHOR,
  checkpoints: VOLCANIC_ARCHIPELAGO_COURSE,
}

export const RACE_COURSE_CATALOG: Readonly<
  Record<RaceCourseId, CourseDefinition>
> = Object.freeze({
  skyknot: SKYKNOT_COURSE_DEFINITION,
  'volcanic-archipelago': VOLCANIC_ARCHIPELAGO_COURSE_DEFINITION,
})

export function getCourseDefinition(
  courseId: RaceCourseId,
): CourseDefinition {
  return RACE_COURSE_CATALOG[courseId]
}

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

type CourseSelector = RaceCourseId | CourseDefinition

function resolveCourseAndIndex(
  courseOrIndex: CourseSelector | number,
  maybeCheckpointIndex: number | undefined,
): { readonly course: CourseDefinition; readonly checkpointIndex: number } {
  if (typeof courseOrIndex === 'number') {
    return {
      course: SKYKNOT_COURSE_DEFINITION,
      checkpointIndex: courseOrIndex,
    }
  }

  return {
    course:
      typeof courseOrIndex === 'string'
        ? getCourseDefinition(courseOrIndex)
        : courseOrIndex,
    checkpointIndex: maybeCheckpointIndex ?? Number.NaN,
  }
}

export function getCourseSegment(nextCheckpointIndex: number): CourseSegment
export function getCourseSegment(
  course: CourseSelector,
  nextCheckpointIndex: number,
): CourseSegment
export function getCourseSegment(
  courseOrIndex: CourseSelector | number,
  maybeCheckpointIndex?: number,
): CourseSegment {
  const { course, checkpointIndex } = resolveCourseAndIndex(
    courseOrIndex,
    maybeCheckpointIndex,
  )
  const end = course.checkpoints[checkpointIndex]

  if (!Number.isInteger(checkpointIndex) || end === undefined) {
    throw new RangeError('Active checkpoint index is outside the course')
  }

  return {
    start:
      checkpointIndex === 0
        ? course.startAnchor.position
        : (course.checkpoints[checkpointIndex - 1]?.center ??
          course.startAnchor.position),
    end: end.center,
  }
}

export function getRespawnAnchor(
  nextCheckpointIndex: number,
): RespawnAnchor
export function getRespawnAnchor(
  course: CourseSelector,
  nextCheckpointIndex: number,
): RespawnAnchor
export function getRespawnAnchor(
  courseOrIndex: CourseSelector | number,
  maybeCheckpointIndex?: number,
): RespawnAnchor {
  const { course, checkpointIndex } = resolveCourseAndIndex(
    courseOrIndex,
    maybeCheckpointIndex,
  )
  if (!Number.isInteger(checkpointIndex) || checkpointIndex <= 0) {
    return course.startAnchor
  }

  const previous =
    course.checkpoints[
      Math.min(checkpointIndex - 1, course.checkpoints.length - 1)
    ]
  const next = course.checkpoints[checkpointIndex]

  if (previous === undefined) {
    return course.startAnchor
  }

  const direction =
    next === undefined
      ? previous.normal
      : normalize(subtract(next.center, previous.center))
  const horizontalLength = Math.hypot(direction.x, direction.z)
  const headingRadians =
    horizontalLength <= Number.EPSILON
      ? course.startAnchor.headingRadians
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
