import * as THREE from 'three'
import type { PhysicsWorld } from './PhysicsWorld'

export interface PlaygroundElements {
  readonly groundMesh: THREE.Mesh
  readonly props: THREE.Object3D[]
}

export class PhysicsPlayground {
  private readonly world: PhysicsWorld
  private readonly scene: THREE.Scene
  private readonly props: THREE.Object3D[] = []

  constructor(world: PhysicsWorld, scene: THREE.Scene) {
    this.world = world
    this.scene = scene
  }

  public build(): PlaygroundElements {
    // 1. Diorama Floor Base
    const groundSize = 120
    const groundGeom = new THREE.BoxGeometry(groundSize, 1.0, groundSize)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xe8e0d5, // Warm Ivory Sandstone (Bruno Simon Desk style)
      roughness: 0.85,
      metalness: 0.05,
    })
    const groundMesh = new THREE.Mesh(groundGeom, groundMat)
    groundMesh.position.set(0, 0, 0)
    groundMesh.receiveShadow = true
    this.scene.add(groundMesh)

    // Physics floor (cuboid half-extents: 60, 0.5, 60)
    this.world.createGround(groundSize / 2, groundSize / 2, 0, 0.85)

    // Perimeter Guardrails (Boundary Walls so toy car stays on desk)
    this.createGuardrails(groundSize)

    // 2. Bowling Pins Section (Right behind jump ramp for epic airborne strike!)
    this.createBowlingSection({ x: 0, y: 1.0, z: 10 })

    // 3. Wooden Crate Pyramids (On the sides and landing path!)
    this.createCratePyramid({ x: -7, y: 1.0, z: -3 })
    this.createCratePyramid({ x: 7, y: 1.0, z: -3 })
    this.createCratePyramid({ x: 0, y: 1.0, z: 16 }) // Direct jump crash target!

    // 4. Stunt Jump Ramp (Directly in front of car)
    this.createJumpRamp({ x: 0, y: 0.5, z: 0 })

    // 5. Road Signs & Pillars
    this.createDecorations()

    return { groundMesh, props: this.props }
  }

  private createGuardrails(size: number): void {
    const half = size / 2
    const wallThickness = 1.0
    const wallHeight = 2.0

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xc8b8a0,
      roughness: 0.9,
    })

    const wallConfigs = [
      { pos: [0, wallHeight / 2 + 0.5, -half], size: [size, wallHeight, wallThickness] },
      { pos: [0, wallHeight / 2 + 0.5, half], size: [size, wallHeight, wallThickness] },
      { pos: [-half, wallHeight / 2 + 0.5, 0], size: [wallThickness, wallHeight, size] },
      { pos: [half, wallHeight / 2 + 0.5, 0], size: [wallThickness, wallHeight, size] },
    ]

    for (const cfg of wallConfigs) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.size[0], cfg.size[1], cfg.size[2]),
        wallMat,
      )
      mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2])
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
      this.props.push(mesh)

      // Static wall collider in Rapier
      const rapier = this.world.rapier
      const bodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(
        cfg.pos[0],
        cfg.pos[1],
        cfg.pos[2],
      )
      const body = this.world.rawWorld.createRigidBody(bodyDesc)
      const colliderDesc = rapier.ColliderDesc.cuboid(
        cfg.size[0] / 2,
        cfg.size[1] / 2,
        cfg.size[2] / 2,
      )
        .setFriction(0.3)
        .setRestitution(0.4)
      this.world.rawWorld.createCollider(colliderDesc, body)
    }
  }

  private createBowlingSection(origin: { x: number; y: number; z: number }): void {
    const pinRadius = 0.35
    const pinHeight = 1.4
    const pinGeom = new THREE.CylinderGeometry(pinRadius * 0.7, pinRadius, pinHeight, 12)
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0xfdfdfd,
      roughness: 0.3,
      metalness: 0.1,
    })

    // Red neck ring band for bowling pin
    const bandGeom = new THREE.CylinderGeometry(pinRadius * 0.72, pinRadius * 0.75, 0.15, 12)
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xee3322 })

    // Standard 4-row bowling pin triangle formation
    const rows = 4
    const spacing = 1.4
    let pinIndex = 0

    for (let r = 0; r < rows; r++) {
      const zOffset = r * spacing * 0.866
      const startX = -(r * spacing) / 2

      for (let c = 0; c <= r; c++) {
        const xOffset = startX + c * spacing
        const px = origin.x + xOffset
        const py = origin.y + pinHeight / 2
        const pz = origin.z + zOffset

        const group = new THREE.Group()
        const pinMesh = new THREE.Mesh(pinGeom, pinMat)
        pinMesh.castShadow = true
        group.add(pinMesh)

        const band = new THREE.Mesh(bandGeom, bandMat)
        band.position.y = pinHeight * 0.25
        group.add(band)

        group.position.set(px, py, pz)
        this.scene.add(group)
        this.props.push(group)

        // Rapier dynamic cylinder body (lightweight bouncy pin)
        this.world.createCylinderProp(
          { x: px, y: py, z: pz },
          pinRadius,
          pinHeight / 2,
          0.6, // lightweight 0.6 kg for dramatic strikes
          group,
        )

        pinIndex++
      }
    }
  }

  private createCratePyramid(origin: { x: number; y: number; z: number }): void {
    const crateSize = 1.0
    const crateGeom = new THREE.BoxGeometry(crateSize, crateSize, crateSize)
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0xd49b5c, // Warm pine wood
      roughness: 0.7,
      metalness: 0.05,
    })

    const levels = 4
    for (let level = 0; level < levels; level++) {
      const count = levels - level
      const y = origin.y + level * crateSize + crateSize / 2
      const startX = origin.x - ((count - 1) * crateSize * 1.05) / 2

      for (let i = 0; i < count; i++) {
        const x = startX + i * crateSize * 1.05
        const z = origin.z

        const mesh = new THREE.Mesh(crateGeom, crateMat)
        mesh.position.set(x, y, z)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.scene.add(mesh)
        this.props.push(mesh)

        this.world.createBoxProp(
          { x, y, z },
          { x: crateSize / 2, y: crateSize / 2, z: crateSize / 2 },
          2.5, // 2.5 kg mass
          mesh,
        )
      }
    }
  }

  private createJumpRamp(origin: { x: number; y: number; z: number }): void {
    const rampWidth = 6.0
    const rampLength = 8.0
    const rampHeight = 1.8
    const inclineAngle = Math.atan2(rampHeight, rampLength)

    const rampGeom = new THREE.BoxGeometry(rampWidth, 0.4, rampLength)
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0xffaa22, // Vivid orange ramp
      roughness: 0.35,
      metalness: 0.1,
    })

    const rampMesh = new THREE.Mesh(rampGeom, rampMat)
    // Position center of incline so leading edge sinks slightly under floor
    const rampY = origin.y + rampHeight * 0.35
    rampMesh.position.set(origin.x, rampY, origin.z)
    rampMesh.rotation.x = -inclineAngle
    rampMesh.castShadow = true
    rampMesh.receiveShadow = true
    this.scene.add(rampMesh)
    this.props.push(rampMesh)

    // Rapier static inclined body
    const rapier = this.world.rapier
    const rampBodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(origin.x, rampY, origin.z)
      .setRotation({
        x: Math.sin(-inclineAngle / 2),
        y: 0,
        z: 0,
        w: Math.cos(-inclineAngle / 2),
      })

    const rampBody = this.world.rawWorld.createRigidBody(rampBodyDesc)
    const colliderDesc = rapier.ColliderDesc.cuboid(rampWidth / 2, 0.2, rampLength / 2)
      .setFriction(0.65)
      .setRestitution(0.1)
    this.world.rawWorld.createCollider(colliderDesc, rampBody)
  }

  private createDecorations(): void {
    // 3 bouncy traffic cones
    const coneGeom = new THREE.ConeGeometry(0.3, 0.8, 10)
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5511, roughness: 0.5 })

    const conePositions = [
      { x: -5, y: 0.9, z: -8 },
      { x: -7, y: 0.9, z: -8 },
      { x: -9, y: 0.9, z: -8 },
    ]

    for (const pos of conePositions) {
      const mesh = new THREE.Mesh(coneGeom, coneMat)
      mesh.position.set(pos.x, pos.y, pos.z)
      mesh.castShadow = true
      this.scene.add(mesh)
      this.props.push(mesh)

      this.world.createCylinderProp(pos, 0.3, 0.4, 0.6, mesh)
    }
  }
}
