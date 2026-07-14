import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  createOpenWorld,
  type OpenWorldAssetLoader,
} from './createOpenWorld'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function createAsset(name: string): THREE.Group {
  const asset = new THREE.Group()
  asset.name = name
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial(),
  )
  mesh.name = `${name}_Mesh`
  asset.add(mesh)
  return asset
}

async function settleLoads(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('open-world region GLB streaming', () => {
  it('tints festival lanterns away from the collectible coin palette', async () => {
    const sharedGold = new THREE.MeshStandardMaterial({ color: 0xffd96a })
    const asset = new THREE.Group()
    const accent = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedGold)
    accent.name = 'FestivalAccents__festival_hub_high_Mesh'
    const lanterns = new THREE.Mesh(
      new THREE.SphereGeometry(1),
      sharedGold,
    )
    lanterns.name = 'FestivalLanterns__festival_hub_high_Mesh'
    asset.add(accent, lanterns)
    const world = createOpenWorld(new THREE.Scene(), {
      assetLoader: { load: async () => asset },
    })

    world.update({ x: 0, y: 8, z: -40 }, 0)
    await settleLoads()

    expect(lanterns.material).not.toBe(sharedGold)
    expect((lanterns.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(0xd85a43)
    expect(accent.material).toBe(sharedGold)

    world.dispose()
  })

  it('loads, retains, and removes the current quality asset by distance', async () => {
    const scene = new THREE.Scene()
    const load = vi.fn((url: string) =>
      Promise.resolve(createAsset(`Asset_${url}`)),
    )
    const world = createOpenWorld(scene, {
      qualityTier: 'high',
      assetLoader: { load },
    })

    world.update({ x: 0, y: 8, z: -40 }, 0)
    expect(world.debugSnapshot()).toMatchObject({
      loadedRegionIds: ['festival-hub'],
      regionGroupCount: 1,
      qualityTier: 'high',
      regionAssets: [
        { id: 'festival-hub', lod: 'high', status: 'loading' },
      ],
    })
    expect(load).toHaveBeenCalledWith(
      '/assets/models/world/festival-hub-high.glb',
    )

    await settleLoads()
    expect(scene.getObjectByName('RC5_Region_festival-hub')).toBeDefined()
    const highMesh = scene.getObjectByName(
      'Asset_/assets/models/world/festival-hub-high.glb_Mesh',
    ) as THREE.Mesh
    expect(highMesh.castShadow).toBe(true)
    expect(highMesh.receiveShadow).toBe(true)
    expect(world.debugSnapshot().regionAssets).toEqual([
      { id: 'festival-hub', lod: 'high', status: 'loaded' },
    ])

    world.update({ x: 0, y: 8, z: 440 }, 1)
    expect(world.debugSnapshot().loadedRegionIds).toEqual(['festival-hub'])

    world.update({ x: 500, y: 24, z: -680 }, 2)
    await settleLoads()
    expect(world.debugSnapshot().loadedRegionIds).toEqual(['wind-canyon'])
    expect(scene.getObjectByName('RC5_Region_festival-hub')).toBeUndefined()
    expect(scene.getObjectByName('RC5_Region_wind-canyon')).toBeDefined()

    world.dispose()
    expect(world.debugSnapshot().regionGroupCount).toBe(0)
  })

  it('clears loaded regions for a mode transition and can stream them again', async () => {
    const scene = new THREE.Scene()
    const load = vi.fn(async (url: string) => createAsset(url))
    const world = createOpenWorld(scene, {
      qualityTier: 'high',
      assetLoader: { load },
    })

    world.update({ x: 0, y: 8, z: -40 }, 0)
    await settleLoads()
    expect(world.debugSnapshot().regionAssets).toEqual([
      { id: 'festival-hub', lod: 'high', status: 'loaded' },
    ])

    world.clear()
    expect(world.debugSnapshot().loadedRegionIds).toEqual([])
    expect(scene.getObjectByName('RC5_Region_festival-hub')).toBeUndefined()

    world.update({ x: 0, y: 8, z: -40 }, 1)
    await settleLoads()
    expect(load).toHaveBeenCalledTimes(2)
    expect(world.debugSnapshot().regionAssets).toEqual([
      { id: 'festival-hub', lod: 'high', status: 'loaded' },
    ])
  })

  it('replaces loaded region art when the quality tier changes', async () => {
    const scene = new THREE.Scene()
    const assets: THREE.Group[] = []
    const loader: OpenWorldAssetLoader = {
      load: async (url) => {
        const asset = createAsset(url)
        assets.push(asset)
        return asset
      },
    }
    const world = createOpenWorld(scene, {
      qualityTier: 'high',
      assetLoader: loader,
    })

    world.update({ x: 0, y: 8, z: -40 }, 0)
    await settleLoads()
    const highMesh = assets[0].getObjectByName(
      '/assets/models/world/festival-hub-high.glb_Mesh',
    ) as THREE.Mesh
    const disposeHigh = vi.spyOn(highMesh.geometry, 'dispose')

    world.setQuality('low')
    await settleLoads()

    expect(disposeHigh).toHaveBeenCalledOnce()
    expect(world.debugSnapshot()).toMatchObject({
      qualityTier: 'low',
      regionAssets: [
        { id: 'festival-hub', lod: 'low', status: 'loaded' },
      ],
    })
    expect(scene.getObjectByName(
      '/assets/models/world/festival-hub-low.glb',
    )).toBeDefined()
    const lowMesh = scene.getObjectByName(
      '/assets/models/world/festival-hub-low.glb_Mesh',
    ) as THREE.Mesh
    expect(lowMesh.castShadow).toBe(false)
    expect(lowMesh.receiveShadow).toBe(false)
  })

  it('uses low art for distant regions and restores high art when close', async () => {
    const load = vi.fn(async (url: string) => createAsset(url))
    const world = createOpenWorld(new THREE.Scene(), {
      qualityTier: 'high',
      assetLoader: { load },
    })

    world.update({ x: 0, y: 8, z: -40 }, 0)
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-high.glb',
    )

    world.update({ x: 0, y: 8, z: 400 }, 1)
    expect(world.debugSnapshot().regionAssets).toEqual([
      { id: 'festival-hub', lod: 'low', status: 'loading' },
    ])
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-low.glb',
    )

    world.update({ x: 0, y: 8, z: -40 }, 2)
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-high.glb',
    )
  })

  it('uses the 220 enter and 260 exit radii for a newly loaded region', async () => {
    const load = vi.fn(async (url: string) => createAsset(url))
    const world = createOpenWorld(new THREE.Scene(), {
      qualityTier: 'high',
      assetLoader: { load },
    })

    world.update({ x: 0, y: 8, z: 181 }, 0)
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-low.glb',
    )

    world.update({ x: 0, y: 8, z: 179 }, 1)
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-high.glb',
    )

    world.update({ x: 0, y: 8, z: 219 }, 2)
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-high.glb',
    )

    world.update({ x: 0, y: 8, z: 221 }, 3)
    await settleLoads()
    expect(load).toHaveBeenLastCalledWith(
      '/assets/models/world/festival-hub-low.glb',
    )
  })

  it('disposes a stale asset that resolves after its region unloaded', async () => {
    const pending = deferred<THREE.Group>()
    const staleAsset = createAsset('StaleFestivalAsset')
    const staleMesh = staleAsset.getObjectByName(
      'StaleFestivalAsset_Mesh',
    ) as THREE.Mesh
    const disposeGeometry = vi.spyOn(staleMesh.geometry, 'dispose')
    const world = createOpenWorld(new THREE.Scene(), {
      assetLoader: { load: () => pending.promise },
    })

    world.update({ x: 0, y: 8, z: -40 }, 0)
    world.update({ x: 500, y: 24, z: -680 }, 1)
    pending.resolve(staleAsset)
    await settleLoads()

    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(world.debugSnapshot().loadedRegionIds).toEqual(['wind-canyon'])
  })

  it('installs a minimal landing-pad fallback when a GLB fails', async () => {
    const world = createOpenWorld(new THREE.Scene(), {
      assetLoader: { load: () => Promise.reject(new Error('offline')) },
    })

    world.update({ x: 430, y: 28, z: 190 }, 0)
    await settleLoads()

    expect(world.debugSnapshot()).toMatchObject({
      loadedRegionIds: ['cloud-ruins'],
      regionAssets: [
        { id: 'cloud-ruins', lod: 'high', status: 'fallback' },
      ],
    })
  })
})
