import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => FlightDebugSnapshot | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot() ?? null
  })
}

test('recovers from WebGL context loss without resetting progress', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/?qaCourse=1&qaCollision=1&qaBoost=1')
  await page
    .locator('[data-mission-select="true"]')
    .selectOption('golden-knot')
  await page.locator('[data-mission-start="true"]').click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 4_000,
    })
    .toBe('racing')
  for (let checkpoint = 0; checkpoint < 2; checkpoint += 1) {
    await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaPassCheckpoint())
  }
  await page.getByRole('button', { name: 'QA 충돌' }).click()
  await page.getByRole('button', { name: 'QA 부스트' }).click()
  await expect
    .poll(
      async () =>
        (await readSnapshot(page))?.race.mission.attempt
          .boostActivationCount,
    )
    .toBe(1)
  await expect
    .poll(async () => (await readSnapshot(page))?.flight.isBoosting)
    .toBe(false)
  await page.locator('canvas.game-canvas').click()
  await page.keyboard.press('KeyR')
  await expect
    .poll(
      async () =>
        (await readSnapshot(page))?.race.mission.attempt.respawnCount,
    )
    .toBe(1)
  const beforeLoss = await readSnapshot(page)
  expect(beforeLoss?.race.nextCheckpointIndex).toBe(2)
  expect(beforeLoss?.race.mission).toMatchObject({
    selectedMissionId: 'golden-knot',
    status: 'active',
    attempt: {
      nextCheckpointIndex: 2,
      collisionCount: 1,
      respawnCount: 1,
      boostActivationCount: 1,
    },
  })

  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.loseContext())
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-error',
  )
  await expect(
    page.getByRole('heading', { name: '하늘과의 연결이 끊겼어요' }),
  ).toBeVisible()
  const retry = page.getByRole('button', { name: '다시 시도' })
  await expect(retry).toBeFocused()
  await retry.click()

  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1)
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')
  const recovered = await readSnapshot(page)
  expect(recovered?.race.nextCheckpointIndex).toBe(2)
  expect(recovered?.race.mission).toMatchObject({
    selectedMissionId: beforeLoss?.race.mission.selectedMissionId,
    status: beforeLoss?.race.mission.status,
    attempt: {
      nextCheckpointIndex:
        beforeLoss?.race.mission.attempt.nextCheckpointIndex,
      collisionCount: beforeLoss?.race.mission.attempt.collisionCount,
      respawnCount: beforeLoss?.race.mission.attempt.respawnCount,
      boostActivationCount:
        beforeLoss?.race.mission.attempt.boostActivationCount,
    },
    result: beforeLoss?.race.mission.result,
  })
  expect(recovered?.race.mission.attempt.elapsedMs).toBeGreaterThanOrEqual(
    beforeLoss?.race.mission.attempt.elapsedMs ?? 0,
  )
  expect(recovered?.race.mission.attempt.elapsedMs).toBeLessThanOrEqual(
    (beforeLoss?.race.mission.attempt.elapsedMs ?? 0) + 100,
  )
  expect(recovered?.audio.muted).toBe(beforeLoss?.audio.muted)
  expect(recovered?.render.qualityPreference).toBe(
    beforeLoss?.render.qualityPreference,
  )
  expect(recovered?.race.elapsedMs).toBeGreaterThanOrEqual(
    beforeLoss?.race.elapsedMs ?? 0,
  )
  expect(recovered?.race.elapsedMs).toBeLessThanOrEqual(
    (beforeLoss?.race.elapsedMs ?? 0) + 100,
  )
  await page.waitForTimeout(250)
  expect((await readSnapshot(page))?.race.elapsedMs).toBe(
    recovered?.race.elapsedMs,
  )

  await page.getByRole('button', { name: '계속 날기' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('racing')
})

test('uses a visible non-blocking fallback when the GLB resource fails', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/?forceDragonFailure=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect(page.getByRole('status')).toContainText(
    '기본 드래곤으로 비행합니다',
  )
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.source)
    .toBe('fallback')

  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 4_000,
    })
    .toBe('racing')
  await page.screenshot({
    path: 'artifacts/browser-qa/m5/desktop-dragon-fallback.png',
  })
})
