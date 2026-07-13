import type { SphereObstacle } from '../collision/obstacleCollision'
import type { Vec3Like } from '../race/checkpoint'

export interface WorldIsland {
  readonly id: string
  readonly center: Vec3Like
  readonly radius: number
  readonly height: number
  readonly collisionRadius?: number
}

export const WORLD_ISLANDS: readonly WorldIsland[] = [
  { id: 'ember-shelf', center: { x: -55, y: -8, z: -105 }, radius: 24, height: 42, collisionRadius: 16 },
  { id: 'sunward-perch', center: { x: 62, y: -6, z: -170 }, radius: 23, height: 38, collisionRadius: 16 },
  { id: 'festival-spire', center: { x: 50, y: 4, z: -330 }, radius: 21, height: 46, collisionRadius: 15 },
  { id: 'mist-hook', center: { x: 120, y: 5, z: -520 }, radius: 25, height: 50, collisionRadius: 17 },
  { id: 'golden-step', center: { x: 350, y: 8, z: -700 }, radius: 27, height: 54, collisionRadius: 18 },
  { id: 'rune-basin', center: { x: 560, y: -5, z: -680 }, radius: 28, height: 56, collisionRadius: 18 },
  { id: 'cloud-anvil', center: { x: 790, y: -5, z: -520 }, radius: 30, height: 60, collisionRadius: 18 },
  { id: 'high-knot', center: { x: 875, y: 15, z: -300 }, radius: 28, height: 52, collisionRadius: 18 },
  { id: 'eastward-drift', center: { x: 790, y: 0, z: -60 }, radius: 31, height: 64, collisionRadius: 20 },
  { id: 'haze-garden', center: { x: 640, y: -5, z: 110 }, radius: 27, height: 50, collisionRadius: 18 },
  { id: 'return-shrine', center: { x: 380, y: 0, z: 210 }, radius: 25, height: 48, collisionRadius: 17 },
  { id: 'west-crook', center: { x: 140, y: 8, z: 140 }, radius: 24, height: 44, collisionRadius: 16 },
  { id: 'far-needle-a', center: { x: -150, y: -20, z: -260 }, radius: 34, height: 76 },
  { id: 'far-needle-b', center: { x: 270, y: -30, z: -330 }, radius: 38, height: 82 },
  { id: 'far-needle-c', center: { x: 710, y: -25, z: -820 }, radius: 42, height: 88 },
  { id: 'far-needle-d', center: { x: 970, y: -20, z: -80 }, radius: 36, height: 74 },
  { id: 'far-needle-e', center: { x: 470, y: -28, z: 330 }, radius: 40, height: 84 },
  { id: 'far-needle-f', center: { x: -210, y: -24, z: 60 }, radius: 35, height: 72 },
]

export const WORLD_OBSTACLES: readonly SphereObstacle[] = WORLD_ISLANDS.flatMap(
  (island) =>
    island.collisionRadius === undefined
      ? []
      : [
          {
            id: island.id,
            center: island.center,
            radius: island.collisionRadius,
          },
        ],
)
