import { describe, expect, it } from 'vitest'

import { intersectCheckpointSegment } from './checkpoint'

const gate = {
  center: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 2,
}

describe('checkpoint segment intersection', () => {
  it('accepts a forward segment through the checkpoint center', () => {
    const hit = intersectCheckpointSegment(
      { x: 0, y: 0, z: -5 },
      { x: 0, y: 0, z: 5 },
      gate,
    )

    expect(hit).not.toBeNull()
    expect(hit?.t).toBeCloseTo(0.5)
    expect(hit?.point).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('rejects a forward crossing outside the checkpoint radius', () => {
    expect(
      intersectCheckpointSegment(
        { x: 2.01, y: 0, z: -1 },
        { x: 2.01, y: 0, z: 1 },
        gate,
      ),
    ).toBeNull()
  })

  it('accepts a crossing inside the explicit forgiving margin', () => {
    expect(
      intersectCheckpointSegment(
        { x: 2.05, y: 0, z: -1 },
        { x: 2.05, y: 0, z: 1 },
        gate,
        0.1,
      ),
    ).not.toBeNull()
  })

  it('rejects a segment parallel to the checkpoint plane', () => {
    expect(
      intersectCheckpointSegment(
        { x: 0, y: 0, z: -1 },
        { x: 2, y: 0, z: -1 },
        gate,
      ),
    ).toBeNull()
  })

  it('rejects a reverse-direction crossing', () => {
    expect(
      intersectCheckpointSegment(
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
        gate,
      ),
    ).toBeNull()
  })

  it('rejects a plane intersection outside the finite segment', () => {
    expect(
      intersectCheckpointSegment(
        { x: 0, y: 0, z: -2 },
        { x: 0, y: 0, z: -1 },
        gate,
      ),
    ).toBeNull()
  })

  it('rejects a segment that starts on the plane and moves forward', () => {
    expect(
      intersectCheckpointSegment(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        gate,
      ),
    ).toBeNull()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a checkpoint with non-finite radius %s',
    (radius) => {
      expect(
        intersectCheckpointSegment(
          { x: 0, y: 0, z: -1 },
          { x: 0, y: 0, z: 1 },
          { ...gate, radius },
        ),
      ).toBeNull()
    },
  )

  it('rejects a segment with non-finite coordinates', () => {
    expect(
      intersectCheckpointSegment(
        { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
        { x: 0, y: 0, z: Number.POSITIVE_INFINITY },
        gate,
      ),
    ).toBeNull()
  })
})
