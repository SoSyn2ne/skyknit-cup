import { describe, expect, it } from 'vitest'

import {
  progressCheckpoint,
  type RaceCheckpoint,
} from './courseProgress'

const checkpoints: readonly RaceCheckpoint[] = [
  {
    center: { x: 0, y: 8, z: -20 },
    normal: { x: 0, y: 0, z: -1 },
    radius: 5,
  },
  {
    center: { x: 0, y: 8, z: -40 },
    normal: { x: 0, y: 0, z: -1 },
    radius: 5,
  },
  {
    center: { x: 0, y: 8, z: -60 },
    normal: { x: 0, y: 0, z: -1 },
    radius: 5,
  },
]

describe('ordered checkpoint progress', () => {
  it('counts a high-speed crossing of the active checkpoint once', () => {
    const result = progressCheckpoint(
      { x: 0, y: 8, z: 0 },
      { x: 0, y: 8, z: -35 },
      0,
      checkpoints,
    )

    expect(result).toMatchObject({
      nextCheckpointIndex: 1,
      passedCheckpointIndex: 0,
      finished: false,
    })
  })

  it('does not count an inactive checkpoint that is crossed first', () => {
    const result = progressCheckpoint(
      { x: 0, y: 8, z: -30 },
      { x: 0, y: 8, z: -50 },
      0,
      checkpoints,
    )

    expect(result).toEqual({
      nextCheckpointIndex: 0,
      passedCheckpointIndex: null,
      finished: false,
      hitPoint: null,
    })
  })

  it('does not count dwelling inside the active gate without a new crossing', () => {
    const result = progressCheckpoint(
      { x: 0, y: 8, z: -20 },
      { x: 0.2, y: 8, z: -20.1 },
      1,
      checkpoints,
    )

    expect(result.passedCheckpointIndex).toBeNull()
    expect(result.nextCheckpointIndex).toBe(1)
  })

  it('rejects reverse travel through the active checkpoint', () => {
    const result = progressCheckpoint(
      { x: 0, y: 8, z: -45 },
      { x: 0, y: 8, z: -35 },
      1,
      checkpoints,
    )

    expect(result.passedCheckpointIndex).toBeNull()
    expect(result.nextCheckpointIndex).toBe(1)
  })

  it('does not recount the previous gate immediately after respawn', () => {
    const result = progressCheckpoint(
      { x: 0, y: 8, z: -21 },
      { x: 0, y: 8, z: -25 },
      1,
      checkpoints,
    )

    expect(result.passedCheckpointIndex).toBeNull()
    expect(result.nextCheckpointIndex).toBe(1)
  })

  it('marks progress finished only when the final active gate is crossed', () => {
    const result = progressCheckpoint(
      { x: 0, y: 8, z: -55 },
      { x: 0, y: 8, z: -70 },
      2,
      checkpoints,
    )

    expect(result).toMatchObject({
      nextCheckpointIndex: 3,
      passedCheckpointIndex: 2,
      finished: true,
    })
  })
})
