import './terrainPreview.css'

import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { createTerrain3D, type Terrain3DController } from './terrain3d/createTerrain3D'
import {
  createTerrainProps,
  type TerrainPropsController,
} from './terrain3d/createTerrainProps'
import type {
  TerrainBrushMode,
  TerrainMaterialSlot,
  TerrainPresetId,
  TerrainViewMode,
} from './terrain3d/terrainTypes'

type ToolMode = 'orbit' | 'sculpt'

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!
const metricsEl = document.querySelector<HTMLElement>('#terrain-metrics')!
const helpEl = document.querySelector<HTMLElement>('#terrain-help')!
const statePanel = document.querySelector<HTMLElement>('.terrain-state')!
const statusText = document.querySelector<HTMLElement>('#terrain-status')!
const retryButton = document.querySelector<HTMLButtonElement>('#terrain-retry')!
const presetSelect = document.querySelector<HTMLSelectElement>('#terrain-preset')!
const motionButton = document.querySelector<HTMLButtonElement>('#terrain-motion')!
const wireframeButton = document.querySelector<HTMLButtonElement>('#terrain-wireframe')!
const resetCamButton = document.querySelector<HTMLButtonElement>('#terrain-reset-cam')!
const inspectorToggle = document.querySelector<HTMLButtonElement>('#terrain-inspector-toggle')!
const inspectorClose = document.querySelector<HTMLButtonElement>('#terrain-inspector-close')!
const inspectorPanel = document.querySelector<HTMLElement>('#terrain-inspector')!
const brushControlsSection = document.querySelector<HTMLElement>('#brush-controls')!
const paintSlotRow = document.querySelector<HTMLElement>('#paint-slot-row')!
const paintSlotSelect = document.querySelector<HTMLSelectElement>('#paint-slot')!
const brushRadiusSlider = document.querySelector<HTMLInputElement>('#slider-brush-radius')!
const brushRadiusValue = document.querySelector<HTMLElement>('#val-brush-radius')!
const autoSlopeSlider = document.querySelector<HTMLInputElement>('#slider-auto-slope')!
const autoSlopeValue = document.querySelector<HTMLElement>('#val-auto-slope')!
const autoHeightSlider = document.querySelector<HTMLInputElement>('#slider-auto-height')!
const autoHeightValue = document.querySelector<HTMLElement>('#val-auto-height')!
const heightScaleSlider = document.querySelector<HTMLInputElement>('#slider-height-scale')!
const heightScaleValue = document.querySelector<HTMLElement>('#val-height-scale')!
const regenerateButton = document.querySelector<HTMLButtonElement>('#terrain-regenerate')!
const pbrToggleButton = document.querySelector<HTMLButtonElement>('#toggle-pbr')!
const propsToggleButton = document.querySelector<HTMLButtonElement>('#toggle-props')!

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
let status: 'ready' | 'error' = 'ready'
let preset: TerrainPresetId = 'sky-highlands'
let viewMode: TerrainViewMode = 'lit'
let toolMode: ToolMode = 'orbit'
let brushMode: TerrainBrushMode = 'raise'
let paintSlot: TerrainMaterialSlot = 3
let brushRadius = 24
let motion = !reducedMotion.matches
let wireframe = false
let usePbrTextures = true
let showProps = true
let inspectorOpen = false
let elapsed = 0
let isSculptDragging = false
let flattenReferenceHeight: number | undefined
let activePointerId: number | null = null
let activeHoverHit: { x: number; y: number; z: number } | null = null

const pressedKeys = new Set<string>()
const pointerNdc = new Vector2()
const raycaster = new Raycaster()
const cameraForward = new Vector3()
const cameraRight = new Vector3()
const moveDelta = new Vector3()
const PRESET_VANTAGES: Record<
  TerrainPresetId,
  { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number] }
> = {
  'sky-highlands': {
    position: [205, 148, 255],
    target: [-12, 22, -18],
  },
  'wind-canyon': {
    position: [195, 142, 230],
    target: [10, 20, -24],
  },
  'volcanic-caldera': {
    position: [215, 188, 240],
    target: [0, 14, 0],
  },
}

let renderer: WebGLRenderer
let scene: Scene
let camera: PerspectiveCamera
let controls: OrbitControls
let terrain: Terrain3DController
let props: TerrainPropsController
let sunLight: DirectionalLight
let fillLight: DirectionalLight
let hemiLight: HemisphereLight
let sceneFog: Fog

function showStatus(next: typeof status, message = ''): void {
  status = next
  statePanel.hidden = next === 'ready'
  statusText.textContent = message
  retryButton.hidden = next !== 'error'
}

function syncMotionButton(): void {
  const label = motion ? '자동 공전 일시정지' : '자동 공전 재생'
  motionButton.setAttribute('aria-label', label)
  motionButton.setAttribute('aria-pressed', String(motion))
  motionButton.title = label
  motionButton.textContent = motion ? 'Ⅱ' : '▷'
}

function syncInspectorVisibility(): void {
  inspectorPanel.hidden = !inspectorOpen
  inspectorToggle.setAttribute('aria-expanded', String(inspectorOpen))
}

function syncToolMode(): void {
  const sculpt = toolMode === 'sculpt'
  brushControlsSection.hidden = !sculpt
  paintSlotRow.hidden = !(sculpt && brushMode === 'paint')
  controls.enableRotate = !sculpt
  if (!sculpt) {
    isSculptDragging = false
    activeHoverHit = null
    terrain.setBrushCursor(0, 0, brushRadius, false, brushMode)
  }
  helpEl.textContent = sculpt
    ? '캔버스 드래그로 지형 스컬프팅/페인팅 · 우클릭/두 손가락으로 이동 · ⚙에서 탐색 전환'
    : '드래그로 회전 · WASD/방향키로 클립맵 이동 · ⚙에서 브러시 편집'
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === toolMode))
  }
}

function syncShaderSlidersFromTerrain(): void {
  const shaderParams = terrain.getShaderParams()
  autoSlopeSlider.value = shaderParams.autoSlope.toFixed(2)
  autoSlopeValue.textContent = shaderParams.autoSlope.toFixed(2)
  autoHeightSlider.value = String(Math.round(shaderParams.autoHeight))
  autoHeightValue.textContent = `${Math.round(shaderParams.autoHeight)}m`
  heightScaleSlider.value = shaderParams.heightScale.toFixed(2)
  heightScaleValue.textContent = `${shaderParams.heightScale.toFixed(2)}×`
}

function syncSceneLightingFromTerrain(): void {
  const light = terrain.getAtmosphereLighting()
  sunLight.position.set(
    light.sunDirection[0] * 360,
    light.sunDirection[1] * 360,
    light.sunDirection[2] * 360,
  )
  sunLight.color.setHex(light.sunColor)
  fillLight.position.set(
    -light.sunDirection[0] * 260,
    200,
    -light.sunDirection[2] * 260,
  )
  hemiLight.color.setHex(preset === 'volcanic-caldera' ? 0xd99e84 : 0xdaf2f5)
  hemiLight.groundColor.setHex(
    preset === 'volcanic-caldera'
      ? 0xa84b2a
      : preset === 'wind-canyon'
        ? 0xb5865e
        : 0x7a9674,
  )
  fillLight.color.setHex(preset === 'volcanic-caldera' ? 0xff9b66 : 0xbce6ee)
  sceneFog.color.setHex(light.fogColor)
}

function updateMetricsBanner(): void {
  const snap = terrain.getSnapshot()
  const propSnap = props.getSnapshot()
  const tri = snap.clipmapStats.triangleCount.toLocaleString('en-US')
  const [ox, oz] = snap.level0Origin
  const propTag =
    propSnap.instanceCount > 0 ? ` · 프롭 ${propSnap.instanceCount}` : ''
  metricsEl.textContent = `GPU Clipmap ${snap.clipmapStats.lodCount}단 · 지형 1 DC · ${tri}△${propTag} · LOD0 (${ox}, ${oz})`
}

function resetCamera(): void {
  const vantage = PRESET_VANTAGES[preset]
  camera.position.set(...vantage.position)
  controls.target.set(...vantage.target)
  controls.update()
}

function pickTerrainAtClient(clientX: number, clientY: number): { x: number; y: number; z: number } | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }
  pointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointerNdc, camera)
  const hit = terrain.raycast(raycaster.ray.origin, raycaster.ray.direction)
  return hit === null ? null : { x: hit.x, y: hit.y, z: hit.z }
}

function brushStrengthForMode(mode: TerrainBrushMode): number {
  if (mode === 'paint' || mode === 'autoshader' || mode === 'hole') {
    return 0.85
  }
  if (mode === 'smooth' || mode === 'flatten') {
    return 5.5
  }
  return 28
}

function applyKeyboardPan(dt: number): void {
  if (pressedKeys.size === 0) {
    return
  }
  let forwardInput = 0
  let rightInput = 0
  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) forwardInput += 1
  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) forwardInput -= 1
  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) rightInput += 1
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) rightInput -= 1
  if (forwardInput === 0 && rightInput === 0) {
    return
  }

  camera.getWorldDirection(cameraForward)
  cameraForward.y = 0
  if (cameraForward.lengthSq() < 1e-6) {
    cameraForward.set(0, 0, -1)
  } else {
    cameraForward.normalize()
  }
  cameraRight.crossVectors(cameraForward, camera.up).normalize()

  const speed = 110 * dt
  moveDelta
    .set(0, 0, 0)
    .addScaledVector(cameraForward, forwardInput * speed)
    .addScaledVector(cameraRight, rightInput * speed)

  camera.position.add(moveDelta)
  controls.target.add(moveDelta)
}

function keepCameraAboveTerrain(): void {
  const groundY = terrain.sampleHeight(camera.position.x, camera.position.z)
  const minY = groundY + 6
  if (camera.position.y < minY) {
    camera.position.y = minY
  }
}

function resize(): void {
  camera.aspect = innerWidth / Math.max(1, innerHeight)
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.setSize(innerWidth, innerHeight, false)
}

function start(): void {
  renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06

  scene = new Scene()
  camera = new PerspectiveCamera(46, 1, 0.5, 2200)
  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI * 0.48
  controls.minDistance = 24
  controls.maxDistance = 560

  terrain = createTerrain3D(preset)
  props = createTerrainProps()
  hemiLight = new HemisphereLight(0xdaf2f5, 0x7a9674, 2.2)
  sunLight = new DirectionalLight(0xffe4b8, 3.1)
  fillLight = new DirectionalLight(0xbce6ee, 1.15)
  sceneFog = new Fog(0xc0e1dc, 230, 860)
  scene.fog = sceneFog
  scene.add(hemiLight, sunLight, fillLight, terrain.group, props.group)
  syncSceneLightingFromTerrain()
  void props
    .rebuildForRegion(terrain.getRegionData(), terrain.getShaderParams().heightScale)
    .then(updateMetricsBanner)
  resetCamera()
  resize()
  syncMotionButton()
  syncInspectorVisibility()
  syncToolMode()
  syncShaderSlidersFromTerrain()
  updateMetricsBanner()

  addEventListener('resize', resize)

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.addEventListener('click', () => {
      viewMode = button.dataset.view as TerrainViewMode
      for (const sibling of document.querySelectorAll('[data-view]')) {
        sibling.setAttribute('aria-pressed', String(sibling === button))
      }
      terrain.setShaderParams({ viewMode })
    })
  }

  presetSelect.addEventListener('change', () => {
    preset = presetSelect.value as TerrainPresetId
    terrain.setPreset(preset)
    syncSceneLightingFromTerrain()
    resetCamera()
    syncShaderSlidersFromTerrain()
    updateMetricsBanner()
    void props
      .rebuildForRegion(
        terrain.getRegionData(),
        terrain.getShaderParams().heightScale,
      )
      .then(updateMetricsBanner)
  })

  motionButton.addEventListener('click', () => {
    motion = !motion
    syncMotionButton()
  })

  wireframeButton.addEventListener('click', () => {
    wireframe = !wireframe
    wireframeButton.setAttribute('aria-pressed', String(wireframe))
    terrain.setShaderParams({ wireframe })
  })

  resetCamButton.addEventListener('click', resetCamera)

  inspectorToggle.addEventListener('click', () => {
    inspectorOpen = !inspectorOpen
    syncInspectorVisibility()
  })

  inspectorClose.addEventListener('click', () => {
    inspectorOpen = false
    syncInspectorVisibility()
    inspectorToggle.focus()
  })

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    button.addEventListener('click', () => {
      toolMode = button.dataset.tool as ToolMode
      syncToolMode()
    })
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-brush]')) {
    button.addEventListener('click', () => {
      brushMode = button.dataset.brush as TerrainBrushMode
      for (const sibling of document.querySelectorAll('[data-brush]')) {
        sibling.setAttribute('aria-pressed', String(sibling === button))
      }
      paintSlotRow.hidden = !(toolMode === 'sculpt' && brushMode === 'paint')
    })
  }

  paintSlotSelect.addEventListener('change', () => {
    paintSlot = Number(paintSlotSelect.value) as TerrainMaterialSlot
  })

  brushRadiusSlider.addEventListener('input', () => {
    brushRadius = Number(brushRadiusSlider.value)
    brushRadiusValue.textContent = `${brushRadius}m`
  })

  autoSlopeSlider.addEventListener('input', () => {
    const autoSlope = Number(autoSlopeSlider.value)
    autoSlopeValue.textContent = autoSlope.toFixed(2)
    terrain.setShaderParams({ autoSlope })
  })

  autoHeightSlider.addEventListener('input', () => {
    const autoHeight = Number(autoHeightSlider.value)
    autoHeightValue.textContent = `${Math.round(autoHeight)}m`
    terrain.setShaderParams({ autoHeight })
  })

  heightScaleSlider.addEventListener('input', () => {
    const heightScale = Number(heightScaleSlider.value)
    heightScaleValue.textContent = `${heightScale.toFixed(2)}×`
    terrain.setShaderParams({ heightScale })
    props.resnap(terrain.getRegionData(), heightScale)
  })

  pbrToggleButton.addEventListener('click', () => {
    usePbrTextures = !usePbrTextures
    pbrToggleButton.setAttribute('aria-pressed', String(usePbrTextures))
    terrain.setUsePbrTextures(usePbrTextures)
  })

  propsToggleButton.addEventListener('click', () => {
    showProps = !showProps
    propsToggleButton.setAttribute('aria-pressed', String(showProps))
    props.setVisible(showProps)
  })

  regenerateButton.addEventListener('click', () => {
    terrain.resetTerrain()
    updateMetricsBanner()
    void props
      .rebuildForRegion(
        terrain.getRegionData(),
        terrain.getShaderParams().heightScale,
      )
      .then(updateMetricsBanner)
  })

  canvas.addEventListener('pointerdown', (event) => {
    if (toolMode !== 'sculpt' || event.button !== 0) {
      return
    }
    const hit = pickTerrainAtClient(event.clientX, event.clientY)
    if (hit === null) {
      return
    }
    activePointerId = event.pointerId
    isSculptDragging = true
    activeHoverHit = hit
    flattenReferenceHeight = hit.y / Math.max(0.01, terrain.getShaderParams().heightScale)
    terrain.setBrushCursor(hit.x, hit.z, brushRadius, true, brushMode)
    if (
      terrain.applyBrush(
        {
          mode: brushMode,
          radius: brushRadius,
          strength: brushStrengthForMode(brushMode),
          paintSlot,
          flattenHeight: flattenReferenceHeight,
          eraseHole: event.shiftKey,
        },
        hit.x,
        hit.z,
        0.08,
      )
    ) {
      props.resnap(terrain.getRegionData(), terrain.getShaderParams().heightScale)
    }
    canvas.setPointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointermove', (event) => {
    if (toolMode !== 'sculpt') {
      return
    }
    const hit = pickTerrainAtClient(event.clientX, event.clientY)
    activeHoverHit = hit
    if (hit === null) {
      terrain.setBrushCursor(0, 0, brushRadius, false, brushMode)
      return
    }
    terrain.setBrushCursor(hit.x, hit.z, brushRadius, true, brushMode)
    if (isSculptDragging && activePointerId === event.pointerId) {
      if (
        terrain.applyBrush(
          {
            mode: brushMode,
            radius: brushRadius,
            strength: brushStrengthForMode(brushMode),
            paintSlot,
            flattenHeight: flattenReferenceHeight,
            eraseHole: event.shiftKey,
          },
          hit.x,
          hit.z,
          0.04,
        )
      ) {
        props.resnap(
          terrain.getRegionData(),
          terrain.getShaderParams().heightScale,
        )
      }
    }
  })

  const endSculptDrag = (event: PointerEvent): void => {
    if (activePointerId !== event.pointerId) {
      return
    }
    isSculptDragging = false
    activePointerId = null
    flattenReferenceHeight = undefined
  }
  canvas.addEventListener('pointerup', endSculptDrag)
  canvas.addEventListener('pointercancel', endSculptDrag)

  addEventListener('keydown', (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return
    }
    if (event.code === 'Escape' && inspectorOpen) {
      inspectorOpen = false
      syncInspectorVisibility()
      inspectorToggle.focus()
      return
    }
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(event.code)
    ) {
      pressedKeys.add(event.code)
    }
  })

  addEventListener('keyup', (event) => {
    pressedKeys.delete(event.code)
  })

  addEventListener('blur', () => {
    pressedKeys.clear()
    isSculptDragging = false
  })

  reducedMotion.addEventListener('change', () => {
    motion = !reducedMotion.matches
    syncMotionButton()
  })

  let previousTime = performance.now()
  let lastOriginKey = ''

  renderer.setAnimationLoop((time) => {
    const dt = Math.min(0.05, Math.max(0, (time - previousTime) / 1000))
    previousTime = time

    if (status === 'ready' && !document.hidden) {
      if (motion) {
        elapsed += dt
        if (toolMode === 'orbit' && pressedKeys.size === 0) {
          // Gentle orbital camera glide so clipmap and clouds visibly animate
          const offset = camera.position.clone().sub(controls.target)
          offset.applyAxisAngle(camera.up, dt * 0.085)
          camera.position.copy(controls.target).add(offset)
        }
      }

      applyKeyboardPan(dt)
      if (isSculptDragging && activeHoverHit !== null) {
        if (
          terrain.applyBrush(
            {
              mode: brushMode,
              radius: brushRadius,
              strength: brushStrengthForMode(brushMode),
              paintSlot,
              flattenHeight: flattenReferenceHeight,
            },
            activeHoverHit.x,
            activeHoverHit.z,
            dt,
          )
        ) {
          props.resnap(
            terrain.getRegionData(),
            terrain.getShaderParams().heightScale,
          )
        }
      }
      keepCameraAboveTerrain()
      controls.update()
      terrain.update(camera.position, elapsed)
      props.update(elapsed)

      const snap = terrain.getSnapshot()
      const originKey = `${snap.level0Origin[0]},${snap.level0Origin[1]}`
      if (originKey !== lastOriginKey) {
        lastOriginKey = originKey
        updateMetricsBanner()
      }
    }

    renderer.render(scene, camera)
  })

  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__TERRAIN_PREVIEW_TEST__', {
      configurable: true,
      value: Object.freeze({
        snapshot: () => {
          const snap = terrain.getSnapshot()
          const propSnap = props.getSnapshot()
          return {
            status,
            preset: snap.preset,
            viewMode: snap.params.viewMode,
            wireframe: snap.params.wireframe,
            heightScale: snap.params.heightScale,
            autoSlope: snap.params.autoSlope,
            autoHeight: snap.params.autoHeight,
            usePbrTextures: snap.usePbrTextures,
            pbrTexturesLoaded: snap.pbrTexturesLoaded,
            props: propSnap,
            motion,
            toolMode,
            brushMode,
            inspectorOpen,
            reducedMotion: reducedMotion.matches,
            elapsed,
            sculptCount: snap.sculptCount,
            camera: {
              position: camera.position.toArray(),
              target: controls.target.toArray(),
            },
            clipmap: {
              lodCount: snap.clipmapStats.lodCount,
              vertexCount: snap.clipmapStats.vertexCount,
              triangleCount: snap.clipmapStats.triangleCount,
              terrainDrawCalls: snap.clipmapStats.drawCalls,
              level0Origin: snap.level0Origin,
              levelLastOrigin: snap.levelLastOrigin,
            },
            render: {
              drawCalls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
              dpr: renderer.getPixelRatio(),
            },
          }
        },
        moveCameraTo: (
          x: number,
          y: number,
          z: number,
          tx: number,
          ty: number,
          tz: number,
        ) => {
          camera.position.set(x, y, z)
          controls.target.set(tx, ty, tz)
          controls.update()
          terrain.update(camera.position, elapsed)
          updateMetricsBanner()
        },
        applyTestBrush: (worldX: number, worldZ: number) =>
          terrain.applyBrush(
            {
              mode: brushMode,
              radius: brushRadius,
              strength: brushStrengthForMode(brushMode),
              paintSlot,
            },
            worldX,
            worldZ,
            0.35,
          ),
        sampleHeight: (worldX: number, worldZ: number) =>
          terrain.sampleHeight(worldX, worldZ),
      }),
    })
  }

  addEventListener(
    'pagehide',
    (event) => {
      if (event.persisted) return
      renderer.setAnimationLoop(null)
      controls.dispose()
      props.dispose()
      terrain.dispose()
      renderer.dispose()
    },
    { once: true },
  )
}

try {
  start()
} catch {
  showStatus(
    'error',
    'Terrain3D 지형 미리보기를 시작하지 못했습니다. WebGL2 지원 브라우저에서 다시 열어 주세요.',
  )
  retryButton.onclick = () => location.reload()
}
