import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm32'

const FESTIVAL_LANDMARK_IDS = [
  'dawnwing-airfield',
  'sunweave-spire',
  'crown-race-arch',
  'wind-loom',
  'whispering-grotto',
] as const

const FESTIVAL_WIND_ZONE_IDS = [
  'harbor-lift',
  'spire-spiral',
  'arch-tailwind',
] as const

const FESTIVAL_LANDING_PADS = [
  'festival-hub-pad',
  'festival-tower-pad',
  'festival-grotto-pad',
] as const

const FESTIVAL_LANDING_PAD_POSITIONS = {
  'festival-hub-pad': { x: 0, z: -40 },
  'festival-tower-pad': { x: -24, z: -62 },
  'festival-grotto-pad': { x: -42, z: -12 },
} as const

function isJourneyEvidenceProject(projectName: string): boolean {
  return projectName === 'desktop' || projectName === 'touch-minimum'
}

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function expectFestivalRecords(
  page: Page,
  expected: { readonly coinBestMs: number; readonly raceBestMs: number },
): Promise<void> {
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      if (snapshot === null) return null
      return {
        discoveredLandmarkIds:
          snapshot.exploration.discoveredLandmarkIds,
        traversedWindZoneIds:
          snapshot.exploration.traversedWindZoneIds,
        coinBestMs:
          snapshot.exploration.coinBestTimesMs['festival-hub'] ?? null,
        raceBestMs: snapshot.race.bestTimeMs,
        raceMissionGrade: snapshot.race.missionGrades['first-skyknot'] ?? null,
        journey: snapshot.exploration.journey,
      }
    })
    .toMatchObject({
      discoveredLandmarkIds: expect.arrayContaining(FESTIVAL_LANDMARK_IDS),
      traversedWindZoneIds: expect.arrayContaining(FESTIVAL_WIND_ZONE_IDS),
      coinBestMs: expected.coinBestMs,
      raceBestMs: expected.raceBestMs,
      raceMissionGrade: 'gold',
      journey: {
        completedSteps: 5,
        totalSteps: 5,
        nextObjectiveId: null,
        isComplete: true,
      },
    })
}

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  )
}

test('runs festival discovery, wind, collision, and recovery without changing race records', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'deterministic desktop physics contract')
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.windVisual ??
          null,
      ),
    )
    .toMatchObject({
      qualityTier: 'high',
      zoneCount: 3,
      visibleInstanceCount: 12,
      drawCalls: 1,
      disposed: false,
    })
  const journey = page.locator('[data-explore-journey]')
  const discoveryStatus = page.locator('[data-explore-discovery]')
  await expect(journey).toBeVisible()
  await expect(discoveryStatus).toHaveAttribute('role', 'status')
  await expect(discoveryStatus).toHaveAttribute('aria-live', 'polite')
  await expect(discoveryStatus).toHaveAttribute('aria-atomic', 'true')
  expect(
    await journey.evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe('nowrap')
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreLandmark('whispering-grotto'),
  )
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
            .discoveredLandmarkIds ?? [],
      ),
    )
    .toContain('whispering-grotto')
  await expect(discoveryStatus).toHaveText(
    '비밀 장소 발견 · 속삭임 동굴',
  )
  await expect
    .poll(() => discoveryStatus.textContent())
    .toBe('')

  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
            .discoveredLandmarkIds ?? [],
      ),
    )
    .toContain('whispering-grotto')

  await page.getByRole('button', { name: '하늘 탐험' }).click()

  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await expect(page.locator('[data-explore-festival-progress]')).toContainText(
    '비밀 발견',
  )
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/desktop-festival-map.png`,
  })
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreLandmark('wind-loom'),
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const exploration = window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
        return {
          mapOpen: exploration?.mapOpen ?? false,
          discoveredWindLoom:
            exploration?.discoveredLandmarkIds.includes('wind-loom') ?? false,
        }
      }),
    )
    .toMatchObject({
      mapOpen: true,
      discoveredWindLoom: false,
    })
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
            .discoveredLandmarkIds ?? [],
      ),
    )
    .toContain('wind-loom')

  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.loseContext())
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
            .discoveredLandmarkIds ?? [],
      ),
    )
    .toContain('whispering-grotto')

  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreWindZone('harbor-lift'),
  )
  const windStartY = await page.evaluate(
    () => window.__DRAGON_RACE_TEST__?.snapshot()?.flight.position.y ?? 0,
  )
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
            .activeWindZoneIds ?? [],
      ),
    )
    .toContain('harbor-lift')
  await expect
    .poll(() =>
      page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.audio ?? null),
    )
    .toMatchObject({ windBedPlaying: true })
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__DRAGON_RACE_TEST__?.snapshot()?.flight.position.y ?? 0,
      ),
    )
    .toBeGreaterThan(windStartY + 0.25)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
            .traversedWindZoneIds ?? [],
      ),
    )
    .toContain('harbor-lift')

  const raceBefore = await page.evaluate(() => {
    const race = window.__DRAGON_RACE_TEST__?.snapshot()?.race
    return race === undefined
      ? null
      : {
          phase: race.phase,
          elapsedMs: race.elapsedMs,
          bestTimeMs: race.bestTimeMs,
          missionGrades: race.missionGrades,
          collisionCount: race.mission.attempt.collisionCount,
        }
  })
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreCollision(),
  )
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.collision
            .lastObstacleId ?? null,
      ),
    )
    .toBe('festival-tower-lower')

  const collisionSnapshot = await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.snapshot(),
  )
  expect(collisionSnapshot?.flight.position.x ?? 0).toBeLessThan(-30.5)
  expect({
    phase: collisionSnapshot?.race.phase,
    elapsedMs: collisionSnapshot?.race.elapsedMs,
    bestTimeMs: collisionSnapshot?.race.bestTimeMs,
    missionGrades: collisionSnapshot?.race.missionGrades,
    collisionCount:
      collisionSnapshot?.race.mission.attempt.collisionCount,
  }).toEqual(raceBefore)

  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await page.getByRole('button', { name: '미션 선택으로' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.collision ??
          null,
      ),
    )
    .toMatchObject({ speedMultiplier: 1, lastObstacleId: null })
  await expect
    .poll(() =>
      page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.audio ?? null),
    )
    .toMatchObject({ ambientWindStrength: 0, windBedPlaying: false })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.windVisual
            .drawCalls ?? -1,
      ),
    )
    .toBe(0)
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__DRAGON_RACE_TEST__?.snapshot()?.gameMode ?? null,
      ),
    )
    .toBe('explore')
  expect(errors).toEqual([])
})

test('cycles every Festival Hub landing pad before entering the selected golden-knot mission', async ({
  page,
}, testInfo) => {
  test.skip(
    !isJourneyEvidenceProject(testInfo.project.name),
    'desktop and minimum touch journey evidence',
  )
  test.setTimeout(45_000)

  await page.goto('/?qaCourse=1')
  await page
    .locator('[data-mission-select="true"]')
    .selectOption('golden-knot')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  const contextAction = page.locator('[data-explore-context]')

  for (const landingPadId of FESTIVAL_LANDING_PADS) {
    await page.evaluate(
      (id) => window.__DRAGON_RACE_TEST__?.qaExploreLandingPad(id),
      landingPadId,
    )
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

  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreChallenge(),
  )
  await expect(contextAction).toHaveText('레이스 도전')
  await contextAction.click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.mission)
    .toMatchObject({
      selectedMissionId: 'golden-knot',
      status: 'active',
    })
})

test('restores takeoff at every saved Festival Hub landing pad', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single persistence contract')
  test.setTimeout(45_000)

  await page.goto('/?qaCourse=1')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  const contextAction = page.locator('[data-explore-context]')

  for (const landingPadId of FESTIVAL_LANDING_PADS) {
    const expected = FESTIVAL_LANDING_PAD_POSITIONS[landingPadId]
    await page.evaluate(
      (id) => window.__DRAGON_RACE_TEST__?.qaExploreLandingPad(id),
      landingPadId,
    )
    await contextAction.click()
    await expect
      .poll(async () => (await readSnapshot(page))?.exploration.movement)
      .toBe('landed')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem('skyknit-cup:settings')
          if (raw === null) return null
          const document = JSON.parse(raw) as {
            exploration?: {
              movement?: string
              position?: { x?: number; z?: number }
            }
          }
          return {
            movement: document.exploration?.movement,
            x: document.exploration?.position?.x,
            z: document.exploration?.position?.z,
          }
        }),
      )
      .toEqual({ movement: 'landed', x: expected.x, z: expected.z })

    await page.reload()
    await page.getByRole('button', { name: '하늘 탐험' }).click()
    await expect
      .poll(async () => (await readSnapshot(page))?.exploration.movement)
      .toBe('landed')
    expect((await readSnapshot(page))?.exploration.landingPadId).toBe(
      landingPadId,
    )
    await contextAction.click()
    await expect
      .poll(async () => (await readSnapshot(page))?.exploration.movement, {
        timeout: 500,
      })
      .toBe('taking-off')
    const position = (await readSnapshot(page))?.flight.position
    expect(
      Math.hypot(
        (position?.x ?? Number.POSITIVE_INFINITY) - expected.x,
        (position?.z ?? Number.POSITIVE_INFINITY) - expected.z,
      ),
    ).toBeLessThan(0.1)
    await expect
      .poll(async () => (await readSnapshot(page))?.exploration.movement)
      .toBe('airborne')
  }
})

test('freezes flight and discovery progress while the Festival map is open', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single simulation contract')

  await page.goto('/?qaCourse=1')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreLandmark('sunweave-spire'),
  )
  const before = await readSnapshot(page)

  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(350)
  await page.keyboard.up('ArrowUp')
  const after = await readSnapshot(page)

  expect(after?.exploration.mapOpen).toBe(true)
  expect(after?.flight.position).toEqual(before?.flight.position)
  expect(after?.exploration.collision).toEqual(before?.exploration.collision)
  expect(after?.exploration.discoveredRegionIds).toEqual(
    before?.exploration.discoveredRegionIds,
  )
  expect(after?.exploration.discoveredLandmarkIds).not.toContain(
    'sunweave-spire',
  )
  expect(after?.exploration.traversedWindZoneIds).not.toContain(
    'spire-spiral',
  )
})

test('blocks landing controls beneath the open Festival map', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single interaction contract')

  await page.goto('/?qaCourse=1')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreLandingPad('festival-tower-pad'),
  )
  const contextAction = page.locator('[data-explore-context]')
  await expect(contextAction).toHaveText('착륙')
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await expect(contextAction).toBeHidden()

  await page.keyboard.press('KeyE')
  await page.waitForTimeout(150)
  expect((await readSnapshot(page))?.exploration.movement).toBe('airborne')
})

test('shows the selected race mission guidance inside the Festival map', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single map guidance contract')

  await page.goto('/?qaCourse=1')
  await page
    .locator('[data-mission-select="true"]')
    .selectOption('golden-knot')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await expect(page.locator('[data-explore-festival-progress]')).toContainText(
    '선택 미션 황금 하늘매듭 · 왕관 레이스 아치에서 도전',
  )
})

test('preserves the completed Festival Hub journey across reload and WebGL recovery', async ({
  page,
}, testInfo) => {
  test.skip(
    !isJourneyEvidenceProject(testInfo.project.name),
    'desktop and minimum touch journey evidence',
  )
  test.setTimeout(60_000)

  await page.goto('/?qaCourse=1')
  await page
    .locator('[data-mission-select="true"]')
    .selectOption('first-skyknot')
  await page.getByRole('button', { name: '하늘 탐험' }).click()

  for (const landmarkId of FESTIVAL_LANDMARK_IDS) {
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

  for (const windZoneId of FESTIVAL_WIND_ZONE_IDS) {
    await page.evaluate(
      (id) => window.__DRAGON_RACE_TEST__?.qaExploreWindZone(id),
      windZoneId,
    )
    await expect
      .poll(
        async () =>
          (await readSnapshot(page))?.exploration.traversedWindZoneIds ?? [],
      )
      .toContain(windZoneId)
  }

  for (let coinIndex = 0; coinIndex < 10; coinIndex += 1) {
    await page.evaluate(
      (index) =>
        window.__DRAGON_RACE_TEST__?.qaCollectCoin('festival-hub', index),
      coinIndex,
    )
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.coinRun)
    .toMatchObject({
      phase: 'completed',
      regionId: 'festival-hub',
      collectedCount: 10,
    })

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

  const completed = await readSnapshot(page)
  const coinBestMs =
    completed?.exploration.coinBestTimesMs['festival-hub'] ?? 0
  const raceBestMs = completed?.race.bestTimeMs ?? 0
  expect(coinBestMs).toBeGreaterThan(0)
  expect(raceBestMs).toBeGreaterThan(0)
  await expectFestivalRecords(page, { coinBestMs, raceBestMs })

  await page.reload()
  await expectFestivalRecords(page, { coinBestMs, raceBestMs })
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect(page.locator('[data-explore-journey]')).toContainText('여정 5/5')

  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.loseContext())
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expectFestivalRecords(page, { coinBestMs, raceBestMs })
  await expect(page.locator('[data-explore-journey]')).toContainText('여정 5/5')
})

test('captures the authored Festival Hub landmarks in the runtime renderer', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop visual evidence')
  await page.goto('/')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
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

  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreOverview(),
  )
  await page.waitForTimeout(700)
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/desktop-festival-overview.png`,
  })

  for (const landmark of [
    'dawnwing-airfield',
    'sunweave-spire',
    'crown-race-arch',
    'wind-loom',
    'whispering-grotto',
  ] as const) {
    await page.evaluate(
      (landmarkId) =>
        window.__DRAGON_RACE_TEST__?.qaExploreLandmarkView(landmarkId),
      landmark,
    )
    await page.waitForTimeout(500)
    await page.screenshot({
      path: `artifacts/browser-qa/${QA_SCOPE}/desktop-${landmark}.png`,
    })
  }
})

test('keeps the festival journey readable in every required viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'),
  )

  const journey = page.locator('[data-explore-journey]')
  await expect(journey).toBeVisible()
  const journeyBox = await journey.boundingBox()
  expect(journeyBox).not.toBeNull()
  if (journeyBox === null) return

  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  expect(journeyBox.x).toBeGreaterThanOrEqual(0)
  expect(journeyBox.y).toBeGreaterThanOrEqual(0)
  expect(journeyBox.x + journeyBox.width).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  )
  expect(journeyBox.y + journeyBox.height).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  )

  for (const selector of [
    '[data-explore-region]',
    '[data-coin-run]',
    '.exploration-hud__controls',
    '[data-explore-context]',
  ]) {
    const element = page.locator(selector)
    if (!(await element.isVisible())) continue
    const box = await element.boundingBox()
    if (box !== null) expect(overlaps(journeyBox, box)).toBe(false)
  }

  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-festival-journey.png`,
  })
})
