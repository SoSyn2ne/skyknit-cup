import { describe, expect, it } from 'vitest'

import { resolveRenderQuality } from './qualityPolicy'

const desktopSignals = {
  coarsePointer: false,
  viewportWidth: 1_440,
  devicePixelRatio: 2,
  deviceMemoryGb: 8,
  hardwareConcurrency: 8,
}

describe('render quality policy', () => {
  it('uses the full high budget for an explicit desktop high setting', () => {
    expect(
      resolveRenderQuality({ preference: 'high', ...desktopSignals }),
    ).toEqual({
      tier: 'high',
      dprCap: 1.75,
      pixelRatio: 1.75,
      cloudCount: 32,
      boostRingCount: 3,
      shadows: true,
      shadowMapSize: 1_024,
      cloudWispCount: 16,
      cloudDeckCount: 8,
      speedStreakCount: 18,
    })
  })

  it('uses the reduced low budget for an explicit low setting', () => {
    expect(
      resolveRenderQuality({ preference: 'low', ...desktopSignals }),
    ).toEqual({
      tier: 'low',
      dprCap: 1.25,
      pixelRatio: 1.25,
      cloudCount: 24,
      boostRingCount: 1,
      shadows: false,
      shadowMapSize: 0,
      cloudWispCount: 12,
      cloudDeckCount: 0,
      speedStreakCount: 0,
    })
  })

  it('keeps the mobile DPR cap even when high is explicitly selected', () => {
    expect(
      resolveRenderQuality({
        preference: 'high',
        ...desktopSignals,
        coarsePointer: true,
      }).pixelRatio,
    ).toBe(1.25)
  })

  it.each([
    { coarsePointer: true },
    { viewportWidth: 844 },
    { deviceMemoryGb: 4 },
    { hardwareConcurrency: 4 },
  ])('selects low automatically for constrained signals: %j', (signal) => {
    expect(
      resolveRenderQuality({
        preference: 'auto',
        ...desktopSignals,
        ...signal,
      }).tier,
    ).toBe('low')
  })

  it('selects high automatically for an unconstrained desktop', () => {
    expect(
      resolveRenderQuality({ preference: 'auto', ...desktopSignals }).tier,
    ).toBe('high')
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to a safe device pixel ratio for %s',
    (devicePixelRatio) => {
      expect(
        resolveRenderQuality({
          preference: 'high',
          ...desktopSignals,
          devicePixelRatio,
        }).pixelRatio,
      ).toBe(1)
    },
  )
})
