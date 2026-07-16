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
  clear(): void
  getLoadedRegionIds(): readonly OpenWorldRegionId[]
  debugSnapshot(): OpenWorldDebugSnapshot
  dispose(): void
}

interface RegionAnimationTarget {
  readonly object: THREE.Object3D
  readonly axis: 'y' | 'z'
  readonly radiansPerSecond: number
}

interface LoadedRegion {
  readonly region: OpenWorldRegion
  readonly container: THREE.Group
  asset: THREE.Group | null
  requestVersion: number
  lod: RenderQualityTier
  status: OpenWorldAssetStatus
  lavaTimeUniforms: Array<{ value: number }>
  animationTargets: RegionAnimationTarget[]
  meshCount: number
}

const REGION_BY_ID = new Map(
  OPEN_WORLD_REGIONS.map((region) => [region.id, region]),
)
const HIGH_LOD_ENTER_RADIUS = 220
const HIGH_LOD_EXIT_RADIUS = 260
const FESTIVAL_LANTERN_COLOR = 0xd85a43
const FESTIVAL_LANTERN_EMISSIVE = 0x6b1d14

function assetUrl(
  regionId: OpenWorldRegionId,
  tier: RenderQualityTier,
): string {
  return `${import.meta.env.BASE_URL}assets/models/world/${regionId}-${tier}.glb`
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

function applyShadowPolicy(
  root: THREE.Object3D,
  tier: RenderQualityTier,
  regionId: OpenWorldRegionId,
): void {
  const enabled = tier === 'high'
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const volcanicStaticEnvironment = regionId === 'volcanic-archipelago'
      object.castShadow = enabled && !volcanicStaticEnvironment
      object.receiveShadow =
        enabled &&
        (!volcanicStaticEnvironment || object.name.includes('LandingPad'))
    }
  })
}

function applyVolcanicRenderPolicy(
  root: THREE.Object3D,
  regionId: OpenWorldRegionId,
): void {
  if (regionId !== 'volcanic-archipelago') return

  const convertedMaterials = new Map<THREE.Material, THREE.Material>()
  const convertMaterial = (source: THREE.Material): THREE.Material => {
    const existing = convertedMaterials.get(source)
    if (existing !== undefined) return existing

    if (!(source instanceof THREE.MeshStandardMaterial)) {
      if (source.side !== THREE.FrontSide) {
        source.side = THREE.FrontSide
        source.needsUpdate = true
      }
      convertedMaterials.set(source, source)
      return source
    }

    const converted = new THREE.MeshLambertMaterial({
      name: `${source.name || 'VolcanicSurface'}_Lambert`,
      color: source.color,
      emissive: source.emissive,
      emissiveIntensity: source.emissiveIntensity,
      map: source.map,
      emissiveMap: source.emissiveMap,
      lightMap: source.lightMap,
      lightMapIntensity: source.lightMapIntensity,
      aoMap: source.aoMap,
      aoMapIntensity: source.aoMapIntensity,
      alphaMap: source.alphaMap,
      alphaTest: source.alphaTest,
      vertexColors: source.vertexColors,
      fog: source.fog,
      side: THREE.FrontSide,
      transparent: source.transparent,
      opacity: source.opacity,
      depthTest: source.depthTest,
      depthWrite: source.depthWrite,
      blending: source.blending,
    })
    converted.toneMapped = source.toneMapped
    converted.premultipliedAlpha = source.premultipliedAlpha
    converted.dithering = source.dithering
    converted.userData = { ...source.userData }
    convertedMaterials.set(source, converted)
    return converted
  }

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material)
      ? object.material.map(convertMaterial)
      : convertMaterial(object.material)
  })

  for (const [source, converted] of convertedMaterials) {
    if (source !== converted) source.dispose()
  }
}

function applyFestivalLanternStyle(
  root: THREE.Object3D,
  regionId: OpenWorldRegionId,
): void {
  if (regionId !== 'festival-hub') return

  const styleMaterial = (material: THREE.Material): THREE.Material => {
    const styled = material.clone()
    styled.name = `${material.name || 'FestivalLantern'}_Red`
    if (styled instanceof THREE.MeshStandardMaterial) {
      styled.color.setHex(FESTIVAL_LANTERN_COLOR)
      styled.emissive.setHex(FESTIVAL_LANTERN_EMISSIVE)
      styled.emissiveIntensity = 0.32
      styled.metalness = Math.min(styled.metalness, 0.08)
      styled.roughness = Math.max(styled.roughness, 0.62)
    }
    return styled
  }

  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !object.name.includes('FestivalLanterns')
    ) {
      return
    }
    object.material = Array.isArray(object.material)
      ? object.material.map(styleMaterial)
      : styleMaterial(object.material)
  })
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

function createVolcanicLavaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'M39_VolcanicLava',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 } },
    ]),
    vertexColors: true,
    fog: true,
    side: THREE.FrontSide,
    toneMapped: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vLavaFlow;
      #include <common>
      #include <color_pars_vertex>
      #include <fog_pars_vertex>

      void main() {
        float broadFlow = sin(
          position.x * 0.19 +
          position.z * 0.13 +
          uTime * 1.25
        );
        float crossFlow = sin(
          position.x * -0.31 +
          position.z * 0.27 -
          uTime * 1.82
        );
        vLavaFlow = broadFlow * 0.55 + crossFlow * 0.45;
        #include <color_vertex>
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLavaFlow;
      #include <common>
      #include <color_pars_fragment>
      #include <fog_pars_fragment>

      void main() {
        float veins = smoothstep(0.50, 0.94, vLavaFlow);
        vec3 deepLava = vec3(0.42, 0.018, 0.006);
        vec3 hotLava = vec3(1.0, 0.34, 0.035);
        vec3 lavaColor = mix(deepLava, hotLava, 0.32 + veins * 0.68);
        #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
          lavaColor *= vColor.rgb;
        #endif
        gl_FragColor = vec4(lavaColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  })
}

function applyVolcanicLavaStyle(
  root: THREE.Object3D,
  regionId: OpenWorldRegionId,
): Array<{ value: number }> {
  if (regionId !== 'volcanic-archipelago') return []

  const lavaTimeUniforms: Array<{ value: number }> = []
  const disposedTextures = new Set<THREE.Texture>()
  const disposedMaterials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.includes('LavaSurface')) {
      return
    }
    const previousMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of previousMaterials) {
      if (disposedMaterials.has(material)) continue
      disposeMaterial(material, disposedTextures)
      disposedMaterials.add(material)
    }
    const lavaMaterial = createVolcanicLavaMaterial()
    object.material = lavaMaterial
    lavaTimeUniforms.push(lavaMaterial.uniforms.uTime as { value: number })
  })
  return lavaTimeUniforms
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

function inspectRegionAsset(root: THREE.Object3D): {
  animationTargets: RegionAnimationTarget[]
  meshCount: number
} {
  const animationTargets: RegionAnimationTarget[] = []
  let meshCount = 0

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshCount += 1

    switch (object.userData.animate) {
      case 'beacon':
        animationTargets.push({
          object,
          axis: 'y',
          radiansPerSecond: 0.75,
        })
        break
      case 'wind':
        animationTargets.push({
          object,
          axis: 'z',
          radiansPerSecond: 0.45,
        })
        break
      case 'rune':
        animationTargets.push({
          object,
          axis: 'z',
          radiansPerSecond: -0.24,
        })
        break
    }
  })

  return { animationTargets, meshCount }
}

function removeCurrentAsset(entry: LoadedRegion): void {
  if (entry.asset === null) return
  disposeObject(entry.asset)
  entry.asset = null
  entry.lavaTimeUniforms = []
  entry.animationTargets = []
  entry.meshCount = 0
}

export function createOpenWorld(
  scene: THREE.Scene,
  options: CreateOpenWorldOptions = {},
): OpenWorldVisual {
  const loaded = new Map<OpenWorldRegionId, LoadedRegion>()
  const loader = options.assetLoader ?? createDefaultLoader()
  let qualityTier = options.qualityTier ?? 'high'
  let lastPosition: Vec3Value | null = null
  let loadedRegionIds: readonly OpenWorldRegionId[] = []
  let disposed = false

  const refreshLoadedRegionIds = (): void => {
    loadedRegionIds = [...loaded.keys()]
  }

  const clearLoadedRegions = (): void => {
    for (const entry of loaded.values()) {
      entry.requestVersion += 1
      disposeObject(entry.container)
    }
    loaded.clear()
    refreshLoadedRegionIds()
    lastPosition = null
  }

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
        applyFestivalLanternStyle(asset, entry.region.id)
        entry.lavaTimeUniforms = applyVolcanicLavaStyle(asset, entry.region.id)
        applyVolcanicRenderPolicy(asset, entry.region.id)
        applyShadowPolicy(asset, requestedLod, entry.region.id)
        const inspection = inspectRegionAsset(asset)
        entry.asset = asset
        entry.animationTargets = inspection.animationTargets
        entry.meshCount = inspection.meshCount
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
        applyShadowPolicy(fallback, requestedLod, entry.region.id)
        const inspection = inspectRegionAsset(fallback)
        entry.asset = fallback
        entry.animationTargets = inspection.animationTargets
        entry.meshCount = inspection.meshCount
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
      lod: 'low',
      status: 'loading',
      lavaTimeUniforms: [],
      animationTargets: [],
      meshCount: 0,
    }
    loaded.set(region.id, entry)
    refreshLoadedRegionIds()
    scene.add(container)
    loadRegionAsset(entry, desiredLod(entry, position))
  }

  return {
    update: (position, simulationSeconds) => {
      if (disposed) return
      lastPosition = { ...position }
      const nextIds = getLoadedRegionIds(position, [...loaded.keys()])
      const next = new Set(nextIds)
      for (const [id, entry] of loaded) {
        if (next.has(id)) continue
        entry.requestVersion += 1
        disposeObject(entry.container)
        loaded.delete(id)
        refreshLoadedRegionIds()
      }
      for (const id of nextIds) {
        if (loaded.has(id)) continue
        const region = REGION_BY_ID.get(id)
        if (region !== undefined) addRegion(region, position)
      }
      for (const entry of loaded.values()) {
        ensureRegionLod(entry, position)
        for (const uniform of entry.lavaTimeUniforms) {
          uniform.value = simulationSeconds
        }
        for (const target of entry.animationTargets) {
          target.object.rotation[target.axis] =
            simulationSeconds * target.radiansPerSecond
        }
      }
    },
    setQuality: (tier) => {
      if (disposed) return
      if (tier === qualityTier) return
      qualityTier = tier
      if (lastPosition === null) return
      for (const entry of loaded.values()) {
        ensureRegionLod(entry, lastPosition)
      }
    },
    clear: () => {
      if (disposed) return
      clearLoadedRegions()
    },
    getLoadedRegionIds: () => loadedRegionIds,
    debugSnapshot: () => ({
      loadedRegionIds: [...loadedRegionIds],
      regionGroupCount: loaded.size,
      meshCount: [...loaded.values()].reduce(
        (count, entry) => count + entry.meshCount,
        0,
      ),
      qualityTier,
      regionAssets: [...loaded.values()].map((entry) => ({
        id: entry.region.id,
        lod: entry.lod,
        status: entry.status,
      })),
    }),
    dispose: () => {
      if (disposed) return
      disposed = true
      clearLoadedRegions()
    },
  }
}
