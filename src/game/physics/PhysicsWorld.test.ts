import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import { PhysicsWorld } from './PhysicsWorld'

describe('PhysicsWorld', () => {
  let world: PhysicsWorld | null = null

  afterEach(() => {
    if (world) {
      world.dispose()
      world = null
    }
  })

  it('initializes Rapier and creates physics world', async () => {
    world = await PhysicsWorld.create()
    expect(world).toBeDefined()
    expect(world.rawWorld).toBeDefined()
  })

  it('creates ground and dynamic box prop with sync', async () => {
    world = await PhysicsWorld.create()
    world.createGround(50, 50, 0)

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    )
    mesh.position.set(0, 10, 0)

    const body = world.createBoxProp(
      { x: 0, y: 10, z: 0 },
      { x: 0.5, y: 0.5, z: 0.5 },
      1.0,
      mesh,
    )

    expect(body.translation().y).toBeCloseTo(10, 1)

    // Step physics several times to let the box fall
    for (let i = 0; i < 30; i++) {
      world.step()
    }

    // Box should have fallen towards ground (y < 10)
    expect(body.translation().y).toBeLessThan(10)
    expect(mesh.position.y).toBeCloseTo(body.translation().y, 1)
  })
})
