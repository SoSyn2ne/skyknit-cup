import * as THREE from 'three'

import { QA_MODE } from '../../qaMode'

import type { GhostPose } from '../competition/ghostRun'
import {
  CHARACTER_CATALOG,
  DEFAULT_CHARACTER_LOADOUT,
  normalizeCharacterLoadout,
  type CharacterLoadout,
} from '../customization/characterCatalog'
import {
  getForwardVector,
  type FlightState,
} from '../flight/flightModel'
import {
  createDragon as createDragonVisual,
  type DragonDebugSnapshot,
  type DragonPalette,
  type DragonVisual,
} from './createDragon'
import { createWorld, type WorldDebugSnapshot } from './createWorld'
import { getCollisionCameraOffset } from './cameraFeedback'
import type { CourseCheckpoint } from './course'
import { SKYKNOT_COURSE } from './course'
import {
  createDragonPoseState,
  didWingDownstrokeStart,
  stepDragonPose,
} from './dragonPose'
import type { RenderQualityBudget } from '../quality/qualityPolicy'

export interface FlightSandboxPalette extends DragonPalette {
  readonly skyZenith: string
  readonly skyHaze: string
  readonly cloud: string
  readonly rock: string
  readonly gateRune: string
}

export interface FlightSandboxDebugSnapshot {
  readonly cameraFov: number
  readonly cameraDistanceToDragon: number
  readonly cameraUpDotWorldUp: number
  readonly dragonNdc: ProjectedPoint
  readonly dragonBoundsNdc: ProjectedBounds
  readonly gateNdc: ProjectedPoint
  readonly windThreadCount: number
  readonly windThreadOuterRadius: number
  readonly windThreadCoreRadius: number
  readonly activeGateIndex: number
  readonly checkpointCount: number
  readonly gateProjectedDiameterCss: number
  readonly gatePassWaveActive: boolean
  readonly gatePulseScale: number
  readonly gateHaloOpacity: number
  readonly boostRingCount: number
  readonly boostRingsVisible: boolean
  readonly speedStreakCount: number
  readonly speedStreaksVisible: boolean
  readonly collisionCameraShakeDistance: number
  readonly reducedMotion: boolean
  readonly dragon: DragonDebugSnapshot
  readonly ghostVisible: boolean
  readonly ghostDragon: DragonDebugSnapshot | null
  readonly world: WorldDebugSnapshot
}

export interface ProjectedPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly visible: boolean
}

export interface ProjectedBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
  readonly allVisible: boolean
}

export interface FlightSandbox {
  readonly ready: Promise<'fallback' | 'glb'>
  step: (
    flight: FlightState,
    simulationSeconds: number,
    fixedDt: number,
    activeGateIndex?: number,
    collisionFeedbackSeconds?: number,
    presentation?: 'ready' | 'countdown' | 'race' | 'explore',
  ) => FlightSandboxStepResult
  updateGhost: (pose: GhostPose | null, fixedDt: number) => void
  triggerGatePass: (checkpointIndex: number) => void
  gateProjection: (viewportHeight: number) => {
    readonly point: ProjectedPoint | null
    readonly diameterCss: number
  }
  resetCamera: () => void
  setCharacterPreviewActive: (active: boolean) => void
  setCharacterLoadout: (
    loadout: CharacterLoadout,
  ) => Promise<'fallback' | 'glb'>
  setCourse: (course: readonly CourseCheckpoint[]) => void
  setVolcanicReaction: (intensity: number) => void
  setQuality: (quality: RenderQualityBudget) => void
  dispose: () => void
  debugSnapshot?: (flight: FlightState) => FlightSandboxDebugSnapshot
}

export interface FlightSandboxStepResult {
  readonly wingDownstrokeStarted: boolean
}

interface WindThread {
  readonly outer: THREE.InstancedMesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >
  readonly core: THREE.InstancedMesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >
  readonly segmentGeometry: THREE.CylinderGeometry
  readonly positions: Float32Array
  readonly side: number
}

export interface ReadyCameraFraming {
  readonly mode: 'landscape' | 'portrait' | 'compact-portrait'
  readonly backDistance: number
  readonly sideDistance: number
  readonly height: number
  readonly lookAhead: number
  readonly lookHeight: number
  readonly fov: number
}

interface GateVisual {
  readonly group: THREE.Group
  readonly ringMaterial: THREE.MeshStandardMaterial
  readonly runeMaterial: THREE.MeshStandardMaterial
  readonly haloMaterial: THREE.MeshBasicMaterial
  readonly runeWheel: THREE.InstancedMesh
}

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const GATE_PLANE_NORMAL = new THREE.Vector3(0, 0, 1)
const CAMERA_POSITION_OMEGA = 7.5
const CAMERA_LOOK_OMEGA = 9
const CAMERA_DEFAULT_FOV = 55
const CAMERA_BOOST_FOV = 63
const CAMERA_FOV_FOLLOW_RATE = 8
const CAMERA_BACK_DISTANCE = 8
const CAMERA_HEIGHT = 3.2
const CAMERA_LOOK_AHEAD = 7
const CAMERA_LOOK_HEIGHT = 1
const THREAD_POINT_COUNT = 28
const GATE_PASS_WAVE_SECONDS = 0.65
const BOOST_RING_COUNT = 3
const SPEED_STREAK_CAPACITY = 18

export const WIND_THREAD_VISUAL_SPEC = Object.freeze({
  outerRadius: 0.16,
  coreRadius: 0.052,
  leftColorRole: 'gateRune' as const,
  rightColorRole: 'wingGold' as const,
})

export function getGhostWingFlapRadians(
  elapsedMs: number,
  isBoosting: boolean,
): number {
  const animationSeconds = Number.isFinite(elapsedMs)
    ? Math.max(0, elapsedMs) / 1_000
    : 0
  const flapFrequency = isBoosting ? 3.4 : 2.2
  const flapAmplitude = isBoosting ? 0.12 : 0.28
  return (
    Math.sin(animationSeconds * Math.PI * 2 * flapFrequency) *
    flapAmplitude
  )
}

const LANDSCAPE_READY_CAMERA: ReadyCameraFraming = Object.freeze({
  mode: 'landscape',
  backDistance: 6,
  sideDistance: -3.5,
  height: 2.7,
  lookAhead: 5,
  lookHeight: 0.2,
  fov: 55,
})

const PORTRAIT_READY_CAMERA: ReadyCameraFraming = Object.freeze({
  mode: 'portrait',
  backDistance: 11.7,
  sideDistance: -1.2,
  height: 4.5,
  lookAhead: 6.5,
  lookHeight: 0.35,
  fov: 62,
})

const COMPACT_PORTRAIT_READY_CAMERA: ReadyCameraFraming = Object.freeze({
  mode: 'compact-portrait',
  backDistance: 13.5,
  sideDistance: -0.8,
  height: 4.5,
  lookAhead: 22,
  lookHeight: 7.5,
  fov: 64,
})

const PORTRAIT_WORKSHOP_CAMERA: ReadyCameraFraming = Object.freeze({
  ...PORTRAIT_READY_CAMERA,
  lookHeight: -8,
})

const COMPACT_PORTRAIT_WORKSHOP_CAMERA: ReadyCameraFraming = Object.freeze({
  ...COMPACT_PORTRAIT_READY_CAMERA,
  lookHeight: -35,
})

export function getReadyCameraFraming(
  viewportWidth: number,
  viewportHeight: number,
): ReadyCameraFraming {
  const safeWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0
      ? viewportWidth
      : 1_440
  const safeHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : 900

  if (safeWidth >= safeHeight) {
    return LANDSCAPE_READY_CAMERA
  }
  return safeHeight <= 600
    ? COMPACT_PORTRAIT_READY_CAMERA
    : PORTRAIT_READY_CAMERA
}

export function getCharacterWorkshopCameraFraming(
  viewportWidth: number,
  viewportHeight: number,
): ReadyCameraFraming {
  const readyFraming = getReadyCameraFraming(viewportWidth, viewportHeight)
  if (readyFraming.mode === 'portrait') return PORTRAIT_WORKSHOP_CAMERA
  if (readyFraming.mode === 'compact-portrait') {
    return COMPACT_PORTRAIT_WORKSHOP_CAMERA
  }
  return readyFraming
}


function createGate(
  checkpoint: CourseCheckpoint,
  index: number,
  palette: FlightSandboxPalette,
): GateVisual {
  const group = new THREE.Group()
  const gatePrefix =
    checkpoint.kind === 'cooling-seal'
      ? 'CoolingSeal'
      : checkpoint.kind === 'escape'
        ? 'EscapeGate'
        : 'CourseGate'
  group.name = `M2_${gatePrefix}_${String(index + 1).padStart(2, '0')}`
  group.userData.checkpointKind = checkpoint.kind
  const ringColor =
    checkpoint.kind === 'cooling-seal'
      ? palette.gateRune
      : checkpoint.kind === 'escape'
        ? '#ff7b32'
        : palette.wingGold
  const runeColor =
    checkpoint.kind === 'escape' ? palette.wingGold : palette.gateRune

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: ringColor,
    emissive: ringColor,
    emissiveIntensity: checkpoint.kind === 'gate' ? 0 : 0.18,
    roughness: 0.34,
    metalness: 0.18,
  })
  const runeMaterial = new THREE.MeshStandardMaterial({
    color: runeColor,
    emissive: runeColor,
    emissiveIntensity: 0.3,
    roughness: 0.55,
    transparent: true,
  })
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(checkpoint.radius, 0.72, 12, 64),
    ringMaterial,
  )
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: ringColor,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(checkpoint.radius, 1.22, 8, 64),
    haloMaterial,
  )
  const innerRune = new THREE.Mesh(
    new THREE.TorusGeometry(checkpoint.radius - 1.4, 0.16, 6, 40),
    runeMaterial,
  )
  const runeWheel = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1.35),
    runeMaterial,
    8,
  )
  const runeMatrix = new THREE.Matrix4()
  const runePosition = new THREE.Vector3()
  const runeScale = new THREE.Vector3(0.75, 1.3, 0.6)
  const runeQuaternion = new THREE.Quaternion()

  for (let runeIndex = 0; runeIndex < 8; runeIndex += 1) {
    const angle = (runeIndex / 8) * Math.PI * 2
    runePosition.set(
      Math.cos(angle) * (checkpoint.radius - 2.6),
      Math.sin(angle) * (checkpoint.radius - 2.6),
      0,
    )
    runeQuaternion.setFromAxisAngle(GATE_PLANE_NORMAL, angle)
    runeMatrix.compose(runePosition, runeQuaternion, runeScale)
    runeWheel.setMatrixAt(runeIndex, runeMatrix)
  }
  runeWheel.instanceMatrix.needsUpdate = true
  runeWheel.name = `M3_GateRunes_${String(index + 1).padStart(2, '0')}`

  group.add(halo, ring, innerRune, runeWheel)
  group.position.set(
    checkpoint.center.x,
    checkpoint.center.y,
    checkpoint.center.z,
  )
  group.quaternion.setFromUnitVectors(
    GATE_PLANE_NORMAL,
    new THREE.Vector3(
      checkpoint.normal.x,
      checkpoint.normal.y,
      checkpoint.normal.z,
    ),
  )

  return { group, ringMaterial, runeMaterial, haloMaterial, runeWheel }
}

function createWindThread(
  side: -1 | 1,
  palette: FlightSandboxPalette,
): WindThread {
  const positions = new Float32Array(THREAD_POINT_COUNT * 3)
  const segmentGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)
  const colorRole =
    side < 0
      ? WIND_THREAD_VISUAL_SPEC.leftColorRole
      : WIND_THREAD_VISUAL_SPEC.rightColorRole
  const outerMaterial = new THREE.MeshBasicMaterial({
    color: palette[colorRole],
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: palette[colorRole],
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  })
  const segmentCount = THREAD_POINT_COUNT - 1
  const outer = new THREE.InstancedMesh(
    segmentGeometry,
    outerMaterial,
    segmentCount,
  )
  const core = new THREE.InstancedMesh(
    segmentGeometry,
    coreMaterial,
    segmentCount,
  )
  const sideName = side < 0 ? 'Left' : 'Right'
  outer.name = `RC7_WindThreadHalo${sideName}`
  core.name = `RC7_WindThreadCore${sideName}`
  outer.frustumCulled = false
  core.frustumCulled = false
  outer.renderOrder = 2
  core.renderOrder = 3

  return { outer, core, segmentGeometry, positions, side }
}

function getForward(state: FlightState, target: THREE.Vector3): THREE.Vector3 {
  const forward = getForwardVector(state)
  return target.set(forward.x, forward.y, forward.z)
}

function getRight(state: FlightState, target: THREE.Vector3): THREE.Vector3 {
  return target.set(
    Math.cos(state.headingRadians),
    0,
    Math.sin(state.headingRadians),
  )
}

function stepCriticalSpring(
  value: THREE.Vector3,
  velocity: THREE.Vector3,
  target: THREE.Vector3,
  omega: number,
  dt: number,
): void {
  const displacement = value.clone().sub(target)
  const j = velocity.clone().addScaledVector(displacement, omega)
  const decay = Math.exp(-omega * dt)
  const nextVelocity = velocity
    .clone()
    .addScaledVector(j, -omega * dt)
    .multiplyScalar(decay)
  const nextValue = target
    .clone()
    .add(displacement.addScaledVector(j, dt).multiplyScalar(decay))

  value.copy(nextValue)
  velocity.copy(nextVelocity)
}

function projectedPoint(
  worldPosition: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): ProjectedPoint {
  const projected = worldPosition.clone().project(camera)

  return {
    x: projected.x,
    y: projected.y,
    z: projected.z,
    visible:
      Math.abs(projected.x) <= 1 &&
      Math.abs(projected.y) <= 1 &&
      projected.z >= -1 &&
      projected.z <= 1,
  }
}

function projectedVisibleObjectBounds(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
): ProjectedBounds {
  const projectedBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  }
  const projectedCorner = new THREE.Vector3()
  let hasBounds = false
  object.updateWorldMatrix(true, true)
  object.traverseVisible((child) => {
    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry
    if (geometry === undefined) return
    const skinnedMesh = child as THREE.SkinnedMesh
    let localBounds: THREE.Box3 | null
    if (skinnedMesh.isSkinnedMesh) {
      skinnedMesh.computeBoundingBox()
      localBounds = skinnedMesh.boundingBox
    } else {
      geometry.computeBoundingBox()
      localBounds = geometry.boundingBox
    }
    if (localBounds === null) return
    hasBounds = true
    for (const x of [localBounds.min.x, localBounds.max.x]) {
      for (const y of [localBounds.min.y, localBounds.max.y]) {
        for (const z of [localBounds.min.z, localBounds.max.z]) {
          projectedCorner
            .set(x, y, z)
            .applyMatrix4(child.matrixWorld)
            .project(camera)
          projectedBounds.minX = Math.min(
            projectedBounds.minX,
            projectedCorner.x,
          )
          projectedBounds.maxX = Math.max(
            projectedBounds.maxX,
            projectedCorner.x,
          )
          projectedBounds.minY = Math.min(
            projectedBounds.minY,
            projectedCorner.y,
          )
          projectedBounds.maxY = Math.max(
            projectedBounds.maxY,
            projectedCorner.y,
          )
          projectedBounds.minZ = Math.min(
            projectedBounds.minZ,
            projectedCorner.z,
          )
          projectedBounds.maxZ = Math.max(
            projectedBounds.maxZ,
            projectedCorner.z,
          )
        }
      }
    }
  })

  if (!hasBounds) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 2,
      maxZ: 2,
      allVisible: false,
    }
  }

  return {
    ...projectedBounds,
    allVisible:
      projectedBounds.minX >= -1 &&
      projectedBounds.maxX <= 1 &&
      projectedBounds.minY >= -1 &&
      projectedBounds.maxY <= 1 &&
      projectedBounds.minZ >= -1 &&
      projectedBounds.maxZ <= 1,
  }
}

export function createFlightSandbox(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  palette: FlightSandboxPalette,
  initialQuality: RenderQualityBudget,
  course: readonly CourseCheckpoint[] = SKYKNOT_COURSE,
  initialCharacterLoadout: CharacterLoadout = DEFAULT_CHARACTER_LOADOUT,
): FlightSandbox {
  const normalizedInitialLoadout = normalizeCharacterLoadout(
    initialCharacterLoadout,
  )
  const usesDefaultInitialCharacter =
    normalizedInitialLoadout.characterId ===
      DEFAULT_CHARACTER_LOADOUT.characterId &&
    normalizedInitialLoadout.paletteId ===
      DEFAULT_CHARACTER_LOADOUT.paletteId &&
    normalizedInitialLoadout.accessoryId ===
      DEFAULT_CHARACTER_LOADOUT.accessoryId
  let dragon = usesDefaultInitialCharacter
    ? createDragonVisual(palette)
    : createDragonVisual(palette, { loadout: normalizedInitialLoadout })
  const initialDragonReady = dragon.ready
  dragon.setShadows(initialQuality.shadows)
  let activeCharacterLoadout = normalizedInitialLoadout
  const getActiveMotionProfile = () =>
    CHARACTER_CATALOG.find(
      (character) => character.id === activeCharacterLoadout.characterId,
    )?.motionProfile ?? 'dragon'
  let characterLoadRequestId = 0
  let ghostDragon: DragonVisual | null = null
  let dragonPose = createDragonPoseState()
  let ghostDragonPose = createDragonPoseState()
  let ghostVisible = false
  let lastGhostElapsedMs = -1
  let characterAnimationSeconds = 0
  let volcanicReactionIntensity = 0
  let lastDragonFlight: FlightState | null = null
  let quality = initialQuality
  const world = createWorld(scene, camera, palette, quality)
  let activeCourse = course
  let gates = activeCourse.map((checkpoint, index) =>
    createGate(checkpoint, index, palette),
  )
  const windThreads = [
    createWindThread(-1, palette),
    createWindThread(1, palette),
  ]
  const passWaveMaterial = new THREE.MeshBasicMaterial({
    color: palette.gateRune,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const passWave = new THREE.Mesh(
    new THREE.TorusGeometry(course[0]?.radius ?? 22, 0.42, 8, 64),
    passWaveMaterial,
  )
  passWave.name = 'M3_GatePassWave'
  passWave.visible = false
  const boostRings = Array.from({ length: BOOST_RING_COUNT }, (_, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.76 + index * 0.12, 0.045, 6, 28),
      new THREE.MeshBasicMaterial({
        color: palette.cloud,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    ring.name = `M3_BoostAirRing_${index + 1}`
    ring.visible = false
    dragon.movementRoot.add(ring)
    return ring
  })
  const speedStreakGeometry = new THREE.CylinderGeometry(0.012, 0.028, 1.6, 5)
  speedStreakGeometry.rotateX(Math.PI / 2)
  const speedStreaks = new THREE.InstancedMesh(
    speedStreakGeometry,
    new THREE.MeshBasicMaterial({
      color: palette.cloud,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    SPEED_STREAK_CAPACITY,
  )
  speedStreaks.name = 'RC7_BoostSpeedStreaks'
  speedStreaks.frustumCulled = false
  speedStreaks.count = initialQuality.speedStreakCount
  speedStreaks.visible = false
  dragon.movementRoot.add(speedStreaks)
  const speedStreakMatrix = new THREE.Matrix4()
  const speedStreakPosition = new THREE.Vector3()
  const speedStreakQuaternion = new THREE.Quaternion()
  const speedStreakScale = new THREE.Vector3()
  const ghostFlight = {
    position: { x: 0, y: 0, z: 0 },
    headingRadians: 0,
    pitchRadians: 0,
    bankRadians: 0,
    boostRemaining: 0,
    boostRechargeDelaySeconds: 0,
    distanceTravelled: 0,
    speed: 0,
    isBoosting: false,
  }
  let disposed = false

  scene.add(dragon.movementRoot)
  scene.add(passWave)
  for (const gate of gates) {
    scene.add(gate.group)
  }
  for (const thread of windThreads) {
    scene.add(thread.outer, thread.core)
  }

  const cameraPosition = new THREE.Vector3()
  const cameraVelocity = new THREE.Vector3()
  const lookPosition = new THREE.Vector3()
  const lookVelocity = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const dragonPosition = new THREE.Vector3()
  const targetCameraPosition = new THREE.Vector3()
  const targetLookPosition = new THREE.Vector3()
  const cameraShakeOffset = new THREE.Vector3()
  const threadSegmentStart = new THREE.Vector3()
  const threadSegmentEnd = new THREE.Vector3()
  const threadSegmentDirection = new THREE.Vector3()
  const threadSegmentMidpoint = new THREE.Vector3()
  const threadSegmentQuaternion = new THREE.Quaternion()
  const threadSegmentScale = new THREE.Vector3()
  const threadSegmentMatrix = new THREE.Matrix4()
  let cameraInitialized = false
  let characterPreviewActive = false
  let currentActiveGateIndex = 0
  let passWaveAgeSeconds = GATE_PASS_WAVE_SECONDS
  let collisionCameraShakeDistance = 0
  let lastGateProjectedDiameterCss = 0
  const reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  )
  const forceReducedMotion =
    QA_MODE &&
    new URLSearchParams(window.location.search).get('qaReducedMotion') ===
      '1'
  const reducedMotion = (): boolean =>
    reducedMotionQuery.matches || forceReducedMotion

  camera.up.copy(WORLD_UP)
  camera.fov = CAMERA_DEFAULT_FOV

  const disposeGate = (gate: GateVisual): void => {
    scene.remove(gate.group)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    gate.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      if (!geometries.has(object.geometry)) {
        object.geometry.dispose()
        geometries.add(object.geometry)
      }
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      for (const material of objectMaterials) {
        if (materials.has(material)) continue
        material.dispose()
        materials.add(material)
      }
    })
  }

  const setCourse = (nextCourse: readonly CourseCheckpoint[]): void => {
    if (disposed) return
    const unchanged =
      nextCourse.length === activeCourse.length &&
      nextCourse.every(
        (checkpoint, index) => checkpoint.id === activeCourse[index]?.id,
      )
    if (unchanged) return

    for (const gate of gates) disposeGate(gate)
    activeCourse = nextCourse
    gates = activeCourse.map((checkpoint, index) =>
      createGate(checkpoint, index, palette),
    )
    for (const gate of gates) scene.add(gate.group)
    const previousGeometry = passWave.geometry
    passWave.geometry = new THREE.TorusGeometry(
      activeCourse[0]?.radius ?? 22,
      0.42,
      8,
      64,
    )
    previousGeometry.dispose()
    passWave.visible = false
    passWaveAgeSeconds = GATE_PASS_WAVE_SECONDS
    currentActiveGateIndex = 0
    lastGateProjectedDiameterCss = 0
  }

  const updateGates = (
    activeGateIndex: number,
    simulationSeconds: number,
  ): void => {
    currentActiveGateIndex = activeGateIndex
    const motionReduced = reducedMotion()

    for (const [index, gate] of gates.entries()) {
      const active = index === activeGateIndex
      gate.group.visible = active
      gate.ringMaterial.opacity = active ? 1 : 0.2
      gate.ringMaterial.emissive.set(active ? palette.wingGold : 0x000000)
      gate.ringMaterial.emissiveIntensity = active ? 0.22 : 0
      gate.runeMaterial.opacity = active ? 1 : 0.16
      gate.runeMaterial.emissiveIntensity = active ? 0.7 : 0.08
      gate.haloMaterial.opacity = active
        ? motionReduced
          ? 0.08
          : 0.1 + Math.sin(simulationSeconds * 2.4) * 0.025
        : 0
      gate.runeWheel.rotation.z = motionReduced
        ? 0
        : simulationSeconds * 0.2
      const pulse = active && !motionReduced
        ? 1 + Math.sin(simulationSeconds * 3.2) * 0.018
        : 1
      gate.group.scale.setScalar(pulse)
    }
  }

  const updateEffects = (
    flight: FlightState,
    simulationSeconds: number,
    fixedDt: number,
  ): void => {
    if (passWave.visible && fixedDt > 0) {
      passWaveAgeSeconds += fixedDt
      const progress = Math.min(
        1,
        passWaveAgeSeconds / GATE_PASS_WAVE_SECONDS,
      )
      passWave.scale.setScalar(1 + progress * 0.42)
      passWaveMaterial.opacity = (1 - progress) * 0.72
      passWave.visible = progress < 1
    }

    const showBoostRings = flight.isBoosting && !reducedMotion()
    for (const [index, ring] of boostRings.entries()) {
      const withinBudget = index < quality.boostRingCount
      ring.visible = showBoostRings && withinBudget
      if (!ring.visible) {
        continue
      }

      const cycle =
        (simulationSeconds * 5.2 + index / quality.boostRingCount) % 1
      ring.position.set(0, 0.04, 1.8 + cycle * 4.2)
      ring.scale.setScalar(0.7 + cycle * 0.42)
      const ringMaterial = ring.material as THREE.MeshBasicMaterial
      ringMaterial.opacity =
        Math.sin(cycle * Math.PI) * 0.24
    }

    const showSpeedStreaks =
      flight.isBoosting &&
      !reducedMotion() &&
      quality.speedStreakCount > 0
    speedStreaks.visible = showSpeedStreaks
    speedStreaks.count = showSpeedStreaks ? quality.speedStreakCount : 0
    if (showSpeedStreaks) {
      for (let index = 0; index < speedStreaks.count; index += 1) {
        const angle = index * 2.3999632297
        const phase = (simulationSeconds * 2.8 + index * 0.381966) % 1
        const radius = 1.4 + (index % 4) * 0.42
        speedStreakPosition.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.7) * (0.75 + (index % 3) * 0.28),
          1.2 + phase * 7.2,
        )
        speedStreakScale.set(1, 1, 0.62 + phase * 0.9)
        speedStreakMatrix.compose(
          speedStreakPosition,
          speedStreakQuaternion,
          speedStreakScale,
        )
        speedStreaks.setMatrixAt(index, speedStreakMatrix)
      }
      speedStreaks.instanceMatrix.needsUpdate = true
    }
  }

  const updateThreads = (flight: FlightState, simulationSeconds: number): void => {
    const activeGate = gates[currentActiveGateIndex]

    if (activeGate === undefined) {
      for (const thread of windThreads) {
        thread.outer.visible = false
        thread.core.visible = false
      }
      return
    }

    getForward(flight, forward)
    getRight(flight, right)
    dragonPosition.set(
      flight.position.x,
      flight.position.y,
      flight.position.z,
    )

    for (const thread of windThreads) {
      thread.outer.visible = true
      thread.core.visible = true
      const start = dragonPosition
        .clone()
        .addScaledVector(forward, 3.2)
        .addScaledVector(right, thread.side * 0.72)
        .addScaledVector(WORLD_UP, 0.15)
      const end = activeGate.group.position
        .clone()
        .addScaledVector(right, thread.side * 2.05)
      const control = start
        .clone()
        .lerp(end, 0.52)
        .addScaledVector(right, thread.side * 1.5)
        .addScaledVector(
          WORLD_UP,
          2.2 + Math.sin(simulationSeconds * 1.6 + thread.side) * 0.65,
        )

      for (let index = 0; index < THREAD_POINT_COUNT; index += 1) {
        const t = index / (THREAD_POINT_COUNT - 1)
        const inverse = 1 - t
        const point = start
          .clone()
          .multiplyScalar(inverse * inverse)
          .addScaledVector(control, 2 * inverse * t)
          .addScaledVector(end, t * t)
        const offset = index * 3
        thread.positions[offset] = point.x
        thread.positions[offset + 1] = point.y
        thread.positions[offset + 2] = point.z
      }

      for (let index = 0; index < THREAD_POINT_COUNT - 1; index += 1) {
        const offset = index * 3
        const nextOffset = offset + 3
        threadSegmentStart.fromArray(thread.positions, offset)
        threadSegmentEnd.fromArray(thread.positions, nextOffset)
        threadSegmentDirection
          .copy(threadSegmentEnd)
          .sub(threadSegmentStart)
        const segmentLength = threadSegmentDirection.length()
        threadSegmentMidpoint
          .copy(threadSegmentStart)
          .add(threadSegmentEnd)
          .multiplyScalar(0.5)
        threadSegmentQuaternion.setFromUnitVectors(
          WORLD_UP,
          threadSegmentDirection.normalize(),
        )
        threadSegmentScale.set(
          WIND_THREAD_VISUAL_SPEC.outerRadius,
          segmentLength + 0.08,
          WIND_THREAD_VISUAL_SPEC.outerRadius,
        )
        threadSegmentMatrix.compose(
          threadSegmentMidpoint,
          threadSegmentQuaternion,
          threadSegmentScale,
        )
        thread.outer.setMatrixAt(index, threadSegmentMatrix)
        threadSegmentScale.set(
          WIND_THREAD_VISUAL_SPEC.coreRadius,
          segmentLength + 0.1,
          WIND_THREAD_VISUAL_SPEC.coreRadius,
        )
        threadSegmentMatrix.compose(
          threadSegmentMidpoint,
          threadSegmentQuaternion,
          threadSegmentScale,
        )
        thread.core.setMatrixAt(index, threadSegmentMatrix)
      }
      thread.outer.instanceMatrix.needsUpdate = true
      thread.core.instanceMatrix.needsUpdate = true
      const motion = reducedMotion()
        ? 0
        : Math.sin(simulationSeconds * 2.1 + thread.side) * 0.06
      thread.outer.material.opacity = 0.48 + motion
      thread.core.material.opacity = 0.94 + motion * 0.4
    }
  }

  const updateDragon = (
    flight: FlightState,
    fixedDt: number,
    collisionFeedbackSeconds: number,
  ): boolean => {
    lastDragonFlight = flight
    const previousWingFlapRadians = dragonPose.wingFlapRadians
    if (fixedDt > 0) {
      characterAnimationSeconds += fixedDt
      dragonPose = stepDragonPose(
        dragonPose,
        {
          bankRadians: flight.bankRadians,
          pitchRadians: flight.pitchRadians,
          isBoosting: flight.isBoosting,
          collisionFeedbackSeconds,
          animationSeconds: characterAnimationSeconds,
          motionProfile: getActiveMotionProfile(),
        },
        fixedDt,
      )
    }
    dragon.update(flight, dragonPose)
    return didWingDownstrokeStart(
      previousWingFlapRadians,
      dragonPose.wingFlapRadians,
    )
  }

  const updateGhostDragon = (
    pose: GhostPose | null,
    fixedDt: number,
  ): void => {
    if (disposed) return
    if (pose === null) {
      if (ghostDragon !== null) {
        ghostDragon.movementRoot.visible = false
      }
      ghostDragonPose = createDragonPoseState()
      ghostVisible = false
      lastGhostElapsedMs = -1
      return
    }

    if (ghostDragon === null) {
      const usesDefaultCharacter =
        activeCharacterLoadout.characterId ===
          DEFAULT_CHARACTER_LOADOUT.characterId &&
        activeCharacterLoadout.paletteId ===
          DEFAULT_CHARACTER_LOADOUT.paletteId &&
        activeCharacterLoadout.accessoryId ===
          DEFAULT_CHARACTER_LOADOUT.accessoryId
      ghostDragon = usesDefaultCharacter
        ? createDragonVisual(palette, {
            appearance: 'ghost',
            ghostDetail: 'echo',
          })
        : createDragonVisual(palette, {
            appearance: 'ghost',
            ghostDetail: 'echo',
            loadout: activeCharacterLoadout,
          })
      ghostDragon.setShadows(false)
      ghostDragon.setVolcanicReaction(volcanicReactionIntensity)
      ghostDragon.movementRoot.visible = false
      scene.add(ghostDragon.movementRoot)
    }
    const activeGhostDragon = ghostDragon

    const elapsedMs = Number.isFinite(pose.elapsedMs)
      ? Math.max(0, pose.elapsedMs)
      : 0
    if (!ghostVisible || elapsedMs < lastGhostElapsedMs) {
      ghostDragonPose = createDragonPoseState()
    }
    ghostVisible = true
    lastGhostElapsedMs = elapsedMs

    const nextPose = stepDragonPose(
      ghostDragonPose,
      {
        bankRadians: pose.bankRadians,
        pitchRadians: pose.pitchRadians,
        isBoosting: pose.boost,
        collisionFeedbackSeconds: 0,
        animationSeconds: elapsedMs / 1_000,
        motionProfile: getActiveMotionProfile(),
      },
      fixedDt,
    )
    ghostDragonPose = {
      ...nextPose,
      wingFlapRadians: getGhostWingFlapRadians(elapsedMs, pose.boost),
    }

    ghostFlight.position.x = pose.position.x
    ghostFlight.position.y = pose.position.y
    ghostFlight.position.z = pose.position.z
    ghostFlight.headingRadians = pose.headingRadians
    ghostFlight.pitchRadians = pose.pitchRadians
    ghostFlight.bankRadians = pose.bankRadians
    ghostFlight.isBoosting = pose.boost
    activeGhostDragon.update(ghostFlight, ghostDragonPose)
    activeGhostDragon.movementRoot.visible = true
  }

  const updateCamera = (
    flight: FlightState,
    simulationSeconds: number,
    fixedDt: number,
    collisionFeedbackSeconds: number,
    presentation: 'ready' | 'countdown' | 'race' | 'explore',
  ): void => {
    const readyFraming = characterPreviewActive
      ? getCharacterWorkshopCameraFraming(
          window.innerWidth,
          window.innerHeight,
        )
      : getReadyCameraFraming(window.innerWidth, window.innerHeight)
    const useReadyFraming =
      characterPreviewActive || presentation === 'ready'
    getForward(flight, forward)
    getRight(flight, right)
    dragonPosition.set(
      flight.position.x,
      flight.position.y,
      flight.position.z,
    )
    if (useReadyFraming) {
      targetCameraPosition
        .copy(dragonPosition)
        .addScaledVector(forward, -readyFraming.backDistance)
        .addScaledVector(right, readyFraming.sideDistance)
        .addScaledVector(WORLD_UP, readyFraming.height)
      targetLookPosition
        .copy(dragonPosition)
        .addScaledVector(forward, readyFraming.lookAhead)
        .addScaledVector(WORLD_UP, readyFraming.lookHeight)
    } else {
      targetCameraPosition
        .copy(dragonPosition)
        .addScaledVector(forward, -CAMERA_BACK_DISTANCE)
        .addScaledVector(WORLD_UP, CAMERA_HEIGHT)
      if (presentation === 'race') {
        targetCameraPosition.addScaledVector(
          forward,
          (flight.speed * 2) / CAMERA_POSITION_OMEGA,
        )
      }
      targetLookPosition
        .copy(dragonPosition)
        .addScaledVector(forward, CAMERA_LOOK_AHEAD)
        .addScaledVector(WORLD_UP, CAMERA_LOOK_HEIGHT)
    }

    if (!cameraInitialized) {
      cameraPosition.copy(targetCameraPosition)
      lookPosition.copy(targetLookPosition)
      camera.fov =
        useReadyFraming ? readyFraming.fov : CAMERA_DEFAULT_FOV
      cameraInitialized = true
    } else if (fixedDt > 0) {
      stepCriticalSpring(
        cameraPosition,
        cameraVelocity,
        targetCameraPosition,
        CAMERA_POSITION_OMEGA,
        fixedDt,
      )
      stepCriticalSpring(
        lookPosition,
        lookVelocity,
        targetLookPosition,
        CAMERA_LOOK_OMEGA,
        fixedDt,
      )
    }

    const cameraOffset = getCollisionCameraOffset(
      collisionFeedbackSeconds,
      simulationSeconds,
      reducedMotion(),
    )
    collisionCameraShakeDistance = Math.hypot(
      cameraOffset.x,
      cameraOffset.y,
      cameraOffset.z,
    )
    camera.position
      .copy(cameraPosition)
      .add(cameraShakeOffset.set(cameraOffset.x, cameraOffset.y, cameraOffset.z))
    camera.up.copy(WORLD_UP)
    camera.lookAt(lookPosition)

    if (fixedDt > 0) {
      const targetFov =
        useReadyFraming
          ? readyFraming.fov
          : flight.isBoosting && !reducedMotion()
          ? CAMERA_BOOST_FOV
          : CAMERA_DEFAULT_FOV
      camera.fov +=
        (targetFov - camera.fov) *
        (1 - Math.exp(-CAMERA_FOV_FOLLOW_RATE * fixedDt))
    }
    camera.updateProjectionMatrix()
  }

  const setCharacterLoadout = async (
    loadout: CharacterLoadout,
  ): Promise<'fallback' | 'glb'> => {
    if (disposed) return 'fallback'

    const requestId = ++characterLoadRequestId
    const normalizedLoadout = normalizeCharacterLoadout(loadout)
    const candidate = createDragonVisual(palette, {
      loadout: normalizedLoadout,
    })
    candidate.setShadows(quality.shadows)
    candidate.setVolcanicReaction(volcanicReactionIntensity)

    let candidateSource: 'fallback' | 'glb'
    try {
      candidateSource = await candidate.ready
    } catch {
      candidate.dispose()
      return 'fallback'
    }

    if (
      disposed ||
      requestId !== characterLoadRequestId ||
      candidateSource === 'fallback'
    ) {
      candidate.dispose()
      return candidateSource
    }

    const previousDragon = dragon
    candidate.movementRoot.position.copy(previousDragon.movementRoot.position)
    candidate.movementRoot.quaternion.copy(
      previousDragon.movementRoot.quaternion,
    )
    candidate.movementRoot.scale.copy(previousDragon.movementRoot.scale)
    candidate.setShadows(quality.shadows)
    if (lastDragonFlight !== null) {
      candidate.update(lastDragonFlight, dragonPose)
    }

    scene.add(candidate.movementRoot)
    for (const ring of boostRings) candidate.movementRoot.add(ring)
    candidate.movementRoot.add(speedStreaks)
    dragon = candidate
    activeCharacterLoadout = normalizedLoadout

    scene.remove(previousDragon.movementRoot)
    previousDragon.dispose()

    if (ghostDragon !== null) {
      scene.remove(ghostDragon.movementRoot)
      ghostDragon.dispose()
      ghostDragon = null
      ghostVisible = false
      lastGhostElapsedMs = -1
    }

    return candidateSource
  }

  return {
    ready: initialDragonReady,
    step: (
      flight,
      simulationSeconds,
      fixedDt,
      activeGateIndex = 0,
      collisionFeedbackSeconds = 0,
      presentation = 'race',
    ) => {
      const wingDownstrokeStarted = updateDragon(
        flight,
        fixedDt,
        collisionFeedbackSeconds,
      )
      updateGates(activeGateIndex, simulationSeconds)
      updateEffects(flight, simulationSeconds, fixedDt)
      updateThreads(flight, simulationSeconds)
      updateCamera(
        flight,
        simulationSeconds,
        fixedDt,
        collisionFeedbackSeconds,
        presentation,
      )
      world.update(simulationSeconds)
      return { wingDownstrokeStarted }
    },
    updateGhost: updateGhostDragon,
    triggerGatePass: (checkpointIndex) => {
      const passedGate = gates[checkpointIndex]

      if (passedGate === undefined) {
        return
      }

      if (reducedMotion()) {
        passWaveAgeSeconds = GATE_PASS_WAVE_SECONDS
        passWaveMaterial.opacity = 0
        passWave.visible = false
        return
      }

      passWave.position.copy(passedGate.group.position)
      passWave.quaternion.copy(passedGate.group.quaternion)
      passWave.scale.setScalar(1)
      passWaveMaterial.opacity = 0.72
      passWaveAgeSeconds = 0
      passWave.visible = true
    },
    gateProjection: (viewportHeight) => {
      const activeGate = gates[currentActiveGateIndex]

      if (activeGate === undefined || viewportHeight <= 0) {
        return { point: null, diameterCss: 0 }
      }

      const checkpoint = activeCourse[currentActiveGateIndex]
      const center = projectedPoint(activeGate.group.position, camera)

      if (checkpoint === undefined) {
        return { point: center, diameterCss: 0 }
      }

      const edge = projectedPoint(
        activeGate.group.position
          .clone()
          .addScaledVector(WORLD_UP, checkpoint.radius),
        camera,
      )
      lastGateProjectedDiameterCss =
        Math.abs(edge.y - center.y) * viewportHeight

      return {
        point: center,
        diameterCss: lastGateProjectedDiameterCss,
      }
    },
    resetCamera: () => {
      cameraInitialized = false
      cameraVelocity.set(0, 0, 0)
      lookVelocity.set(0, 0, 0)
    },
    setCharacterPreviewActive: (active) => {
      if (characterPreviewActive === active) return
      characterPreviewActive = active
      cameraInitialized = false
      cameraVelocity.set(0, 0, 0)
      lookVelocity.set(0, 0, 0)
    },
    setCharacterLoadout,
    setCourse,
    setVolcanicReaction: (intensity) => {
      volcanicReactionIntensity = Number.isFinite(intensity)
        ? Math.min(1, Math.max(0, intensity))
        : 0
      dragon.setVolcanicReaction(volcanicReactionIntensity)
      ghostDragon?.setVolcanicReaction(volcanicReactionIntensity)
    },
    setQuality: (nextQuality) => {
      quality = nextQuality
      world.setQuality(nextQuality)
      dragon.setShadows(nextQuality.shadows)
      speedStreaks.count = nextQuality.speedStreakCount
      if (nextQuality.speedStreakCount === 0) {
        speedStreaks.visible = false
      }
      for (const [index, ring] of boostRings.entries()) {
        if (index >= nextQuality.boostRingCount) {
          ring.visible = false
        }
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      characterLoadRequestId += 1
      scene.remove(dragon.movementRoot)
      dragon.dispose()
      if (ghostDragon !== null) {
        scene.remove(ghostDragon.movementRoot)
        ghostDragon.dispose()
        ghostDragon = null
      }
      for (const thread of windThreads) {
        thread.segmentGeometry.dispose()
        thread.outer.material.dispose()
        thread.core.material.dispose()
      }
      for (const gate of gates) disposeGate(gate)
    },
    ...(QA_MODE
      ? {
          debugSnapshot: (
            flight: FlightState,
          ): FlightSandboxDebugSnapshot => {
            const dragonWorldPosition = new THREE.Vector3(
              flight.position.x,
              flight.position.y,
              flight.position.z,
            )
            const cameraWorldUp = new THREE.Vector3(
              0,
              1,
              0,
            ).applyQuaternion(camera.quaternion)
            const activeGate = gates[currentActiveGateIndex]
            return {
              cameraFov: camera.fov,
              cameraDistanceToDragon: camera.position.distanceTo(
                dragonWorldPosition,
              ),
              cameraUpDotWorldUp: cameraWorldUp.dot(WORLD_UP),
              dragonNdc: projectedPoint(dragonWorldPosition, camera),
              dragonBoundsNdc: projectedVisibleObjectBounds(
                dragon.movementRoot,
                camera,
              ),
              gateNdc:
                activeGate === undefined
                  ? { x: 0, y: 0, z: 2, visible: false }
                  : projectedPoint(activeGate.group.position, camera),
              windThreadCount: windThreads.length,
              windThreadOuterRadius: WIND_THREAD_VISUAL_SPEC.outerRadius,
              windThreadCoreRadius: WIND_THREAD_VISUAL_SPEC.coreRadius,
              activeGateIndex: currentActiveGateIndex,
              checkpointCount: activeCourse.length,
              gateProjectedDiameterCss: lastGateProjectedDiameterCss,
              gatePassWaveActive: passWave.visible,
              gatePulseScale: activeGate?.group.scale.x ?? 1,
              gateHaloOpacity: activeGate?.haloMaterial.opacity ?? 0,
              boostRingCount: quality.boostRingCount,
              boostRingsVisible: boostRings.some((ring) => ring.visible),
              speedStreakCount: quality.speedStreakCount,
              speedStreaksVisible: speedStreaks.visible,
              collisionCameraShakeDistance,
              reducedMotion: reducedMotion(),
              dragon: dragon.debugSnapshot(),
              ghostVisible,
              ghostDragon: ghostDragon?.debugSnapshot() ?? null,
              world: world.debugSnapshot(),
            }
          },
        }
      : {}),
  }
}
