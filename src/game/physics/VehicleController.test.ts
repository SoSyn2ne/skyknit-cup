import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import { PhysicsWorld } from './PhysicsWorld'
import { VehicleController } from './VehicleController'

describe('VehicleController', () => {
  let world: PhysicsWorld | null = null

  afterEach(() => {
    if (world) {
      world.dispose()
      world = null
    }
  })

  it('creates vehicle and sits on ground with suspension', async () => {
    world = await PhysicsWorld.create()
    world.createGround(100, 100, 0)

    const chassisMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.7, 2.8),
      new THREE.MeshBasicMaterial(),
    )
    chassisMesh.position.set(0, 1.5, 0)

    const wheels = [
      new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2), new THREE.MeshBasicMaterial()),
    ]

    const vehicle = new VehicleController(world, chassisMesh, wheels)

    // Simulate resting on suspension
    for (let i = 0; i < 40; i++) {
      vehicle.update({ throttle: 0, steer: 0, drift: false }, 1 / 60)
      world.step()
    }

    // Vehicle should be grounded and stable above ground y = 0
    expect(vehicle.getIsGrounded()).toBe(true)
    const y = vehicle.chassisBody.translation().y
    expect(y).toBeGreaterThan(0.2)
    expect(y).toBeLessThan(1.5)
  })

  it('accelerates forward when throttle is applied', async () => {
    world = await PhysicsWorld.create()
    world.createGround(100, 100, 0)

    const chassisMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.7, 2.8),
      new THREE.MeshBasicMaterial(),
    )
    chassisMesh.position.set(0, 1.0, 0)

    const vehicle = new VehicleController(world, chassisMesh)

    // Settle first
    for (let i = 0; i < 20; i++) {
      vehicle.update({ throttle: 0, steer: 0, drift: false }, 1 / 60)
      world.step()
    }

    // Apply forward throttle
    for (let i = 0; i < 30; i++) {
      vehicle.update({ throttle: 1, steer: 0, drift: false }, 1 / 60)
      world.step()
    }

    expect(vehicle.getSpeed()).toBeGreaterThan(0)
  })
})
