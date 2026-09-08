import { expect, test } from '@playwright/test'

const REGIONS = [
  'festival-hub',
  'wind-canyon',
  'cloud-ruins',
  'volcanic-archipelago',
] as const
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'rc7'

test('collects the current coin through real flight in every required viewport', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/?mode=race')
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.coinRun
              .collectedCount,
        ),
      { timeout: 7_000 },
    )
    .toBe(1)

  const coinHud = page.locator('[data-coin-run]')
  await expect(coinHud).toBeVisible()
  await expect(coinHud).toContainText('동전 1/10')
  const coinGuide = page.locator('[data-coin-guide]')
  await expect(coinGuide).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.coinVisual,
      ),
    )
    .toMatchObject({
      totalCount: 40,
      visibleCount: 1,
      activeCoinId: 'festival-hub-coin-2',
      drawCalls: 1,
    })

  const box = await coinHud.boundingBox()
  const guideBox = await coinGuide.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(guideBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (box !== null && viewport !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  }
  if (guideBox !== null && viewport !== null) {
    expect(guideBox.x).toBeGreaterThanOrEqual(0)
    expect(guideBox.y).toBeGreaterThanOrEqual(0)
    expect(guideBox.x + guideBox.width).toBeLessThanOrEqual(viewport.width)
    expect(guideBox.y + guideBox.height).toBeLessThanOrEqual(viewport.height)
  }

  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-coins.png`,
  })
  expect(errors).toEqual([])
})

test('freezes the run under the map and persists all four regional bests', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single persistence contract')
  await page.goto('/?mode=race')
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'),
  )
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaCollectCoin('festival-hub', 0),
  )
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  const elapsedBeforeWait = await page.evaluate(
    () => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.coinRun.elapsedMs,
  )
  await page.waitForTimeout(250)
  expect(
    await page.evaluate(
      () => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.coinRun.elapsedMs,
    ),
  ).toBe(elapsedBeforeWait)
  await page.getByRole('button', { name: '군도 지도 열기' }).click()

  for (const regionId of REGIONS) {
    for (let index = 0; index < 10; index += 1) {
      await page.evaluate(
        ([id, coinIndex]) =>
          window.__DRAGON_RACE_TEST__?.qaCollectCoin(id, coinIndex),
        [regionId, index] as const,
      )
    }
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__DRAGON_RACE_TEST__?.snapshot()?.exploration
              .coinBestTimesMs[id],
          regionId,
        ),
      )
      .toBeGreaterThan(0)
  }

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('skyknit-cup:settings')
    return raw === null ? null : JSON.parse(raw)
  })
  expect(saved).toMatchObject({
    version: 12,
    coinBestTimesMs: {
      'festival-hub': expect.any(Number),
      'wind-canyon': expect.any(Number),
      'cloud-ruins': expect.any(Number),
      'volcanic-archipelago': expect.any(Number),
    },
    skyLeague: {
      coinTop10Ms: {
        'festival-hub': [expect.any(Number)],
        'wind-canyon': [expect.any(Number)],
        'cloud-ruins': [expect.any(Number)],
        'volcanic-archipelago': [expect.any(Number)],
      },
    },
    ghosts: {
      coin: {
        'festival-hub': {
          durationMs: expect.any(Number),
          samples: expect.any(Array),
        },
        'wind-canyon': {
          durationMs: expect.any(Number),
          samples: expect.any(Array),
        },
        'cloud-ruins': {
          durationMs: expect.any(Number),
          samples: expect.any(Array),
        },
        'volcanic-archipelago': {
          durationMs: expect.any(Number),
          samples: expect.any(Array),
        },
      },
    },
  })

  await page.reload()
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  for (const regionName of [
    '축제 중심섬',
    '바람 협곡',
    '구름 유적지',
    '태양의 심장 · 용암 군도',
  ]) {
    await expect(
      page.getByRole('button', { name: new RegExp(`${regionName}.*최고`) }),
    ).toBeVisible()
  }
})

test('hides course coins whenever exploration collection is disabled', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'single interaction contract')
  await page.goto('/?mode=race')
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreRegion('festival-hub'),
  )

  const visibleCount = () =>
    page.evaluate(
      () =>
        window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.coinVisual
          .visibleCount,
    )
  const coinGuide = page.locator('[data-coin-guide]')
  await expect.poll(visibleCount).toBe(1)

  await page.keyboard.press('Escape')
  await expect.poll(visibleCount).toBe(0)
  await expect(coinGuide).toBeHidden()
  await page.keyboard.press('Escape')
  await expect.poll(visibleCount).toBe(1)

  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await expect.poll(visibleCount).toBe(0)
  await expect(coinGuide).toBeHidden()
  await page.getByRole('button', { name: '군도 지도 열기' }).click()
  await expect.poll(visibleCount).toBe(1)

  const context = page.locator('[data-explore-context]')
  await expect(context).toHaveText('착륙')
  await context.click()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.movement,
      ),
    )
    .toBe('landed')
  await expect.poll(visibleCount).toBe(0)
  await expect(coinGuide).toBeHidden()
})
