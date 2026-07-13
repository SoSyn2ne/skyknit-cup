import * as THREE from 'three'

import {
  getForwardVector,
  type FlightState,
} from '../flight/flightModel'
import {
  createDragon as createDragonVisual,
  type DragonDebugSnapshot,
  type DragonPalette,
} from './createDragon'
import { createWorld, type WorldDebugSnapshot } from './createWorld'
import { getCollisionCameraOffset } from './cameraFeedback'
import type { CourseCheckpoint } from './course'
import { SKYKNOT_COURSE } from './course'
import { createDragonPoseState, stepDragonPose } from './dragonPose'
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
  readonly gateNdc: ProjectedPoint
  readonly windThreadCount: number
  readonly activeGateIndex: number
  readonly gateProjectedDiameterCss: number
  readonly gatePassWaveActive: boolean
  readonly boostRingCount: number
  readonly boostRingsVisible: boolean
  readonly collisionCameraShakeDistance: number
  readonly reducedMotion: boolean
  readonly dragon: DragonDebugSnapshot
  readonly world: WorldDebugSnapshot
}

export interface ProjectedPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly visible: boolean
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
  ) => void
  triggerGatePass: (checkpointIndex: number) => void
  gateProjection: (viewportHeight: number) => {
    readonly point: ProjectedPoint | null
    readonly diameterCss: number
  }
  resetCamera: () => void
  setQuality: (quality: RenderQualityBudget) => void
  dispose: () => void
  debugSnapshot?: (flight: FlightState) => FlightSandboxDebugSnapshot
}

interface WindThread {
  readonly line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  readonly positions: Float32Array
  readonly side: number
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
const READY_CAMERA_BACK_DISTANCE = 6
const READY_CAMERA_SIDE_DISTANCE = -3.5
const READY_CAMERA_HEIGHT = 2.7
const READY_CAMERA_LOOK_AHEAD = 5
const READY_CAMERA_LOOK_HEIGHT = 0.2
const THREAD_POINT_COUNT = 28
const GATE_PASS_WAVE_SECONDS = 0.65
const BOOST_RING_COUNT = 3


function createGate(
  checkpoint: CourseCheckpoint,
  index: number,
  palette: FlightSandboxPalette,
): GateVisual {
  const group = new THREE.Group()
  group.name = `M2_CourseGate_${String(index + 1).padStart(2, '0')}`

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: palette.wingGold,
    roughness: 0.34,
    metalness: 0.18,
  })
  const runeMaterial = new THREE.MeshStandardMaterial({
    color: palette.gateRune,
    emissive: palette.gateRune,
    emissiveIntensity: 0.3,
    roughness: 0.55,
    transparent: true,
  })
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(checkpoint.radius, 0.72, 12, 64),
    ringMaterial,
  )
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: palette.wingGold,
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
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({
    color: palette.cloud,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  })
  const line = new THREE.Line(geometry, material)
  line.name = side < 0 ? 'M1_WindThreadLeft' : 'M1_WindThreadRight'
  line.frustumCulled = false

  return { line, positions, side }
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

export function createFlightSandbox(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  palette: FlightSandboxPalette,
  initialQuality: RenderQualityBudget,
  course: readonly CourseCheckpoint[] = SKYKNOT_COURSE,
): FlightSandbox {
  const dragon = createDragonVisual(palette)
  let dragonPose = createDragonPoseState()
  let characterAnimationSeconds = 0
  let quality = initialQuality
  const world = createWorld(scene, camera, palette, quality)
  const gates = course.map((checkpoint, index) =>
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

  scene.add(dragon.movementRoot)
  scene.add(passWave)
  for (const gate of gates) {
    scene.add(gate.group)
  }
  for (const thread of windThreads) {
    scene.add(thread.line)
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
  let cameraInitialized = false
  let currentActiveGateIndex = 0
  let passWaveAgeSeconds = GATE_PASS_WAVE_SECONDS
  let collisionCameraShakeDistance = 0
  let lastGateProjectedDiameterCss = 0
  const reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  )
  const forceReducedMotion =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('qaReducedMotion') ===
      '1'
  const reducedMotion = (): boolean =>
    reducedMotionQuery.matches || forceReducedMotion

  camera.up.copy(WORLD_UP)
  camera.fov = CAMERA_DEFAULT_FOV

  const updateGates = (
    activeGateIndex: number,
    simulationSeconds: number,
  ): void => {
    currentActiveGateIndex = activeGateIndex

    for (const [index, gate] of gates.entries()) {
      const active = index === activeGateIndex
      gate.group.visible = active
      gate.ringMaterial.opacity = active ? 1 : 0.2
      gate.ringMaterial.emissive.set(active ? palette.wingGold : 0x000000)
      gate.ringMaterial.emissiveIntensity = active ? 0.22 : 0
      gate.runeMaterial.opacity = active ? 1 : 0.16
      gate.runeMaterial.emissiveIntensity = active ? 0.7 : 0.08
      gate.haloMaterial.opacity = active
        ? 0.1 + Math.sin(simulationSeconds * 2.4) * 0.025
        : 0
      gate.runeWheel.rotation.z = simulationSeconds * 0.2
      const pulse = active
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
  }

  const updateThreads = (flight: FlightState, simulationSeconds: number): void => {
    const activeGate = gates[currentActiveGateIndex]

    if (activeGate === undefined) {
      for (const thread of windThreads) {
        thread.line.visible = false
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
      thread.line.visible = true
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

      const positionAttribute = thread.line.geometry.getAttribute('position')
      positionAttribute.needsUpdate = true
    }
  }

  const updateDragon = (
    flight: FlightState,
    fixedDt: number,
    collisionFeedbackSeconds: number,
  ): void => {
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
        },
        fixedDt,
      )
    }
    dragon.update(flight, dragonPose, characterAnimationSeconds)
  }

  const updateCamera = (
    flight: FlightState,
    simulationSeconds: number,
    fixedDt: number,
    collisionFeedbackSeconds: number,
    presentation: 'ready' | 'countdown' | 'race' | 'explore',
  ): void => {
    getForward(flight, forward)
    getRight(flight, right)
    dragonPosition.set(
      flight.position.x,
      flight.position.y,
      flight.position.z,
    )
    if (presentation === 'ready') {
      targetCameraPosition
        .copy(dragonPosition)
        .addScaledVector(forward, -READY_CAMERA_BACK_DISTANCE)
        .addScaledVector(right, READY_CAMERA_SIDE_DISTANCE)
        .addScaledVector(WORLD_UP, READY_CAMERA_HEIGHT)
      targetLookPosition
        .copy(dragonPosition)
        .addScaledVector(forward, READY_CAMERA_LOOK_AHEAD)
        .addScaledVector(WORLD_UP, READY_CAMERA_LOOK_HEIGHT)
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
        flight.isBoosting && !reducedMotion()
          ? CAMERA_BOOST_FOV
          : CAMERA_DEFAULT_FOV
      camera.fov +=
        (targetFov - camera.fov) *
        (1 - Math.exp(-CAMERA_FOV_FOLLOW_RATE * fixedDt))
    }
    camera.updateProjectionMatrix()
  }

  return {
    ready: dragon.ready,
    step: (
      flight,
      simulationSeconds,
      fixedDt,
      activeGateIndex = 0,
      collisionFeedbackSeconds = 0,
      presentation = 'race',
    ) => {
      updateDragon(
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
    },
    triggerGatePass: (checkpointIndex) => {
      const passedGate = gates[checkpointIndex]

      if (passedGate === undefined) {
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

      const checkpoint = course[currentActiveGateIndex]
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
    setQuality: (nextQuality) => {
      quality = nextQuality
      world.setQuality(nextQuality)
      for (const [index, ring] of boostRings.entries()) {
        if (index >= nextQuality.boostRingCount) {
          ring.visible = false
        }
      }
    },
    dispose: () => dragon.dispose(),
    ...(import.meta.env.DEV
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
              gateNdc:
                activeGate === undefined
                  ? { x: 0, y: 0, z: 2, visible: false }
                  : projectedPoint(activeGate.group.position, camera),
              windThreadCount: windThreads.length,
              activeGateIndex: currentActiveGateIndex,
              gateProjectedDiameterCss: lastGateProjectedDiameterCss,
              gatePassWaveActive: passWave.visible,
              boostRingCount: quality.boostRingCount,
              boostRingsVisible: boostRings.some((ring) => ring.visible),
              collisionCameraShakeDistance,
              reducedMotion: reducedMotion(),
              dragon: dragon.debugSnapshot(),
              world: world.debugSnapshot(),
            }
          },
        }
      : {}),
  }
}
