import {
  expect,
  test,
  type CDPSession,
  type Page,
} from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

interface TouchPoint {
  readonly id: number
  readonly x: number
  readonly y: number
}

async function readSnapshot(
  page: Page,
): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => FlightDebugSnapshot | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot() ?? null
  })
}

async function dispatchTouch(
  client: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  point?: TouchPoint,
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints:
      point === undefined
        ? []
        : [
            {
              id: point.id,
              x: point.x,
              y: point.y,
              radiusX: 1,
              radiusY: 1,
              force: 1,
            },
          ],
  })
}

test.describe('touch flight flow', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('touch'))
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
  })

  test('starts, steers, boosts, pauses, and resumes with touch', async ({
    page,
  }, testInfo) => {
    const client = await page.context().newCDPSession(page)
    const joystick = page.locator('[data-touch-role="joystick"]')
    const joystickBox = await joystick.boundingBox()
    expect(joystickBox).not.toBeNull()
    if (joystickBox === null) {
      return
    }

    const center = {
      id: 1,
      x: joystickBox.x + joystickBox.width / 2,
      y: joystickBox.y + joystickBox.height / 2,
    }
    await dispatchTouch(client, 'touchStart', center)

    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 100,
        intervals: [10],
      })
      .toBe('countdown')
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 4_000,
      })
      .toBe('racing')

    const beforeSteer = await readSnapshot(page)
    await dispatchTouch(client, 'touchMove', {
      id: 1,
      x: center.x + joystickBox.width * 0.24,
      y: center.y - joystickBox.height * 0.18,
    })

    await expect
      .poll(async () => {
        const snapshot = await readSnapshot(page)
        return (
          snapshot?.activeInputDevice === 'touch' &&
          (snapshot.input.pitch ?? 0) > 0.2 &&
          (snapshot.input.yaw ?? 0) > 0.2
        )
      })
      .toBe(true)
    await page.waitForTimeout(350)
    const afterSteer = await readSnapshot(page)
    expect(afterSteer?.flight.headingRadians).not.toBe(
      beforeSteer?.flight.headingRadians,
    )
    await dispatchTouch(client, 'touchEnd')

    const boost = page.locator('[data-touch-role="boost"]')
    const boostBox = await boost.boundingBox()
    expect(boostBox).not.toBeNull()
    if (boostBox === null) {
      return
    }
    await dispatchTouch(client, 'touchStart', {
      id: 2,
      x: boostBox.x + boostBox.width / 2,
      y: boostBox.y + boostBox.height / 2,
    })
    await expect
      .poll(async () => (await readSnapshot(page))?.flight.isBoosting)
      .toBe(true)
    await dispatchTouch(client, 'touchEnd')
    await expect
      .poll(async () => (await readSnapshot(page))?.input.boost)
      .toBe(false)

    const pause = page.getByRole('button', { name: '일시정지' })
    await expect(pause).toBeVisible()
    await pause.tap()
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase)
      .toBe('paused')
    await page.screenshot({
      path: `artifacts/browser-qa/m4/${testInfo.project.name}-paused.png`,
    })

    const resume = page.getByRole('button', { name: '계속 날기' })
    await expect(resume).toBeVisible()
    await resume.tap()
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase)
      .toBe('racing')
  })

  test('uses only the last active device', async ({ page }) => {
    const client = await page.context().newCDPSession(page)
    const joystick = page.locator('[data-touch-role="joystick"]')
    const joystickBox = await joystick.boundingBox()
    expect(joystickBox).not.toBeNull()
    if (joystickBox === null) {
      return
    }

    await page.keyboard.down('ArrowLeft')
    await expect
      .poll(async () => {
        const snapshot = await readSnapshot(page)
        return {
          device: snapshot?.activeInputDevice,
          yaw: snapshot?.input.yaw,
        }
      })
      .toEqual({ device: 'keyboard', yaw: -1 })

    await dispatchTouch(client, 'touchStart', {
      id: 4,
      x: joystickBox.x + joystickBox.width * 0.78,
      y: joystickBox.y + joystickBox.height / 2,
    })
    await expect
      .poll(async () => {
        const snapshot = await readSnapshot(page)
        return (
          snapshot?.activeInputDevice === 'touch' &&
          (snapshot.input.yaw ?? 0) > 0.5
        )
      })
      .toBe(true)

    await dispatchTouch(client, 'touchEnd')
    await expect
      .poll(async () => (await readSnapshot(page))?.input.yaw)
      .toBe(0)
    await page.keyboard.up('ArrowLeft')

    await page.keyboard.down('ArrowRight')
    await expect
      .poll(async () => {
        const snapshot = await readSnapshot(page)
        return {
          device: snapshot?.activeInputDevice,
          yaw: snapshot?.input.yaw,
        }
      })
      .toEqual({ device: 'keyboard', yaw: 1 })
    await page.keyboard.up('ArrowRight')
  })

  test('finishes and retries after a touch start', async ({
    page,
  }, testInfo) => {
    await page.goto('/?qaCourse=1')
    const joystick = page.locator('[data-touch-role="joystick"]')
    await joystick.tap({ position: { x: 56, y: 30 } })
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 4_000,
      })
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
    await expect(joystick).toBeHidden()
    const retry = page.getByRole('button', { name: '다시 달리기' })
    await expect(retry).toBeVisible()
    await page.screenshot({
      path: `artifacts/browser-qa/m4/${testInfo.project.name}-finished.png`,
    })

    await retry.tap()

    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase)
      .toBe('countdown')
    await expect(joystick).toBeVisible()
  })
})
