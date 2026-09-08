import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  canonicalizeGhostRun,
  GHOST_SAMPLE_INTERVAL_MS,
  sampleGhostRun,
  type GhostRun,
  type GhostSample,
} from '../../src/game/competition/ghostRun'
import {
  DEFAULT_CHARACTER_LOADOUT,
  type CharacterLoadout,
} from '../../src/game/customization/characterCatalog'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import type { MissionId } from '../../src/game/missions/missionRules'
import type { OpenWorldRegionId } from '../../src/game/world/openWorldRegions'

const BASE_URL =
  process.env.DRAGON_PERFORMANCE_URL ?? 'http://127.0.0.1:4176'
const SAMPLE_DURATION_MS = 30_000
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm33'
const PERFORMANCE_LAUNCH_ARGS = [
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
] as const

function densifyGhost(keyframes: GhostRun): GhostRun {
  const samples: GhostSample[] = []
  for (
    let elapsedMs = 0;
    elapsedMs <= keyframes.durationMs;
    elapsedMs += GHOST_SAMPLE_INTERVAL_MS
  ) {
    const pose = sampleGhostRun(keyframes, elapsedMs)
    if (pose === null) {
      throw new Error('Representative ghost keyframes must be sampleable')
    }
    samples.push([
      elapsedMs,
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.headingRadians,
      pose.pitchRadians,
      pose.bankRadians,
      pose.boost ? 1 : 0,
      pose.progress,
    ])
  }
  const canonical = canonicalizeGhostRun({
    durationMs: keyframes.durationMs,
    samples,
  })
  if (canonical === null) {
    throw new Error('Representative ghost must satisfy the save contract')
  }
  return canonical
}

const REPRESENTATIVE_RACE_GHOST = densifyGhost({
  durationMs: 60_000,
  samples: [
    [0, 0, 8, 0, 0, 0, 0, 0, 0],
    [5_000, 0, 10, -220, 0, 0, 0, 1, 1],
    [10_000, 50, 24, -460, 0, 0, 0, 0, 2],
    [15_000, 210, 38, -650, 0, 0, 0, 1, 3],
    [20_000, 450, 24, -720, 0, 0, 0, 0, 4],
    [25_000, 680, 12, -620, 0, 0, 0, 1, 5],
    [30_000, 830, 28, -420, 0, 0, 0, 0, 6],
    [35_000, 850, 44, -170, 0, 0, 0, 1, 7],
    [40_000, 720, 28, 45, 0, 0, 0, 0, 8],
    [45_000, 500, 14, 170, 0, 0, 0, 1, 9],
    [50_000, 250, 28, 180, 0, 0, 0, 0, 10],
    [55_000, 40, 42, 50, 0, 0, 0, 1, 11],
    [60_000, -80, 18, -170, 0, 0, 0, 0, 12],
  ],
} as const satisfies GhostRun)

const REPRESENTATIVE_CLOUD_COIN_GHOST = densifyGhost({
  durationMs: 50_000,
  samples: [
    [0, 433.2, 36, 216, 0, 0, 0, 0, 1],
    [5_000, 446, 38, 208, 0, 0, 0, 1, 2],
    [10_000, 456, 40, 194, 0, 0, 0, 0, 3],
    [15_000, 448, 42, 178, 0, 0, 0, 1, 4],
    [20_000, 436, 40, 168, 0, 0, 0, 0, 5],
    [25_000, 430, 41, 160, 0, 0, 0, 1, 6],
    [30_000, 430, 42, 148, 0, 0, 0, 0, 7],
    [35_000, 414, 45, 166, 0, 0, 0, 1, 8],
    [40_000, 402, 46, 190, 0, 0, 0, 0, 9],
    [45_000, 412, 48, 214, 0, 0, 0, 1, 10],
    [50_000, 415.2, 48, 214, 0, 0, 0, 0, 10],
  ],
} as const satisfies GhostRun)

const REPRESENTATIVE_VOLCANIC_COIN_GHOST = densifyGhost({
  durationMs: 50_000,
  samples: [
    [0, -268, 40, -788, 0, 0, 0, 0, 1],
    [5_000, -292, 44, -812, 0, 0, 0, 1, 2],
    [10_000, -300, 48, -838, 0, 0, 0, 0, 3],
    [15_000, -282, 54, -868, 0, 0, 0, 1, 4],
    [20_000, -250, 60, -884, 0, 0, 0, 0, 5],
    [25_000, -218, 62, -874, 0, 0, 0, 1, 6],
    [30_000, -192, 56, -852, 0, 0, 0, 0, 7],
    [35_000, -182, 50, -824, 0, 0, 0, 1, 8],
    [40_000, -200, 46, -798, 0, 0, 0, 0, 9],
    [45_000, -212, 42, -786, 0, 0, 0, 1, 10],
    [50_000, -212, 42, -786, 0, 0, 0, 0, 10],
  ],
} as const satisfies GhostRun)

const REPRESENTATIVE_VOLCANIC_MISSION_GHOST = densifyGhost({
  durationMs: 60_000,
  samples: [
    [0, -240, 34, -720, 0, 0, 0, 0, 0],
    [15_000, -295, 45, -843, 0, 0, 0, 1, 1],
    [30_000, -196, 44, -786, 0, 0, 0, 0, 2],
    [45_000, -212, 45, -875, 0, 0, 0, 1, 3],
    [60_000, -240, 53, -902, 0, 0, 0, 0, 4],
  ],
} as const satisfies GhostRun)

interface FrameMeasurement {
  readonly durationMs: number
  readonly frameCount: number
  readonly bucketFps: readonly number[]
  readonly bucketDiagnostics: readonly FrameBucketDiagnostic[]
}

interface FrameBucketDiagnostic {
  readonly bucketIndex: number
  readonly flightPosition: FlightDebugSnapshot['flight']['position'] | null
  readonly speed: number | null
  readonly outOfBoundsSeconds: number | null
  readonly respawnImmunitySeconds: number | null
  readonly cameraDistanceToDragon: number | null
  readonly dragonDepth: number | null
  readonly lavaWavePhase: string | null
  readonly rockfallPhases: readonly string[]
  readonly lastObstacleId: string | null
}

interface PerformanceResult {
  readonly label: string
  readonly viewport: readonly [number, number]
  readonly quality: 'low' | 'high'
  readonly pixelRatio: number
  readonly canvas: readonly [number, number]
  readonly medianFps: number
  readonly meanFps: number
  readonly minimumBucketFps: number
  readonly minimumTwoSecondFps: number
  readonly bucketFps: readonly number[]
  readonly bucketDiagnostics: readonly FrameBucketDiagnostic[]
  readonly hostFrames: number
  readonly fixedSteps: number
  readonly maxStepsPerFrame: number
  readonly drawCalls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly gameMode: 'race' | 'explore'
  readonly bgmPlaying: boolean
  readonly ghostVisible: boolean
  readonly ghostComparisonDurationMs: number | null
  readonly explorationRegionId: OpenWorldRegionId | null
  readonly regionAsset:
    | FlightDebugSnapshot['exploration']['regionAssets'][number]
    | null
  readonly volcanicVisual:
    | FlightDebugSnapshot['exploration']['volcanicVisual']
    | null
  readonly missionId: MissionId | null
  readonly raceCourseId: FlightDebugSnapshot['race']['courseId']
  readonly controlPattern: 'clockwise-orbit' | null
}

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

function minimumSustainedFps(
  values: readonly number[],
  windowSize: number,
): number {
  if (windowSize < 1 || values.length < windowSize) return 0

  let windowFrames = values
    .slice(0, windowSize)
    .reduce((sum, frames) => sum + frames, 0)
  let minimumFps = windowFrames / windowSize
  for (let index = windowSize; index < values.length; index += 1) {
    windowFrames += values[index] ?? 0
    windowFrames -= values[index - windowSize] ?? 0
    minimumFps = Math.min(minimumFps, windowFrames / windowSize)
  }
  return minimumFps
}

async function beginRepresentativeMissionControl(
  page: Page,
  touch: boolean,
  missionId: MissionId | null,
): Promise<() => Promise<void>> {
  if (missionId !== 'heart-of-sun') return async () => undefined

  if (!touch) {
    await page.keyboard.down('ArrowRight')
    return async () => page.keyboard.up('ArrowRight')
  }

  const joystick = page.locator('[data-touch-role="joystick"]')
  await expect(joystick).toBeVisible()
  const bounds = await joystick.boundingBox()
  if (bounds === null) {
    throw new Error('Touch joystick must have bounds for the mission sample')
  }
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const radius = Math.min(bounds.width, bounds.height) * 0.31
  await page.mouse.move(centerX + radius, centerY)
  await page.mouse.down()
  await expect(joystick).toHaveAttribute('data-active', 'true')
  return async () => page.mouse.up()
}

function expectBoundedVolcanicMissionPath(result: PerformanceResult): void {
  const positions = result.bucketDiagnostics.flatMap(({ flightPosition }) =>
    flightPosition === null ? [] : [flightPosition],
  )
  expect(positions.length).toBeGreaterThanOrEqual(28)

  const horizontalRadii = positions.map(({ x, z }) =>
    Math.hypot(x - -240, z - -820),
  )
  expect(Math.max(...horizontalRadii)).toBeLessThanOrEqual(150)

  const travelledDistance = positions.slice(1).reduce((distance, position, index) => {
    const previous = positions[index]
    return previous === undefined
      ? distance
      : distance + Math.hypot(position.x - previous.x, position.z - previous.z)
  }, 0)
  expect(travelledDistance).toBeGreaterThan(400)
  expect(
    result.bucketDiagnostics.every(
      ({ outOfBoundsSeconds }) => (outOfBoundsSeconds ?? 0) === 0,
    ),
  ).toBe(true)
}

async function collectFrames(page: Page): Promise<FrameMeasurement> {
  return page.evaluate(
    (durationMs) =>
      new Promise<FrameMeasurement>((resolve) => {
        let startTime: number | null = null
        let frameCount = 0
        const buckets: number[] = []
        const bucketDiagnostics: FrameBucketDiagnostic[] = []
        let lastDiagnosticBucket = -1

        const sample = (time: number): void => {
          startTime ??= time
          const elapsed = time - startTime
          if (elapsed >= durationMs) {
            resolve({
              durationMs: elapsed,
              frameCount,
              bucketFps: buckets,
              bucketDiagnostics,
            })
            return
          }

          const bucket = Math.floor(elapsed / 1_000)
          if (bucket !== lastDiagnosticBucket) {
            const snapshot = window.__DRAGON_RACE_TEST__?.snapshot() ?? null
            bucketDiagnostics.push({
              bucketIndex: bucket,
              flightPosition: snapshot?.flight.position ?? null,
              speed: snapshot?.flight.speed ?? null,
              outOfBoundsSeconds: snapshot?.race.outOfBoundsSeconds ?? null,
              respawnImmunitySeconds:
                snapshot?.race.respawnImmunitySeconds ?? null,
              cameraDistanceToDragon:
                snapshot?.camera.cameraDistanceToDragon ?? null,
              dragonDepth: snapshot?.camera.dragonNdc.z ?? null,
              lavaWavePhase:
                snapshot?.race.volcanicHazard.frame?.lavaWave.phase ?? null,
              rockfallPhases:
                snapshot?.race.volcanicHazard.frame?.rockfalls.map(
                  ({ phase }) => phase,
                ) ?? [],
              lastObstacleId: snapshot?.collision.lastObstacleId ?? null,
            })
            lastDiagnosticBucket = bucket
          }
          buckets[bucket] = (buckets[bucket] ?? 0) + 1
          frameCount += 1
          requestAnimationFrame(sample)
        }

        requestAnimationFrame(sample)
      }),
    SAMPLE_DURATION_MS,
  )
}

async function waitForLoadedRegion(
  page: Page,
  regionId: OpenWorldRegionId,
  quality: 'low' | 'high',
): Promise<void> {
  await expect
    .poll(async () =>
      (await readSnapshot(page))?.exploration.regionAssets.find(
        (asset) => asset.id === regionId,
      )?.status,
    )
    .toBe('loaded')
  await expect
    .poll(async () =>
      (await readSnapshot(page))?.exploration.regionAssets.find(
        (asset) => asset.id === regionId,
      )?.lod,
    )
    .toBe(quality)

  if (regionId !== 'volcanic-archipelago') return
  await expect
    .poll(async () => {
      const volcanicVisual = (await readSnapshot(page))?.exploration
        .volcanicVisual
      return {
        active: volcanicVisual?.active,
        loaded: volcanicVisual?.loaded,
        qualityTier: volcanicVisual?.qualityTier,
      }
    })
    .toEqual({ active: true, loaded: true, qualityTier: quality })
  await expect
    .poll(async () => {
      const volcanicVisual = (await readSnapshot(page))?.exploration
        .volcanicVisual
      return (
        (volcanicVisual?.thermalColumnCount ?? 0) > 0 &&
        (volcanicVisual?.ashParticleCount ?? 0) > 0
      )
    })
    .toBe(true)
}

async function measure(
  page: Page,
  label: string,
  quality: 'low' | 'high',
  touch: boolean,
  viewport: readonly [number, number],
  mode: 'race' | 'explore' = 'race',
  characterLoadout: CharacterLoadout = DEFAULT_CHARACTER_LOADOUT,
  explorationRegionId: OpenWorldRegionId = 'cloud-ruins',
  missionId: MissionId | null = null,
): Promise<PerformanceResult> {
  await page.context().addInitScript(({
    selectedQuality,
    muted,
    raceGhost,
    coinGhost,
    volcanicCoinGhost,
    volcanicMissionGhost,
    loadout,
  }) => {
    localStorage.setItem(
      'skyknit-cup:settings',
      JSON.stringify({
        version: 11,
        bestTimeMs: raceGhost.durationMs,
        muted,
        musicVolume: 0.35,
        quality: selectedQuality,
        characterLoadout: loadout,
        missionGrades: { 'golden-knot': 'bronze' },
        coinBestTimesMs: {
          'cloud-ruins': coinGhost.durationMs,
          'volcanic-archipelago': volcanicCoinGhost.durationMs,
        },
        skyLeague: {
          raceTop10Ms: [raceGhost.durationMs],
          coinTop10Ms: {
            'cloud-ruins': [coinGhost.durationMs],
            'volcanic-archipelago': [volcanicCoinGhost.durationMs],
          },
          missionTop10: {
            'heart-of-sun': [
              {
                elapsedMs: volcanicMissionGhost.durationMs,
                grade: 'silver',
              },
            ],
          },
        },
        ghosts: {
          race: raceGhost,
          coin: {
            'cloud-ruins': coinGhost,
            'volcanic-archipelago': volcanicCoinGhost,
          },
          mission: { 'heart-of-sun': volcanicMissionGhost },
        },
        exploration: {
          position: { x: 0, y: 18, z: 20 },
          headingRadians: 0,
          movement: 'airborne',
          discoveredRegionIds: ['festival-hub'],
          destinationRegionId: null,
          discoveredLandmarkIds: [],
          traversedWindZoneIds: [],
        },
      }),
    )
  }, {
    selectedQuality: quality,
    muted: mode === 'race',
    raceGhost: REPRESENTATIVE_RACE_GHOST,
    coinGhost: REPRESENTATIVE_CLOUD_COIN_GHOST,
    volcanicCoinGhost: REPRESENTATIVE_VOLCANIC_COIN_GHOST,
    volcanicMissionGhost: REPRESENTATIVE_VOLCANIC_MISSION_GHOST,
    loadout: characterLoadout,
  })
  const raceUrl = new URL(BASE_URL)
  raceUrl.searchParams.set('mode', 'race')
  await page.goto(raceUrl.href)
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(characterLoadout)
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.source, {
      timeout: 10_000,
    })
    .toBe('glb')

  if (mode === 'explore') {
    await page.getByRole('button', { name: '하늘 탐험' }).click()
    await page.evaluate(
      (regionId) => window.__DRAGON_RACE_TEST__?.qaExploreRegion(regionId),
      explorationRegionId,
    )
    await expect
      .poll(async () => (await readSnapshot(page))?.gameMode)
      .toBe('explore')
    await waitForLoadedRegion(page, explorationRegionId, quality)
    await expect
      .poll(async () => (await readSnapshot(page))?.audio.bgmPlaying)
      .toBe(true)
    await page.evaluate(
      (regionId) => window.__DRAGON_RACE_TEST__?.qaCollectCoin(regionId, 0),
      explorationRegionId,
    )
    await expect
      .poll(async () => (await readSnapshot(page))?.exploration.coinRun.phase)
      .toBe('running')
  } else if (missionId !== null) {
    await page.locator('[data-mission-select="true"]').selectOption(missionId)
    await expect
      .poll(async () => (await readSnapshot(page))?.race.mission.selectedMissionId)
      .toBe(missionId)
    await page.locator('[data-mission-start="true"]').click()
  } else if (touch) {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }
  if (mode === 'race') {
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 7_000,
      })
      .toBe('racing')
    if (missionId === 'heart-of-sun') {
      await expect
        .poll(async () => (await readSnapshot(page))?.race.courseId)
        .toBe('volcanic-archipelago')
      await waitForLoadedRegion(page, 'volcanic-archipelago', quality)
    }
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.ghostVisible, {
      timeout: 5_000,
    })
    .toBe(true)
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.ghostDragon, {
      timeout: 10_000,
    })
    .toMatchObject({
      appearance: 'ghost',
      ghostDetail: 'echo',
      source: 'fallback',
      meshCount: 4,
    })
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      return mode === 'race'
        ? snapshot?.race.ghost.comparisonDurationMs
        : snapshot?.exploration.ghost.comparisonDurationMs
    })
    .toBe(mode === 'race' ? 60_000 : 50_000)
  await page.waitForTimeout(mode === 'explore' ? 5_000 : 1_000)
  if (mode === 'explore') {
    // Let the course heading carry the dragon clear of the adjacent region's
    // LOD overlap, then brake so the 30-second sample stays inside the course.
    await page.keyboard.down('ControlLeft')
  }
  const releaseRepresentativeMissionControl =
    await beginRepresentativeMissionControl(page, touch, missionId)

  const start = await readSnapshot(page)
  let frames: FrameMeasurement
  try {
    frames = await collectFrames(page)
  } finally {
    await releaseRepresentativeMissionControl()
  }
  if (mode === 'explore') {
    await page.keyboard.up('ControlLeft')
  }
  const end = await readSnapshot(page)
  expect(start).not.toBeNull()
  expect(end).not.toBeNull()
  const fullBuckets = frames.bucketFps.slice(1, -1)
  const meanFps =
    fullBuckets.reduce((sum, fps) => sum + fps, 0) / fullBuckets.length
  const canvas = await page.locator('canvas.game-canvas').evaluate((element) => [
    element.width,
    element.height,
  ] as const)
  const measuredRegionId =
    mode === 'explore'
      ? explorationRegionId
      : missionId === 'heart-of-sun'
        ? 'volcanic-archipelago'
        : null

  return {
    label,
    viewport,
    quality,
    pixelRatio: end?.render.pixelRatio ?? 0,
    canvas,
    medianFps: median(fullBuckets),
    meanFps,
    minimumBucketFps: Math.min(...fullBuckets),
    minimumTwoSecondFps: minimumSustainedFps(fullBuckets, 2),
    bucketFps: fullBuckets,
    bucketDiagnostics: frames.bucketDiagnostics.slice(1, -1),
    hostFrames: (end?.hostFrames ?? 0) - (start?.hostFrames ?? 0),
    fixedSteps: (end?.stepCount ?? 0) - (start?.stepCount ?? 0),
    maxStepsPerFrame: end?.maxStepsPerFrame ?? 0,
    drawCalls: end?.render.drawCalls ?? 0,
    triangles: end?.render.triangles ?? 0,
    geometries: end?.render.geometries ?? 0,
    textures: end?.render.textures ?? 0,
    gameMode: end?.gameMode ?? mode,
    bgmPlaying: end?.audio.bgmPlaying ?? false,
    ghostVisible: end?.camera.ghostVisible ?? false,
    ghostComparisonDurationMs:
      mode === 'race'
        ? (end?.race.ghost.comparisonDurationMs ?? null)
        : (end?.exploration.ghost.comparisonDurationMs ?? null),
    explorationRegionId: measuredRegionId,
    regionAsset:
      measuredRegionId !== null
        ? (end?.exploration.regionAssets.find(
            (asset) => asset.id === measuredRegionId,
          ) ?? null)
        : null,
    volcanicVisual:
      measuredRegionId === 'volcanic-archipelago'
        ? (end?.exploration.volcanicVisual ?? null)
        : null,
    missionId,
    raceCourseId: end?.race.courseId ?? 'skyknot',
    controlPattern: missionId === 'heart-of-sun' ? 'clockwise-orbit' : null,
  }
}

async function newMeasuredPage(
  browser: Browser,
  viewport: readonly [number, number],
  touch: boolean,
): Promise<Page> {
  // SwiftShader retains resources at the browser-process level after a WebGL
  // context closes. A fresh process keeps each steady-state sample independent
  // instead of making later profiles pay for earlier profiles' GPU state.
  const measuredBrowser = await browser.browserType().launch({
    headless: true,
    args: [...PERFORMANCE_LAUNCH_ARGS],
  })
  const context = await measuredBrowser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    hasTouch: touch,
    isMobile: touch,
  })
  return context.newPage()
}

async function closeMeasuredPage(page: Page): Promise<void> {
  const measuredBrowser = page.context().browser()
  if (measuredBrowser === null) {
    await page.context().close()
    return
  }
  await measuredBrowser.close()
}

test('meets the 30 second desktop and mobile frame budgets', async ({
  browser,
}) => {
  test.setTimeout(420_000)
  const desktopViewport = [1_440, 900] as const
  const mobileViewport = [844, 390] as const
  const desktopPage = await newMeasuredPage(
    browser,
    desktopViewport,
    false,
  )
  const desktop = await measure(
    desktopPage,
    'desktop-high',
    'high',
    false,
    desktopViewport,
  )
  await closeMeasuredPage(desktopPage)

  const mobilePage = await newMeasuredPage(
    browser,
    mobileViewport,
    true,
  )
  const mobile = await measure(
    mobilePage,
    'mobile-low',
    'low',
    true,
    mobileViewport,
  )
  await closeMeasuredPage(mobilePage)

  const desktopExplorePage = await newMeasuredPage(
    browser,
    desktopViewport,
    false,
  )
  const desktopExplore = await measure(
    desktopExplorePage,
    'desktop-explore-high',
    'high',
    false,
    desktopViewport,
    'explore',
  )
  await closeMeasuredPage(desktopExplorePage)

  const mobileExplorePage = await newMeasuredPage(
    browser,
    mobileViewport,
    true,
  )
  const mobileExplore = await measure(
    mobileExplorePage,
    'mobile-explore-low',
    'low',
    true,
    mobileViewport,
    'explore',
  )
  await closeMeasuredPage(mobileExplorePage)

  const volcanicDesktopPage = await newMeasuredPage(
    browser,
    desktopViewport,
    false,
  )
  const volcanicDesktopExplore = await measure(
    volcanicDesktopPage,
    'volcanic-desktop-explore-high',
    'high',
    false,
    desktopViewport,
    'explore',
    DEFAULT_CHARACTER_LOADOUT,
    'volcanic-archipelago',
  )
  await closeMeasuredPage(volcanicDesktopPage)

  const volcanicMobilePage = await newMeasuredPage(
    browser,
    mobileViewport,
    true,
  )
  const volcanicMobileExplore = await measure(
    volcanicMobilePage,
    'volcanic-mobile-explore-low',
    'low',
    true,
    mobileViewport,
    'explore',
    DEFAULT_CHARACTER_LOADOUT,
    'volcanic-archipelago',
  )
  await closeMeasuredPage(volcanicMobilePage)

  const volcanicDesktopMissionPage = await newMeasuredPage(
    browser,
    desktopViewport,
    false,
  )
  const volcanicDesktopMission = await measure(
    volcanicDesktopMissionPage,
    'volcanic-desktop-mission-high',
    'high',
    false,
    desktopViewport,
    'race',
    DEFAULT_CHARACTER_LOADOUT,
    'cloud-ruins',
    'heart-of-sun',
  )
  await closeMeasuredPage(volcanicDesktopMissionPage)

  const volcanicMobileMissionPage = await newMeasuredPage(
    browser,
    mobileViewport,
    true,
  )
  const volcanicMobileMission = await measure(
    volcanicMobileMissionPage,
    'volcanic-mobile-mission-low',
    'low',
    true,
    mobileViewport,
    'race',
    DEFAULT_CHARACTER_LOADOUT,
    'cloud-ruins',
    'heart-of-sun',
  )
  await closeMeasuredPage(volcanicMobileMissionPage)

  const artifactPath = path.resolve(
    `artifacts/browser-qa/${QA_SCOPE}/performance-30s.json`,
  )
  const performanceResults = {
    desktop,
    mobile,
    desktopExplore,
    mobileExplore,
    volcanicDesktopExplore,
    volcanicMobileExplore,
    volcanicDesktopMission,
    volcanicMobileMission,
  }
  await mkdir(path.dirname(artifactPath), { recursive: true })
  await writeFile(
    artifactPath,
    `${JSON.stringify(performanceResults, null, 2)}\n`,
    'utf8',
  )
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(performanceResults).map(([name, result]) => [
          name,
          {
            medianFps: result.medianFps,
            meanFps: result.meanFps,
            minimumBucketFps: result.minimumBucketFps,
            minimumTwoSecondFps: result.minimumTwoSecondFps,
            hostFrames: result.hostFrames,
            drawCalls: result.drawCalls,
            triangles: result.triangles,
          },
        ]),
      ),
    ),
  )

  expect(desktop.medianFps).toBeGreaterThanOrEqual(55)
  expect(desktop.minimumBucketFps).toBeGreaterThanOrEqual(50)
  expect(mobile.medianFps).toBeGreaterThanOrEqual(30)
  expect(desktop.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(desktop.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(mobile.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(mobile.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(desktopExplore.medianFps).toBeGreaterThanOrEqual(55)
  expect(desktopExplore.minimumBucketFps).toBeGreaterThanOrEqual(50)
  expect(mobileExplore.medianFps).toBeGreaterThanOrEqual(30)
  expect(mobileExplore.minimumBucketFps).toBeGreaterThanOrEqual(30)
  expect(desktopExplore.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(desktopExplore.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(desktop.drawCalls).toBeLessThanOrEqual(120)
  expect(desktopExplore.drawCalls).toBeLessThanOrEqual(120)
  expect(desktopExplore.bgmPlaying).toBe(true)
  expect(mobileExplore.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(mobileExplore.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(mobileExplore.bgmPlaying).toBe(true)
  expect(volcanicDesktopExplore.medianFps).toBeGreaterThanOrEqual(55)
  expect(volcanicDesktopExplore.minimumBucketFps).toBeGreaterThanOrEqual(50)
  expect(volcanicMobileExplore.medianFps).toBeGreaterThanOrEqual(30)
  expect(volcanicMobileExplore.minimumBucketFps).toBeGreaterThanOrEqual(30)
  expect(volcanicDesktopExplore.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(volcanicDesktopExplore.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(volcanicMobileExplore.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(volcanicMobileExplore.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(volcanicDesktopExplore.drawCalls).toBeLessThanOrEqual(120)
  expect(volcanicMobileExplore.drawCalls).toBeLessThanOrEqual(120)
  expect(volcanicDesktopExplore.regionAsset).toEqual({
    id: 'volcanic-archipelago',
    lod: 'high',
    status: 'loaded',
  })
  expect(volcanicMobileExplore.regionAsset).toEqual({
    id: 'volcanic-archipelago',
    lod: 'low',
    status: 'loaded',
  })
  expect(volcanicDesktopExplore.volcanicVisual?.active).toBe(true)
  expect(volcanicDesktopExplore.volcanicVisual?.loaded).toBe(true)
  expect(volcanicDesktopExplore.volcanicVisual?.drawCalls).toBeGreaterThanOrEqual(
    2,
  )
  expect(volcanicDesktopExplore.volcanicVisual?.drawCalls).toBeLessThanOrEqual(6)
  expect(volcanicMobileExplore.volcanicVisual?.active).toBe(true)
  expect(volcanicMobileExplore.volcanicVisual?.loaded).toBe(true)
  expect(volcanicMobileExplore.volcanicVisual?.drawCalls).toBeGreaterThanOrEqual(
    2,
  )
  expect(volcanicMobileExplore.volcanicVisual?.drawCalls).toBeLessThanOrEqual(6)
  expect(volcanicDesktopExplore.bgmPlaying).toBe(true)
  expect(volcanicMobileExplore.bgmPlaying).toBe(true)
  expect(volcanicDesktopExplore.ghostVisible).toBe(true)
  expect(volcanicMobileExplore.ghostVisible).toBe(true)
  expect(volcanicDesktopMission.medianFps).toBeGreaterThanOrEqual(55)
  expect(volcanicDesktopMission.minimumBucketFps).toBeGreaterThanOrEqual(50)
  expect(volcanicMobileMission.medianFps).toBeGreaterThanOrEqual(30)
  expect(volcanicMobileMission.minimumBucketFps).toBeGreaterThanOrEqual(30)
  expect(volcanicDesktopMission.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(volcanicDesktopMission.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(volcanicMobileMission.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(volcanicMobileMission.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(volcanicDesktopMission.drawCalls).toBeLessThanOrEqual(120)
  expect(volcanicMobileMission.drawCalls).toBeLessThanOrEqual(120)
  expect(volcanicDesktopMission.raceCourseId).toBe('volcanic-archipelago')
  expect(volcanicMobileMission.raceCourseId).toBe('volcanic-archipelago')
  expect(volcanicDesktopMission.missionId).toBe('heart-of-sun')
  expect(volcanicMobileMission.missionId).toBe('heart-of-sun')
  expect(volcanicDesktopMission.regionAsset).toEqual({
    id: 'volcanic-archipelago',
    lod: 'high',
    status: 'loaded',
  })
  expect(volcanicMobileMission.regionAsset).toEqual({
    id: 'volcanic-archipelago',
    lod: 'low',
    status: 'loaded',
  })
  expect(volcanicDesktopMission.volcanicVisual?.active).toBe(true)
  expect(volcanicDesktopMission.volcanicVisual?.loaded).toBe(true)
  expect(volcanicDesktopMission.volcanicVisual?.drawCalls).toBeGreaterThanOrEqual(
    2,
  )
  expect(volcanicDesktopMission.volcanicVisual?.drawCalls).toBeLessThanOrEqual(6)
  expect(volcanicMobileMission.volcanicVisual?.active).toBe(true)
  expect(volcanicMobileMission.volcanicVisual?.loaded).toBe(true)
  expect(volcanicMobileMission.volcanicVisual?.drawCalls).toBeGreaterThanOrEqual(
    2,
  )
  expect(volcanicMobileMission.volcanicVisual?.drawCalls).toBeLessThanOrEqual(6)
  expect(volcanicDesktopMission.ghostVisible).toBe(true)
  expect(volcanicMobileMission.ghostVisible).toBe(true)
  expect(volcanicDesktopMission.controlPattern).toBe('clockwise-orbit')
  expect(volcanicMobileMission.controlPattern).toBe('clockwise-orbit')
  expectBoundedVolcanicMissionPath(volcanicDesktopMission)
  expectBoundedVolcanicMissionPath(volcanicMobileMission)
  expect(desktop.ghostVisible).toBe(true)
  expect(mobile.ghostVisible).toBe(true)
  expect(desktopExplore.ghostVisible).toBe(true)
  expect(mobileExplore.ghostVisible).toBe(true)
})

test('keeps the phoenix and white tiger inside the 30 second guardian budgets', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const desktopViewport = [1_440, 900] as const
  const mobileViewport = [844, 390] as const
  const loadouts = [
    {
      characterId: 'ember-phoenix',
      paletteId: 'moonlight',
      accessoryId: 'wind-goggles',
    },
    {
      characterId: 'storm-white-tiger',
      paletteId: 'storm',
      accessoryId: 'festival-ribbon',
    },
  ] as const satisfies readonly CharacterLoadout[]
  const results: Record<
    string,
    { desktopHigh: PerformanceResult; mobileLow: PerformanceResult }
  > = {}

  for (const loadout of loadouts) {
    const desktopPage = await newMeasuredPage(
      browser,
      desktopViewport,
      false,
    )
    const desktopHigh = await measure(
      desktopPage,
      `${loadout.characterId}-desktop-high`,
      'high',
      false,
      desktopViewport,
      'race',
      loadout,
    )
    await closeMeasuredPage(desktopPage)

    const mobilePage = await newMeasuredPage(
      browser,
      mobileViewport,
      true,
    )
    const mobileLow = await measure(
      mobilePage,
      `${loadout.characterId}-mobile-low`,
      'low',
      true,
      mobileViewport,
      'race',
      loadout,
    )
    await closeMeasuredPage(mobilePage)

    results[loadout.characterId] = { desktopHigh, mobileLow }
    expect(desktopHigh.medianFps).toBeGreaterThanOrEqual(55)
    expect(desktopHigh.minimumBucketFps).toBeGreaterThanOrEqual(50)
    expect(desktopHigh.drawCalls).toBeLessThanOrEqual(120)
    expect(desktopHigh.triangles).toBeLessThanOrEqual(100_000)
    expect(mobileLow.medianFps).toBeGreaterThanOrEqual(30)
    expect(mobileLow.triangles).toBeLessThanOrEqual(70_000)
    expect(desktopHigh.fixedSteps).toBeGreaterThanOrEqual(1_790)
    expect(desktopHigh.fixedSteps).toBeLessThanOrEqual(1_810)
    expect(mobileLow.fixedSteps).toBeGreaterThanOrEqual(1_790)
    expect(mobileLow.fixedSteps).toBeLessThanOrEqual(1_810)
  }

  const artifactPath = path.resolve(
    `artifacts/browser-qa/${QA_SCOPE}/performance-characters-30s.json`,
  )
  await mkdir(path.dirname(artifactPath), { recursive: true })
  await writeFile(
    artifactPath,
    `${JSON.stringify(results, null, 2)}\n`,
    'utf8',
  )
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([characterId, profiles]) => [
          characterId,
          Object.fromEntries(
            Object.entries(profiles).map(([profile, result]) => [
              profile,
              {
                medianFps: result.medianFps,
                meanFps: result.meanFps,
                minimumBucketFps: result.minimumBucketFps,
                hostFrames: result.hostFrames,
                drawCalls: result.drawCalls,
                triangles: result.triangles,
              },
            ]),
          ),
        ]),
      ),
    ),
  )
})
