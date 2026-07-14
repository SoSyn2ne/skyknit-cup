import type { SphereObstacle } from '../collision/obstacleCollision'
import { findSweptSphereCollision } from '../collision/obstacleCollision'
import type { ExplorationLandingPad } from '../exploration/explorationFlight'
import type { Vec3Value } from '../flight/flightModel'

export type FestivalHubLandmarkId =
  | 'dawnwing-airfield'
  | 'sunweave-spire'
  | 'crown-race-arch'
  | 'wind-loom'
  | 'whispering-grotto'

export type FestivalHubWindZoneId =
  | 'harbor-lift'
  | 'spire-spiral'
  | 'arch-tailwind'

export type FestivalJourneyObjectiveId =
  | 'landmarks'
  | 'wind-zones'
  | 'secret'
  | 'coin-run'
  | 'race-mission'

export interface FestivalHubLandmark {
  readonly id: FestivalHubLandmarkId
  readonly name: string
  readonly position: Vec3Value
  readonly discoveryRadius: number
  readonly secret: boolean
}

export interface FestivalHubWindZone {
  readonly id: FestivalHubWindZoneId
  readonly name: string
  readonly center: Vec3Value
  readonly radius: number
  readonly velocity: Vec3Value
}

export interface FestivalDiscoveryProgress {
  readonly discoveredLandmarkIds: readonly FestivalHubLandmarkId[]
  readonly traversedWindZoneIds: readonly FestivalHubWindZoneId[]
}

export interface FestivalDiscoveryStep {
  readonly progress: FestivalDiscoveryProgress
  readonly newLandmarkIds: readonly FestivalHubLandmarkId[]
  readonly newWindZoneIds: readonly FestivalHubWindZoneId[]
}

export interface FestivalWindSample {
  readonly velocity: Vec3Value
  readonly activeZoneIds: readonly FestivalHubWindZoneId[]
}

export interface FestivalJourney {
  readonly completedSteps: number
  readonly totalSteps: 5
  readonly nextObjectiveId: FestivalJourneyObjectiveId | null
  readonly isComplete: boolean
}

export const FESTIVAL_HUB_LANDMARKS: readonly FestivalHubLandmark[] = [
  {
    id: 'dawnwing-airfield',
    name: '새벽날개 비행장',
    position: { x: 0, y: 8, z: -40 },
    discoveryRadius: 28,
    secret: false,
  },
  {
    id: 'sunweave-spire',
    name: '햇실 첨탑',
    position: { x: -24, y: 24, z: -72 },
    discoveryRadius: 16,
    secret: false,
  },
  {
    id: 'crown-race-arch',
    name: '왕관 레이스 아치',
    position: { x: 34, y: 20, z: -50 },
    discoveryRadius: 14,
    secret: false,
  },
  {
    id: 'wind-loom',
    name: '바람 직조기',
    position: { x: 16, y: 24, z: -22 },
    discoveryRadius: 14,
    secret: false,
  },
  {
    id: 'whispering-grotto',
    name: '속삭임 동굴',
    position: { x: -42, y: 8, z: -22 },
    discoveryRadius: 11,
    secret: true,
  },
] as const

export const FESTIVAL_HUB_WIND_ZONES: readonly FestivalHubWindZone[] = [
  {
    id: 'harbor-lift',
    name: '항구 상승류',
    center: { x: 16, y: 24, z: -22 },
    radius: 13,
    velocity: { x: 0.5, y: 8, z: -1.5 },
  },
  {
    id: 'spire-spiral',
    name: '첨탑 나선류',
    center: { x: -16, y: 30, z: -60 },
    radius: 12,
    velocity: { x: -2.5, y: 9, z: -0.5 },
  },
  {
    id: 'arch-tailwind',
    name: '아치 순풍',
    center: { x: 34, y: 22, z: -50 },
    radius: 14,
    velocity: { x: 0, y: 3, z: -7 },
  },
] as const

export const FESTIVAL_HUB_PRIMARY_LANDING_PAD = {
  id: 'festival-hub-pad',
  position: { x: 0, y: 5.2, z: -40 },
  radius: 20,
} as const satisfies ExplorationLandingPad

export const FESTIVAL_HUB_LANDING_PADS: readonly ExplorationLandingPad[] = [
  FESTIVAL_HUB_PRIMARY_LANDING_PAD,
  {
    id: 'festival-tower-pad',
    position: { x: -24, y: 26, z: -62 },
    radius: 8,
  },
  {
    id: 'festival-grotto-pad',
    position: { x: -42, y: 6, z: -12 },
    radius: 7,
  },
] as const

export const FESTIVAL_HUB_CHALLENGE_BEACON = {
  position: { x: 34, y: 20, z: -50 },
  radius: 14,
} as const

export const FESTIVAL_HUB_COLLIDERS: readonly SphereObstacle[] = [
  {
    id: 'festival-airfield-underside',
    center: { x: 0, y: -15, z: -40 },
    radius: 17.5,
  },
  {
    id: 'festival-tower-lower',
    center: { x: -24, y: 14, z: -72 },
    radius: 5.5,
  },
  {
    id: 'festival-tower-upper',
    center: { x: -24, y: 34, z: -72 },
    radius: 4.5,
  },
  {
    id: 'festival-arch-west',
    center: { x: 25.8, y: 14, z: -50 },
    radius: 3.2,
  },
  {
    id: 'festival-arch-east',
    center: { x: 42.2, y: 14, z: -50 },
    radius: 3.2,
  },
  {
    id: 'festival-wind-loom-west',
    center: { x: 3, y: 12, z: -22 },
    radius: 3,
  },
  {
    id: 'festival-wind-loom-east',
    center: { x: 29, y: 12, z: -22 },
    radius: 3,
  },
  {
    id: 'festival-wind-loom-west-mid',
    center: { x: 3, y: 20, z: -22 },
    radius: 3,
  },
  {
    id: 'festival-wind-loom-east-mid',
    center: { x: 29, y: 20, z: -22 },
    radius: 3,
  },
  {
    id: 'festival-wind-loom-west-upper',
    center: { x: 3, y: 28, z: -22 },
    radius: 3,
  },
  {
    id: 'festival-wind-loom-east-upper',
    center: { x: 29, y: 28, z: -22 },
    radius: 3,
  },
  {
    id: 'festival-wind-loom-west-cap',
    center: { x: 3, y: 35, z: -22 },
    radius: 3.2,
  },
  {
    id: 'festival-wind-loom-east-cap',
    center: { x: 29, y: 35, z: -22 },
    radius: 3.2,
  },
  {
    id: 'festival-grotto-roof',
    center: { x: -42, y: 10, z: -22 },
    radius: 4,
  },
] as const

export const FESTIVAL_WIND_MAX_SPEED = 12

const LANDMARK_IDS = new Set(
  FESTIVAL_HUB_LANDMARKS.map(({ id }) => id),
)
const WIND_ZONE_IDS = new Set(FESTIVAL_HUB_WIND_ZONES.map(({ id }) => id))

export function isFestivalHubLandmarkId(
  value: unknown,
): value is FestivalHubLandmarkId {
  return (
    typeof value === 'string' &&
    LANDMARK_IDS.has(value as FestivalHubLandmarkId)
  )
}

export function isFestivalHubWindZoneId(
  value: unknown,
): value is FestivalHubWindZoneId {
  return (
    typeof value === 'string' &&
    WIND_ZONE_IDS.has(value as FestivalHubWindZoneId)
  )
}

export function createFestivalDiscoveryProgress(
  progress: Partial<FestivalDiscoveryProgress> = {},
): FestivalDiscoveryProgress {
  return {
    discoveredLandmarkIds: [
      ...new Set(
        (progress.discoveredLandmarkIds ?? []).filter(
          isFestivalHubLandmarkId,
        ),
      ),
    ],
    traversedWindZoneIds: [
      ...new Set(
        (progress.traversedWindZoneIds ?? []).filter(
          isFestivalHubWindZoneId,
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

export function stepFestivalDiscovery(
  progress: FestivalDiscoveryProgress,
  previous: Vec3Value,
  current: Vec3Value,
): FestivalDiscoveryStep {
  const normalized = createFestivalDiscoveryProgress(progress)
  const landmarks = new Set(normalized.discoveredLandmarkIds)
  const windZones = new Set(normalized.traversedWindZoneIds)
  const newLandmarkIds: FestivalHubLandmarkId[] = []
  const newWindZoneIds: FestivalHubWindZoneId[] = []

  for (const landmark of FESTIVAL_HUB_LANDMARKS) {
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

  for (const zone of FESTIVAL_HUB_WIND_ZONES) {
    if (
      !windZones.has(zone.id) &&
      segmentEntersSphere(
        previous,
        current,
        zone.id,
        zone.center,
        zone.radius,
      )
    ) {
      windZones.add(zone.id)
      newWindZoneIds.push(zone.id)
    }
  }

  return {
    progress: {
      discoveredLandmarkIds: [...landmarks],
      traversedWindZoneIds: [...windZones],
    },
    newLandmarkIds,
    newWindZoneIds,
  }
}

export function sampleFestivalWind(position: Vec3Value): FestivalWindSample {
  const velocity = { x: 0, y: 0, z: 0 }
  const activeZoneIds: FestivalHubWindZoneId[] = []

  for (const zone of FESTIVAL_HUB_WIND_ZONES) {
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
  if (speed > FESTIVAL_WIND_MAX_SPEED) {
    const scale = FESTIVAL_WIND_MAX_SPEED / speed
    velocity.x *= scale
    velocity.y *= scale
    velocity.z *= scale
  }

  return { velocity, activeZoneIds }
}

export function getFestivalJourney(
  progress: FestivalDiscoveryProgress,
  festivalCoinBestTimeMs: number | undefined,
  raceBestTimeMs: number | null,
): FestivalJourney {
  const normalized = createFestivalDiscoveryProgress(progress)
  const discovered = new Set(normalized.discoveredLandmarkIds)
  const publicLandmarksComplete = FESTIVAL_HUB_LANDMARKS.filter(
    ({ secret }) => !secret,
  ).every(({ id }) => discovered.has(id))
  const windZonesComplete = FESTIVAL_HUB_WIND_ZONES.every(({ id }) =>
    normalized.traversedWindZoneIds.includes(id),
  )
  const secretComplete = discovered.has('whispering-grotto')
  const coinRunComplete =
    festivalCoinBestTimeMs !== undefined &&
    Number.isFinite(festivalCoinBestTimeMs) &&
    festivalCoinBestTimeMs > 0
  const raceMissionComplete =
    raceBestTimeMs !== null &&
    Number.isFinite(raceBestTimeMs) &&
    raceBestTimeMs > 0
  const steps = [
    ['landmarks', publicLandmarksComplete],
    ['wind-zones', windZonesComplete],
    ['secret', secretComplete],
    ['coin-run', coinRunComplete],
    ['race-mission', raceMissionComplete],
  ] as const
  const completedSteps = steps.filter(([, complete]) => complete).length
  const nextObjectiveId = steps.find(([, complete]) => !complete)?.[0] ?? null

  return {
    completedSteps,
    totalSteps: 5,
    nextObjectiveId,
    isComplete: completedSteps === 5,
  }
}
