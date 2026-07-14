import { expect, test } from '@playwright/test'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm32'

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
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreLandmark('wind-loom'),
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const exploration = window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
        return {
          mapOpen: exploration?.mapOpen ?? false,
          landmarks: exploration?.discoveredLandmarkIds ?? [],
        }
      }),
    )
    .toMatchObject({
      mapOpen: true,
      landmarks: expect.arrayContaining(['wind-loom']),
    })
  await page.getByRole('button', { name: '군도 지도 열기' }).click()

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
