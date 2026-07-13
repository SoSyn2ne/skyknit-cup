import type { Vec3Value } from '../flight/flightModel'
import {
  OPEN_WORLD_REGIONS,
  type OpenWorldRegionId,
} from '../world/openWorldRegions'

export const COINS_PER_COURSE = 10
export const COIN_PICKUP_RADIUS = 3.2

export interface SkyCoinDefinition {
  readonly id: string
  readonly index: number
  readonly position: Vec3Value
  readonly radius: number
}

export interface CoinCourseDefinition {
  readonly regionId: OpenWorldRegionId
  readonly center: Vec3Value
  readonly coins: readonly SkyCoinDefinition[]
}

type LocalPosition = readonly [x: number, y: number, z: number]

const LOCAL_COURSES: Readonly<
  Record<OpenWorldRegionId, readonly LocalPosition[]>
> = {
  'festival-hub': [
    [0, 9, 26],
    [16, 11, 18],
    [28, 13, 4],
    [34, 14, -10],
    [22, 16, -28],
    [2, 14, -36],
    [-14, 16, -26],
    [-20, 20, -14],
    [-24, 15, 4],
    [-28, 14, 16],
  ],
  'wind-canyon': [
    [0, 7, 26],
    [-20, 8, 32],
    [-36, 10, 34],
    [-12, 12, 32],
    [12, 14, 30],
    [34, 13, 24],
    [22, 15, 8],
    [12, 16, -18],
    [0, 17, -28],
    [0, 18, -44],
  ],
  'cloud-ruins': [
    [0, 8, 26],
    [16, 10, 18],
    [26, 12, 4],
    [18, 14, -12],
    [6, 12, -22],
    [0, 13, -30],
    [0, 14, -42],
    [-16, 17, -24],
    [-28, 18, 0],
    [-18, 20, 24],
  ],
}

export const COIN_COURSES: readonly CoinCourseDefinition[] =
  OPEN_WORLD_REGIONS.map((region) => ({
    regionId: region.id,
    center: { ...region.center },
    coins: LOCAL_COURSES[region.id].map(([x, y, z], index) => ({
      id: `${region.id}-coin-${index + 1}`,
      index,
      position: {
        x: region.center.x + x,
        y: region.center.y + y,
        z: region.center.z + z,
      },
      radius: COIN_PICKUP_RADIUS,
    })),
  }))

const COURSE_BY_REGION = new Map(
  COIN_COURSES.map((course) => [course.regionId, course]),
)

export function getCoinCourse(
  regionId: OpenWorldRegionId,
): CoinCourseDefinition {
  return COURSE_BY_REGION.get(regionId) ?? COIN_COURSES[0]
}
