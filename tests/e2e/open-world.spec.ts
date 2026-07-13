import { expect, test, type Page } from '@playwright/test'

const REGIONS = ['festival-hub', 'wind-canyon', 'cloud-ruins'] as const

interface CanvasSample {
  readonly minimumLuma: number
  readonly maximumLuma: number
  readonly hash: number
}

async function sampleCanvas(page: Page): Promise<CanvasSample | null> {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.game-canvas')
    const context = canvas?.getContext('webgl2')
    if (context === null || context === undefined) return null
    const width = context.drawingBufferWidth
    const height = context.drawingBufferHeight
    const pixels = new Uint8Array(width * height * 4)
    context.readPixels(
      0,
      0,
      width,
      height,
      context.RGBA,
      context.UNSIGNED_BYTE,
      pixels,
    )
    let minimumLuma = 255
    let maximumLuma = 0
    let hash = 2_166_136_261
    const stride = Math.max(1, Math.floor((width * height) / 50_000))
    for (let pixel = 0; pixel < width * height; pixel += stride) {
      const offset = pixel * 4
      const luma = Math.round(
        pixels[offset] * 0.2126 +
          pixels[offset + 1] * 0.7152 +
          pixels[offset + 2] * 0.0722,
      )
      minimumLuma = Math.min(minimumLuma, luma)
      maximumLuma = Math.max(maximumLuma, luma)
      hash = Math.imul(hash ^ pixels[offset], 16_777_619) >>> 0
      hash = Math.imul(hash ^ pixels[offset + 1], 16_777_619) >>> 0
      hash = Math.imul(hash ^ pixels[offset + 2], 16_777_619) >>> 0
    }
    return { minimumLuma, maximumLuma, hash }
  })
}

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
    const first = await sampleCanvas(page)
    expect(first).not.toBeNull()
    expect(
      (first?.maximumLuma ?? 0) - (first?.minimumLuma ?? 255),
    ).toBeGreaterThan(40)
    await page.waitForTimeout(500)
    const second = await sampleCanvas(page)
    expect(second).not.toBeNull()
    expect(second?.hash).not.toBe(first?.hash)
    await page.screenshot({
      path: `artifacts/browser-qa/rc7/${testInfo.project.name}-${regionId}.png`,
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

test('streams region art again after returning to missions and re-entering exploration', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single lifecycle contract')
  await page.goto('/')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.regionAssets.find(
          ({ id }) => id === 'festival-hub',
        )?.status,
      ),
    )
    .toBe('loaded')

  await page.getByRole('button', { name: '일시정지' }).click()
  await page.getByRole('button', { name: '미션 선택으로' }).click()
  await page.getByRole('button', { name: '하늘 탐험' }).click()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const exploration = window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
        return {
          status: exploration?.regionAssets.find(
            ({ id }) => id === 'festival-hub',
          )?.status,
          meshCount: exploration?.regionMeshCount ?? 0,
        }
      }),
    )
    .toMatchObject({ status: 'loaded', meshCount: expect.any(Number) })
  expect(
    await page.evaluate(
      () =>
        (window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
          .regionMeshCount ?? 0) > 0,
    ),
  ).toBe(true)
})

test('streams region art again after an exploration race round trip', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single lifecycle contract')
  await page.goto('/?qaCourse=1')
  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaExploreChallenge())
  await page.keyboard.press('Enter')
  await expect(page.locator('#app')).toHaveAttribute('data-game-mode', 'race')
  await expect
    .poll(() =>
      page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.race.phase),
      { timeout: 5_000 },
    )
    .toBe('racing')
  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
    await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaPassCheckpoint())
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.race.phase),
    )
    .toBe('finished')
  await page.getByRole('button', { name: '미션 선택' }).click()
  await page.getByRole('button', { name: '하늘 탐험' }).click()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const exploration = window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
        return {
          status: exploration?.regionAssets.find(
            ({ id }) => id === 'festival-hub',
          )?.status,
          meshCount: exploration?.regionMeshCount ?? 0,
        }
      }),
    )
    .toMatchObject({ status: 'loaded', meshCount: expect.any(Number) })
  expect(
    await page.evaluate(
      () =>
        (window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
          .regionMeshCount ?? 0) > 0,
    ),
  ).toBe(true)
})

test('keeps renderer memory stable across quality changes and exploration re-entry', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single resource lifecycle contract')
  await page.goto('/')

  const loadFestivalAt = async (quality: 'low' | 'high') => {
    if (
      (await page.locator('#app').getAttribute('data-game-mode')) === 'explore'
    ) {
      await page.getByRole('button', { name: '일시정지' }).click()
      await page.getByRole('button', { name: '미션 선택으로' }).click()
    }
    await page.locator('.race-hud__quality select').selectOption(quality)
    await page.getByRole('button', { name: '하늘 탐험' }).click()
    await page.evaluate(() =>
      window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'),
    )
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.regionAssets.find(
            ({ id }) => id === 'festival-hub',
          ),
        ),
      )
      .toMatchObject({ id: 'festival-hub', lod: quality, status: 'loaded' })
    await page.waitForTimeout(100)
    return page.evaluate(() => {
      const render = window.__DRAGON_RACE_TEST__?.snapshot()?.render
      return {
        geometries: render?.geometries ?? 0,
        textures: render?.textures ?? 0,
      }
    })
  }

  await loadFestivalAt('high')
  await loadFestivalAt('low')
  const firstSettledHigh = await loadFestivalAt('high')
  await loadFestivalAt('low')
  const secondSettledHigh = await loadFestivalAt('high')

  expect(secondSettledHigh.geometries).toBeLessThanOrEqual(
    firstSettledHigh.geometries,
  )
  expect(secondSettledHigh.textures).toBeLessThanOrEqual(
    firstSettledHigh.textures,
  )
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

  expect(
    await page.evaluate(() => {
      const context = document.querySelector('[data-explore-context]')
      const blockers = [
        document.querySelector('[data-coin-run]'),
        document.querySelector('[data-touch-role="joystick"]'),
        document.querySelector('[data-touch-role="brake"]'),
        document.querySelector('[data-touch-role="boost"]'),
      ]
      if (context === null || blockers.some((blocker) => blocker === null)) {
        return null
      }
      const contextRect = context.getBoundingClientRect()
      return blockers.map((blocker) => {
        const blockerRect = blocker!.getBoundingClientRect()
        return !(
          contextRect.right <= blockerRect.left ||
          blockerRect.right <= contextRect.left ||
          contextRect.bottom <= blockerRect.top ||
          blockerRect.bottom <= contextRect.top
        )
      })
    }),
  ).toEqual([false, false, false, false])
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
