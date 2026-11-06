import * as THREE from 'three'
import { PhysicsWorld } from './PhysicsWorld'
import { VehicleController, type VehicleInput } from './VehicleController'
import { PhysicsPlayground } from './PhysicsPlayground'
import { IsometricFollowCamera } from './IsometricFollowCamera'
import { createToyCarVisual } from './createToyCarVisual'

export interface PhysicsSessionHooks {
  onSpeedChange?: (speed: number) => void
}

export class PhysicsSession {
  public readonly scene: THREE.Scene
  public readonly camera: THREE.PerspectiveCamera
  public readonly renderer: THREE.WebGLRenderer

  private physicsWorld: PhysicsWorld | null = null
  private vehicle: VehicleController | null = null
  private isoCamera: IsometricFollowCamera | null = null
  private playground: PhysicsPlayground | null = null

  private readonly keysDown = new Set<string>()
  private animFrameId: number | null = null
  private lastTime = 0
  private isDisposed = false
  private hooks: PhysicsSessionHooks

  constructor(
    container: HTMLElement,
    hooks: PhysicsSessionHooks = {},
  ) {
    this.hooks = hooks

    // 1. Scene & Warm Studio Lighting
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xdde5ec) // Soft overcast studio blue-gray
    this.scene.fog = new THREE.FogExp2(0xdde5ec, 0.007)

    // Camera
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300)
    this.isoCamera = new IsometricFollowCamera(this.camera)

    // Renderer with soft PCF shadows
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    container.appendChild(this.renderer.domElement)

    this.setupLighting()
    this.setupInput()

    window.addEventListener('resize', this.onResize)
  }

  private setupLighting(): void {
    // Ambient Light
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.75)
    this.scene.add(ambient)

    // Key Directional Light (Sun)
    const sun = new THREE.DirectionalLight(0xfffbf0, 1.6)
    sun.position.set(40, 60, -30)
    sun.castShadow = true
    sun.shadow.mapSize.width = 2048
    sun.shadow.mapSize.height = 2048
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 160

    const shadowExtent = 50
    sun.shadow.camera.left = -shadowExtent
    sun.shadow.camera.right = shadowExtent
    sun.shadow.camera.top = shadowExtent
    sun.shadow.camera.bottom = -shadowExtent
    sun.shadow.bias = -0.0005
    this.scene.add(sun)

    // Fill Light (Soft cool blue sky bounce)
    const fillLight = new THREE.DirectionalLight(0x99bbdd, 0.5)
    fillLight.position.set(-30, 25, 30)
    this.scene.add(fillLight)
  }

  private setupInput(): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code)
  }

  private onResize = (): void => {
    const parent = this.renderer.domElement.parentElement
    const width = parent?.clientWidth || window.innerWidth
    const height = parent?.clientHeight || window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  public async init(): Promise<void> {
    // 1. Init Rapier Physics World
    this.physicsWorld = await PhysicsWorld.create({
      gravity: { x: 0, y: -18.0, z: 0 },
    })

    // 2. Build Diorama Playground (Base, Bowling Pins, Crates, Ramp)
    this.playground = new PhysicsPlayground(this.physicsWorld, this.scene)
    this.playground.build()

    // 3. Create Toy Car Visual & Controller
    const carVisual = createToyCarVisual(0xff3b19) // Bruno Simon Red
    carVisual.root.position.set(0, 1.8, -15)
    this.scene.add(carVisual.root)

    this.vehicle = new VehicleController(
      this.physicsWorld,
      carVisual.root,
      carVisual.wheels,
    )

    this.isoCamera?.init(carVisual.root.position)

    // Start loop
    this.lastTime = performance.now()
    this.loop()
  }

  private loop = (): void => {
    if (this.isDisposed) return
    this.animFrameId = requestAnimationFrame(this.loop)

    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now

    // Collect Input
    const throttle =
      (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp') ? 1 : 0) -
      (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown') ? 1 : 0)

    const steer =
      (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight') ? 1 : 0) -
      (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft') ? 1 : 0)

    const drift = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')
    const jump = this.keysDown.has('Space')

    const input: VehicleInput = { throttle, steer, drift, jump }

    // Step Vehicle & Physics
    if (this.vehicle && this.physicsWorld) {
      this.vehicle.update(input, dt)
      this.physicsWorld.step(dt)

      const trans = this.vehicle.chassisBody.translation()
      const rot = this.vehicle.chassisBody.rotation()

      const chassisPos = new THREE.Vector3(trans.x, trans.y, trans.z)
      const chassisQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)

      this.isoCamera?.update(chassisPos, chassisQuat, dt)
      this.hooks.onSpeedChange?.(this.vehicle.getSpeed())
    }

    this.renderer.render(this.scene, this.camera)
  }

  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('resize', this.onResize)

    this.physicsWorld?.dispose()
    this.renderer.dispose()
  }
}
