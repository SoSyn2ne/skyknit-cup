import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import {
  CHARACTER_ACCESSORIES,
  CHARACTER_CATALOG,
  CHARACTER_PALETTES,
  normalizeCharacterLoadout,
  type CharacterAccessoryDefinition,
  type CharacterLoadout,
  type CharacterMotionProfile,
  type CharacterPaletteDefinition,
} from '../customization/characterCatalog'
import {
  getVisualPitchRadians,
  type FlightState,
} from '../flight/flightModel'
import type { DragonPoseState } from './dragonPose'

export interface DragonPalette {
  readonly ink: string
  readonly dragonEmber: string
  readonly wingGold: string
  readonly collisionCoral: string
}

export type DragonAppearance = 'player' | 'ghost'

export interface CreateDragonOptions {
  readonly appearance?: DragonAppearance
  readonly loadout?: CharacterLoadout
}

export const GHOST_DRAGON_VISUAL_SPEC = Object.freeze({
  teal: '#62e9df',
  opacity: 0.42,
  emissiveIntensity: 0.72,
  renderOrder: 4,
})

export interface DragonDebugSnapshot {
  readonly appearance: DragonAppearance
  readonly loadout: CharacterLoadout
  readonly source: 'fallback' | 'glb'
  readonly meshCount: number
  readonly tailSegmentCount: number
  readonly expressionNodeCount: number
  readonly breathScale: number
  readonly blinkAmount: number
  readonly jawOpenRadians: number
  readonly shadowsEnabled: boolean
}

export interface DragonVisual {
  readonly movementRoot: THREE.Group
  readonly ready: Promise<'fallback' | 'glb'>
  update(
    flight: FlightState,
    pose: DragonPoseState,
  ): void
  setShadows(enabled: boolean): void
  debugSnapshot(): DragonDebugSnapshot
  dispose(): void
}

interface RigParts {
  readonly bodyRoot: THREE.Object3D
  readonly leftWing: THREE.Object3D
  readonly rightWing: THREE.Object3D
  readonly head: THREE.Object3D
  readonly tail: readonly THREE.Object3D[]
  readonly jaw: THREE.Object3D | null
  readonly eyes: readonly THREE.Object3D[]
  readonly materialStates: readonly MaterialState[]
}

interface MaterialState {
  readonly material: THREE.MeshStandardMaterial
  readonly emissive: THREE.Color
  readonly emissiveIntensity: number
}

interface GuardianMotionProfile {
  readonly wingFlapScale: number
  readonly wingFoldScale: number
  readonly headPitchScale: number
  readonly tailYawScale: number
  readonly jawScale: number
  readonly bodyBobScale: number
  readonly breathScale: number
  readonly bankScale: number
}

const GUARDIAN_MOTION_PROFILES: Readonly<
  Record<CharacterMotionProfile, GuardianMotionProfile>
> = Object.freeze({
  dragon: Object.freeze({
    wingFlapScale: 1,
    wingFoldScale: 1,
    headPitchScale: 1,
    tailYawScale: 1,
    jawScale: 1,
    bodyBobScale: 1,
    breathScale: 1,
    bankScale: 1,
  }),
  avian: Object.freeze({
    wingFlapScale: 1.18,
    wingFoldScale: 0.82,
    headPitchScale: 0.8,
    tailYawScale: 1.25,
    jawScale: 0.65,
    bodyBobScale: 0.45,
    breathScale: 0.78,
    bankScale: 0.9,
  }),
  feline: Object.freeze({
    wingFlapScale: 0.92,
    wingFoldScale: 0.9,
    headPitchScale: 0.6,
    tailYawScale: 0.9,
    jawScale: 0.8,
    bodyBobScale: 0.18,
    breathScale: 0.4,
    bankScale: 0.45,
  }),
})

function captureMaterialStates(
  materials: Iterable<THREE.MeshStandardMaterial>,
): readonly MaterialState[] {
  return [...materials].map((material) => ({
    material,
    emissive: material.emissive.clone(),
    emissiveIntensity: material.emissiveIntensity,
  }))
}

type CharacterMaterialRole = 'body' | 'membrane' | 'glow'

function getCharacterMaterialRole(
  object: THREE.Object3D,
  material: THREE.Material,
): CharacterMaterialRole | null {
  const roleName = `${object.name} ${material.name}`
  if (/glow|rune|emissive/i.test(roleName)) return 'glow'
  if (/membrane|wing|feather|fin|gold/i.test(roleName)) {
    return 'membrane'
  }
  if (/body|ember|hide|fur|scale|plumage/i.test(roleName)) return 'body'
  return null
}

function setTintableMaterialColor(
  material: THREE.Material,
  color: THREE.ColorRepresentation,
  strength = 1,
): void {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshBasicMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshToonMaterial ||
    material instanceof THREE.MeshMatcapMaterial
  ) {
    material.color.lerp(new THREE.Color(color), strength)
  }
}

function applyCharacterPalette(
  root: THREE.Object3D,
  palette: CharacterPaletteDefinition,
  bodyTintStrength: number,
): void {
  const replacements = new Map<
    THREE.Material,
    Map<CharacterMaterialRole, THREE.Material>
  >()

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    const tintedMaterials = materials.map((source) => {
      const role = getCharacterMaterialRole(object, source)
      if (role === null) return source

      let roleReplacements = replacements.get(source)
      if (roleReplacements === undefined) {
        roleReplacements = new Map()
        replacements.set(source, roleReplacements)
      }
      const existing = roleReplacements.get(role)
      if (existing !== undefined) return existing

      const replacement = source.clone()
      replacement.name = source.name
      const color = palette[role]
      setTintableMaterialColor(
        replacement,
        color,
        role === 'body' ? bodyTintStrength : 1,
      )
      if (
        role === 'glow' &&
        (replacement instanceof THREE.MeshStandardMaterial ||
          replacement instanceof THREE.MeshLambertMaterial ||
          replacement instanceof THREE.MeshPhongMaterial ||
          replacement instanceof THREE.MeshToonMaterial)
      ) {
        replacement.emissive.set(color)
        replacement.emissiveIntensity = Math.max(
          replacement.emissiveIntensity,
          0.72,
        )
      }
      replacement.needsUpdate = true
      roleReplacements.set(role, replacement)
      return replacement
    })

    object.material = Array.isArray(object.material)
      ? tintedMaterials
      : (tintedMaterials[0] ?? object.material)
  })

  const attachedMaterials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) attachedMaterials.add(material)
  })
  for (const source of replacements.keys()) {
    if (!attachedMaterials.has(source)) source.dispose()
  }
}

function resolveAssetUrl(modelPath: string): string {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${baseUrl}${modelPath.replace(/^\/+/, '')}`
}

function attachAccessory(
  characterRoot: THREE.Object3D,
  accessoryRoot: THREE.Object3D,
  accessory: CharacterAccessoryDefinition,
): boolean {
  const anchor =
    accessory.anchor === 'head'
      ? characterRoot.getObjectByName('AccessorySocket_Head') ??
        characterRoot.getObjectByName('HeadRig')
      : accessory.anchor === 'tail'
        ? characterRoot.getObjectByName('AccessorySocket_Tail') ??
          characterRoot.getObjectByName('TailRig_5')
        : undefined
  if (anchor === undefined) return false

  accessoryRoot.name =
    accessory.id === 'wind-goggles'
      ? 'M37_WindGogglesAsset'
      : 'M37_FestivalRibbonAsset'
  anchor.add(accessoryRoot)
  return true
}

function ghostUsesGold(
  object: THREE.Object3D,
  material: THREE.Material,
): boolean {
  return /wing|gold|membrane|horn|crest|claw|eye/i.test(
    `${object.name} ${material.name}`,
  )
}

function createGhostMaterial(
  source: THREE.Material,
  color: THREE.ColorRepresentation,
): THREE.Material {
  const material = source.clone()
  material.name = `M33_Ghost_${source.name || source.type}`
  material.transparent = true
  material.opacity = GHOST_DRAGON_VISUAL_SPEC.opacity
  material.depthWrite = false
  material.blending = THREE.NormalBlending
  material.dithering = true
  material.userData.skyLeagueGhost = true

  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshBasicMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshToonMaterial ||
    material instanceof THREE.MeshMatcapMaterial
  ) {
    material.color.set(color)
    material.vertexColors = false
  }
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshToonMaterial
  ) {
    material.emissive.set(color)
    material.emissiveIntensity =
      GHOST_DRAGON_VISUAL_SPEC.emissiveIntensity
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    material.roughness = Math.min(material.roughness, 0.48)
  }
  material.needsUpdate = true
  return material
}

function applyGhostAppearance(
  root: THREE.Object3D,
  palette: DragonPalette,
): void {
  const replacements = new Map<string, THREE.Material>()
  const sourceMaterials = new Set<THREE.Material>()

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    const ghostMaterials = materials.map((material) => {
      sourceMaterials.add(material)
      const color = ghostUsesGold(object, material)
        ? palette.wingGold
        : GHOST_DRAGON_VISUAL_SPEC.teal
      const replacementKey = `${material.uuid}:${color}`
      const existing = replacements.get(replacementKey)
      if (existing !== undefined) return existing

      const replacement = createGhostMaterial(material, color)
      replacements.set(replacementKey, replacement)
      return replacement
    })

    object.material = Array.isArray(object.material)
      ? ghostMaterials
      : (ghostMaterials[0] ?? object.material)
    object.castShadow = false
    object.receiveShadow = false
    object.renderOrder = GHOST_DRAGON_VISUAL_SPEC.renderOrder
    object.userData.skyLeagueGhost = true
  })

  for (const material of sourceMaterials) material.dispose()
}

function createWingGeometry(side: -1 | 1): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0,
    side * 2.2, 0.12, 0.18,
    side * 1.62, -0.08, 1.12,
    0, 0, 0,
    side * 1.62, -0.08, 1.12,
    side * 0.38, -0.16, 0.78,
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function createFallbackDragon(
  palette: DragonPalette,
  appearance: DragonAppearance,
): { readonly root: THREE.Group; readonly rig: RigParts } {
  const ember = new THREE.MeshStandardMaterial({
    color: palette.dragonEmber,
    roughness: 0.66,
    flatShading: true,
  })
  const emberDark = new THREE.MeshStandardMaterial({
    color: 0x6f1f24,
    roughness: 0.72,
    flatShading: true,
  })
  const gold = new THREE.MeshStandardMaterial({
    color: palette.wingGold,
    roughness: 0.56,
    side: THREE.DoubleSide,
    flatShading: true,
  })
  ember.name = 'Dragon_Ember'
  emberDark.name = 'Dragon_EmberDark'
  gold.name = 'Dragon_WingGold'
  const root = new THREE.Group()
  root.name =
    appearance === 'ghost'
      ? 'M33_SkyLeagueGhostDragonFallback'
      : 'M3_DragonFallback'
  const bodyRoot = new THREE.Group()
  root.add(bodyRoot)

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.5, 2.05, 6, 1),
    ember,
  )
  body.rotation.x = Math.PI / 2
  bodyRoot.add(body)

  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), ember)
  head.position.set(0, 0.18, -1.48)
  head.scale.set(0.92, 0.82, 1.16)
  bodyRoot.add(head)

  const tailMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.27, 2.25, 6),
    emberDark,
  )
  tailMesh.position.set(0, -0.05, 1.75)
  tailMesh.rotation.x = -Math.PI / 2
  bodyRoot.add(tailMesh)

  const leftWing = new THREE.Group()
  leftWing.position.set(-0.24, 0.18, -0.25)
  leftWing.add(new THREE.Mesh(createWingGeometry(-1), gold))
  bodyRoot.add(leftWing)
  const rightWing = new THREE.Group()
  rightWing.position.set(0.24, 0.18, -0.25)
  rightWing.add(new THREE.Mesh(createWingGeometry(1), gold))
  bodyRoot.add(rightWing)

  if (appearance === 'ghost') applyGhostAppearance(root, palette)

  const materials = new Set<THREE.MeshStandardMaterial>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of objectMaterials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        materials.add(material)
      }
    }
  })

  return {
    root,
    rig: {
      bodyRoot,
      leftWing,
      rightWing,
      head,
      tail: [tailMesh],
      jaw: null,
      eyes: [],
      materialStates: captureMaterialStates(materials),
    },
  }
}

function collectRig(scene: THREE.Object3D): RigParts | null {
  const bodyRoot = scene.getObjectByName('DragonRoot')
  const leftWing = scene.getObjectByName('WingRig_L')
  const rightWing = scene.getObjectByName('WingRig_R')
  const head = scene.getObjectByName('HeadRig')
  const jaw = scene.getObjectByName('JawRig') ?? null
  const eyes = ['EyeRig_L', 'EyeRig_R']
    .map((name) => scene.getObjectByName(name))
    .filter((part): part is THREE.Object3D => part !== undefined)
  const tail = [1, 2, 3, 4, 5]
    .map((index) => scene.getObjectByName(`TailRig_${index}`))
    .filter((part): part is THREE.Object3D => part !== undefined)

  if (
    bodyRoot === undefined ||
    leftWing === undefined ||
    rightWing === undefined ||
    head === undefined ||
    tail.length !== 5
  ) {
    return null
  }

  const materials = new Set<THREE.MeshStandardMaterial>()
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }

    object.castShadow = false
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of objectMaterials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        materials.add(material)
      }
    }
  })

  return {
    bodyRoot,
    leftWing,
    rightWing,
    head,
    tail,
    jaw,
    eyes,
    materialStates: captureMaterialStates(materials),
  }
}

function disposeObject(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>()
  const disposedMaterials = new Set<THREE.Material>()
  const disposedTextures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    if (!disposedGeometries.has(object.geometry)) {
      object.geometry.dispose()
      disposedGeometries.add(object.geometry)
    }
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (disposedMaterials.has(material)) continue
      for (const value of Object.values(material)) {
        if (
          value instanceof THREE.Texture &&
          !disposedTextures.has(value)
        ) {
          value.dispose()
          disposedTextures.add(value)
        }
      }
      material.dispose()
      disposedMaterials.add(material)
    }
  })
  root.removeFromParent()
}

function setObjectShadows(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = enabled
      object.receiveShadow = false
    }
  })
}

export function createDragon(
  palette: DragonPalette,
  options: CreateDragonOptions = {},
): DragonVisual {
  const appearance = options.appearance ?? 'player'
  const loadout = normalizeCharacterLoadout(options.loadout)
  const character =
    CHARACTER_CATALOG.find((entry) => entry.id === loadout.characterId) ??
    CHARACTER_CATALOG[0]
  const characterPalette =
    CHARACTER_PALETTES.find((entry) => entry.id === loadout.paletteId) ??
    CHARACTER_PALETTES[0]
  const accessory =
    CHARACTER_ACCESSORIES.find((entry) => entry.id === loadout.accessoryId) ??
    CHARACTER_ACCESSORIES[0]
  const motionProfile = GUARDIAN_MOTION_PROFILES[character.motionProfile]
  const isGhost = appearance === 'ghost'
  const movementRoot = new THREE.Group()
  movementRoot.name = isGhost
    ? 'M33_SkyLeagueGhostDragonMovementRoot'
    : 'M3_DragonMovementRoot'
  movementRoot.userData.skyLeagueGhost = isGhost
  const poseRoot = new THREE.Group()
  poseRoot.name = isGhost
    ? 'M33_SkyLeagueGhostDragonPoseRoot'
    : 'M3_DragonPoseRoot'
  movementRoot.add(poseRoot)
  const fallback = createFallbackDragon(palette, appearance)
  poseRoot.add(fallback.root)

  let rig = fallback.rig
  let source: 'fallback' | 'glb' = 'fallback'
  let meshCount = 4
  let disposed = false
  let breathScale = 1
  let blinkAmount = 0
  let jawOpenRadians = 0
  let shadowsEnabled = false
  let loadedAsset: THREE.Object3D | null = null
  const hitColor = new THREE.Color(palette.collisionCoral)
  const forceFallback =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('forceDragonFailure') ===
      '1'
  const loader = new GLTFLoader()
  const ready = (async (): Promise<'fallback' | 'glb'> => {
    if (forceFallback) return 'fallback'

    let characterAsset: THREE.Object3D | null = null
    let accessoryAsset: THREE.Object3D | null = null
    try {
      const gltf = await loader.loadAsync(resolveAssetUrl(character.modelPath))
      characterAsset = gltf.scene
      if (disposed) {
        disposeObject(characterAsset)
        return 'fallback'
      }

      applyCharacterPalette(
        characterAsset,
        characterPalette,
        character.bodyTintStrength,
      )

      if (accessory.modelPath !== null) {
        const accessoryGltf = await loader.loadAsync(
          resolveAssetUrl(accessory.modelPath),
        )
        accessoryAsset = accessoryGltf.scene
        if (disposed) {
          disposeObject(characterAsset)
          disposeObject(accessoryAsset)
          return 'fallback'
        }
        if (!attachAccessory(characterAsset, accessoryAsset, accessory)) {
          disposeObject(characterAsset)
          disposeObject(accessoryAsset)
          return 'fallback'
        }
      }

      if (isGhost) applyGhostAppearance(characterAsset, palette)
      const loadedRig = collectRig(characterAsset)
      if (loadedRig === null) {
        disposeObject(characterAsset)
        return 'fallback'
      }

      characterAsset.name = isGhost
        ? 'M33_SkyLeagueGhostDragonAsset'
        : loadout.characterId === 'sunrise-dragon'
          ? 'M3_SkyknotDragonAsset'
          : `M37_${loadout.characterId}_Asset`
      characterAsset.scale.setScalar(0.34)
      characterAsset.position.set(0, -1.32, 0.08)
      setObjectShadows(characterAsset, shadowsEnabled)
      poseRoot.add(characterAsset)
      loadedAsset = characterAsset
      fallback.root.visible = false
      rig = loadedRig
      source = 'glb'
      meshCount = 0
      characterAsset.traverse((object) => {
        if (object instanceof THREE.Mesh) meshCount += 1
      })
      return source
    } catch {
      if (characterAsset !== null && characterAsset !== loadedAsset) {
        disposeObject(characterAsset)
      }
      if (accessoryAsset !== null && accessoryAsset.parent === null) {
        disposeObject(accessoryAsset)
      }
      return 'fallback'
    }
  })()

  return {
    movementRoot,
    ready,
    update: (flight, pose) => {
      if (disposed) return
      breathScale = pose.breathScale
      blinkAmount = pose.blinkAmount
      jawOpenRadians = pose.jawOpenRadians
      movementRoot.position.set(
        flight.position.x,
        flight.position.y,
        flight.position.z,
      )
      movementRoot.rotation.y = -flight.headingRadians
      poseRoot.rotation.x = getVisualPitchRadians(flight) + pose.recoilRadians
      poseRoot.position.y =
        pose.wingFlapRadians * 0.08 * motionProfile.bodyBobScale
      poseRoot.rotation.z =
        pose.shoulderBankRadians * motionProfile.bankScale
      poseRoot.scale.set(
        1,
        1 + (pose.breathScale - 1) * motionProfile.breathScale,
        1,
      )
      rig.bodyRoot.rotation.z =
        (pose.bodyBankRadians - pose.shoulderBankRadians) *
        motionProfile.bankScale
      rig.head.rotation.x =
        pose.headPitchRadians * motionProfile.headPitchScale
      if (rig.jaw !== null) {
        rig.jaw.rotation.x = pose.jawOpenRadians * motionProfile.jawScale
      }
      for (const eye of rig.eyes) {
        eye.scale.y = Math.max(0.08, 1 - pose.blinkAmount * 0.92)
      }

      const wingRotation =
        pose.wingFlapRadians * motionProfile.wingFlapScale +
        pose.wingFoldRadians * motionProfile.wingFoldScale
      rig.leftWing.rotation.z = wingRotation
      rig.rightWing.rotation.z = -wingRotation

      for (const [index, tail] of rig.tail.entries()) {
        tail.rotation.y =
          (pose.tailYawRadians[index] ?? 0) * motionProfile.tailYawScale
      }

      const feedbackActive = pose.recoilRadians < -0.01
      for (const state of rig.materialStates) {
        state.material.emissive.copy(
          feedbackActive ? hitColor : state.emissive,
        )
        state.material.emissiveIntensity = feedbackActive
          ? 0.45
          : state.emissiveIntensity
      }
    },
    setShadows: (enabled) => {
      if (disposed) return
      shadowsEnabled = !isGhost && enabled
      setObjectShadows(fallback.root, shadowsEnabled)
      if (source === 'glb') {
        if (loadedAsset !== null) {
          setObjectShadows(loadedAsset, shadowsEnabled)
        }
      }
    },
    debugSnapshot: () => ({
      appearance,
      loadout: { ...loadout },
      source,
      meshCount,
      tailSegmentCount: rig.tail.length,
      expressionNodeCount: rig.eyes.length + (rig.jaw === null ? 0 : 1),
      breathScale,
      blinkAmount,
      jawOpenRadians,
      shadowsEnabled,
    }),
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeObject(fallback.root)
      if (loadedAsset !== null) {
        disposeObject(loadedAsset)
        loadedAsset = null
      }
      poseRoot.removeFromParent()
    },
  }
}
