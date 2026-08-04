import * as THREE from 'three'

import { SKYKNOT_COURSE, START_ANCHOR } from './course'
import { WORLD_ISLANDS } from './worldLayout'
import type { RenderQualityBudget } from '../quality/qualityPolicy'

export interface WorldPalette {
  readonly skyZenith: string
  readonly skyHaze: string
  readonly cloud: string
  readonly rock: string
  readonly gateRune: string
  readonly wingGold: string
}

export interface WorldDebugSnapshot {
  readonly islandCount: number
  readonly cloudCount: number
  readonly cloudWispCount: number
  readonly cloudDeckCount: number
  readonly instancedMeshCount: number
  readonly shadowsEnabled: boolean
  readonly shadowRadius: number
}

export interface WorldVisual {
  update(simulationSeconds: number): void
  setQuality(quality: RenderQualityBudget): void
  debugSnapshot(): WorldDebugSnapshot
}

const CLOUD_COUNT = 48
const DECORATED_ISLAND_COUNT = 12
const CLOUD_WISP_CAPACITY = 28
const CLOUD_DECK_CAPACITY = 20

function createSkyDome(palette: WorldPalette): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenithColor: { value: new THREE.Color(palette.skyZenith) },
      hazeColor: { value: new THREE.Color(palette.skyHaze) },
      cloudColor: { value: new THREE.Color(palette.cloud) },
      sunColor: { value: new THREE.Color(palette.wingGold) },
      sunDirection: {
        value: new THREE.Vector3(-0.34, 0.32, -0.88).normalize(),
      },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 hazeColor;
      uniform vec3 cloudColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vDirection;
      void main() {
        float height = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
        float sunFacing = max(dot(normalize(vDirection), sunDirection), 0.0);
        vec3 warmHaze = mix(hazeColor, sunColor, 0.16 + sunFacing * 0.18);
        vec3 lower = mix(cloudColor, warmHaze, smoothstep(0.0, 0.42, height));
        vec3 color = mix(lower, zenithColor * 0.78, smoothstep(0.38, 1.0, height));
        float horizon = 1.0 - smoothstep(0.0, 0.42, abs(vDirection.y));
        float sunGlow = pow(sunFacing, 8.0) * 0.34;
        float sunCore = pow(sunFacing, 180.0) * 1.15;
        color = mix(color, warmHaze, horizon * 0.12);
        color += sunColor * (sunGlow + sunCore + horizon * 0.025);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 20, 12),
    material,
  )
  dome.name = 'M3_DawnSkyDome'
  dome.renderOrder = -10
  return dome
}

function createIslands(palette: WorldPalette): THREE.Group {
  const group = new THREE.Group()
  group.name = 'M3_FloatingArchipelago'
  const rockGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.05, -1),
      new THREE.Vector2(0.18, -0.88),
      new THREE.Vector2(0.32, -0.73),
      new THREE.Vector2(0.28, -0.66),
      new THREE.Vector2(0.58, -0.48),
      new THREE.Vector2(0.53, -0.4),
      new THREE.Vector2(0.82, -0.2),
      new THREE.Vector2(1, -0.045),
      new THREE.Vector2(0.95, 0),
    ],
    22,
  )
  const rockPositions = rockGeometry.getAttribute('position')
  for (let index = 0; index < rockPositions.count; index += 1) {
    const x = rockPositions.getX(index)
    const y = rockPositions.getY(index)
    const z = rockPositions.getZ(index)
    const angle = Math.atan2(z, x)
    const normalizedHeight = y + 1
    const irregularity =
      1 +
      Math.sin(angle * 3 + normalizedHeight * 2.4) * 0.075 +
      Math.sin(angle * 7 - normalizedHeight * 1.3) * 0.025
    const driftX = Math.sin(normalizedHeight * 8.3) * normalizedHeight * 0.035
    const driftZ = Math.cos(normalizedHeight * 6.7) * normalizedHeight * 0.028
    const ridgeHeight =
      (Math.sin(angle * 3 + y * 5.1) * 0.032 +
        Math.sin(angle * 5 - y * 3.7) * 0.012) *
      normalizedHeight

    rockPositions.setXYZ(
      index,
      x * irregularity + driftX,
      y + ridgeHeight,
      z * irregularity + driftZ,
    )
  }
  rockGeometry.computeVertexNormals()
  rockGeometry.computeBoundingSphere()
  const topGeometry = new THREE.CylinderGeometry(0.78, 0.9, 0.32, 22, 2)
  const topPositions = topGeometry.getAttribute('position')
  for (let index = 0; index < topPositions.count; index += 1) {
    const x = topPositions.getX(index)
    const y = topPositions.getY(index)
    const z = topPositions.getZ(index)
    const radius = Math.hypot(x, z)
    if (radius < 0.1) continue
    const angle = Math.atan2(z, x)
    const irregularity =
      1 + Math.sin(angle * 3 + 0.4) * 0.06 + Math.sin(angle * 7) * 0.022

    topPositions.setXYZ(index, x * irregularity, y, z * irregularity)
  }
  topGeometry.computeVertexNormals()
  topGeometry.computeBoundingSphere()
  const cloudColor = new THREE.Color(palette.cloud)
  const rockBaseColor = new THREE.Color(palette.rock).lerp(cloudColor, 0.14)
  const rockEmissiveColor = new THREE.Color(palette.rock).lerp(
    new THREE.Color(palette.skyHaze),
    0.28,
  )
  const topBaseColor = new THREE.Color(palette.gateRune)
    .lerp(new THREE.Color(palette.wingGold), 0.14)
    .lerp(cloudColor, 0.08)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: rockEmissiveColor,
    emissiveIntensity: 0.14,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  })
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.02,
    flatShading: true,
  })
  const rockInstances = new THREE.InstancedMesh(
    rockGeometry,
    rockMaterial,
    WORLD_ISLANDS.length,
  )
  const topInstances = new THREE.InstancedMesh(
    topGeometry,
    topMaterial,
    WORLD_ISLANDS.length,
  )
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const rotation = new THREE.Euler()
  const rockColor = new THREE.Color()
  const topColor = new THREE.Color()

  for (const [index, island] of WORLD_ISLANDS.entries()) {
    position.set(
      island.center.x,
      island.center.y,
      island.center.z,
    )
    const widthVariation = 0.64 + (index % 4) * 0.045
    const depthVariation = 0.61 + ((index * 3) % 5) * 0.035
    rotation.set(0, index * 2.3999632297, 0)
    quaternion.setFromEuler(rotation)
    scale.set(
      island.radius * widthVariation,
      island.height * 0.72,
      island.radius * depthVariation,
    )
    matrix.compose(position, quaternion, scale)
    rockInstances.setMatrixAt(index, matrix)
    rockColor
      .copy(rockBaseColor)
      .offsetHSL(((index % 5) - 2) * 0.008, 0, ((index % 4) - 1.5) * 0.025)
    rockInstances.setColorAt(index, rockColor)

    position.set(island.center.x, island.center.y + 0.16, island.center.z)
    scale.set(
      island.radius * (widthVariation + 0.01),
      1,
      island.radius * (depthVariation + 0.01),
    )
    matrix.compose(position, quaternion, scale)
    topInstances.setMatrixAt(index, matrix)
    topColor
      .copy(topBaseColor)
      .offsetHSL(((index % 3) - 1) * 0.012, -0.08, ((index % 5) - 2) * 0.02)
    topInstances.setColorAt(index, topColor)
  }

  rockInstances.instanceMatrix.needsUpdate = true
  topInstances.instanceMatrix.needsUpdate = true
  if (rockInstances.instanceColor !== null) {
    rockInstances.instanceColor.needsUpdate = true
  }
  if (topInstances.instanceColor !== null) {
    topInstances.instanceColor.needsUpdate = true
  }
  rockInstances.castShadow = true
  rockInstances.receiveShadow = true
  topInstances.castShadow = true
  topInstances.receiveShadow = true
  rockInstances.name = 'M3_IslandRockInstances'
  topInstances.name = 'M3_IslandTopInstances'
  group.add(rockInstances, topInstances)
  return group
}

function createIslandDecorations(palette: WorldPalette): THREE.Group {
  const group = new THREE.Group()
  group.name = 'M7_IslandFestivalDetails'
  const decoratedIslands = WORLD_ISLANDS.slice(0, DECORATED_ISLAND_COUNT)
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: palette.cloud,
    roughness: 0.94,
    flatShading: true,
  })
  const flagMaterial = new THREE.MeshStandardMaterial({
    color: palette.gateRune,
    roughness: 0.8,
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
  })
  const runeMaterial = new THREE.MeshStandardMaterial({
    color: palette.gateRune,
    emissive: palette.gateRune,
    emissiveIntensity: 0.2,
    roughness: 0.72,
  })
  const pillars = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.74, 5.5, 7, 2),
    stoneMaterial,
    decoratedIslands.length * 2,
  )
  const lintels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(5, 0.76, 1.08, 3, 1, 1),
    stoneMaterial,
    decoratedIslands.length,
  )
  const flags = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(3.8, 1.7, 3, 1),
    flagMaterial,
    decoratedIslands.length,
  )
  const runes = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.92, 0),
    runeMaterial,
    decoratedIslands.length,
  )
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3(1, 1, 1)
  const quaternion = new THREE.Quaternion()
  const rotation = new THREE.Euler()

  for (const [index, island] of decoratedIslands.entries()) {
    const angle = index * 2.3999632297
    const offsetX = Math.cos(angle) * island.radius * 0.22
    const offsetZ = Math.sin(angle) * island.radius * 0.22
    const tangentX = -Math.sin(angle)
    const tangentZ = Math.cos(angle)
    rotation.set(0, -angle - Math.PI / 2, 0)
    quaternion.setFromEuler(rotation)
    for (const side of [-1, 1] as const) {
      position.set(
        island.center.x + offsetX + tangentX * side * 2.3,
        island.center.y + 3,
        island.center.z + offsetZ + tangentZ * side * 2.3,
      )
      matrix.compose(position, quaternion, scale)
      pillars.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix)
    }

    position.set(
      island.center.x + offsetX,
      island.center.y + 5.8,
      island.center.z + offsetZ,
    )
    matrix.compose(position, quaternion, scale)
    lintels.setMatrixAt(index, matrix)

    position.set(
      island.center.x + offsetX,
      island.center.y + 7,
      island.center.z + offsetZ,
    )
    rotation.set(
      0,
      -angle - Math.PI / 2,
      Math.sin(index * 1.7) * 0.08,
    )
    quaternion.setFromEuler(rotation)
    matrix.compose(position, quaternion, scale)
    flags.setMatrixAt(index, matrix)

    position.set(
      island.center.x - offsetX * 0.5,
      island.center.y + 1.65,
      island.center.z - offsetZ * 0.5,
    )
    rotation.set(0, angle, 0)
    quaternion.setFromEuler(rotation)
    matrix.compose(position, quaternion, scale)
    runes.setMatrixAt(index, matrix)
  }

  for (const instances of [pillars, lintels, flags, runes]) {
    instances.instanceMatrix.needsUpdate = true
  }
  pillars.castShadow = true
  pillars.receiveShadow = true
  lintels.castShadow = true
  lintels.receiveShadow = true
  runes.castShadow = true
  pillars.name = 'M7_RuinPillarInstances'
  lintels.name = 'M7_RuinLintelInstances'
  flags.name = 'M7_FestivalFlagInstances'
  runes.name = 'M7_IslandRuneInstances'
  group.add(pillars, lintels, flags, runes)
  return group
}

function createClouds(palette: WorldPalette): THREE.InstancedMesh {
  const geometry = new THREE.IcosahedronGeometry(1, 1)
  const material = new THREE.MeshBasicMaterial({
    color: palette.cloud,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })
  const clouds = new THREE.InstancedMesh(geometry, material, CLOUD_COUNT)
  const anchors = [START_ANCHOR.position, ...SKYKNOT_COURSE.map((gate) => gate.center)]
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()

  for (let index = 0; index < CLOUD_COUNT; index += 1) {
    const anchor = anchors[index % anchors.length] ?? START_ANCHOR.position
    const angle = index * 2.3999632297
    const distance = 120 + (index % 6) * 30
    position.set(
      anchor.x + Math.cos(angle) * distance,
      anchor.y + 32 + (index % 5) * 13,
      anchor.z + Math.sin(angle) * distance,
    )
    scale.set(
      7 + (index % 4) * 2.5,
      2.6 + (index % 3),
      5 + (index % 5) * 1.4,
    )
    matrix.compose(position, quaternion, scale)
    clouds.setMatrixAt(index, matrix)
  }

  clouds.instanceMatrix.needsUpdate = true
  clouds.name = 'M3_CloudInstances'
  return clouds
}

function createCloudAccentLayer(
  palette: WorldPalette,
  name: string,
  count: number,
  heightOffset: number,
  distanceBase: number,
  opacity: number,
  horizontalStretch: number,
): THREE.InstancedMesh {
  const geometry = new THREE.IcosahedronGeometry(1, 0)
  const material = new THREE.MeshBasicMaterial({
    color: palette.cloud,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const layer = new THREE.InstancedMesh(geometry, material, count)
  const anchors = [
    START_ANCHOR.position,
    ...SKYKNOT_COURSE.map((gate) => gate.center),
  ]
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()

  for (let index = 0; index < count; index += 1) {
    const anchor = anchors[(index * 5 + 2) % anchors.length] ?? START_ANCHOR.position
    const angle = index * 2.3999632297 + 0.7
    const distance = distanceBase + (index % 5) * 38
    position.set(
      anchor.x + Math.cos(angle) * distance,
      anchor.y + heightOffset + (index % 4) * 7,
      anchor.z + Math.sin(angle) * distance,
    )
    scale.set(
      (9 + (index % 4) * 3.2) * horizontalStretch,
      1.5 + (index % 3) * 0.7,
      5 + (index % 5) * 1.8,
    )
    matrix.compose(position, quaternion, scale)
    layer.setMatrixAt(index, matrix)
  }

  layer.instanceMatrix.needsUpdate = true
  layer.name = name
  return layer
}

export function createWorld(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  palette: WorldPalette,
  quality: RenderQualityBudget,
): WorldVisual {
  const skyDome = createSkyDome(palette)
  const islands = createIslands(palette)
  const islandDecorations = createIslandDecorations(palette)
  const clouds = createClouds(palette)
  const cloudWisps = createCloudAccentLayer(
    palette,
    'M7_HighCloudWisps',
    CLOUD_WISP_CAPACITY,
    68,
    155,
    0.11,
    1.9,
  )
  const cloudDeck = createCloudAccentLayer(
    palette,
    'M7_LowerCloudDeck',
    CLOUD_DECK_CAPACITY,
    -42,
    105,
    0.15,
    1.45,
  )
  const hemisphereGroundColor = new THREE.Color(palette.rock).lerp(
    new THREE.Color(palette.skyHaze),
    0.4,
  )
  const hemisphere = new THREE.HemisphereLight(
    palette.skyHaze,
    hemisphereGroundColor,
    1.75,
  )
  hemisphere.name = 'RC7_DawnFillLight'
  const sunColor = new THREE.Color(palette.wingGold).lerp(
    new THREE.Color(0xfff1d2),
    0.58,
  )
  const sun = new THREE.DirectionalLight(sunColor, 3.65)
  sun.name = 'RC7_DawnKeyLight'
  const sunTarget = new THREE.Object3D()
  sunTarget.name = 'RC7_DawnKeyTarget'
  sun.target = sunTarget
  const rimColor = new THREE.Color(palette.skyZenith).lerp(
    new THREE.Color(palette.cloud),
    0.38,
  )
  const rim = new THREE.DirectionalLight(rimColor, 0.82)
  rim.name = 'RC7_SkyRimLight'
  rim.target = sunTarget
  sun.shadow.mapSize.set(1_024, 1_024)
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.045
  // Widens the PCF Vogel disk so a 1024 map reads as a dawn shadow instead of a
  // hard cutout. The tap count is fixed at five, so a wider radius costs no
  // extra samples — only the spread of the ones already taken.
  sun.shadow.radius = 2.6
  const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera
  shadowCamera.left = -68
  shadowCamera.right = 68
  shadowCamera.top = 68
  shadowCamera.bottom = -68
  shadowCamera.near = 1
  shadowCamera.far = 190
  shadowCamera.updateProjectionMatrix()
  const sunOffset = new THREE.Vector3(-58, 82, 46)
  const rimOffset = new THREE.Vector3(52, 24, -64)
  const sunDiskOffset = new THREE.Vector3(-180, 150, -440)
  const fogColor = new THREE.Color(palette.skyHaze).lerp(sunColor, 0.1)
  const fog = new THREE.FogExp2(fogColor, 0.00115)
  scene.fog = fog
  const sunDisk = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        color: { value: sunColor.clone() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying vec2 vUv;
        void main() {
          float radius = length((vUv - 0.5) * 2.0);
          float core = 1.0 - smoothstep(0.0, 0.5, radius);
          float edge = 1.0 - smoothstep(0.52, 1.0, radius);
          float alpha = core * 0.26 + edge * 0.1;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
  )
  sunDisk.position.set(-180, 150, -440)
  sunDisk.scale.set(72, 72, 1)
  sunDisk.name = 'M3_DawnSun'
  sunDisk.renderOrder = -5
  scene.add(
    skyDome,
    islands,
    islandDecorations,
    clouds,
    cloudWisps,
    cloudDeck,
    hemisphere,
    sun,
    rim,
    sunTarget,
    sunDisk,
  )

  const applyQuality = (nextQuality: RenderQualityBudget): void => {
    clouds.count = Math.min(nextQuality.cloudCount, CLOUD_COUNT)
    cloudWisps.count = Math.min(
      nextQuality.cloudWispCount,
      CLOUD_WISP_CAPACITY,
    )
    cloudDeck.count = Math.min(
      nextQuality.cloudDeckCount,
      CLOUD_DECK_CAPACITY,
    )
    sun.castShadow = nextQuality.shadows
    rim.visible = nextQuality.tier === 'high'
    if (nextQuality.shadowMapSize > 0) {
      sun.shadow.mapSize.set(
        nextQuality.shadowMapSize,
        nextQuality.shadowMapSize,
      )
    } else if (sun.shadow.map !== null) {
      sun.shadow.map.dispose()
      sun.shadow.map = null
    }
    fog.density = nextQuality.tier === 'high' ? 0.00115 : 0.00095
  }
  applyQuality(quality)

  return {
    update: (simulationSeconds) => {
      skyDome.position.copy(camera.position)
      clouds.rotation.y = Math.sin(simulationSeconds * 0.025) * 0.012
      cloudWisps.rotation.y = Math.sin(simulationSeconds * 0.018) * -0.008
      cloudDeck.rotation.y = Math.sin(simulationSeconds * 0.014) * 0.006
      const focusX = Math.round(camera.position.x / 4) * 4
      const focusZ = Math.round(camera.position.z / 4) * 4
      sunTarget.position.set(focusX, camera.position.y - 1.5, focusZ - 12)
      sun.position.copy(sunTarget.position).add(sunOffset)
      rim.position.copy(sunTarget.position).add(rimOffset)
      sunDisk.position.copy(camera.position).add(sunDiskOffset)
      sunDisk.quaternion.copy(camera.quaternion)
    },
    setQuality: (nextQuality) => {
      applyQuality(nextQuality)
    },
    debugSnapshot: () => ({
      islandCount: WORLD_ISLANDS.length,
      cloudCount: clouds.count,
      cloudWispCount: cloudWisps.count,
      cloudDeckCount: cloudDeck.count,
      instancedMeshCount: 9,
      shadowsEnabled: sun.castShadow,
      shadowRadius: sun.shadow.radius,
    }),
  }
}
