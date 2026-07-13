import { describe, expect, it } from 'vitest'

import {
  getReadyCameraFraming,
  WIND_THREAD_VISUAL_SPEC,
} from './createFlightSandbox'

describe('ready camera framing', () => {
  it('moves farther back and closer to center on compact portrait screens', () => {
    const landscape = getReadyCameraFraming(844, 390)
    const portrait = getReadyCameraFraming(390, 844)
    const minimum = getReadyCameraFraming(320, 568)

    expect(landscape.mode).toBe('landscape')
    expect(portrait.mode).toBe('portrait')
    expect(minimum.mode).toBe('compact-portrait')
    expect(portrait.backDistance).toBeGreaterThan(landscape.backDistance)
    expect(minimum.backDistance).toBeGreaterThan(portrait.backDistance)
    expect(Math.abs(portrait.sideDistance)).toBeLessThan(
      Math.abs(landscape.sideDistance),
    )
    expect(Math.abs(minimum.sideDistance)).toBeLessThanOrEqual(
      Math.abs(portrait.sideDistance),
    )
    expect(portrait.fov).toBeGreaterThan(landscape.fov)
    expect(minimum.fov).toBeGreaterThanOrEqual(portrait.fov)
  })

  it('falls back to the desktop framing for invalid viewport dimensions', () => {
    expect(getReadyCameraFraming(0, Number.NaN)).toEqual(
      getReadyCameraFraming(1_440, 900),
    )
  })
})

describe('wind-thread route guidance', () => {
  it('uses thick cyan and gold strands with narrower bright cores', () => {
    expect(WIND_THREAD_VISUAL_SPEC.outerRadius).toBeGreaterThanOrEqual(0.14)
    expect(WIND_THREAD_VISUAL_SPEC.coreRadius).toBeGreaterThanOrEqual(0.045)
    expect(WIND_THREAD_VISUAL_SPEC.outerRadius).toBeGreaterThan(
      WIND_THREAD_VISUAL_SPEC.coreRadius,
    )
    expect(WIND_THREAD_VISUAL_SPEC.leftColorRole).toBe('gateRune')
    expect(WIND_THREAD_VISUAL_SPEC.rightColorRole).toBe('wingGold')
  })
})
