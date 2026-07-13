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

test('completes the full keyboard race flow', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/?qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 100,
      intervals: [10],
    })
    .toBe('countdown')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 8_000,
    })
    .toBe('racing')

  const beforeSteer = await readSnapshot(page)
  await page.keyboard.down('ArrowRight')
  await expect
    .poll(async () => (await readSnapshot(page))?.input.yaw)
    .toBe(1)
  await page.waitForTimeout(300)
  await page.keyboard.up('ArrowRight')
  expect((await readSnapshot(page))?.flight.headingRadians).not.toBe(
    beforeSteer?.flight.headingRadians,
  )

  await page.keyboard.down('Space')
  await expect
    .poll(async () => (await readSnapshot(page))?.flight.isBoosting)
    .toBe(true)
  await page.keyboard.up('Space')
  await expect
    .poll(async () => (await readSnapshot(page))?.input.boost)
    .toBe(false)

  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')
  await expect(page.getByRole('button', { name: '계속 날기' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('racing')

  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
    await page.evaluate(() => {
      const testWindow = window as unknown as {
        __DRAGON_RACE_TEST__?: {
          qaPassCheckpoint: () => void
        }
      }
      testWindow.__DRAGON_RACE_TEST__?.qaPassCheckpoint()
    })
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('finished')
  await expect(page.getByRole('button', { name: '다시 달리기' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('countdown')
})
