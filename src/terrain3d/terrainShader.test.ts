import { describe, expect, it } from 'vitest'

import {
  buildTerrainFragmentShader,
  buildTerrainVertexShader,
  evaluateAutoShaderWeights,
  TERRAIN_VIEW_MODE_INDEX,
} from './terrainShader'
import { DEFAULT_SHADER_PARAMS } from './terrainTypes'

describe('terrainShader', () => {
  it('generates vertex and fragment GLSL with core Terrain3D clipmap, control-map, and autoshader stages', () => {
    const vertex = buildTerrainVertexShader(5, 32)
    const fragment = buildTerrainFragmentShader()

    // Vertex shader contracts: per-LOD origins, L-trim offsets, geomorphing, R32F height lookup
    expect(vertex).toContain('uLevelOrigins[5]')
    expect(vertex).toContain('uTrimOffsets[5]')
    expect(vertex).toContain('aMorphOffset')
    expect(vertex).toContain('aPart')
    expect(vertex).toContain('sampleHeightBilinear')

    // Fragment shader contracts: control map hole discard, autoshader slope/height, debug views, brush ring
    expect(fragment).toContain('uControlMap')
    expect(fragment).toContain('discard;')
    expect(fragment).toContain('uAutoSlope')
    expect(fragment).toContain('uAutoHeight')
    expect(fragment).toContain('uDebugMode')
    expect(fragment).toContain('uBrushRadius')

    expect(TERRAIN_VIEW_MODE_INDEX).toEqual({
      lit: 0,
      lod: 1,
      slope: 2,
      normals: 3,
    })
  })

  it('computes normalized autoshader biome weights responding to slope and elevation', () => {
    // Low flat basin -> dominated by shore/basin (slot 0)
    const basin = evaluateAutoShaderWeights(2, 0.03, DEFAULT_SHADER_PARAMS)
    expect(basin.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(basin[0]).toBeGreaterThan(0.75)

    // Mid-elevation flat meadow -> dominated by grass (slot 1)
    const meadow = evaluateAutoShaderWeights(24, 0.05, DEFAULT_SHADER_PARAMS)
    expect(meadow.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(meadow[1]).toBeGreaterThan(0.65)

    // Steep cliff at mid elevation -> dominated by stratified cliff rock (slot 3)
    const cliff = evaluateAutoShaderWeights(30, 0.72, DEFAULT_SHADER_PARAMS)
    expect(cliff.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(cliff[3]).toBeGreaterThan(0.85)

    // High gentle summit -> dominated by peak snow/limestone (slot 4)
    const summit = evaluateAutoShaderWeights(88, 0.08, DEFAULT_SHADER_PARAMS)
    expect(summit.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(summit[4]).toBeGreaterThan(0.75)

    // Sheer vertical peak -> cliff rock beats snow even at high elevation
    const sheerPeak = evaluateAutoShaderWeights(88, 0.85, DEFAULT_SHADER_PARAMS)
    expect(sheerPeak[3]).toBeGreaterThan(sheerPeak[4])
  })
})
