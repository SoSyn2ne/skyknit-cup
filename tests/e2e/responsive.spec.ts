import { expect, test } from '@playwright/test'

const REQUIRED_VIEWPORTS: Readonly<Record<string, readonly [number, number]>> = {
  desktop: [1_440, 900],
  'desktop-compact': [1_280, 720],
  'touch-landscape': [844, 390],
  'touch-portrait': [390, 844],
  'touch-minimum': [320, 568],
}

test('fits the race UI inside the required viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/?mode=race')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const expectedViewport = REQUIRED_VIEWPORTS[testInfo.project.name]
  expect(expectedViewport).toBeDefined()
  expect(page.viewportSize()).toEqual({
    width: expectedViewport[0],
    height: expectedViewport[1],
  })

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
  }))
  expect(layout.documentWidth).toBe(layout.viewportWidth)
  expect(layout.documentHeight).toBe(layout.viewportHeight)

  const panel = page.locator('.race-hud__panel')
  const panelBox = await panel.boundingBox()
  expect(panelBox).not.toBeNull()
  if (panelBox !== null) {
    expect(panelBox.x).toBeGreaterThanOrEqual(0)
    expect(panelBox.y).toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(expectedViewport[0])
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(expectedViewport[1])
  }

  if (testInfo.project.name.startsWith('touch')) {
    await expect(page.locator('[data-touch-control]:visible')).toHaveCount(0)
    const start = page.getByRole('button', { name: '비행 시작' })
    await expect(start).toBeVisible()
    const startBox = await start.boundingBox()
    expect(startBox).not.toBeNull()
    if (startBox !== null) {
      expect(startBox.width).toBeGreaterThanOrEqual(44)
      expect(startBox.height).toBeGreaterThanOrEqual(44)
      expect(startBox.x).toBeGreaterThanOrEqual(0)
      expect(startBox.y).toBeGreaterThanOrEqual(0)
      expect(startBox.x + startBox.width).toBeLessThanOrEqual(
        expectedViewport[0],
      )
      expect(startBox.y + startBox.height).toBeLessThanOrEqual(
        expectedViewport[1],
      )
    }
    await start.tap()
    await expect(page.locator('.race-hud')).toHaveAttribute(
      'data-phase',
      'racing',
      { timeout: 6_000 },
    )
    const controls = page.locator('[data-touch-control]:visible')
    await expect(controls).toHaveCount(3)
    for (const control of await controls.all()) {
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      if (box === null) {
        continue
      }
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(expectedViewport[0])
      expect(box.y + box.height).toBeLessThanOrEqual(expectedViewport[1])
    }
  }

  await page.screenshot({
    path: `artifacts/browser-qa/m4/${testInfo.project.name}-responsive.png`,
  })
})

test('keeps the timer width stable as digits change', async ({ page }) => {
  await page.goto('/?mode=race')
  await page.keyboard.press('ArrowUp')
  const timer = page.locator('[data-race-timer]')
  await expect(timer).toBeVisible()

  const widths: number[] = []
  for (let sample = 0; sample < 6; sample += 1) {
    const box = await timer.boundingBox()
    expect(box).not.toBeNull()
    if (box !== null) {
      widths.push(box.width)
    }
    await page.waitForTimeout(120)
  }

  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
})
