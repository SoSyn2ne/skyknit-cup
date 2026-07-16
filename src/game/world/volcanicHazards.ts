import type { SphereObstacle } from '../collision/obstacleCollision'
import type { Vec3Value } from '../flight/flightModel'

export type VolcanicHazardKind = 'rockfall' | 'lava-wave'
export type VolcanicHazardPhase = 'telegraph' | 'active' | 'cooldown'
export type VolcanicHazardVisualQuality = 'low' | 'high'

export interface VolcanicHazardVisualOptions {
  readonly quality?: VolcanicHazardVisualQuality
  readonly reducedMotion?: boolean
}

export interface VolcanicHazardVisualDensity {
  readonly ashParticleCount: number
  readonly rockfallInstancesPerEvent: number
  readonly lavaWaveSegments: number
  readonly motionScale: number
}

export interface VolcanicRockfallState {
  readonly kind: 'rockfall'
  readonly eventKey: string
  readonly slotIndex: number
  readonly cycleIndex: number
  readonly phase: VolcanicHazardPhase
  readonly phaseElapsedMs: number
  readonly phaseDurationMs: number
  readonly normalizedPhase: number
  readonly target: Vec3Value
  readonly collisionCenter: Vec3Value
  readonly collisionRadius: number
  readonly collisionActive: boolean
}

export interface VolcanicLavaWaveState {
  readonly kind: 'lava-wave'
  readonly eventKey: string
  readonly cycleIndex: number
  readonly phase: VolcanicHazardPhase
  readonly phaseElapsedMs: number
  readonly phaseDurationMs: number
  readonly normalizedPhase: number
  readonly center: Vec3Value
  readonly waveRadius: number
  readonly collisionBandRadius: number
  readonly angleOffsetRadians: number
  readonly collisionActive: boolean
}

export interface VolcanicHazardFrame {
  readonly elapsedMs: number
  readonly seed: number
  readonly rockfalls: readonly VolcanicRockfallState[]
  readonly lavaWave: VolcanicLavaWaveState
  readonly visualDensity: VolcanicHazardVisualDensity
}

export interface VolcanicHazardCollisionObstacle extends SphereObstacle {
  readonly eventKey: string
  readonly kind: VolcanicHazardKind
}

export interface VolcanicHazardCollisionQuery {
  readonly previous: Vec3Value
  readonly current: Vec3Value
  readonly movingRadius: number
  readonly handledEventKeys?: readonly string[]
}

export interface VolcanicHazardCollisionHit {
  readonly eventKey: string
  readonly kind: VolcanicHazardKind
  readonly obstacleId: string
  readonly t: number
  readonly point: Vec3Value
}

export interface VolcanicHazardCollisionSample {
  readonly hit: VolcanicHazardCollisionHit | null
  readonly handledEventKeys: readonly string[]
}

export const VOLCANIC_HAZARD_STEP_MS = 1_000 / 60
export const ROCKFALL_TELEGRAPH_MS = 1_800
export const LAVA_WAVE_TELEGRAPH_MS = 2_400

const ROCKFALL_ACTIVE_MS = 700
const ROCKFALL_CYCLE_MS = 6_000
const ROCKFALL_SLOT_OFFSET_MS = ROCKFALL_CYCLE_MS / 2
const ROCKFALL_COLLISION_RADIUS = 4.5
const ROCKFALL_DROP_HEIGHT = 44
const LAVA_WAVE_ACTIVE_MS = 1_600
const LAVA_WAVE_CYCLE_MS = 9_000
const LAVA_WAVE_MIN_RADIUS = 10
const LAVA_WAVE_MAX_RADIUS = 44
const LAVA_WAVE_COLLISION_BAND_RADIUS = 4
const LAVA_WAVE_COLLISION_SEGMENTS = 40
const FULL_TURN = Math.PI * 2
const STEP_EPSILON = 1e-9
const LAVA_WAVE_COLLISION_COSINES = Array.from(
  { length: LAVA_WAVE_COLLISION_SEGMENTS },
  (_, index) => Math.cos((index / LAVA_WAVE_COLLISION_SEGMENTS) * FULL_TURN),
)
const LAVA_WAVE_COLLISION_SINES = Array.from(
  { length: LAVA_WAVE_COLLISION_SEGMENTS },
  (_, index) => Math.sin((index / LAVA_WAVE_COLLISION_SEGMENTS) * FULL_TURN),
)

const ROCKFALL_TARGET_ANCHORS: readonly Vec3Value[] = [
  { x: -270, y: 42, z: -824 },
  { x: -279, y: 46, z: -858 },
  { x: -210, y: 48, z: -842 },
  { x: -240, y: 50, z: -881 },
  { x: -196, y: 44, z: -786 },
] as const

const LAVA_WAVE_CENTER = { x: -240, y: 47.5, z: -824 } as const

function toStepCount(milliseconds: number): number {
  return Math.round(milliseconds / VOLCANIC_HAZARD_STEP_MS)
}

const ROCKFALL_TELEGRAPH_STEPS = toStepCount(ROCKFALL_TELEGRAPH_MS)
const ROCKFALL_ACTIVE_STEPS = toStepCount(ROCKFALL_ACTIVE_MS)
const ROCKFALL_CYCLE_STEPS = toStepCount(ROCKFALL_CYCLE_MS)
const ROCKFALL_SLOT_OFFSET_STEPS = toStepCount(ROCKFALL_SLOT_OFFSET_MS)
const LAVA_WAVE_TELEGRAPH_STEPS = toStepCount(LAVA_WAVE_TELEGRAPH_MS)
const LAVA_WAVE_ACTIVE_STEPS = toStepCount(LAVA_WAVE_ACTIVE_MS)
const LAVA_WAVE_CYCLE_STEPS = toStepCount(LAVA_WAVE_CYCLE_MS)

function normalizeElapsedStep(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return Math.floor(elapsedMs / VOLCANIC_HAZARD_STEP_MS + STEP_EPSILON)
}

function normalizeSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0
}

function hashUnit(seed: number, first: number, second: number): number {
  let value = (seed ^ Math.imul(first + 1, 0x9e3779b1)) >>> 0
  value = (value ^ Math.imul(second + 1, 0x85ebca6b)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d) >>> 0
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b) >>> 0
  value ^= value >>> 16
  return (value >>> 0) / 0x1_0000_0000
}

function resolvePhase(
  cycleStep: number,
  telegraphSteps: number,
  activeSteps: number,
  cycleSteps: number,
): {
  readonly phase: VolcanicHazardPhase
  readonly phaseElapsedSteps: number
  readonly phaseDurationSteps: number
  readonly normalizedPhase: number
} {
  let phase: VolcanicHazardPhase
  let phaseElapsedSteps: number
  let phaseDurationSteps: number

  if (cycleStep < telegraphSteps) {
    phase = 'telegraph'
    phaseElapsedSteps = cycleStep
    phaseDurationSteps = telegraphSteps
  } else if (cycleStep < telegraphSteps + activeSteps) {
    phase = 'active'
    phaseElapsedSteps = cycleStep - telegraphSteps
    phaseDurationSteps = activeSteps
  } else {
    phase = 'cooldown'
    phaseElapsedSteps = cycleStep - telegraphSteps - activeSteps
    phaseDurationSteps = cycleSteps - telegraphSteps - activeSteps
  }

  return {
    phase,
    phaseElapsedSteps,
    phaseDurationSteps,
    normalizedPhase:
      phaseDurationSteps === 0 ? 0 : phaseElapsedSteps / phaseDurationSteps,
  }
}

function createRockfallState(
  elapsedStep: number,
  seed: number,
  slotIndex: number,
): VolcanicRockfallState {
  const eventStep = elapsedStep + slotIndex * ROCKFALL_SLOT_OFFSET_STEPS
  const cycleIndex = Math.floor(eventStep / ROCKFALL_CYCLE_STEPS)
  const cycleStep = eventStep % ROCKFALL_CYCLE_STEPS
  const timeline = resolvePhase(
    cycleStep,
    ROCKFALL_TELEGRAPH_STEPS,
    ROCKFALL_ACTIVE_STEPS,
    ROCKFALL_CYCLE_STEPS,
  )
  const anchorRoll = hashUnit(seed, cycleIndex, slotIndex * 7)
  const anchor =
    ROCKFALL_TARGET_ANCHORS[
      Math.floor(anchorRoll * ROCKFALL_TARGET_ANCHORS.length)
    ]
  const target = {
    x: anchor.x + (hashUnit(seed, cycleIndex, slotIndex * 7 + 1) - 0.5) * 10,
    y: anchor.y,
    z: anchor.z + (hashUnit(seed, cycleIndex, slotIndex * 7 + 2) - 0.5) * 10,
  }
  const dropProgress =
    timeline.phase === 'active' ? timeline.normalizedPhase : 0
  const collisionCenter = {
    x: target.x,
    y: target.y + ROCKFALL_DROP_HEIGHT * (1 - dropProgress),
    z: target.z,
  }

  return {
    kind: 'rockfall',
    eventKey: `rockfall:${slotIndex}:${cycleIndex}`,
    slotIndex,
    cycleIndex,
    phase: timeline.phase,
    phaseElapsedMs: timeline.phaseElapsedSteps * VOLCANIC_HAZARD_STEP_MS,
    phaseDurationMs: timeline.phaseDurationSteps * VOLCANIC_HAZARD_STEP_MS,
    normalizedPhase: timeline.normalizedPhase,
    target,
    collisionCenter,
    collisionRadius: ROCKFALL_COLLISION_RADIUS,
    collisionActive: timeline.phase === 'active',
  }
}

function createLavaWaveState(
  elapsedStep: number,
  seed: number,
): VolcanicLavaWaveState {
  const cycleIndex = Math.floor(elapsedStep / LAVA_WAVE_CYCLE_STEPS)
  const cycleStep = elapsedStep % LAVA_WAVE_CYCLE_STEPS
  const timeline = resolvePhase(
    cycleStep,
    LAVA_WAVE_TELEGRAPH_STEPS,
    LAVA_WAVE_ACTIVE_STEPS,
    LAVA_WAVE_CYCLE_STEPS,
  )
  const activeProgress =
    timeline.phase === 'active' ? timeline.normalizedPhase : 0

  return {
    kind: 'lava-wave',
    eventKey: `lava-wave:${cycleIndex}`,
    cycleIndex,
    phase: timeline.phase,
    phaseElapsedMs: timeline.phaseElapsedSteps * VOLCANIC_HAZARD_STEP_MS,
    phaseDurationMs: timeline.phaseDurationSteps * VOLCANIC_HAZARD_STEP_MS,
    normalizedPhase: timeline.normalizedPhase,
    center: LAVA_WAVE_CENTER,
    waveRadius:
      LAVA_WAVE_MIN_RADIUS +
      (LAVA_WAVE_MAX_RADIUS - LAVA_WAVE_MIN_RADIUS) * activeProgress,
    collisionBandRadius: LAVA_WAVE_COLLISION_BAND_RADIUS,
    angleOffsetRadians: hashUnit(seed, cycleIndex, 101) * FULL_TURN,
    collisionActive: timeline.phase === 'active',
  }
}

function getVisualDensity(
  options: VolcanicHazardVisualOptions,
): VolcanicHazardVisualDensity {
  const highQuality = options.quality !== 'low'
  const reducedMotion = options.reducedMotion === true

  return {
    ashParticleCount: highQuality ? (reducedMotion ? 72 : 180) : reducedMotion ? 36 : 84,
    rockfallInstancesPerEvent: highQuality ? 3 : 1,
    lavaWaveSegments: highQuality ? 64 : 24,
    motionScale: reducedMotion ? 0.35 : 1,
  }
}

export function sampleVolcanicHazards(
  elapsedMs: number,
  seed: number,
  visualOptions: VolcanicHazardVisualOptions = {},
): VolcanicHazardFrame {
  const elapsedStep = normalizeElapsedStep(elapsedMs)
  const normalizedSeed = normalizeSeed(seed)

  return {
    elapsedMs: elapsedStep * VOLCANIC_HAZARD_STEP_MS,
    seed: normalizedSeed,
    rockfalls: [
      createRockfallState(elapsedStep, normalizedSeed, 0),
      createRockfallState(elapsedStep, normalizedSeed, 1),
    ],
    lavaWave: createLavaWaveState(elapsedStep, normalizedSeed),
    visualDensity: getVisualDensity(visualOptions),
  }
}

export function getVolcanicHazardCollisionObstacles(
  frame: VolcanicHazardFrame,
): readonly VolcanicHazardCollisionObstacle[] {
  const obstacles: VolcanicHazardCollisionObstacle[] = []

  for (const rockfall of frame.rockfalls) {
    if (!rockfall.collisionActive) continue
    obstacles.push({
      id: `${rockfall.eventKey}:body`,
      eventKey: rockfall.eventKey,
      kind: rockfall.kind,
      center: rockfall.collisionCenter,
      radius: rockfall.collisionRadius,
    })
  }

  const wave = frame.lavaWave
  if (wave.collisionActive) {
    for (let index = 0; index < LAVA_WAVE_COLLISION_SEGMENTS; index += 1) {
      const angle =
        wave.angleOffsetRadians + (index / LAVA_WAVE_COLLISION_SEGMENTS) * FULL_TURN
      obstacles.push({
        id: `${wave.eventKey}:ring:${index}`,
        eventKey: wave.eventKey,
        kind: wave.kind,
        center: {
          x: wave.center.x + Math.cos(angle) * wave.waveRadius,
          y: wave.center.y,
          z: wave.center.z + Math.sin(angle) * wave.waveRadius,
        },
        radius: wave.collisionBandRadius,
      })
    }
  }

  return obstacles
}

function canonicalHandledEventKeys(
  frame: VolcanicHazardFrame,
  handledEventKeys: readonly string[],
): string[] {
  const currentEventKeys = new Set([
    ...frame.rockfalls.map(({ eventKey }) => eventKey),
    frame.lavaWave.eventKey,
  ])
  return [
    ...new Set(handledEventKeys.filter((eventKey) => currentEventKeys.has(eventKey))),
  ]
}

interface SweptSphereHit {
  readonly t: number
  readonly point: Vec3Value
}

function isFinitePosition(position: Vec3Value): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  )
}

function sampleSweptSphere(
  previous: Vec3Value,
  current: Vec3Value,
  movingRadius: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  obstacleRadius: number,
): SweptSphereHit | null {
  const directionX = current.x - previous.x
  const directionY = current.y - previous.y
  const directionZ = current.z - previous.z
  const segmentLengthSquared =
    directionX * directionX +
    directionY * directionY +
    directionZ * directionZ
  const offsetX = previous.x - centerX
  const offsetY = previous.y - centerY
  const offsetZ = previous.z - centerZ
  const expandedRadius = obstacleRadius + movingRadius
  const c =
    offsetX * offsetX +
    offsetY * offsetY +
    offsetZ * offsetZ -
    expandedRadius * expandedRadius
  let t: number | null = c <= 0 ? 0 : null

  if (t === null && segmentLengthSquared > Number.EPSILON) {
    const b =
      2 *
      (offsetX * directionX +
        offsetY * directionY +
        offsetZ * directionZ)
    const discriminant = b * b - 4 * segmentLengthSquared * c
    if (discriminant >= 0) {
      const candidate =
        (-b - Math.sqrt(discriminant)) / (2 * segmentLengthSquared)
      if (candidate >= 0 && candidate <= 1) t = candidate
    }
  }

  return t === null
    ? null
    : {
        t,
        point: {
          x: previous.x + directionX * t,
          y: previous.y + directionY * t,
          z: previous.z + directionZ * t,
        },
      }
}

export function sampleVolcanicHazardCollision(
  frame: VolcanicHazardFrame,
  query: VolcanicHazardCollisionQuery,
): VolcanicHazardCollisionSample {
  const handledEventKeys = canonicalHandledEventKeys(
    frame,
    query.handledEventKeys ?? [],
  )
  const handled = new Set(handledEventKeys)
  if (
    !isFinitePosition(query.previous) ||
    !isFinitePosition(query.current) ||
    !Number.isFinite(query.movingRadius) ||
    query.movingRadius < 0
  ) {
    return { hit: null, handledEventKeys }
  }

  let earliestHit: VolcanicHazardCollisionHit | null = null
  for (const rockfall of frame.rockfalls) {
    if (!rockfall.collisionActive || handled.has(rockfall.eventKey)) continue
    const collision = sampleSweptSphere(
      query.previous,
      query.current,
      query.movingRadius,
      rockfall.collisionCenter.x,
      rockfall.collisionCenter.y,
      rockfall.collisionCenter.z,
      rockfall.collisionRadius,
    )
    if (collision === null || (earliestHit !== null && collision.t >= earliestHit.t)) {
      continue
    }
    earliestHit = {
      eventKey: rockfall.eventKey,
      kind: rockfall.kind,
      obstacleId: `${rockfall.eventKey}:body`,
      ...collision,
    }
  }

  const wave = frame.lavaWave
  if (wave.collisionActive && !handled.has(wave.eventKey)) {
    const angleCosine = Math.cos(wave.angleOffsetRadians)
    const angleSine = Math.sin(wave.angleOffsetRadians)
    for (let index = 0; index < LAVA_WAVE_COLLISION_SEGMENTS; index += 1) {
      const unitX = LAVA_WAVE_COLLISION_COSINES[index] ?? 0
      const unitZ = LAVA_WAVE_COLLISION_SINES[index] ?? 0
      const rotatedX = unitX * angleCosine - unitZ * angleSine
      const rotatedZ = unitZ * angleCosine + unitX * angleSine
      const collision = sampleSweptSphere(
        query.previous,
        query.current,
        query.movingRadius,
        wave.center.x + rotatedX * wave.waveRadius,
        wave.center.y,
        wave.center.z + rotatedZ * wave.waveRadius,
        wave.collisionBandRadius,
      )
      if (
        collision === null ||
        (earliestHit !== null && collision.t >= earliestHit.t)
      ) {
        continue
      }
      earliestHit = {
        eventKey: wave.eventKey,
        kind: wave.kind,
        obstacleId: `${wave.eventKey}:ring:${index}`,
        ...collision,
      }
    }
  }

  if (earliestHit === null) {
    return { hit: null, handledEventKeys }
  }

  return {
    hit: earliestHit,
    handledEventKeys: [...handledEventKeys, earliestHit.eventKey],
  }
}
