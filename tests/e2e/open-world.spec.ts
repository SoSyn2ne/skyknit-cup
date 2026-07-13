import { expect, test } from '@playwright/test'

const REGIONS = ['festival-hub', 'wind-canyon', 'cloud-ruins'] as const

test('opens exploration and streams all three regions inside every required viewport', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-game-mode', 'explore')
  await expect(page.locator('[data-explore-region]')).toBeVisible()

  for (const regionId of REGIONS) {
    await page.evaluate((id) => window.__DRAGON_RACE_TEST__?.qaExploreRegion(id), regionId)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const snapshot = window.__DRAGON_RACE_TEST__?.snapshot()
          return snapshot?.exploration.loadedRegionIds ?? []
        }),
      )
      .toContain(regionId)
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const assets = window.__DRAGON_RACE_TEST__?.snapshot()
            ?.exploration.regionAssets
          return assets?.find((asset) => asset.id === id) ?? null
        }, regionId),
      )
      .toMatchObject({ id: regionId, status: 'loaded' })
    await page.screenshot({
      path: `artifacts/browser-qa/rc5/${testInfo.project.name}-${regionId}.png`,
    })
  }

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
  }))
  expect(layout.width).toBe(layout.viewportWidth)
  expect(layout.height).toBe(layout.viewportHeight)

  expect(errors).toEqual([])
})

test('lands, takes off, and enters the existing race challenge', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop interaction contract')
  await page.goto('/')
  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'))

  const context = page.locator('[data-explore-context]')
  await expect(context).toHaveText('착륙')
  await context.click()
  await expect
    .poll(() => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.movement))
    .toBe('landed')
  await expect(context).toHaveText('이륙')
  await context.click()
  await expect
    .poll(() => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.movement))
    .toBe('airborne')

  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaExploreChallenge())
  await expect(context).toHaveText('레이스 도전')
  await page.keyboard.press('Enter')
  await expect(page.locator('#app')).toHaveAttribute('data-game-mode', 'race')
  await expect
    .poll(() => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.race.phase))
    .toBe('countdown')
})

test('persists a selected destination across reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single persistence contract')
  await page.goto('/')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await page.getByRole('button', { name: '바람 협곡' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.destinationRegionId),
    )
    .toBe('wind-canyon')

  await page.reload()
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.destinationRegionId),
    )
    .toBe('wind-canyon')
})

test('shows touch brake and context controls at usable sizes', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('touch'), 'touch viewport contract')
  await page.goto('/')
  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaExploreRegion('cloud-ruins'))

  for (const control of [
    page.locator('[data-touch-role="brake"]'),
    page.locator('[data-explore-context]'),
  ]) {
    await expect(control).toBeVisible()
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})

test('recovers exploration location and discoveries after context loss', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single recovery contract')
  await page.goto('/')
  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaExploreRegion('wind-canyon'))
  const before = await page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot())
  expect(before?.exploration.discoveredRegionIds).toContain('wind-canyon')

  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.loseContext())
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'renderer-ready')
  await expect(page.locator('#app')).toHaveAttribute('data-game-mode', 'explore')

  const recovered = await page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot())
  expect(recovered?.exploration.discoveredRegionIds).toContain('wind-canyon')
  expect(recovered?.flight.position.x).toBeCloseTo(before?.flight.position.x ?? 0, 0)
  expect(recovered?.flight.position.z).toBeCloseTo(before?.flight.position.z ?? 0, 0)
})
