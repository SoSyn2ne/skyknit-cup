import {
  intersectCheckpointSegment,
  type CheckpointGeometry,
  type Vec3Like,
} from './checkpoint'

export type RaceCheckpoint = CheckpointGeometry

export interface CheckpointProgressResult {
  readonly nextCheckpointIndex: number
  readonly passedCheckpointIndex: number | null
  readonly finished: boolean
  readonly hitPoint: Vec3Like | null
}

export function progressCheckpoint(
  previous: Vec3Like,
  current: Vec3Like,
  nextCheckpointIndex: number,
  checkpoints: readonly RaceCheckpoint[],
  forgiveness = 0,
): CheckpointProgressResult {
  const activeCheckpoint = checkpoints[nextCheckpointIndex]

  if (activeCheckpoint === undefined) {
    return {
      nextCheckpointIndex,
      passedCheckpointIndex: null,
      finished: nextCheckpointIndex === checkpoints.length,
      hitPoint: null,
    }
  }

  const hit = intersectCheckpointSegment(
    previous,
    current,
    activeCheckpoint,
    forgiveness,
  )

  if (hit === null) {
    return {
      nextCheckpointIndex,
      passedCheckpointIndex: null,
      finished: false,
      hitPoint: null,
    }
  }

  const nextIndex = nextCheckpointIndex + 1

  return {
    nextCheckpointIndex: nextIndex,
    passedCheckpointIndex: nextCheckpointIndex,
    finished: nextIndex === checkpoints.length,
    hitPoint: hit.point,
  }
}
