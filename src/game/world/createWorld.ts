import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'

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


function createColorAttr(count: number, r: number, g: number, b: number): THREE.BufferAttribute {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    arr[i * 3] = r
    arr[i * 3 + 1] = g
    arr[i * 3 + 2] = b
  }
  return new THREE.BufferAttribute(arr, 3)
}

function createSkyDome(palette: WorldPalette): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenithColor: {
        value: new THREE.Color(palette.skyZenith).offsetHSL(0.035, 0.06, 0.03),
      },
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
        vec3 direction = normalize(vDirection);
        float sunFacing = max(dot(direction, sunDirection), 0.0);
        float height = smoothstep(-0.18, 0.72, direction.y);
        vec3 horizonColor = mix(hazeColor, cloudColor, 0.24);
        vec3 lower = mix(hazeColor, cloudColor, (1.0 - smoothstep(-0.65, 0.0, direction.y)) * 0.62);
        vec3 color = mix(lower, zenithColor, height);
        float horizon = 1.0 - smoothstep(0.0, 0.23, abs(direction.y));
        color = mix(color, horizonColor, horizon * 0.26);
        float warmScatter = pow(sunFacing, 12.0);
        color = mix(color, mix(cloudColor, sunColor, 0.5), warmScatter * 0.2);
        color += sunColor * (pow(sunFacing, 40.0) * 0.09 + pow(sunFacing, 520.0) * 0.3);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
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

  // Massive sculpted mesa citadel & stepped cliff terraces (breaks the tapered spinning-top silhouette)
  const rockGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.55, -0.68), // wide grounded plateau base (sits naturally in the sea of clouds)
      new THREE.Vector2(0.66, -0.54),
      new THREE.Vector2(0.76, -0.42), // prominent lower cliff stratum
      new THREE.Vector2(0.72, -0.32), // distinct cliff overhang ledge
      new THREE.Vector2(0.88, -0.22),
      new THREE.Vector2(0.96, -0.12), // expansive mid-level terrace
      new THREE.Vector2(1.04, -0.04), // bold projecting rim cornice
      new THREE.Vector2(1.01, -0.01),
      new THREE.Vector2(0.96, 0.0),
    ],
    24,
  )
  const rockPositions = rockGeometry.getAttribute('position')
  const rockVertexColors = new Float32Array(rockPositions.count * 3)
  for (let index = 0; index < rockPositions.count; index += 1) {
    const x = rockPositions.getX(index)
    const y = rockPositions.getY(index)
    const z = rockPositions.getZ(index)
    const angle = Math.atan2(z, x)
    const normalizedHeight = (y + 0.68) / 0.68 // 0 at bottom, 1 at top
    // Multi-frequency faceted chiseled low-poly cliff carving
    const facetNoise =
      Math.sin(angle * 4 + normalizedHeight * 2.8) * 0.12 +
      Math.sin(angle * 7 - normalizedHeight * 3.5) * 0.05 +
      Math.cos(angle * 3 + y * 7.0) * 0.07
    const terrace = Math.sin(normalizedHeight * Math.PI * 3.5) * 0.04
    const irregularity = 1 + facetNoise + terrace
    const driftX = Math.sin(normalizedHeight * 5.0) * (1 - normalizedHeight) * 0.06
    const driftZ = Math.cos(normalizedHeight * 4.5) * (1 - normalizedHeight) * 0.05
    const ridgeHeight =
      (Math.sin(angle * 3 + y * 4.2) * 0.032 +
        Math.sin(angle * 6 - y * 3.0) * 0.015) *
      normalizedHeight

    rockPositions.setXYZ(
      index,
      x * irregularity + driftX,
      y + ridgeHeight,
      z * irregularity + driftZ,
    )
    // Bruno-style lighting & stratified sandstone: cool azure bedrock at bottom, warm sunlit peach/gold on upper rims
    const stratum = (Math.sin(y * 24 + Math.sin(angle * 3) * 0.8) + 1) * 0.5
    const heightFactor = Math.pow(Math.max(0, Math.min(1, normalizedHeight)), 0.72)
    const r = Math.min(1, Math.max(0, 0.52 * heightFactor + stratum * 0.14 + 0.22))
    const g = Math.min(1, Math.max(0, 0.62 * heightFactor + stratum * 0.10 + 0.24))
    const b = Math.min(1, Math.max(0, 0.72 * heightFactor + stratum * 0.06 + 0.25))
    rockVertexColors.set([r, g, b], index * 3)
  }
  rockGeometry.setAttribute('color', new THREE.BufferAttribute(rockVertexColors, 3))
  rockGeometry.computeVertexNormals()
  rockGeometry.computeBoundingSphere()

  // Build composite top geometry: grass meadow + lush trees + cute bushes + rocks + stepping stones + satellite floating rocks
  const topParts: THREE.BufferGeometry[] = []

  // 1. Meadow Ground with gentle hill crown and vibrant edge
  const groundGeom = new THREE.CylinderGeometry(0.82, 0.96, 0.46, 24, 2)
  const gPos = groundGeom.getAttribute('position')
  const gColors = new Float32Array(gPos.count * 3)
  for (let i = 0; i < gPos.count; i += 1) {
    const x = gPos.getX(i)
    const y = gPos.getY(i)
    const z = gPos.getZ(i)
    const radius = Math.hypot(x, z)
    const isTopSurface = y > 0.1
    const meadow = (Math.sin(x * 4.5 + z * 3.2) + 1) * 0.5
    const edge = Math.min(1, radius / 0.96)

    gColors[i * 3] = Math.min(1, Math.max(0, 0.52 + meadow * 0.18 + edge * 0.12))
    gColors[i * 3 + 1] = Math.min(1, Math.max(0, 0.85 - edge * 0.08 + meadow * 0.08))
    gColors[i * 3 + 2] = Math.min(1, Math.max(0, 0.42 + meadow * 0.10))

    if (radius >= 0.08) {
      const angle = Math.atan2(z, x)
      const irregularity = 1 + Math.sin(angle * 4 + 0.3) * 0.05 + Math.sin(angle * 8) * 0.02
      const crown = isTopSurface ? (1.0 - Math.pow(edge, 2)) * 0.14 : 0
      gPos.setXYZ(i, x * irregularity, y + crown, z * irregularity)
    }
  }
  groundGeom.setAttribute('color', new THREE.BufferAttribute(gColors, 3))
  topParts.push(groundGeom)

  // 2. Pine Tree Cluster A (Right rear) - scaled appropriately for island grandeur
  const pine1Trunk = new THREE.CylinderGeometry(0.014, 0.026, 5.2, 6)
  pine1Trunk.translate(0.42, 2.6, -0.35)
  pine1Trunk.setAttribute('color', createColorAttr(pine1Trunk.getAttribute('position').count, 0.45, 0.28, 0.16))
  topParts.push(pine1Trunk)

  const pine1Foliage1 = new THREE.ConeGeometry(0.14, 4.4, 7)
  pine1Foliage1.translate(0.42, 4.4, -0.35)
  pine1Foliage1.setAttribute('color', createColorAttr(pine1Foliage1.getAttribute('position').count, 0.22, 0.60, 0.28))
  topParts.push(pine1Foliage1)

  const pine1Foliage2 = new THREE.ConeGeometry(0.10, 3.4, 7)
  pine1Foliage2.translate(0.42, 6.2, -0.35)
  pine1Foliage2.setAttribute('color', createColorAttr(pine1Foliage2.getAttribute('position').count, 0.28, 0.68, 0.32))
  topParts.push(pine1Foliage2)

  // Small Pine companion
  const pine2Trunk = new THREE.CylinderGeometry(0.010, 0.018, 3.6, 6)
  pine2Trunk.translate(0.54, 1.8, -0.25)
  pine2Trunk.setAttribute('color', createColorAttr(pine2Trunk.getAttribute('position').count, 0.45, 0.28, 0.16))
  topParts.push(pine2Trunk)

  const pine2Foliage = new THREE.ConeGeometry(0.10, 3.2, 7)
  pine2Foliage.translate(0.54, 3.4, -0.25)
  pine2Foliage.setAttribute('color', createColorAttr(pine2Foliage.getAttribute('position').count, 0.24, 0.64, 0.30))
  topParts.push(pine2Foliage)

  // 3. Broadleaf Golden-Green Tree (Left front)
  const broad1Trunk = new THREE.CylinderGeometry(0.018, 0.030, 4.6, 6)
  broad1Trunk.translate(-0.46, 2.3, 0.30)
  broad1Trunk.setAttribute('color', createColorAttr(broad1Trunk.getAttribute('position').count, 0.48, 0.30, 0.18))
  topParts.push(broad1Trunk)

  const canopy1 = new THREE.DodecahedronGeometry(0.12, 0)
  canopy1.scale(1, 30, 1)
  canopy1.translate(-0.46, 4.8, 0.30)
  canopy1.setAttribute('color', createColorAttr(canopy1.getAttribute('position').count, 0.52, 0.78, 0.26))
  topParts.push(canopy1)

  const canopy2 = new THREE.DodecahedronGeometry(0.08, 0)
  canopy2.scale(1, 24, 1)
  canopy2.translate(-0.40, 5.4, 0.36)
  canopy2.setAttribute('color', createColorAttr(canopy2.getAttribute('position').count, 0.58, 0.84, 0.28))
  topParts.push(canopy2)

  // 4. Cherry/Autumn Blossom Tree (Left rear)
  const pinkTrunk = new THREE.CylinderGeometry(0.015, 0.025, 4.2, 6)
  pinkTrunk.translate(-0.38, 2.1, -0.42)
  pinkTrunk.setAttribute('color', createColorAttr(pinkTrunk.getAttribute('position').count, 0.45, 0.28, 0.16))
  topParts.push(pinkTrunk)

  const pinkCanopy = new THREE.DodecahedronGeometry(0.11, 0)
  pinkCanopy.scale(1, 28, 1)
  pinkCanopy.translate(-0.38, 4.6, -0.42)
  pinkCanopy.setAttribute('color', createColorAttr(pinkCanopy.getAttribute('position').count, 0.92, 0.58, 0.65))
  topParts.push(pinkCanopy)

  // 5. Stylized Bushes / Shrubs
  const bush1 = new THREE.DodecahedronGeometry(0.06, 0)
  bush1.scale(1, 16, 1)
  bush1.translate(0.38, 0.7, -0.22)
  bush1.setAttribute('color', createColorAttr(bush1.getAttribute('position').count, 0.30, 0.70, 0.32))
  topParts.push(bush1)

  const bush2 = new THREE.DodecahedronGeometry(0.05, 0)
  bush2.scale(1, 14, 1)
  bush2.translate(-0.35, 0.6, 0.40)
  bush2.setAttribute('color', createColorAttr(bush2.getAttribute('position').count, 0.35, 0.74, 0.30))
  topParts.push(bush2)

  // 6. Natural Boulders
  const b1 = new THREE.DodecahedronGeometry(0.06, 0)
  b1.scale(1.2, 18, 0.9)
  b1.translate(0.26, 0.7, 0.42)
  b1.setAttribute('color', createColorAttr(b1.getAttribute('position').count, 0.74, 0.72, 0.68))
  topParts.push(b1)

  const b2 = new THREE.DodecahedronGeometry(0.045, 0)
  b2.scale(1.0, 16, 1.1)
  b2.translate(-0.20, 0.6, -0.32)
  b2.setAttribute('color', createColorAttr(b2.getAttribute('position').count, 0.78, 0.75, 0.70))
  topParts.push(b2)

  // 7. Stepping stones path
  for (let s = 0; s < 4; s += 1) {
    const stone = new THREE.CylinderGeometry(0.07, 0.08, 0.05, 6)
    stone.translate(0.03 * s, 0.22, -0.20 + s * 0.16)
    stone.setAttribute('color', createColorAttr(stone.getAttribute('position').count, 0.82, 0.80, 0.75))
    topParts.push(stone)
  }

  // 8. Visual Continuity: Floating Satellite Stepping Rocks (connecting the void between islands)
  // These mini outcrops extend beyond the island perimeter towards adjacent islands
  const satelliteConfigs = [
    { x: 1.25, y: -0.12, z: 0.35, scale: 0.18, heightScale: 22, col: [0.70, 0.68, 0.64] },
    { x: 1.55, y: 0.08, z: 0.65, scale: 0.14, heightScale: 18, col: [0.74, 0.72, 0.68] },
    { x: -1.28, y: -0.18, z: -0.45, scale: 0.16, heightScale: 20, col: [0.68, 0.66, 0.62] },
    { x: -1.60, y: 0.15, z: -0.72, scale: 0.12, heightScale: 16, col: [0.76, 0.74, 0.70] },
    { x: 0.25, y: -0.22, z: 1.35, scale: 0.15, heightScale: 20, col: [0.72, 0.70, 0.66] },
  ]

  for (const sat of satelliteConfigs) {
    const satRock = new THREE.DodecahedronGeometry(sat.scale, 0)
    satRock.scale(1.1, sat.heightScale, 0.95)
    satRock.translate(sat.x, sat.y, sat.z)
    satRock.setAttribute('color', createColorAttr(satRock.getAttribute('position').count, sat.col[0], sat.col[1], sat.col[2]))
    topParts.push(satRock)

    // Tiny tuft of moss/grass on top of satellite rock
    const satGrass = new THREE.CylinderGeometry(sat.scale * 0.8, sat.scale * 0.85, 0.04, 6)
    satGrass.translate(sat.x, sat.y + 0.08, sat.z)
    satGrass.setAttribute('color', createColorAttr(satGrass.getAttribute('position').count, 0.48, 0.80, 0.36))
    topParts.push(satGrass)
  }

  // Normalize all to non-indexed
  const normalizedParts = topParts.map((p) => {
    const ni = p.index ? p.toNonIndexed() : p
    if (ni.getAttribute('uv')) ni.deleteAttribute('uv')
    return ni
  })

  const topGeometry = BufferGeometryUtils.mergeGeometries(normalizedParts, false)
  topGeometry.computeVertexNormals()
  topGeometry.computeBoundingSphere()

  const cloudColor = new THREE.Color(palette.cloud)
  const rockBaseColor = new THREE.Color(palette.rock).lerp(cloudColor, 0.28)
  const rockEmissiveColor = new THREE.Color(palette.rock).lerp(
    new THREE.Color(palette.skyHaze),
    0.32,
  )
  const topBaseColor = new THREE.Color(palette.gateRune)
    .lerp(new THREE.Color(palette.wingGold), 0.35)
    .lerp(new THREE.Color(palette.rock), 0.08)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: rockEmissiveColor,
    emissiveIntensity: 0.12,
    roughness: 0.82,
    metalness: 0.04,
    flatShading: true,
    vertexColors: true,
  })
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.02,
    flatShading: true,
    vertexColors: true,
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
      island.height * 0.46,
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

  // Classical entasis temple column with base molding and capital
  const stoneColor = new THREE.Color(palette.cloud)
    .lerp(new THREE.Color(palette.wingGold), 0.24)
    .lerp(new THREE.Color(palette.rock), 0.08)
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: stoneColor,
    roughness: 0.62,
    metalness: 0.04,
    flatShading: true,
  })
  const flagMaterial = new THREE.MeshStandardMaterial({
    color: palette.gateRune,
    roughness: 0.40,
    metalness: 0.12,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  })
  const runeMaterial = new THREE.MeshStandardMaterial({
    color: palette.gateRune,
    emissive: palette.gateRune,
    emissiveIntensity: 0.75,
    roughness: 0.20,
    metalness: 0.40,
  })

  const pillarPoints = [
    new THREE.Vector2(0.85, -2.75),
    new THREE.Vector2(0.85, -2.55),
    new THREE.Vector2(0.68, -2.45),
    new THREE.Vector2(0.55, -2.15),
    new THREE.Vector2(0.48, -1.0),
    new THREE.Vector2(0.46, 0.0),
    new THREE.Vector2(0.48, 1.0),
    new THREE.Vector2(0.55, 2.15),
    new THREE.Vector2(0.68, 2.35),
    new THREE.Vector2(0.85, 2.55),
    new THREE.Vector2(0.88, 2.75),
  ]
  const pillarGeometry = new THREE.LatheGeometry(pillarPoints, 16)
  pillarGeometry.computeBoundingBox()
  pillarGeometry.computeVertexNormals()

  const pillars = new THREE.InstancedMesh(
    pillarGeometry,
    stoneMaterial,
    decoratedIslands.length * 2,
  )

  // Architectural arch-lintel with flared cornice and arched underside
  const lintelGeometry = new THREE.BoxGeometry(5.2, 0.9, 1.2, 8, 2, 2)
  const lPos = lintelGeometry.getAttribute('position')
  for (let i = 0; i < lPos.count; i++) {
    const x = lPos.getX(i)
    const y = lPos.getY(i)
    const z = lPos.getZ(i)
    if (y > 0.3) {
      lPos.setX(i, x * 1.08)
      lPos.setZ(i, z * 1.12)
    } else if (y < -0.3) {
      const archUnder = (1 - Math.min(1, Math.abs(x) / 2.3)) * 0.25
      lPos.setY(i, y + archUnder)
    }
  }
  lintelGeometry.computeVertexNormals()
  lintelGeometry.computeBoundingBox()

  const lintels = new THREE.InstancedMesh(
    lintelGeometry,
    stoneMaterial,
    decoratedIslands.length,
  )

  // Flowing 3D fluttered festival banner
  const flagGeometry = new THREE.PlaneGeometry(3.8, 1.8, 12, 4)
  const fPos = flagGeometry.getAttribute('position')
  for (let i = 0; i < fPos.count; i++) {
    const x = fPos.getX(i)
    const y = fPos.getY(i)
    const normX = (x + 1.9) / 3.8
    const wave = Math.sin(normX * Math.PI * 2.5) * 0.28 * normX
    const taper = 1.0 - normX * 0.22
    fPos.setXYZ(i, x, y * taper, wave)
  }
  flagGeometry.computeVertexNormals()

  const flags = new THREE.InstancedMesh(
    flagGeometry,
    flagMaterial,
    decoratedIslands.length,
  )

  // Cut-gemstone floating mystic rune crystal
  const runeGeometry = new THREE.OctahedronGeometry(0.85, 1)
  const runes = new THREE.InstancedMesh(
    runeGeometry,
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

    // Variant ruins: some islands have complete portals, some have romantic fallen columns/altars
    const ruinStyle = index % 3

    if (ruinStyle === 0) {
      // Complete grand portal: twin pillars + top arch lintel + levitating rune
      for (const side of [-1, 1] as const) {
        position.set(
          island.center.x + offsetX + tangentX * side * 2.2,
          island.center.y + 2.75,
          island.center.z + offsetZ + tangentZ * side * 2.2,
        )
        matrix.compose(position, quaternion, scale)
        pillars.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix)
      }
      position.set(island.center.x + offsetX, island.center.y + 5.7, island.center.z + offsetZ)
      matrix.compose(position, quaternion, scale)
      lintels.setMatrixAt(index, matrix)

      position.set(island.center.x + offsetX, island.center.y + 6.9, island.center.z + offsetZ)
      rotation.set(0, -angle - Math.PI / 2, Math.sin(index * 1.7) * 0.08)
      quaternion.setFromEuler(rotation)
      matrix.compose(position, quaternion, scale)
      flags.setMatrixAt(index, matrix)

      position.set(island.center.x + offsetX, island.center.y + 3.4, island.center.z + offsetZ)
      rotation.set(0.3, angle + index * 0.5, 0.2)
      quaternion.setFromEuler(rotation)
      matrix.compose(position, quaternion, scale)
      runes.setMatrixAt(index, matrix)
    } else if (ruinStyle === 1) {
      // Fallen ruin: one tall pillar, one broken/sunken pillar, altar slab on ground
      // Pillar 1: upright
      position.set(
        island.center.x + offsetX - tangentX * 2.0,
        island.center.y + 2.75,
        island.center.z + offsetZ - tangentZ * 2.0,
      )
      matrix.compose(position, quaternion, scale)
      pillars.setMatrixAt(index * 2, matrix)

      // Pillar 2: half sunken/broken
      const pScale = new THREE.Vector3(1, 0.55, 1)
      rotation.set(0.15, -angle, 0.12)
      quaternion.setFromEuler(rotation)
      position.set(
        island.center.x + offsetX + tangentX * 2.2,
        island.center.y + 1.5,
        island.center.z + offsetZ + tangentZ * 2.2,
      )
      matrix.compose(position, quaternion, pScale)
      pillars.setMatrixAt(index * 2 + 1, matrix)

      // Lintel as ground altar stone
      rotation.set(0, -angle, 0)
      quaternion.setFromEuler(rotation)
      position.set(island.center.x + offsetX, island.center.y + 0.45, island.center.z + offsetZ)
      matrix.compose(position, quaternion, scale)
      lintels.setMatrixAt(index, matrix)

      // Banner near standing pillar
      position.set(
        island.center.x + offsetX - tangentX * 2.0,
        island.center.y + 5.5,
        island.center.z + offsetZ - tangentZ * 2.0,
      )
      rotation.set(0, -angle - Math.PI / 2, 0.1)
      quaternion.setFromEuler(rotation)
      matrix.compose(position, quaternion, scale)
      flags.setMatrixAt(index, matrix)

      // Floating crystal above the altar
      position.set(island.center.x + offsetX, island.center.y + 2.0, island.center.z + offsetZ)
      rotation.set(0.2, angle * 1.5, -0.3)
      quaternion.setFromEuler(rotation)
      matrix.compose(position, quaternion, scale)
      runes.setMatrixAt(index, matrix)
    } else {
      // Ancient shrine: pillars flanking a crystal monument
      for (const side of [-1, 1] as const) {
        const pScale = new THREE.Vector3(0.85, 0.8, 0.85)
        position.set(
          island.center.x + offsetX + tangentX * side * 2.8,
          island.center.y + 2.2,
          island.center.z + offsetZ + tangentZ * side * 2.8,
        )
        matrix.compose(position, quaternion, pScale)
        pillars.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix)
      }
      // Arch bridge slightly sunken as terrace boundary
      rotation.set(0, -angle - Math.PI / 2, 0)
      quaternion.setFromEuler(rotation)
      position.set(island.center.x + offsetX, island.center.y + 4.8, island.center.z + offsetZ)
      matrix.compose(position, quaternion, scale)
      lintels.setMatrixAt(index, matrix)

      // Pennant flying high
      position.set(
        island.center.x + offsetX + tangentX * 2.8,
        island.center.y + 5.2,
        island.center.z + offsetZ + tangentZ * 2.8,
      )
      rotation.set(0, -angle - Math.PI / 2, -0.06)
      quaternion.setFromEuler(rotation)
      matrix.compose(position, quaternion, scale)
      flags.setMatrixAt(index, matrix)

      // Floating mystic diamond in center
      position.set(island.center.x + offsetX, island.center.y + 2.8, island.center.z + offsetZ)
      rotation.set(0.4, angle, 0.1)
      quaternion.setFromEuler(rotation)
      matrix.compose(position, quaternion, scale)
      runes.setMatrixAt(index, matrix)
    }
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

function createCloudGeometry(segments: number): THREE.BufferGeometry {
  // One continuous sculpted shell avoids overlapping transparent lobes and keeps each
  // complete cloud in the existing instanced draw call.
  const geometry = new THREE.SphereGeometry(1, segments, 8)
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    // Billowy cumulus mounds with soft organic domes
    const angle = Math.atan2(z, x)
    const radius = Math.hypot(x, z)
    const billow1 = Math.sin(x * 3.8 + z * 2.6) * 0.14
    const billow2 = Math.cos(angle * 3.0 + radius * 4.2) * 0.08
    const crown = 0.92 + billow1 + billow2
    // Dome top with organic billows, softly curved underbelly (avoids planar truncation)
    positions.setXYZ(index, x * 1.2, y > 0 ? y * crown : y * 0.72, z * 1.15)
    // Bruno-style sunrise lighting: soft warm champagne cream on crests, luminous sky blue in undersides
    const sunlight = THREE.MathUtils.smoothstep(y, -0.40, 0.65)
    const r = Math.min(1, Math.max(0, 0.72 + sunlight * 0.22))
    const g = Math.min(1, Math.max(0, 0.79 + sunlight * 0.16))
    const b = Math.min(1, Math.max(0, 0.88 + sunlight * 0.08))
    colors.set([r, g, b], index * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function createClouds(palette: WorldPalette): THREE.InstancedMesh {
  const geometry = createCloudGeometry(12)
  const material = new THREE.MeshBasicMaterial({
    color: palette.cloud,
    vertexColors: true,
    transparent: true,
    opacity: 0.52,
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
    const distance = 95 + (index % 6) * 28
    position.set(
      anchor.x + Math.cos(angle) * distance,
      anchor.y + 24 + (index % 5) * 11,
      anchor.z + Math.sin(angle) * distance,
    )
    scale.set(
      15 + (index % 4) * 4.5,
      7 + (index % 3) * 2.2,
      10 + (index % 5) * 2.8,
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
  const isDeck = name === 'M7_LowerCloudDeck'
  const geometry = createCloudGeometry(isDeck ? 10 : 8)
  const material = new THREE.MeshBasicMaterial({
    color: palette.cloud,
    vertexColors: true,
    transparent: true,
    opacity: isDeck ? 0.84 : opacity,
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
    if (isDeck) {
      // Endless Sea of Clouds Floor: vast continuous rolling cloud carpet underlying the entire archipelago
      const anchor = anchors[(index * 3) % anchors.length] ?? START_ANCHOR.position
      const angle = index * 1.884955592
      const distance = 60 + (index % 5) * 45
      position.set(
        anchor.x * 0.85 + Math.cos(angle) * distance,
        -56 + (index % 4) * 2.5,
        anchor.z * 0.85 + Math.sin(angle) * distance,
      )
      scale.set(
        (48 + (index % 4) * 16) * horizontalStretch,
        14 + (index % 3) * 4,
        (44 + (index % 5) * 15) * horizontalStretch,
      )
    } else {
      // High wisps
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
        2.4 + (index % 3) * 0.9,
        5 + (index % 5) * 1.8,
      )
    }
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
    0.2,
    1.9,
  )
  const cloudDeck = createCloudAccentLayer(
    palette,
    'M7_LowerCloudDeck',
    CLOUD_DECK_CAPACITY,
    -42,
    105,
    0.3,
    1.45,
  )
  const hemisphereGroundColor = new THREE.Color(palette.rock).lerp(
    new THREE.Color(palette.skyHaze),
    0.4,
  )
  const hemisphere = new THREE.HemisphereLight(
    palette.skyHaze,
    hemisphereGroundColor,
    1.32,
  )
  hemisphere.name = 'RC7_DawnFillLight'
  const sunColor = new THREE.Color(palette.wingGold).lerp(
    new THREE.Color(0xfff1d2),
    0.58,
  )
  const sun = new THREE.DirectionalLight(sunColor, 4.15)
  sun.name = 'RC7_DawnKeyLight'
  const sunTarget = new THREE.Object3D()
  sunTarget.name = 'RC7_DawnKeyTarget'
  sun.target = sunTarget
  const rimColor = new THREE.Color(palette.skyZenith).lerp(
    new THREE.Color(palette.cloud),
    0.38,
  )
  const rim = new THREE.DirectionalLight(rimColor, 0.96)
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
  const fogColor = new THREE.Color(palette.skyHaze).lerp(sunColor, 0.075)
  const fog = new THREE.FogExp2(fogColor, 0.00075)
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
    fog.density = nextQuality.tier === 'high' ? 0.00075 : 0.00065
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
