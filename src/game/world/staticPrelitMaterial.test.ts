import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createStaticPrelitMaterial, getStaticWorldLighting, type StaticWorldLighting } from './staticPrelitMaterial'

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0]

function lightingFixture(): { scene: THREE.Scene; lighting: StaticWorldLighting } {
  const scene = new THREE.Scene()
  const hemisphere = new THREE.HemisphereLight()
  hemisphere.name = 'RC7_DawnFillLight'
  hemisphere.color.setRGB(0.2, 0.4, 0.6)
  hemisphere.groundColor.setRGB(0.6, 0.4, 0.2)
  hemisphere.intensity = Math.PI
  const key = new THREE.DirectionalLight()
  key.name = 'RC7_DawnKeyLight'
  key.color.setRGB(1, 0.5, 0.25)
  key.intensity = Math.PI
  key.position.set(0, 10, 0)
  const rim = new THREE.DirectionalLight()
  rim.name = 'RC7_SkyRimLight'
  rim.color.setRGB(0.4, 0.8, 0.2)
  rim.intensity = Math.PI
  rim.position.set(0, -10, 0)
  scene.add(hemisphere, key, key.target, rim, rim.target)
  scene.updateMatrixWorld(true)
  return { scene, lighting: { hemisphere, key, rim } }
}

function compile(material: THREE.Material): Shader {
  const shader = {
    vertexShader: THREE.ShaderLib.basic.vertexShader,
    fragmentShader: THREE.ShaderLib.basic.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),
  } as Shader
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  return shader
}

function update(material: THREE.Material, scene: THREE.Scene, geometry = new THREE.BoxGeometry()): void {
  material.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.PerspectiveCamera(), geometry, new THREE.Mesh(), new THREE.Group())
}

function outputRenderer(overrides: Partial<THREE.WebGLRenderer> = {}): THREE.WebGLRenderer {
  return { toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25,
    outputColorSpace: THREE.SRGBColorSpace, getRenderTarget: () => null, ...overrides } as THREE.WebGLRenderer
}

function renderOutput(material: THREE.Material, scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  material.onBeforeRender(renderer, scene, new THREE.PerspectiveCamera(), new THREE.BufferGeometry(), new THREE.Mesh(), new THREE.Group())
}

describe('static vertex-lit material', () => {
  it('routes supported ACES/sRGB output through both vertex colors without changing alpha or the source', () => {
    const { scene, lighting } = lightingFixture()
    const source = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, opacity: 0.45, alphaTest: 0.2 })
    const sourceJson = source.toJSON()
    const material = createStaticPrelitMaterial(source, lighting)
    const shader = compile(material)
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(false)
    renderOutput(material, scene, outputRenderer())
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(true)
    expect(shader.vertexShader).toContain('#include <tonemapping_pars_fragment>')
    expect(shader.vertexShader).toContain('#include <colorspace_pars_fragment>')
    expect(shader.vertexShader).toContain('if ( uStaticVertexOutput )')
    expect(shader.vertexShader).toContain('sRGBTransferOETF( vec4( ACESFilmicToneMapping( vStaticBackColor ), 1.0 ) ).rgb')
    expect(shader.vertexShader).toContain('vColor.rgb = sRGBTransferOETF( vec4( ACESFilmicToneMapping( vColor.rgb ), 1.0 ) ).rgb')
    expect(shader.vertexShader).not.toContain('vColor.a =')
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vColor.a')
    expect(shader.fragmentShader).toContain('if ( !uStaticVertexOutput ) {\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}')
    const outputEnd = shader.fragmentShader.indexOf('#include <colorspace_fragment>\n}')
    const fog = shader.fragmentShader.indexOf('#include <fog_fragment>')
    const premultiplied = shader.fragmentShader.indexOf('#include <premultiplied_alpha_fragment>')
    const dithering = shader.fragmentShader.indexOf('#include <dithering_fragment>')
    expect(outputEnd).toBeLessThan(fog)
    expect(fog).toBeLessThan(premultiplied)
    expect(premultiplied).toBeLessThan(dithering)
    expect(material.opacity).toBe(0.45)
    expect(material.alphaTest).toBe(0.2)
    expect(source.toJSON()).toEqual(sourceJson)
  })

  it.each([
    { toneMapping: THREE.NoToneMapping }, { toneMapping: THREE.ReinhardToneMapping },
    { outputColorSpace: THREE.LinearSRGBColorSpace }, { outputColorSpace: 'display-p3' },
    { getRenderTarget: () => new THREE.WebGLRenderTarget() },
    { getRenderTarget: () => Object.assign(new THREE.WebGLRenderTarget(), { isXRRenderTarget: true }) },
  ])('retains fragment output transforms for unsupported renderer configuration %#', overrides => {
    const { scene, lighting } = lightingFixture()
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }), lighting)
    const shader = compile(material)
    renderOutput(material, scene, outputRenderer())
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(true)
    renderOutput(material, scene, outputRenderer(overrides))
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(false)
    expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>')
    expect(shader.fragmentShader).toContain('#include <colorspace_fragment>')
    renderOutput(material, scene, outputRenderer())
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(true)
  })

  it('keeps toneMapped false and disabled color management on the fragment fallback', () => {
    const { scene, lighting } = lightingFixture()
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, toneMapped: false }), lighting)
    const shader = compile(material)
    renderOutput(material, scene, outputRenderer())
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(false)
    material.toneMapped = true
    const enabled = THREE.ColorManagement.enabled
    try {
      THREE.ColorManagement.enabled = false
      renderOutput(material, scene, outputRenderer())
      expect(shader.uniforms.uStaticVertexOutput?.value).toBe(false)
    } finally { THREE.ColorManagement.enabled = enabled }
  })

  it('reuses renderer-owned exposure instead of uploading a stale material uniform', () => {
    const { scene, lighting } = lightingFixture()
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }), lighting)
    const shader = compile(material), renderer = outputRenderer()
    renderOutput(material, scene, renderer)
    renderer.toneMappingExposure = 2.4
    renderOutput(material, scene, renderer)
    expect(shader.uniforms.uStaticVertexOutput?.value).toBe(true)
    expect(shader.uniforms.toneMappingExposure).toBeUndefined()
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toContain('uniform float toneMappingExposure;')
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toContain('color *= toneMappingExposure / 0.6;')
    expect(shader.vertexShader).toContain('#include <tonemapping_pars_fragment>')
    expect(shader.vertexShader).not.toContain('1.25')
    expect(shader.vertexShader).not.toContain('2.4')
  })

  it('separates prototype/working-space program caches while reusing safe output switches', () => {
    const { scene, lighting } = lightingFixture()
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }), lighting)
    const first = compile(material), key = material.customProgramCacheKey()
    const working = THREE.ColorManagement.workingColorSpace, version = material.version
    expect(key).not.toBe('m46-static-prelit-v1')
    renderOutput(material, scene, outputRenderer())
    expect(material.customProgramCacheKey()).toBe(key)
    expect(material.version).toBe(version)
    try {
      THREE.ColorManagement.workingColorSpace = THREE.SRGBColorSpace
      renderOutput(material, scene, outputRenderer())
      expect(first.uniforms.uStaticVertexOutput?.value).toBe(false)
      expect(material.customProgramCacheKey()).not.toBe(key)
      expect(material.version).toBe(version + 1)
      expect(compile(material).uniforms.uStaticVertexOutput).toBe(first.uniforms.uStaticVertexOutput)
    } finally { THREE.ColorManagement.workingColorSpace = working }
    renderOutput(material, scene, outputRenderer())
    expect(material.customProgramCacheKey()).toBe(key)
    expect(first.uniforms.uStaticVertexOutput?.value).toBe(true)
    expect(material.version).toBe(version + 2)
  })

  it('finds the exact named world-light rig and rejects missing or wrong light types', () => {
    const { scene, lighting } = lightingFixture()
    expect(getStaticWorldLighting(scene)).toEqual(lighting)
    scene.remove(lighting.rim)
    expect(getStaticWorldLighting(scene)).toBeNull()
    const impostor = new THREE.PointLight()
    impostor.name = 'RC7_SkyRimLight'
    scene.add(impostor)
    expect(getStaticWorldLighting(scene)).toBeNull()
  })

  it.each([
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true }),
    new THREE.MeshPhysicalMaterial({ vertexColors: true }),
    new THREE.MeshStandardMaterial({ vertexColors: true, map: new THREE.Texture() }),
    new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: new THREE.Texture() }),
    new THREE.MeshStandardMaterial({ vertexColors: true, emissiveMap: new THREE.Texture() }),
    new THREE.MeshStandardMaterial({ vertexColors: true, aoMap: new THREE.Texture() }),
  ])('passes unsupported material through without mutation or disposal (%#)', source => {
    const dispose = vi.spyOn(source, 'dispose')
    const version = source.version
    expect(createStaticPrelitMaterial(source, lightingFixture().lighting)).toBe(source)
    expect(source.version).toBe(version)
    expect(dispose).not.toHaveBeenCalled()
  })

  it.each([THREE.FrontSide, THREE.BackSide, THREE.DoubleSide])('preserves source color, side %s and opaque render state', side => {
    const source = new THREE.MeshStandardMaterial({
      name: 'M_TestStone', color: 0x839f51, emissive: 0x224466,
      emissiveIntensity: 0.35, vertexColors: true, side, opacity: 0.8,
      fog: false, depthWrite: false, depthTest: false,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 3,
      alphaTest: 0.15, toneMapped: false,
    })
    source.userData = { materialRole: 'static-stone' }
    const sourceJson = source.toJSON()
    const disposeSource = vi.spyOn(source, 'dispose')
    const material = createStaticPrelitMaterial(source, lightingFixture().lighting)
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(material).not.toBe(source)
    const basic = material as THREE.MeshBasicMaterial
    expect(basic.color).not.toBe(source.color)
    expect(basic.color.equals(source.color)).toBe(true)
    expect(basic.side).toBe(side)
    expect(basic.vertexColors).toBe(true)
    expect(basic.opacity).toBe(0.8)
    expect(basic.fog).toBe(false)
    expect(basic.depthWrite).toBe(false)
    expect(basic.depthTest).toBe(false)
    expect(basic.polygonOffset).toBe(true)
    expect(basic.polygonOffsetFactor).toBe(2)
    expect(basic.polygonOffsetUnits).toBe(3)
    expect(basic.alphaTest).toBe(0.15)
    expect(basic.toneMapped).toBe(false)
    expect(basic.userData).toEqual(source.userData)
    const shader = compile(basic)
    expect(shader.uniforms.uStaticBaseColor.value).toBe(basic.color)
    const expectedEmission = source.emissive.clone().multiplyScalar(source.emissiveIntensity)
    expect((shader.uniforms.uStaticEmission.value as THREE.Color).equals(expectedEmission)).toBe(true)
    source.emissive.setRGB(1, 0, 0)
    expect((shader.uniforms.uStaticEmission.value as THREE.Color).equals(expectedEmission)).toBe(true)
    source.emissive.setHex(0x224466)
    basic.dispose()
    expect(disposeSource).not.toHaveBeenCalled()
    expect(source.toJSON()).toEqual(sourceJson)
  })

  it('does not replace an existing custom shader or touch a rejected source texture', () => {
    const { lighting } = lightingFixture()
    const custom = new THREE.MeshStandardMaterial({ vertexColors: true })
    const customCompile = vi.fn()
    custom.onBeforeCompile = customCompile
    expect(createStaticPrelitMaterial(custom, lighting)).toBe(custom)
    expect(custom.onBeforeCompile).toBe(customCompile)
    expect(customCompile).not.toHaveBeenCalled()
    const texture = new THREE.Texture()
    const textureDispose = vi.spyOn(texture, 'dispose')
    const version = texture.version
    const mapped = new THREE.MeshStandardMaterial({ vertexColors: true, envMap: texture })
    expect(createStaticPrelitMaterial(mapped, lighting)).toBe(mapped)
    expect(mapped.envMap).toBe(texture)
    expect(texture.version).toBe(version)
    expect(textureDispose).not.toHaveBeenCalled()
  })

  it('keeps lighting in the vertex shader and preserves RGBA alpha and Basic output transforms', () => {
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }), lightingFixture().lighting)
    const shader = compile(material)
    expect(shader.vertexShader).toContain('normalize( transformedNormal )')
    expect(shader.vertexShader).toContain('viewMatrix * vec4( uStaticKeyDirection, 0.0 )')
    expect(shader.vertexShader).toContain('irradiance * RECIPROCAL_PI')
    expect(shader.vertexShader).toContain('vColor.rgb = staticSurfaceColor * staticDiffuse( staticNormal ) + uStaticEmission')
    expect(shader.vertexShader).toContain('vStaticBackColor = staticSurfaceColor * staticDiffuse( -staticNormal ) + uStaticEmission')
    expect(shader.vertexShader).toContain('#include <defaultnormal_vertex>')
    expect(shader.vertexShader).not.toContain('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )')
    expect(shader.fragmentShader).toContain('vec4 diffuseColor = vec4( vec3( 1.0 ), opacity )')
    expect(shader.fragmentShader).toContain('gl_FrontFacing')
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vColor.a')
    expect(shader.fragmentShader).not.toContain('staticDiffuse(')
    expect(shader.fragmentShader).not.toContain('dot(')
    expect(shader.fragmentShader).not.toContain('uStaticKeyColor')
    expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>')
    expect(shader.fragmentShader).toContain('#include <colorspace_fragment>')
    expect(shader.fragmentShader).toContain('#include <fog_fragment>')
    expect(material.customProgramCacheKey()).not.toBe(new THREE.MeshBasicMaterial().customProgramCacheKey())
  })

  it('fails explicitly if the upstream Basic shader contract changes', () => {
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }), lightingFixture().lighting)
    const shader = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}', uniforms: {} } as Shader
    expect(() => material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)).toThrow('Three meshbasic shader contract')
    expect(shader.uniforms).toEqual({})
    expect(shader.vertexShader).toBe('void main() {}')
  })

  it('updates the same uniform objects with world-space directions, intensity and visible rim state', () => {
    const { scene, lighting } = lightingFixture()
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }), lighting)
    const shader = compile(material)
    const values = Object.fromEntries(Object.entries(shader.uniforms).filter(([name]) => name.startsWith('uStatic')).map(([name, uniform]) => [name, uniform.value]))
    expect((values.uStaticKeyDirection as THREE.Vector3).toArray()).toEqual([0, 1, 0])
    expect((values.uStaticRimDirection as THREE.Vector3).toArray()).toEqual([0, -1, 0])
    lighting.key.position.set(10, 0, 0)
    lighting.key.intensity = 2
    lighting.rim.visible = false
    scene.updateMatrixWorld(true)
    const geometry = new THREE.BoxGeometry()
    const positions = geometry.getAttribute('position').array.slice()
    update(material, scene, geometry)
    expect((values.uStaticKeyDirection as THREE.Vector3).toArray()).toEqual([1, 0, 0])
    expect((values.uStaticKeyColor as THREE.Color).toArray()).toEqual([2, 1, 0.5])
    expect((values.uStaticRimColor as THREE.Color).toArray()).toEqual([0, 0, 0])
    expect(geometry.getAttribute('position').array).toEqual(positions)
    lighting.rim.visible = true
    lighting.hemisphere.visible = false
    update(material, scene)
    expect((values.uStaticRimColor as THREE.Color).toArray()).toEqual(lighting.rim.color.clone().multiplyScalar(Math.PI).toArray())
    expect((values.uStaticSkyColor as THREE.Color).toArray()).toEqual([0, 0, 0])
    expect((values.uStaticGroundColor as THREE.Color).toArray()).toEqual([0, 0, 0])
    for (const [name, value] of Object.entries(values)) expect(shader.uniforms[name].value).toBe(value)
  })

  it('avoids zero-direction NaNs and shares existing uniform objects across shader variants', () => {
    const { scene, lighting } = lightingFixture()
    lighting.hemisphere.position.set(0, 0, 0)
    lighting.key.position.copy(lighting.key.target.position)
    lighting.rim.position.copy(lighting.rim.target.position)
    lighting.rim.visible = false
    scene.updateMatrixWorld(true)
    const material = createStaticPrelitMaterial(new THREE.MeshStandardMaterial({ vertexColors: true }), lighting)
    const first = compile(material)
    const second = compile(material)
    for (const name of ['uStaticHemisphereDirection', 'uStaticKeyDirection', 'uStaticRimDirection']) {
      expect((first.uniforms[name].value as THREE.Vector3).toArray()).toEqual([0, 1, 0])
      expect(first.uniforms[name]).toBe(second.uniforms[name])
    }
    ;(material as THREE.MeshBasicMaterial).color.setRGB(0.25, 0.5, 0.75)
    update(material, scene)
    expect((first.uniforms.uStaticBaseColor.value as THREE.Color).toArray()).toEqual([0.25, 0.5, 0.75])
  })

  it('provides the numeric Lambert irradiance fixture without an sRGB or double-color multiplication', () => {
    const { lighting } = lightingFixture()
    const source = new THREE.MeshStandardMaterial({ vertexColors: true })
    source.color.setRGB(0.5, 0.2, 0.8)
    source.emissive.setRGB(0.01, 0.02, 0.03)
    source.emissiveIntensity = 2
    const shader = compile(createStaticPrelitMaterial(source, lighting))
    const color = (name: string) => (shader.uniforms[name].value as THREE.Color).clone()
    const direction = (name: string) => shader.uniforms[name].value as THREE.Vector3
    // Numeric oracle for the three fixed expressions asserted in the shader above.
    const shade = (normal: THREE.Vector3): number[] => {
      const weight = normal.dot(direction('uStaticHemisphereDirection')) * 0.5 + 0.5
      const irradiance = color('uStaticGroundColor').lerp(color('uStaticSkyColor'), weight)
        .add(color('uStaticKeyColor').multiplyScalar(Math.max(0, normal.dot(direction('uStaticKeyDirection')))))
        .add(color('uStaticRimColor').multiplyScalar(Math.max(0, normal.dot(direction('uStaticRimDirection')))))
      return color('uStaticBaseColor').multiply(new THREE.Color().setRGB(0.25, 0.5, 1))
        .multiply(irradiance.multiplyScalar(1 / Math.PI)).add(color('uStaticEmission')).toArray()
    }
    for (const [normal, expected] of [
      [new THREE.Vector3(0, 1, 0), [0.17, 0.13, 0.74]],
      [new THREE.Vector3(0, -1, 0), [0.145, 0.16, 0.38]],
      [new THREE.Vector3(1, 0, 0), [0.07, 0.08, 0.38]],
    ] as const) shade(normal).forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12))
  })
})
