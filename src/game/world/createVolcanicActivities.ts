import * as THREE from 'three'

import type { RenderQualityTier } from '../quality/qualityPolicy'
import {
  VOLCANIC_ARCHIPELAGO_CENTER,
  VOLCANIC_ARCHIPELAGO_THERMAL_ZONES,
} from './volcanicArchipelagoActivities'
import type { VolcanicHazardFrame } from './volcanicHazards'

export interface VolcanicActivitiesSnapshot {
  readonly qualityTier: RenderQualityTier
  readonly reducedMotion: boolean
  readonly loaded: boolean
  readonly active: boolean
  readonly thermalColumnCount: number
  readonly ashParticleCount: number
  readonly rockTelegraphCount: number
  readonly fallingRockCount: number
  readonly lavaTelegraphSegmentCount: number
  readonly lavaWaveSegmentCount: number
  readonly lavaWaveDrawPrimed: boolean
  readonly triangles: number
  readonly drawCalls: number
  readonly disposed: boolean
}

export interface VolcanicActivitiesVisual {
  update(
    frame: VolcanicHazardFrame,
    simulationSeconds: number,
    loaded: boolean,
    active: boolean,
  ): void
  primeFirstLavaWaveDraw(): void
  setQuality(tier: RenderQualityTier): void
  debugSnapshot(): VolcanicActivitiesSnapshot
  dispose(): void
}

const ROOT_NAME = 'M39_VolcanicActivities'
const THERMAL_NAME = 'M39_VolcanicThermalColumns'
const ASH_NAME = 'M39_VolcanicAsh'
const ROCK_TELEGRAPH_NAME = 'M39_VolcanicRockfallTelegraphs'
const FALLING_ROCK_NAME = 'M39_VolcanicFallingRocks'
const LAVA_TELEGRAPH_NAME = 'M39_VolcanicLavaTelegraph'
const LAVA_WAVE_NAME = 'M39_VolcanicLavaWave'

const HIGH_ASH_COUNT = 180
const LOW_ASH_COUNT = 84
const HIGH_REDUCED_ASH_COUNT = 72
const LOW_REDUCED_ASH_COUNT = 36
const HIGH_ROCKS_PER_EVENT = 3
const LOW_ROCKS_PER_EVENT = 1
const HIGH_LAVA_SEGMENT_COUNT = 64
const HIGH_ACTIVE_LAVA_SEGMENT_COUNT = 40
const LOW_LAVA_SEGMENT_COUNT = 24
const REDUCED_MOTION_SCALE = 0.35
const FULL_TURN = Math.PI * 2
const MAX_ROCKFALL_EVENTS = 2
const MAX_FALLING_ROCKS = MAX_ROCKFALL_EVENTS * HIGH_ROCKS_PER_EVENT

function trianglesPerInstance(geometry: THREE.BufferGeometry): number {
  return (
    (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
  )
}

function hashUnit(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ salt
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  value ^= value >>> 16
  return (value >>> 0) / 0x1_0000_0000
}

export function createVolcanicActivities(
  scene: THREE.Scene,
  initialQualityTier: RenderQualityTier,
  reducedMotion: () => boolean = () => false,
): VolcanicActivitiesVisual {
  const root = new THREE.Group()
  root.name = ROOT_NAME
  root.visible = false

  const thermalGeometry = new THREE.CylinderGeometry(
    1,
    0.72,
    1,
    12,
    1,
    true,
  )
  const thermalMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8c3c,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  })
  const thermalColumns = new THREE.InstancedMesh(
    thermalGeometry,
    thermalMaterial,
    VOLCANIC_ARCHIPELAGO_THERMAL_ZONES.length,
  )
  thermalColumns.name = THERMAL_NAME
  thermalColumns.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  thermalColumns.frustumCulled = false
  thermalColumns.renderOrder = 3

  const ashGeometry = new THREE.BufferGeometry()
  const ashPositions = new Float32Array(HIGH_ASH_COUNT * 3)
  const ashAngles = new Float32Array(HIGH_ASH_COUNT)
  const ashRadii = new Float32Array(HIGH_ASH_COUNT)
  const ashHeights = new Float32Array(HIGH_ASH_COUNT)
  const ashDrifts = new Float32Array(HIGH_ASH_COUNT)
  for (let index = 0; index < HIGH_ASH_COUNT; index += 1) {
    ashAngles[index] = hashUnit(index, 0x1073) * FULL_TURN
    ashRadii[index] = 18 + hashUnit(index, 0x8051) * 90
    ashHeights[index] = hashUnit(index, 0x4a17) * 112
    ashDrifts[index] = 0.55 + hashUnit(index, 0x9c31) * 0.9
  }
  const ashPositionAttribute = new THREE.BufferAttribute(ashPositions, 3)
  ashPositionAttribute.setUsage(THREE.DynamicDrawUsage)
  ashGeometry.setAttribute('position', ashPositionAttribute)
  ashGeometry.setDrawRange(0, 0)
  const ashMaterial = new THREE.PointsMaterial({
    color: 0x4a3a35,
    size: 1.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    fog: true,
  })
  const ash = new THREE.Points(ashGeometry, ashMaterial)
  ash.name = ASH_NAME
  ash.frustumCulled = false
  ash.renderOrder = 2

  const rockTelegraphGeometry = new THREE.RingGeometry(0.62, 1, 32)
  rockTelegraphGeometry.rotateX(-Math.PI / 2)
  const rockTelegraphMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc84a,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  })
  const rockTelegraphs = new THREE.InstancedMesh(
    rockTelegraphGeometry,
    rockTelegraphMaterial,
    MAX_ROCKFALL_EVENTS,
  )
  rockTelegraphs.name = ROCK_TELEGRAPH_NAME
  rockTelegraphs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  rockTelegraphs.count = 0
  rockTelegraphs.frustumCulled = false
  rockTelegraphs.renderOrder = 5

  const fallingRockGeometry = new THREE.DodecahedronGeometry(1.7, 0)
  const fallingRockMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d1915,
    emissive: 0xff4b1f,
    emissiveIntensity: 0.44,
    roughness: 0.9,
    metalness: 0.08,
    flatShading: true,
    fog: true,
  })
  const fallingRocks = new THREE.InstancedMesh(
    fallingRockGeometry,
    fallingRockMaterial,
    MAX_FALLING_ROCKS,
  )
  fallingRocks.name = FALLING_ROCK_NAME
  fallingRocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  fallingRocks.count = 0
  fallingRocks.frustumCulled = false
  fallingRocks.renderOrder = 4

  const lavaTelegraphGeometry = new THREE.BoxGeometry(1, 0.08, 0.46)
  const lavaTelegraphMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb23d,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  })
  const lavaTelegraph = new THREE.InstancedMesh(
    lavaTelegraphGeometry,
    lavaTelegraphMaterial,
    HIGH_LAVA_SEGMENT_COUNT,
  )
  lavaTelegraph.name = LAVA_TELEGRAPH_NAME
  lavaTelegraph.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  lavaTelegraph.count = 0
  lavaTelegraph.frustumCulled = false
  lavaTelegraph.renderOrder = 5

  const lavaWaveGeometry = new THREE.PlaneGeometry(1, 0.9)
  const lavaWaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xff431c,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  })
  const lavaWave = new THREE.InstancedMesh(
    lavaWaveGeometry,
    lavaWaveMaterial,
    HIGH_LAVA_SEGMENT_COUNT,
  )
  lavaWave.name = LAVA_WAVE_NAME
  lavaWave.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  lavaWave.count = 0
  lavaWave.frustumCulled = false
  lavaWave.renderOrder = 6

  root.add(
    thermalColumns,
    ash,
    rockTelegraphs,
    fallingRocks,
    lavaTelegraph,
    lavaWave,
  )
  scene.add(root)

  const thermalTriangles = trianglesPerInstance(thermalGeometry)
  const rockTelegraphTriangles = trianglesPerInstance(rockTelegraphGeometry)
  const fallingRockTriangles = trianglesPerInstance(fallingRockGeometry)
  const lavaTelegraphTriangles = trianglesPerInstance(lavaTelegraphGeometry)
  const lavaWaveTriangles = trianglesPerInstance(lavaWaveGeometry)

  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const matrix = new THREE.Matrix4()

  let qualityTier = initialQualityTier
  let isReducedMotion = false
  let isLoaded = false
  let isActive = false
  let thermalColumnCount = 0
  let ashParticleCount = 0
  let rockTelegraphCount = 0
  let fallingRockCount = 0
  let lavaTelegraphSegmentCount = 0
  let lavaWaveSegmentCount = 0
  let lavaWaveDrawPrimed = false
  let triangles = 0
  let drawCalls = 0
  let disposed = false

  const hidePools = (): void => {
    root.visible = false
    thermalColumns.visible = false
    ash.visible = false
    rockTelegraphs.visible = false
    fallingRocks.visible = false
    lavaTelegraph.visible = false
    lavaWave.visible = false
    rockTelegraphs.count = 0
    fallingRocks.count = 0
    lavaTelegraph.count = 0
    lavaWave.count = 0
    ashGeometry.setDrawRange(0, 0)
    thermalColumnCount = 0
    ashParticleCount = 0
    rockTelegraphCount = 0
    fallingRockCount = 0
    lavaTelegraphSegmentCount = 0
    lavaWaveSegmentCount = 0
    triangles = 0
    drawCalls = 0
  }

  return {
    update: (frame, simulationSeconds, loaded, active) => {
      if (disposed) return

      isLoaded = loaded
      isActive = active
      isReducedMotion = reducedMotion()
      if (!loaded || !active) {
        hidePools()
        return
      }

      root.visible = true
      lavaWaveMaterial.opacity = 0.92
      const safeSeconds = Number.isFinite(simulationSeconds)
        ? simulationSeconds
        : 0
      const localMotionScale = isReducedMotion
        ? REDUCED_MOTION_SCALE
        : 1
      const motionScale = Math.min(
        localMotionScale,
        frame.visualDensity.motionScale,
      )
      const localAshCount =
        qualityTier === 'high'
          ? isReducedMotion
            ? HIGH_REDUCED_ASH_COUNT
            : HIGH_ASH_COUNT
          : isReducedMotion
            ? LOW_REDUCED_ASH_COUNT
            : LOW_ASH_COUNT
      const rocksPerEvent = Math.min(
        qualityTier === 'high'
          ? HIGH_ROCKS_PER_EVENT
          : LOW_ROCKS_PER_EVENT,
        frame.visualDensity.rockfallInstancesPerEvent,
      )
      const lavaTelegraphSegmentBudget = Math.min(
        qualityTier === 'high'
          ? HIGH_LAVA_SEGMENT_COUNT
          : LOW_LAVA_SEGMENT_COUNT,
        frame.visualDensity.lavaWaveSegments,
      )
      const lavaWaveSegmentBudget = Math.min(
        qualityTier === 'high'
          ? HIGH_ACTIVE_LAVA_SEGMENT_COUNT
          : LOW_LAVA_SEGMENT_COUNT,
        frame.visualDensity.lavaWaveSegments,
      )
      ashParticleCount = Math.min(
        localAshCount,
        frame.visualDensity.ashParticleCount,
      )

      thermalColumnCount = VOLCANIC_ARCHIPELAGO_THERMAL_ZONES.length
      for (let index = 0; index < thermalColumnCount; index += 1) {
        const zone = VOLCANIC_ARCHIPELAGO_THERMAL_ZONES[index]
        const phase = safeSeconds * motionScale * 0.72 + index * 1.9
        const pulse = 1 + Math.sin(phase) * 0.08 * motionScale
        position.set(
          zone.center.x + Math.cos(phase * 0.43) * 0.7 * motionScale,
          zone.center.y + zone.radius * 0.74,
          zone.center.z + Math.sin(phase * 0.41) * 0.7 * motionScale,
        )
        euler.set(0, phase * 0.18, 0)
        rotation.setFromEuler(euler)
        scale.set(
          zone.radius * 0.34 * pulse,
          zone.radius * 1.48,
          zone.radius * 0.34 * pulse,
        )
        matrix.compose(position, rotation, scale)
        thermalColumns.setMatrixAt(index, matrix)
      }
      thermalColumns.visible = thermalColumnCount > 0
      thermalColumns.count = thermalColumnCount
      thermalColumns.instanceMatrix.needsUpdate = true
      thermalMaterial.opacity = qualityTier === 'high'
        ? isReducedMotion
          ? 0.1
          : 0.14
        : isReducedMotion
          ? 0.07
          : 0.1

      for (let index = 0; index < ashParticleCount; index += 1) {
        const phase = ashAngles[index] + safeSeconds * 0.13 * ashDrifts[index] * motionScale
        const height =
          (ashHeights[index] + safeSeconds * 3.2 * ashDrifts[index] * motionScale) %
          112
        const offset = index * 3
        ashPositions[offset] =
          VOLCANIC_ARCHIPELAGO_CENTER.x +
          Math.cos(phase) * ashRadii[index] +
          Math.sin(phase * 2.3) * 2
        ashPositions[offset + 1] = 22 + height
        ashPositions[offset + 2] =
          VOLCANIC_ARCHIPELAGO_CENTER.z +
          Math.sin(phase) * ashRadii[index] +
          Math.cos(phase * 1.7) * 2
      }
      ashGeometry.setDrawRange(0, ashParticleCount)
      ashPositionAttribute.needsUpdate = ashParticleCount > 0
      ash.visible = ashParticleCount > 0
      ashMaterial.size = qualityTier === 'high' ? 1.15 : 0.9
      ashMaterial.opacity = isReducedMotion ? 0.42 : 0.58

      rockTelegraphCount = 0
      fallingRockCount = 0
      for (let eventIndex = 0; eventIndex < frame.rockfalls.length; eventIndex += 1) {
        const rockfall = frame.rockfalls[eventIndex]
        if (rockfall.phase === 'telegraph') {
          const warningScale =
            rockfall.collisionRadius *
            (1.62 - rockfall.normalizedPhase * 0.58)
          position.set(
            rockfall.target.x,
            rockfall.target.y + 0.36,
            rockfall.target.z,
          )
          rotation.identity()
          scale.setScalar(warningScale)
          matrix.compose(position, rotation, scale)
          rockTelegraphs.setMatrixAt(rockTelegraphCount, matrix)
          rockTelegraphCount += 1
          continue
        }

        if (rockfall.phase !== 'active') continue
        for (let rockIndex = 0; rockIndex < rocksPerEvent; rockIndex += 1) {
          const angle =
            eventIndex * 2.4 +
            rockIndex * (FULL_TURN / Math.max(rocksPerEvent, 1)) +
            safeSeconds * 0.7 * motionScale
          const spread = rockIndex === 0 ? 0 : 2.1
          position.set(
            rockfall.collisionCenter.x + Math.cos(angle) * spread,
            rockfall.collisionCenter.y +
              Math.sin(angle * 1.7) * 0.65 * motionScale,
            rockfall.collisionCenter.z + Math.sin(angle) * spread,
          )
          euler.set(
            safeSeconds * (1.1 + rockIndex * 0.2) * motionScale,
            angle,
            safeSeconds * 0.8 * motionScale,
          )
          rotation.setFromEuler(euler)
          scale.setScalar(rockIndex === 0 ? 1.22 : 0.78)
          matrix.compose(position, rotation, scale)
          fallingRocks.setMatrixAt(fallingRockCount, matrix)
          fallingRockCount += 1
        }
      }
      rockTelegraphs.count = rockTelegraphCount
      rockTelegraphs.visible = rockTelegraphCount > 0
      rockTelegraphs.instanceMatrix.needsUpdate = rockTelegraphCount > 0
      rockTelegraphMaterial.opacity =
        0.3 + (0.5 + Math.sin(safeSeconds * 8 * motionScale) * 0.5) * 0.22
      fallingRocks.count = fallingRockCount
      fallingRocks.visible = fallingRockCount > 0
      fallingRocks.instanceMatrix.needsUpdate = fallingRockCount > 0

      const wave = frame.lavaWave
      lavaTelegraphSegmentCount =
        wave.phase === 'telegraph' ? lavaTelegraphSegmentBudget : 0
      lavaWaveSegmentCount =
        wave.phase === 'active' ? lavaWaveSegmentBudget : 0

      if (lavaTelegraphSegmentCount > 0) {
        const radius = 14 - wave.normalizedPhase * 4
        const segmentLength =
          (FULL_TURN * radius * 0.64) / lavaTelegraphSegmentCount
        for (let index = 0; index < lavaTelegraphSegmentCount; index += 1) {
          const angle =
            wave.angleOffsetRadians +
            (index / lavaTelegraphSegmentCount) * FULL_TURN
          position.set(
            wave.center.x + Math.cos(angle) * radius,
            wave.center.y + 0.28,
            wave.center.z + Math.sin(angle) * radius,
          )
          euler.set(0, angle - Math.PI / 2, 0)
          rotation.setFromEuler(euler)
          scale.set(segmentLength, 1, 1)
          matrix.compose(position, rotation, scale)
          lavaTelegraph.setMatrixAt(index, matrix)
        }
        lavaTelegraph.instanceMatrix.needsUpdate = true
      }
      lavaTelegraph.count = lavaTelegraphSegmentCount
      lavaTelegraph.visible = lavaTelegraphSegmentCount > 0
      lavaTelegraphMaterial.opacity =
        0.22 + (0.5 + Math.sin(safeSeconds * 6 * motionScale) * 0.5) * 0.18

      if (lavaWaveSegmentCount > 0) {
        const segmentLength =
          (FULL_TURN * wave.waveRadius * 1.04) / lavaWaveSegmentCount
        for (let index = 0; index < lavaWaveSegmentCount; index += 1) {
          const angle =
            wave.angleOffsetRadians +
            (index / lavaWaveSegmentCount) * FULL_TURN
          const crest = Math.sin(index * 1.7 + safeSeconds * 9 * motionScale)
          position.set(
            wave.center.x + Math.cos(angle) * wave.waveRadius,
            wave.center.y + 0.72 + crest * 0.22 * motionScale,
            wave.center.z + Math.sin(angle) * wave.waveRadius,
          )
          euler.set(0, angle - Math.PI / 2, crest * 0.08 * motionScale)
          rotation.setFromEuler(euler)
          scale.set(segmentLength, 0.9 + Math.abs(crest) * 0.35, 1)
          matrix.compose(position, rotation, scale)
          lavaWave.setMatrixAt(index, matrix)
        }
        lavaWave.instanceMatrix.needsUpdate = true
      }
      lavaWave.count = lavaWaveSegmentCount
      lavaWave.visible = lavaWaveSegmentCount > 0

      triangles =
        thermalColumnCount * thermalTriangles +
        rockTelegraphCount * rockTelegraphTriangles +
        fallingRockCount * fallingRockTriangles +
        lavaTelegraphSegmentCount * lavaTelegraphTriangles +
        lavaWaveSegmentCount * lavaWaveTriangles
      drawCalls =
        (thermalColumnCount > 0 ? 1 : 0) +
        (ashParticleCount > 0 ? 1 : 0) +
        (rockTelegraphCount > 0 ? 1 : 0) +
        (fallingRockCount > 0 ? 1 : 0) +
        (lavaTelegraphSegmentCount > 0 ? 1 : 0) +
        (lavaWaveSegmentCount > 0 ? 1 : 0)
    },
    primeFirstLavaWaveDraw: () => {
      if (disposed || !root.visible) return

      const radius = 14
      const segmentLength =
        (FULL_TURN * radius * 1.04) / HIGH_ACTIVE_LAVA_SEGMENT_COUNT
      for (let index = 0; index < HIGH_ACTIVE_LAVA_SEGMENT_COUNT; index += 1) {
        const angle = (index / HIGH_ACTIVE_LAVA_SEGMENT_COUNT) * FULL_TURN
        position.set(
          VOLCANIC_ARCHIPELAGO_CENTER.x + Math.cos(angle) * radius,
          VOLCANIC_ARCHIPELAGO_CENTER.y + 0.72,
          VOLCANIC_ARCHIPELAGO_CENTER.z + Math.sin(angle) * radius,
        )
        euler.set(0, angle - Math.PI / 2, 0)
        rotation.setFromEuler(euler)
        scale.set(segmentLength, 1, 1)
        matrix.compose(position, rotation, scale)
        lavaWave.setMatrixAt(index, matrix)
      }
      lavaWave.instanceMatrix.needsUpdate = true
      lavaWave.count = HIGH_ACTIVE_LAVA_SEGMENT_COUNT
      lavaWave.visible = true
      lavaWaveDrawPrimed = true
      // The ready/countdown render uploads the dynamic instance buffer without
      // showing an early hazard to the player.
      lavaWaveMaterial.opacity = 0
    },
    setQuality: (tier) => {
      if (disposed || tier === qualityTier) return
      qualityTier = tier
    },
    debugSnapshot: () => ({
      qualityTier,
      reducedMotion: isReducedMotion,
      loaded: isLoaded,
      active: isActive,
      thermalColumnCount,
      ashParticleCount,
      rockTelegraphCount,
      fallingRockCount,
      lavaTelegraphSegmentCount,
      lavaWaveSegmentCount,
      lavaWaveDrawPrimed,
      triangles,
      drawCalls,
      disposed,
    }),
    dispose: () => {
      if (disposed) return
      disposed = true
      hidePools()
      isLoaded = false
      isActive = false
      root.removeFromParent()
      thermalGeometry.dispose()
      thermalMaterial.dispose()
      ashGeometry.dispose()
      ashMaterial.dispose()
      rockTelegraphGeometry.dispose()
      rockTelegraphMaterial.dispose()
      fallingRockGeometry.dispose()
      fallingRockMaterial.dispose()
      lavaTelegraphGeometry.dispose()
      lavaTelegraphMaterial.dispose()
      lavaWaveGeometry.dispose()
      lavaWaveMaterial.dispose()
    },
  }
}
