import * as THREE from 'three'

export interface CameraFollowConfig {
  offset?: THREE.Vector3
  lookAtOffset?: THREE.Vector3
  positionDamping?: number
  lookAtDamping?: number
}

export class IsometricFollowCamera {
  public readonly camera: THREE.PerspectiveCamera
  private readonly offset: THREE.Vector3
  private readonly lookAtOffset: THREE.Vector3
  private readonly positionDamping: number
  private readonly lookAtDamping: number

  private currentTarget = new THREE.Vector3()

  constructor(
    camera: THREE.PerspectiveCamera,
    config: CameraFollowConfig = {},
  ) {
    this.camera = camera
    this.offset = config.offset ?? new THREE.Vector3(0, 9.5, -14.5)
    this.lookAtOffset = config.lookAtOffset ?? new THREE.Vector3(0, 0.8, 4.0)
    this.positionDamping = config.positionDamping ?? 5.5
    this.lookAtDamping = config.lookAtDamping ?? 7.0
  }

  public init(targetPosition: THREE.Vector3): void {
    this.currentTarget.copy(targetPosition)
    this.camera.position.copy(targetPosition).add(this.offset)
    this.camera.lookAt(targetPosition.clone().add(this.lookAtOffset))
  }

  public update(targetPosition: THREE.Vector3, targetQuaternion: THREE.Quaternion, dt: number): void {
    // Smooth target follow
    const lerpFactor = 1 - Math.exp(-this.positionDamping * dt)
    const lookAtLerpFactor = 1 - Math.exp(-this.lookAtDamping * dt)

    // Desired camera position relative to target
    // In Bruno Simon style, the camera does NOT wildly spin with the car,
    // but maintains a stable isometric high angle with subtle rotation bias!
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(targetQuaternion)
    const yaw = Math.atan2(forward.x, forward.z)

    // Subtle yaw follow (only 30% of car heading, so scene stays stable and miniature)
    const cameraQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw * 0.35,
    )

    const rotatedOffset = this.offset.clone().applyQuaternion(cameraQuat)
    const desiredPos = targetPosition.clone().add(rotatedOffset)

    this.camera.position.lerp(desiredPos, lerpFactor)

    const desiredLookAt = targetPosition.clone().add(
      this.lookAtOffset.clone().applyQuaternion(cameraQuat),
    )
    this.currentTarget.lerp(desiredLookAt, lookAtLerpFactor)
    this.camera.lookAt(this.currentTarget)
  }
}
