import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PhysicsWorld } from './PhysicsWorld'

export interface VehicleInput {
  throttle: number // -1 (reverse/brake) ~ 1 (forward)
  steer: number // -1 (left) ~ 1 (right)
  drift: boolean // space / shift for drifting
  jump?: boolean // hop / boost
}

export interface VehicleConfig {
  chassisHalfExtents?: { x: number; y: number; z: number }
  mass?: number
  suspensionRestLength?: number
  suspensionStiffness?: number
  suspensionDamping?: number
  driveForce?: number
  maxSpeed?: number
  brakeForce?: number
}

export class VehicleController {
  public readonly chassisBody: RAPIER.RigidBody
  public readonly chassisMesh: THREE.Object3D
  public readonly wheelMeshes: THREE.Object3D[] = []

  private readonly physicsWorld: PhysicsWorld
  private readonly config: Required<VehicleConfig>
  private steerAngle = 0
  private currentSpeed = 0
  private isGrounded = false

  // Local wheel anchors relative to chassis center
  private readonly wheelAnchors: THREE.Vector3[] = []

  constructor(
    physicsWorld: PhysicsWorld,
    chassisMesh: THREE.Object3D,
    wheelMeshes: THREE.Object3D[] = [],
    config: VehicleConfig = {},
  ) {
    this.physicsWorld = physicsWorld
    this.chassisMesh = chassisMesh
    this.wheelMeshes = wheelMeshes

    this.config = {
      chassisHalfExtents: config.chassisHalfExtents ?? { x: 0.8, y: 0.35, z: 1.4 },
      mass: config.mass ?? 120.0,
      suspensionRestLength: config.suspensionRestLength ?? 0.65,
      suspensionStiffness: config.suspensionStiffness ?? 60.0,
      suspensionDamping: config.suspensionDamping ?? 5.5,
      driveForce: config.driveForce ?? 1800.0,
      maxSpeed: config.maxSpeed ?? 35.0,
      brakeForce: config.brakeForce ?? 120.0,
    }

    const { x: hx, y: hy, z: hz } = this.config.chassisHalfExtents

    // Create Rapier Dynamic RigidBody for Chassis
    const rapier = this.physicsWorld.rapier
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(
        this.chassisMesh.position.x,
        this.chassisMesh.position.y,
        this.chassisMesh.position.z,
      )
      .setLinearDamping(0.3)
      .setAngularDamping(2.2) // Prevents violent unwanted rolling

    this.chassisBody = this.physicsWorld.rawWorld.createRigidBody(bodyDesc)

    // Chassis Collider
    const colliderDesc = rapier.ColliderDesc.cuboid(hx, hy, hz)
      .setDensity(this.config.mass / (8 * hx * hy * hz))
      .setFriction(0.4)
      .setRestitution(0.15)

    this.physicsWorld.rawWorld.createCollider(colliderDesc, this.chassisBody)
    this.physicsWorld.registerSync(this.chassisBody, this.chassisMesh)

    // Set 4 wheel anchors: Front-Left, Front-Right, Rear-Left, Rear-Right
    const trackWidth = hx * 0.95
    const wheelBase = hz * 0.85
    const anchorY = -hy * 0.5

    this.wheelAnchors = [
      new THREE.Vector3(-trackWidth, anchorY, wheelBase),  // Front Left (0)
      new THREE.Vector3(trackWidth, anchorY, wheelBase),   // Front Right (1)
      new THREE.Vector3(-trackWidth, anchorY, -wheelBase), // Rear Left (2)
      new THREE.Vector3(trackWidth, anchorY, -wheelBase),  // Rear Right (3)
    ]
  }

  public update(input: VehicleInput, dt: number): void {
    if (!this.chassisBody.isValid()) return

    const rapier = this.physicsWorld.rapier
    const translation = this.chassisBody.translation()
    const rotation = this.chassisBody.rotation()
    const linvel = this.chassisBody.linvel()

    const chassisQuat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQuat)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat)

    const currentVelocity = new THREE.Vector3(linvel.x, linvel.y, linvel.z)
    this.currentSpeed = currentVelocity.dot(forward)

    // Steer angle interpolation
    const targetSteer = input.steer * 0.42
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 10)

    // Downforce for stability
    const speedRatio = Math.min(1.5, Math.abs(this.currentSpeed) / 10)
    const downforceMagnitude = speedRatio * 45.0 * dt
    this.chassisBody.applyImpulse({ x: 0, y: -downforceMagnitude, z: 0 }, true)

    let groundedWheels = 0

    // Raycast Suspensions for 4 Wheels
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const anchorLocal = this.wheelAnchors[i]
      const anchorWorld = anchorLocal.clone().applyQuaternion(chassisQuat).add(
        new THREE.Vector3(translation.x, translation.y, translation.z),
      )

      // Cast ray downwards relative to chassis
      const rayDir = up.clone().multiplyScalar(-1).normalize()
      const ray = new rapier.Ray(
        { x: anchorWorld.x, y: anchorWorld.y, z: anchorWorld.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z },
      )

      const maxRayDist = this.config.suspensionRestLength * 1.5
      // solid = false to avoid self collision
      const hit = this.physicsWorld.rawWorld.castRayAndGetNormal(ray, maxRayDist, false)

      let wheelCompression = 0

      if (hit && hit.timeOfImpact < this.config.suspensionRestLength) {
        groundedWheels++
        const distance = hit.timeOfImpact
        wheelCompression = this.config.suspensionRestLength - distance

        // Spring Force: F = -k * x
        const springForce = wheelCompression * this.config.suspensionStiffness

        // Damper Force: F = -c * v
        const pointVel = this.getVelocityAtPoint(anchorWorld)
        const verticalVel = pointVel.dot(up)
        const damperForce = -verticalVel * this.config.suspensionDamping

        const totalSuspensionImpulse = Math.max(0, (springForce + damperForce) * dt)
        const impulseVector = up.clone().multiplyScalar(totalSuspensionImpulse)

        this.chassisBody.applyImpulseAtPoint(
          { x: impulseVector.x, y: impulseVector.y, z: impulseVector.z },
          { x: anchorWorld.x, y: anchorWorld.y, z: anchorWorld.z },
          true,
        )

        // Lateral Grip / Drift (Side friction)
        const lateralVel = pointVel.dot(right)
        const sideGrip = input.drift ? 0.35 : 0.88
        const lateralImpulseMag = -lateralVel * this.config.mass * 0.25 * sideGrip * dt
        const lateralImpulse = right.clone().multiplyScalar(lateralImpulseMag)

        this.chassisBody.applyImpulseAtPoint(
          { x: lateralImpulse.x, y: lateralImpulse.y, z: lateralImpulse.z },
          { x: anchorWorld.x, y: anchorWorld.y, z: anchorWorld.z },
          true,
        )

        // Propulsion / Braking
        if (Math.abs(input.throttle) > 0.01) {
          const driveDir = forward.clone()
          if (isFront) {
            driveDir.applyAxisAngle(up, -this.steerAngle)
          }

          if (Math.abs(this.currentSpeed) < this.config.maxSpeed || input.throttle * this.currentSpeed < 0) {
            const driveImpulseMag = input.throttle * (this.config.driveForce / 4) * dt
            const driveImpulse = driveDir.multiplyScalar(driveImpulseMag)
            this.chassisBody.applyImpulseAtPoint(
              { x: driveImpulse.x, y: driveImpulse.y, z: driveImpulse.z },
              { x: anchorWorld.x, y: anchorWorld.y, z: anchorWorld.z },
              true,
            )
          }
        }
      }

      // Sync wheel mesh visual if available
      if (this.wheelMeshes[i]) {
        const wheelMesh = this.wheelMeshes[i]
        const suspensionVisualOffset = wheelCompression * 0.65
        wheelMesh.position.copy(anchorLocal)
        wheelMesh.position.y += suspensionVisualOffset

        if (isFront) {
          wheelMesh.rotation.y = -this.steerAngle
        }
        wheelMesh.rotation.x += (this.currentSpeed * dt) / 0.35
      }
    }

    this.isGrounded = groundedWheels >= 2

    // Steering yaw torque when in motion
    if (this.isGrounded && Math.abs(input.steer) > 0.05) {
      // Powerful toy car steering torque
      const steerSign = -Math.sign(input.steer)
      const speedFactor = Math.min(2.5, Math.max(0.4, Math.abs(this.currentSpeed) / 3))
      const steerTorqueMag = steerSign * speedFactor * 420.0 * dt
      this.chassisBody.applyTorqueImpulse({ x: 0, y: steerTorqueMag, z: 0 }, true)
    }

    // Toy Jump Hop on demand
    if (input.jump && this.isGrounded) {
      this.chassisBody.applyImpulse({ x: 0, y: this.config.mass * 5.2, z: 0 }, true)
    }
  }

  private getVelocityAtPoint(worldPoint: THREE.Vector3): THREE.Vector3 {
    const translation = this.chassisBody.translation()
    const linvel = this.chassisBody.linvel()
    const angvel = this.chassisBody.angvel()

    const r = new THREE.Vector3(
      worldPoint.x - translation.x,
      worldPoint.y - translation.y,
      worldPoint.z - translation.z,
    )

    const w = new THREE.Vector3(angvel.x, angvel.y, angvel.z)
    const tangentialVel = new THREE.Vector3().crossVectors(w, r)

    return new THREE.Vector3(
      linvel.x + tangentialVel.x,
      linvel.y + tangentialVel.y,
      linvel.z + tangentialVel.z,
    )
  }

  public getSpeed(): number {
    return this.currentSpeed
  }

  public getIsGrounded(): boolean {
    return this.isGrounded
  }
}
