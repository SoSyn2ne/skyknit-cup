import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  getVolcanicHazardCollisionObstacles,
  sampleVolcanicHazards,
} from './volcanicHazards'
import { createVolcanicActivities } from './createVolcanicActivities'

describe('volcanic activity visuals', () => {
  it('renders readable high-quality telegraphs within six draw calls', () => {
    const scene = new THREE.Scene()
    const visual = createVolcanicActivities(scene, 'high')
    const frame = sampleVolcanicHazards(0, 80741)

    visual.update(frame, 0, true, true)

    expect(visual.debugSnapshot()).toMatchObject({
      qualityTier: 'high',
      reducedMotion: false,
      loaded: true,
      active: true,
      thermalColumnCount: 3,
      ashParticleCount: 180,
      rockTelegraphCount: 1,
      fallingRockCount: 0,
      lavaTelegraphSegmentCount: 64,
      lavaWaveSegmentCount: 0,
      drawCalls: 4,
      disposed: false,
    })

    const rockTelegraph = scene.getObjectByName(
      'M39_VolcanicRockfallTelegraphs',
    ) as THREE.InstancedMesh
    const lavaTelegraph = scene.getObjectByName(
      'M39_VolcanicLavaTelegraph',
    ) as THREE.InstancedMesh
    const lavaWave = scene.getObjectByName(
      'M39_VolcanicLavaWave',
    ) as THREE.InstancedMesh

    expect(rockTelegraph.geometry).toBeInstanceOf(THREE.RingGeometry)
    expect(lavaTelegraph).toBeInstanceOf(THREE.InstancedMesh)
    expect(lavaTelegraph.geometry).toBeInstanceOf(THREE.BoxGeometry)
    expect(lavaWave).toBeInstanceOf(THREE.InstancedMesh)
    expect(lavaWave.geometry).toBeInstanceOf(THREE.PlaneGeometry)
    expect(lavaTelegraph.geometry).not.toBe(lavaWave.geometry)
    expect(
      (lavaTelegraph.material as THREE.MeshBasicMaterial).opacity,
    ).toBeLessThan((lavaWave.material as THREE.MeshBasicMaterial).opacity)
    expect(lavaTelegraph.count).toBe(64)
    expect(lavaWave.count).toBe(0)
  })

  it('switches from warnings to clear active rockfall and lava-wave shapes', () => {
    const scene = new THREE.Scene()
    const visual = createVolcanicActivities(scene, 'high')

    visual.update(sampleVolcanicHazards(1_900, 80741), 1.9, true, true)
    expect(visual.debugSnapshot()).toMatchObject({
      rockTelegraphCount: 0,
      fallingRockCount: 3,
      lavaTelegraphSegmentCount: 64,
      lavaWaveSegmentCount: 0,
      drawCalls: 4,
    })
    expect(
      scene.getObjectByName('M39_VolcanicFallingRocks'),
    ).toBeInstanceOf(THREE.InstancedMesh)

    visual.update(sampleVolcanicHazards(2_500, 80741), 2.5, true, true)
    expect(visual.debugSnapshot()).toMatchObject({
      rockTelegraphCount: 0,
      fallingRockCount: 0,
      lavaTelegraphSegmentCount: 0,
      lavaWaveSegmentCount: 40,
      drawCalls: 3,
    })
    const lavaWave = scene.getObjectByName(
      'M39_VolcanicLavaWave',
    ) as THREE.InstancedMesh
    expect(lavaWave.visible).toBe(true)
    expect(lavaWave.count).toBe(40)
    expect(
      (lavaWave.material as THREE.MeshBasicMaterial).side,
    ).toBe(THREE.DoubleSide)
    expect(visual.debugSnapshot().triangles).toBeLessThanOrEqual(220)
  })

  it('primes the first lava-wave draw invisibly before active gameplay', () => {
    const scene = new THREE.Scene()
    const visual = createVolcanicActivities(scene, 'high')
    const telegraph = sampleVolcanicHazards(0, 80741)

    visual.update(telegraph, 0, true, true)
    const lavaWave = scene.getObjectByName(
      'M39_VolcanicLavaWave',
    ) as THREE.InstancedMesh
    const material = lavaWave.material as THREE.MeshBasicMaterial
    expect(lavaWave.count).toBe(0)
    expect(lavaWave.visible).toBe(false)

    visual.primeFirstLavaWaveDraw()

    expect(lavaWave.count).toBe(40)
    expect(lavaWave.visible).toBe(true)
    expect(material.opacity).toBe(0)

    visual.update(telegraph, 0, true, true)
    expect(lavaWave.count).toBe(0)
    expect(lavaWave.visible).toBe(false)
    expect(material.opacity).toBe(0.92)
  })

  it('changes only the hazard presentation, never its collision contract', () => {
    const scene = new THREE.Scene()
    const visual = createVolcanicActivities(scene, 'high')
    const frame = sampleVolcanicHazards(2_500, 80741)
    const before = getVolcanicHazardCollisionObstacles(frame)

    visual.update(frame, 2.5, true, true)

    expect(getVolcanicHazardCollisionObstacles(frame)).toEqual(before)
    expect(frame.lavaWave.collisionActive).toBe(true)
    expect(frame.lavaWave.collisionBandRadius).toBe(4)
    expect(visual.debugSnapshot().lavaWaveSegmentCount).toBe(40)
  })

  it('reduces only visual density and motion on low quality or reduced motion', () => {
    const scene = new THREE.Scene()
    let reducedMotion = false
    const visual = createVolcanicActivities(
      scene,
      'high',
      () => reducedMotion,
    )
    const frame = sampleVolcanicHazards(0, 80741)

    visual.setQuality('low')
    visual.update(frame, 1, true, true)
    expect(visual.debugSnapshot()).toMatchObject({
      qualityTier: 'low',
      ashParticleCount: 84,
      lavaTelegraphSegmentCount: 24,
      rockTelegraphCount: 1,
    })
    expect(
      (scene.getObjectByName(
        'M39_VolcanicLavaTelegraph',
      ) as THREE.InstancedMesh).count,
    ).toBe(24)

    const thermalColumns = scene.getObjectByName(
      'M39_VolcanicThermalColumns',
    ) as THREE.InstancedMesh
    const moving = [...thermalColumns.instanceMatrix.array]
    reducedMotion = true
    visual.update(frame, 1, true, true)
    expect(visual.debugSnapshot()).toMatchObject({
      reducedMotion: true,
      ashParticleCount: 36,
      lavaTelegraphSegmentCount: 24,
    })
    const reducedAtOneSecond = [...thermalColumns.instanceMatrix.array]
    visual.update(frame, 2, true, true)
    const reducedAtTwoSeconds = [...thermalColumns.instanceMatrix.array]

    expect(reducedAtOneSecond).not.toEqual(moving)
    expect(reducedAtTwoSeconds).not.toEqual(reducedAtOneSecond)
    expect(frame.rockfalls[0]?.phase).toBe('telegraph')
    expect(frame.lavaWave.phase).toBe('telegraph')
  })

  it('hides every pool while inactive or unloaded and disposes all resources', () => {
    const scene = new THREE.Scene()
    const visual = createVolcanicActivities(scene, 'high')
    const root = scene.getObjectByName('M39_VolcanicActivities') as THREE.Group
    const resources = root.children.map((child) => {
      const renderable = child as THREE.Mesh | THREE.Points
      return {
        geometryDispose: vi.spyOn(renderable.geometry, 'dispose'),
        materialDispose: vi.spyOn(
          renderable.material as THREE.Material,
          'dispose',
        ),
      }
    })

    visual.update(sampleVolcanicHazards(0, 80741), 0, false, true)
    expect(root.visible).toBe(false)
    expect(visual.debugSnapshot()).toMatchObject({
      loaded: false,
      active: true,
      drawCalls: 0,
      ashParticleCount: 0,
    })

    visual.update(sampleVolcanicHazards(0, 80741), 0, true, false)
    expect(root.visible).toBe(false)
    expect(visual.debugSnapshot()).toMatchObject({
      loaded: true,
      active: false,
      drawCalls: 0,
    })

    visual.dispose()
    expect(scene.getObjectByName('M39_VolcanicActivities')).toBeUndefined()
    for (const resource of resources) {
      expect(resource.geometryDispose).toHaveBeenCalledOnce()
      expect(resource.materialDispose).toHaveBeenCalledOnce()
    }
    expect(visual.debugSnapshot()).toMatchObject({
      drawCalls: 0,
      disposed: true,
    })
  })
})
