import * as THREE from 'three'

import {
  COIN_COURSES,
  type CoinVisualKind,
  type SkyCoinDefinition,
} from '../collectibles/coinCourses'

export interface CoinCourseVisualSnapshot {
  readonly totalCount: number
  readonly visibleCount: number
  readonly activeCoinId: string | null
  readonly visualKind: CoinVisualKind | null
  readonly drawCalls: number
}

export interface CoinCourseVisual {
  update(
    activeCoin: SkyCoinDefinition | null,
    simulationSeconds: number,
  ): void
  debugSnapshot(): CoinCourseVisualSnapshot
  dispose(): void
}

const ALL_COINS = COIN_COURSES.flatMap((course) => course.coins)
const VISUAL_KIND_BY_COIN_ID = new Map(
  COIN_COURSES.flatMap((course) =>
    course.coins.map(
      (coin) => [coin.id, course.visualKind] as const,
    ),
  ),
)
const HIDDEN_SCALE = new THREE.Vector3(0, 0, 0)
const SKY_COIN_SCALE = new THREE.Vector3(1, 1, 1)
const COOLING_CRYSTAL_SCALE = new THREE.Vector3(0.82, 1.35, 0.82)

function createPooledMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, 1)
  mesh.name = name
  mesh.renderOrder = 20
  mesh.frustumCulled = false
  mesh.visible = false
  return mesh
}

export function createCoinCourseVisual(scene: THREE.Scene): CoinCourseVisual {
  const skyCoinGeometry = new THREE.CylinderGeometry(
    2.25,
    2.25,
    0.58,
    24,
  )
  skyCoinGeometry.rotateX(Math.PI / 2)
  const skyCoinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd96a,
    emissive: 0xffa51f,
    emissiveIntensity: 0.58,
    metalness: 0.55,
    roughness: 0.32,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  })
  const coolingCrystalGeometry = new THREE.OctahedronGeometry(2.45, 0)
  const coolingCrystalMaterial = new THREE.MeshStandardMaterial({
    color: 0x7defff,
    emissive: 0x16cfe8,
    emissiveIntensity: 0.92,
    metalness: 0.12,
    roughness: 0.2,
    flatShading: true,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  })
  const skyCoinMesh = createPooledMesh(
    'RC6_SkyCoins',
    skyCoinGeometry,
    skyCoinMaterial,
  )
  const coolingCrystalMesh = createPooledMesh(
    'M39_CoolingCrystals',
    coolingCrystalGeometry,
    coolingCrystalMaterial,
  )
  scene.add(skyCoinMesh, coolingCrystalMesh)

  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const euler = new THREE.Euler()
  let snapshot: CoinCourseVisualSnapshot = {
    totalCount: ALL_COINS.length,
    visibleCount: 0,
    activeCoinId: null,
    visualKind: null,
    drawCalls: 0,
  }

  return {
    update: (activeCoin, simulationSeconds) => {
      skyCoinMesh.visible = false
      coolingCrystalMesh.visible = false

      position.set(0, 0, 0)
      rotation.identity()
      matrix.compose(position, rotation, HIDDEN_SCALE)
      skyCoinMesh.setMatrixAt(0, matrix)
      coolingCrystalMesh.setMatrixAt(0, matrix)

      const visualKind =
        activeCoin === null
          ? null
          : (VISUAL_KIND_BY_COIN_ID.get(activeCoin.id) ?? 'sky-coin')

      if (activeCoin !== null && visualKind !== null) {
        position.set(
          activeCoin.position.x,
          activeCoin.position.y +
            Math.sin(simulationSeconds * 2.4 + activeCoin.index) * 0.38,
          activeCoin.position.z,
        )
        const activeMesh =
          visualKind === 'cooling-crystal'
            ? coolingCrystalMesh
            : skyCoinMesh

        if (visualKind === 'cooling-crystal') {
          euler.set(
            Math.sin(simulationSeconds * 0.9 + activeCoin.index) * 0.12,
            simulationSeconds * 1.15 + activeCoin.index * 0.37,
            Math.cos(simulationSeconds * 0.75 + activeCoin.index) * 0.1,
          )
          rotation.setFromEuler(euler)
          scale.copy(COOLING_CRYSTAL_SCALE)
        } else {
          euler.set(
            0,
            Math.sin(
              simulationSeconds * 1.35 + activeCoin.index * 0.22,
            ) * 0.42,
            0,
          )
          rotation.setFromEuler(euler)
          scale.copy(SKY_COIN_SCALE)
        }
        matrix.compose(position, rotation, scale)
        activeMesh.setMatrixAt(0, matrix)
        activeMesh.visible = true
      }

      skyCoinMesh.instanceMatrix.needsUpdate = true
      coolingCrystalMesh.instanceMatrix.needsUpdate = true
      snapshot = {
        totalCount: ALL_COINS.length,
        visibleCount: activeCoin === null ? 0 : 1,
        activeCoinId: activeCoin?.id ?? null,
        visualKind,
        drawCalls: activeCoin === null ? 0 : 1,
      }
    },
    debugSnapshot: () => ({ ...snapshot }),
    dispose: () => {
      skyCoinMesh.removeFromParent()
      coolingCrystalMesh.removeFromParent()
      skyCoinGeometry.dispose()
      coolingCrystalGeometry.dispose()
      skyCoinMaterial.dispose()
      coolingCrystalMaterial.dispose()
    },
  }
}
