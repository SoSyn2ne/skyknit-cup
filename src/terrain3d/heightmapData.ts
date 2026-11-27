import type {
  ControlPixel,
  HeightmapDirtyRect,
  TerrainBrushConfig,
  TerrainMaterialSlot,
  TerrainPresetId,
  TerrainRaycastHit,
  TerrainRegionData,
  TerrainVec3,
} from './terrainTypes'

const FLAG_AUTOSHADER = 0x01
const FLAG_HOLE = 0x02

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0
  if (Math.abs(span) < 1e-6) {
    return x < edge0 ? 0 : 1
  }
  const t = clamp((x - edge0) / span, 0, 1)
  return t * t * (3 - 2 * t)
}

function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)
  n = (n ^ (n >>> 13)) >>> 0
  n = Math.imul(n, 1274126177) >>> 0
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)

  const a = hash2D(ix, iz, seed)
  const b = hash2D(ix + 1, iz, seed)
  const c = hash2D(ix, iz + 1, seed)
  const d = hash2D(ix + 1, iz + 1, seed)

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function fbm(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity = 2.02,
  gain = 0.5,
): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0

  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * freq, z * freq, seed + i * 31) * amp
    norm += amp
    freq *= lacunarity
    amp *= gain
  }

  return sum / Math.max(1e-6, norm)
}

function ridgedFbm(
  x: number,
  z: number,
  seed: number,
  octaves: number,
): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let weight = 1
  let norm = 0

  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise2D(x * freq, z * freq, seed + i * 47)
    let signal = 1 - Math.abs(n * 2 - 1)
    signal = signal * signal * weight
    weight = clamp(signal * 1.85, 0.25, 1)
    sum += signal * amp
    norm += amp
    freq *= 2.07
    amp *= 0.48
  }

  return sum / Math.max(1e-6, norm)
}

function softTerrace(height: number, stepSize: number, sharpness: number): number {
  const scaled = height / stepSize
  const base = Math.floor(scaled)
  const frac = scaled - base
  const curved = smoothstep(0.5 - sharpness, 0.5 + sharpness, frac)
  return (base + curved) * stepSize
}

function evaluateSkyHighlands(wx: number, wz: number, halfWorld: number): number {
  const nx = wx / halfWorld
  const nz = wz / halfWorld
  const radial = Math.hypot(nx, nz)

  // Domain warp for realistic alpine ridge flow
  const warpX = (fbm(wx * 0.0024 + 13.4, wz * 0.0024 - 7.1, 101, 3) - 0.5) * 115
  const warpZ = (fbm(wx * 0.0024 - 5.9, wz * 0.0024 + 19.2, 203, 3) - 0.5) * 115
  const qx = wx + warpX
  const qz = wz + warpZ

  const ridgeMain = ridgedFbm(qx * 0.0031, qz * 0.0031, 307, 5)
  const rollingHills = fbm(qx * 0.0042, qz * 0.0042, 409, 4)
  const microDetail = fbm(wx * 0.018, wz * 0.018, 521, 3)

  // Dramatic twin highland massif north-west & east, separated by a winding river valley
  const valleyCenterX = Math.sin(wz * 0.0075) * 85 - 24
  const valleyDist = Math.abs(wx - valleyCenterX)
  const riverCut = 1 - smoothstep(26, 130, valleyDist)

  const twinPeakA = Math.exp(-((wx + 125) ** 2 + (wz + 85) ** 2) / (2 * 135 ** 2))
  const twinPeakB = Math.exp(-((wx - 140) ** 2 + (wz - 55) ** 2) / (2 * 150 ** 2))
  const lookoutPlateau = Math.exp(-((wx - 25) ** 2 + (wz + 120) ** 2) / (2 * 85 ** 2))

  let elevation =
    10 +
    rollingHills * 34 +
    ridgeMain ** 1.35 * 62 +
    twinPeakA * 46 +
    twinPeakB * 38 +
    lookoutPlateau * 24 +
    (microDetail - 0.5) * 5

  // Gently terrace mid-elevation meadows while preserving sharp summits
  const terraced = softTerrace(elevation, 11, 0.24)
  const terraceBlend = (1 - smoothstep(42, 74, elevation)) * 0.34
  elevation = elevation * (1 - terraceBlend) + terraced * terraceBlend

  // Carve sunlit valley river corridor cleanly below water level for gleaming alpine river
  elevation -= riverCut * (elevation * 0.78 + 12)
  elevation = Math.max(0.5, elevation)

  // Soft island/continent coastal taper toward outer perimeter so no square drop-off appears
  const coastFade = 1 - smoothstep(0.76, 0.99, radial)
  return elevation * coastFade + (1 - coastFade) * 1.2
}

function evaluateWindCanyon(wx: number, wz: number, halfWorld: number): number {
  const nx = wx / halfWorld
  const nz = wz / halfWorld
  const radial = Math.hypot(nx, nz)

  const warp = (fbm(wx * 0.003, wz * 0.003, 701, 3) - 0.5) * 75
  const mesaBase = fbm((wx + warp) * 0.0034, (wz - warp) * 0.0034, 733, 4)
  const crags = ridgedFbm(wx * 0.0052, wz * 0.0052, 769, 4)

  // High sandstone tableland
  let height = 38 + mesaBase * 38 + crags * 18
  height = softTerrace(height, 9.5, 0.14)

  // S-curved primary canyon gorge + branching tributary canyon
  const mainGorgeAxis = Math.sin(wz * 0.0068) * 105 + Math.cos(wz * 0.003) * 35
  const mainDist = Math.abs(wx - mainGorgeAxis)
  const branchAxis = Math.cos(wx * 0.0072) * 75 + 40
  const branchDist = Math.abs(wz - branchAxis)

  const mainCut = 1 - smoothstep(24, 96, mainDist)
  const branchCut = (1 - smoothstep(18, 68, branchDist)) * smoothstep(-30, 80, wx)
  const canyonCut = Math.max(mainCut, branchCut * 0.85)

  // Sculpt stepped canyon walls
  const floorHeight = 4.5 + fbm(wx * 0.015, wz * 0.015, 811, 3) * 5
  height = height * (1 - canyonCut) + floorHeight * canyonCut

  // Standalone spire/mesa butte rising dramatically in the gorge bend
  const butteDist = Math.hypot(wx - 12, wz + 28)
  const butte = (1 - smoothstep(20, 42, butteDist)) * 46
  height = Math.max(height, floorHeight + butte)

  const edgeFade = 1 - smoothstep(0.78, 0.99, radial)
  return height * edgeFade + (1 - edgeFade) * 3.5
}

function evaluateVolcanicCaldera(wx: number, wz: number, halfWorld: number): number {
  const nx = wx / halfWorld
  const nz = wz / halfWorld
  const radial = Math.hypot(nx, nz)
  const dist = Math.hypot(wx, wz)
  const angle = Math.atan2(wz, wx)

  const angularWarp = (fbm(Math.cos(angle) * 1.9 + 4, Math.sin(angle) * 1.9 - 2, 911, 3) - 0.5) * 44
  const warpedDist = dist + angularWarp

  // Stratovolcano cone peaking on the caldera ring around r = 135..175
  const rimProfile = Math.exp(-((warpedDist - 150) ** 2) / (2 * 64 ** 2))
  const outerSlope = Math.exp(-((Math.max(0, warpedDist - 150)) ** 2) / (2 * 185 ** 2))
  const craterBowl = 1 - smoothstep(68, 138, warpedDist)

  // Breached southeast lava spillway cutting through the caldera wall
  const breachAngleDiff = Math.abs(Math.atan2(Math.sin(angle - 0.65), Math.cos(angle - 0.65)))
  const breachMask = (1 - smoothstep(0.14, 0.42, breachAngleDiff)) * smoothstep(55, 130, warpedDist)

  const basaltRidges = ridgedFbm(wx * 0.0055, wz * 0.0055, 953, 5)
  const ashDetail = fbm(wx * 0.016, wz * 0.016, 991, 3)

  let height =
    7 +
    outerSlope * 44 +
    rimProfile * 64 +
    basaltRidges * (14 + rimProfile * 24) +
    (ashDetail - 0.5) * 5

  // Carve inner crater floor and central lava dome
  const innerDome = Math.exp(-(dist ** 2) / (2 * 28 ** 2)) * 20
  const craterFloor = 2.4 + innerDome + ashDetail * 3.0
  height = height * (1 - craterBowl) + craterFloor * craterBowl

  // Carve spillway channel cleanly to expose magma stream
  height -= breachMask * (height * 0.72)
  height = Math.max(1.8, height)

  const edgeFade = 1 - smoothstep(0.8, 0.99, radial)
  return height * edgeFade + (1 - edgeFade) * 2.5
}

export function packControlPixel(
  buffer: Uint8Array,
  byteOffset: number,
  pixel: ControlPixel,
): void {
  const baseId = clamp(Math.round(pixel.baseId), 0, 15)
  const overlayId = clamp(Math.round(pixel.overlayId), 0, 15)
  const blend = clamp(Math.round(pixel.blend), 0, 255)
  const flags =
    (pixel.autoShader ? FLAG_AUTOSHADER : 0) | (pixel.hole ? FLAG_HOLE : 0)
  const macroTint = clamp(Math.round(pixel.macroTint), 0, 255)

  buffer[byteOffset] = (baseId << 4) | overlayId
  buffer[byteOffset + 1] = blend
  buffer[byteOffset + 2] = flags
  buffer[byteOffset + 3] = macroTint
}

export function unpackControlPixel(
  buffer: Uint8Array,
  byteOffset: number,
): ControlPixel {
  const packedIds = buffer[byteOffset] ?? 0
  const blend = buffer[byteOffset + 1] ?? 0
  const flags = buffer[byteOffset + 2] ?? FLAG_AUTOSHADER
  const macroTint = buffer[byteOffset + 3] ?? 128

  return {
    baseId: ((packedIds >>> 4) & 0x0f) as TerrainMaterialSlot,
    overlayId: (packedIds & 0x0f) as TerrainMaterialSlot,
    blend,
    autoShader: (flags & FLAG_AUTOSHADER) !== 0,
    hole: (flags & FLAG_HOLE) !== 0,
    macroTint,
  }
}

export function createTerrainRegionData(
  preset: TerrainPresetId,
  resolution: number,
  worldSize: number,
): TerrainRegionData {
  const heights = new Float32Array(resolution * resolution)
  const control = new Uint8Array(resolution * resolution * 4)
  const halfWorld = worldSize * 0.5
  const step = worldSize / (resolution - 1)

  for (let iz = 0; iz < resolution; iz += 1) {
    const wz = -halfWorld + iz * step
    for (let ix = 0; ix < resolution; ix += 1) {
      const wx = -halfWorld + ix * step
      let h: number
      if (preset === 'wind-canyon') {
        h = evaluateWindCanyon(wx, wz, halfWorld)
      } else if (preset === 'volcanic-caldera') {
        h = evaluateVolcanicCaldera(wx, wz, halfWorld)
      } else {
        h = evaluateSkyHighlands(wx, wz, halfWorld)
      }

      const idx = iz * resolution + ix
      heights[idx] = h

      const macro = fbm(wx * 0.009 + 41, wz * 0.009 - 17, 1301, 3)
      packControlPixel(control, idx * 4, {
        baseId: 1,
        overlayId: 3,
        blend: 0,
        autoShader: true,
        hole: false,
        macroTint: Math.round(92 + macro * 82),
      })
    }
  }

  return {
    preset,
    worldSize,
    resolution,
    heights,
    control,
  }
}

export function sampleHeightBilinear(
  region: TerrainRegionData,
  worldX: number,
  worldZ: number,
  heightScale = 1,
): number {
  const res = region.resolution
  const tx = clamp((worldX / region.worldSize + 0.5) * (res - 1), 0, res - 1)
  const tz = clamp((worldZ / region.worldSize + 0.5) * (res - 1), 0, res - 1)

  const ix0 = Math.floor(tx)
  const iz0 = Math.floor(tz)
  const ix1 = Math.min(ix0 + 1, res - 1)
  const iz1 = Math.min(iz0 + 1, res - 1)
  const fx = tx - ix0
  const fz = tz - iz0

  const h00 = region.heights[iz0 * res + ix0]
  const h10 = region.heights[iz0 * res + ix1]
  const h01 = region.heights[iz1 * res + ix0]
  const h11 = region.heights[iz1 * res + ix1]

  const top = h00 + (h10 - h00) * fx
  const bottom = h01 + (h11 - h01) * fx
  return (top + (bottom - top) * fz) * heightScale
}

export function sampleNormal(
  region: TerrainRegionData,
  worldX: number,
  worldZ: number,
  heightScale = 1,
): TerrainVec3 {
  const eps = region.worldSize / (region.resolution - 1)
  const hL = sampleHeightBilinear(region, worldX - eps, worldZ, heightScale)
  const hR = sampleHeightBilinear(region, worldX + eps, worldZ, heightScale)
  const hD = sampleHeightBilinear(region, worldX, worldZ - eps, heightScale)
  const hU = sampleHeightBilinear(region, worldX, worldZ + eps, heightScale)

  const nx = hL - hR
  const ny = 2 * eps
  const nz = hD - hU
  const invLen = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz))

  return {
    x: nx * invLen,
    y: ny * invLen,
    z: nz * invLen,
  }
}

export function applyBrushStroke(
  region: TerrainRegionData,
  brush: TerrainBrushConfig,
  worldX: number,
  worldZ: number,
  dtSeconds: number,
): HeightmapDirtyRect | null {
  const res = region.resolution
  const halfWorld = region.worldSize * 0.5
  const step = region.worldSize / (res - 1)
  const radius = Math.max(step, brush.radius)

  const minX = Math.max(0, Math.floor((worldX - radius + halfWorld) / step))
  const maxX = Math.min(res - 1, Math.ceil((worldX + radius + halfWorld) / step))
  const minZ = Math.max(0, Math.floor((worldZ - radius + halfWorld) / step))
  const maxZ = Math.min(res - 1, Math.ceil((worldZ + radius + halfWorld) / step))

  if (minX > maxX || minZ > maxZ) {
    return null
  }

  const targetFlattenHeight =
    brush.flattenHeight ?? sampleHeightBilinear(region, worldX, worldZ)

  // Snapshot heights inside dirty rect for stable smoothing
  const smoothSnapshot =
    brush.mode === 'smooth' ? new Float32Array(region.heights) : null

  let touched = false

  for (let iz = minZ; iz <= maxZ; iz += 1) {
    const pz = -halfWorld + iz * step
    for (let ix = minX; ix <= maxX; ix += 1) {
      const px = -halfWorld + ix * step
      const dist = Math.hypot(px - worldX, pz - worldZ)
      if (dist > radius) {
        continue
      }

      const falloff = smoothstep(radius, 0, dist)
      if (falloff <= 0) {
        continue
      }

      touched = true
      const idx = iz * res + ix

      if (brush.mode === 'raise') {
        region.heights[idx] = clamp(
          region.heights[idx] + brush.strength * falloff * dtSeconds,
          -20,
          180,
        )
      } else if (brush.mode === 'lower') {
        region.heights[idx] = clamp(
          region.heights[idx] - brush.strength * falloff * dtSeconds,
          -20,
          180,
        )
      } else if (brush.mode === 'flatten') {
        const rate = clamp(brush.strength * falloff * dtSeconds, 0, 1)
        region.heights[idx] += (targetFlattenHeight - region.heights[idx]) * rate
      } else if (brush.mode === 'smooth' && smoothSnapshot !== null) {
        let sum = 0
        let count = 0
        for (let oz = -1; oz <= 1; oz += 1) {
          const nz = clamp(iz + oz, 0, res - 1)
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = clamp(ix + ox, 0, res - 1)
            sum += smoothSnapshot[nz * res + nx]
            count += 1
          }
        }
        const avg = sum / count
        const blend = clamp(brush.strength * falloff * dtSeconds, 0, 1)
        region.heights[idx] += (avg - region.heights[idx]) * blend
      } else if (brush.mode === 'paint') {
        const current = unpackControlPixel(region.control, idx * 4)
        const nextBlend = clamp(
          current.autoShader
            ? Math.round(falloff * 255 * clamp(brush.strength, 0.25, 1))
            : Math.round(
                current.blend +
                  (255 - current.blend) * falloff * clamp(brush.strength, 0.2, 1),
              ),
          0,
          255,
        )
        packControlPixel(region.control, idx * 4, {
          baseId: current.autoShader ? 1 : current.baseId,
          overlayId: brush.paintSlot,
          blend: nextBlend,
          autoShader: false,
          hole: current.hole,
          macroTint: current.macroTint,
        })
      } else if (brush.mode === 'autoshader') {
        const current = unpackControlPixel(region.control, idx * 4)
        if (falloff > 0.15) {
          packControlPixel(region.control, idx * 4, {
            ...current,
            blend: 0,
            autoShader: true,
          })
        }
      } else if (brush.mode === 'hole') {
        const current = unpackControlPixel(region.control, idx * 4)
        if (falloff > 0.2) {
          packControlPixel(region.control, idx * 4, {
            ...current,
            hole: !brush.eraseHole,
          })
        }
      }
    }
  }

  return touched ? { minX, maxX, minZ, maxZ } : null
}

export function raycastHeightmap(
  region: TerrainRegionData,
  origin: TerrainVec3,
  direction: TerrainVec3,
  heightScale = 1,
  maxDistance = 1200,
): TerrainRaycastHit | null {
  const dirLen = Math.hypot(direction.x, direction.y, direction.z)
  if (dirLen < 1e-6) {
    return null
  }
  const dx = direction.x / dirLen
  const dy = direction.y / dirLen
  const dz = direction.z / dirLen

  const halfWorld = region.worldSize * 0.5
  let prevT = 0
  let prevDiff =
    origin.y - sampleHeightBilinear(region, origin.x, origin.z, heightScale)

  const stepSize = 2.5
  for (let t = stepSize; t <= maxDistance; t += stepSize) {
    const px = origin.x + dx * t
    const py = origin.y + dy * t
    const pz = origin.z + dz * t

    if (py > 260 && dy >= 0) {
      return null
    }

    const h = sampleHeightBilinear(region, px, pz, heightScale)
    const diff = py - h

    if (diff <= 0 && prevDiff >= 0) {
      // Binary search refine exact surface hit
      let lo = prevT
      let hi = t
      for (let iter = 0; iter < 8; iter += 1) {
        const mid = (lo + hi) * 0.5
        const mx = origin.x + dx * mid
        const my = origin.y + dy * mid
        const mz = origin.z + dz * mid
        const mh = sampleHeightBilinear(region, mx, mz, heightScale)
        if (my - mh <= 0) {
          hi = mid
        } else {
          lo = mid
        }
      }

      const hitT = (lo + hi) * 0.5
      const hx = origin.x + dx * hitT
      const hz = origin.z + dz * hitT
      if (Math.abs(hx) > halfWorld || Math.abs(hz) > halfWorld) {
        return null
      }
      const hy = sampleHeightBilinear(region, hx, hz, heightScale)
      return { x: hx, y: hy, z: hz, distance: hitT }
    }

    prevT = t
    prevDiff = diff
  }

  return null
}
