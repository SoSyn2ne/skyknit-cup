import * as THREE from 'three'

import {
  buildClipmapGeometryData,
  computeClipmapLevelStates,
} from './clipmapGeometry'
import {
  applyBrushStroke,
  createTerrainRegionData,
  raycastHeightmap,
  sampleHeightBilinear,
} from './heightmapData'
import {
  buildTerrainFragmentShader,
  buildTerrainVertexShader,
  TERRAIN_PRESET_INDEX,
  TERRAIN_VIEW_MODE_INDEX,
} from './terrainShader'
import {
  DEFAULT_SHADER_PARAMS,
  DEFAULT_TERRAIN_CONFIG,
  type ClipmapGeometryStats,
  type TerrainBrushConfig,
  type TerrainBrushMode,
  type TerrainConfig,
  type TerrainPresetId,
  type TerrainRaycastHit,
  type TerrainRegionData,
  type TerrainShaderParams,
  type TerrainVec3,
} from './terrainTypes'

interface PresetAtmosphere {
  readonly skyZenith: number
  readonly skyHaze: number
  readonly fogColor: number
  readonly sunColor: number
  readonly sunDirection: readonly [number, number, number]
  readonly waterColor: number
  readonly waterDeepColor: number
  readonly waterLevel: number
  readonly isMagma: boolean
  readonly autoHeight: number
  readonly basinHeight: number
}

const PRESET_ATMOSPHERES: Record<TerrainPresetId, PresetAtmosphere> = {
  'sky-highlands': {
    skyZenith: 0x2a768a,
    skyHaze: 0xcbe9e3,
    fogColor: 0xc0e1dc,
    sunColor: 0xffe4b8,
    sunDirection: [-0.52, 0.44, -0.73],
    waterColor: 0x3ea4ac,
    waterDeepColor: 0x165568,
    waterLevel: 8.4,
    isMagma: false,
    autoHeight: 62,
    basinHeight: 11,
  },
  'wind-canyon': {
    skyZenith: 0x357298,
    skyHaze: 0xf1d4b0,
    fogColor: 0xe6c7a4,
    sunColor: 0xffd59c,
    sunDirection: [0.62, 0.42, -0.66],
    waterColor: 0x43968e,
    waterDeepColor: 0x1e5658,
    waterLevel: 6.4,
    isMagma: false,
    autoHeight: 56,
    basinHeight: 10,
  },
  'volcanic-caldera': {
    skyZenith: 0x20273d,
    skyHaze: 0xa45b42,
    fogColor: 0x6c403a,
    sunColor: 0xffb376,
    sunDirection: [-0.46, 0.40, -0.79],
    waterColor: 0xff5a18,
    waterDeepColor: 0x721808,
    waterLevel: 9.2,
    isMagma: true,
    autoHeight: 64,
    basinHeight: 12,
  },
}

const BRUSH_MODE_COLORS: Record<TerrainBrushMode, number> = {
  raise: 0xf2c14e,
  lower: 0xf08c4b,
  smooth: 0x6dd6c2,
  flatten: 0x8db8ff,
  paint: 0x5ae2ff,
  autoshader: 0x8ef07a,
  hole: 0xff5a52,
}

export interface TerrainAtmosphereLighting {
  readonly sunDirection: readonly [number, number, number]
  readonly sunColor: number
  readonly skyColor: number
  readonly fogColor: number
}

export interface Terrain3DSnapshot {
  readonly preset: TerrainPresetId
  readonly params: TerrainShaderParams
  readonly clipmapStats: ClipmapGeometryStats
  readonly level0Origin: readonly [number, number]
  readonly levelLastOrigin: readonly [number, number]
  readonly sculptCount: number
  readonly usePbrTextures: boolean
  readonly pbrTexturesLoaded: boolean
}

export interface Terrain3DController {
  readonly group: THREE.Group
  readonly terrainMesh: THREE.Mesh
  readonly config: TerrainConfig
  update(cameraPosition: THREE.Vector3, elapsedSeconds: number): void
  setPreset(preset: TerrainPresetId): void
  resetTerrain(): void
  setShaderParams(partial: Partial<TerrainShaderParams>): void
  setUsePbrTextures(enabled: boolean): void
  setBrushCursor(
    worldX: number,
    worldZ: number,
    radius: number,
    active: boolean,
    mode: TerrainBrushMode,
  ): void
  raycast(origin: TerrainVec3, direction: TerrainVec3): TerrainRaycastHit | null
  applyBrush(
    brush: TerrainBrushConfig,
    worldX: number,
    worldZ: number,
    dtSeconds: number,
  ): boolean
  sampleHeight(worldX: number, worldZ: number): number
  getRegionData(): TerrainRegionData
  getAtmosphereLighting(): TerrainAtmosphereLighting
  getShaderParams(): TerrainShaderParams
  getSnapshot(): Terrain3DSnapshot
  dispose(): void
}

function createSkyDome(atmosphere: PresetAtmosphere): {
  mesh: THREE.Mesh
  uniforms: {
    uZenith: { value: THREE.Color }
    uHaze: { value: THREE.Color }
    uSunColor: { value: THREE.Color }
    uSunDir: { value: THREE.Vector3 }
    uTime: { value: number }
  }
} {
  const uniforms = {
    uZenith: { value: new THREE.Color(atmosphere.skyZenith) },
    uHaze: { value: new THREE.Color(atmosphere.skyHaze) },
    uSunColor: { value: new THREE.Color(atmosphere.sunColor) },
    uSunDir: {
      value: new THREE.Vector3(...atmosphere.sunDirection).normalize(),
    },
    uTime: { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHaze;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.5);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmCloud(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = p * 2.05 + vec2(11.3, 7.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float up = smoothstep(-0.08, 0.62, d.y);
        vec3 col = mix(uHaze, uZenith, up);

        vec3 sunDir = normalize(uSunDir);
        float sunAmt = max(dot(d, sunDir), 0.0);
        col += uSunColor * (pow(sunAmt, 10.0) * 0.22 + pow(sunAmt, 280.0) * 0.52);

        // Volumetric-feeling animated sky clouds on upper hemisphere (0 extra draw calls)
        if (d.y > 0.03) {
          vec2 cloudUv = d.xz / (d.y + 0.22) * 1.15 + vec2(uTime * 0.018, -uTime * 0.009);
          float c1 = fbmCloud(cloudUv);
          float c2 = fbmCloud(cloudUv * 2.1 - vec2(uTime * 0.012, 0.0));
          float cloudDensity = smoothstep(0.46, 0.78, c1 * 0.72 + c2 * 0.28);
          float horizonFade = smoothstep(0.03, 0.24, d.y);
          vec3 cloudLit = mix(uHaze * 0.88, vec3(0.99, 0.97, 0.93) + uSunColor * 0.16, 0.65 + 0.35 * sunAmt);
          col = mix(col, cloudLit, cloudDensity * horizonFade * 0.62);
        }

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: true,
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 14), material)
  mesh.name = 'Terrain3D_SkyDome'
  mesh.renderOrder = -10
  return { mesh, uniforms }
}

function createWaterSea(atmosphere: PresetAtmosphere): {
  mesh: THREE.Mesh
  uniforms: {
    uShallow: { value: THREE.Color }
    uDeep: { value: THREE.Color }
    uSunColor: { value: THREE.Color }
    uSunDir: { value: THREE.Vector3 }
    uFogColor: { value: THREE.Color }
    uTime: { value: number }
    uIsMagma: { value: number }
  }
} {
  const uniforms = {
    uShallow: { value: new THREE.Color(atmosphere.waterColor) },
    uDeep: { value: new THREE.Color(atmosphere.waterDeepColor) },
    uSunColor: { value: new THREE.Color(atmosphere.sunColor) },
    uSunDir: {
      value: new THREE.Vector3(...atmosphere.sunDirection).normalize(),
    },
    uFogColor: { value: new THREE.Color(atmosphere.fogColor) },
    uTime: { value: 0 },
    uIsMagma: { value: atmosphere.isMagma ? 1 : 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uTime;
      uniform float uIsMagma;
      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.5);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmWater(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * noise2(p);
          p = p * 2.15 + vec2(9.2, -6.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 p = vWorldPos.xz * 0.075;
        float n1 = fbmWater(p + vec2(uTime * 0.14, -uTime * 0.09));
        float n2 = fbmWater(p * 1.85 - vec2(uTime * 0.11, uTime * 0.16));
        float wave = n1 * 0.6 + n2 * 0.4;

        vec3 n = normalize(vec3((n1 - 0.5) * 0.18, 1.0, (n2 - 0.5) * 0.18));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 sunDir = normalize(uSunDir);
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        vec3 halfV = normalize(sunDir + viewDir);
        float spec = pow(max(dot(n, halfV), 0.0), 64.0);

        vec3 base = mix(uDeep, uShallow, clamp(0.32 + 0.46 * fresnel + (wave - 0.5) * 0.35, 0.0, 1.0));
        if (uIsMagma > 0.5) {
          float crust = smoothstep(0.38, 0.72, wave);
          float vein = smoothstep(0.56, 0.82, n2);
          base = mix(uDeep * 0.55, uShallow, crust) + vec3(1.15, 0.38, 0.05) * vein * 0.85;
        } else {
          base += uSunColor * spec * 0.85;
        }

        float dist = length(cameraPosition - vWorldPos);
        float fog = smoothstep(260.0, 920.0, dist);
        vec3 col = mix(base, uFogColor, clamp(fog, 0.0, 0.96));
        gl_FragColor = vec4(col, 0.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  })

  const geom = new THREE.PlaneGeometry(2400, 2400, 1, 1)
  geom.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geom, material)
  mesh.position.y = atmosphere.waterLevel
  mesh.name = 'Terrain3D_SeaPlane'
  return { mesh, uniforms }
}

export function createTerrain3D(
  initialPreset: TerrainPresetId = 'sky-highlands',
  config: TerrainConfig = DEFAULT_TERRAIN_CONFIG,
): Terrain3DController {
  const group = new THREE.Group()
  group.name = 'Terrain3D_Root'

  let currentPreset: TerrainPresetId = initialPreset
  let atmosphere = PRESET_ATMOSPHERES[currentPreset]
  let params: TerrainShaderParams = {
    ...DEFAULT_SHADER_PARAMS,
    autoHeight: atmosphere.autoHeight,
    basinHeight: atmosphere.basinHeight,
  }
  let region: TerrainRegionData = createTerrainRegionData(
    currentPreset,
    config.resolution,
    config.worldSize,
  )
  let sculptCount = 0

  // 1. Build single-draw-call GPU Geomorphing Clipmap geometry
  const clipmapData = buildClipmapGeometryData({
    gridHalfExtent: config.gridHalfExtent,
    lodCount: config.lodCount,
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(clipmapData.positions, 3))
  geometry.setAttribute('aGrid', new THREE.BufferAttribute(clipmapData.grids, 2))
  geometry.setAttribute('aLod', new THREE.BufferAttribute(clipmapData.lods, 1))
  geometry.setAttribute('aPart', new THREE.BufferAttribute(clipmapData.parts, 1))
  geometry.setAttribute(
    'aMorphOffset',
    new THREE.BufferAttribute(clipmapData.morphOffsets, 2),
  )
  geometry.setIndex(new THREE.BufferAttribute(clipmapData.indices, 1))

  // 2. Create R32F Float Heightmap & RGBA8 Control Map textures (100% core WebGL2)
  const heightTexture = new THREE.DataTexture(
    region.heights,
    config.resolution,
    config.resolution,
    THREE.RedFormat,
    THREE.FloatType,
  )
  heightTexture.minFilter = THREE.NearestFilter
  heightTexture.magFilter = THREE.NearestFilter
  heightTexture.wrapS = THREE.ClampToEdgeWrapping
  heightTexture.wrapT = THREE.ClampToEdgeWrapping
  heightTexture.generateMipmaps = false
  heightTexture.flipY = false
  heightTexture.needsUpdate = true

  const controlTexture = new THREE.DataTexture(
    region.control,
    config.resolution,
    config.resolution,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  controlTexture.minFilter = THREE.NearestFilter
  controlTexture.magFilter = THREE.NearestFilter
  controlTexture.wrapS = THREE.ClampToEdgeWrapping
  controlTexture.wrapT = THREE.ClampToEdgeWrapping
  controlTexture.generateMipmaps = false
  controlTexture.flipY = false
  controlTexture.needsUpdate = true

  const createFallbackTex = (
    r: number,
    g: number,
    b: number,
  ): THREE.DataTexture => {
    const t = new THREE.DataTexture(
      new Uint8Array([r, g, b, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    )
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.needsUpdate = true
    return t
  }

  const fallbackAlbedo = createFallbackTex(160, 160, 160)
  const fallbackNormal = createFallbackTex(128, 128, 255)
  const ownedPbrTextures: THREE.Texture[] = [fallbackAlbedo, fallbackNormal]
  let usePbrTextures = true
  let pbrTexturesLoaded = false
  let disposed = false

  const cliffTexByPreset: Partial<
    Record<TerrainPresetId, { diff: THREE.Texture; nor: THREE.Texture }>
  > = {}

  const levelOrigins = Array.from(
    { length: config.lodCount },
    () => new THREE.Vector2(0, 0),
  )
  const trimOffsets = Array.from(
    { length: config.lodCount },
    () => new THREE.Vector2(0, 0),
  )

  const uniforms = {
    uHeightMap: { value: heightTexture },
    uControlMap: { value: controlTexture },
    uTexBasin: { value: fallbackAlbedo as THREE.Texture },
    uTexMeadow: { value: fallbackAlbedo as THREE.Texture },
    uTexCliff: { value: fallbackAlbedo as THREE.Texture },
    uTexCliffNormal: { value: fallbackNormal as THREE.Texture },
    uTexSummit: { value: fallbackAlbedo as THREE.Texture },
    uTexMeadowNormal: { value: fallbackNormal as THREE.Texture },
    uUsePbrTex: { value: 0 },
    uWorldSize: { value: config.worldSize },
    uResolution: { value: config.resolution },
    uBaseSpacing: { value: config.baseSpacing },
    uHeightScale: { value: params.heightScale },
    uMorphStart: { value: config.morphStart },
    uLevelOrigins: { value: levelOrigins },
    uTrimOffsets: { value: trimOffsets },
    uAutoSlope: { value: params.autoSlope },
    uAutoSlopeRange: { value: params.autoSlopeRange },
    uAutoHeight: { value: params.autoHeight },
    uAutoHeightRange: { value: params.autoHeightRange },
    uBasinHeight: { value: params.basinHeight },
    uPresetIndex: { value: TERRAIN_PRESET_INDEX[currentPreset] },
    uDebugMode: { value: TERRAIN_VIEW_MODE_INDEX[params.viewMode] },
    uTime: { value: 0 },
    uSunDirection: {
      value: new THREE.Vector3(...atmosphere.sunDirection).normalize(),
    },
    uSunColor: { value: new THREE.Color(atmosphere.sunColor) },
    uSkyColor: { value: new THREE.Color(atmosphere.skyZenith) },
    uFogColor: { value: new THREE.Color(atmosphere.fogColor) },
    uFogNear: { value: 230 },
    uFogFar: { value: 860 },
    uBrushPos: { value: new THREE.Vector2(0, 0) },
    uBrushRadius: { value: 24 },
    uBrushActive: { value: 0 },
    uBrushColor: { value: new THREE.Color(BRUSH_MODE_COLORS.raise) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: buildTerrainVertexShader(config.lodCount, config.gridHalfExtent),
    fragmentShader: buildTerrainFragmentShader(),
    wireframe: params.wireframe,
  })

  const terrainMesh = new THREE.Mesh(geometry, material)
  terrainMesh.name = 'Terrain3D_ClipmapMesh'
  // Vertices shift dynamically on the GPU around cameraPosition
  terrainMesh.frustumCulled = false

  const sky = createSkyDome(atmosphere)
  const water = createWaterSea(atmosphere)

  group.add(sky.mesh, terrainMesh, water.mesh)

  const syncPresetCliffTextures = (): void => {
    const entry = cliffTexByPreset[currentPreset]
    if (entry !== undefined) {
      uniforms.uTexCliff.value = entry.diff
      uniforms.uTexCliffNormal.value = entry.nor
    }
    uniforms.uUsePbrTex.value = usePbrTextures && pbrTexturesLoaded ? 1 : 0
  }

  // Asynchronously load 1K CC0 Poly Haven PBR textures (graceful procedural fallback if offline)
  const texLoader = new THREE.TextureLoader()
  const loadPbrTex = (url: string, isColor: boolean): Promise<THREE.Texture> =>
    texLoader.loadAsync(url).then((tex) => {
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace
      tex.anisotropy = 1
      ownedPbrTextures.push(tex)
      return tex
    })

  void Promise.all([
    loadPbrTex('/artifacts/terrain3d-assets/textures/coast_sand_01_diff.jpg', true),
    loadPbrTex('/artifacts/terrain3d-assets/textures/grass_ground_diff.jpg', true),
    loadPbrTex('/artifacts/terrain3d-assets/textures/grass_ground_nor.jpg', false),
    loadPbrTex('/artifacts/terrain3d-assets/textures/snow_02_diff.jpg', true),
    loadPbrTex('/artifacts/terrain3d-assets/textures/cliff_side_diff.jpg', true),
    loadPbrTex('/artifacts/terrain3d-assets/textures/cliff_side_nor.jpg', false),
    loadPbrTex('/artifacts/terrain3d-assets/textures/sandstone_cracks_diff.jpg', true),
    loadPbrTex('/artifacts/terrain3d-assets/textures/sandstone_cracks_nor.jpg', false),
    loadPbrTex('/artifacts/terrain3d-assets/textures/dark_rock_02_diff.jpg', true),
    loadPbrTex('/artifacts/terrain3d-assets/textures/dark_rock_02_nor.jpg', false),
  ])
    .then(
      ([
        basinDiff,
        meadowDiff,
        meadowNor,
        summitDiff,
        highlandCliffDiff,
        highlandCliffNor,
        canyonCliffDiff,
        canyonCliffNor,
        volcanicCliffDiff,
        volcanicCliffNor,
      ]) => {
        if (disposed) return
        uniforms.uTexBasin.value = basinDiff
        uniforms.uTexMeadow.value = meadowDiff
        uniforms.uTexMeadowNormal.value = meadowNor
        uniforms.uTexSummit.value = summitDiff
        cliffTexByPreset['sky-highlands'] = {
          diff: highlandCliffDiff,
          nor: highlandCliffNor,
        }
        cliffTexByPreset['wind-canyon'] = {
          diff: canyonCliffDiff,
          nor: canyonCliffNor,
        }
        cliffTexByPreset['volcanic-caldera'] = {
          diff: volcanicCliffDiff,
          nor: volcanicCliffNor,
        }
        pbrTexturesLoaded = true
        syncPresetCliffTextures()
      },
    )
    .catch(() => {
      // Keep procedural Terrain3D Autoshader active when offline
    })

  const syncAtmosphere = (): void => {
    atmosphere = PRESET_ATMOSPHERES[currentPreset]
    uniforms.uPresetIndex.value = TERRAIN_PRESET_INDEX[currentPreset]
    uniforms.uSunDirection.value.set(...atmosphere.sunDirection).normalize()
    uniforms.uSunColor.value.setHex(atmosphere.sunColor)
    uniforms.uSkyColor.value.setHex(atmosphere.skyZenith)
    uniforms.uFogColor.value.setHex(atmosphere.fogColor)

    sky.uniforms.uZenith.value.setHex(atmosphere.skyZenith)
    sky.uniforms.uHaze.value.setHex(atmosphere.skyHaze)
    sky.uniforms.uSunColor.value.setHex(atmosphere.sunColor)
    sky.uniforms.uSunDir.value.set(...atmosphere.sunDirection).normalize()

    water.uniforms.uShallow.value.setHex(atmosphere.waterColor)
    water.uniforms.uDeep.value.setHex(atmosphere.waterDeepColor)
    water.uniforms.uSunColor.value.setHex(atmosphere.sunColor)
    water.uniforms.uSunDir.value.set(...atmosphere.sunDirection).normalize()
    water.uniforms.uFogColor.value.setHex(atmosphere.fogColor)
    water.uniforms.uIsMagma.value = atmosphere.isMagma ? 1 : 0
    water.mesh.position.y = atmosphere.waterLevel * params.heightScale
    syncPresetCliffTextures()
  }

  const uploadRegionTextures = (nextRegion: TerrainRegionData): void => {
    region = nextRegion
    heightTexture.image.data = region.heights
    heightTexture.needsUpdate = true
    controlTexture.image.data = region.control
    controlTexture.needsUpdate = true
  }

  const updateClipmap = (camX: number, camZ: number): void => {
    const states = computeClipmapLevelStates(
      camX,
      camZ,
      config.baseSpacing,
      config.lodCount,
    )
    for (let i = 0; i < states.length; i += 1) {
      levelOrigins[i].set(states[i].originX, states[i].originZ)
      trimOffsets[i].set(states[i].trimOffsetX, states[i].trimOffsetZ)
    }
  }

  updateClipmap(0, 0)

  return {
    group,
    terrainMesh,
    config,
    update(cameraPosition, elapsedSeconds) {
      updateClipmap(cameraPosition.x, cameraPosition.z)
      sky.mesh.position.copy(cameraPosition)
      sky.uniforms.uTime.value = elapsedSeconds
      uniforms.uTime.value = elapsedSeconds
      water.uniforms.uTime.value = elapsedSeconds
    },
    setPreset(preset) {
      currentPreset = preset
      const nextAtmosphere = PRESET_ATMOSPHERES[preset]
      params = {
        ...params,
        autoHeight: nextAtmosphere.autoHeight,
        basinHeight: nextAtmosphere.basinHeight,
      }
      uniforms.uAutoHeight.value = params.autoHeight
      uniforms.uBasinHeight.value = params.basinHeight
      sculptCount = 0
      syncAtmosphere()
      uploadRegionTextures(
        createTerrainRegionData(preset, config.resolution, config.worldSize),
      )
    },
    resetTerrain() {
      sculptCount = 0
      uploadRegionTextures(
        createTerrainRegionData(currentPreset, config.resolution, config.worldSize),
      )
    },
    setShaderParams(partial) {
      params = { ...params, ...partial }
      uniforms.uHeightScale.value = params.heightScale
      uniforms.uAutoSlope.value = params.autoSlope
      uniforms.uAutoSlopeRange.value = params.autoSlopeRange
      uniforms.uAutoHeight.value = params.autoHeight
      uniforms.uAutoHeightRange.value = params.autoHeightRange
      uniforms.uBasinHeight.value = params.basinHeight
      uniforms.uDebugMode.value = TERRAIN_VIEW_MODE_INDEX[params.viewMode]
      material.wireframe = params.wireframe
      water.mesh.position.y = atmosphere.waterLevel * params.heightScale
    },
    setUsePbrTextures(enabled) {
      usePbrTextures = enabled
      syncPresetCliffTextures()
    },
    setBrushCursor(worldX, worldZ, radius, active, mode) {
      uniforms.uBrushPos.value.set(worldX, worldZ)
      uniforms.uBrushRadius.value = radius
      uniforms.uBrushActive.value = active ? 1 : 0
      uniforms.uBrushColor.value.setHex(BRUSH_MODE_COLORS[mode])
    },
    raycast(origin, direction) {
      return raycastHeightmap(region, origin, direction, params.heightScale)
    },
    applyBrush(brush, worldX, worldZ, dtSeconds) {
      const dirty = applyBrushStroke(region, brush, worldX, worldZ, dtSeconds)
      if (dirty === null) {
        return false
      }
      sculptCount += 1
      if (
        brush.mode === 'paint' ||
        brush.mode === 'autoshader' ||
        brush.mode === 'hole'
      ) {
        controlTexture.needsUpdate = true
      } else {
        heightTexture.needsUpdate = true
      }
      return true
    },
    sampleHeight(worldX, worldZ) {
      return sampleHeightBilinear(region, worldX, worldZ, params.heightScale)
    },
    getRegionData() {
      return region
    },
    getAtmosphereLighting() {
      return {
        sunDirection: atmosphere.sunDirection,
        sunColor: atmosphere.sunColor,
        skyColor: atmosphere.skyZenith,
        fogColor: atmosphere.fogColor,
      }
    },
    getShaderParams() {
      return params
    },
    getSnapshot() {
      const last = levelOrigins[levelOrigins.length - 1]
      return {
        preset: currentPreset,
        params,
        clipmapStats: clipmapData.stats,
        level0Origin: [levelOrigins[0].x, levelOrigins[0].y],
        levelLastOrigin: [last.x, last.y],
        sculptCount,
        usePbrTextures,
        pbrTexturesLoaded,
      }
    },
    dispose() {
      disposed = true
      geometry.dispose()
      material.dispose()
      heightTexture.dispose()
      controlTexture.dispose()
      for (const tex of ownedPbrTextures) {
        tex.dispose()
      }
      sky.mesh.geometry.dispose()
      ;(sky.mesh.material as THREE.Material).dispose()
      water.mesh.geometry.dispose()
      ;(water.mesh.material as THREE.Material).dispose()
    },
  }
}
