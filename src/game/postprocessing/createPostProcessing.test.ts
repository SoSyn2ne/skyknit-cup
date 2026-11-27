import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  BrunoTiltShiftDOFShader,
  createPostProcessing,
} from './createPostProcessing'

describe('BrunoTiltShiftDOFShader', () => {
  it('defines the required tilt-shift uniforms', () => {
    expect(BrunoTiltShiftDOFShader.uniforms.tDiffuse).toBeDefined()
    expect(BrunoTiltShiftDOFShader.uniforms.uFocusY.value).toBe(0.5)
    expect(BrunoTiltShiftDOFShader.uniforms.uStart.value).toBeGreaterThan(0)
    expect(BrunoTiltShiftDOFShader.uniforms.uEnd.value).toBeGreaterThan(
      BrunoTiltShiftDOFShader.uniforms.uStart.value,
    )
    expect(BrunoTiltShiftDOFShader.uniforms.uAmount.value).toBeGreaterThan(0)
  })

  it('contains the golden-spiral loop and smoothstep blur factor in fragment shader', () => {
    expect(BrunoTiltShiftDOFShader.fragmentShader).toContain('smoothstep')
    expect(BrunoTiltShiftDOFShader.fragmentShader).toContain('TWO_PI')
    expect(BrunoTiltShiftDOFShader.fragmentShader).toContain('blurAmount')
  })
})

describe('createPostProcessing', () => {
  it('initializes EffectComposer with RenderPass, BloomPass, and DOFPass', () => {
    const mockCanvas = {
      width: 1280,
      height: 720,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }

    const renderer = {
      domElement: mockCanvas,
      capabilities: { isWebGL2: true },
      extensions: { get: () => null },
      getContext: () => ({
        getExtension: () => null,
      }),
      getPixelRatio: () => 1,
      getSize: (target: THREE.Vector2) => target.set(1280, 720),
      render: () => {},
      setSize: () => {},
      setPixelRatio: () => {},
      clear: () => {},
      getRenderTarget: () => null,
      setRenderTarget: () => {},
    } as unknown as THREE.WebGLRenderer

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000)

    const pipeline = createPostProcessing(renderer, scene, camera, 1280, 720, 'high')

    expect(pipeline.composer.passes.length).toBe(3)
    expect(pipeline.composer.passes[0].constructor.name).toBe('RenderPass')
    expect(pipeline.composer.passes[1].constructor.name).toBe('UnrealBloomPass')
    expect(pipeline.composer.passes[2].constructor.name).toBe('ShaderPass')

    // Test tier adjustment
    pipeline.setQuality('low')
    expect(pipeline.composer.passes[1].enabled).toBe(false)
    expect(pipeline.composer.passes[2].enabled).toBe(false)

    pipeline.setQuality('high')
    expect(pipeline.composer.passes[1].enabled).toBe(true)
    expect(pipeline.composer.passes[2].enabled).toBe(true)

    // Test focus Y adjustment
    pipeline.setFocusY(0.65)
    pipeline.setSize(1920, 1080, 1.5)

    pipeline.dispose()
  })
})
