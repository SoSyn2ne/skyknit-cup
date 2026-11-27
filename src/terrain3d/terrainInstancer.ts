import {
  sampleHeightBilinear,
  sampleNormal,
  unpackControlPixel,
} from './heightmapData'
import type { TerrainPresetId, TerrainRegionData } from './terrainTypes'

export type TerrainPropAssetId =
  | 'pine-1'
  | 'pine-3'
  | 'pine-snow'
  | 'common-tree'
  | 'birch-autumn'
  | 'dead-tree'
  | 'cactus'
  | 'bush'
  | 'rock-moss'
  | 'rock-plain'
  | 'polyhaven-rock'
  | 'polyhaven-volcanic-rock'

export type TerrainLandmarkAssetId =
  | 'windmill'
  | 'temple'
  | 'watchtower'
  | 'house'

export interface TerrainScatterRule {
  readonly assetId: TerrainPropAssetId
  readonly targetCount: number
  readonly minHeight: number
  readonly maxHeight: number
  readonly maxSlope: number
  readonly minScale: number
  readonly maxScale: number
  readonly alignToNormal: number
  readonly sinkDepth: number
  readonly seed: number
}

export interface TerrainLandmarkSpec {
  readonly id: string
  readonly assetId: TerrainLandmarkAssetId
  readonly x: number
  readonly z: number
  readonly scale: number
  readonly rotationY: number
  readonly clearRadius: number
  readonly sinkDepth: number
}

export interface TerrainScatterPlacement {
  readonly assetId: TerrainPropAssetId
  readonly x: number
  readonly y: number
  readonly z: number
  readonly scale: number
  readonly rotationY: number
  readonly tiltX: number
  readonly tiltZ: number
  readonly sinkDepth: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function isTerrainHoleAt(
  region: TerrainRegionData,
  worldX: number,
  worldZ: number,
): boolean {
  const res = region.resolution
  const tx = Math.max(
    0,
    Math.min(res - 1, Math.round((worldX / region.worldSize + 0.5) * (res - 1))),
  )
  const tz = Math.max(
    0,
    Math.min(res - 1, Math.round((worldZ / region.worldSize + 0.5) * (res - 1))),
  )
  return unpackControlPixel(region.control, (tz * res + tx) * 4).hole
}

export function getPresetLandmarks(
  preset: TerrainPresetId,
): readonly TerrainLandmarkSpec[] {
  if (preset === 'wind-canyon') {
    return [
      {
        id: 'canyon-mesa-temple',
        assetId: 'temple',
        x: 12,
        z: -28,
        scale: 25,
        rotationY: 0.45,
        clearRadius: 24,
        sinkDepth: 2.2,
      },
      {
        id: 'canyon-rim-tower',
        assetId: 'watchtower',
        x: 138,
        z: 18,
        scale: 20,
        rotationY: -0.75,
        clearRadius: 18,
        sinkDepth: 2.2,
      },
      {
        id: 'canyon-west-windmill',
        assetId: 'windmill',
        x: -112,
        z: -28,
        scale: 21,
        rotationY: 0.9,
        clearRadius: 22,
        sinkDepth: 2.0,
      },
    ]
  }

  if (preset === 'volcanic-caldera') {
    return [
      {
        id: 'caldera-heart-temple',
        assetId: 'temple',
        x: 0,
        z: 0,
        scale: 26,
        rotationY: 0.72,
        clearRadius: 24,
        sinkDepth: 2.2,
      },
      {
        id: 'caldera-south-tower',
        assetId: 'watchtower',
        x: -72,
        z: 126,
        scale: 20,
        rotationY: 0.4,
        clearRadius: 18,
        sinkDepth: 2.4,
      },
      {
        id: 'caldera-east-tower',
        assetId: 'watchtower',
        x: 145,
        z: 0,
        scale: 20,
        rotationY: -1.2,
        clearRadius: 18,
        sinkDepth: 2.4,
      },
    ]
  }

  // sky-highlands: riverside alpine hamlet + hill windmill + northern sanctuary
  return [
    {
      id: 'highlands-windmill',
      assetId: 'windmill',
      x: -102,
      z: 142,
      scale: 23,
      rotationY: 0.65,
      clearRadius: 22,
      sinkDepth: 2.0,
    },
    {
      id: 'highlands-cottage-a',
      assetId: 'house',
      x: -132,
      z: 174,
      scale: 16,
      rotationY: 1.15,
      clearRadius: 16,
      sinkDepth: 1.8,
    },
    {
      id: 'highlands-cottage-b',
      assetId: 'house',
      x: -88,
      z: 158,
      scale: 15,
      rotationY: 0.25,
      clearRadius: 15,
      sinkDepth: 1.8,
    },
    {
      id: 'highlands-valley-temple',
      assetId: 'temple',
      x: -88,
      z: -112,
      scale: 22,
      rotationY: 0.3,
      clearRadius: 22,
      sinkDepth: 2.0,
    },
    {
      id: 'highlands-cliff-tower',
      assetId: 'watchtower',
      x: -108,
      z: -86,
      scale: 19,
      rotationY: 0.85,
      clearRadius: 16,
      sinkDepth: 2.0,
    },
  ]
}

export function getPresetScatterRules(
  preset: TerrainPresetId,
): readonly TerrainScatterRule[] {
  if (preset === 'wind-canyon') {
    return [
      {
        assetId: 'cactus',
        targetCount: 55,
        minHeight: 8.5,
        maxHeight: 68,
        maxSlope: 0.24,
        minScale: 6.5,
        maxScale: 10.5,
        alignToNormal: 0.12,
        sinkDepth: 0.5,
        seed: 4101,
      },
      {
        assetId: 'dead-tree',
        targetCount: 30,
        minHeight: 14,
        maxHeight: 74,
        maxSlope: 0.24,
        minScale: 11,
        maxScale: 16.5,
        alignToNormal: 0.12,
        sinkDepth: 0.7,
        seed: 4202,
      },
      {
        assetId: 'rock-plain',
        targetCount: 75,
        minHeight: 7.5,
        maxHeight: 78,
        maxSlope: 0.38,
        minScale: 4.5,
        maxScale: 11.5,
        alignToNormal: 0.55,
        sinkDepth: 1.2,
        seed: 4303,
      },
      {
        assetId: 'polyhaven-rock',
        targetCount: 10,
        minHeight: 8.5,
        maxHeight: 68,
        maxSlope: 0.34,
        minScale: 7.5,
        maxScale: 12.5,
        alignToNormal: 0.5,
        sinkDepth: 1.4,
        seed: 4404,
      },
    ]
  }

  if (preset === 'volcanic-caldera') {
    return [
      {
        assetId: 'dead-tree',
        targetCount: 36,
        minHeight: 16,
        maxHeight: 88,
        maxSlope: 0.25,
        minScale: 10,
        maxScale: 16.5,
        alignToNormal: 0.14,
        sinkDepth: 0.8,
        seed: 7101,
      },
      {
        assetId: 'polyhaven-volcanic-rock',
        targetCount: 12,
        minHeight: 14,
        maxHeight: 145,
        maxSlope: 0.38,
        minScale: 7.5,
        maxScale: 13.0,
        alignToNormal: 0.55,
        sinkDepth: 1.5,
        seed: 7202,
      },
      {
        assetId: 'rock-plain',
        targetCount: 75,
        minHeight: 13,
        maxHeight: 142,
        maxSlope: 0.4,
        minScale: 4.2,
        maxScale: 9.8,
        alignToNormal: 0.6,
        sinkDepth: 1.1,
        seed: 7303,
      },
    ]
  }

  // sky-highlands: lush multi-tier alpine ecosystem tuned for 60fps web budgets
  return [
    {
      assetId: 'pine-1',
      targetCount: 52,
      minHeight: 12,
      maxHeight: 58,
      maxSlope: 0.25,
      minScale: 13,
      maxScale: 21,
      alignToNormal: 0.1,
      sinkDepth: 1.0,
      seed: 1101,
    },
    {
      assetId: 'pine-3',
      targetCount: 38,
      minHeight: 13,
      maxHeight: 56,
      maxSlope: 0.25,
      minScale: 12,
      maxScale: 19,
      alignToNormal: 0.1,
      sinkDepth: 1.0,
      seed: 1202,
    },
    {
      assetId: 'pine-snow',
      targetCount: 36,
      minHeight: 50,
      maxHeight: 88,
      maxSlope: 0.26,
      minScale: 11,
      maxScale: 18,
      alignToNormal: 0.12,
      sinkDepth: 1.0,
      seed: 1303,
    },
    {
      assetId: 'common-tree',
      targetCount: 30,
      minHeight: 11.5,
      maxHeight: 44,
      maxSlope: 0.22,
      minScale: 11.5,
      maxScale: 17.5,
      alignToNormal: 0.08,
      sinkDepth: 0.9,
      seed: 1404,
    },
    {
      assetId: 'birch-autumn',
      targetCount: 24,
      minHeight: 12.5,
      maxHeight: 46,
      maxSlope: 0.22,
      minScale: 11,
      maxScale: 16.5,
      alignToNormal: 0.08,
      sinkDepth: 0.9,
      seed: 1505,
    },
    {
      assetId: 'bush',
      targetCount: 55,
      minHeight: 10.5,
      maxHeight: 46,
      maxSlope: 0.26,
      minScale: 4.2,
      maxScale: 7.2,
      alignToNormal: 0.3,
      sinkDepth: 0.5,
      seed: 1606,
    },
    {
      assetId: 'rock-moss',
      targetCount: 55,
      minHeight: 9.5,
      maxHeight: 74,
      maxSlope: 0.38,
      minScale: 4.0,
      maxScale: 9.2,
      alignToNormal: 0.55,
      sinkDepth: 1.1,
      seed: 1707,
    },
    {
      assetId: 'polyhaven-rock',
      targetCount: 8,
      minHeight: 10.5,
      maxHeight: 74,
      maxSlope: 0.34,
      minScale: 7.0,
      maxScale: 11.5,
      alignToNormal: 0.5,
      sinkDepth: 1.4,
      seed: 1808,
    },
  ]
}

export function generateTerrainScatter(
  region: TerrainRegionData,
  rules: readonly TerrainScatterRule[],
  landmarks: readonly TerrainLandmarkSpec[],
  heightScale = 1,
): TerrainScatterPlacement[] {
  const placements: TerrainScatterPlacement[] = []
  const span = region.worldSize * 0.42

  for (const rule of rules) {
    const rand = mulberry32(rule.seed)
    const maxAttempts = rule.targetCount * 18
    let placed = 0

    for (
      let attempt = 0;
      attempt < maxAttempts && placed < rule.targetCount;
      attempt += 1
    ) {
      const x = (rand() * 2 - 1) * span
      const z = (rand() * 2 - 1) * span

      if (isTerrainHoleAt(region, x, z)) {
        continue
      }

      const y = sampleHeightBilinear(region, x, z, heightScale)
      if (y < rule.minHeight * heightScale || y > rule.maxHeight * heightScale) {
        continue
      }

      const normal = sampleNormal(region, x, z, heightScale)
      const slope = 1 - normal.y
      if (slope > rule.maxSlope) {
        continue
      }

      let blockedByLandmark = false
      for (const lm of landmarks) {
        if (Math.hypot(x - lm.x, z - lm.z) < lm.clearRadius) {
          blockedByLandmark = true
          break
        }
      }
      if (blockedByLandmark) {
        continue
      }

      const scale = rule.minScale + rand() * (rule.maxScale - rule.minScale)
      const rotationY = rand() * Math.PI * 2
      const tiltX = normal.z * rule.alignToNormal
      const tiltZ = -normal.x * rule.alignToNormal

      placements.push({
        assetId: rule.assetId,
        x,
        y: y - rule.sinkDepth,
        z,
        scale,
        rotationY,
        tiltX,
        tiltZ,
        sinkDepth: rule.sinkDepth,
      })
      placed += 1
    }
  }

  return placements
}

export function resnapScatterPlacements(
  region: TerrainRegionData,
  placements: readonly TerrainScatterPlacement[],
  heightScale = 1,
): TerrainScatterPlacement[] {
  const updated: TerrainScatterPlacement[] = []
  for (const item of placements) {
    if (isTerrainHoleAt(region, item.x, item.z)) {
      continue
    }
    const y = sampleHeightBilinear(region, item.x, item.z, heightScale)
    updated.push({
      ...item,
      y: y - item.sinkDepth,
    })
  }
  return updated
}
