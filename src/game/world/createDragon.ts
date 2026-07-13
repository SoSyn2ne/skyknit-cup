import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

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

export interface DragonDebugSnapshot {
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

function captureMaterialStates(
  materials: Iterable<THREE.MeshStandardMaterial>,
): readonly MaterialState[] {
  return [...materials].map((material) => ({
    material,
    emissive: material.emissive.clone(),
    emissiveIntensity: material.emissiveIntensity,
  }))
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
  const charcoal = new THREE.MeshStandardMaterial({
    color: palette.ink,
    roughness: 0.82,
    flatShading: true,
  })
  const root = new THREE.Group()
  root.name = 'M3_DragonFallback'
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
      materialStates: captureMaterialStates([
        ember,
        emberDark,
        gold,
        charcoal,
      ]),
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
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    object.geometry.dispose()
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      material.dispose()
    }
  })
}

function setObjectShadows(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = enabled
      object.receiveShadow = false
    }
  })
}

export function createDragon(palette: DragonPalette): DragonVisual {
  const movementRoot = new THREE.Group()
  movementRoot.name = 'M3_DragonMovementRoot'
  const poseRoot = new THREE.Group()
  movementRoot.add(poseRoot)
  const fallback = createFallbackDragon(palette)
  poseRoot.add(fallback.root)

  let rig = fallback.rig
  let source: 'fallback' | 'glb' = 'fallback'
  let meshCount = 4
  let disposed = false
  let breathScale = 1
  let blinkAmount = 0
  let jawOpenRadians = 0
  let shadowsEnabled = false
  const hitColor = new THREE.Color(palette.collisionCoral)
  const forceFallback =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('forceDragonFailure') ===
      '1'
  const loader = new GLTFLoader()
  const ready = (forceFallback
    ? Promise.resolve({ scene: null })
    : loader.loadAsync(
        `${import.meta.env.BASE_URL}assets/models/skyknit-dragon.glb`,
      ))
    .then((gltf) => {
      if (gltf.scene === null) {
        return 'fallback' as const
      }
      const loadedRig = collectRig(gltf.scene)

      if (disposed || loadedRig === null) {
        disposeObject(gltf.scene)
        return 'fallback' as const
      }

      gltf.scene.name = 'M3_SkyknotDragonAsset'
      gltf.scene.scale.setScalar(0.34)
      gltf.scene.position.set(0, -1.32, 0.08)
      setObjectShadows(gltf.scene, shadowsEnabled)
      poseRoot.add(gltf.scene)
      fallback.root.visible = false
      rig = loadedRig
      source = 'glb'
      meshCount = 0
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshCount += 1
        }
      })
      return source
    })
    .catch(() => 'fallback' as const)

  return {
    movementRoot,
    ready,
    update: (flight, pose) => {
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
      poseRoot.rotation.z = pose.shoulderBankRadians
      poseRoot.scale.set(1, pose.breathScale, 1)
      rig.bodyRoot.rotation.z =
        pose.bodyBankRadians - pose.shoulderBankRadians
      rig.head.rotation.x = pose.headPitchRadians
      if (rig.jaw !== null) {
        rig.jaw.rotation.x = pose.jawOpenRadians
      }
      for (const eye of rig.eyes) {
        eye.scale.y = Math.max(0.08, 1 - pose.blinkAmount * 0.92)
      }

      rig.leftWing.rotation.z = pose.wingFlapRadians + pose.wingFoldRadians
      rig.rightWing.rotation.z = -pose.wingFlapRadians - pose.wingFoldRadians

      for (const [index, tail] of rig.tail.entries()) {
        tail.rotation.y = pose.tailYawRadians[index] ?? 0
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
      shadowsEnabled = enabled
      setObjectShadows(fallback.root, enabled)
      if (source === 'glb') {
        const loadedAsset = poseRoot.getObjectByName('M3_SkyknotDragonAsset')
        if (loadedAsset !== undefined) {
          setObjectShadows(loadedAsset, enabled)
        }
      }
    },
    debugSnapshot: () => ({
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
      disposed = true
    },
  }
}
