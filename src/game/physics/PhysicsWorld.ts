import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export interface BodyMeshSyncPair {
  readonly body: RAPIER.RigidBody
  readonly mesh: THREE.Object3D
  readonly offset?: THREE.Vector3
}

let rapierInitPromise: Promise<void> | null = null

export async function ensureRapierInitialized(): Promise<typeof RAPIER> {
  if (rapierInitPromise === null) {
    rapierInitPromise = RAPIER.init()
  }
  await rapierInitPromise
  return RAPIER
}

export interface PhysicsWorldConfig {
  gravity?: { x: number; y: number; z: number }
}

export class PhysicsWorld {
  public readonly rawWorld: RAPIER.World
  public readonly rapier: typeof RAPIER
  private syncPairs: BodyMeshSyncPair[] = []
  private isDisposed = false

  private constructor(rapier: typeof RAPIER, rawWorld: RAPIER.World) {
    this.rapier = rapier
    this.rawWorld = rawWorld
  }

  public static async create(config: PhysicsWorldConfig = {}): Promise<PhysicsWorld> {
    const rapier = await ensureRapierInitialized()
    const gravity = config.gravity ?? { x: 0.0, y: -16.0, z: 0.0 }
    const rawWorld = new rapier.World(gravity)
    return new PhysicsWorld(rapier, rawWorld)
  }

  public registerSync(body: RAPIER.RigidBody, mesh: THREE.Object3D, offset?: THREE.Vector3): void {
    this.syncPairs.push({ body, mesh, offset })
  }

  public unregisterSync(body: RAPIER.RigidBody): void {
    this.syncPairs = this.syncPairs.filter((pair) => pair.body !== body)
  }

  public step(_dt?: number): void {
    if (this.isDisposed) return
    this.rawWorld.step()

    for (let i = 0; i < this.syncPairs.length; i++) {
      const { body, mesh, offset } = this.syncPairs[i]
      if (body.isValid()) {
        const translation = body.translation()
        const rotation = body.rotation()

        if (offset) {
          mesh.position.set(
            translation.x + offset.x,
            translation.y + offset.y,
            translation.z + offset.z,
          )
        } else {
          mesh.position.set(translation.x, translation.y, translation.z)
        }

        mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
      }
    }
  }

  public createGround(
    halfWidth: number,
    halfDepth: number,
    y: number = 0,
    friction: number = 0.8,
  ): RAPIER.RigidBody {
    const groundBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(0, y, 0)
    const groundBody = this.rawWorld.createRigidBody(groundBodyDesc)
    const colliderDesc = this.rapier.ColliderDesc.cuboid(halfWidth, 0.5, halfDepth)
      .setFriction(friction)
      .setRestitution(0.1)
    this.rawWorld.createCollider(colliderDesc, groundBody)
    return groundBody
  }

  public createBoxProp(
    position: { x: number; y: number; z: number },
    halfExtents: { x: number; y: number; z: number },
    mass: number = 1.0,
    mesh?: THREE.Object3D,
  ): RAPIER.RigidBody {
    const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.4)
      .setAngularDamping(0.6)
    const body = this.rawWorld.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
    )
      .setDensity(mass)
      .setFriction(0.6)
      .setRestitution(0.3)
    this.rawWorld.createCollider(colliderDesc, body)

    if (mesh) {
      this.registerSync(body, mesh)
    }

    return body
  }

  public createCylinderProp(
    position: { x: number; y: number; z: number },
    radius: number,
    halfHeight: number,
    mass: number = 0.8,
    mesh?: THREE.Object3D,
  ): RAPIER.RigidBody {
    const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.3)
      .setAngularDamping(0.5)
    const body = this.rawWorld.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc.cylinder(halfHeight, radius)
      .setDensity(mass)
      .setFriction(0.35)
      .setRestitution(0.6)
    this.rawWorld.createCollider(colliderDesc, body)

    if (mesh) {
      this.registerSync(body, mesh)
    }

    return body
  }

  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.syncPairs = []
    this.rawWorld.free()
  }
}
