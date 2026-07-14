import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { createOpenWorldActivities } from './createOpenWorldActivities'

describe('open-world activity visuals', () => {
  it('renders all authored Festival Hub wind zones in one draw call', () => {
    const scene = new THREE.Scene()
    const visual = createOpenWorldActivities(scene, 'high', '#39c99a')

    visual.update(0, ['festival-hub'], true)

    expect(visual.debugSnapshot()).toEqual({
      qualityTier: 'high',
      zoneCount: 3,
      visibleInstanceCount: 12,
      triangles: 2_880,
      drawCalls: 1,
      disposed: false,
    })
    const ribbons = scene.getObjectByName('M32_FestivalWindRibbons')
    expect(ribbons).toBeInstanceOf(THREE.InstancedMesh)
    expect(
      ((ribbons as THREE.InstancedMesh).material as THREE.MeshBasicMaterial)
        .color,
    ).toEqual(new THREE.Color('#39c99a'))

    const before = [
      ...(ribbons as THREE.InstancedMesh).instanceMatrix.array,
    ]
    visual.update(1.25, ['festival-hub'], true)
    expect([
      ...(ribbons as THREE.InstancedMesh).instanceMatrix.array,
    ]).not.toEqual(before)
  })

  it('reduces instances on low quality without adding a draw call', () => {
    const scene = new THREE.Scene()
    const visual = createOpenWorldActivities(scene, 'high', '#39c99a')

    visual.setQuality('low')
    visual.update(0.5, ['festival-hub'], true)

    expect(visual.debugSnapshot()).toMatchObject({
      qualityTier: 'low',
      visibleInstanceCount: 6,
      triangles: 1_440,
      drawCalls: 1,
    })
    expect(
      (scene.getObjectByName(
        'M32_FestivalWindRibbons',
      ) as THREE.InstancedMesh).count,
    ).toBe(6)
  })

  it('hides when exploration or the Festival Hub is inactive and disposes', () => {
    const scene = new THREE.Scene()
    const visual = createOpenWorldActivities(scene, 'high', '#39c99a')
    const ribbons = scene.getObjectByName(
      'M32_FestivalWindRibbons',
    ) as THREE.InstancedMesh
    const geometryDispose = vi.spyOn(ribbons.geometry, 'dispose')
    const materialDispose = vi.spyOn(
      ribbons.material as THREE.Material,
      'dispose',
    )

    visual.update(0, ['wind-canyon'], true)
    expect(visual.debugSnapshot().drawCalls).toBe(0)
    visual.update(0, ['festival-hub'], false)
    expect(visual.debugSnapshot().visibleInstanceCount).toBe(0)

    visual.dispose()
    expect(scene.getObjectByName('M32_FestivalWindRibbons')).toBeUndefined()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(visual.debugSnapshot()).toMatchObject({
      visibleInstanceCount: 0,
      triangles: 0,
      drawCalls: 0,
      disposed: true,
    })
  })

  it('freezes ribbon motion when reduced motion is active', () => {
    const scene = new THREE.Scene()
    let reducedMotion = true
    const visual = createOpenWorldActivities(
      scene,
      'high',
      '#39c99a',
      () => reducedMotion,
    )
    const ribbons = scene.getObjectByName(
      'M32_FestivalWindRibbons',
    ) as THREE.InstancedMesh

    visual.update(0, ['festival-hub'], true)
    const frozen = [...ribbons.instanceMatrix.array]
    visual.update(5, ['festival-hub'], true)
    expect([...ribbons.instanceMatrix.array]).toEqual(frozen)

    reducedMotion = false
    visual.update(5, ['festival-hub'], true)
    expect([...ribbons.instanceMatrix.array]).not.toEqual(frozen)
  })
})
