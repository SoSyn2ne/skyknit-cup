import * as THREE from 'three'

import {
  COIN_COURSES,
  type SkyCoinDefinition,
} from '../collectibles/coinCourses'

export interface CoinCourseVisualSnapshot {
  readonly totalCount: number
  readonly visibleCount: number
  readonly activeCoinId: string | null
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
const ACTIVE_COLOR = new THREE.Color(0xffd96a)
const HIDDEN_SCALE = new THREE.Vector3(0, 0, 0)

export function createCoinCourseVisual(scene: THREE.Scene): CoinCourseVisual {
  const geometry = new THREE.CylinderGeometry(2.25, 2.25, 0.58, 24)
  geometry.rotateX(Math.PI / 2)
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffa51f,
    emissiveIntensity: 0.58,
    metalness: 0.55,
    roughness: 0.32,
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    ALL_COINS.length,
  )
  mesh.name = 'RC6_SkyCoins'
  mesh.renderOrder = 20
  mesh.frustumCulled = false
  scene.add(mesh)

  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const euler = new THREE.Euler()
  let snapshot: CoinCourseVisualSnapshot = {
    totalCount: ALL_COINS.length,
    visibleCount: 0,
    activeCoinId: null,
    drawCalls: 0,
  }

  return {
    update: (activeCoin, simulationSeconds) => {
      let visibleCount = 0
      let activeCoinId: string | null = null

      ALL_COINS.forEach((coin, instanceIndex) => {
        const active = activeCoin !== null && coin.id === activeCoin.id

        if (active) {
          visibleCount += 1
          if (activeCoinId === null) activeCoinId = coin.id
          position.set(
            coin.position.x,
            coin.position.y + Math.sin(simulationSeconds * 2.4 + coin.index) * 0.38,
            coin.position.z,
          )
          euler.set(
            0,
            Math.sin(simulationSeconds * 1.35 + coin.index * 0.22) * 0.42,
            0,
          )
          rotation.setFromEuler(euler)
          scale.set(1, 1, 1)
          mesh.setColorAt(instanceIndex, ACTIVE_COLOR)
        } else {
          position.set(0, 0, 0)
          rotation.identity()
          scale.copy(HIDDEN_SCALE)
        }
        matrix.compose(position, rotation, scale)
        mesh.setMatrixAt(instanceIndex, matrix)
      })

      mesh.visible = visibleCount > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
      snapshot = {
        totalCount: ALL_COINS.length,
        visibleCount,
        activeCoinId,
        drawCalls: visibleCount > 0 ? 1 : 0,
      }
    },
    debugSnapshot: () => ({ ...snapshot }),
    dispose: () => {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}
