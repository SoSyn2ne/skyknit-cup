import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const SETTINGS_KEY = 'skyknit-cup:settings'
const DEFAULT_SOAK_DURATION_MS = 600_000
const MINIMUM_SOAK_DURATION_MS = 1_000
const MAXIMUM_SOAK_DURATION_MS = 900_000
const MAXIMUM_WARMUP_CYCLES = 12
const REQUIRED_STABLE_WARMUP_SAMPLES = 3
const MINIMUM_MEASURED_CYCLES = 2
const SKY_LEAGUE_TOP_LIMIT = 10
const GHOST_MAX_SAMPLES = 6_001
const MISSION_ID = 'first-skyknot'
const REGION_ID = 'festival-hub'
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm33'

type MissionGrade = 'bronze' | 'silver' | 'gold'

interface StoredMissionEntry {
  readonly elapsedMs: number
  readonly grade: MissionGrade
}

interface StoredGhostRun {
  readonly durationMs: number
  readonly samples: readonly (readonly number[])[]
}

interface StoredSkyLeagueSettings {
  readonly version: number
  readonly skyLeague: {
    readonly raceTop10Ms: readonly number[]
    readonly coinTop10Ms: Readonly<Record<string, readonly number[]>>
    readonly missionTop10: Readonly<
      Record<string, readonly StoredMissionEntry[]>
    >
  }
  readonly ghosts: {
    readonly race: StoredGhostRun | null
    readonly coin: Readonly<Record<string, StoredGhostRun>>
    readonly mission: Readonly<Record<string, StoredGhostRun>>
  }
}

interface ResourceCounts {
  readonly drawCalls: number
  readonly geometries: number
  readonly textures: number
}

interface CompetitionSummary {
  readonly raceRecordCount: number
  readonly coinRecordCounts: Readonly<Record<string, number>>
  readonly missionRecordCounts: Readonly<Record<string, number>>
  readonly ghostSampleCounts: {
    readonly race: number | null
    readonly coin: Readonly<Record<string, number>>
    readonly mission: Readonly<Record<string, number>>
  }
}

interface CycleResult {
  readonly loadedResources: ResourceCounts
  readonly readyResources: ResourceCounts
  readonly competition: CompetitionSummary
}

const MISSION_GRADE_RANK: Readonly<Record<MissionGrade, number>> = {
  bronze: 1,
  silver: 2,
  gold: 3,
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

async function readSnapshot(
  page: Page,
): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function readStoredSettings(
  page: Page,
): Promise<StoredSkyLeagueSettings | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  }, SETTINGS_KEY)
}

function resources(snapshot: FlightDebugSnapshot | null): ResourceCounts {
  if (snapshot === null) {
    throw new Error('Missing renderer snapshot while measuring resources')
  }
  return {
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

function expectZeroMemoryDrift(
  actual: ResourceCounts,
  baseline: ResourceCounts,
): void {
  expect(actual.geometries).toBe(baseline.geometries)
  expect(actual.textures).toBe(baseline.textures)
}

function expectAscendingTimes(
  board: readonly number[],
  label: string,
): void {
  expect(board.length, `${label} exceeds Top 10`).toBeLessThanOrEqual(
    SKY_LEAGUE_TOP_LIMIT,
  )
  for (let index = 0; index < board.length; index += 1) {
    const elapsedMs = board[index]
    expect(elapsedMs, `${label}[${index}] must be positive`).toBeGreaterThan(
      0,
    )
    if (index > 0) {
      expect(
        board[index - 1],
        `${label} must stay sorted fastest-first`,
      ).toBeLessThanOrEqual(elapsedMs ?? 0)
    }
  }
}

function expectSortedMissionBoard(
  board: readonly StoredMissionEntry[],
  label: string,
): void {
  expect(board.length, `${label} exceeds Top 10`).toBeLessThanOrEqual(
    SKY_LEAGUE_TOP_LIMIT,
  )
  for (let index = 0; index < board.length; index += 1) {
    const entry = board[index]
    expect(entry?.elapsedMs, `${label}[${index}] must be positive`).toBeGreaterThan(
      0,
    )
    expect(entry?.grade, `${label}[${index}] has an invalid grade`).toMatch(
      /^(bronze|silver|gold)$/,
    )
    if (index === 0 || entry === undefined) continue
    const previous = board[index - 1]
    if (previous === undefined) continue
    const previousRank = MISSION_GRADE_RANK[previous.grade]
    const rank = MISSION_GRADE_RANK[entry.grade]
    expect(
      previousRank,
      `${label} must stay sorted by grade-first ranking`,
    ).toBeGreaterThanOrEqual(rank)
    if (previousRank === rank) {
      expect(
        previous.elapsedMs,
        `${label} equal grades must stay fastest-first`,
      ).toBeLessThanOrEqual(entry.elapsedMs)
    }
  }
}

function expectBoundedGhost(run: StoredGhostRun, label: string): void {
  expect(run.durationMs, `${label} duration must be positive`).toBeGreaterThan(
    0,
  )
  expect(run.samples.length, `${label} needs start and finish samples`).toBeGreaterThanOrEqual(
    2,
  )
  expect(run.samples.length, `${label} exceeds the 10-minute sample cap`).toBeLessThanOrEqual(
    GHOST_MAX_SAMPLES,
  )
  expect(run.samples[0]?.[0], `${label} must start at zero`).toBe(0)
  expect(
    run.samples.at(-1)?.[0],
    `${label} must end at its duration`,
  ).toBe(run.durationMs)
  for (let index = 1; index < run.samples.length; index += 1) {
    const previous = run.samples[index - 1]
    const sample = run.samples[index]
    expect(sample?.[0], `${label} sample clocks must be monotonic`).toBeGreaterThan(
      previous?.[0] ?? Number.NEGATIVE_INFINITY,
    )
    expect(
      sample?.[8],
      `${label} progress must never move backward`,
    ).toBeGreaterThanOrEqual(previous?.[8] ?? 0)
  }
}

async function validateStoredCompetition(
  page: Page,
): Promise<CompetitionSummary> {
  const settings = await readStoredSettings(page)
  expect(settings).not.toBeNull()
  if (settings === null) throw new Error('Missing persisted M33 settings')
  expect(settings.version).toBe(8)

  expectAscendingTimes(settings.skyLeague.raceTop10Ms, 'race Top 10')
  for (const [regionId, board] of Object.entries(
    settings.skyLeague.coinTop10Ms,
  )) {
    expectAscendingTimes(board, `${regionId} coin Top 10`)
  }
  for (const [missionId, board] of Object.entries(
    settings.skyLeague.missionTop10,
  )) {
    expectSortedMissionBoard(board, `${missionId} mission Top 10`)
  }

  expect(settings.skyLeague.raceTop10Ms.length).toBeGreaterThan(0)
  expect(settings.skyLeague.coinTop10Ms[REGION_ID]?.length ?? 0).toBeGreaterThan(
    0,
  )
  expect(settings.skyLeague.missionTop10[MISSION_ID]?.length ?? 0).toBeGreaterThan(
    0,
  )

  const raceGhost = settings.ghosts.race
  const coinGhost = settings.ghosts.coin[REGION_ID]
  const missionGhost = settings.ghosts.mission[MISSION_ID]
  expect(raceGhost).not.toBeNull()
  expect(coinGhost).toBeDefined()
  expect(missionGhost).toBeDefined()
  if (raceGhost === null || coinGhost === undefined || missionGhost === undefined) {
    throw new Error('Missing persisted M33 best-run ghost')
  }

  expectBoundedGhost(raceGhost, 'race ghost')
  for (const [regionId, run] of Object.entries(settings.ghosts.coin)) {
    expectBoundedGhost(run, `${regionId} coin ghost`)
  }
  for (const [missionId, run] of Object.entries(settings.ghosts.mission)) {
    expectBoundedGhost(run, `${missionId} mission ghost`)
  }

  return {
    raceRecordCount: settings.skyLeague.raceTop10Ms.length,
    coinRecordCounts: Object.fromEntries(
      Object.entries(settings.skyLeague.coinTop10Ms).map(
        ([regionId, board]) => [regionId, board.length],
      ),
    ),
    missionRecordCounts: Object.fromEntries(
      Object.entries(settings.skyLeague.missionTop10).map(
        ([missionId, board]) => [missionId, board.length],
      ),
    ),
    ghostSampleCounts: {
      race: raceGhost.samples.length,
      coin: Object.fromEntries(
        Object.entries(settings.ghosts.coin).map(([regionId, run]) => [
          regionId,
          run.samples.length,
        ]),
      ),
      mission: Object.fromEntries(
        Object.entries(settings.ghosts.mission).map(([missionId, run]) => [
          missionId,
          run.samples.length,
        ]),
      ),
    },
  }
}

async function enterFestivalHub(page: Page): Promise<void> {
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'),
  )
  await expect
    .poll(async () =>
      (await readSnapshot(page))?.exploration.regionAssets.find(
        ({ id }) => id === REGION_ID,
      )?.status,
    )
    .toBe('loaded')
}

async function completeCoinAttempt(page: Page): Promise<void> {
  await page.evaluate((regionId) => {
    for (let index = 0; index < 10; index += 1) {
      window.__DRAGON_RACE_TEST__?.qaCollectCoin(regionId, index)
    }
  }, REGION_ID)
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.coinRun.phase)
    .toBe('completed')
}

async function finishActiveRace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const race = window.__DRAGON_RACE_TEST__?.snapshot()?.race
    const remaining =
      (race?.checkpointCount ?? 0) - (race?.nextCheckpointIndex ?? 0)
    for (let checkpoint = 0; checkpoint < remaining; checkpoint += 1) {
      window.__DRAGON_RACE_TEST__?.qaPassCheckpoint()
    }
  })
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('finished')
}

async function completeRaceAndMissionRetryPair(page: Page): Promise<void> {
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
  await finishActiveRace(page)

  await page.getByRole('button', { name: '다시 달리기' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.ghostVisible, {
      timeout: 5_000,
    })
    .toBe(true)
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 5_000,
    })
    .toBe('racing')
  await finishActiveRace(page)

  await page.getByRole('button', { name: '미션 선택' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('ready')
  await page.waitForTimeout(100)
}

async function runCompetitionCycle(page: Page): Promise<CycleResult> {
  await page.locator('[data-mission-select="true"]').selectOption(MISSION_ID)
  await enterFestivalHub(page)
  await completeCoinAttempt(page)
  await completeCoinAttempt(page)
  const loadedResources = resources(await readSnapshot(page))
  expect(loadedResources.drawCalls).toBeLessThanOrEqual(120)

  await completeRaceAndMissionRetryPair(page)
  const readyResources = resources(await readSnapshot(page))
  const competition = await validateStoredCompetition(page)
  return { loadedResources, readyResources, competition }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .split(String.fromCharCode(27))
    .map((part) => part.replace(/^\[[0-9;]*m/, ''))
    .join('')
}

test('keeps Sky League retries, Top 10 boards, ghosts, and renderer memory stable during an opt-in soak', async ({
  page,
}, testInfo) => {
  test.skip(process.env.M33_SOAK !== '1', 'set M33_SOAK=1 to run the soak')
  test.skip(testInfo.project.name !== 'desktop', 'desktop soak contract')

  const configuredDurationMs = soakDurationMs(
    process.env.M33_SOAK_DURATION_MS,
  )
  test.setTimeout(configuredDurationMs + 180_000)

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
      request
        .url()
        .includes('/assets/audio/sovereign-of-the-sunrise-skies-loop.')
    ) {
      return
    }
    requestFailures.push(`${request.method()} ${request.url()} ${failure}`)
  })

  let baseline: CycleResult | null = null
  let lastCycle: CycleResult | null = null
  let finalCompetition: CompetitionSummary | null = null
  let finalSnapshot: FlightDebugSnapshot | null = null
  const warmupSamples: CycleResult[] = []
  let cycles = 0
  let failure: unknown = null
  const overallStartedAt = Date.now()
  let soakStartedAt = overallStartedAt

  try {
    await page.addInitScript(
      (key) => localStorage.removeItem(key),
      SETTINGS_KEY,
    )
    await page.goto('/?qaCourse=1')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )

    let stableWarmupSamples = 0
    for (
      let warmupCycle = 0;
      warmupCycle < MAXIMUM_WARMUP_CYCLES;
      warmupCycle += 1
    ) {
      const sample = await runCompetitionCycle(page)
      const previous = warmupSamples.at(-1)
      stableWarmupSamples =
        previous !== undefined &&
        hasSameMemoryCounts(
          previous.loadedResources,
          sample.loadedResources,
        ) &&
        hasSameMemoryCounts(
          previous.readyResources,
          sample.readyResources,
        )
          ? stableWarmupSamples + 1
          : 1
      warmupSamples.push(sample)
      if (stableWarmupSamples >= REQUIRED_STABLE_WARMUP_SAMPLES) {
        baseline = sample
        break
      }
    }
    if (baseline === null) {
      throw new Error(
        `Renderer memory did not stabilize during ${MAXIMUM_WARMUP_CYCLES} warmup cycles`,
      )
    }

    soakStartedAt = Date.now()
    while (
      Date.now() - soakStartedAt < configuredDurationMs ||
      cycles < MINIMUM_MEASURED_CYCLES
    ) {
      lastCycle = await runCompetitionCycle(page)
      expectZeroMemoryDrift(
        lastCycle.loadedResources,
        baseline.loadedResources,
      )
      expectZeroMemoryDrift(
        lastCycle.readyResources,
        baseline.readyResources,
      )
      finalCompetition = lastCycle.competition
      cycles += 1
    }

    finalSnapshot = await readSnapshot(page)
    finalCompetition ??= await validateStoredCompetition(page)
    expect(finalCompetition.raceRecordCount).toBe(SKY_LEAGUE_TOP_LIMIT)
    expect(finalCompetition.coinRecordCounts[REGION_ID]).toBe(
      SKY_LEAGUE_TOP_LIMIT,
    )
    expect(finalCompetition.missionRecordCounts[MISSION_ID]).toBe(
      SKY_LEAGUE_TOP_LIMIT,
    )
    expect(finalSnapshot).toMatchObject({
      gameMode: 'race',
      race: { phase: 'ready' },
      exploration: {
        loadedRegionIds: [],
        regionMeshCount: 0,
        paused: false,
        mapOpen: false,
      },
    })
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(requestFailures).toEqual([])
  } catch (error) {
    failure = error
  } finally {
    finalSnapshot ??= await readSnapshot(page).catch(() => null)
    const artifactPath = path.resolve(
      `artifacts/browser-qa/${QA_SCOPE}/m33-soak-10m.json`,
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
          measuredCycles: cycles,
          passed: failure === null,
          failure: failure === null ? null : errorMessage(failure),
          resources: {
            baselineLoaded: baseline?.loadedResources ?? null,
            lastLoaded: lastCycle?.loadedResources ?? null,
            baselineReady: baseline?.readyResources ?? null,
            finalReady:
              finalSnapshot === null ? null : resources(finalSnapshot),
          },
          competition: finalCompetition,
          finalState:
            finalSnapshot === null
              ? null
              : {
                  gameMode: finalSnapshot.gameMode,
                  racePhase: finalSnapshot.race.phase,
                  raceGhostSamples:
                    finalSnapshot.race.ghost.recorderSampleCount,
                  regionMeshCount:
                    finalSnapshot.exploration.regionMeshCount,
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
