import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const BASE_URL = 'http://127.0.0.1:4176'
const SAMPLE_DURATION_MS = 30_000
const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'rc4'

interface FrameMeasurement {
  readonly durationMs: number
  readonly frameCount: number
  readonly bucketFps: readonly number[]
}

interface PerformanceResult {
  readonly label: string
  readonly viewport: readonly [number, number]
  readonly quality: 'low' | 'high'
  readonly pixelRatio: number
  readonly canvas: readonly [number, number]
  readonly medianFps: number
  readonly meanFps: number
  readonly minimumBucketFps: number
  readonly bucketFps: readonly number[]
  readonly hostFrames: number
  readonly fixedSteps: number
  readonly maxStepsPerFrame: number
  readonly drawCalls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly gameMode: 'race' | 'explore'
}

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

async function collectFrames(page: Page): Promise<FrameMeasurement> {
  return page.evaluate(
    (durationMs) =>
      new Promise<FrameMeasurement>((resolve) => {
        let startTime: number | null = null
        let frameCount = 0
        const buckets: number[] = []

        const sample = (time: number): void => {
          startTime ??= time
          const elapsed = time - startTime
          if (elapsed >= durationMs) {
            resolve({
              durationMs: elapsed,
              frameCount,
              bucketFps: buckets,
            })
            return
          }

          const bucket = Math.floor(elapsed / 1_000)
          buckets[bucket] = (buckets[bucket] ?? 0) + 1
          frameCount += 1
          requestAnimationFrame(sample)
        }

        requestAnimationFrame(sample)
      }),
    SAMPLE_DURATION_MS,
  )
}

async function measure(
  page: Page,
  label: string,
  quality: 'low' | 'high',
  touch: boolean,
  viewport: readonly [number, number],
  mode: 'race' | 'explore' = 'race',
): Promise<PerformanceResult> {
  await page.context().addInitScript((selectedQuality) => {
    localStorage.setItem(
      'skyknit-cup:settings',
      JSON.stringify({
        version: 2,
        bestTimeMs: null,
        muted: true,
        quality: selectedQuality,
      }),
    )
  }, quality)
  await page.goto(BASE_URL)
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  if (mode === 'explore') {
    await page.getByRole('button', { name: '하늘 탐험' }).click()
    await page.evaluate(() =>
      window.__DRAGON_RACE_TEST__?.qaExploreRegion('cloud-ruins'),
    )
    await expect
      .poll(async () => (await readSnapshot(page))?.gameMode)
      .toBe('explore')
    await expect
      .poll(async () =>
        (await readSnapshot(page))?.exploration.regionAssets.find(
          (asset) => asset.id === 'cloud-ruins',
        )?.status,
      )
      .toBe('loaded')
  } else if (touch) {
    await page.locator('[data-touch-role="joystick"]').tap({
      position: { x: 56, y: 30 },
    })
  } else {
    await page.keyboard.press('ArrowUp')
  }
  if (mode === 'race') {
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 4_000,
      })
      .toBe('racing')
  }
  await page.waitForTimeout(mode === 'explore' ? 5_000 : 1_000)

  const start = await readSnapshot(page)
  const frames = await collectFrames(page)
  const end = await readSnapshot(page)
  expect(start).not.toBeNull()
  expect(end).not.toBeNull()
  const fullBuckets = frames.bucketFps.slice(1, -1)
  const meanFps =
    fullBuckets.reduce((sum, fps) => sum + fps, 0) / fullBuckets.length
  const canvas = await page.locator('canvas.game-canvas').evaluate((element) => [
    element.width,
    element.height,
  ] as const)

  return {
    label,
    viewport,
    quality,
    pixelRatio: end?.render.pixelRatio ?? 0,
    canvas,
    medianFps: median(fullBuckets),
    meanFps,
    minimumBucketFps: Math.min(...fullBuckets),
    bucketFps: fullBuckets,
    hostFrames: (end?.hostFrames ?? 0) - (start?.hostFrames ?? 0),
    fixedSteps: (end?.stepCount ?? 0) - (start?.stepCount ?? 0),
    maxStepsPerFrame: end?.maxStepsPerFrame ?? 0,
    drawCalls: end?.render.drawCalls ?? 0,
    triangles: end?.render.triangles ?? 0,
    geometries: end?.render.geometries ?? 0,
    textures: end?.render.textures ?? 0,
    gameMode: end?.gameMode ?? mode,
  }
}

async function newMeasuredPage(
  browser: Browser,
  viewport: readonly [number, number],
  touch: boolean,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    hasTouch: touch,
    isMobile: touch,
  })
  return context.newPage()
}

test('meets the 30 second desktop and mobile frame budgets', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const desktopViewport = [1_440, 900] as const
  const mobileViewport = [844, 390] as const
  const desktopPage = await newMeasuredPage(
    browser,
    desktopViewport,
    false,
  )
  const desktop = await measure(
    desktopPage,
    'desktop-high',
    'high',
    false,
    desktopViewport,
  )
  await desktopPage.context().close()

  const mobilePage = await newMeasuredPage(
    browser,
    mobileViewport,
    true,
  )
  const mobile = await measure(
    mobilePage,
    'mobile-low',
    'low',
    true,
    mobileViewport,
  )
  await mobilePage.context().close()

  const desktopExplorePage = await newMeasuredPage(
    browser,
    desktopViewport,
    false,
  )
  const desktopExplore = await measure(
    desktopExplorePage,
    'desktop-explore-high',
    'high',
    false,
    desktopViewport,
    'explore',
  )
  await desktopExplorePage.context().close()

  const mobileExplorePage = await newMeasuredPage(
    browser,
    mobileViewport,
    true,
  )
  const mobileExplore = await measure(
    mobileExplorePage,
    'mobile-explore-low',
    'low',
    true,
    mobileViewport,
    'explore',
  )
  await mobileExplorePage.context().close()

  const artifactPath = path.resolve(
    `artifacts/browser-qa/${QA_SCOPE}/performance-30s.json`,
  )
  await mkdir(path.dirname(artifactPath), { recursive: true })
  await writeFile(
    artifactPath,
    `${JSON.stringify({ desktop, mobile, desktopExplore, mobileExplore }, null, 2)}\n`,
    'utf8',
  )
  console.log(JSON.stringify({ desktop, mobile, desktopExplore, mobileExplore }))

  expect(desktop.medianFps).toBeGreaterThanOrEqual(55)
  expect(desktop.minimumBucketFps).toBeGreaterThanOrEqual(50)
  expect(mobile.medianFps).toBeGreaterThanOrEqual(30)
  expect(desktop.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(desktop.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(mobile.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(mobile.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(desktopExplore.medianFps).toBeGreaterThanOrEqual(55)
  expect(desktopExplore.minimumBucketFps).toBeGreaterThanOrEqual(50)
  expect(mobileExplore.medianFps).toBeGreaterThanOrEqual(30)
  expect(mobileExplore.minimumBucketFps).toBeGreaterThanOrEqual(30)
  expect(desktopExplore.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(desktopExplore.fixedSteps).toBeLessThanOrEqual(1_810)
  expect(mobileExplore.fixedSteps).toBeGreaterThanOrEqual(1_790)
  expect(mobileExplore.fixedSteps).toBeLessThanOrEqual(1_810)
})
