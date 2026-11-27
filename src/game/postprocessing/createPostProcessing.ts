import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

import type { RenderQualityTier } from '../quality/qualityPolicy'

export interface PostProcessingPipeline {
  readonly composer: EffectComposer
  render(): void
  setSize(width: number, height: number, pixelRatio?: number): void
  setQuality(tier: RenderQualityTier): void
  setFocusY(y: number): void
  dispose(): void
}

/**
 * Bruno Simon's CheapDOF (Tilt-shift Depth of Field) Shader
 * Reconstructed from Bruno Simon's portfolio bundle:
 * Focuses on the center plane (where the character moves) and applies
 * smoothstep golden-spiral bokeh blur to the horizon and foreground.
 */
export const BrunoTiltShiftDOFShader = {
  name: 'BrunoTiltShiftDOFShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uFocusY: { value: 0.5 },
    uStart: { value: 0.16 },
    uEnd: { value: 0.46 },
    uAmount: { value: 0.0036 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uFocusY;
    uniform float uStart;
    uniform float uEnd;
    uniform float uAmount;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);
      float dist = abs(vUv.y - uFocusY);
      float blurFactor = smoothstep(uStart, uEnd, dist);

      if (blurFactor < 0.002) {
        gl_FragColor = baseColor;
        return;
      }

      float blurAmount = blurFactor * uAmount;
      vec4 sum = vec4(0.0);
      float totalWeight = 0.0;
      const int SAMPLES = 16;
      const float SAMPLES_F = 16.0;
      const float TWO_PI = 6.28318530718;

      for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i);
        float angle = (fi / SAMPLES_F) * TWO_PI;
        float r = rand(vec2(fi, vUv.x + vUv.y)) + 0.15;
        vec2 offset = vec2(cos(angle), sin(angle)) * r * blurAmount;
        offset.x *= (uResolution.y / uResolution.x);
        sum += texture2D(tDiffuse, vUv + offset, 0.0);
        totalWeight += 1.0;
      }

      vec4 blurred = sum / totalWeight;
      gl_FragColor = mix(baseColor, blurred, blurFactor);
    }
  `,
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  initialWidth: number,
  initialHeight: number,
  initialTier: RenderQualityTier = 'high',
): PostProcessingPipeline {
  const composer = new EffectComposer(renderer)
  composer.setSize(initialWidth, initialHeight)

  // 1. Scene Pass
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // 2. Bloom Pass (Bruno Simon atmospheric glow)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(initialWidth, initialHeight),
    0.28, // subtle strength so it adds air/glow without blinding
    0.45, // radius
    0.82, // threshold: only hot highlights (sun, golden gates, fire embers) glow
  )
  composer.addPass(bloomPass)

  // 3. Bruno Simon CheapDOF Pass (Tilt-shift Depth of Field)
  const dofPass = new ShaderPass(BrunoTiltShiftDOFShader)
  dofPass.uniforms.uResolution.value.set(initialWidth, initialHeight)
  composer.addPass(dofPass)

  let currentTier = initialTier
  const applyTierSettings = (tier: RenderQualityTier): void => {
    currentTier = tier
    if (tier === 'low') {
      bloomPass.enabled = false
      dofPass.enabled = false
    } else {
      bloomPass.enabled = true
      dofPass.enabled = true
    }
  }
  applyTierSettings(initialTier)

  return {
    composer,
    render(): void {
      if (currentTier === 'low') {
        renderer.render(scene, camera)
      } else {
        composer.render()
      }
    },
    setSize(width: number, height: number, pixelRatio = 1): void {
      composer.setPixelRatio(pixelRatio)
      composer.setSize(width, height)
      bloomPass.resolution.set(width, height)
      dofPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio)
    },
    setQuality(tier: RenderQualityTier): void {
      applyTierSettings(tier)
    },
    setFocusY(y: number): void {
      dofPass.uniforms.uFocusY.value = THREE.MathUtils.clamp(y, 0.2, 0.8)
    },
    dispose(): void {
      bloomPass.dispose()
      dofPass.dispose()
      composer.renderTarget1.dispose()
      composer.renderTarget2.dispose()
    },
  }
}
