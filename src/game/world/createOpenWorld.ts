import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { Vec3Value } from '../flight/flightModel'
import type { RenderQualityTier } from '../quality/qualityPolicy'
import {
  OPEN_WORLD_REGIONS,
  getLoadedRegionIds,
  type OpenWorldRegion,
  type OpenWorldRegionId,
} from './openWorldRegions'

export type OpenWorldAssetStatus = 'loading' | 'loaded' | 'fallback'

export interface OpenWorldRegionAssetSnapshot {
  readonly id: OpenWorldRegionId
  readonly lod: RenderQualityTier
  readonly status: OpenWorldAssetStatus
}

export interface OpenWorldDebugSnapshot {
  readonly loadedRegionIds: readonly OpenWorldRegionId[]
  readonly regionGroupCount: number
  readonly meshCount: number
  readonly qualityTier: RenderQualityTier
  readonly regionAssets: readonly OpenWorldRegionAssetSnapshot[]
}

export interface OpenWorldAssetLoader {
  load(url: string): Promise<THREE.Group>
}

export interface CreateOpenWorldOptions {
  readonly qualityTier?: RenderQualityTier
  readonly assetLoader?: OpenWorldAssetLoader
}

export interface OpenWorldVisual {
  update(position: Vec3Value, simulationSeconds: number): void
  setQuality(tier: RenderQualityTier): void
  debugSnapshot(): OpenWorldDebugSnapshot
  dispose(): void
}

interface LoadedRegion {
  readonly region: OpenWorldRegion
  readonly container: THREE.Group
  asset: THREE.Group | null
  requestVersion: number
  lod: RenderQualityTier
  status: OpenWorldAssetStatus
}

const REGION_BY_ID = new Map(
  OPEN_WORLD_REGIONS.map((region) => [region.id, region]),
)
const HIGH_LOD_ENTER_RADIUS = 220
const HIGH_LOD_EXIT_RADIUS = 260

function assetUrl(
  regionId: OpenWorldRegionId,
  tier: RenderQualityTier,
): string {
  return `/assets/models/world/${regionId}-${tier}.glb`
}

function createDefaultLoader(): OpenWorldAssetLoader {
  const loader = new GLTFLoader()
  return {
    load: async (url) => (await loader.loadAsync(url)).scene,
  }
}

function fallbackMaterial(
  color: THREE.ColorRepresentation,
  emissive: THREE.ColorRepresentation,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.38,
    roughness: 0.76,
    metalness: 0.08,
    flatShading: true,
  })
}

function createFallback(region: OpenWorldRegion): THREE.Group {
  const group = new THREE.Group()
  group.name = `RC5_Fallback_${region.id}`

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(
      region.landingPad.radius,
      region.landingPad.radius + 1.5,
      0.8,
      16,
    ),
    fallbackMaterial(0x8f7a51, 0x765720),
  )
  pad.position.set(
    region.landingPad.position.x - region.center.x,
    region.landingPad.position.y - region.center.y,
    region.landingPad.position.z - region.center.z,
  )
  pad.name = 'LandingPad'
  group.add(pad)

  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(region.landingPad.radius * 0.72, 0.35, 6, 24),
    fallbackMaterial(0xd8b852, 0xc78c26),
  )
  marker.position.copy(pad.position)
  marker.position.y += 0.55
  marker.rotation.x = Math.PI / 2
  marker.name = 'FallbackLandingMarker'
  group.add(marker)
  return group
}

function disposeMaterial(
  material: THREE.Material,
  disposedTextures: Set<THREE.Texture>,
): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
      value.dispose()
      disposedTextures.add(value)
    }
  }
  material.dispose()
}

function disposeObject(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>()
  const disposedMaterials = new Set<THREE.Material>()
  const disposedTextures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (!disposedGeometries.has(object.geometry)) {
      object.geometry.dispose()
      disposedGeometries.add(object.geometry)
    }
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (disposedMaterials.has(material)) continue
      disposeMaterial(material, disposedTextures)
      disposedMaterials.add(material)
    }
  })
  root.removeFromParent()
}

function removeCurrentAsset(entry: LoadedRegion): void {
  if (entry.asset === null) return
  disposeObject(entry.asset)
  entry.asset = null
}

export function createOpenWorld(
  scene: THREE.Scene,
  options: CreateOpenWorldOptions = {},
): OpenWorldVisual {
  const loaded = new Map<OpenWorldRegionId, LoadedRegion>()
  const loader = options.assetLoader ?? createDefaultLoader()
  let qualityTier = options.qualityTier ?? 'high'
  let lastPosition: Vec3Value | null = null
  let disposed = false

  const loadRegionAsset = (
    entry: LoadedRegion,
    requestedLod: RenderQualityTier,
  ): void => {
    entry.requestVersion += 1
    const requestVersion = entry.requestVersion
    entry.lod = requestedLod
    entry.status = 'loading'

    void loader.load(assetUrl(entry.region.id, requestedLod)).then(
      (asset) => {
        if (
          disposed ||
          loaded.get(entry.region.id) !== entry ||
          entry.requestVersion !== requestVersion
        ) {
          disposeObject(asset)
          return
        }
        removeCurrentAsset(entry)
        entry.asset = asset
        entry.container.add(asset)
        entry.status = 'loaded'
      },
      () => {
        if (
          disposed ||
          loaded.get(entry.region.id) !== entry ||
          entry.requestVersion !== requestVersion
        ) {
          return
        }
        removeCurrentAsset(entry)
        const fallback = createFallback(entry.region)
        entry.asset = fallback
        entry.container.add(fallback)
        entry.status = 'fallback'
      },
    )
  }

  const desiredLod = (
    entry: LoadedRegion,
    position: Vec3Value,
  ): RenderQualityTier => {
    if (qualityTier === 'low') return 'low'
    const distance = Math.hypot(
      position.x - entry.region.center.x,
      position.z - entry.region.center.z,
    )
    const highRadius =
      entry.lod === 'high' ? HIGH_LOD_EXIT_RADIUS : HIGH_LOD_ENTER_RADIUS
    return distance <= highRadius ? 'high' : 'low'
  }

  const ensureRegionLod = (
    entry: LoadedRegion,
    position: Vec3Value,
  ): void => {
    const nextLod = desiredLod(entry, position)
    if (nextLod !== entry.lod) loadRegionAsset(entry, nextLod)
  }

  const addRegion = (region: OpenWorldRegion, position: Vec3Value): void => {
    const container = new THREE.Group()
    container.name = `RC5_Region_${region.id}`
    container.position.set(region.center.x, region.center.y, region.center.z)
    const entry: LoadedRegion = {
      region,
      container,
      asset: null,
      requestVersion: 0,
      lod: qualityTier,
      status: 'loading',
    }
    loaded.set(region.id, entry)
    scene.add(container)
    loadRegionAsset(entry, desiredLod(entry, position))
  }

  return {
    update: (position, simulationSeconds) => {
      lastPosition = { ...position }
      const nextIds = getLoadedRegionIds(position, [...loaded.keys()])
      const next = new Set(nextIds)
      for (const [id, entry] of loaded) {
        if (next.has(id)) continue
        entry.requestVersion += 1
        disposeObject(entry.container)
        loaded.delete(id)
      }
      for (const id of nextIds) {
        if (loaded.has(id)) continue
        const region = REGION_BY_ID.get(id)
        if (region !== undefined) addRegion(region, position)
      }
      for (const entry of loaded.values()) {
        ensureRegionLod(entry, position)
        entry.container.traverse((object) => {
          if (object.userData.animate === 'beacon') {
            object.rotation.y = simulationSeconds * 0.75
          }
          if (object.userData.animate === 'wind') {
            object.rotation.z = simulationSeconds * 0.45
          }
          if (object.userData.animate === 'rune') {
            object.rotation.z = simulationSeconds * -0.24
          }
        })
      }
    },
    setQuality: (tier) => {
      if (tier === qualityTier) return
      qualityTier = tier
      if (lastPosition === null) return
      for (const entry of loaded.values()) {
        ensureRegionLod(entry, lastPosition)
      }
    },
    debugSnapshot: () => ({
      loadedRegionIds: [...loaded.keys()],
      regionGroupCount: loaded.size,
      meshCount: [...loaded.values()].reduce((count, entry) => {
        let groupCount = 0
        entry.container.traverse((object) => {
          if (object instanceof THREE.Mesh) groupCount += 1
        })
        return count + groupCount
      }, 0),
      qualityTier,
      regionAssets: [...loaded.values()].map((entry) => ({
        id: entry.region.id,
        lod: entry.lod,
        status: entry.status,
      })),
    }),
    dispose: () => {
      disposed = true
      for (const entry of loaded.values()) {
        entry.requestVersion += 1
        disposeObject(entry.container)
      }
      loaded.clear()
    },
  }
}
