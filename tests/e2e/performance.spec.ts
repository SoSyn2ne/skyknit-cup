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

const BASE_URL =
  process.env.DRAGON_PERFORMANCE_URL ?? 'http://127.0.0.1:4176'
const SAMPLE_DURATION_MS = 30_000
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm33'

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

interface FrameMeasurement {
  readonly durationMs: number
  readonly frameCount: number
  readonly bucketFps: readonly number[]
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
  readonly bucketFps: readonly number[]
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

async function collectFrames(page: Page): Promise<FrameMeasurement> {
  return page.evaluate(
    (durationMs) =>
      new Promise<FrameMeasurement>((resolve) => {
        let startTime: number | null = null
        let frameCount = 0
        const buckets: number[] = []

        const sample = (time: number): void => {
          startTime ??= time
          const elapsed = time - startTime
          if (elapsed >= durationMs) {
            resolve({
              durationMs: elapsed,
              frameCount,
              bucketFps: buckets,
            })
            return
          }

          const bucket = Math.floor(elapsed / 1_000)
          buckets[bucket] = (buckets[bucket] ?? 0) + 1
          frameCount += 1
          requestAnimationFrame(sample)
        }

        requestAnimationFrame(sample)
      }),
    SAMPLE_DURATION_MS,
  )
}

async function measure(
  page: Page,
  label: string,
  quality: 'low' | 'high',
  touch: boolean,
  viewport: readonly [number, number],
  mode: 'race' | 'explore' = 'race',
  characterLoadout: CharacterLoadout = DEFAULT_CHARACTER_LOADOUT,
): Promise<PerformanceResult> {
  await page.context().addInitScript(({
    selectedQuality,
    muted,
    raceGhost,
    coinGhost,
    loadout,
  }) => {
    localStorage.setItem(
      'skyknit-cup:settings',
      JSON.stringify({
        version: 10,
        bestTimeMs: raceGhost.durationMs,
        muted,
        musicVolume: 0.35,
        quality: selectedQuality,
        characterLoadout: loadout,
        missionGrades: {},
        coinBestTimesMs: { 'cloud-ruins': coinGhost.durationMs },
        skyLeague: {
          raceTop10Ms: [raceGhost.durationMs],
          coinTop10Ms: { 'cloud-ruins': [coinGhost.durationMs] },
          missionTop10: {},
        },
        ghosts: {
          race: raceGhost,
          coin: { 'cloud-ruins': coinGhost },
          mission: {},
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
    loadout: characterLoadout,
  })
  await page.goto(BASE_URL)
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(characterLoadout)

  if (mode === 'explore') {
    await page.getByRole('button', { name: '하늘 탐험' }).click()
    await page.evaluate(() =>
      window.__DRAGON_RACE_TEST__?.qaExploreRegion('cloud-ruins'),
    )
    await expect
      .poll(async () => (await readSnapshot(page))?.gameMode)
      .toBe('explore')
    await expect
      .poll(async () =>
        (await readSnapshot(page))?.exploration.regionAssets.find(
          (asset) => asset.id === 'cloud-ruins',
        )?.status,
      )
      .toBe('loaded')
    await expect
      .poll(async () => (await readSnapshot(page))?.audio.bgmPlaying)
      .toBe(true)
    await page.evaluate(() =>
      window.__DRAGON_RACE_TEST__?.qaCollectCoin('cloud-ruins', 0),
    )
    await expect
      .poll(async () => (await readSnapshot(page))?.exploration.coinRun.phase)
      .toBe('running')
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
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.ghostVisible, {
      timeout: 5_000,
    })
    .toBe(true)
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

  const start = await readSnapshot(page)
  const frames = await collectFrames(page)
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

  return {
    label,
    viewport,
    quality,
    pixelRatio: end?.render.pixelRatio ?? 0,
    canvas,
    medianFps: median(fullBuckets),
    meanFps,
    minimumBucketFps: Math.min(...fullBuckets),
    bucketFps: fullBuckets,
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
  }
}

async function newMeasuredPage(
  browser: Browser,
  viewport: readonly [number, number],
  touch: boolean,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    hasTouch: touch,
    isMobile: touch,
  })
  return context.newPage()
}

test('meets the 30 second desktop and mobile frame budgets', async ({
  browser,
}) => {
  test.setTimeout(180_000)
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
  await desktopPage.context().close()

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
  await mobilePage.context().close()

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
  await desktopExplorePage.context().close()

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
  await mobileExplorePage.context().close()

  const artifactPath = path.resolve(
    `artifacts/browser-qa/${QA_SCOPE}/performance-30s.json`,
  )
  await mkdir(path.dirname(artifactPath), { recursive: true })
  await writeFile(
    artifactPath,
    `${JSON.stringify({ desktop, mobile, desktopExplore, mobileExplore }, null, 2)}\n`,
    'utf8',
  )
  console.log(JSON.stringify({ desktop, mobile, desktopExplore, mobileExplore }))

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
  expect(desktop.ghostVisible).toBe(true)
  expect(mobile.ghostVisible).toBe(true)
  expect(desktopExplore.ghostVisible).toBe(true)
  expect(mobileExplore.ghostVisible).toBe(true)
})

test('keeps the phoenix and white tiger inside the 30 second guardian budgets', async ({
  browser,
}) => {
  test.setTimeout(180_000)
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
    await desktopPage.context().close()

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
    await mobilePage.context().close()

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
  console.log(JSON.stringify(results))
})
