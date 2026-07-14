import {
  expect,
  test,
  type CDPSession,
  type Page,
} from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

async function readSnapshot(
  page: Page,
): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function dispatchTouch(
  client: CDPSession,
  type: 'touchStart' | 'touchEnd',
  point?: { readonly id: number; readonly x: number; readonly y: number },
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints:
      point === undefined
        ? []
        : [{ ...point, radiusX: 1, radiusY: 1, force: 1 }],
  })
}

test('shows live Space or touch boost energy without covering controls', async ({
  page,
}, testInfo) => {
  const touch = testInfo.project.name.startsWith('touch')
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const gauge = page.locator('[data-boost-gauge="true"]')
  const meter = page.getByRole('meter', { name: '돌풍 에너지' })
  await expect(gauge).toBeHidden()

  if (touch) {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }

  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 500,
    })
    .toBe('countdown')
  await expect(gauge).toBeVisible()
  await expect(meter).toHaveAttribute('aria-valuemin', '0')
  await expect(meter).toHaveAttribute('aria-valuemax', '100')
  await expect(meter).toHaveAttribute('aria-valuenow', '100')
  await expect(gauge.locator('[data-boost-hint="true"]')).toHaveText(
    touch ? '터치 돌풍' : 'Space / Shift',
  )

  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 6_000,
    })
    .toBe('racing')

  let touchClient: CDPSession | null = null
  if (touch) {
    touchClient = await page.context().newCDPSession(page)
    const boost = page.locator('[data-touch-role="boost"]')
    const boostBox = await boost.boundingBox()
    expect(boostBox).not.toBeNull()
    if (boostBox === null) return
    await dispatchTouch(touchClient, 'touchStart', {
      id: 7,
      x: boostBox.x + boostBox.width / 2,
      y: boostBox.y + boostBox.height / 2,
    })
  } else {
    await page.keyboard.down('Space')
  }

  await expect
    .poll(async () => (await readSnapshot(page))?.flight.isBoosting)
    .toBe(true)
  await page.waitForTimeout(350)
  await expect(gauge).toHaveAttribute('data-state', 'boosting')
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      const shown = Number(await meter.getAttribute('aria-valuenow'))
      return (
        snapshot !== null &&
        snapshot.flight.boostRemaining < 100 &&
        Math.abs(shown - Math.round(snapshot.flight.boostRemaining)) <= 1
      )
    })
    .toBe(true)

  const gaugeBox = await gauge.boundingBox()
  const viewport = page.viewportSize()
  expect(gaugeBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (gaugeBox !== null && viewport !== null) {
    expect(gaugeBox.x).toBeGreaterThanOrEqual(0)
    expect(gaugeBox.y).toBeGreaterThanOrEqual(0)
    expect(gaugeBox.x + gaugeBox.width).toBeLessThanOrEqual(viewport.width)
    expect(gaugeBox.y + gaugeBox.height).toBeLessThanOrEqual(viewport.height)

    if (touch) {
      const boostBox = await page
        .locator('[data-touch-role="boost"]')
        .boundingBox()
      expect(boostBox).not.toBeNull()
      if (boostBox !== null) {
        expect(gaugeBox.y + gaugeBox.height).toBeLessThanOrEqual(boostBox.y)
      }
    }
  }

  if (touchClient !== null) {
    await dispatchTouch(touchClient, 'touchEnd')
    await page.getByRole('button', { name: '일시정지' }).tap()
  } else {
    await page.keyboard.up('Space')
    await page.keyboard.press('Escape')
  }

  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')
  await expect(gauge).toBeHidden()
})

test('keeps the gauge connected in exploration and hides it behind the map', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.gameMode)
    .toBe('explore')

  const gauge = page.locator('[data-boost-gauge="true"]')
  const meter = page.getByRole('meter', { name: '돌풍 에너지' })
  await expect(gauge).toBeVisible()

  await page.keyboard.down('Space')
  await expect
    .poll(async () => (await readSnapshot(page))?.flight.isBoosting)
    .toBe(true)
  await expect
    .poll(async () => Number(await meter.getAttribute('aria-valuenow')))
    .toBeLessThan(100)
  await page.keyboard.up('Space')

  await page.keyboard.press('M')
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.mapOpen)
    .toBe(true)
  await expect(gauge).toBeHidden()

  await page.keyboard.press('M')
  await expect
    .poll(async () => (await readSnapshot(page))?.exploration.mapOpen)
    .toBe(false)
  await expect(gauge).toBeVisible()
})
