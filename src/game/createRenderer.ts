import * as THREE from 'three'

import {
  createGameAudio,
  type GameAudio,
  type GameAudioDebugSnapshot,
} from './audio/GameAudio'
import { GAME_TITLE } from './config'
import { getCoinCourse } from './collectibles/coinCourses'
import {
  createCoinRunState,
  stepCoinRun,
  type CoinRunState,
  type CoinRunStepResult,
} from './collectibles/coinRun'
import {
  applyObstacleCollision,
  createCollisionState,
  findSweptSphereCollision,
  stepCollisionState,
  type CollisionState,
} from './collision/obstacleCollision'
import {
  FIXED_STEP_SECONDS,
  consumeFixedSteps,
  createFixedStepClock,
} from './flight/fixedStep'
import {
  createInitialFlightState,
  getForwardVector,
  stepFlight,
  type FlightInput,
  type FlightState,
} from './flight/flightModel'
import {
  createExplorationFlightState,
  requestLanding,
  requestTakeoff,
  stepExplorationFlight,
  type ExplorationFlightState,
} from './exploration/explorationFlight'
import {
  KeyboardInput,
  type KeyboardStateSnapshot,
} from './input/KeyboardInput'
import { InputController, type InputDevice } from './input/InputController'
import { TouchInput } from './input/TouchInput'
import {
  DEFAULT_SETTINGS,
  readSettings,
  recordCoinBestTime,
  saveSettings,
} from './persistence/records'
import {
  resolveRenderQuality,
  type RenderQualityBudget,
} from './quality/qualityPolicy'
import { prepareRaceForRecovery } from './recovery/recoveryState'
import { progressCheckpoint } from './race/courseProgress'
import {
  advanceRaceClock,
  createInitialRaceState,
  recordCheckpointPass,
  recordRaceBoostActivation,
  recordRaceCollision,
  recordRaceRespawn,
  selectRaceMission,
  syncRaceRun,
  transitionRace,
  type RaceQuality,
  type RaceState,
} from './race/raceState'
import {
  beginRespawn,
  stepOutOfBounds,
  stepRespawnImmunity,
  type OutOfBoundsTracker,
} from './race/raceRuntime'
import { createRaceHud, type RaceHud } from './ui/RaceHud'
import {
  createExplorationHud,
  type ExplorationHud,
} from './ui/ExplorationHud'
import {
  createTouchControls,
  type TouchControls,
} from './ui/TouchControls'
import { createGateIndicator } from './ui/gateIndicator'
import {
  SKYKNOT_COURSE,
  START_ANCHOR,
  getCourseSegment,
  getRespawnAnchor,
} from './world/course'
import {
  createCoinCourseVisual,
  type CoinCourseVisualSnapshot,
  type CoinCourseVisual,
} from './world/createCoinCourseVisual'
import {
  createFlightSandbox,
  type FlightSandboxDebugSnapshot,
  type FlightSandboxPalette,
} from './world/createFlightSandbox'
import { WORLD_OBSTACLES } from './world/worldLayout'
import {
  createOpenWorld,
  type OpenWorldRegionAssetSnapshot,
  type OpenWorldVisual,
} from './world/createOpenWorld'
import {
  OPEN_WORLD_REGIONS,
  getCurrentRegion,
  getDestinationGuidance,
  getDiscoveredRegionIds,
  getRegionById,
  type OpenWorldRegionId,
} from './world/openWorldRegions'

export interface FlightDebugSnapshot {
  readonly gameMode: 'race' | 'explore'
  readonly simulationSeconds: number
  readonly stepCount: number
  readonly hostFrames: number
  readonly maxStepsPerFrame: number
  readonly input: FlightInput
  readonly activeInputDevice: InputDevice
  readonly flight: {
    readonly position: FlightState['position']
    readonly headingRadians: number
    readonly movementPitchRadians: number
    readonly visualBankRadians: number
    readonly speed: number
    readonly boostRemaining: number
    readonly isBoosting: boolean
    readonly distanceTravelled: number
  }
  readonly camera: FlightSandboxDebugSnapshot
  readonly inputClears: Omit<KeyboardStateSnapshot, 'input'>
  readonly race: {
    readonly phase: RaceState['phase']
    readonly countdownRemainingMs: number
    readonly elapsedMs: number
    readonly nextCheckpointIndex: number
    readonly checkpointCount: number
    readonly finalElapsedMs: number | null
    readonly bestTimeMs: number | null
    readonly mission: RaceState['mission']
    readonly missionGrades: RaceState['persistent']['missionGrades']
    readonly outOfBoundsSeconds: number
    readonly respawnImmunitySeconds: number
  }
  readonly collision: CollisionState & {
    readonly lastObstacleId: string | null
  }
  readonly audio: GameAudioDebugSnapshot
  readonly render: {
    readonly drawCalls: number
    readonly triangles: number
    readonly geometries: number
    readonly textures: number
    readonly qualityPreference: RaceState['persistent']['quality']
    readonly qualityTier: RenderQualityBudget['tier']
    readonly pixelRatio: number
  }
  readonly exploration: {
    readonly movement: ExplorationFlightState['movement']
    readonly discoveredRegionIds: readonly OpenWorldRegionId[]
    readonly destinationRegionId: OpenWorldRegionId | null
    readonly loadedRegionIds: readonly OpenWorldRegionId[]
    readonly regionAssets: readonly OpenWorldRegionAssetSnapshot[]
    readonly paused: boolean
    readonly mapOpen: boolean
    readonly coinRun: CoinRunState
    readonly coinBestTimesMs: RaceState['persistent']['coinBestTimesMs']
    readonly coinVisual: CoinCourseVisualSnapshot
  }
}

export interface RendererSession {
  readonly canvas: HTMLCanvasElement
  loseContext?: () => void
  qaPassCheckpoint?: () => void
  qaExploreRegion?: (regionId: OpenWorldRegionId) => void
  qaExploreChallenge?: () => void
  qaCollectCoin?: (regionId: OpenWorldRegionId, index: number) => void
  debugSnapshot?: () => FlightDebugSnapshot
  dispose: () => void
}

export interface RendererRecoveryState {
  readonly raceState: RaceState
  readonly flightState: FlightState
  readonly previousBestTimeMs: number | null
  readonly visualSimulationSeconds: number
  readonly gameMode: 'race' | 'explore'
  readonly explorationState: ExplorationFlightState
  readonly explorationPaused: boolean
  readonly mapOpen: boolean
  readonly coinRunState: CoinRunState
  readonly coinRunIsNewBest: boolean
}

interface ScenePalette extends FlightSandboxPalette {
  readonly skyZenith: string
}

function readScenePalette(): ScenePalette {
  const styles = getComputedStyle(document.documentElement)
  const read = (token: string): string => {
    const value = styles.getPropertyValue(token).trim()

    if (value.length === 0) {
      throw new Error(`Missing scene color token: ${token}`)
    }

    return value
  }

  return {
    skyZenith: read('--sky-zenith'),
    skyHaze: read('--sky-haze'),
    cloud: read('--cloud'),
    ink: read('--ink'),
    rock: read('--rock'),
    dragonEmber: read('--dragon-ember'),
    wingGold: read('--wing-gold'),
    gateRune: read('--gate-rune'),
    collisionCoral: read('--danger'),
  }
}

function disposeScene(scene: THREE.Scene): void {
  const materials = new Set<THREE.Material>()
  const geometries = new Set<THREE.BufferGeometry>()

  scene.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Points)
    ) {
      return
    }

    geometries.add(object.geometry)
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]

    for (const material of objectMaterials) {
      materials.add(material)
    }
  })

  for (const geometry of geometries) {
    geometry.dispose()
  }
  for (const material of materials) {
    material.dispose()
  }
}

export function createRenderer(
  host: HTMLElement,
  onContextLost: (recovery: RendererRecoveryState) => void,
  recovery?: RendererRecoveryState,
): RendererSession {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('forceWebglFailure') ===
      '1'
  ) {
    throw new Error('Forced WebGL renderer failure')
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  const canvas = renderer.domElement
  let pendingScene: THREE.Scene | null = null
  let pendingObserver: ResizeObserver | null = null
  let pendingContextLostHandler: ((event: Event) => void) | null = null
  let pendingKeyboardInput: KeyboardInput | null = null
  let pendingTouchInput: TouchInput | null = null
  let pendingTouchControls: TouchControls | null = null
  let pendingRaceHud: RaceHud | null = null
  let pendingExplorationHud: ExplorationHud | null = null
  let pendingOpenWorld: OpenWorldVisual | null = null
  let pendingCoinCourseVisual: CoinCourseVisual | null = null
  let pendingGameAudio: GameAudio | null = null
  const pendingQaControls: HTMLButtonElement[] = []

  try {
    const palette = readScenePalette()
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setClearColor(palette.skyZenith, 1)

    canvas.className = 'game-canvas'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', `${GAME_TITLE} 공중 레이스`)
    canvas.tabIndex = 0
    canvas.dataset.rendererReady = 'true'

    const scene = new THREE.Scene()
    pendingScene = scene
    scene.background = new THREE.Color(palette.skyZenith)
    scene.fog = new THREE.Fog(palette.skyZenith, 120, 680)

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1_800)
    let recordStorage: Storage | null = null

    try {
      recordStorage = window.localStorage
    } catch {
      recordStorage = null
    }

    const storedSettings =
      recovery?.raceState.persistent ??
      (recordStorage === null
        ? {
            ...DEFAULT_SETTINGS,
            missionGrades: {},
            coinBestTimesMs: {},
            exploration: {
              ...DEFAULT_SETTINGS.exploration,
              position: { ...DEFAULT_SETTINGS.exploration.position },
              discoveredRegionIds: [
                ...DEFAULT_SETTINGS.exploration.discoveredRegionIds,
              ],
            },
          }
        : readSettings(recordStorage))
    const gameAudio = createGameAudio(undefined, storedSettings.muted)
    pendingGameAudio = gameAudio
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    const navigatorCapabilities = window.navigator as Navigator & {
      readonly deviceMemory?: number
    }
    let renderQuality = resolveRenderQuality({
      preference: storedSettings.quality,
      coarsePointer: coarsePointerQuery.matches,
      viewportWidth: host.clientWidth || window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      deviceMemoryGb: navigatorCapabilities.deviceMemory,
      hardwareConcurrency: window.navigator.hardwareConcurrency,
    })
    const sandbox = createFlightSandbox(
      scene,
      camera,
      palette,
      renderQuality,
    )
    const openWorld = createOpenWorld(scene, {
      qualityTier: renderQuality.tier,
    })
    pendingOpenWorld = openWorld
    const coinCourseVisual = createCoinCourseVisual(scene)
    pendingCoinCourseVisual = coinCourseVisual
    let raceState =
      recovery?.raceState ??
      createInitialRaceState({
        checkpointCount: SKYKNOT_COURSE.length,
        boostCapacity: 100,
        spawnPosition: START_ANCHOR.position,
        persistent: storedSettings,
      })
    if (recovery === undefined) {
      raceState = transitionRace(raceState, {
        type: 'ASSETS_READY',
        assetsValid: true,
      })
    }
    let previousBestTimeMs =
      recovery?.previousBestTimeMs ?? raceState.persistent.bestTimeMs
    let flightState = createInitialFlightState(
      recovery?.flightState ?? {
        position: START_ANCHOR.position,
        headingRadians: START_ANCHOR.headingRadians,
      },
    )
    let gameMode: 'race' | 'explore' = recovery?.gameMode ?? 'race'
    const savedExploration = raceState.persistent.exploration
    const savedRegion = getCurrentRegion(savedExploration.position)
    let explorationState: ExplorationFlightState =
      recovery?.explorationState ??
      {
        ...createExplorationFlightState({
          position: savedExploration.position,
          headingRadians: savedExploration.headingRadians,
          speed: savedExploration.movement === 'landed' ? 0 : 18,
        }),
        movement: savedExploration.movement,
        landingPadId:
          savedExploration.movement === 'landed'
            ? (savedRegion?.landingPad.id ?? null)
            : null,
        movementStart: { ...savedExploration.position },
      }
    let discoveredRegionIds = [
      ...raceState.persistent.exploration.discoveredRegionIds,
    ]
    let destinationRegionId =
      raceState.persistent.exploration.destinationRegionId
    let explorationPaused = recovery?.explorationPaused ?? false
    let mapOpen = recovery?.mapOpen ?? false
    let coinRunState = recovery?.coinRunState ?? createCoinRunState()
    let coinRunIsNewBest = recovery?.coinRunIsNewBest ?? false
    if (gameMode === 'explore') {
      flightState = explorationState.flight
    }
    let outOfBoundsTracker: OutOfBoundsTracker = {
      outsideDurationSeconds: 0,
    }
    let respawnImmunitySeconds = 0
    let collisionState = createCollisionState()
    let lastObstacleId: string | null = null
    let qaBoostRemainingSeconds = 0
    let qaCollisionFeedbackRemainingSeconds = 0
    let visualSimulationSeconds = recovery?.visualSimulationSeconds ?? 0
    let explorationSaveRemainingSeconds = 2

    const resetFlight = (): void => {
      flightState = createInitialFlightState({
        position: START_ANCHOR.position,
        headingRadians: START_ANCHOR.headingRadians,
      })
      outOfBoundsTracker = { outsideDurationSeconds: 0 }
      respawnImmunitySeconds = 0
      collisionState = createCollisionState()
      lastObstacleId = null
      sandbox.resetCamera()
      sandbox.step(
        flightState,
        visualSimulationSeconds,
        0,
        raceState.run.nextCheckpointIndex,
      )
      clearInputs()
    }

    const respawn = (trackMission = true): void => {
      if (trackMission) {
        raceState = recordRaceRespawn(raceState)
      }
      const result = beginRespawn(
        flightState,
        getRespawnAnchor(raceState.run.nextCheckpointIndex),
      )
      flightState = result.flight
      outOfBoundsTracker = {
        outsideDurationSeconds: result.outsideDurationSeconds,
      }
      respawnImmunitySeconds = result.immunityRemainingSeconds
      collisionState = createCollisionState()
      lastObstacleId = null
      sandbox.resetCamera()
      sandbox.step(
        flightState,
        visualSimulationSeconds,
        0,
        raceState.run.nextCheckpointIndex,
      )
      clearInputs()
    }

    const passCheckpoint = (checkpointIndex: number): void => {
      const persistentBeforePass = raceState.persistent
      const checkpointBeforePass = raceState.run.nextCheckpointIndex
      const phaseBeforePass = raceState.phase
      raceState = recordCheckpointPass(raceState, checkpointIndex)

      if (raceState.run.nextCheckpointIndex > checkpointBeforePass) {
        sandbox.triggerGatePass(checkpointIndex)
        gameAudio.playGate()
      }

      if (phaseBeforePass !== 'finished' && raceState.phase === 'finished') {
        gameAudio.playFinish()
      }

      if (
        raceState.phase === 'finished' &&
        raceState.persistent !== persistentBeforePass &&
        recordStorage !== null
      ) {
        saveSettings(recordStorage, raceState.persistent)
      }
    }

    const triggerCollision = (
      obstacleId: string,
      immunitySeconds: number,
    ): boolean => {
      const collision = applyObstacleCollision(
        collisionState,
        immunitySeconds,
      )
      collisionState = collision.state
      if (!collision.triggered) {
        return false
      }

      raceState = recordRaceCollision(raceState)
      lastObstacleId = obstacleId
      return true
    }

    const savePersistentSettings = (): void => {
      if (recordStorage !== null) {
        saveSettings(recordStorage, raceState.persistent)
      }
    }

    const applyCoinRunStep = (step: CoinRunStepResult): void => {
      const previousPhase = coinRunState.phase
      coinRunState = step.state
      if (previousPhase === 'idle' && coinRunState.phase === 'running') {
        coinRunIsNewBest = false
      } else if (coinRunState.phase === 'idle') {
        coinRunIsNewBest = false
      }
      if (step.collectedCoinId !== null) gameAudio.playGate()
      if (
        step.completedRegionId === null ||
        step.completedTimeMs === null
      ) {
        return
      }

      const previousBest =
        raceState.persistent.coinBestTimesMs[step.completedRegionId]
      const coinBestTimesMs = recordCoinBestTime(
        raceState.persistent.coinBestTimesMs,
        step.completedRegionId,
        step.completedTimeMs,
      )
      coinRunIsNewBest =
        previousBest === undefined || step.completedTimeMs < previousBest
      if (coinBestTimesMs === raceState.persistent.coinBestTimesMs) return
      raceState = {
        ...raceState,
        persistent: { ...raceState.persistent, coinBestTimesMs },
      }
      savePersistentSettings()
    }

    const landingPads = OPEN_WORLD_REGIONS.map((region) => region.landingPad)
    const syncExplorationPersistence = (save = true): void => {
      raceState = {
        ...raceState,
        persistent: {
          ...raceState.persistent,
          exploration: {
            position: { ...explorationState.flight.position },
            headingRadians: explorationState.flight.headingRadians,
            movement:
              explorationState.movement === 'landed'
                ? 'landed'
                : 'airborne',
            discoveredRegionIds: [...discoveredRegionIds],
            destinationRegionId,
          },
        },
      }
      if (save) savePersistentSettings()
    }

    const isAtChallengeBeacon = (): boolean => {
      const hub = getRegionById('festival-hub')
      return (
        Math.hypot(
          explorationState.flight.position.x - (hub.center.x + 34),
          explorationState.flight.position.z - (hub.center.z - 10),
        ) <= 14
      )
    }

    const startRaceFromExplore = (): void => {
      syncExplorationPersistence()
      gameMode = 'race'
      coinRunState = createCoinRunState()
      coinRunIsNewBest = false
      explorationPaused = false
      mapOpen = false
      openWorld.dispose()
      if (pendingExplorationHud !== null) {
        pendingExplorationHud.element.hidden = true
      }
      if (pendingRaceHud !== null) pendingRaceHud.element.hidden = false
      previousBestTimeMs = raceState.persistent.bestTimeMs
      raceState = transitionRace(raceState, {
        type: 'START',
        input: inputController.activeDevice,
      })
      resetFlight()
    }

    const performExplorationInteraction = (): void => {
      if (isAtChallengeBeacon()) {
        startRaceFromExplore()
        return
      }
      explorationState =
        explorationState.movement === 'landed'
          ? requestTakeoff(explorationState, landingPads)
          : requestLanding(explorationState, landingPads)
      flightState = explorationState.flight
    }

    const touchCapable =
      coarsePointerQuery.matches ||
      window.navigator.maxTouchPoints > 0
    const inputController = new InputController(
      touchCapable ? 'touch' : 'keyboard',
    )
    const touchInput = new TouchInput(() => {
      void gameAudio.unlock()
      inputController.activate('touch')
    })
    pendingTouchInput = touchInput
    const clearInputs = (): void => {
      keyboardInput.clear()
      touchInput.clear()
    }
    const keyboardInput = new KeyboardInput(
      window,
      document,
      () => {
        touchInput.clear()
        if (gameMode === 'explore') {
          explorationPaused = true
        } else if (
          raceState.phase === 'countdown' ||
          raceState.phase === 'racing'
        ) {
          raceState = transitionRace(raceState, { type: 'PAUSE' })
        }
      },
      () => {
        void gameAudio.unlock()
        inputController.activate('keyboard')
      },
    )
    pendingKeyboardInput = keyboardInput
    let fixedStepClock = createFixedStepClock()
    let lastFrameTime: number | null = null
    let hostFrames = 0
    let maxStepsPerFrame = 0

    let disposed = false
    host.append(canvas)
    const resourceNotice = document.createElement('div')
    resourceNotice.className = 'resource-notice'
    resourceNotice.setAttribute('role', 'status')
    resourceNotice.setAttribute('aria-live', 'polite')
    resourceNotice.textContent =
      '정밀 모델을 불러오지 못해 기본 드래곤으로 비행합니다.'
    resourceNotice.hidden = true
    host.append(resourceNotice)
    void sandbox.ready.then((source) => {
      if (!disposed && source === 'fallback') {
        resourceNotice.hidden = false
      }
    })
    const touchControls = createTouchControls(host, touchInput)
    pendingTouchControls = touchControls
    let explorationHud: ExplorationHud | null = null
    const raceHud = createRaceHud(host, {
      start: () => {
        gameMode = 'race'
        previousBestTimeMs = raceState.persistent.bestTimeMs
        raceState = transitionRace(raceState, {
          type: 'START',
          input: touchCapable ? 'touch' : 'keyboard',
        })
      },
      startExplore: () => {
        gameMode = 'explore'
        explorationPaused = false
        mapOpen = false
        flightState = explorationState.flight
        if (pendingRaceHud !== null) pendingRaceHud.element.hidden = true
        if (explorationHud !== null) explorationHud.element.hidden = false
        sandbox.resetCamera()
        openWorld.update(explorationState.flight.position, visualSimulationSeconds)
        clearInputs()
      },
      selectMission: (missionId) => {
        raceState = selectRaceMission(raceState, missionId)
      },
      returnToMissionSelection: () => {
        raceState = transitionRace(raceState, {
          type: 'RETURN_TO_READY',
        })
        resetFlight()
      },
      resume: () => {
        raceState = transitionRace(raceState, { type: 'RESUME' })
      },
      restart: () => {
        raceState = transitionRace(raceState, { type: 'RESTART' })
        previousBestTimeMs = raceState.persistent.bestTimeMs
        resetFlight()
      },
      respawn: () => {
        respawn()
        raceState = transitionRace(raceState, { type: 'RESUME' })
      },
      retry: () => {
        raceState = transitionRace(raceState, { type: 'RETRY' })
        previousBestTimeMs = raceState.persistent.bestTimeMs
        resetFlight()
      },
      toggleMute: () => {
        const muted = !raceState.persistent.muted
        raceState = transitionRace(raceState, {
          type: 'SET_MUTED',
          muted,
        })
        gameAudio.setMuted(muted)
        if (!muted) {
          void gameAudio.unlock()
        }
        savePersistentSettings()
      },
      setQuality: (quality: RaceQuality) => {
        raceState = transitionRace(raceState, {
          type: 'SET_QUALITY',
          quality,
        })
        resize()
        savePersistentSettings()
      },
    }, canvas)
    pendingRaceHud = raceHud
    explorationHud = createExplorationHud(host, {
      interact: performExplorationInteraction,
      toggleMap: () => {
        mapOpen = !mapOpen
      },
      selectDestination: (id) => {
        destinationRegionId = id
        mapOpen = false
        syncExplorationPersistence()
      },
      pause: () => {
        explorationPaused = !explorationPaused
        if (explorationPaused) clearInputs()
      },
      returnToMissions: () => {
        syncExplorationPersistence()
        gameMode = 'race'
        coinRunState = createCoinRunState()
        coinRunIsNewBest = false
        explorationPaused = false
        mapOpen = false
        openWorld.dispose()
        explorationHud?.element.setAttribute('hidden', '')
        raceHud.element.hidden = false
        raceState = transitionRace(raceState, { type: 'RETURN_TO_READY' })
        resetFlight()
      },
    })
    explorationHud.element.hidden = gameMode !== 'explore'
    raceHud.element.hidden = gameMode === 'explore'
    pendingExplorationHud = explorationHud
    const qaControls: HTMLButtonElement[] = []
    const developmentParams = new URLSearchParams(window.location.search)
    const advanceQaCourse = (): void => {
      if (raceState.phase !== 'racing') {
        return
      }

      passCheckpoint(raceState.run.nextCheckpointIndex)

      if (raceState.phase === 'racing') {
        respawn(false)
      }
    }

    if (
      import.meta.env.DEV &&
      developmentParams.get('qaCourse') === '1'
    ) {
      const qaControl = document.createElement('button')
      qaControl.type = 'button'
      qaControl.className = 'qa-course-control'
      qaControl.textContent = 'QA 다음 관문'
      qaControl.addEventListener('click', advanceQaCourse)
      host.append(qaControl)
      qaControls.push(qaControl)
      pendingQaControls.push(qaControl)
    }

    if (
      import.meta.env.DEV &&
      developmentParams.get('qaCollision') === '1'
    ) {
      const qaCollisionControl = document.createElement('button')
      qaCollisionControl.type = 'button'
      qaCollisionControl.className =
        'qa-course-control qa-course-control--collision'
      qaCollisionControl.textContent = 'QA 충돌'
      qaCollisionControl.addEventListener('click', () => {
        if (triggerCollision('qa-feedback', 0)) {
          qaCollisionFeedbackRemainingSeconds = 0.8
        }
      })
      host.append(qaCollisionControl)
      qaControls.push(qaCollisionControl)
      pendingQaControls.push(qaCollisionControl)
    }

    if (
      import.meta.env.DEV &&
      developmentParams.get('qaBoost') === '1'
    ) {
      const qaBoostControl = document.createElement('button')
      qaBoostControl.type = 'button'
      qaBoostControl.className =
        'qa-course-control qa-course-control--boost'
      qaBoostControl.textContent = 'QA 부스트'
      qaBoostControl.addEventListener('click', () => {
        qaBoostRemainingSeconds = 0.8
      })
      host.append(qaBoostControl)
      qaControls.push(qaBoostControl)
      pendingQaControls.push(qaBoostControl)
    }

    if (
      import.meta.env.DEV &&
      developmentParams.get('qaWave') === '1'
    ) {
      const qaWaveControl = document.createElement('button')
      qaWaveControl.type = 'button'
      qaWaveControl.className =
        'qa-course-control qa-course-control--wave'
      qaWaveControl.textContent = 'QA 통과 파동'
      qaWaveControl.addEventListener('click', () => {
        sandbox.triggerGatePass(raceState.run.nextCheckpointIndex)
      })
      host.append(qaWaveControl)
      qaControls.push(qaWaveControl)
      pendingQaControls.push(qaWaveControl)
    }

    sandbox.step(
      flightState,
      0,
      0,
      gameMode === 'explore' ? -1 : raceState.run.nextCheckpointIndex,
      0,
      gameMode === 'explore' ? 'explore' : 'ready',
    )
    if (gameMode === 'explore') {
      openWorld.update(explorationState.flight.position, 0)
    }

    const resize = (): void => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)

      renderQuality = resolveRenderQuality({
        preference: raceState.persistent.quality,
        coarsePointer: coarsePointerQuery.matches,
        viewportWidth: width,
        devicePixelRatio: window.devicePixelRatio,
        deviceMemoryGb: navigatorCapabilities.deviceMemory,
        hardwareConcurrency: window.navigator.hardwareConcurrency,
      })
      sandbox.setQuality(renderQuality)
      openWorld.setQuality(renderQuality.tier)
      renderer.setPixelRatio(renderQuality.pixelRatio)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    pendingObserver = resizeObserver
    resizeObserver.observe(host)
    resize()

    const handleContextLost = (event: Event): void => {
      event.preventDefault()
      renderer.setAnimationLoop(null)
      if (gameMode === 'explore') syncExplorationPersistence(false)
      onContextLost({
        raceState: prepareRaceForRecovery(raceState),
        flightState: createInitialFlightState({
          ...flightState,
          position: { ...flightState.position },
          isBoosting: false,
        }),
        previousBestTimeMs,
        visualSimulationSeconds,
        gameMode,
        explorationState: {
          ...explorationState,
          flight: createInitialFlightState({
            ...explorationState.flight,
            position: { ...explorationState.flight.position },
            isBoosting: false,
          }),
          movementStart:
            explorationState.movementStart === null
              ? null
              : { ...explorationState.movementStart },
        },
        explorationPaused,
        mapOpen,
        coinRunState: { ...coinRunState },
        coinRunIsNewBest,
      })
    }
    pendingContextLostHandler = handleContextLost
    canvas.addEventListener('webglcontextlost', handleContextLost)

    renderer.setAnimationLoop((time) => {
      const rawFrameDelta =
        lastFrameTime === null ? 0 : (time - lastFrameTime) / 1_000
      lastFrameTime = time
      const consumed = consumeFixedSteps(fixedStepClock, rawFrameDelta)
      if (gameMode === 'race') {
        const actions = inputController.selectActions(
          keyboardInput.readActions(),
          touchInput.readActions(),
        )

        if (actions.start && raceState.phase === 'ready') {
          previousBestTimeMs = raceState.persistent.bestTimeMs
          raceState = transitionRace(raceState, {
            type: 'START',
            input: inputController.activeDevice,
          })
          sandbox.resetCamera()
        }

        if (actions.pause) {
          if (
            raceState.phase === 'countdown' ||
            raceState.phase === 'racing'
          ) {
            raceState = transitionRace(raceState, { type: 'PAUSE' })
            clearInputs()
          } else if (raceState.phase === 'paused') {
            raceState = transitionRace(raceState, { type: 'RESUME' })
          }
        }

        if (actions.respawn && raceState.phase === 'racing') respawn()
      } else {
        const actions = inputController.selectExplorationActions(
          keyboardInput.readExplorationActions(),
          touchInput.readExplorationActions(),
        )
        if (actions.pause) {
          explorationPaused = !explorationPaused
          if (explorationPaused) clearInputs()
        }
        if (actions.toggleMap && !explorationPaused) mapOpen = !mapOpen
        if (actions.interact && !explorationPaused) {
          performExplorationInteraction()
        }
      }

      for (let offset = 0; offset < consumed.steps; offset += 1) {
        const phaseAtStepStart = raceState.phase

        if (gameMode === 'explore' && !explorationPaused) {
          const input = inputController.selectExplorationInput(
            keyboardInput.readExploration(),
            touchInput.readExploration(),
          )
          const previousExplorationPosition =
            explorationState.flight.position
          const movementBeforeStep = explorationState.movement
          explorationState = stepExplorationFlight(
            explorationState,
            input,
            FIXED_STEP_SECONDS,
            landingPads,
          )
          flightState = explorationState.flight
          if (
            !mapOpen &&
            movementBeforeStep === 'airborne' &&
            explorationState.movement === 'airborne'
          ) {
            applyCoinRunStep(
              stepCoinRun(
                coinRunState,
                previousExplorationPosition,
                explorationState.flight.position,
                FIXED_STEP_SECONDS * 1_000,
              ),
            )
          }
          const nextDiscovered = getDiscoveredRegionIds(
            explorationState.flight.position,
            discoveredRegionIds,
          )
          if (nextDiscovered.length !== discoveredRegionIds.length) {
            discoveredRegionIds = [...nextDiscovered]
            syncExplorationPersistence()
          }
          visualSimulationSeconds += FIXED_STEP_SECONDS
          explorationSaveRemainingSeconds -= FIXED_STEP_SECONDS
          if (explorationSaveRemainingSeconds <= 0) {
            syncExplorationPersistence()
            explorationSaveRemainingSeconds = 2
          }
        } else if (gameMode === 'race' && phaseAtStepStart === 'countdown') {
          inputController.selectInput(
            keyboardInput.read(),
            touchInput.read(),
          )
          raceState = advanceRaceClock(
            raceState,
            FIXED_STEP_SECONDS * 1_000,
          )
          visualSimulationSeconds += FIXED_STEP_SECONDS
        } else if (gameMode === 'race' && phaseAtStepStart === 'racing') {
          raceState = advanceRaceClock(
            raceState,
            FIXED_STEP_SECONDS * 1_000,
          )
          collisionState = stepCollisionState(
            collisionState,
            FIXED_STEP_SECONDS,
          )
          const previousPosition = flightState.position
          const flightInput = inputController.selectInput(
            keyboardInput.read(),
            touchInput.read(),
          )
          const qaBoostActive =
            import.meta.env.DEV && qaBoostRemainingSeconds > 0
          qaBoostRemainingSeconds = Math.max(
            0,
            qaBoostRemainingSeconds - FIXED_STEP_SECONDS,
          )
          qaCollisionFeedbackRemainingSeconds = Math.max(
            0,
            qaCollisionFeedbackRemainingSeconds - FIXED_STEP_SECONDS,
          )
          const wasBoosting = flightState.isBoosting
          flightState = stepFlight(
            flightState,
            qaBoostActive
              ? { ...flightInput, boost: true }
              : flightInput,
            FIXED_STEP_SECONDS,
            collisionState.speedMultiplier,
          )
          if (!wasBoosting && flightState.isBoosting) {
            raceState = recordRaceBoostActivation(raceState)
          }
          const obstacleHit = findSweptSphereCollision(
            previousPosition,
            flightState.position,
            1.2,
            WORLD_OBSTACLES,
          )

          if (obstacleHit !== null) {
            triggerCollision(
              obstacleHit.obstacleId,
              respawnImmunitySeconds,
            )
          }
          const forward = getForwardVector(flightState)
          raceState = syncRaceRun(raceState, {
            position: flightState.position,
            velocity: {
              x: forward.x * flightState.speed,
              y: forward.y * flightState.speed,
              z: forward.z * flightState.speed,
            },
            boost: flightState.boostRemaining,
          })

          const checkpointProgress = progressCheckpoint(
            previousPosition,
            flightState.position,
            raceState.run.nextCheckpointIndex,
            SKYKNOT_COURSE,
            1.5,
          )

          if (checkpointProgress.passedCheckpointIndex !== null) {
            passCheckpoint(checkpointProgress.passedCheckpointIndex)
          }

          if (raceState.phase === 'racing') {
            const segment = getCourseSegment(
              raceState.run.nextCheckpointIndex,
            )
            const bounds = stepOutOfBounds(
              outOfBoundsTracker,
              flightState.position,
              segment.start,
              segment.end,
              FIXED_STEP_SECONDS,
            )
            outOfBoundsTracker = {
              outsideDurationSeconds: bounds.outsideDurationSeconds,
            }

            if (bounds.shouldRespawn) {
              respawn()
            }
          }

          respawnImmunitySeconds = stepRespawnImmunity(
            respawnImmunitySeconds,
            FIXED_STEP_SECONDS,
          )
          visualSimulationSeconds += FIXED_STEP_SECONDS
        }

        sandbox.step(
          flightState,
          visualSimulationSeconds,
          gameMode === 'explore'
            ? explorationPaused
              ? 0
              : FIXED_STEP_SECONDS
            : phaseAtStepStart === 'paused'
              ? 0
              : FIXED_STEP_SECONDS,
          gameMode === 'explore' ? -1 : raceState.run.nextCheckpointIndex,
          Math.max(
            collisionState.feedbackRemainingSeconds,
            qaCollisionFeedbackRemainingSeconds,
          ),
          gameMode === 'explore'
            ? 'explore'
            : phaseAtStepStart === 'ready'
            ? 'ready'
            : phaseAtStepStart === 'countdown'
              ? 'countdown'
              : 'race',
        )
      }

      gameAudio.setBoosting(
        (gameMode === 'explore' && !explorationPaused && flightState.isBoosting) ||
          (gameMode === 'race' &&
            raceState.phase === 'racing' &&
            flightState.isBoosting),
      )
      if (gameMode === 'explore') {
        openWorld.update(
          explorationState.flight.position,
          visualSimulationSeconds,
        )
      }
      const openWorldSnapshot = openWorld.debugSnapshot()
      coinCourseVisual.update(
        coinRunState,
        openWorldSnapshot.loadedRegionIds,
        visualSimulationSeconds,
        gameMode === 'explore',
      )
      fixedStepClock = consumed.clock
      hostFrames += 1
      maxStepsPerFrame = Math.max(maxStepsPerFrame, consumed.steps)
      const projectedGate = sandbox.gateProjection(host.clientHeight)
      const projectedDiameterCss =
        import.meta.env.DEV &&
        developmentParams.get('qaGateIndicator') === '1'
          ? 20
          : projectedGate.diameterCss
      const gateIndicator = createGateIndicator(
        projectedGate.point,
        projectedDiameterCss,
        { width: host.clientWidth, height: host.clientHeight },
      )
      raceHud.update({
        phase: raceState.phase,
        countdownRemainingMs: raceState.run.countdownRemainingMs,
        elapsedMs: raceState.run.elapsedMs,
        nextCheckpointIndex: raceState.run.nextCheckpointIndex,
        checkpointCount: raceState.config.checkpointCount,
        finalElapsedMs: raceState.finalElapsedMs,
        bestTimeMs: raceState.persistent.bestTimeMs,
        previousBestTimeMs,
        gateIndicator,
        inputDevice: inputController.activeDevice,
        muted: raceState.persistent.muted,
        quality: raceState.persistent.quality,
        resolvedQuality: renderQuality.tier,
        mission: raceState.mission,
        missionGrades: raceState.persistent.missionGrades,
      })
      if (explorationHud !== null) {
        const currentRegion = getCurrentRegion(
          explorationState.flight.position,
        )
        explorationHud.update({
          regionName: currentRegion?.name ?? '군도 사이',
          discoveredRegionIds,
          destinationRegionId,
          destinationGuidance: getDestinationGuidance(
            explorationState.flight.position,
            explorationState.flight.headingRadians,
            destinationRegionId,
          ),
          movement: explorationState.movement,
          canLand:
            explorationState.movement === 'airborne' &&
            requestLanding(explorationState, landingPads) !== explorationState,
          atChallenge: isAtChallengeBeacon(),
          mapOpen,
          paused: explorationPaused,
          coinRun: coinRunState,
          coinBestTimesMs: raceState.persistent.coinBestTimesMs,
          coinRunIsNewBest,
        })
      }
      host.dataset.inputDevice = inputController.activeDevice
      host.dataset.gameMode = gameMode
      touchControls.update(
        gameMode === 'explore'
          ? explorationPaused
            ? 'paused'
            : 'racing'
          : raceState.phase,
        gameMode,
      )
      renderer.render(scene, camera)
    })

    const developmentSession = import.meta.env.DEV
      ? {
          loseContext: (): void => {
            const extension = renderer
              .getContext()
              .getExtension('WEBGL_lose_context')

            if (extension !== null) {
              extension.loseContext()
              return
            }

            canvas.dispatchEvent(
              new Event('webglcontextlost', { cancelable: true }),
            )
          },
          debugSnapshot: (): FlightDebugSnapshot => {
            const keyboardSnapshot = keyboardInput.debugSnapshot()
            const touchSnapshot = touchInput.debugSnapshot()
            const cameraSnapshot = sandbox.debugSnapshot?.(flightState)

            if (cameraSnapshot === undefined) {
              throw new Error('Missing development camera snapshot')
            }

            return {
              gameMode,
              simulationSeconds:
                fixedStepClock.totalSteps * FIXED_STEP_SECONDS,
              stepCount: fixedStepClock.totalSteps,
              hostFrames,
              maxStepsPerFrame,
              input: {
                ...inputController.selectInput(
                  keyboardSnapshot.input,
                  touchSnapshot.input,
                ),
              },
              activeInputDevice: inputController.activeDevice,
              flight: {
                position: { ...flightState.position },
                headingRadians: flightState.headingRadians,
                movementPitchRadians: flightState.pitchRadians,
                visualBankRadians: flightState.bankRadians,
                speed: flightState.speed,
                boostRemaining: flightState.boostRemaining,
                isBoosting: flightState.isBoosting,
                distanceTravelled: flightState.distanceTravelled,
              },
              camera: cameraSnapshot,
              inputClears: {
                blurCount: keyboardSnapshot.blurCount,
                hiddenCount: keyboardSnapshot.hiddenCount,
                lastClearReason: keyboardSnapshot.lastClearReason,
              },
              race: {
                phase: raceState.phase,
                countdownRemainingMs: raceState.run.countdownRemainingMs,
                elapsedMs: raceState.run.elapsedMs,
                nextCheckpointIndex: raceState.run.nextCheckpointIndex,
                checkpointCount: raceState.config.checkpointCount,
                finalElapsedMs: raceState.finalElapsedMs,
                bestTimeMs: raceState.persistent.bestTimeMs,
                mission: raceState.mission,
                missionGrades: raceState.persistent.missionGrades,
                outOfBoundsSeconds:
                  outOfBoundsTracker.outsideDurationSeconds,
                respawnImmunitySeconds,
              },
              collision: {
                ...collisionState,
                lastObstacleId,
              },
              audio: gameAudio.debugSnapshot(),
              render: {
                drawCalls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles,
                geometries: renderer.info.memory.geometries,
                textures: renderer.info.memory.textures,
                qualityPreference: raceState.persistent.quality,
                qualityTier: renderQuality.tier,
                pixelRatio: renderer.getPixelRatio(),
              },
              exploration: {
                movement: explorationState.movement,
                discoveredRegionIds: [...discoveredRegionIds],
                destinationRegionId,
                loadedRegionIds: openWorld.debugSnapshot().loadedRegionIds,
                regionAssets: openWorld.debugSnapshot().regionAssets,
                paused: explorationPaused,
                mapOpen,
                coinRun: { ...coinRunState },
                coinBestTimesMs: {
                  ...raceState.persistent.coinBestTimesMs,
                },
                coinVisual: coinCourseVisual.debugSnapshot(),
              },
            }
          },
          qaExploreRegion: (regionId: OpenWorldRegionId): void => {
            const region = getRegionById(regionId)
            gameMode = 'explore'
            explorationPaused = false
            mapOpen = false
            coinRunState = createCoinRunState()
            coinRunIsNewBest = false
            explorationState = createExplorationFlightState({
              position: {
                x: region.landingPad.position.x,
                y: region.landingPad.position.y + 7,
                z: region.landingPad.position.z,
              },
              headingRadians: 0,
              speed: 0,
            })
            flightState = explorationState.flight
            discoveredRegionIds = [
              ...getDiscoveredRegionIds(
                explorationState.flight.position,
                discoveredRegionIds,
              ),
            ]
            pendingRaceHud?.element.setAttribute('hidden', '')
            if (pendingExplorationHud !== null) {
              pendingExplorationHud.element.hidden = false
            }
            sandbox.resetCamera()
            openWorld.update(
              explorationState.flight.position,
              visualSimulationSeconds,
            )
            syncExplorationPersistence()
          },
          qaExploreChallenge: (): void => {
            const hub = getRegionById('festival-hub')
            gameMode = 'explore'
            explorationPaused = false
            coinRunState = createCoinRunState()
            coinRunIsNewBest = false
            explorationState = createExplorationFlightState({
              position: {
                x: hub.center.x + 34,
                y: hub.center.y + 12,
                z: hub.center.z - 10,
              },
              headingRadians: 0,
              speed: 0,
            })
            flightState = explorationState.flight
            pendingRaceHud?.element.setAttribute('hidden', '')
            if (pendingExplorationHud !== null) {
              pendingExplorationHud.element.hidden = false
            }
            openWorld.update(
              explorationState.flight.position,
              visualSimulationSeconds,
            )
          },
          qaCollectCoin: (
            regionId: OpenWorldRegionId,
            index: number,
          ): void => {
            const course = getCoinCourse(regionId)
            const coin = course.coins[index]
            if (coin === undefined) return
            gameMode = 'explore'
            explorationPaused = false
            mapOpen = false
            if (index === 0) {
              coinRunState = createCoinRunState()
              coinRunIsNewBest = false
            }
            const crossingDistance = coin.radius + 2
            const crossedPosition = {
              x: coin.position.x + crossingDistance,
              y: coin.position.y,
              z: coin.position.z,
            }
            explorationState = createExplorationFlightState({
              position: crossedPosition,
              headingRadians: 0,
              speed: 0,
            })
            flightState = explorationState.flight
            applyCoinRunStep(
              stepCoinRun(
                coinRunState,
                {
                  x: coin.position.x - crossingDistance,
                  y: coin.position.y,
                  z: coin.position.z,
                },
                crossedPosition,
                index === 0 ? 1 : 1_000,
              ),
            )
            const nextCoin = course.coins[index + 1]
            if (nextCoin !== undefined) {
              const deltaX = nextCoin.position.x - coin.position.x
              const deltaZ = nextCoin.position.z - coin.position.z
              const distance = Math.max(1, Math.hypot(deltaX, deltaZ))
              const framingDistance = 24
              const headingRadians = Math.atan2(deltaX, -deltaZ)
              explorationState = createExplorationFlightState({
                position: {
                  x:
                    nextCoin.position.x -
                    (deltaX / distance) * framingDistance,
                  y: nextCoin.position.y,
                  z:
                    nextCoin.position.z -
                    (deltaZ / distance) * framingDistance,
                },
                headingRadians,
                speed: 0,
              })
              flightState = explorationState.flight
              sandbox.resetCamera()
            }
            pendingRaceHud?.element.setAttribute('hidden', '')
            if (pendingExplorationHud !== null) {
              pendingExplorationHud.element.hidden = false
            }
          },
          ...(developmentParams.get('qaCourse') === '1'
            ? { qaPassCheckpoint: advanceQaCourse }
            : {}),
        }
      : {}

    return {
      canvas,
      ...developmentSession,
      dispose: () => {
        if (disposed) {
          return
        }

        disposed = true
        renderer.setAnimationLoop(null)
        if (gameMode === 'explore') syncExplorationPersistence()
        keyboardInput.dispose()
        touchControls.dispose()
        raceHud.dispose()
        explorationHud?.dispose()
        gameAudio.dispose()
        resourceNotice.remove()
        for (const qaControl of qaControls) {
          qaControl.remove()
        }
        sandbox.dispose()
        openWorld.dispose()
        coinCourseVisual.dispose()
        resizeObserver.disconnect()
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        disposeScene(scene)
        renderer.dispose()
        canvas.remove()
        delete host.dataset.inputDevice
        delete host.dataset.gameMode
      },
    }
  } catch (error) {
    renderer.setAnimationLoop(null)
    pendingKeyboardInput?.dispose()
    if (pendingTouchControls !== null) {
      pendingTouchControls.dispose()
    } else {
      pendingTouchInput?.dispose()
    }
    pendingRaceHud?.dispose()
    pendingExplorationHud?.dispose()
    pendingOpenWorld?.dispose()
    pendingCoinCourseVisual?.dispose()
    pendingGameAudio?.dispose()
    for (const qaControl of pendingQaControls) {
      qaControl.remove()
    }
    pendingObserver?.disconnect()

    if (pendingContextLostHandler !== null) {
      canvas.removeEventListener(
        'webglcontextlost',
        pendingContextLostHandler,
      )
    }
    if (pendingScene !== null) {
      disposeScene(pendingScene)
    }

    renderer.dispose()
    canvas.remove()
    throw error
  }
}
