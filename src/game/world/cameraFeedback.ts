export interface CameraOffset {
  readonly x: number
  readonly y: number
  readonly z: number
}

const ZERO_OFFSET: CameraOffset = { x: 0, y: 0, z: 0 }
const COLLISION_FEEDBACK_SECONDS = 0.25
const MAX_SHAKE_DISTANCE = 0.18

export function getCollisionCameraOffset(
  feedbackRemainingSeconds: number,
  simulationSeconds: number,
  reducedMotion: boolean,
): CameraOffset {
  if (
    reducedMotion ||
    !Number.isFinite(feedbackRemainingSeconds) ||
    feedbackRemainingSeconds <= 0
  ) {
    return ZERO_OFFSET
  }

  const strength = Math.min(
    1,
    feedbackRemainingSeconds / COLLISION_FEEDBACK_SECONDS,
  )
  const time = Number.isFinite(simulationSeconds) ? simulationSeconds : 0

  return {
    x: Math.sin(time * 71) * MAX_SHAKE_DISTANCE * strength,
    y: Math.sin(time * 91 + 0.8) * MAX_SHAKE_DISTANCE * 0.55 * strength,
    z: 0,
  }
}
