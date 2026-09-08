import * as THREE from 'three'

export interface StaticWorldLighting {
  readonly hemisphere: THREE.HemisphereLight
  readonly key: THREE.DirectionalLight
  readonly rim: THREE.DirectionalLight
}

export function getStaticWorldLighting(scene: THREE.Scene): StaticWorldLighting | null {
  const hemisphere = scene.getObjectByName('RC7_DawnFillLight')
  const key = scene.getObjectByName('RC7_DawnKeyLight')
  const rim = scene.getObjectByName('RC7_SkyRimLight')
  return hemisphere instanceof THREE.HemisphereLight
    && key instanceof THREE.DirectionalLight && rim instanceof THREE.DirectionalLight
    ? { hemisphere, key, rim } : null
}

// Three r185 WebGLLights supplies linear color * intensity. Its Lambert BRDF
// multiplies both hemisphere and directional irradiance by RECIPROCAL_PI.
// Only the evaluation frequency changes here: vertex lighting, then interpolation.
const VERTEX_LIGHTING = /* glsl */`
uniform vec3 uStaticBaseColor;
uniform vec3 uStaticEmission;
uniform vec3 uStaticHemisphereDirection;
uniform vec3 uStaticSkyColor;
uniform vec3 uStaticGroundColor;
uniform vec3 uStaticKeyDirection;
uniform vec3 uStaticKeyColor;
uniform vec3 uStaticRimDirection;
uniform vec3 uStaticRimColor;
#ifdef DOUBLE_SIDED
  varying vec3 vStaticBackColor;
#endif

vec3 staticDiffuse( const in vec3 surfaceNormal ) {
  vec3 hemisphereDirection = normalize( ( viewMatrix * vec4( uStaticHemisphereDirection, 0.0 ) ).xyz );
  vec3 keyDirection = normalize( ( viewMatrix * vec4( uStaticKeyDirection, 0.0 ) ).xyz );
  vec3 rimDirection = normalize( ( viewMatrix * vec4( uStaticRimDirection, 0.0 ) ).xyz );
  float hemisphereWeight = dot( surfaceNormal, hemisphereDirection ) * 0.5 + 0.5;
  vec3 irradiance = mix( uStaticGroundColor, uStaticSkyColor, hemisphereWeight );
  irradiance += max( dot( surfaceNormal, keyDirection ), 0.0 ) * uStaticKeyColor;
  irradiance += max( dot( surfaceNormal, rimDirection ), 0.0 ) * uStaticRimColor;
  return irradiance * RECIPROCAL_PI;
}
`

const VERTEX_COLOR = /* glsl */`
vec3 staticNormal = normalize( transformedNormal );
vec3 staticSurfaceColor = vColor.rgb * uStaticBaseColor;
#ifdef DOUBLE_SIDED
  vStaticBackColor = staticSurfaceColor * staticDiffuse( -staticNormal ) + uStaticEmission;
#endif
vColor.rgb = staticSurfaceColor * staticDiffuse( staticNormal ) + uStaticEmission;
`

const FRAGMENT_COLOR = /* glsl */`
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  #ifdef DOUBLE_SIDED
    diffuseColor.rgb *= gl_FrontFacing ? vColor.rgb : vStaticBackColor;
    diffuseColor.a *= vColor.a;
  #else
    diffuseColor *= vColor;
  #endif
#endif
`

/**
 * Static, texture-free authored surfaces only. This preserves diffuse depth and
 * emissive color, not PBR specular highlights or received shadow-map detail.
 * The caller owns the returned material and retains ownership of the source.
 */
export function createStaticPrelitMaterial(source: THREE.Material, lighting: StaticWorldLighting): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)
    || source instanceof THREE.MeshPhysicalMaterial || source.transparent
    || !source.vertexColors || Object.values(source).some(value => value instanceof THREE.Texture)
    || source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return source

  const material = new THREE.MeshBasicMaterial()
  // Copy common alpha/depth/stencil/clipping state without calling the Basic
  // subclass copy method with a Standard source that lacks Basic-only fields.
  THREE.Material.prototype.copy.call(material, source)
  material.name = `${source.name || 'StaticSurface'}_StaticPrelit`
  material.color.copy(source.color)
  material.fog = source.fog
  material.wireframe = source.wireframe
  material.wireframeLinewidth = source.wireframeLinewidth

  const uniforms = {
    uStaticBaseColor: { value: material.color },
    uStaticEmission: { value: source.emissive.clone().multiplyScalar(source.emissiveIntensity) },
    uStaticHemisphereDirection: { value: new THREE.Vector3() },
    uStaticSkyColor: { value: new THREE.Color() },
    uStaticGroundColor: { value: new THREE.Color() },
    uStaticKeyDirection: { value: new THREE.Vector3() },
    uStaticKeyColor: { value: new THREE.Color() },
    uStaticRimDirection: { value: new THREE.Vector3() },
    uStaticRimColor: { value: new THREE.Color() },
  }
  const targetPosition = new THREE.Vector3()
  const normalizeDirection = (direction: THREE.Vector3): void => {
    // A hidden/unpositioned light must not inject normalize(vec3(0)) NaNs.
    if (direction.lengthSq() === 0) direction.set(0, 1, 0)
    else direction.normalize()
  }
  const updateDirectional = (light: THREE.DirectionalLight, direction: THREE.Vector3, color: THREE.Color): void => {
    direction.setFromMatrixPosition(light.matrixWorld)
    targetPosition.setFromMatrixPosition(light.target.matrixWorld)
    direction.sub(targetPosition)
    normalizeDirection(direction)
    color.copy(light.color).multiplyScalar(light.visible ? light.intensity : 0)
  }
  const updateLighting = (): void => {
    const { hemisphere, key, rim } = lighting
    const hemisphereIntensity = hemisphere.visible ? hemisphere.intensity : 0
    uniforms.uStaticHemisphereDirection.value.setFromMatrixPosition(hemisphere.matrixWorld)
    normalizeDirection(uniforms.uStaticHemisphereDirection.value)
    uniforms.uStaticSkyColor.value.copy(hemisphere.color).multiplyScalar(hemisphereIntensity)
    uniforms.uStaticGroundColor.value.copy(hemisphere.groundColor).multiplyScalar(hemisphereIntensity)
    updateDirectional(key, uniforms.uStaticKeyDirection.value, uniforms.uStaticKeyColor.value)
    updateDirectional(rim, uniforms.uStaticRimDirection.value, uniforms.uStaticRimColor.value)
  }
  updateLighting()
  // Renderer updates scene/light world matrices before this callback. Reuse the
  // same colors/vectors/uniform objects; no traversal or allocations per draw.
  material.onBeforeRender = updateLighting
  material.customProgramCacheKey = () => 'm46-static-prelit-v1'
  material.onBeforeCompile = shader => {
    const normalGuard = '#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )'
    if (!shader.vertexShader.includes(normalGuard)
      || !shader.vertexShader.includes('#include <fog_vertex>')
      || !shader.fragmentShader.includes('vec4 diffuseColor = vec4( diffuse, opacity );')) {
      throw new Error('Static prelit material requires the Three meshbasic shader contract')
    }
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', `#include <color_pars_vertex>\n${VERTEX_LIGHTING}`)
      .replace(normalGuard, '#if 1 // Static diffuse normals, including instance/skin transforms')
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX_COLOR}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\n#ifdef DOUBLE_SIDED\n varying vec3 vStaticBackColor;\n#endif')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vec3( 1.0 ), opacity );')
      .replace('#include <color_fragment>', FRAGMENT_COLOR)
  }
  return material
}
