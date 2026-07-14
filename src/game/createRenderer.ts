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
  captureGhostSample,
  createGhostRecorder,
  finishGhostRun,
  matchGhostProgress,
  sampleGhostRun,
  snapshotGhostRecorder,
  type GhostProgressHint,
  type GhostRecorder,
  type GhostRecorderSnapshot,
  type GhostRun,
} from './competition/ghostRun'
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
  FLIGHT_TUNING,
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
import { resolveExplorationObstacleCollision } from './exploration/explorationCollision'
import {
  isFlightStartCode,
  KeyboardInput,
  type KeyboardStateSnapshot,
} from './input/KeyboardInput'
import { InputController, type InputDevice } from './input/InputController'
import { TouchInput } from './input/TouchInput'
import {
  DEFAULT_SETTINGS,
  readSettings,
  recordCoinCompetitionResult,
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
  type RaceLeaguePlacement,
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
  createBoostGauge,
  isBoostGaugeVisible,
  type BoostGauge,
} from './ui/BoostGauge'
import {
  createExplorationHud,
  formatFestivalDiscoveryNotice,
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
  createOpenWorldActivities,
  type OpenWorldActivitiesSnapshot,
  type OpenWorldActivitiesVisual,
} from './world/createOpenWorldActivities'
import {
  OPEN_WORLD_REGIONS,
  getCurrentRegion,
  getDestinationGuidance,
  getDiscoveredRegionIds,
  getRegionById,
  type OpenWorldRegionId,
} from './world/openWorldRegions'
import {
  FESTIVAL_HUB_CHALLENGE_BEACON,
  FESTIVAL_HUB_COLLIDERS,
  FESTIVAL_HUB_LANDMARKS,
  FESTIVAL_HUB_LANDING_PADS,
  FESTIVAL_HUB_WIND_ZONES,
  FESTIVAL_WIND_MAX_SPEED,
  getFestivalJourney,
  sampleFestivalWind,
  stepFestivalDiscovery,
  type FestivalHubLandmarkId,
  type FestivalHubWindZoneId,
  type FestivalJourney,
} from './world/festivalHubActivities'

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
    readonly leagueResult: RaceState['leagueResult']
    readonly raceTop10Ms: readonly number[]
    readonly selectedMissionTop10: RaceState['persistent']['skyLeague']['missionTop10'][keyof RaceState['persistent']['skyLeague']['missionTop10']]
    readonly ghost: {
      readonly recorderSampleCount: number
      readonly comparisonDurationMs: number | null
      readonly liveDeltaMs: number | null
    }
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
    readonly shadows: boolean
    readonly shadowMapSize: number
  }
  readonly exploration: {
    readonly movement: ExplorationFlightState['movement']
    readonly landingPadId: ExplorationFlightState['landingPadId']
    readonly discoveredRegionIds: readonly OpenWorldRegionId[]
    readonly discoveredLandmarkIds: RaceState['persistent']['exploration']['discoveredLandmarkIds']
    readonly traversedWindZoneIds: RaceState['persistent']['exploration']['traversedWindZoneIds']
    readonly activeWindZoneIds: RaceState['persistent']['exploration']['traversedWindZoneIds']
    readonly windStrength: number
    readonly journey: FestivalJourney
    readonly discoveryNotice: string | null
    readonly destinationRegionId: OpenWorldRegionId | null
    readonly loadedRegionIds: readonly OpenWorldRegionId[]
    readonly regionAssets: readonly OpenWorldRegionAssetSnapshot[]
    readonly regionMeshCount: number
    readonly windVisual: OpenWorldActivitiesSnapshot
    readonly paused: boolean
    readonly mapOpen: boolean
    readonly coinRun: CoinRunState
    readonly coinBestTimesMs: RaceState['persistent']['coinBestTimesMs']
    readonly coinRunLeagueResult: RaceLeaguePlacement | null
    readonly coinTop10Ms: readonly number[]
    readonly ghost: {
      readonly recorderSampleCount: number
      readonly comparisonDurationMs: number | null
      readonly liveDeltaMs: number | null
    }
    readonly coinVisual: CoinCourseVisualSnapshot
    readonly collision: CollisionState & {
      readonly lastObstacleId: string | null
    }
  }
}

export type FestivalHubLandingPadId =
  | 'festival-hub-pad'
  | 'festival-tower-pad'
  | 'festival-grotto-pad'

export interface RendererSession {
  readonly canvas: HTMLCanvasElement
  loseContext?: () => void
  qaPassCheckpoint?: () => void
  qaExploreRegion?: (regionId: OpenWorldRegionId) => void
  qaExploreChallenge?: () => void
  qaExploreLandmark?: (landmarkId: FestivalHubLandmarkId) => void
  qaExploreLandmarkView?: (landmarkId: FestivalHubLandmarkId) => void
  qaExploreOverview?: () => void
  qaExploreLandingPad?: (landingPadId: FestivalHubLandingPadId) => void
  qaExploreWindZone?: (windZoneId: FestivalHubWindZoneId) => void
  qaExploreCollision?: () => void
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
  readonly coinRunLeagueResult: RaceLeaguePlacement | null
  readonly raceGhostRecorder: GhostRecorderSnapshot | null
  readonly coinGhostRecorder: GhostRecorderSnapshot | null
  readonly raceGhostMatch: GhostProgressHint | null
  readonly coinGhostMatch: GhostProgressHint | null
  readonly raceLiveDeltaMs: number | null
  readonly coinLiveDeltaMs: number | null
  readonly musicActive: boolean
  readonly musicPlaybackPositionSeconds: number
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
  let pendingBoostGauge: BoostGauge | null = null
  let pendingOpenWorld: OpenWorldVisual | null = null
  let pendingOpenWorldActivities: OpenWorldActivitiesVisual | null = null
  let pendingCoinCourseVisual: CoinCourseVisual | null = null
  let pendingGameAudio: GameAudio | null = null
  let pendingVisibilityChangeHandler: (() => void) | null = null
  const pendingQaControls: HTMLButtonElement[] = []

  try {
    const palette = readScenePalette()
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.type = THREE.PCFShadowMap
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
    const gameAudio = createGameAudio(
      undefined,
      storedSettings.muted,
      storedSettings.musicVolume,
    )
    pendingGameAudio = gameAudio
    gameAudio.setMusicPositionSeconds(
      recovery?.musicPlaybackPositionSeconds ?? 0,
    )
    const handleVisibilityChange = (): void => {
      gameAudio.setPageVisible(!document.hidden)
    }
    pendingVisibilityChangeHandler = handleVisibilityChange
    handleVisibilityChange()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    const forceReducedMotion =
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('qaReducedMotion') === '1'
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
    renderer.shadowMap.enabled = renderQuality.shadows
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
    const openWorldActivities = createOpenWorldActivities(
      scene,
      renderQuality.tier,
      palette.gateRune,
      () => reducedMotionQuery.matches || forceReducedMotion,
    )
    pendingOpenWorldActivities = openWorldActivities
    const coinCourseVisual = createCoinCourseVisual(scene)
    pendingCoinCourseVisual = coinCourseVisual
    let raceState =
      recovery?.raceState ??
      createInitialRaceState({
        checkpointCount: SKYKNOT_COURSE.length,
        boostCapacity: FLIGHT_TUNING.boostCapacity,
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
    const landingPads = [
      ...OPEN_WORLD_REGIONS.filter(
        ({ id }) => id !== 'festival-hub',
      ).map((region) => region.landingPad),
      ...FESTIVAL_HUB_LANDING_PADS,
    ]
    const savedExploration = raceState.persistent.exploration
    const savedLandingPadId =
      savedExploration.movement === 'landed'
        ? requestLanding(
            createExplorationFlightState({
              position: savedExploration.position,
              headingRadians: savedExploration.headingRadians,
              speed: 0,
            }),
            landingPads,
          ).landingPadId
        : null
    const restoresLandedState = savedLandingPadId !== null
    let explorationState: ExplorationFlightState =
      recovery?.explorationState ??
      {
        ...createExplorationFlightState({
          position: savedExploration.position,
          headingRadians: savedExploration.headingRadians,
          speed: restoresLandedState ? 0 : 18,
        }),
        movement: restoresLandedState ? 'landed' : 'airborne',
        landingPadId: savedLandingPadId,
        movementStart: restoresLandedState
          ? { ...savedExploration.position }
          : null,
      }
    let discoveredRegionIds = [
      ...raceState.persistent.exploration.discoveredRegionIds,
    ]
    const discoveredLandmarkIds = [
      ...raceState.persistent.exploration.discoveredLandmarkIds,
    ]
    const traversedWindZoneIds = [
      ...raceState.persistent.exploration.traversedWindZoneIds,
    ]
    let destinationRegionId =
      raceState.persistent.exploration.destinationRegionId
    let explorationPaused = recovery?.explorationPaused ?? false
    let mapOpen = recovery?.mapOpen ?? false
    let coinRunState = recovery?.coinRunState ?? createCoinRunState()
    let coinRunIsNewBest = recovery?.coinRunIsNewBest ?? false
    let coinRunLeagueResult = recovery?.coinRunLeagueResult ?? null
    let raceGhostRecorder: GhostRecorder | null =
      recovery?.raceGhostRecorder === undefined ||
      recovery.raceGhostRecorder === null
        ? null
        : createGhostRecorder(recovery.raceGhostRecorder)
    let coinGhostRecorder: GhostRecorder | null =
      recovery?.coinGhostRecorder === undefined ||
      recovery.coinGhostRecorder === null
        ? null
        : createGhostRecorder(recovery.coinGhostRecorder)
    let raceGhostMatch = recovery?.raceGhostMatch ?? null
    let coinGhostMatch = recovery?.coinGhostMatch ?? null
    let raceLiveDeltaMs = recovery?.raceLiveDeltaMs ?? null
    let coinLiveDeltaMs = recovery?.coinLiveDeltaMs ?? null
    const selectRaceGhost = (): GhostRun | null =>
      raceState.persistent.ghosts.mission[
        raceState.mission.selectedMissionId
      ] ?? raceState.persistent.ghosts.race
    let raceGhostComparison =
      raceGhostRecorder === null ? null : selectRaceGhost()
    let coinGhostComparison =
      coinGhostRecorder === null || coinRunState.regionId === null
        ? null
        : (raceState.persistent.ghosts.coin[coinRunState.regionId] ?? null)
    if (gameMode === 'explore') {
      flightState = explorationState.flight
    }
    gameAudio.setMusicActive(recovery?.musicActive ?? false)
    if (recovery?.musicActive === true) {
      void gameAudio.unlock()
    }
    let outOfBoundsTracker: OutOfBoundsTracker = {
      outsideDurationSeconds: 0,
    }
    let respawnImmunitySeconds = 0
    let collisionState = createCollisionState()
    let lastObstacleId: string | null = null
    let explorationCollisionState = createCollisionState()
    let lastExplorationObstacleId: string | null = null
    let activeWindZoneIds: RaceState['persistent']['exploration']['traversedWindZoneIds'] =
      []
    let activeWindStrength = 0
    let discoveryNotice: string | null = null
    let discoveryNoticeRemainingSeconds = 0
    let qaBoostRemainingSeconds = 0
    let qaCollisionFeedbackRemainingSeconds = 0
    let visualSimulationSeconds = recovery?.visualSimulationSeconds ?? 0
    let explorationSaveRemainingSeconds = 2

    const resetExplorationEnvironment = (): void => {
      explorationCollisionState = createCollisionState()
      lastExplorationObstacleId = null
      activeWindZoneIds = []
      activeWindStrength = 0
      discoveryNotice = null
      discoveryNoticeRemainingSeconds = 0
      gameAudio.setAmbientWind(0)
    }

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

    const clearRaceGhostAttempt = (): void => {
      raceGhostRecorder = null
      raceGhostComparison = null
      raceGhostMatch = null
      raceLiveDeltaMs = null
      sandbox.updateGhost(null, 0)
    }

    const beginRaceGhostAttempt = (): void => {
      raceGhostRecorder = createGhostRecorder()
      raceGhostComparison = selectRaceGhost()
      raceGhostMatch = null
      raceLiveDeltaMs = null
      captureGhostSample(
        raceGhostRecorder,
        0,
        flightState,
        raceState.run.nextCheckpointIndex,
        true,
      )
    }

    const updateRaceGhostDelta = (): void => {
      if (raceGhostComparison === null) {
        raceGhostMatch = null
        raceLiveDeltaMs = null
        return
      }

      const match = matchGhostProgress(
        raceGhostComparison,
        flightState.position,
        raceState.run.nextCheckpointIndex,
        raceGhostMatch ?? undefined,
      )
      raceGhostMatch = match
      raceLiveDeltaMs =
        match === null ? null : raceState.run.elapsedMs - match.referenceElapsedMs
    }

    const finishRaceGhostAttempt = (): void => {
      const elapsedMs = raceState.finalElapsedMs
      const recorder = raceGhostRecorder
      if (elapsedMs === null || recorder === null) {
        raceGhostRecorder = null
        return
      }

      captureGhostSample(
        recorder,
        elapsedMs,
        flightState,
        raceState.run.nextCheckpointIndex,
        true,
      )
      updateRaceGhostDelta()
      const run = finishGhostRun(recorder, elapsedMs)
      raceGhostRecorder = null
      const leagueResult = raceState.leagueResult
      if (run === null || leagueResult === null) return

      let ghosts = raceState.persistent.ghosts
      if (leagueResult.race.isNewBest) {
        ghosts = { ...ghosts, race: run }
      }
      if (leagueResult.mission?.isNewBest === true) {
        ghosts = {
          ...ghosts,
          mission: {
            ...ghosts.mission,
            [leagueResult.mission.missionId]: run,
          },
        }
      }
      if (ghosts !== raceState.persistent.ghosts) {
        raceState = {
          ...raceState,
          persistent: { ...raceState.persistent, ghosts },
        }
      }
    }

    const clearCoinGhostAttempt = (): void => {
      coinGhostRecorder = null
      coinGhostComparison = null
      coinGhostMatch = null
      coinLiveDeltaMs = null
      sandbox.updateGhost(null, 0)
    }

    const resetCoinRunAttempt = (): void => {
      coinRunState = createCoinRunState()
      coinRunIsNewBest = false
      coinRunLeagueResult = null
      clearCoinGhostAttempt()
    }

    const beginCoinGhostAttempt = (regionId: OpenWorldRegionId): void => {
      coinGhostRecorder = createGhostRecorder()
      coinGhostComparison =
        raceState.persistent.ghosts.coin[regionId] ?? null
      coinGhostMatch = null
      coinLiveDeltaMs = null
      captureGhostSample(
        coinGhostRecorder,
        0,
        explorationState.flight,
        coinRunState.collectedCount,
        true,
      )
    }

    const updateCoinGhostDelta = (): void => {
      if (coinGhostComparison === null) {
        coinGhostMatch = null
        coinLiveDeltaMs = null
        return
      }

      const match = matchGhostProgress(
        coinGhostComparison,
        explorationState.flight.position,
        coinRunState.collectedCount,
        coinGhostMatch ?? undefined,
      )
      coinGhostMatch = match
      coinLiveDeltaMs =
        match === null ? null : coinRunState.elapsedMs - match.referenceElapsedMs
    }

    const finishCoinGhostAttempt = (): GhostRun | null => {
      const elapsedMs = coinRunState.finalElapsedMs
      const recorder = coinGhostRecorder
      if (elapsedMs === null || recorder === null) {
        coinGhostRecorder = null
        return null
      }

      captureGhostSample(
        recorder,
        elapsedMs,
        explorationState.flight,
        coinRunState.collectedCount,
        true,
      )
      updateCoinGhostDelta()
      coinGhostRecorder = null
      return finishGhostRun(recorder, elapsedMs)
    }

    const updateGhostVisual = (fixedDt: number): void => {
      if (gameMode === 'race' && raceGhostComparison !== null) {
        const elapsedMs = raceState.finalElapsedMs ?? raceState.run.elapsedMs
        sandbox.updateGhost(
          sampleGhostRun(raceGhostComparison, elapsedMs),
          fixedDt,
        )
        return
      }

      if (
        gameMode === 'explore' &&
        coinGhostComparison !== null &&
        coinRunState.phase !== 'idle'
      ) {
        const elapsedMs =
          coinRunState.finalElapsedMs ?? coinRunState.elapsedMs
        sandbox.updateGhost(
          sampleGhostRun(coinGhostComparison, elapsedMs),
          fixedDt,
        )
        return
      }

      sandbox.updateGhost(null, 0)
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
        finishRaceGhostAttempt()
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

    const toggleMute = (): void => {
      const muted = !raceState.persistent.muted
      raceState = transitionRace(raceState, {
        type: 'SET_MUTED',
        muted,
      })
      gameAudio.setMuted(muted)
      if (!muted) void gameAudio.unlock()
      savePersistentSettings()
    }

    const setMusicVolume = (musicVolume: number): void => {
      raceState = transitionRace(raceState, {
        type: 'SET_MUSIC_VOLUME',
        musicVolume,
      })
      gameAudio.setMusicVolume(raceState.persistent.musicVolume)
      if (
        raceState.persistent.musicVolume > 0 &&
        !raceState.persistent.muted
      ) {
        void gameAudio.unlock()
      }
      savePersistentSettings()
    }

    const applyCoinRunStep = (step: CoinRunStepResult): void => {
      const previousPhase = coinRunState.phase
      coinRunState = step.state
      if (
        previousPhase === 'idle' &&
        coinRunState.phase === 'running' &&
        coinRunState.regionId !== null
      ) {
        coinRunIsNewBest = false
        coinRunLeagueResult = null
        beginCoinGhostAttempt(coinRunState.regionId)
      } else if (coinRunState.phase === 'idle') {
        coinRunIsNewBest = false
        coinRunLeagueResult = null
        clearCoinGhostAttempt()
      }
      if (
        coinRunState.phase === 'running' &&
        coinGhostRecorder !== null
      ) {
        captureGhostSample(
          coinGhostRecorder,
          coinRunState.elapsedMs,
          explorationState.flight,
          coinRunState.collectedCount,
        )
        updateCoinGhostDelta()
      }
      if (step.collectedCoinId !== null) gameAudio.playGate()
      if (
        step.completedRegionId === null ||
        step.completedTimeMs === null
      ) {
        return
      }

      const completedGhost = finishCoinGhostAttempt()
      const result = recordCoinCompetitionResult(
        raceState.persistent,
        step.completedRegionId,
        step.completedTimeMs,
      )
      coinRunIsNewBest = result.placement.isNewBest
      coinRunLeagueResult = {
        rank: result.placement.rank,
        medal: result.placement.medal,
        isNewBest: result.placement.isNewBest,
        inserted: result.placement.inserted,
      }
      const nextSettings =
        completedGhost !== null && result.placement.isNewBest
          ? {
              ...result.settings,
              ghosts: {
                ...result.settings.ghosts,
                coin: {
                  ...result.settings.ghosts.coin,
                  [step.completedRegionId]: completedGhost,
                },
              },
            }
          : result.settings
      if (nextSettings === raceState.persistent) return
      raceState = {
        ...raceState,
        persistent: nextSettings,
      }
      savePersistentSettings()
    }

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
            discoveredLandmarkIds: [...discoveredLandmarkIds],
            traversedWindZoneIds: [...traversedWindZoneIds],
          },
        },
      }
      if (save) savePersistentSettings()
    }

    const currentFestivalJourney = (): FestivalJourney =>
      getFestivalJourney(
        { discoveredLandmarkIds, traversedWindZoneIds },
        raceState.persistent.coinBestTimesMs['festival-hub'],
        raceState.persistent.bestTimeMs,
      )

    const publicFestivalLandmarkCount = (): number =>
      FESTIVAL_HUB_LANDMARKS.filter(
        ({ id, secret }) =>
          !secret && discoveredLandmarkIds.includes(id),
      ).length

    const isAtChallengeBeacon = (): boolean => {
      return (
        Math.hypot(
          explorationState.flight.position.x -
            FESTIVAL_HUB_CHALLENGE_BEACON.position.x,
          explorationState.flight.position.z -
            FESTIVAL_HUB_CHALLENGE_BEACON.position.z,
        ) <= FESTIVAL_HUB_CHALLENGE_BEACON.radius
      )
    }

    const startRaceFromExplore = (): void => {
      syncExplorationPersistence()
      resetExplorationEnvironment()
      gameMode = 'race'
      gameAudio.setMusicActive(true)
      resetCoinRunAttempt()
      explorationPaused = false
      mapOpen = false
      openWorld.clear()
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
      beginRaceGhostAttempt()
    }

    const performExplorationInteraction = (): void => {
      if (explorationPaused || mapOpen) return
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
    const unlockAudioFromFlightGesture = (startsFlight: boolean): void => {
      if (
        startsFlight &&
        gameMode === 'race' &&
        raceState.phase === 'ready'
      ) {
        gameAudio.setMusicActive(true)
      }
      void gameAudio.unlock()
    }
    const touchInput = new TouchInput(() => {
      unlockAudioFromFlightGesture(true)
      inputController.activate('touch')
    })
    pendingTouchInput = touchInput
    const clearInputs = (): void => {
      keyboardInput.clear()
      touchInput.clear()
    }
    const toggleExplorationMap = (): void => {
      mapOpen = !mapOpen
      if (mapOpen) clearInputs()
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
      (code) => {
        unlockAudioFromFlightGesture(isFlightStartCode(code))
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
        gameAudio.setMusicActive(true)
        void gameAudio.unlock()
        previousBestTimeMs = raceState.persistent.bestTimeMs
        raceState = transitionRace(raceState, {
          type: 'START',
          input: touchCapable ? 'touch' : 'keyboard',
        })
        beginRaceGhostAttempt()
      },
      startExplore: () => {
        gameAudio.setMusicActive(true)
        void gameAudio.unlock()
        resetExplorationEnvironment()
        clearRaceGhostAttempt()
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
        clearRaceGhostAttempt()
        resetFlight()
      },
      resume: () => {
        raceState = transitionRace(raceState, { type: 'RESUME' })
      },
      restart: () => {
        raceState = transitionRace(raceState, { type: 'RESTART' })
        previousBestTimeMs = raceState.persistent.bestTimeMs
        resetFlight()
        beginRaceGhostAttempt()
      },
      respawn: () => {
        respawn()
        raceState = transitionRace(raceState, { type: 'RESUME' })
      },
      retry: () => {
        raceState = transitionRace(raceState, { type: 'RETRY' })
        previousBestTimeMs = raceState.persistent.bestTimeMs
        resetFlight()
        beginRaceGhostAttempt()
      },
      toggleMute,
      setMusicVolume,
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
      toggleMap: toggleExplorationMap,
      selectDestination: (id) => {
        destinationRegionId = id
        mapOpen = false
        syncExplorationPersistence()
      },
      pause: () => {
        explorationPaused = !explorationPaused
        if (explorationPaused) clearInputs()
      },
      toggleMute,
      setMusicVolume,
      returnToMissions: () => {
        syncExplorationPersistence()
        resetExplorationEnvironment()
        gameMode = 'race'
        gameAudio.setMusicActive(true)
        resetCoinRunAttempt()
        explorationPaused = false
        mapOpen = false
        openWorld.clear()
        explorationHud?.element.setAttribute('hidden', '')
        raceHud.element.hidden = false
        raceState = transitionRace(raceState, { type: 'RETURN_TO_READY' })
        clearRaceGhostAttempt()
        resetFlight()
      },
    })
    explorationHud.element.hidden = gameMode !== 'explore'
    raceHud.element.hidden = gameMode === 'explore'
    pendingExplorationHud = explorationHud
    const boostGauge = createBoostGauge(host)
    pendingBoostGauge = boostGauge
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
      openWorldActivities.setQuality(renderQuality.tier)
      renderer.shadowMap.enabled = renderQuality.shadows
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
      const musicActive = gameAudio.debugSnapshot().musicActive
      gameAudio.setMusicActive(false)
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
        coinRunLeagueResult:
          coinRunLeagueResult === null
            ? null
            : { ...coinRunLeagueResult },
        raceGhostRecorder:
          raceGhostRecorder === null
            ? null
            : snapshotGhostRecorder(raceGhostRecorder),
        coinGhostRecorder:
          coinGhostRecorder === null
            ? null
            : snapshotGhostRecorder(coinGhostRecorder),
        raceGhostMatch:
          raceGhostMatch === null ? null : { ...raceGhostMatch },
        coinGhostMatch:
          coinGhostMatch === null ? null : { ...coinGhostMatch },
        raceLiveDeltaMs,
        coinLiveDeltaMs,
        musicActive,
        musicPlaybackPositionSeconds: gameAudio.getMusicPositionSeconds(),
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
          gameAudio.setMusicActive(true)
          void gameAudio.unlock()
          previousBestTimeMs = raceState.persistent.bestTimeMs
          raceState = transitionRace(raceState, {
            type: 'START',
            input: inputController.activeDevice,
          })
          beginRaceGhostAttempt()
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
        if (actions.toggleMap && !explorationPaused) toggleExplorationMap()
        if (actions.interact && !explorationPaused) {
          performExplorationInteraction()
        }
      }

      const explorationSimulationActive =
        gameMode === 'explore' && !explorationPaused && !mapOpen

      for (let offset = 0; offset < consumed.steps; offset += 1) {
        const phaseAtStepStart = raceState.phase

        if (explorationSimulationActive) {
          if (discoveryNoticeRemainingSeconds > 0) {
            discoveryNoticeRemainingSeconds = Math.max(
              0,
              discoveryNoticeRemainingSeconds - FIXED_STEP_SECONDS,
            )
            if (discoveryNoticeRemainingSeconds === 0) {
              discoveryNotice = null
            }
          }
          const input = inputController.selectExplorationInput(
            keyboardInput.readExploration(),
            touchInput.readExploration(),
          )
          const previousExplorationPosition =
            explorationState.flight.position
          const movementBeforeStep = explorationState.movement
          explorationCollisionState = stepCollisionState(
            explorationCollisionState,
            FIXED_STEP_SECONDS,
          )
          const windBeforeStep = sampleFestivalWind(
            previousExplorationPosition,
          )
          explorationState = stepExplorationFlight(
            explorationState,
            input,
            FIXED_STEP_SECONDS,
            landingPads,
            {
              windVelocity: windBeforeStep.velocity,
              speedMultiplier: explorationCollisionState.speedMultiplier,
            },
          )
          const collision = resolveExplorationObstacleCollision(
            explorationState,
            previousExplorationPosition,
            1.2,
            FESTIVAL_HUB_COLLIDERS,
          )
          explorationState = collision.state
          if (collision.obstacleId !== null) {
            const application = applyObstacleCollision(
              explorationCollisionState,
              0,
            )
            explorationCollisionState = application.state
            if (application.triggered) {
              lastExplorationObstacleId = collision.obstacleId
            }
          }
          const windAfterStep = sampleFestivalWind(
            explorationState.flight.position,
          )
          activeWindZoneIds = [...windAfterStep.activeZoneIds]
          activeWindStrength = Math.min(
            1,
            Math.hypot(
              windAfterStep.velocity.x,
              windAfterStep.velocity.y,
              windAfterStep.velocity.z,
            ) / FESTIVAL_WIND_MAX_SPEED,
          )
          flightState = explorationState.flight
          if (
            movementBeforeStep === 'airborne' &&
            explorationState.movement === 'airborne'
          ) {
            if (!mapOpen) {
              applyCoinRunStep(
                stepCoinRun(
                  coinRunState,
                  previousExplorationPosition,
                  explorationState.flight.position,
                  FIXED_STEP_SECONDS * 1_000,
                ),
              )
            }
            const discovery = stepFestivalDiscovery(
              { discoveredLandmarkIds, traversedWindZoneIds },
              previousExplorationPosition,
              explorationState.flight.position,
            )
            if (
              discovery.newLandmarkIds.length > 0 ||
              discovery.newWindZoneIds.length > 0
            ) {
              discoveryNotice = formatFestivalDiscoveryNotice(discovery)
              discoveryNoticeRemainingSeconds =
                discoveryNotice === null ? 0 : 2.5
              if (discovery.newLandmarkIds.length > 0) {
                gameAudio.playDiscovery()
              }
              if (discovery.newWindZoneIds.length > 0) {
                gameAudio.playWindEntry()
              }
              discoveredLandmarkIds.push(...discovery.newLandmarkIds)
              traversedWindZoneIds.push(...discovery.newWindZoneIds)
              syncExplorationPersistence()
            }
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

          if (raceGhostRecorder !== null) {
            captureGhostSample(
              raceGhostRecorder,
              raceState.run.elapsedMs,
              flightState,
              raceState.run.nextCheckpointIndex,
            )
            updateRaceGhostDelta()
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

        const sandboxFixedDt =
          gameMode === 'explore'
            ? explorationSimulationActive
              ? FIXED_STEP_SECONDS
              : 0
            : phaseAtStepStart === 'paused'
              ? 0
              : FIXED_STEP_SECONDS
        const sandboxStep = sandbox.step(
          flightState,
          visualSimulationSeconds,
          sandboxFixedDt,
          gameMode === 'explore' ? -1 : raceState.run.nextCheckpointIndex,
          Math.max(
            gameMode === 'explore'
              ? explorationCollisionState.feedbackRemainingSeconds
              : collisionState.feedbackRemainingSeconds,
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
        updateGhostVisual(sandboxFixedDt)
        const wingAudioActive =
          gameMode === 'explore'
            ? explorationSimulationActive &&
              explorationState.movement !== 'landed'
            : phaseAtStepStart === 'racing'
        if (sandboxStep.wingDownstrokeStarted && wingAudioActive) {
          gameAudio.playWingFlap()
        }
      }

      gameAudio.setBoosting(
        (explorationSimulationActive && flightState.isBoosting) ||
          (gameMode === 'race' &&
            raceState.phase === 'racing' &&
            flightState.isBoosting),
      )
      gameAudio.setAmbientWind(
        explorationSimulationActive
          ? 0.12 + activeWindStrength * 0.88
          : 0,
      )
      if (gameMode === 'explore') {
        openWorld.update(
          explorationState.flight.position,
          visualSimulationSeconds,
        )
      }
      const openWorldSnapshot = openWorld.debugSnapshot()
      openWorldActivities.update(
        visualSimulationSeconds,
        openWorldSnapshot.loadedRegionIds,
        explorationSimulationActive,
      )
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
        musicVolume: raceState.persistent.musicVolume,
        quality: raceState.persistent.quality,
        resolvedQuality: renderQuality.tier,
        mission: raceState.mission,
        missionGrades: raceState.persistent.missionGrades,
        liveDeltaMs: raceLiveDeltaMs,
        leagueResult: raceState.leagueResult,
        skyLeague: raceState.persistent.skyLeague,
      })
      if (explorationHud !== null) {
        const currentRegion = getCurrentRegion(
          explorationState.flight.position,
        )
        const journey = currentFestivalJourney()
        explorationHud.update({
          regionName: currentRegion?.name ?? '군도 사이',
          currentRegionId: currentRegion?.id ?? null,
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
          muted: raceState.persistent.muted,
          musicVolume: raceState.persistent.musicVolume,
          coinRun: coinRunState,
          coinBestTimesMs: raceState.persistent.coinBestTimesMs,
          coinRunIsNewBest,
          coinLeagueResult: coinRunLeagueResult,
          skyLeague: raceState.persistent.skyLeague,
          coinLiveDeltaMs,
          selectedMissionId: raceState.mission.selectedMissionId,
          journey: {
            ...journey,
          publicLandmarkCount: publicFestivalLandmarkCount(),
          windZoneCount: traversedWindZoneIds.length,
          secretDiscovered: discoveredLandmarkIds.includes(
            'whispering-grotto',
          ),
          },
          discoveryNotice,
        })
      }
      host.dataset.inputDevice = inputController.activeDevice
      host.dataset.gameMode = gameMode
      boostGauge.element.dataset.mode = gameMode
      boostGauge.update({
        visible: isBoostGaugeVisible(
          gameMode === 'race'
            ? { mode: 'race', phase: raceState.phase }
            : {
                mode: 'explore',
                movement: explorationState.movement,
                paused: explorationPaused,
                mapOpen,
              },
        ),
        boostRemaining: flightState.boostRemaining,
        inputDevice: inputController.activeDevice,
        isBoosting: flightState.isBoosting,
      })
      touchControls.update(
        gameMode === 'explore'
          ? explorationSimulationActive
            ? 'racing'
            : 'paused'
          : raceState.phase,
        gameMode,
      )
      renderer.render(scene, camera)
    })

    const placeQaExploration = (
      position: FlightState['position'],
      headingRadians = 0,
      speed = 0,
      pitchRadians = 0,
    ): void => {
      gameMode = 'explore'
      clearRaceGhostAttempt()
      gameAudio.setMusicActive(true)
      explorationPaused = false
      mapOpen = false
      resetCoinRunAttempt()
      resetExplorationEnvironment()
      explorationState = createExplorationFlightState({
        position: { ...position },
        headingRadians,
        speed,
        pitchRadians,
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
    }

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
            const openWorldSnapshot = openWorld.debugSnapshot()
            const debugCoinRegionId =
              coinRunState.regionId ??
              getCurrentRegion(explorationState.flight.position)?.id ??
              null

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
                leagueResult: raceState.leagueResult,
                raceTop10Ms: [
                  ...raceState.persistent.skyLeague.raceTop10Ms,
                ],
                selectedMissionTop10:
                  raceState.persistent.skyLeague.missionTop10[
                    raceState.mission.selectedMissionId
                  ]?.map((entry) => ({ ...entry })) ?? [],
                ghost: {
                  recorderSampleCount:
                    raceGhostRecorder?.samples.length ?? 0,
                  comparisonDurationMs:
                    raceGhostComparison?.durationMs ?? null,
                  liveDeltaMs: raceLiveDeltaMs,
                },
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
                shadows: renderer.shadowMap.enabled,
                shadowMapSize: renderQuality.shadowMapSize,
              },
              exploration: {
                movement: explorationState.movement,
                landingPadId: explorationState.landingPadId,
                discoveredRegionIds: [...discoveredRegionIds],
                discoveredLandmarkIds: [...discoveredLandmarkIds],
                traversedWindZoneIds: [...traversedWindZoneIds],
                activeWindZoneIds: [...activeWindZoneIds],
                windStrength: activeWindStrength,
                journey: currentFestivalJourney(),
                discoveryNotice,
                destinationRegionId,
                loadedRegionIds: openWorldSnapshot.loadedRegionIds,
                regionAssets: openWorldSnapshot.regionAssets,
                regionMeshCount: openWorldSnapshot.meshCount,
                windVisual: openWorldActivities.debugSnapshot(),
                paused: explorationPaused,
                mapOpen,
                coinRun: { ...coinRunState },
                coinBestTimesMs: {
                  ...raceState.persistent.coinBestTimesMs,
                },
                coinRunLeagueResult:
                  coinRunLeagueResult === null
                    ? null
                    : { ...coinRunLeagueResult },
                coinTop10Ms: [
                  ...(debugCoinRegionId === null
                    ? []
                    : (raceState.persistent.skyLeague.coinTop10Ms[
                        debugCoinRegionId
                      ] ?? [])),
                ],
                ghost: {
                  recorderSampleCount:
                    coinGhostRecorder?.samples.length ?? 0,
                  comparisonDurationMs:
                    coinGhostComparison?.durationMs ?? null,
                  liveDeltaMs: coinLiveDeltaMs,
                },
                coinVisual: coinCourseVisual.debugSnapshot(),
                collision: {
                  ...explorationCollisionState,
                  lastObstacleId: lastExplorationObstacleId,
                },
              },
            }
          },
          qaExploreRegion: (regionId: OpenWorldRegionId): void => {
            const region = getRegionById(regionId)
            gameMode = 'explore'
            clearRaceGhostAttempt()
            gameAudio.setMusicActive(true)
            explorationPaused = false
            mapOpen = false
            resetCoinRunAttempt()
            resetExplorationEnvironment()
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
            placeQaExploration(FESTIVAL_HUB_CHALLENGE_BEACON.position)
          },
          qaExploreLandmark: (
            landmarkId: FestivalHubLandmarkId,
          ): void => {
            const landmark = FESTIVAL_HUB_LANDMARKS.find(
              ({ id }) => id === landmarkId,
            )
            if (landmark !== undefined) {
              const wasMapOpen = mapOpen
              placeQaExploration(landmark.position)
              mapOpen = wasMapOpen
            }
          },
          qaExploreLandingPad: (
            landingPadId: FestivalHubLandingPadId,
          ): void => {
            const landingPad = FESTIVAL_HUB_LANDING_PADS.find(
              ({ id }) => id === landingPadId,
            )
            if (landingPad !== undefined) {
              placeQaExploration({
                ...landingPad.position,
                y: landingPad.position.y + 7,
              })
            }
          },
          qaExploreOverview: (): void => {
            placeQaExploration(
              { x: 0, y: 50, z: 35 },
              0,
              0,
              -0.42,
            )
          },
          qaExploreLandmarkView: (
            landmarkId: FestivalHubLandmarkId,
          ): void => {
            const viewpoints: Record<
              FestivalHubLandmarkId,
              {
                readonly position: FlightState['position']
                readonly headingRadians: number
                readonly pitchRadians: number
              }
            > = {
              'dawnwing-airfield': {
                position: { x: 0, y: 26, z: 18 },
                headingRadians: 0,
                pitchRadians: -0.28,
              },
              'sunweave-spire': {
                position: { x: 0, y: 30, z: -34 },
                headingRadians: -0.56,
                pitchRadians: -0.08,
              },
              'crown-race-arch': {
                position: { x: 5, y: 25, z: -18 },
                headingRadians: 0.74,
                pitchRadians: -0.1,
              },
              'wind-loom': {
                position: { x: -5, y: 26, z: 5 },
                headingRadians: 0.66,
                pitchRadians: -0.04,
              },
              'whispering-grotto': {
                position: { x: -15, y: 20, z: 5 },
                headingRadians: -0.79,
                pitchRadians: -0.2,
              },
            }
            const viewpoint = viewpoints[landmarkId]
            placeQaExploration(
              viewpoint.position,
              viewpoint.headingRadians,
              0,
              viewpoint.pitchRadians,
            )
          },
          qaExploreWindZone: (
            windZoneId: FestivalHubWindZoneId,
          ): void => {
            const windZone = FESTIVAL_HUB_WIND_ZONES.find(
              ({ id }) => id === windZoneId,
            )
            if (windZone !== undefined) {
              placeQaExploration(windZone.center)
            }
          },
          qaExploreCollision: (): void => {
            const obstacle = FESTIVAL_HUB_COLLIDERS.find(
              ({ id }) => id === 'festival-tower-lower',
            )
            if (obstacle === undefined) return
            placeQaExploration(
              {
                x: obstacle.center.x - obstacle.radius - 9,
                y: obstacle.center.y,
                z: obstacle.center.z,
              },
              Math.PI / 2,
              30,
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
            clearRaceGhostAttempt()
            gameAudio.setMusicActive(true)
            explorationPaused = false
            mapOpen = false
            resetExplorationEnvironment()
            if (index === 0) {
              resetCoinRunAttempt()
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
        boostGauge.dispose()
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange,
        )
        pendingVisibilityChangeHandler = null
        gameAudio.dispose()
        resourceNotice.remove()
        for (const qaControl of qaControls) {
          qaControl.remove()
        }
        sandbox.dispose()
        openWorld.dispose()
        openWorldActivities.dispose()
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
    pendingBoostGauge?.dispose()
    pendingOpenWorld?.dispose()
    pendingOpenWorldActivities?.dispose()
    pendingCoinCourseVisual?.dispose()
    if (pendingVisibilityChangeHandler !== null) {
      document.removeEventListener(
        'visibilitychange',
        pendingVisibilityChangeHandler,
      )
    }
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
