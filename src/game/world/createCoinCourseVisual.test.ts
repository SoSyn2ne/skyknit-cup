import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { createCoinRunState } from '../collectibles/coinRun'
import { createCoinCourseVisual } from './createCoinCourseVisual'

describe('coin course visual', () => {
  it('uses one instanced mesh and advances the active coin', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)

    visual.update(
      createCoinRunState(),
      ['festival-hub'],
      0,
      true,
    )
    expect(visual.debugSnapshot()).toEqual({
      totalCount: 30,
      visibleCount: 10,
      activeCoinId: 'festival-hub-coin-1',
      drawCalls: 1,
    })

    visual.update(
      {
        phase: 'running',
        regionId: 'festival-hub',
        collectedCount: 1,
        elapsedMs: 1_000,
        finalElapsedMs: null,
        retryRemainingMs: 0,
      },
      ['festival-hub'],
      1,
      true,
    )
    expect(visual.debugSnapshot()).toMatchObject({
      visibleCount: 9,
      activeCoinId: 'festival-hub-coin-2',
      drawCalls: 1,
    })
    expect(scene.getObjectByName('RC6_SkyCoins')).toBeDefined()
  })

  it('hides outside exploration and disposes its shared resources', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)
    visual.update(createCoinRunState(), ['festival-hub'], 0, false)
    expect(visual.debugSnapshot().visibleCount).toBe(0)
    expect(visual.debugSnapshot().drawCalls).toBe(0)

    visual.dispose()
    expect(scene.getObjectByName('RC6_SkyCoins')).toBeUndefined()
  })
})
