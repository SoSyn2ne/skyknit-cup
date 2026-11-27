import './artPreview.css'
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Fog, Group, HemisphereLight,
  MathUtils, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera,
  PlaneGeometry, Scene, ShadowMaterial, Sphere, SRGBColorSpace, Vector3, WebGLRenderer,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

type Mode = 'scene' | 'dragon' | 'hub'
type Variant = 'v2' | 'current'
type Model = { root: Group; rest: Map<Object3D, { y: number; z: number }> }

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!
const statePanel = document.querySelector<HTMLElement>('.preview-state')!
const statusText = document.querySelector<HTMLElement>('#preview-status')!
const retry = document.querySelector<HTMLButtonElement>('#preview-retry')!
const motionButton = document.querySelector<HTMLButtonElement>('#preview-motion')!
const wireframeButton = document.querySelector<HTMLButtonElement>('#preview-wireframe')!
const variantSelect = document.querySelector<HTMLSelectElement>('select')!
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
let mode: Mode = 'scene'
let variant: Variant = 'v2'
let status: 'loading' | 'ready' | 'error' = 'loading'
let motion = !reducedMotion.matches
let wireframe = false
let elapsed = 0
let requestVersion = 0
let disposed = false
let renderer: WebGLRenderer

const scene = new Scene()
scene.fog = new Fog(0xb8deda, 250, 1100)
const models = new Group()
scene.add(models)
const camera = new PerspectiveCamera(38, 1, 0.1, 2000)
const hemisphere = new HemisphereLight(0xcce9ed, 0x66664c, 2.2)
const sun = new DirectionalLight(0xffdfae, 3.2)
sun.position.set(50, 90, 50)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
sun.shadow.bias = -0.00012
sun.shadow.normalBias = 0.09
scene.add(hemisphere, sun, sun.target)
const ground = new Mesh(new PlaneGeometry(500, 500), new ShadowMaterial({ opacity: 0.14 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)
const loader = new GLTFLoader()
// Exactly two variants of two assets; failed promises are removed for retry.
const cache = new Map<string, Promise<Model>>()
let active: { key: string; model: Model }[] = []
let controls: OrbitControls
const fittedPosition = new Vector3()
const fittedTarget = new Vector3()

function showStatus(next: typeof status, message = '') {
  status = next
  statePanel.hidden = next === 'ready'
  statusText.textContent = message
  retry.hidden = next !== 'error'
  canvas.setAttribute('aria-busy', String(next === 'loading'))
}

function releaseModel(model: Model) {
  const materials = new Set<MeshStandardMaterial>()
  model.root.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  for (const material of materials) material.dispose()
}

function loadModel(kind: 'dragon' | 'hub', version: Variant) {
  const key = `${version}:${kind}`
  let pending = cache.get(key)
  if (!pending) {
    const path = version === 'v2' ? `/artifacts/art-v2/${kind}-v2.glb`
      : `/assets/models/${kind === 'dragon' ? 'characters/skyknit-dragon' : 'world/adventure-hub'}.glb`
    pending = loader.loadAsync(path).then(gltf => {
      const rest: Model['rest'] = new Map()
      gltf.scene.traverse(object => {
        if (object.userData.runtime_template || ['Bird', 'BirdPerch', 'RelayDevice', 'Relic', 'Charm'].includes(object.name)) object.visible = false
        if (/^(WingRig_[LR]|TailRig_\d|WindmillRotor)$/.test(object.name)) rest.set(object, { y: object.rotation.y, z: object.rotation.z })
        if (!(object instanceof Mesh)) return
        object.castShadow = true
        object.receiveShadow = true
      })
      return { root: gltf.scene, rest }
    }).catch(error => {
      cache.delete(key)
      throw error
    })
    cache.set(key, pending)
  }
  return pending
}

function visibleBounds(root: Object3D = models) {
  root.updateWorldMatrix(true, true)
  const bounds = new Box3()
  root.traverseVisible(object => {
    if (object instanceof Mesh) {
      object.geometry.computeBoundingBox()
      bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld))
    }
  })
  return bounds
}

function layoutModels() {
  if (mode !== 'scene' || active.length !== 2) return
  const dragon = active.find(item => item.key.endsWith(':dragon'))!.model.root
  const hub = active.find(item => item.key.endsWith(':hub'))!.model.root
  const dragonWrapper = dragon.parent!, hubWrapper = hub.parent!
  dragonWrapper.scale.setScalar(3.4)
  dragonWrapper.rotation.y = -1.55
  dragonWrapper.position.set(-34, -8, 30)
  hubWrapper.scale.setScalar(0.8)
  hubWrapper.position.set(8, -7, -9)
  if (camera.aspect < 0.85) {
    const direction = new Vector3(0.85, 0.56, 1.05).normalize()
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize()
    const up = new Vector3().crossVectors(direction, right)
    const hubCenter = visibleBounds(hub).getCenter(new Vector3())
    const dragonCenter = visibleBounds(dragon).getCenter(new Vector3())
    // Stack in the camera plane, not world Y: the island remains below the
    // dragon on narrow screens without hiding either authored silhouette.
    const target = hubCenter.addScaledVector(up, 55).addScaledVector(direction, 15).addScaledVector(right, -3)
    dragonWrapper.position.add(target.sub(dragonCenter))
  }
}

function fitCamera() {
  if (!active.length || !models.visible) return
  const sphere = visibleBounds().getBoundingSphere(new Sphere())
  const direction = mode === 'dragon' ? new Vector3(1, 0.42, -0.78) : new Vector3(0.85, 0.56, 1.05)
  direction.normalize()
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize()
  const up = new Vector3().crossVectors(direction, right)
  const point = new Vector3(), projected = new Vector3(), projectedBounds = new Box3()
  const visibleMeshes: Mesh[] = []
  models.traverseVisible(object => { if (object instanceof Mesh) visibleMeshes.push(object) })
  // Fit actual vertices in the chosen camera basis. A sphere makes the long,
  // off-axis garden path leave most of the viewport empty around the island.
  const visit = (inspect: (value: Vector3) => void) => {
    for (const mesh of visibleMeshes) {
      const positions = mesh.geometry.getAttribute('position')
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld)
        projected.set(point.dot(right), point.dot(up), point.dot(direction))
        inspect(projected)
      }
    }
  }
  visit(value => projectedBounds.expandByPoint(value))
  const center = projectedBounds.getCenter(new Vector3())
  const top = document.querySelector<HTMLElement>('.preview-header')!.getBoundingClientRect().bottom + 20
  const bottom = document.querySelector<HTMLElement>('.preview-footer')!.getBoundingClientRect().top - 16
  const usableHeight = Math.max(0.3, (bottom - top) / innerHeight)
  const usableWidth = Math.max(0.6, 1 - 32 / innerWidth)
  const tanVertical = Math.tan(MathUtils.degToRad(camera.fov / 2))
  const tanHorizontal = tanVertical * camera.aspect
  let distance = 0
  visit(value => {
    distance = Math.max(distance,
      value.z - center.z + Math.abs(value.x - center.x) / (tanHorizontal * usableWidth),
      value.z - center.z + Math.abs(value.y - center.y) / (tanVertical * usableHeight))
  })
  distance *= mode === 'dragon' ? 1.12 : 1.08
  controls.target.copy(right).multiplyScalar(center.x).addScaledVector(up, center.y).addScaledVector(direction, center.z)
  camera.position.copy(controls.target).addScaledVector(direction, distance)
  camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight / 2 - (top + bottom) / 2, innerWidth, innerHeight)
  camera.near = Math.max(0.05, sphere.radius / 300)
  camera.far = Math.max(2000, distance * 8)
  camera.updateProjectionMatrix()
  controls.minDistance = sphere.radius * 0.28
  controls.maxDistance = distance * 3
  controls.update()
  fittedPosition.copy(camera.position)
  fittedTarget.copy(controls.target)
  sun.target.position.copy(sphere.center)
  sun.position.copy(sphere.center).add(new Vector3(0.7, 1.3, 0.8).multiplyScalar(sphere.radius * 2))
  const extent = sphere.radius * 1.1
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: sphere.radius * 8 })
  sun.shadow.camera.updateProjectionMatrix()
}

function applyWireframe() {
  models.traverse(object => {
    if (!(object instanceof Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) material.wireframe = wireframe
    }
  })
}

async function selectModels() {
  const version = ++requestVersion
  const selectedMode = mode
  const selectedVariant = variant
  showStatus('loading', '모델을 불러오는 중…')
  models.visible = false
  ground.visible = false
  try {
    const kinds = selectedMode === 'scene' ? ['hub', 'dragon'] as const : [selectedMode]
    const loaded = await Promise.all(kinds.map(async kind => ({ key: `${selectedVariant}:${kind}`, model: await loadModel(kind, selectedVariant) })))
    if (version !== requestVersion || disposed) return
    models.clear()
    active = loaded
    for (const item of active) {
      const wrapper = new Group()
      wrapper.add(item.model.root)
      models.add(wrapper)
    }
    models.visible = true
    ground.visible = selectedMode === 'dragon'
    if (ground.visible) ground.position.y = visibleBounds().min.y - 0.03
    applyMotion()
    layoutModels()
    applyWireframe()
    fitCamera()
    showStatus('ready')
  } catch {
    if (version !== requestVersion || disposed) return
    showStatus('error', '모델을 불러오지 못했습니다. 생성 파일과 서버를 확인한 뒤 다시 시도해 주세요.')
  }
}

function applyMotion() {
  for (const { model } of active) {
    for (const [object, rest] of model.rest) {
      if (object.name.startsWith('WingRig')) object.rotation.z = rest.z + Math.sin(elapsed * 1.7) * 0.13 * (object.name.endsWith('L') ? 1 : -1)
      else if (object.name.startsWith('TailRig')) object.rotation.y = rest.y + Math.sin(elapsed * 1.1 - Number(object.name.at(-1)) * 0.45) * 0.035
      else object.rotation.z = rest.z + elapsed * 0.22
    }
  }
}

function syncMotionButton() {
  const label = motion ? '동작 일시정지' : '동작 재생'
  motionButton.setAttribute('aria-label', label)
  motionButton.setAttribute('aria-pressed', String(motion))
  motionButton.title = label
  motionButton.textContent = motion ? 'Ⅱ' : '▷'
}

function resize() {
  camera.aspect = innerWidth / innerHeight
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.setSize(innerWidth, innerHeight, false)
  layoutModels()
  fitCamera()
}

function start() {
  renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = false
  controls.maxPolarAngle = Math.PI * 0.82
  controls.listenToKeyEvents(canvas)
  resize()
  addEventListener('resize', resize)
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.addEventListener('click', () => {
    mode = button.dataset.mode as Mode
    for (const sibling of document.querySelectorAll('[data-mode]')) sibling.setAttribute('aria-pressed', String(sibling === button))
    void selectModels()
  })
  variantSelect.addEventListener('change', () => { variant = variantSelect.value as Variant; void selectModels() })
  retry.addEventListener('click', () => { void selectModels() })
  motionButton.addEventListener('click', () => { motion = !motion; syncMotionButton() })
  wireframeButton.addEventListener('click', () => {
    wireframe = !wireframe
    wireframeButton.setAttribute('aria-pressed', String(wireframe))
    applyWireframe()
  })
  document.querySelector('#preview-reset')!.addEventListener('click', () => {
    camera.position.copy(fittedPosition)
    controls.target.copy(fittedTarget)
    controls.update()
  })
  reducedMotion.addEventListener('change', () => { motion = !reducedMotion.matches; syncMotionButton() })
  syncMotionButton()
  let previousTime = performance.now()
  renderer.setAnimationLoop(time => {
    const delta = Math.min(0.05, (time - previousTime) / 1000)
    previousTime = time
    if (motion && status === 'ready' && !document.hidden) elapsed += delta
    applyMotion()
    renderer.render(scene, camera)
  })
  if (import.meta.env.DEV) Object.defineProperty(window, '__ART_PREVIEW_TEST__', { value: Object.freeze({ snapshot: () => ({
    mode, variant, status, motion, wireframe, elapsed, cacheSize: cache.size,
    activeModels: active.map(item => item.key), reducedMotion: reducedMotion.matches,
    camera: { position: camera.position.toArray(), target: controls.target.toArray() },
    render: { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr: renderer.getPixelRatio(), shadowMapSize: sun.shadow.mapSize.x },
  }) }), configurable: true })
  void selectModels()
  addEventListener('pagehide', event => {
    if (event.persisted) return
    disposed = true
    ++requestVersion
    renderer.setAnimationLoop(null)
    controls.dispose()
    for (const pending of cache.values()) void pending.then(releaseModel, () => undefined)
    ground.geometry.dispose()
    ground.material.dispose()
    sun.shadow.dispose()
    renderer.dispose()
  }, { once: true })
}

try { start() } catch {
  showStatus('error', '3D 미리보기를 시작하지 못했습니다. WebGL 지원 브라우저에서 다시 열어 주세요.')
  retry.onclick = () => location.reload()
}
