import type { SphereObstacle } from '../collision/obstacleCollision'
import { findSweptSphereCollision } from '../collision/obstacleCollision'
import type { ExplorationLandingPad } from '../exploration/explorationFlight'
import type { Vec3Value } from '../flight/flightModel'

export type VolcanicArchipelagoLandmarkId =
  | 'emberwatch-landing'
  | 'obsidian-causeway'
  | 'cooling-ruins'
  | 'sunheart-caldera'
  | 'eruption-escape-arch'
  | 'hidden-magma-tube'

export type VolcanicThermalZoneId =
  | 'caldera-column'
  | 'bridge-draft'
  | 'ruins-vent'

export interface VolcanicArchipelagoLandmark {
  readonly id: VolcanicArchipelagoLandmarkId
  readonly name: string
  readonly position: Vec3Value
  readonly discoveryRadius: number
  readonly secret: boolean
}

export interface VolcanicThermalZone {
  readonly id: VolcanicThermalZoneId
  readonly name: string
  readonly center: Vec3Value
  readonly radius: number
  readonly velocity: Vec3Value
}

export interface VolcanicDiscoveryProgress {
  readonly discoveredLandmarkIds: readonly VolcanicArchipelagoLandmarkId[]
  readonly traversedThermalZoneIds: readonly VolcanicThermalZoneId[]
}

export interface VolcanicDiscoveryStep {
  readonly progress: VolcanicDiscoveryProgress
  readonly newLandmarkIds: readonly VolcanicArchipelagoLandmarkId[]
  readonly newThermalZoneIds: readonly VolcanicThermalZoneId[]
}

export interface VolcanicThermalWindSample {
  readonly velocity: Vec3Value
  readonly activeZoneIds: readonly VolcanicThermalZoneId[]
}

export const VOLCANIC_ARCHIPELAGO_CENTER = {
  x: -240,
  y: 28,
  z: -820,
} as const satisfies Vec3Value

export const VOLCANIC_ARCHIPELAGO_LANDMARKS: readonly VolcanicArchipelagoLandmark[] =
  [
    {
      id: 'emberwatch-landing',
      name: '잿불감시 착륙장',
      position: { x: -240, y: 26, z: -748 },
      discoveryRadius: 22,
      secret: false,
    },
    {
      id: 'obsidian-causeway',
      name: '흑요석 잔교',
      position: { x: -255, y: 42, z: -824 },
      discoveryRadius: 18,
      secret: false,
    },
    {
      id: 'cooling-ruins',
      name: '냉각 유적',
      position: { x: -279, y: 44, z: -858 },
      discoveryRadius: 18,
      secret: false,
    },
    {
      id: 'sunheart-caldera',
      name: '태양심 분화구',
      position: { x: -240, y: 53, z: -824 },
      discoveryRadius: 26,
      secret: false,
    },
    {
      id: 'eruption-escape-arch',
      name: '분화 탈출 아치',
      position: { x: -240, y: 53, z: -902 },
      discoveryRadius: 16,
      secret: false,
    },
    {
      id: 'hidden-magma-tube',
      name: '숨은 용암관',
      position: { x: -250, y: 30, z: -824 },
      discoveryRadius: 12,
      secret: true,
    },
  ] as const

export const VOLCANIC_ARCHIPELAGO_THERMAL_ZONES: readonly VolcanicThermalZone[] =
  [
    {
      id: 'caldera-column',
      name: '분화구 열기둥',
      center: { x: -240, y: 49, z: -824 },
      radius: 18,
      velocity: { x: 0.5, y: 13, z: 0.5 },
    },
    {
      id: 'bridge-draft',
      name: '잔교 상승류',
      center: { x: -296, y: 48, z: -815 },
      radius: 14,
      velocity: { x: -1, y: 10, z: -3 },
    },
    {
      id: 'ruins-vent',
      name: '유적 열기공',
      center: { x: -236, y: 54, z: -869 },
      radius: 13,
      velocity: { x: 2, y: 9, z: -1 },
    },
  ] as const

export const VOLCANIC_ARCHIPELAGO_PRIMARY_LANDING_PAD = {
  id: 'volcanic-archipelago-pad',
  position: { x: -240, y: 26, z: -748 },
  radius: 20,
} as const satisfies ExplorationLandingPad

export const VOLCANIC_ARCHIPELAGO_LANDING_PADS: readonly ExplorationLandingPad[] =
  [
    VOLCANIC_ARCHIPELAGO_PRIMARY_LANDING_PAD,
    {
      id: 'volcanic-ruins-pad',
      position: { x: -279, y: 38, z: -858 },
      radius: 8,
    },
    {
      id: 'volcanic-escape-pad',
      position: { x: -214, y: 32, z: -876 },
      radius: 9,
    },
  ] as const

export const VOLCANIC_ARCHIPELAGO_CHALLENGE_BEACON = {
  position: { x: -240, y: 43, z: -762 },
  radius: 14,
} as const

export const VOLCANIC_ARCHIPELAGO_COLLIDERS: readonly SphereObstacle[] = [
  {
    id: 'volcanic-emberwatch-island',
    center: { x: -240, y: 8, z: -748 },
    radius: 14,
  },
  {
    id: 'volcanic-ruins-island',
    center: { x: -279, y: 20, z: -858 },
    radius: 15,
  },
  {
    id: 'volcanic-escape-island',
    center: { x: -214, y: 15, z: -876 },
    radius: 15,
  },
  {
    id: 'volcanic-caldera-west',
    center: { x: -264, y: 31, z: -824 },
    radius: 15,
  },
  {
    id: 'volcanic-caldera-east',
    center: { x: -216, y: 32, z: -824 },
    radius: 14,
  },
  {
    id: 'volcanic-causeway-west-pillar',
    center: { x: -268, y: 34, z: -824 },
    radius: 5,
  },
  {
    id: 'volcanic-causeway-east-pillar',
    center: { x: -240, y: 34, z: -824 },
    radius: 5,
  },
  {
    id: 'volcanic-ruins-spire',
    center: { x: -279, y: 38, z: -858 },
    radius: 5,
  },
] as const

export const VOLCANIC_THERMAL_MAX_SPEED = 16

const LANDMARK_IDS = new Set(
  VOLCANIC_ARCHIPELAGO_LANDMARKS.map(({ id }) => id),
)
const THERMAL_ZONE_IDS = new Set(
  VOLCANIC_ARCHIPELAGO_THERMAL_ZONES.map(({ id }) => id),
)

export function isVolcanicArchipelagoLandmarkId(
  value: unknown,
): value is VolcanicArchipelagoLandmarkId {
  return (
    typeof value === 'string' &&
    LANDMARK_IDS.has(value as VolcanicArchipelagoLandmarkId)
  )
}

export function isVolcanicThermalZoneId(
  value: unknown,
): value is VolcanicThermalZoneId {
  return (
    typeof value === 'string' &&
    THERMAL_ZONE_IDS.has(value as VolcanicThermalZoneId)
  )
}

export function createVolcanicDiscoveryProgress(
  progress: Partial<VolcanicDiscoveryProgress> = {},
): VolcanicDiscoveryProgress {
  return {
    discoveredLandmarkIds: [
      ...new Set(
        (progress.discoveredLandmarkIds ?? []).filter(
          isVolcanicArchipelagoLandmarkId,
        ),
      ),
    ],
    traversedThermalZoneIds: [
      ...new Set(
        (progress.traversedThermalZoneIds ?? []).filter(
          isVolcanicThermalZoneId,
        ),
      ),
    ],
  }
}

function segmentEntersSphere(
  previous: Vec3Value,
  current: Vec3Value,
  id: string,
  center: Vec3Value,
  radius: number,
): boolean {
  return (
    findSweptSphereCollision(previous, current, 0, [
      { id, center, radius },
    ]) !== null
  )
}

export function stepVolcanicDiscovery(
  progress: VolcanicDiscoveryProgress,
  previous: Vec3Value,
  current: Vec3Value,
): VolcanicDiscoveryStep {
  const normalized = createVolcanicDiscoveryProgress(progress)
  const landmarks = new Set(normalized.discoveredLandmarkIds)
  const thermalZones = new Set(normalized.traversedThermalZoneIds)
  const newLandmarkIds: VolcanicArchipelagoLandmarkId[] = []
  const newThermalZoneIds: VolcanicThermalZoneId[] = []

  for (const landmark of VOLCANIC_ARCHIPELAGO_LANDMARKS) {
    if (
      !landmarks.has(landmark.id) &&
      segmentEntersSphere(
        previous,
        current,
        landmark.id,
        landmark.position,
        landmark.discoveryRadius,
      )
    ) {
      landmarks.add(landmark.id)
      newLandmarkIds.push(landmark.id)
    }
  }

  for (const zone of VOLCANIC_ARCHIPELAGO_THERMAL_ZONES) {
    if (
      !thermalZones.has(zone.id) &&
      segmentEntersSphere(
        previous,
        current,
        zone.id,
        zone.center,
        zone.radius,
      )
    ) {
      thermalZones.add(zone.id)
      newThermalZoneIds.push(zone.id)
    }
  }

  return {
    progress: {
      discoveredLandmarkIds: [...landmarks],
      traversedThermalZoneIds: [...thermalZones],
    },
    newLandmarkIds,
    newThermalZoneIds,
  }
}

export function sampleVolcanicThermalWind(
  position: Vec3Value,
): VolcanicThermalWindSample {
  const velocity = { x: 0, y: 0, z: 0 }
  const activeZoneIds: VolcanicThermalZoneId[] = []

  for (const zone of VOLCANIC_ARCHIPELAGO_THERMAL_ZONES) {
    const distance = Math.hypot(
      position.x - zone.center.x,
      position.y - zone.center.y,
      position.z - zone.center.z,
    )
    if (distance > zone.radius) continue

    const falloff = 1 - distance / zone.radius
    const strength = falloff * falloff
    velocity.x += zone.velocity.x * strength
    velocity.y += zone.velocity.y * strength
    velocity.z += zone.velocity.z * strength
    activeZoneIds.push(zone.id)
  }

  const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
  if (speed > VOLCANIC_THERMAL_MAX_SPEED) {
    const scale = VOLCANIC_THERMAL_MAX_SPEED / speed
    velocity.x *= scale
    velocity.y *= scale
    velocity.z *= scale
  }

  return { velocity, activeZoneIds }
}
