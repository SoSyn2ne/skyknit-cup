import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loaderMock = vi.hoisted(() => ({
  loadAsync: vi.fn(),
}))

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(url: string): Promise<{ scene: THREE.Group }> {
      return loaderMock.loadAsync(url)
    }
  },
}))

import {
  createDragon,
  GHOST_DRAGON_VISUAL_SPEC,
  type DragonPalette,
} from './createDragon'

const PALETTE: DragonPalette = {
  ink: '#171820',
  dragonEmber: '#c84c38',
  wingGold: '#f4cc65',
  collisionCoral: '#ff766d',
}

function createValidDragonAsset(): THREE.Group {
  const scene = new THREE.Group()
  const bodyRoot = new THREE.Group()
  bodyRoot.name = 'DragonRoot'
  scene.add(bodyRoot)

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ba4338' })
  bodyMaterial.name = 'Dragon_Ember'
  bodyMaterial.vertexColors = true
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), bodyMaterial)
  body.name = 'Dragon_Body'
  bodyRoot.add(body)

  const wingMaterial = new THREE.MeshStandardMaterial({ color: '#e9b84c' })
  wingMaterial.name = 'Dragon_WingGold'
  wingMaterial.vertexColors = true
  for (const side of ['L', 'R'] as const) {
    const wing = new THREE.Group()
    wing.name = `WingRig_${side}`
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      wingMaterial,
    )
    mesh.name = `Dragon_Wing_${side}`
    wing.add(mesh)
    bodyRoot.add(wing)
  }

  const head = new THREE.Group()
  head.name = 'HeadRig'
  bodyRoot.add(head)
  for (let index = 1; index <= 5; index += 1) {
    const tail = new THREE.Group()
    tail.name = `TailRig_${index}`
    bodyRoot.add(tail)
  }

  return scene
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return meshes
}

describe('Sky League ghost dragon appearance', () => {
  beforeEach(() => {
    loaderMock.loadAsync.mockReset()
    vi.stubGlobal('window', { location: { search: '' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the default player names, opaque materials, and shadow control', async () => {
    loaderMock.loadAsync.mockRejectedValue(new Error('fallback'))

    const dragon = createDragon(PALETTE)

    await expect(dragon.ready).resolves.toBe('fallback')
    expect(dragon.movementRoot.name).toBe('M3_DragonMovementRoot')
    expect(
      dragon.movementRoot.getObjectByName('M3_DragonFallback'),
    ).toBeDefined()

    dragon.setShadows(true)
    const meshes = collectMeshes(dragon.movementRoot)
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every((mesh) => mesh.castShadow)).toBe(true)
    expect(
      meshes.every((mesh) => {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        return materials.every(
          (material) => !material.transparent && material.depthWrite,
        )
      }),
    ).toBe(true)
  })

  it('renders the fallback as a translucent teal and gold no-shadow ghost', async () => {
    loaderMock.loadAsync.mockRejectedValue(new Error('fallback'))

    const dragon = createDragon(PALETTE, { appearance: 'ghost' })

    await expect(dragon.ready).resolves.toBe('fallback')
    expect(dragon.movementRoot.name).toBe(
      'M33_SkyLeagueGhostDragonMovementRoot',
    )
    const fallback = dragon.movementRoot.getObjectByName(
      'M33_SkyLeagueGhostDragonFallback',
    )
    expect(fallback).toBeDefined()

    dragon.setShadows(true)
    const meshes = collectMeshes(dragon.movementRoot)
    const colors = new Set<number>()
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(false)
      expect(mesh.receiveShadow).toBe(false)
      expect(mesh.renderOrder).toBe(GHOST_DRAGON_VISUAL_SPEC.renderOrder)
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        expect(material.transparent).toBe(true)
        expect(material.opacity).toBe(GHOST_DRAGON_VISUAL_SPEC.opacity)
        expect(material.depthWrite).toBe(false)
        expect(material.blending).toBe(THREE.NormalBlending)
        if (material instanceof THREE.MeshStandardMaterial) {
          colors.add(material.color.getHex())
        }
      }
    }
    expect(colors).toContain(new THREE.Color(PALETTE.wingGold).getHex())
    expect(colors).toContain(
      new THREE.Color(GHOST_DRAGON_VISUAL_SPEC.teal).getHex(),
    )
    expect(dragon.debugSnapshot()).toMatchObject({
      appearance: 'ghost',
      shadowsEnabled: false,
    })
  })

  it('restyles loaded GLB materials and disposes the ghost exactly once', async () => {
    const asset = createValidDragonAsset()
    loaderMock.loadAsync.mockResolvedValue({ scene: asset })

    const dragon = createDragon(PALETTE, { appearance: 'ghost' })

    await expect(dragon.ready).resolves.toBe('glb')
    expect(
      dragon.movementRoot.getObjectByName(
        'M33_SkyLeagueGhostDragonAsset',
      ),
    ).toBe(asset)

    const meshes = collectMeshes(asset)
    expect(meshes).toHaveLength(3)
    expect(
      meshes.every((mesh) => {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        return materials.every(
          (material) =>
            material.transparent &&
            material.opacity === GHOST_DRAGON_VISUAL_SPEC.opacity &&
            !material.depthWrite &&
            (!(material instanceof THREE.MeshStandardMaterial) ||
              !material.vertexColors),
        )
      }),
    ).toBe(true)

    let geometryDisposals = 0
    let materialDisposals = 0
    for (const mesh of meshes) {
      mesh.geometry.addEventListener('dispose', () => {
        geometryDisposals += 1
      })
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        material.addEventListener('dispose', () => {
          materialDisposals += 1
        })
      }
    }

    dragon.dispose()
    const disposalCounts = { geometryDisposals, materialDisposals }
    expect(dragon.movementRoot.children).toHaveLength(0)
    expect(geometryDisposals).toBeGreaterThan(0)
    expect(materialDisposals).toBeGreaterThan(0)

    dragon.dispose()
    expect({ geometryDisposals, materialDisposals }).toEqual(
      disposalCounts,
    )
  })
})
