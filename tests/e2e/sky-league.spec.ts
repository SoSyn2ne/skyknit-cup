import { expect, test, type Page } from '@playwright/test'

import {
  isCanonicalGhostRun,
  type GhostRun,
} from '../../src/game/competition/ghostRun'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const SETTINGS_KEY = 'skyknit-cup:settings'
const FIRST_MISSION_ID = 'first-skyknot'
const FESTIVAL_REGION_ID = 'festival-hub'
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm33'

interface StoredMissionLeagueEntry {
  readonly elapsedMs: number
  readonly grade: 'bronze' | 'silver' | 'gold'
}

interface StoredSkyLeagueSettings {
  readonly version: number
  readonly bestTimeMs: number | null
  readonly missionGrades: Readonly<Record<string, string>>
  readonly coinBestTimesMs: Readonly<Record<string, number>>
  readonly skyLeague: {
    readonly raceTop10Ms: readonly number[]
    readonly coinTop10Ms: Readonly<Record<string, readonly number[]>>
    readonly missionTop10: Readonly<
      Record<string, readonly StoredMissionLeagueEntry[]>
    >
  }
  readonly ghosts: {
    readonly race: unknown
    readonly coin: Readonly<Record<string, unknown>>
    readonly mission: Readonly<Record<string, unknown>>
  }
  readonly exploration: {
    readonly discoveredRegionIds: readonly string[]
    readonly discoveredLandmarkIds: readonly string[]
    readonly traversedWindZoneIds: readonly string[]
  }
}

async function snapshot(page: Page): Promise<FlightDebugSnapshot | null> {
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

async function openQaCourse(page: Page): Promise<void> {
  await page.goto('/?qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
}

async function startMission(
  page: Page,
  missionId = FIRST_MISSION_ID,
): Promise<void> {
  await page
    .locator('[data-mission-select="true"]')
    .selectOption(missionId)
  await page.locator('[data-mission-start="true"]').click()
  await expect
    .poll(async () => (await snapshot(page))?.race.phase, {
      timeout: 5_000,
    })
    .toBe('racing')
}

async function passQaCheckpoints(
  page: Page,
  checkpointCount: number,
): Promise<void> {
  await page.evaluate((count) => {
    for (let checkpoint = 0; checkpoint < count; checkpoint += 1) {
      window.__DRAGON_RACE_TEST__?.qaPassCheckpoint()
    }
  }, checkpointCount)
}

async function finishQaCourse(page: Page): Promise<void> {
  const race = (await snapshot(page))?.race
  const remaining =
    (race?.checkpointCount ?? 0) - (race?.nextCheckpointIndex ?? 0)
  await passQaCheckpoints(page, remaining)
  await expect
    .poll(async () => (await snapshot(page))?.race.phase)
    .toBe('finished')
}

async function collectCoinCourse(page: Page): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(
      ([regionId, coinIndex]) =>
        window.__DRAGON_RACE_TEST__?.qaCollectCoin(regionId, coinIndex),
      [FESTIVAL_REGION_ID, index] as const,
    )
  }
  await expect
    .poll(
      async () =>
        (await snapshot(page))?.exploration.coinRun.phase,
    )
    .toBe('completed')
}

function requireCanonicalGhost(value: unknown): GhostRun {
  expect(isCanonicalGhostRun(value)).toBe(true)
  if (!isCanonicalGhostRun(value)) {
    throw new Error('Expected a canonical Sky League ghost run')
  }
  return value
}

test.describe('Sky League offline record competition', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'M33 persistence and recovery contracts run once on desktop',
    )
    await page.addInitScript((key) => localStorage.removeItem(key), SETTINGS_KEY)
  })

  test('saves the first race and successful mission to v9 Top 10 boards with canonical ghosts', async ({
    page,
  }) => {
    await openQaCourse(page)
    await startMission(page)
    await finishQaCourse(page)

    const finishedRace = (await snapshot(page))?.race
    const finalElapsedMs = finishedRace?.finalElapsedMs ?? null
    expect(finalElapsedMs).not.toBeNull()

    const stored = await readStoredSettings(page)
    expect(stored).not.toBeNull()
    expect(stored).toMatchObject({
      version: 9,
      bestTimeMs: finalElapsedMs,
      missionGrades: { [FIRST_MISSION_ID]: 'gold' },
      skyLeague: {
        raceTop10Ms: [finalElapsedMs],
        missionTop10: {
          [FIRST_MISSION_ID]: [
            { elapsedMs: finalElapsedMs, grade: 'gold' },
          ],
        },
      },
    })

    const raceGhost = requireCanonicalGhost(stored?.ghosts.race)
    const missionGhost = requireCanonicalGhost(
      stored?.ghosts.mission[FIRST_MISSION_ID],
    )
    expect(raceGhost.durationMs).toBe(Math.round(finalElapsedMs ?? 0))
    expect(missionGhost).toEqual(raceGhost)
  })

  test('retries against the visible best ghost and exposes a signed non-live delta', async ({
    page,
  }) => {
    await openQaCourse(page)
    await startMission(page)
    await finishQaCourse(page)

    await page.getByRole('button', { name: '다시 달리기' }).click()
    await expect
      .poll(async () => (await snapshot(page))?.camera.ghostVisible, {
        timeout: 5_000,
      })
      .toBe(true)
    await expect
      .poll(async () => (await snapshot(page))?.race.phase, {
        timeout: 5_000,
      })
      .toBe('racing')
    await expect
      .poll(async () => {
        const liveDeltaMs = (await snapshot(page))?.race.ghost.liveDeltaMs
        return typeof liveDeltaMs === 'number'
      })
      .toBe(true)

    const delta = page.locator('[data-race-delta]')
    await expect(delta).toBeVisible()
    await expect(delta).toHaveText(/[+-]\d+:\d{2}\.\d{3}/)
    expect(await delta.getAttribute('aria-live')).toBeNull()

    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(800)
    await page.keyboard.up('ArrowLeft')
    await page.screenshot({
      path: `artifacts/browser-qa/${QA_SCOPE}/desktop-ghost-replay.png`,
      style: '.qa-course-control { visibility: hidden !important; }',
    })
  })

  test('saves a completed regional coin run to its v9 Top 10 board and ghost slot', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    await page.evaluate(
      (regionId) =>
        window.__DRAGON_RACE_TEST__?.qaExploreRegion(regionId),
      FESTIVAL_REGION_ID,
    )
    await collectCoinCourse(page)

    const completedTime =
      (await snapshot(page))?.exploration.coinRun.finalElapsedMs ?? null
    expect(completedTime).not.toBeNull()
    const stored = await readStoredSettings(page)
    expect(stored).toMatchObject({
      version: 9,
      coinBestTimesMs: { [FESTIVAL_REGION_ID]: completedTime },
      skyLeague: {
        coinTop10Ms: { [FESTIVAL_REGION_ID]: [completedTime] },
      },
    })
    const coinGhost = requireCanonicalGhost(
      stored?.ghosts.coin[FESTIVAL_REGION_ID],
    )
    expect(coinGhost.durationMs).toBe(Math.round(completedTime ?? 0))
  })

  test('replays the regional coin ghost and reports a stable second-place tie', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    await page.evaluate(
      (regionId) =>
        window.__DRAGON_RACE_TEST__?.qaExploreRegion(regionId),
      FESTIVAL_REGION_ID,
    )
    await collectCoinCourse(page)
    const firstStored = await readStoredSettings(page)
    const firstPlaceGhost = requireCanonicalGhost(
      firstStored?.ghosts.coin[FESTIVAL_REGION_ID],
    )

    await page.evaluate(
      (regionId) =>
        window.__DRAGON_RACE_TEST__?.qaCollectCoin(regionId, 0),
      FESTIVAL_REGION_ID,
    )
    await expect
      .poll(async () => (await snapshot(page))?.camera.ghostVisible)
      .toBe(true)
    for (let index = 1; index < 10; index += 1) {
      await page.evaluate(
        ([regionId, coinIndex]) =>
          window.__DRAGON_RACE_TEST__?.qaCollectCoin(
            regionId,
            coinIndex,
          ),
        [FESTIVAL_REGION_ID, index] as const,
      )
    }

    await expect
      .poll(
        async () =>
          (await snapshot(page))?.exploration.coinRunLeagueResult?.rank,
      )
      .toBe(2)
    await expect(page.locator('[data-coin-result]')).toContainText('2위')

    const stored = await readStoredSettings(page)
    expect(stored?.skyLeague.coinTop10Ms[FESTIVAL_REGION_ID]).toHaveLength(
      2,
    )
    expect(stored?.ghosts.coin[FESTIVAL_REGION_ID]).toEqual(firstPlaceGhost)
  })

  test('restores an in-progress recorder after context loss and finishes a canonical ghost', async ({
    page,
  }) => {
    await openQaCourse(page)
    await startMission(page)
    await expect
      .poll(
        async () =>
          (await snapshot(page))?.race.ghost.recorderSampleCount ?? 0,
      )
      .toBeGreaterThan(1)

    await passQaCheckpoints(page, 2)
    await expect
      .poll(async () => {
        const race = (await snapshot(page))?.race
        return race === undefined
          ? null
          : {
              checkpoint: race.nextCheckpointIndex,
              hasProgressSample: race.ghost.recorderSampleCount > 2,
            }
      })
      .toEqual({ checkpoint: 2, hasProgressSample: true })
    const beforeLoss = (await snapshot(page))?.race
    expect(beforeLoss).toBeDefined()
    const sampleCountBeforeLoss =
      beforeLoss?.ghost.recorderSampleCount ?? 0
    expect(sampleCountBeforeLoss).toBeGreaterThan(2)

    await page.evaluate(() => window.__DRAGON_RACE_TEST__?.loseContext())
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-error',
    )
    await page.getByRole('button', { name: '다시 시도' }).click()
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    await expect
      .poll(async () => (await snapshot(page))?.race.phase)
      .toBe('paused')

    const recovered = (await snapshot(page))?.race
    expect(recovered?.nextCheckpointIndex).toBe(2)
    expect(recovered?.ghost.recorderSampleCount).toBeGreaterThanOrEqual(
      sampleCountBeforeLoss,
    )

    await page.getByRole('button', { name: '계속 날기' }).click()
    await expect
      .poll(async () => (await snapshot(page))?.race.phase)
      .toBe('racing')
    await finishQaCourse(page)

    const stored = await readStoredSettings(page)
    const recoveredGhost = requireCanonicalGhost(stored?.ghosts.race)
    expect(recoveredGhost.samples.some((sample) => sample[8] >= 2)).toBe(
      true,
    )
  })

})

test.describe('Sky League v7 migration', () => {
  test('migrates records and Festival discoveries to v9 without fabrication', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'M33 migration contract runs once on desktop',
    )
    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value))
      },
      {
        key: SETTINGS_KEY,
        value: {
          version: 7,
          bestTimeMs: 88_000,
          muted: true,
          musicVolume: 0.25,
          quality: 'high',
          missionGrades: { 'time-trial': 'silver' },
          coinBestTimesMs: { [FESTIVAL_REGION_ID]: 14_500 },
          exploration: {
            position: { x: 430, y: 31, z: 190 },
            headingRadians: 0.75,
            movement: 'airborne',
            discoveredRegionIds: [FESTIVAL_REGION_ID, 'cloud-ruins'],
            destinationRegionId: 'cloud-ruins',
            discoveredLandmarkIds: [
              'dawnwing-airfield',
              'whispering-grotto',
            ],
            traversedWindZoneIds: ['harbor-lift'],
          },
        },
      },
    )
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )

    const stored = await readStoredSettings(page)
    expect(stored).toMatchObject({
      version: 9,
      bestTimeMs: 88_000,
      missionGrades: { 'time-trial': 'silver' },
      coinBestTimesMs: { [FESTIVAL_REGION_ID]: 14_500 },
      skyLeague: {
        raceTop10Ms: [88_000],
        coinTop10Ms: { [FESTIVAL_REGION_ID]: [14_500] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: {
        discoveredRegionIds: [FESTIVAL_REGION_ID, 'cloud-ruins'],
        discoveredLandmarkIds: [
          'dawnwing-airfield',
          'whispering-grotto',
        ],
        traversedWindZoneIds: ['harbor-lift'],
      },
    })
  })
})

test.describe('Sky League responsive surfaces', () => {
  test('keeps the exploration Top 10 popover inside the minimum touch viewport', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'touch-minimum',
      'Minimum viewport contract runs once on its target profile',
    )
    await page.addInitScript((key) => localStorage.removeItem(key), SETTINGS_KEY)
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    await page.getByRole('button', { name: '하늘 탐험' }).tap()
    await expect
      .poll(async () => (await snapshot(page))?.gameMode)
      .toBe('explore')
    await page.evaluate(
      (regionId) =>
        window.__DRAGON_RACE_TEST__?.qaExploreRegion(regionId),
      FESTIVAL_REGION_ID,
    )
    await collectCoinCourse(page)

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    const coinRunBounds = await page.locator('[data-coin-run]').boundingBox()
    expect(coinRunBounds).not.toBeNull()
    expect(coinRunBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect(
      (coinRunBounds?.x ?? 0) + (coinRunBounds?.width ?? 0),
    ).toBeLessThanOrEqual(viewport?.width ?? 0)

    const toggle = page.locator('.exploration-hud__coin-league-toggle')
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const popover = page.locator('.exploration-hud__coin-league-content')
    await expect(popover).toBeVisible()
    const bounds = await popover.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
      viewport?.width ?? 0,
    )
    const toggleBounds = await toggle.boundingBox()
    expect(toggleBounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(toggleBounds?.width ?? 0).toBeGreaterThanOrEqual(44)

    await page.screenshot({
      path: `artifacts/browser-qa/${QA_SCOPE}/touch-minimum-coin-top10.png`,
    })
  })
})
