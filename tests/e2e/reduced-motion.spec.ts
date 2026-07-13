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

test('removes camera pulses, shake, and boost rings for reduced motion', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?qaBoost=1&qaCollision=1')
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 8_000,
    })
    .toBe('racing')

  await page.getByRole('button', { name: 'QA 부스트' }).click()
  await page.getByRole('button', { name: 'QA 충돌' }).click()
  await expect
    .poll(async () => {
      const camera = (await readSnapshot(page))?.camera
      return camera === undefined
        ? null
        : {
            reducedMotion: camera.reducedMotion,
            cameraFov: Math.round(camera.cameraFov * 100) / 100,
            boostRingsVisible: camera.boostRingsVisible,
            collisionCameraShakeDistance:
              Math.round(camera.collisionCameraShakeDistance * 10_000) /
              10_000,
          }
    })
    .toEqual({
      reducedMotion: true,
      cameraFov: 55,
      boostRingsVisible: false,
      collisionCameraShakeDistance: 0,
    })
})
