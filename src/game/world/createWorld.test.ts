import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { resolveRenderQuality } from '../quality/qualityPolicy'
import { createWorld, type WorldPalette } from './createWorld'

const palette: WorldPalette = {
  skyZenith: '#183154',
  skyHaze: '#e6a06c',
  cloud: '#fff2dc',
  rock: '#596273',
  gateRune: '#4bc7d8',
  wingGold: '#ffc567',
}

const desktopSignals = {
  coarsePointer: false,
  viewportWidth: 1_440,
  devicePixelRatio: 1,
  deviceMemoryGb: 8,
  hardwareConcurrency: 8,
}

describe('RC7 world quality layers', () => {
  it('enables a bounded dawn shadow and atmosphere budget only on high', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const high = resolveRenderQuality({
      preference: 'high',
      ...desktopSignals,
    })
    const low = resolveRenderQuality({
      preference: 'low',
      ...desktopSignals,
    })
    const world = createWorld(scene, camera, palette, high)
    const sun = scene.getObjectByName('RC7_DawnKeyLight')
    const rim = scene.getObjectByName('RC7_SkyRimLight')
    const islandRock = scene.getObjectByName('M3_IslandRockInstances')

    expect(sun).toBeInstanceOf(THREE.DirectionalLight)
    expect(rim).toBeInstanceOf(THREE.DirectionalLight)
    expect(rim?.visible).toBe(true)
    expect(islandRock).toBeInstanceOf(THREE.InstancedMesh)
    expect((sun as THREE.DirectionalLight).castShadow).toBe(true)
    expect((sun as THREE.DirectionalLight).shadow.mapSize.width).toBe(1_024)
    expect((islandRock as THREE.InstancedMesh).receiveShadow).toBe(true)
    expect(world.debugSnapshot()).toMatchObject({
      cloudCount: 32,
      cloudWispCount: 16,
      cloudDeckCount: 8,
      shadowsEnabled: true,
    })

    world.setQuality(low)

    expect((sun as THREE.DirectionalLight).castShadow).toBe(false)
    expect(rim?.visible).toBe(false)
    expect(world.debugSnapshot()).toMatchObject({
      cloudCount: 24,
      cloudWispCount: 12,
      cloudDeckCount: 0,
      shadowsEnabled: false,
    })
  })

  it('spreads the dawn shadow filter instead of leaving a hard cutout', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const high = resolveRenderQuality({
      preference: 'high',
      ...desktopSignals,
    })
    const world = createWorld(scene, camera, palette, high)
    const sun = scene.getObjectByName(
      'RC7_DawnKeyLight',
    ) as THREE.DirectionalLight

    // PCF here filters through a fixed five-tap Vogel disk scaled by this
    // radius, so widening it softens the edge without adding samples. The
    // default of 1 is what leaves the stair-stepped edge.
    expect(sun.shadow.radius).toBeGreaterThan(1)
    expect(world.debugSnapshot().shadowRadius).toBe(sun.shadow.radius)
  })

  it('keeps the race islands readable as faceted authored landforms', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const high = resolveRenderQuality({
      preference: 'high',
      ...desktopSignals,
    })

    createWorld(scene, camera, palette, high)

    const islandRock = scene.getObjectByName('M3_IslandRockInstances')
    const islandTop = scene.getObjectByName('M3_IslandTopInstances')
    const ruinPillars = scene.getObjectByName('M7_RuinPillarInstances')
    const dawnFill = scene.getObjectByName('RC7_DawnFillLight')

    expect(islandRock).toBeInstanceOf(THREE.InstancedMesh)
    expect(islandTop).toBeInstanceOf(THREE.InstancedMesh)
    expect(ruinPillars).toBeInstanceOf(THREE.InstancedMesh)
    expect(dawnFill).toBeInstanceOf(THREE.HemisphereLight)

    const rockInstances = islandRock as THREE.InstancedMesh
    const rockMaterial = rockInstances.material as THREE.MeshStandardMaterial
    const topMaterial = (islandTop as THREE.InstancedMesh)
      .material as THREE.MeshStandardMaterial
    const pillarGeometry = (ruinPillars as THREE.InstancedMesh).geometry
    const instanceRockColor = new THREE.Color()
    const paletteRockColor = new THREE.Color(palette.rock)

    rockInstances.getColorAt(0, instanceRockColor)
    pillarGeometry.computeBoundingBox()

    expect(rockInstances.geometry.getAttribute('position').count).toBeGreaterThan(
      180,
    )
    expect(rockMaterial.color.getHex()).toBe(0xffffff)
    expect(rockMaterial.flatShading).toBe(true)
    expect(rockMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.1)
    expect(instanceRockColor.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      paletteRockColor.getHSL({ h: 0, s: 0, l: 0 }).l,
    )
    expect(topMaterial.color.getHex()).toBe(0xffffff)
    expect(pillarGeometry.boundingBox?.max.y).toBeGreaterThan(2.5)
    expect(
      (dawnFill as THREE.HemisphereLight).groundColor
        .getHSL({ h: 0, s: 0, l: 0 }).l,
    ).toBeGreaterThan(paletteRockColor.getHSL({ h: 0, s: 0, l: 0 }).l)
  })
})
