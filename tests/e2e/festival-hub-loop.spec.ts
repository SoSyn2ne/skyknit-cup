import { expect, test } from '@playwright/test'

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
