import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  createCoinRunState,
  getCoinRunTarget,
} from '../collectibles/coinRun'
import { createCoinCourseVisual } from './createCoinCourseVisual'

describe('coin course visual', () => {
  it('shows only the currently collectible coin as the active coin advances', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)

    visual.update(
      getCoinRunTarget(
        createCoinRunState(),
        'festival-hub',
        ['festival-hub'],
      ),
      0,
    )
    expect(visual.debugSnapshot()).toEqual({
      totalCount: 30,
      visibleCount: 1,
      activeCoinId: 'festival-hub-coin-1',
      drawCalls: 1,
    })

    visual.update(
      getCoinRunTarget(
        {
          phase: 'running',
          regionId: 'festival-hub',
          collectedCount: 1,
          elapsedMs: 1_000,
          finalElapsedMs: null,
          retryRemainingMs: 0,
        },
        'festival-hub',
        ['festival-hub'],
      ),
      1,
    )
    expect(visual.debugSnapshot()).toMatchObject({
      visibleCount: 1,
      activeCoinId: 'festival-hub-coin-2',
      drawCalls: 1,
    })
    expect(scene.getObjectByName('RC6_SkyCoins')).toBeDefined()
  })

  it('does not expose two idle targets when loaded regions overlap', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)

    visual.update(
      getCoinRunTarget(
        createCoinRunState(),
        'festival-hub',
        ['festival-hub', 'cloud-ruins'],
      ),
      0,
    )

    expect(visual.debugSnapshot()).toMatchObject({
      visibleCount: 1,
      activeCoinId: 'festival-hub-coin-1',
    })

    visual.dispose()
  })

  it('hides outside exploration and disposes its shared resources', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)
    visual.update(null, 0)
    expect(visual.debugSnapshot().visibleCount).toBe(0)
    expect(visual.debugSnapshot().drawCalls).toBe(0)

    visual.dispose()
    expect(scene.getObjectByName('RC6_SkyCoins')).toBeUndefined()
  })

  it('keeps the active coin readable through world occluders', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)
    const mesh = scene.getObjectByName('RC6_SkyCoins')

    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect((mesh as THREE.InstancedMesh).material).toMatchObject({
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
    expect(mesh?.renderOrder).toBeGreaterThan(0)

    visual.dispose()
  })
})
