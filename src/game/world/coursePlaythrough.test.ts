import { describe, expect, it } from 'vitest'

import {
  FLIGHT_TUNING,
  createInitialFlightState,
  stepFlight,
} from '../flight/flightModel'
import { progressCheckpoint } from '../race/courseProgress'
import { SKYKNOT_COURSE, START_ANCHOR } from './course'

const DT = 1 / 60

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function wrapRadians(value: number): number {
  const fullTurn = Math.PI * 2
  return ((value + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

describe('Skyknot course playthrough', () => {
  it('completes all six checkpoints within the sprint window without boost', () => {
    let flight = createInitialFlightState({
      position: START_ANCHOR.position,
      headingRadians: START_ANCHOR.headingRadians,
    })
    let nextCheckpointIndex = 0
    let completedAtSeconds: number | null = null

    for (let step = 0; step < 150 / DT; step += 1) {
      const checkpoint = SKYKNOT_COURSE[nextCheckpointIndex]

      if (checkpoint === undefined) {
        completedAtSeconds = step * DT
        break
      }

      const offset = {
        x: checkpoint.center.x - flight.position.x,
        y: checkpoint.center.y - flight.position.y,
        z: checkpoint.center.z - flight.position.z,
      }
      const horizontalDistance = Math.hypot(offset.x, offset.z)
      const desiredHeading = Math.atan2(offset.x, -offset.z)
      const headingError = wrapRadians(
        desiredHeading - flight.headingRadians,
      )
      const desiredPitch = Math.atan2(offset.y, horizontalDistance)
      const previousPosition = flight.position

      flight = stepFlight(
        flight,
        {
          yaw: clamp(headingError * 3),
          pitch: clamp(
            desiredPitch / FLIGHT_TUNING.maxMovementPitchRadians,
          ),
          boost: false,
        },
        DT,
      )

      const progress = progressCheckpoint(
        previousPosition,
        flight.position,
        nextCheckpointIndex,
        SKYKNOT_COURSE,
        1.5,
      )
      nextCheckpointIndex = progress.nextCheckpointIndex
    }

    expect(nextCheckpointIndex).toBe(SKYKNOT_COURSE.length)
    expect(completedAtSeconds).not.toBeNull()
    expect(completedAtSeconds ?? 0).toBeGreaterThanOrEqual(60)
    expect(completedAtSeconds ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      105,
    )
  })
})
