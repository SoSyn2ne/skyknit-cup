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
  readonly instancedMeshCount: number
}

export interface WorldVisual {
  update(simulationSeconds: number): void
  setQuality(quality: RenderQualityBudget): void
  debugSnapshot(): WorldDebugSnapshot
}

const CLOUD_COUNT = 48
const DECORATED_ISLAND_COUNT = 12
const HIGH_WISP_COUNT = 16
const HIGH_CLOUD_DECK_COUNT = 8

function createSkyDome(palette: WorldPalette): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenithColor: { value: new THREE.Color(palette.skyZenith) },
      hazeColor: { value: new THREE.Color(palette.skyHaze) },
      cloudColor: { value: new THREE.Color(palette.cloud) },
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
      varying vec3 vDirection;
      void main() {
        float height = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 lower = mix(cloudColor, hazeColor, smoothstep(0.0, 0.42, height));
        vec3 color = mix(lower, zenithColor, smoothstep(0.38, 1.0, height));
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
  const rockGeometry = new THREE.ConeGeometry(1, 3, 9, 3)
  rockGeometry.rotateZ(Math.PI)
  const topGeometry = new THREE.CylinderGeometry(0.8, 1, 0.22, 9, 2)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: palette.rock,
    roughness: 0.92,
    flatShading: true,
  })
  const topMaterial = new THREE.MeshStandardMaterial({
    color: palette.gateRune,
    roughness: 0.88,
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

  for (const [index, island] of WORLD_ISLANDS.entries()) {
    position.set(
      island.center.x,
      island.center.y - island.height * 0.36,
      island.center.z,
    )
    const widthVariation = 0.64 + (index % 4) * 0.045
    const depthVariation = 0.61 + ((index * 3) % 5) * 0.035
    rotation.set(0, index * 2.3999632297, 0)
    quaternion.setFromEuler(rotation)
    scale.set(
      island.radius * widthVariation,
      (island.height / 3) * 0.72,
      island.radius * depthVariation,
    )
    matrix.compose(position, quaternion, scale)
    rockInstances.setMatrixAt(index, matrix)

    position.set(island.center.x, island.center.y + 0.8, island.center.z)
    scale.set(
      island.radius * (widthVariation + 0.03),
      0.8,
      island.radius * (depthVariation + 0.03),
    )
    matrix.compose(position, quaternion, scale)
    topInstances.setMatrixAt(index, matrix)
  }

  rockInstances.instanceMatrix.needsUpdate = true
  topInstances.instanceMatrix.needsUpdate = true
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
    new THREE.CylinderGeometry(0.38, 0.52, 3.8, 6),
    stoneMaterial,
    decoratedIslands.length * 2,
  )
  const lintels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.3, 0.46, 0.62),
    stoneMaterial,
    decoratedIslands.length,
  )
  const flags = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.4, 1.25, 2, 1),
    flagMaterial,
    decoratedIslands.length,
  )
  const runes = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.72, 0),
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
    const offsetX = Math.cos(angle) * island.radius * 0.18
    const offsetZ = Math.sin(angle) * island.radius * 0.18
    rotation.set(0, -angle, 0)
    quaternion.setFromEuler(rotation)
    for (const side of [-1, 1] as const) {
      position.set(
        island.center.x + offsetX + Math.cos(angle) * side * 1.5,
        island.center.y + 2.7,
        island.center.z + offsetZ + Math.sin(angle) * side * 1.5,
      )
      matrix.compose(position, quaternion, scale)
      pillars.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix)
    }

    position.set(
      island.center.x + offsetX,
      island.center.y + 4.7,
      island.center.z + offsetZ,
    )
    matrix.compose(position, quaternion, scale)
    lintels.setMatrixAt(index, matrix)

    position.set(
      island.center.x + offsetX,
      island.center.y + 5.7,
      island.center.z + offsetZ,
    )
    rotation.set(0, -angle, Math.sin(index * 1.7) * 0.08)
    quaternion.setFromEuler(rotation)
    matrix.compose(position, quaternion, scale)
    flags.setMatrixAt(index, matrix)

    position.set(
      island.center.x - offsetX * 0.5,
      island.center.y + 1.7,
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
    28,
    68,
    155,
    0.11,
    1.9,
  )
  const cloudDeck = createCloudAccentLayer(
    palette,
    'M7_LowerCloudDeck',
    20,
    -42,
    105,
    0.15,
    1.45,
  )
  clouds.count = Math.min(quality.cloudCount, CLOUD_COUNT)
  cloudWisps.count = quality.tier === 'high' ? HIGH_WISP_COUNT : 12
  cloudDeck.count = quality.tier === 'high' ? HIGH_CLOUD_DECK_COUNT : 0
  const hemisphere = new THREE.HemisphereLight(
    palette.skyHaze,
    palette.rock,
    2.15,
  )
  const sun = new THREE.DirectionalLight(palette.cloud, 3.25)
  sun.position.set(-18, 26, 14)
  const sunDisk = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      color: palette.wingGold,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  sunDisk.position.set(-180, 150, -440)
  sunDisk.scale.set(72, 72, 1)
  sunDisk.name = 'M3_DawnSun'
  scene.add(
    skyDome,
    islands,
    islandDecorations,
    clouds,
    cloudWisps,
    cloudDeck,
    hemisphere,
    sun,
    sunDisk,
  )

  return {
    update: (simulationSeconds) => {
      skyDome.position.copy(camera.position)
      clouds.rotation.y = Math.sin(simulationSeconds * 0.025) * 0.012
      cloudWisps.rotation.y = Math.sin(simulationSeconds * 0.018) * -0.008
      cloudDeck.rotation.y = Math.sin(simulationSeconds * 0.014) * 0.006
      sunDisk.quaternion.copy(camera.quaternion)
    },
    setQuality: (nextQuality) => {
      clouds.count = Math.min(nextQuality.cloudCount, CLOUD_COUNT)
      cloudWisps.count = nextQuality.tier === 'high' ? HIGH_WISP_COUNT : 12
      cloudDeck.count = nextQuality.tier === 'high' ? HIGH_CLOUD_DECK_COUNT : 0
    },
    debugSnapshot: () => ({
      islandCount: WORLD_ISLANDS.length,
      cloudCount: clouds.count,
      instancedMeshCount: 9,
    }),
  }
}
