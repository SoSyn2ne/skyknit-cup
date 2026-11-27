import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  createCoinRunState,
  getCoinRunTarget,
} from '../collectibles/coinRun'
import { getCoinCourse } from '../collectibles/coinCourses'
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
      totalCount: 40,
      visibleCount: 1,
      activeCoinId: 'festival-hub-coin-1',
      visualKind: 'sky-coin',
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

  it('reuses pooled meshes while switching from a sky coin to a cooling crystal and then hiding', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)
    const skyCoinMesh = scene.getObjectByName('RC6_SkyCoins')
    const coolingCrystalMesh = scene.getObjectByName(
      'M39_CoolingCrystals',
    )

    expect(skyCoinMesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(coolingCrystalMesh).toBeInstanceOf(THREE.InstancedMesh)

    const skyCoinGeometry = (skyCoinMesh as THREE.InstancedMesh).geometry
    const crystalGeometry = (
      coolingCrystalMesh as THREE.InstancedMesh
    ).geometry

    visual.update(getCoinCourse('festival-hub').coins[0], 0)
    expect(visual.debugSnapshot()).toMatchObject({
      visibleCount: 1,
      activeCoinId: 'festival-hub-coin-1',
      visualKind: 'sky-coin',
      drawCalls: 1,
    })
    expect(skyCoinMesh?.visible).toBe(true)
    expect(coolingCrystalMesh?.visible).toBe(false)

    visual.update(
      getCoinCourse('volcanic-archipelago').coins[0],
      1,
    )
    expect(visual.debugSnapshot()).toMatchObject({
      visibleCount: 1,
      activeCoinId: 'volcanic-archipelago-coin-1',
      visualKind: 'cooling-crystal',
      drawCalls: 1,
    })
    expect(skyCoinMesh?.visible).toBe(false)
    expect(coolingCrystalMesh?.visible).toBe(true)
    expect(scene.getObjectByName('RC6_SkyCoins')).toBe(skyCoinMesh)
    expect(scene.getObjectByName('M39_CoolingCrystals')).toBe(
      coolingCrystalMesh,
    )
    expect((skyCoinMesh as THREE.InstancedMesh).geometry).toBe(
      skyCoinGeometry,
    )
    expect((coolingCrystalMesh as THREE.InstancedMesh).geometry).toBe(
      crystalGeometry,
    )
    expect(crystalGeometry.type).toBe('OctahedronGeometry')

    visual.update(null, 2)
    expect(visual.debugSnapshot()).toMatchObject({
      visibleCount: 0,
      activeCoinId: null,
      visualKind: null,
      drawCalls: 0,
    })
    expect(skyCoinMesh?.visible).toBe(false)
    expect(coolingCrystalMesh?.visible).toBe(false)

    visual.dispose()
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
    expect(
      scene.getObjectByName('M39_CoolingCrystals'),
    ).toBeUndefined()
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

  it('gives the active collectible a visible but bounded pulse', () => {
    const scene = new THREE.Scene()
    const visual = createCoinCourseVisual(scene)
    const coin = getCoinCourse('festival-hub').coins[0]
    const mesh = scene.getObjectByName('RC6_SkyCoins') as THREE.InstancedMesh
    const earlyMatrix = new THREE.Matrix4()
    const laterMatrix = new THREE.Matrix4()
    const earlyScale = new THREE.Vector3()
    const laterScale = new THREE.Vector3()

    visual.update(coin, 0)
    mesh.getMatrixAt(0, earlyMatrix)
    earlyMatrix.decompose(
      new THREE.Vector3(),
      new THREE.Quaternion(),
      earlyScale,
    )

    visual.update(coin, 0.35)
    mesh.getMatrixAt(0, laterMatrix)
    laterMatrix.decompose(
      new THREE.Vector3(),
      new THREE.Quaternion(),
      laterScale,
    )

    expect(laterScale.x).not.toBeCloseTo(earlyScale.x, 4)
    expect(laterScale.x).toBeGreaterThanOrEqual(0.96)
    expect(laterScale.x).toBeLessThanOrEqual(1.12)

    visual.dispose()
  })
})
