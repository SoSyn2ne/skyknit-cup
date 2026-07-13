import type { Vec3Value } from '../flight/flightModel'
import type { ExplorationLandingPad } from '../exploration/explorationFlight'

export type OpenWorldRegionId =
  | 'festival-hub'
  | 'wind-canyon'
  | 'cloud-ruins'

export type RegionVisualTheme = 'festival' | 'canyon' | 'ruins'

export interface OpenWorldRegion {
  readonly id: OpenWorldRegionId
  readonly name: string
  readonly center: Vec3Value
  readonly discoveryRadius: number
  readonly visualTheme: RegionVisualTheme
  readonly landingPad: ExplorationLandingPad
}

export interface DestinationGuidance {
  readonly destination: OpenWorldRegion
  readonly distance: number
  readonly absoluteBearingRadians: number
  readonly relativeBearingRadians: number
}

export const REGION_LOAD_RADIUS = 420
export const REGION_UNLOAD_RADIUS = 500
export const REGION_DISCOVERY_RADIUS = 140

export const OPEN_WORLD_REGIONS: readonly OpenWorldRegion[] = [
  {
    id: 'festival-hub',
    name: '축제 중심섬',
    center: { x: 0, y: 8, z: -40 },
    discoveryRadius: REGION_DISCOVERY_RADIUS,
    visualTheme: 'festival',
    landingPad: {
      id: 'festival-hub-pad',
      position: { x: 0, y: 4, z: -40 },
      radius: 20,
    },
  },
  {
    id: 'wind-canyon',
    name: '바람 협곡',
    center: { x: 500, y: 24, z: -680 },
    discoveryRadius: REGION_DISCOVERY_RADIUS,
    visualTheme: 'canyon',
    landingPad: {
      id: 'wind-canyon-pad',
      position: { x: 500, y: 14, z: -680 },
      radius: 18,
    },
  },
  {
    id: 'cloud-ruins',
    name: '구름 유적지',
    center: { x: 430, y: 28, z: 190 },
    discoveryRadius: REGION_DISCOVERY_RADIUS,
    visualTheme: 'ruins',
    landingPad: {
      id: 'cloud-ruins-pad',
      position: { x: 430, y: 24, z: 190 },
      radius: 18,
    },
  },
] as const

const REGIONS_BY_ID = new Map(
  OPEN_WORLD_REGIONS.map((region) => [region.id, region]),
)

function horizontalDistance(left: Vec3Value, right: Vec3Value): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function wrapRadians(radians: number): number {
  const fullTurn = Math.PI * 2
  return ((radians + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

export function isOpenWorldRegionId(
  value: unknown,
): value is OpenWorldRegionId {
  return typeof value === 'string' && REGIONS_BY_ID.has(value as OpenWorldRegionId)
}

export function getRegionById(
  id: OpenWorldRegionId,
): OpenWorldRegion {
  return REGIONS_BY_ID.get(id) ?? OPEN_WORLD_REGIONS[0]
}

export function getLoadedRegionIds(
  position: Vec3Value,
  previouslyLoaded: readonly OpenWorldRegionId[],
): readonly OpenWorldRegionId[] {
  const previous = new Set(previouslyLoaded)
  return OPEN_WORLD_REGIONS.filter((region) => {
    const radius = previous.has(region.id)
      ? REGION_UNLOAD_RADIUS
      : REGION_LOAD_RADIUS
    return horizontalDistance(position, region.center) <= radius
  }).map((region) => region.id)
}

export function getDiscoveredRegionIds(
  position: Vec3Value,
  discovered: readonly OpenWorldRegionId[],
): readonly OpenWorldRegionId[] {
  const next = new Set(discovered)
  for (const region of OPEN_WORLD_REGIONS) {
    if (horizontalDistance(position, region.center) <= region.discoveryRadius) {
      next.add(region.id)
    }
  }
  return OPEN_WORLD_REGIONS.filter((region) => next.has(region.id)).map(
    (region) => region.id,
  )
}

export function getCurrentRegion(
  position: Vec3Value,
): OpenWorldRegion | null {
  let closest: OpenWorldRegion | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  for (const region of OPEN_WORLD_REGIONS) {
    const distance = horizontalDistance(position, region.center)
    if (distance < closestDistance) {
      closest = region
      closestDistance = distance
    }
  }
  return closest
}

export function getDestinationGuidance(
  position: Vec3Value,
  headingRadians: number,
  destinationId: OpenWorldRegionId | null,
): DestinationGuidance | null {
  if (destinationId === null) {
    return null
  }
  const destination = getRegionById(destinationId)
  const dx = destination.center.x - position.x
  const dz = destination.center.z - position.z
  const absoluteBearingRadians = Math.atan2(dx, -dz)
  return {
    destination,
    distance: Math.hypot(dx, dz),
    absoluteBearingRadians,
    relativeBearingRadians: wrapRadians(
      absoluteBearingRadians - headingRadians,
    ),
  }
}
