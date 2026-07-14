import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import type { MissionId } from '../../src/game/missions/missionRules'
import type {
  FestivalHubLandmarkId,
  FestivalHubWindZoneId,
} from '../../src/game/world/festivalHubActivities'

const DEFAULT_SOAK_DURATION_MS = 600_000
const MINIMUM_SOAK_DURATION_MS = 10_000
const MAXIMUM_SOAK_DURATION_MS = 900_000
const MAXIMUM_WARMUP_CYCLES = 12
const REQUIRED_STABLE_WARMUP_SAMPLES = 3
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm32'

const LANDMARK_IDS = [
  'dawnwing-airfield',
  'sunweave-spire',
  'crown-race-arch',
  'wind-loom',
  'whispering-grotto',
] as const satisfies readonly FestivalHubLandmarkId[]

const WIND_ZONE_IDS = [
  'harbor-lift',
  'spire-spiral',
  'arch-tailwind',
] as const satisfies readonly FestivalHubWindZoneId[]

const MISSION_IDS = [
  'first-skyknot',
  'time-trial',
  'clean-flight',
  'no-respawn',
  'boost-mastery',
  'golden-knot',
] as const satisfies readonly MissionId[]

interface ResourceCounts {
  readonly drawCalls: number
  readonly geometries: number
  readonly textures: number
}

function soakDurationMs(rawDuration: string | undefined): number {
  if (rawDuration === undefined) return DEFAULT_SOAK_DURATION_MS
  const parsed = Number(rawDuration)
  if (!Number.isFinite(parsed)) return DEFAULT_SOAK_DURATION_MS
  return Math.min(
    MAXIMUM_SOAK_DURATION_MS,
    Math.max(MINIMUM_SOAK_DURATION_MS, Math.floor(parsed)),
  )
}

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

function resources(snapshot: FlightDebugSnapshot | null): ResourceCounts | null {
  return snapshot === null
    ? null
    : {
        drawCalls: snapshot.render.drawCalls,
        geometries: snapshot.render.geometries,
        textures: snapshot.render.textures,
      }
}

function hasSameMemoryCounts(
  left: ResourceCounts,
  right: ResourceCounts,
): boolean {
  return (
    left.geometries === right.geometries &&
    left.textures === right.textures
  )
}

async function enterFestivalHub(page: Page): Promise<void> {
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'),
  )
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__
            ?.snapshot()
            ?.exploration.regionAssets.find(
              ({ id }) => id === 'festival-hub',
            )?.status ?? null,
      ),
    )
    .toBe('loaded')
}

async function landAndTakeOff(page: Page): Promise<void> {
  const contextAction = page.locator('[data-explore-context]')
  await expect(contextAction).toHaveText('착륙')
  await contextAction.click()
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.movement)
    .toBe('landed')
  await expect(contextAction).toHaveText('이륙')
  await contextAction.click()
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.movement)
    .toBe('airborne')
}

async function discoverFestivalHub(page: Page): Promise<void> {
  for (const landmarkId of LANDMARK_IDS) {
    await page.evaluate(
      (id) => window.__DRAGON_RACE_TEST__?.qaExploreLandmark(id),
      landmarkId,
    )
    await expect
      .poll(
        async () =>
          (await readSnapshot(page))?.exploration.discoveredLandmarkIds ?? [],
      )
      .toContain(landmarkId)
  }

  for (const windZoneId of WIND_ZONE_IDS) {
    await page.evaluate(
      (id) => window.__DRAGON_RACE_TEST__?.qaExploreWindZone(id),
      windZoneId,
    )
    await expect
      .poll(
        async () =>
          (await readSnapshot(page))?.exploration.activeWindZoneIds ?? [],
      )
      .toContain(windZoneId)
  }
}

async function completeFestivalCoinRoute(page: Page): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(
      (coinIndex) =>
        window.__DRAGON_RACE_TEST__?.qaCollectCoin(
          'festival-hub',
          coinIndex,
        ),
      index,
    )
  }
  await expect
    .poll(
      async () =>
        (await readSnapshot(page))?.exploration.coinBestTimesMs[
          'festival-hub'
        ] ?? null,
    )
    .toBeGreaterThan(0)
}

async function openAndCloseMap(page: Page): Promise<void> {
  const mapButton = page.getByRole('button', { name: '군도 지도 열기' })
  await mapButton.click()
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.mapOpen)
    .toBe(true)
  await expect(page.locator('[data-explore-festival-progress]')).toBeVisible()
  await mapButton.click()
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.mapOpen)
    .toBe(false)
}

async function finishSelectedMission(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreChallenge(),
  )
  const contextAction = page.locator('[data-explore-context]')
  await expect(contextAction).toHaveText('레이스 도전')
  await contextAction.click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 5_000,
    })
    .toBe('racing')

  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
    await page.evaluate(() =>
      window.__DRAGON_RACE_TEST__?.qaPassCheckpoint(),
    )
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('finished')
  await page.getByRole('button', { name: '미션 선택' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('ready')
}

async function warmRaceRenderer(page: Page): Promise<void> {
  await page.locator('[data-mission-start="true"]').click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 5_000,
    })
    .toBe('racing')
  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
    await page.evaluate(() =>
      window.__DRAGON_RACE_TEST__?.qaPassCheckpoint(),
    )
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('finished')
  await page.getByRole('button', { name: '미션 선택' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('ready')
}

async function runReplayCycle(
  page: Page,
  cycle: number,
): Promise<ResourceCounts> {
  await page
    .locator('[data-mission-select="true"]')
    .selectOption(MISSION_IDS[cycle % MISSION_IDS.length])
  await enterFestivalHub(page)
  await landAndTakeOff(page)
  await discoverFestivalHub(page)
  await completeFestivalCoinRoute(page)
  await openAndCloseMap(page)
  const loadedResources = resources(await readSnapshot(page))
  if (loadedResources === null) {
    throw new Error('Missing loaded Festival Hub renderer snapshot')
  }
  await finishSelectedMission(page)
  return loadedResources
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .split(String.fromCharCode(27))
    .map((part) => part.replace(/^\[[0-9;]*m/, ''))
    .join('')
}

test('keeps the Festival Hub replay loop stable during an opt-in soak', async ({
  page,
}, testInfo) => {
  test.skip(process.env.M32_SOAK !== '1', 'set M32_SOAK=1 to run the soak')
  test.skip(testInfo.project.name !== 'desktop', 'desktop soak contract')

  const configuredDurationMs = soakDurationMs(
    process.env.M32_SOAK_DURATION_MS,
  )
  test.setTimeout(configuredDurationMs + 120_000)

  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const requestFailures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'failed'
    if (
      failure === 'net::ERR_ABORTED' &&
      request.url().includes('/assets/audio/sovereign-of-the-sunrise-skies-loop.')
    ) {
      return
    }
    requestFailures.push(
      `${request.method()} ${request.url()} ${failure}`,
    )
  })

  let cycles = 0
  let baselineLoadedResources: ResourceCounts | null = null
  let baselineReadyResources: ResourceCounts | null = null
  let lastLoadedResources: ResourceCounts | null = null
  const warmupSamples: Array<{
    readonly loaded: ResourceCounts
    readonly ready: ResourceCounts
  }> = []
  let finalSnapshot: FlightDebugSnapshot | null = null
  let failure: unknown = null
  const overallStartedAt = Date.now()
  let soakStartedAt = overallStartedAt

  try {
    await page.goto('/?qaCourse=1')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    await warmRaceRenderer(page)

    let stableWarmupSamples = 0
    for (
      let warmupCycle = 0;
      warmupCycle < MAXIMUM_WARMUP_CYCLES;
      warmupCycle += 1
    ) {
      const loaded = await runReplayCycle(page, warmupCycle)
      expect(loaded.drawCalls).toBeLessThanOrEqual(120)
      const ready = resources(await readSnapshot(page))
      if (ready === null) {
        throw new Error('Missing warm ready-state renderer snapshot')
      }
      const previous = warmupSamples.at(-1)
      stableWarmupSamples =
        previous !== undefined &&
        hasSameMemoryCounts(previous.loaded, loaded) &&
        hasSameMemoryCounts(previous.ready, ready)
          ? stableWarmupSamples + 1
          : 1
      warmupSamples.push({ loaded, ready })
      if (stableWarmupSamples >= REQUIRED_STABLE_WARMUP_SAMPLES) {
        baselineLoadedResources = loaded
        baselineReadyResources = ready
        break
      }
    }
    if (
      baselineLoadedResources === null ||
      baselineReadyResources === null
    ) {
      throw new Error(
        `Renderer memory did not stabilize during ${MAXIMUM_WARMUP_CYCLES} warmup cycles`,
      )
    }
    soakStartedAt = Date.now()

    while (Date.now() - soakStartedAt < configuredDurationMs || cycles < 2) {
      lastLoadedResources = await runReplayCycle(
        page,
        cycles + warmupSamples.length,
      )
      expect(lastLoadedResources.drawCalls).toBeLessThanOrEqual(120)
      cycles += 1
      await page.waitForTimeout(100)
    }

    finalSnapshot = await readSnapshot(page)
    const finalResources = resources(finalSnapshot)
    expect(baselineLoadedResources).not.toBeNull()
    expect(baselineReadyResources).not.toBeNull()
    expect(lastLoadedResources).not.toBeNull()
    expect(finalResources).not.toBeNull()
    expect(
      lastLoadedResources?.geometries ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(baselineLoadedResources?.geometries ?? 0)
    expect(
      lastLoadedResources?.textures ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(baselineLoadedResources?.textures ?? 0)
    expect(
      finalResources?.geometries ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(baselineReadyResources?.geometries ?? 0)
    expect(
      finalResources?.textures ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(baselineReadyResources?.textures ?? 0)
    expect(finalSnapshot).toMatchObject({
      gameMode: 'race',
      race: { phase: 'ready' },
      audio: {
        musicActive: true,
        bgmPlaying: true,
        bgmPlayFailures: 0,
        ambientWindStrength: 0,
        windBedPlaying: false,
      },
      exploration: {
        loadedRegionIds: [],
        regionMeshCount: 0,
        paused: false,
        mapOpen: false,
        windVisual: { drawCalls: 0 },
      },
    })
    expect(finalSnapshot?.exploration.discoveredLandmarkIds).toEqual(
      expect.arrayContaining(LANDMARK_IDS),
    )
    expect(finalSnapshot?.exploration.traversedWindZoneIds).toEqual(
      expect.arrayContaining(WIND_ZONE_IDS),
    )
    expect(finalSnapshot?.exploration.coinBestTimesMs['festival-hub']).toBeGreaterThan(
      0,
    )
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(requestFailures).toEqual([])
  } catch (error) {
    failure = error
  } finally {
    finalSnapshot ??= await readSnapshot(page).catch(() => null)
    const artifactPath = path.resolve(
      `artifacts/browser-qa/${QA_SCOPE}/soak-10m.json`,
    )
    await mkdir(path.dirname(artifactPath), { recursive: true })
    await writeFile(
      artifactPath,
      `${JSON.stringify(
        {
          configuredDurationMs,
          actualDurationMs: Date.now() - soakStartedAt,
          totalDurationMs: Date.now() - overallStartedAt,
          warmupCycles: warmupSamples.length,
          warmupSamples,
          cycles,
          passed: failure === null,
          failure: failure === null ? null : errorMessage(failure),
          resources: {
            baselineLoaded: baselineLoadedResources,
            lastLoaded: lastLoadedResources,
            baselineReady: baselineReadyResources,
            finalReady: resources(finalSnapshot),
          },
          finalState:
            finalSnapshot === null
              ? null
              : {
                  gameMode: finalSnapshot.gameMode,
                  racePhase: finalSnapshot.race.phase,
                  landmarkCount:
                    finalSnapshot.exploration.discoveredLandmarkIds.length,
                  windZoneCount:
                    finalSnapshot.exploration.traversedWindZoneIds.length,
                  festivalCoinBestMs:
                    finalSnapshot.exploration.coinBestTimesMs[
                      'festival-hub'
                    ] ?? null,
                  regionMeshCount:
                    finalSnapshot.exploration.regionMeshCount,
                  ambientWindStrength:
                    finalSnapshot.audio.ambientWindStrength,
                  windBedPlaying: finalSnapshot.audio.windBedPlaying,
                  bgmPlaying: finalSnapshot.audio.bgmPlaying,
                },
          errors: {
            console: consoleErrors,
            page: pageErrors,
            requests: requestFailures,
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }

  if (failure !== null) throw failure
})
