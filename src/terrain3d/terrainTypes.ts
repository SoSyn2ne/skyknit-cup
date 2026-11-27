export type TerrainPresetId =
  | 'sky-highlands'
  | 'wind-canyon'
  | 'volcanic-caldera'

export type TerrainViewMode = 'lit' | 'lod' | 'slope' | 'normals'

export type TerrainBrushMode =
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'flatten'
  | 'paint'
  | 'autoshader'
  | 'hole'

export type TerrainMaterialSlot = 0 | 1 | 2 | 3 | 4

export interface TerrainConfig {
  /** World width and depth covered by the heightmap (square). */
  readonly worldSize: number
  /** Heightmap texel resolution along each axis (power of two). */
  readonly resolution: number
  /** World spacing of LOD 0 clipmap cells. */
  readonly baseSpacing: number
  /** Half-width in cells of each clipmap level (must be a multiple of 4). */
  readonly gridHalfExtent: number
  /** Number of nested clipmap LOD levels. */
  readonly lodCount: number
  /** Normalized Chebyshev distance in [0.55, 0.92] where geomorphing begins. */
  readonly morphStart: number
}

export interface ClipmapLevelState {
  readonly lod: number
  readonly spacing: number
  readonly originX: number
  readonly originZ: number
  readonly trimOffsetX: 0 | 1
  readonly trimOffsetZ: 0 | 1
}

export interface ClipmapGeometryStats {
  readonly lodCount: number
  readonly gridHalfExtent: number
  readonly vertexCount: number
  readonly triangleCount: number
  readonly ringQuadCount: number
  readonly trimQuadCount: number
  readonly drawCalls: 1
}

export interface ControlPixel {
  readonly baseId: TerrainMaterialSlot
  readonly overlayId: TerrainMaterialSlot
  /** Manual blend weight between base and overlay in [0, 255]. */
  readonly blend: number
  /** True when Terrain3D Autoshader controls surface texturing. */
  readonly autoShader: boolean
  /** True when the texel punches a transparent hole through the mesh. */
  readonly hole: boolean
  /** Macro detail/wetness tint value in [0, 255]. */
  readonly macroTint: number
}

export interface HeightmapDirtyRect {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export interface TerrainRegionData {
  readonly preset: TerrainPresetId
  readonly worldSize: number
  readonly resolution: number
  readonly heights: Float32Array
  /** RGBA8 bit-packed control map (4 bytes per texel). */
  readonly control: Uint8Array
}

export interface TerrainBrushConfig {
  readonly mode: TerrainBrushMode
  /** Brush radius in world units. */
  readonly radius: number
  /** Brush strength scalar (e.g. units/sec for sculpt, 0..1 for paint). */
  readonly strength: number
  /** Material slot applied when mode === 'paint'. */
  readonly paintSlot: TerrainMaterialSlot
  /** Target height used when mode === 'flatten'. */
  readonly flattenHeight?: number
  /** When mode === 'hole', true restores solid ground instead of punching. */
  readonly eraseHole?: boolean
}

export interface TerrainShaderParams {
  readonly heightScale: number
  /** Slope threshold (0..1, where 0=flat, 1=vertical) where cliff rock begins. */
  readonly autoSlope: number
  /** Transition width for slope blending. */
  readonly autoSlopeRange: number
  /** World height where alpine/peak biome begins. */
  readonly autoHeight: number
  /** Transition height band for elevation biomes. */
  readonly autoHeightRange: number
  /** World height where shore/basin biome sits. */
  readonly basinHeight: number
  readonly viewMode: TerrainViewMode
  readonly wireframe: boolean
}

export interface TerrainVec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface TerrainRaycastHit {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly distance: number
}

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = Object.freeze({
  worldSize: 768,
  resolution: 256,
  baseSpacing: 1,
  gridHalfExtent: 32,
  lodCount: 5,
  morphStart: 0.72,
})

export const DEFAULT_SHADER_PARAMS: TerrainShaderParams = Object.freeze({
  heightScale: 1,
  autoSlope: 0.24,
  autoSlopeRange: 0.16,
  autoHeight: 58,
  autoHeightRange: 20,
  basinHeight: 11,
  viewMode: 'lit',
  wireframe: false,
})
