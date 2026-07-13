import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

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

async function startRace(page: Page, touchProject: boolean): Promise<void> {
  if (touchProject) {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }

  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 4_000,
    })
    .toBe('racing')
}

function stableRun(snapshot: FlightDebugSnapshot | null): unknown {
  return snapshot === null
    ? null
    : {
        elapsedMs: snapshot.race.elapsedMs,
        checkpoint: snapshot.race.nextCheckpointIndex,
        position: snapshot.flight.position,
        boost: snapshot.flight.boostRemaining,
      }
}

test.describe('lifecycle pause', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
  })

  test('window blur pauses and freezes keyboard or touch input', async ({
    page,
  }, testInfo) => {
    const touchProject = testInfo.project.name.startsWith('touch')
    await startRace(page, touchProject)

    if (touchProject) {
      const joystick = page.locator('[data-touch-role="joystick"]')
      const box = await joystick.boundingBox()
      expect(box).not.toBeNull()
      if (box === null) {
        return
      }
      const client = await page.context().newCDPSession(page)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          {
            id: 5,
            x: box.x + box.width * 0.75,
            y: box.y + box.height * 0.25,
          },
        ],
      })
    } else {
      await page.keyboard.down('ArrowRight')
      await page.keyboard.down('Space')
    }

    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase)
      .toBe('paused')
    const paused = await readSnapshot(page)
    expect(paused?.input).toEqual({ pitch: 0, yaw: 0, boost: false })
    const frozenRun = stableRun(paused)
    await page.waitForTimeout(250)
    expect(stableRun(await readSnapshot(page))).toEqual(frozenRun)
  })

  test('hidden lifecycle state pauses before simulation resumes', async ({
    page,
  }, testInfo) => {
    await startRace(page, testInfo.project.name.startsWith('touch'))
    const beforeHidden = await readSnapshot(page)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase)
      .toBe('paused')
    const afterHidden = await readSnapshot(page)
    expect(afterHidden?.inputClears.hiddenCount).toBeGreaterThan(
      beforeHidden?.inputClears.hiddenCount ?? 0,
    )
  })
})
