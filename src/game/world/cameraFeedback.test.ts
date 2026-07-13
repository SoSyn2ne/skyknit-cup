import { describe, expect, it } from 'vitest'

import { getCollisionCameraOffset } from './cameraFeedback'

describe('getCollisionCameraOffset', () => {
  it('returns a small transient offset while collision feedback is active', () => {
    const offset = getCollisionCameraOffset(0.2, 0.37, false)

    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeGreaterThan(0)
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeLessThanOrEqual(0.22)
  })

  it('returns no shake after feedback expires', () => {
    expect(getCollisionCameraOffset(0, 0.37, false)).toEqual({
      x: 0,
      y: 0,
      z: 0,
    })
  })

  it('keeps reduced-motion camera stable', () => {
    expect(getCollisionCameraOffset(0.2, 0.37, true)).toEqual({
      x: 0,
      y: 0,
      z: 0,
    })
  })
})
