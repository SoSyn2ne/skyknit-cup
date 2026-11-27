import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import {
  generateTerrainScatter,
  getPresetLandmarks,
  getPresetScatterRules,
  isTerrainHoleAt,
  resnapScatterPlacements,
  type TerrainLandmarkAssetId,
  type TerrainLandmarkSpec,
  type TerrainPropAssetId,
  type TerrainScatterPlacement,
} from './terrainInstancer'
import { sampleHeightBilinear } from './heightmapData'
import type { TerrainPresetId, TerrainRegionData } from './terrainTypes'

const PROP_ASSET_URLS: Record<TerrainPropAssetId, string> = {
  'pine-1': '/artifacts/terrain3d-assets/models/quaternius/PineTree_1.glb',
  'pine-3': '/artifacts/terrain3d-assets/models/quaternius/PineTree_3.glb',
  'pine-snow': '/artifacts/terrain3d-assets/models/quaternius/PineTree_Snow_1.glb',
  'common-tree': '/artifacts/terrain3d-assets/models/quaternius/CommonTree_1.glb',
  'birch-autumn':
    '/artifacts/terrain3d-assets/models/quaternius/BirchTree_Autumn_1.glb',
  'dead-tree':
    '/artifacts/terrain3d-assets/models/quaternius/CommonTree_Dead_3.glb',
  cactus: '/artifacts/terrain3d-assets/models/quaternius/Cactus_2.glb',
  bush: '/artifacts/terrain3d-assets/models/quaternius/Bush_1.glb',
  'rock-moss': '/artifacts/terrain3d-assets/models/quaternius/Rock_Moss_1.glb',
  'rock-plain': '/artifacts/terrain3d-assets/models/quaternius/Rock_4.glb',
  'polyhaven-rock':
    '/artifacts/terrain3d-assets/models/rock_07/rock_07_1k.gltf',
  'polyhaven-volcanic-rock':
    '/artifacts/terrain3d-assets/models/moon_rock_01/moon_rock_01_1k.gltf',
}

const LANDMARK_ASSET_URLS: Record<TerrainLandmarkAssetId, string> = {
  windmill:
    '/artifacts/terrain3d-assets/models/quaternius/Windmill_SecondAge.glb',
  temple:
    '/artifacts/terrain3d-assets/models/quaternius/Temple_SecondAge_Level3.glb',
  watchtower:
    '/artifacts/terrain3d-assets/models/quaternius/WatchTower_SecondAge_Level2.glb',
  house:
    '/artifacts/terrain3d-assets/models/quaternius/Houses_SecondAge_1_Level2.glb',
}

const DRAGON_URL = '/assets/models/characters/skyknit-dragon.glb'

interface NormalizedMeshPart {
  readonly geometry: THREE.BufferGeometry
  readonly material: THREE.Material | THREE.Material[]
}

interface NormalizedTemplate {
  readonly parts: readonly NormalizedMeshPart[]
}

export interface TerrainPropsSnapshot {
  readonly visible: boolean
  readonly loading: boolean
  readonly loadedAssetCount: number
  readonly instanceCount: number
  readonly landmarkCount: number
  readonly dragonLoaded: boolean
}

export interface TerrainPropsController {
  readonly group: THREE.Group
  rebuildForRegion(
    region: TerrainRegionData,
    heightScale: number,
  ): Promise<void>
  resnap(region: TerrainRegionData, heightScale: number): void
  setVisible(visible: boolean): void
  update(elapsedSeconds: number): void
  getSnapshot(): TerrainPropsSnapshot
  dispose(): void
}

function normalizeGltfRoot(root: THREE.Object3D): NormalizedTemplate {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1e-4)
  // Normalize every prop so its height/largest span is ~1.0 unit and base sits at y = 0
  const normScale = 1 / maxDim
  const normMatrix = new THREE.Matrix4()
    .makeScale(normScale, normScale, normScale)
    .multiply(
      new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z),
    )

  const parts: NormalizedMeshPart[] = []
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) {
      return
    }
    const geom = obj.geometry.clone()
    const combined = new THREE.Matrix4().multiplyMatrices(
      normMatrix,
      obj.matrixWorld,
    )
    geom.applyMatrix4(combined)
    geom.computeBoundingSphere()

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.roughness = Math.max(mat.roughness, 0.65)
        mat.metalness = Math.min(mat.metalness, 0.08)
        mat.envMapIntensity = 1.0
      }
    }
    parts.push({
      geometry: geom,
      material: obj.material,
    })
  })

  return { parts }
}

function disposeTemplate(template: NormalizedTemplate): void {
  const mats = new Set<THREE.Material>()
  for (const part of template.parts) {
    part.geometry.dispose()
    for (const m of Array.isArray(part.material) ? part.material : [part.material]) {
      mats.add(m)
    }
  }
  for (const m of mats) {
    for (const val of Object.values(m)) {
      if (val instanceof THREE.Texture) {
        val.dispose()
      }
    }
    m.dispose()
  }
}

export function createTerrainProps(): TerrainPropsController {
  const group = new THREE.Group()
  group.name = 'Terrain3D_PropsRoot'

  const scatterContainer = new THREE.Group()
  scatterContainer.name = 'Terrain3D_InstancedScatter'
  const landmarkContainer = new THREE.Group()
  landmarkContainer.name = 'Terrain3D_Landmarks'
  const dragonAnchor = new THREE.Group()
  dragonAnchor.name = 'Terrain3D_SoaringDragon'
  group.add(scatterContainer, landmarkContainer, dragonAnchor)

  const loader = new GLTFLoader()
  const templateCache = new Map<string, Promise<NormalizedTemplate | null>>()
  let loadedAssetCount = 0
  let requestVersion = 0
  let disposed = false
  let visible = true
  let loading = false

  let currentPlacements: TerrainScatterPlacement[] = []
  let activeInstancedGroups = new Map<TerrainPropAssetId, THREE.InstancedMesh[]>()
  let activeLandmarks: Array<{ spec: TerrainLandmarkSpec; object: THREE.Group }> =
    []

  // Load soaring Scarlet Dragon once as living aerial scale landmark
  let dragonLoaded = false
  const dragonRestRotations = new Map<
    THREE.Object3D,
    { readonly y: number; readonly z: number }
  >()

  void loader
    .loadAsync(DRAGON_URL)
    .then((gltf) => {
      if (disposed) {
        return
      }
      const root = gltf.scene
      root.scale.setScalar(2.4)
      root.traverse((obj) => {
        if (/^(WingRig_[LR]|TailRig_\d)$/.test(obj.name)) {
          dragonRestRotations.set(obj, { y: obj.rotation.y, z: obj.rotation.z })
        }
      })
      dragonAnchor.add(root)
      dragonLoaded = true
    })
    .catch(() => {
      // Optional visual scale landmark; keep sandbox resilient if unavailable
    })

  const loadTemplate = (url: string): Promise<NormalizedTemplate | null> => {
    let pending = templateCache.get(url)
    if (pending === undefined) {
      pending = loader
        .loadAsync(url)
        .then((gltf) => {
          loadedAssetCount += 1
          return normalizeGltfRoot(gltf.scene)
        })
        .catch(() => null)
      templateCache.set(url, pending)
    }
    return pending
  }

  const dummy = new THREE.Object3D()

  const writeInstances = (
    placements: readonly TerrainScatterPlacement[],
  ): void => {
    const grouped = new Map<TerrainPropAssetId, TerrainScatterPlacement[]>()
    for (const p of placements) {
      let arr = grouped.get(p.assetId)
      if (arr === undefined) {
        arr = []
        grouped.set(p.assetId, arr)
      }
      arr.push(p)
    }

    for (const [assetId, meshes] of activeInstancedGroups) {
      const list = grouped.get(assetId) ?? []
      for (const instMesh of meshes) {
        const count = Math.min(list.length, instMesh.instanceMatrix.count)
        for (let i = 0; i < count; i += 1) {
          const item = list[i]
          dummy.position.set(item.x, item.y, item.z)
          dummy.rotation.set(item.tiltX, item.rotationY, item.tiltZ)
          dummy.scale.setScalar(item.scale)
          dummy.updateMatrix()
          instMesh.setMatrixAt(i, dummy.matrix)
        }
        instMesh.count = count
        instMesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  const clearActiveObjects = (): void => {
    scatterContainer.clear()
    landmarkContainer.clear()
    activeInstancedGroups = new Map()
    activeLandmarks = []
  }

  const updateLandmarkHeights = (
    region: TerrainRegionData,
    heightScale: number,
  ): void => {
    for (const { spec, object } of activeLandmarks) {
      const hiddenByHole = isTerrainHoleAt(region, spec.x, spec.z)
      object.visible = !hiddenByHole
      const y = sampleHeightBilinear(region, spec.x, spec.z, heightScale)
      object.position.set(spec.x, y - spec.sinkDepth, spec.z)
    }
  }

  const presetDragonFlight = (
    preset: TerrainPresetId,
  ): { centerX: number; centerZ: number; rx: number; rz: number; alt: number } => {
    if (preset === 'wind-canyon') {
      return { centerX: 8, centerZ: -20, rx: 95, rz: 120, alt: 92 }
    }
    if (preset === 'volcanic-caldera') {
      return { centerX: 0, centerZ: 0, rx: 105, rz: 105, alt: 132 }
    }
    return { centerX: -24, centerZ: 28, rx: 118, rz: 125, alt: 94 }
  }

  let currentPreset: TerrainPresetId = 'sky-highlands'

  return {
    group,
    async rebuildForRegion(region, heightScale) {
      const version = ++requestVersion
      currentPreset = region.preset
      loading = true

      const rules = getPresetScatterRules(region.preset)
      const landmarks = getPresetLandmarks(region.preset)
      const placements = generateTerrainScatter(
        region,
        rules,
        landmarks,
        heightScale,
      )

      const propAssetIds = [...new Set(rules.map((r) => r.assetId))]
      const landmarkAssetIds = [...new Set(landmarks.map((l) => l.assetId))]

      const [propTemplates, landmarkTemplates] = await Promise.all([
        Promise.all(
          propAssetIds.map(async (id) => ({
            id,
            template: await loadTemplate(PROP_ASSET_URLS[id]),
          })),
        ),
        Promise.all(
          landmarkAssetIds.map(async (id) => ({
            id,
            template: await loadTemplate(LANDMARK_ASSET_URLS[id]),
          })),
        ),
      ])

      if (disposed || version !== requestVersion) {
        return
      }

      clearActiveObjects()
      currentPlacements = placements

      // Build InstancedMesh batches per prop assetId
      const groupedCounts = new Map<TerrainPropAssetId, number>()
      for (const p of placements) {
        groupedCounts.set(p.assetId, (groupedCounts.get(p.assetId) ?? 0) + 1)
      }

      for (const { id, template } of propTemplates) {
        if (template === null) continue
        const capacity = groupedCounts.get(id) ?? 0
        if (capacity === 0) continue

        const meshes: THREE.InstancedMesh[] = []
        for (const part of template.parts) {
          const inst = new THREE.InstancedMesh(
            part.geometry,
            part.material,
            capacity,
          )
          inst.name = `Terrain3D_Inst_${id}`
          inst.frustumCulled = false
          scatterContainer.add(inst)
          meshes.push(inst)
        }
        activeInstancedGroups.set(id, meshes)
      }

      writeInstances(placements)

      // Build Hero Landmarks
      const landmarkTemplateMap = new Map(
        landmarkTemplates.map((entry) => [entry.id, entry.template]),
      )
      for (const spec of landmarks) {
        const template = landmarkTemplateMap.get(spec.assetId)
        if (!template) continue

        const holder = new THREE.Group()
        holder.name = `Terrain3D_Landmark_${spec.id}`
        for (const part of template.parts) {
          const mesh = new THREE.Mesh(part.geometry, part.material)
          holder.add(mesh)
        }
        holder.scale.setScalar(spec.scale)
        holder.rotation.y = spec.rotationY
        landmarkContainer.add(holder)
        activeLandmarks.push({ spec, object: holder })
      }

      updateLandmarkHeights(region, heightScale)
      loading = false
    },
    resnap(region, heightScale) {
      if (currentPlacements.length === 0) {
        return
      }
      const snapped = resnapScatterPlacements(
        region,
        currentPlacements,
        heightScale,
      )
      writeInstances(snapped)
      updateLandmarkHeights(region, heightScale)
    },
    setVisible(nextVisible) {
      visible = nextVisible
      group.visible = nextVisible
    },
    update(elapsedSeconds) {
      if (!dragonLoaded || !visible) {
        return
      }
      const path = presetDragonFlight(currentPreset)
      const angle = elapsedSeconds * 0.24
      const x = path.centerX + Math.cos(angle) * path.rx
      const z = path.centerZ + Math.sin(angle) * path.rz
      const y = path.alt + Math.sin(elapsedSeconds * 0.9) * 5.5

      const nextAngle = angle + 0.04
      const nx = path.centerX + Math.cos(nextAngle) * path.rx
      const nz = path.centerZ + Math.sin(nextAngle) * path.rz
      const heading = Math.atan2(x - nx, z - nz)

      dragonAnchor.position.set(x, y, z)
      dragonAnchor.rotation.set(
        Math.cos(elapsedSeconds * 0.9) * 0.08,
        heading,
        -0.28,
      )

      for (const [obj, rest] of dragonRestRotations) {
        if (obj.name.startsWith('WingRig')) {
          const side = obj.name.endsWith('L') ? 1 : -1
          obj.rotation.z =
            rest.z + Math.sin(elapsedSeconds * 4.4) * 0.34 * side
        } else if (obj.name.startsWith('TailRig')) {
          const idx = Number(obj.name.at(-1)) || 1
          obj.rotation.y =
            rest.y + Math.sin(elapsedSeconds * 2.6 - idx * 0.5) * 0.09
        }
      }
    },
    getSnapshot() {
      let instanceCount = 0
      for (const meshes of activeInstancedGroups.values()) {
        if (meshes.length > 0) {
          instanceCount += meshes[0].count
        }
      }
      return {
        visible,
        loading,
        loadedAssetCount,
        instanceCount,
        landmarkCount: activeLandmarks.length,
        dragonLoaded,
      }
    },
    dispose() {
      disposed = true
      ++requestVersion
      clearActiveObjects()
      for (const pending of templateCache.values()) {
        void pending.then((tpl) => {
          if (tpl !== null) disposeTemplate(tpl)
        })
      }
      dragonAnchor.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material]
          for (const m of mats) m.dispose()
        }
      })
    },
  }
}
