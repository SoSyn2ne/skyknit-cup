import type {
  TerrainPresetId,
  TerrainShaderParams,
  TerrainViewMode,
} from './terrainTypes'

export const TERRAIN_VIEW_MODE_INDEX: Record<TerrainViewMode, number> =
  Object.freeze({
    lit: 0,
    lod: 1,
    slope: 2,
    normals: 3,
  })

export const TERRAIN_PRESET_INDEX: Record<TerrainPresetId, number> =
  Object.freeze({
    'sky-highlands': 0,
    'wind-canyon': 1,
    'volcanic-caldera': 2,
  })

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Pure CPU mirror of the Terrain3D Autoshader biome weight math.
 * Returns normalized 5-slot weights: [basin, meadow, alpine, cliffRock, summit].
 */
export function evaluateAutoShaderWeights(
  height: number,
  slope: number,
  params: Pick<
    TerrainShaderParams,
    'autoSlope' | 'autoSlopeRange' | 'autoHeight' | 'autoHeightRange' | 'basinHeight'
  >,
): readonly [number, number, number, number, number] {
  const basinMask =
    1 - smoothstep(params.basinHeight - 4, params.basinHeight + 10, height)
  const alpineMask = smoothstep(
    params.autoHeight - params.autoHeightRange * 0.9,
    params.autoHeight - params.autoHeightRange * 0.15,
    height,
  )
  const peakMask = smoothstep(
    params.autoHeight - params.autoHeightRange * 0.2,
    params.autoHeight + params.autoHeightRange * 0.75,
    height,
  )
  const cliffMask = smoothstep(
    params.autoSlope - params.autoSlopeRange * 0.5,
    params.autoSlope + params.autoSlopeRange * 0.5,
    slope,
  )

  const elev0 = basinMask
  const elev4 = peakMask * (1 - elev0)
  const elev2 = alpineMask * (1 - elev0) * (1 - peakMask)
  const elev1 = (1 - elev0) * (1 - alpineMask) * (1 - peakMask)

  const nonCliff = 1 - cliffMask
  return [
    elev0 * nonCliff,
    elev1 * nonCliff,
    elev2 * nonCliff,
    cliffMask,
    elev4 * nonCliff,
  ]
}

export function buildTerrainVertexShader(
  lodCount: number,
  gridHalfExtent: number,
): string {
  const halfHole = (gridHalfExtent / 2).toFixed(1)
  const halfExtentStr = gridHalfExtent.toFixed(1)

  return /* glsl */ `
    attribute vec2 aGrid;
    attribute float aLod;
    attribute float aPart;
    attribute vec2 aMorphOffset;

    uniform sampler2D uHeightMap;
    uniform float uWorldSize;
    uniform float uResolution;
    uniform float uBaseSpacing;
    uniform float uHeightScale;
    uniform float uMorphStart;
    uniform vec2 uLevelOrigins[${lodCount}];
    uniform vec2 uTrimOffsets[${lodCount}];

    varying vec3 vWorldPos;
    varying float vLod;
    varying float vPart;
    varying float vMorph;
    varying vec2 vWorldUv;

    float sampleHeightBilinear(vec2 worldXZ) {
      vec2 texelPos = clamp(
        (worldXZ / uWorldSize + 0.5) * (uResolution - 1.0),
        0.0,
        uResolution - 1.0
      );
      vec2 f = fract(texelPos);
      vec2 p0 = floor(texelPos);
      vec2 p1 = min(p0 + vec2(1.0), vec2(uResolution - 1.0));
      float invRes = 1.0 / uResolution;

      float h00 = texture2D(uHeightMap, (vec2(p0.x, p0.y) + 0.5) * invRes).r;
      float h10 = texture2D(uHeightMap, (vec2(p1.x, p0.y) + 0.5) * invRes).r;
      float h01 = texture2D(uHeightMap, (vec2(p0.x, p1.y) + 0.5) * invRes).r;
      float h11 = texture2D(uHeightMap, (vec2(p1.x, p1.y) + 0.5) * invRes).r;

      float top = mix(h00, h10, f.x);
      float bottom = mix(h01, h11, f.x);
      return mix(top, bottom, f.y) * uHeightScale;
    }

    void main() {
      int lodIdx = int(floor(aLod + 0.5));
      float spacing = uBaseSpacing * exp2(aLod);
      vec2 origin = uLevelOrigins[lodIdx];
      vec2 trimOffset = uTrimOffsets[lodIdx];

      vec2 localGrid = aGrid;
      if (aPart > 0.5 && aPart < 1.5) {
        // Vertical L-trim shifts to +N/2 when offsetX == 0, or -N/2 when offsetX == 1
        localGrid.x += trimOffset.x < 0.5 ? ${halfHole} : -${halfHole};
      } else if (aPart >= 1.5) {
        // Horizontal L-trim shifts horizontally by offsetX and vertically to +/-N/2
        localGrid.x += trimOffset.x;
        localGrid.y += trimOffset.y < 0.5 ? ${halfHole} : -${halfHole};
      }

      float morph = 0.0;
      if (aPart < 0.5 && lodIdx < ${lodCount - 1}) {
        float chebyshev = max(abs(localGrid.x), abs(localGrid.y)) / ${halfExtentStr};
        morph = smoothstep(uMorphStart, 1.0, chebyshev);
      }

      vec2 morphedGrid = localGrid - aMorphOffset * morph;
      vec2 worldXZ = origin + morphedGrid * spacing;
      float worldY = sampleHeightBilinear(worldXZ);

      vec3 worldPosition = vec3(worldXZ.x, worldY, worldXZ.y);
      vWorldPos = worldPosition;
      vLod = aLod;
      vPart = aPart;
      vMorph = morph;
      vWorldUv = worldXZ / uWorldSize + 0.5;

      gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
    }
  `
}

export function buildTerrainFragmentShader(): string {
  return /* glsl */ `
    precision highp float;

    uniform sampler2D uHeightMap;
    uniform sampler2D uControlMap;
    uniform sampler2D uTexBasin;
    uniform sampler2D uTexMeadow;
    uniform sampler2D uTexCliff;
    uniform sampler2D uTexCliffNormal;
    uniform sampler2D uTexSummit;
    uniform sampler2D uTexMeadowNormal;
    uniform float uUsePbrTex;
    uniform float uWorldSize;
    uniform float uResolution;
    uniform float uHeightScale;
    uniform float uAutoSlope;
    uniform float uAutoSlopeRange;
    uniform float uAutoHeight;
    uniform float uAutoHeightRange;
    uniform float uBasinHeight;
    uniform float uPresetIndex;
    uniform float uDebugMode;
    uniform float uTime;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform vec2 uBrushPos;
    uniform float uBrushRadius;
    uniform float uBrushActive;
    uniform vec3 uBrushColor;

    varying vec3 vWorldPos;
    varying float vLod;
    varying float vPart;
    varying float vMorph;
    varying vec2 vWorldUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm3(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        v += a * vnoise(p);
        p = p * 2.07 + vec2(17.1, 31.7);
        a *= 0.5;
      }
      return v;
    }

    float sampleHeightBilinear(vec2 worldXZ) {
      vec2 texelPos = clamp(
        (worldXZ / uWorldSize + 0.5) * (uResolution - 1.0),
        0.0,
        uResolution - 1.0
      );
      vec2 f = fract(texelPos);
      vec2 p0 = floor(texelPos);
      vec2 p1 = min(p0 + vec2(1.0), vec2(uResolution - 1.0));
      float invRes = 1.0 / uResolution;

      float h00 = texture2D(uHeightMap, (vec2(p0.x, p0.y) + 0.5) * invRes).r;
      float h10 = texture2D(uHeightMap, (vec2(p1.x, p0.y) + 0.5) * invRes).r;
      float h01 = texture2D(uHeightMap, (vec2(p0.x, p1.y) + 0.5) * invRes).r;
      float h11 = texture2D(uHeightMap, (vec2(p1.x, p1.y) + 0.5) * invRes).r;

      return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * uHeightScale;
    }

    vec3 sampleDualTex(sampler2D tex, vec2 xz, float dualBlend) {
      vec3 nearS = texture2D(tex, xz * 0.048).rgb;
      vec3 farS = texture2D(tex, xz * 0.013 + vec2(0.37, 0.71)).rgb;
      return mix(nearS, farS, dualBlend * 0.72);
    }

    vec3 sampleTriplanarTex(sampler2D tex, vec3 wp, vec3 n, float scale) {
      vec3 blend = pow(abs(n), vec3(4.0));
      blend /= max(blend.x + blend.y + blend.z, 1e-4);
      vec3 tx = texture2D(tex, wp.zy * scale).rgb;
      vec3 ty = texture2D(tex, wp.xz * scale).rgb;
      vec3 tz = texture2D(tex, wp.xy * scale).rgb;
      return tx * blend.x + ty * blend.y + tz * blend.z;
    }

    vec3 sampleSlotColor(
      int slot,
      vec3 worldPos,
      float microNoise,
      float macroNoise,
      float strataNoise,
      vec3 pbrBasin,
      vec3 pbrMeadow,
      vec3 pbrCliff,
      vec3 pbrSummit
    ) {
      vec3 c0;
      vec3 c1;
      vec3 c2;
      vec3 c3;
      vec3 c4;

      if (uPresetIndex > 1.5) {
        // Volcanic Caldera: basalt, scorched ash, obsidian cliffs, sunlit pumice crest
        float lavaCrack = smoothstep(0.62, 0.84, microNoise) * (1.0 - smoothstep(2.5, 10.0, worldPos.y));
        c0 = mix(vec3(0.14, 0.12, 0.15), vec3(1.15, 0.36, 0.08), lavaCrack);
        c1 = mix(vec3(0.22, 0.20, 0.24), vec3(0.32, 0.28, 0.30), macroNoise);
        c2 = mix(vec3(0.38, 0.22, 0.18), vec3(0.49, 0.30, 0.23), microNoise);
        c3 = mix(vec3(0.16, 0.15, 0.19), vec3(0.30, 0.26, 0.29), strataNoise);
        c4 = mix(vec3(0.50, 0.46, 0.42), vec3(0.68, 0.62, 0.54), microNoise);
      } else if (uPresetIndex > 0.5) {
        // Wind Canyon: golden silt, ochre sage, terracotta plateau, banded sandstone cliffs, chalk caprock
        c0 = mix(vec3(0.74, 0.54, 0.35), vec3(0.84, 0.65, 0.44), microNoise);
        c1 = mix(vec3(0.66, 0.44, 0.26), vec3(0.55, 0.48, 0.28), macroNoise);
        c2 = mix(vec3(0.72, 0.36, 0.22), vec3(0.82, 0.48, 0.28), microNoise);
        c3 = mix(vec3(0.56, 0.24, 0.16), vec3(0.84, 0.48, 0.27), strataNoise);
        c4 = mix(vec3(0.83, 0.77, 0.66), vec3(0.92, 0.87, 0.77), microNoise);
      } else {
        // Sky Highlands: sunlit sand shore, lush emerald meadow, alpine moor, stratified granite cliff, highland snow
        c0 = mix(vec3(0.74, 0.67, 0.52), vec3(0.84, 0.78, 0.64), microNoise);
        c1 = mix(vec3(0.28, 0.52, 0.27), vec3(0.44, 0.63, 0.31), macroNoise * 0.7 + microNoise * 0.3);
        c2 = mix(vec3(0.22, 0.39, 0.27), vec3(0.38, 0.47, 0.27), microNoise);
        c3 = mix(vec3(0.38, 0.37, 0.35), vec3(0.58, 0.54, 0.49), strataNoise);
        c4 = mix(vec3(0.85, 0.88, 0.90), vec3(0.96, 0.97, 0.98), microNoise);
      }

      if (uUsePbrTex > 0.5) {
        if (uPresetIndex > 1.5) {
          c0 = mix(c0, pbrCliff * vec3(0.55, 0.48, 0.50), 0.58);
          c1 = mix(c1, pbrCliff * vec3(0.72, 0.66, 0.70), 0.68);
          c2 = mix(c2, pbrCliff * vec3(1.15, 0.72, 0.58), 0.62);
          c3 = mix(c3, pbrCliff * vec3(0.88, 0.84, 0.92), 0.82);
          c4 = mix(c4, pbrBasin * vec3(0.72, 0.66, 0.60), 0.55);
        } else if (uPresetIndex > 0.5) {
          c0 = mix(c0, pbrBasin * vec3(1.14, 0.92, 0.70), 0.76);
          c1 = mix(c1, pbrBasin * vec3(1.04, 0.76, 0.52), 0.68);
          c2 = mix(c2, pbrCliff * vec3(1.25, 0.82, 0.58), 0.72);
          c3 = mix(c3, pbrCliff * vec3(1.22, 0.78, 0.55), 0.84);
          c4 = mix(c4, pbrBasin * vec3(1.18, 1.12, 0.98), 0.65);
        } else {
          c0 = mix(c0, pbrBasin * vec3(1.12, 1.06, 0.96), 0.78);
          c1 = mix(c1, pbrMeadow * vec3(0.95, 1.16, 0.88), 0.78);
          c2 = mix(c2, pbrMeadow * vec3(0.76, 0.94, 0.74), 0.68);
          c3 = mix(c3, pbrCliff * vec3(1.06, 1.03, 0.98), 0.85);
          c4 = mix(c4, pbrSummit * vec3(1.06, 1.08, 1.12), 0.78);
        }
      }

      if (slot == 0) return c0;
      if (slot == 1) return c1;
      if (slot == 2) return c2;
      if (slot == 3) return c3;
      return c4;
    }

    float sampleSlotRoughness(int slot) {
      if (slot == 0) return 0.55;
      if (slot == 1) return 0.84;
      if (slot == 2) return 0.88;
      if (slot == 3) return 0.74;
      return 0.48;
    }

    void main() {
      // Sample 32-bit packed Control Map at exact texel center
      vec2 clampedUv = clamp(vWorldUv, 0.0, 1.0);
      vec4 ctrl = texture2D(uControlMap, clampedUv);
      float flags = floor(ctrl.b * 255.0 + 0.5);
      bool isHole = mod(floor(flags / 2.0), 2.0) > 0.5;
      if (isHole) {
        discard;
      }

      bool autoShaderEnabled = mod(flags, 2.0) > 0.5;
      float packedIds = floor(ctrl.r * 255.0 + 0.5);
      int baseSlot = int(floor(packedIds / 16.0));
      int overlaySlot = int(mod(packedIds, 16.0));
      float manualBlend = ctrl.g;
      float macroTint = mix(0.84, 1.16, ctrl.a);

      // Per-pixel smooth normal + free Laplacian cavity AO from heightmap
      float camDist = length(cameraPosition - vWorldPos);
      float eps = max(uWorldSize / (uResolution - 1.0) * 0.85, camDist * 0.0024);
      float hC = sampleHeightBilinear(vWorldPos.xz);
      float hL = sampleHeightBilinear(vWorldPos.xz - vec2(eps, 0.0));
      float hR = sampleHeightBilinear(vWorldPos.xz + vec2(eps, 0.0));
      float hD = sampleHeightBilinear(vWorldPos.xz - vec2(0.0, eps));
      float hU = sampleHeightBilinear(vWorldPos.xz + vec2(0.0, eps));

      vec3 normal = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
      float cavity = clamp(0.94 - ((hL + hR + hD + hU) * 0.25 - hC) / (eps * 0.45), 0.52, 1.18);

      // Dual-scale procedural micro/macro noise + crisp high-frequency stone/grass detail
      float dualBlend = smoothstep(75.0, 340.0, camDist);
      float fineGrain = fbm3(vWorldPos.xz * 0.72);
      float nearDetail = mix(fbm3(vWorldPos.xz * 0.20), fineGrain, 0.45);
      float farDetail = fbm3(vWorldPos.xz * 0.045 + vec2(4.2, -9.1));
      float microNoise = mix(nearDetail, farDetail, dualBlend);
      float macroNoise = fbm3(vWorldPos.xz * 0.013 + vec2(-13.7, 7.3));

      // Crisp horizontal sedimentary strata + vertical rock fracture detail on steep slopes
      float strataWarp = fbm3(vWorldPos.xz * 0.055) * 3.2 + fineGrain * 0.55;
      float strataBand1 = sin((vWorldPos.y * 0.46 + strataWarp) * 3.14159) * 0.5 + 0.5;
      float strataBand2 = sin((vWorldPos.y * 1.15 - strataWarp * 0.6) * 3.14159) * 0.5 + 0.5;
      float rockCrack = abs(fbm3(vec2(vWorldPos.x * 0.28 + vWorldPos.z * 0.22, vWorldPos.y * 0.34)) * 2.0 - 1.0);
      float strataNoise = clamp(
        strataBand1 * 0.52 + strataBand2 * 0.24 + smoothstep(0.08, 0.48, rockCrack) * 0.36 - 0.12,
        0.0,
        1.0
      );

      // Finite-difference micro-bump gradient for razor-sharp rock/grass surface lighting
      float bumpEps = 0.55;
      float bC = fbm3(vWorldPos.xz * 0.48) + 0.45 * strataBand1;
      float bX = fbm3((vWorldPos.xz + vec2(bumpEps, 0.0)) * 0.48) + 0.45 * strataBand1;
      float bZ = fbm3((vWorldPos.xz + vec2(0.0, bumpEps)) * 0.48) + 0.45 * strataBand1;
      float slope = clamp(1.0 - normal.y, 0.0, 1.0);
      float bumpStrength = (1.0 - dualBlend * 0.65) * mix(0.28, 0.68, smoothstep(0.12, 0.45, slope));
      vec3 bumpNormal = normalize(
        normal + vec3((bC - bX) * bumpStrength, (strataBand2 - 0.5) * 0.18 * slope, (bC - bZ) * bumpStrength)
      );
      if (uUsePbrTex > 0.5) {
        vec3 cliffNorTex = sampleTriplanarTex(uTexCliffNormal, vWorldPos, normal, 0.036) * 2.0 - 1.0;
        vec3 meadowNorTex = sampleDualTex(uTexMeadowNormal, vWorldPos.xz, dualBlend) * 2.0 - 1.0;
        vec3 pbrPerturb = mix(meadowNorTex, cliffNorTex, smoothstep(0.16, 0.42, slope));
        float pbrNorAmt = (1.0 - dualBlend * 0.58) * 0.42;
        bumpNormal = normalize(bumpNormal + vec3(pbrPerturb.x, 0.0, pbrPerturb.y) * pbrNorAmt);
      }

      float noiseHeightBias = (macroNoise - 0.5) * 11.0 + (microNoise - 0.5) * 4.0;
      float evalHeight = vWorldPos.y + noiseHeightBias;

      // Terrain3D Autoshader biome evaluation
      float basinMask = 1.0 - smoothstep(uBasinHeight - 3.5, uBasinHeight + 9.0, evalHeight);
      float alpineMask = smoothstep(
        uAutoHeight - uAutoHeightRange * 0.95,
        uAutoHeight - uAutoHeightRange * 0.15,
        evalHeight
      );
      float peakMask = smoothstep(
        uAutoHeight - uAutoHeightRange * 0.15,
        uAutoHeight + uAutoHeightRange * 0.65,
        evalHeight
      );
      float cliffMask = smoothstep(
        uAutoSlope - uAutoSlopeRange * 0.5,
        uAutoSlope + uAutoSlopeRange * 0.5,
        slope + (microNoise - 0.5) * 0.085
      );

      float elev0 = basinMask;
      float elev4 = peakMask * (1.0 - elev0);
      float elev2 = alpineMask * (1.0 - elev0) * (1.0 - peakMask);
      float elev1 = (1.0 - elev0) * (1.0 - alpineMask) * (1.0 - peakMask);
      float nonCliff = 1.0 - cliffMask;

      float w0 = elev0 * nonCliff;
      float w1 = elev1 * nonCliff;
      float w2 = elev2 * nonCliff;
      float w3 = cliffMask;
      float w4 = elev4 * nonCliff;

      // Sample each active PBR texture AT MOST ONCE per pixel (huge GPU/mobile speedup)
      vec3 pbrBasin = vec3(0.65);
      vec3 pbrMeadow = vec3(0.5);
      vec3 pbrCliff = vec3(0.5);
      vec3 pbrSummit = vec3(0.9);
      if (uUsePbrTex > 0.5) {
        bool needBasin = !autoShaderEnabled || w0 > 0.01 || (uPresetIndex > 0.5 && (w1 + w4) > 0.01);
        bool needMeadow = !autoShaderEnabled || (uPresetIndex < 0.5 && (w1 + w2) > 0.01);
        bool needCliff = !autoShaderEnabled || w3 > 0.01 || (uPresetIndex > 0.5 && w2 > 0.01) || (uPresetIndex > 1.5 && (w0 + w1) > 0.01);
        bool needSummit = !autoShaderEnabled || (uPresetIndex < 0.5 && w4 > 0.01);

        if (needBasin) pbrBasin = sampleDualTex(uTexBasin, vWorldPos.xz, dualBlend);
        if (needMeadow) pbrMeadow = sampleDualTex(uTexMeadow, vWorldPos.xz, dualBlend);
        if (needCliff) pbrCliff = sampleTriplanarTex(uTexCliff, vWorldPos, normal, 0.036);
        if (needSummit) pbrSummit = sampleDualTex(uTexSummit, vWorldPos.xz, dualBlend);
      }

      vec3 col0 = w0 > 0.005 ? sampleSlotColor(0, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit) : vec3(0.0);
      vec3 col1 = w1 > 0.005 ? sampleSlotColor(1, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit) : vec3(0.0);
      vec3 col2 = w2 > 0.005 ? sampleSlotColor(2, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit) : vec3(0.0);
      vec3 col3 = w3 > 0.005 ? sampleSlotColor(3, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit) : vec3(0.0);
      vec3 col4 = w4 > 0.005 ? sampleSlotColor(4, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit) : vec3(0.0);

      vec3 autoAlbedo = col0 * w0 + col1 * w1 + col2 * w2 + col3 * w3 + col4 * w4;

      float autoRoughness =
        sampleSlotRoughness(0) * w0 +
        sampleSlotRoughness(1) * w1 +
        sampleSlotRoughness(2) * w2 +
        sampleSlotRoughness(3) * w3 +
        sampleSlotRoughness(4) * w4;

      vec3 albedo = autoAlbedo;
      float roughness = autoRoughness;

      if (!autoShaderEnabled) {
        vec3 baseCol = sampleSlotColor(baseSlot, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit);
        vec3 overCol = sampleSlotColor(overlaySlot, vWorldPos, microNoise, macroNoise, strataNoise, pbrBasin, pbrMeadow, pbrCliff, pbrSummit);
        albedo = mix(baseCol, overCol, manualBlend);
        roughness = mix(sampleSlotRoughness(baseSlot), sampleSlotRoughness(overlaySlot), manualBlend);
      }

      albedo *= macroTint * mix(0.88, 1.12, fineGrain);

      // Sunlit PBR-inspired atmospheric lighting + crisp shadows + moving cloud dappling
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec3 sunDir = normalize(uSunDirection);
      vec3 halfVec = normalize(sunDir + viewDir);

      float ndotl = max(dot(bumpNormal, sunDir), 0.0);
      float wrapDiffuse = max((dot(bumpNormal, sunDir) + 0.12) / 1.12, 0.0);
      float specPower = mix(54.0, 10.0, roughness);
      float spec = pow(max(dot(bumpNormal, halfVec), 0.0), specPower) * (1.0 - roughness) * 0.34;
      float fresnel = pow(1.0 - max(dot(bumpNormal, viewDir), 0.0), 3.4) * 0.14;

      float cloudShadow = mix(
        0.78,
        1.0,
        smoothstep(0.34, 0.66, fbm3(vWorldPos.xz * 0.0046 + vec2(uTime * 0.018, -uTime * 0.011)))
      );

      vec3 shadowTint = mix(vec3(0.14, 0.19, 0.25), uSkyColor * 0.56, bumpNormal.y * 0.5 + 0.5);
      vec3 directLight = uSunColor * (wrapDiffuse * 0.72 + ndotl * 0.78) * cloudShadow;
      vec3 litColor = albedo * (shadowTint + directLight) * cavity + uSunColor * spec + uSkyColor * fresnel;

      // Subtle glowing lava embers in Volcanic Caldera basin
      if (uPresetIndex > 1.5) {
        float pulse = 0.84 + 0.16 * sin(uTime * 2.4 + vWorldPos.x * 0.07);
        float magma = (1.0 - smoothstep(4.5, 13.0, vWorldPos.y)) * smoothstep(0.46, 0.78, microNoise);
        litColor += vec3(1.55, 0.38, 0.05) * magma * pulse * 0.85;
      }

      // Distance + height atmospheric fog
      float fogDistFactor = smoothstep(uFogNear, uFogFar, camDist);
      float heightMist = (1.0 - smoothstep(0.0, 48.0, vWorldPos.y)) * 0.20;
      float fogAmount = clamp(fogDistFactor + heightMist * fogDistFactor, 0.0, 0.90);
      vec3 finalColor = mix(litColor, uFogColor, fogAmount);

      // Debug Visualization Modes (Terrain3D Inspector parity)
      if (uDebugMode > 0.5 && uDebugMode < 1.5) {
        // Mode 1: Clipmap LOD Ring + L-Trim + Geomorph Zone Visualizer
        vec3 lodCol = vec3(0.18, 0.76, 0.48);
        if (vLod > 3.5) lodCol = vec3(0.64, 0.38, 0.88);
        else if (vLod > 2.5) lodCol = vec3(0.92, 0.42, 0.36);
        else if (vLod > 1.5) lodCol = vec3(0.95, 0.75, 0.24);
        else if (vLod > 0.5) lodCol = vec3(0.22, 0.68, 0.86);

        // Highlight L-trim strips in crisp ivory-gold
        if (vPart > 0.5) {
          lodCol = mix(lodCol, vec3(0.98, 0.95, 0.78), 0.72);
        }

        // Shade by geomorph factor and crisp lighting so terrain topography stays readable
        float shade = 0.52 + 0.48 * max(dot(normal, sunDir), 0.0);
        vec3 morphTint = mix(lodCol, vec3(1.0), vMorph * 0.32);
        float gridLine =
          step(0.94, fract(vWorldPos.x / exp2(vLod))) +
          step(0.94, fract(vWorldPos.z / exp2(vLod)));
        finalColor = mix(morphTint * shade, vec3(0.08, 0.14, 0.16), clamp(gridLine, 0.0, 0.35));
      } else if (uDebugMode >= 1.5 && uDebugMode < 2.5) {
        // Mode 2: Slope / Autoshader Cliff Threshold Heatmap
        vec3 flatCol = vec3(0.16, 0.62, 0.44);
        vec3 midCol = vec3(0.95, 0.78, 0.26);
        vec3 steepCol = vec3(0.88, 0.26, 0.22);
        vec3 heat = slope < uAutoSlope
          ? mix(flatCol, midCol, slope / max(0.01, uAutoSlope))
          : mix(midCol, steepCol, clamp((slope - uAutoSlope) / max(0.01, 1.0 - uAutoSlope), 0.0, 1.0));
        float thresholdContour = 1.0 - smoothstep(0.0, 0.018, abs(slope - uAutoSlope));
        finalColor = mix(heat * (0.65 + 0.35 * cavity), vec3(1.0, 0.97, 0.85), thresholdContour * 0.9);
      } else if (uDebugMode >= 2.5) {
        // Mode 3: Per-Pixel World Normals
        finalColor = normal * 0.5 + 0.5;
      }

      // Interactive Terrain3D Sculpt/Paint Brush Ring Cursor
      if (uBrushActive > 0.5) {
        float brushDist = length(vWorldPos.xz - uBrushPos);
        float ringWidth = max(0.55, uBrushRadius * 0.055);
        float ringMask = 1.0 - smoothstep(0.0, ringWidth, abs(brushDist - uBrushRadius));
        float innerFill = (1.0 - smoothstep(0.0, uBrushRadius, brushDist)) * 0.14;
        finalColor = mix(finalColor, uBrushColor, clamp(innerFill + ringMask * 0.85, 0.0, 0.92));
      }

      gl_FragColor = vec4(finalColor, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
}
