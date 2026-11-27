import { expect, test, type Page } from '@playwright/test'

interface CanvasSample {
  readonly minimumLuma: number
  readonly maximumLuma: number
  readonly hash: number
}

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'rc7'

async function sampleCanvas(page: Page): Promise<CanvasSample | null> {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.game-canvas')
    const context = canvas?.getContext('webgl2')
    if (context === null || context === undefined) {
      return null
    }
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

test('ships a clean production race in every required viewport', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  const warnings: string[] = []
  const failedRequests: string[] = []
  const loadedAudio: Array<{
    readonly url: string
    readonly status: number
    readonly contentType: string
  }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    } else if (
      message.type() === 'warning' &&
      !message.text().includes('GPU stall due to ReadPixels')
    ) {
      warnings.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => {
    if (
      request.url().includes('/assets/audio/') &&
      request.failure()?.errorText.includes('ERR_ABORTED') === true
    ) {
      return
    }
    failedRequests.push(`${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (
      response.url().includes('/assets/audio/') &&
      response.status() < 400
    ) {
      loadedAudio.push({
        url: response.url(),
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
      })
    }
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto(
    '/?mode=race&qaCourse=1&qaCollision=1&qaBoost=1&qaWave=1&qaGateIndicator=1&qaReducedMotion=1&forceWebglFailure=1&forceDragonFailure=1',
  )
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1)
  await expect(page.locator('[data-mission-select="true"]')).toBeVisible()
  await expect(page.locator('[data-mission-start="true"]')).toBeVisible()
  await expect(page.locator('.qa-course-control')).toHaveCount(0)
  await expect(page.locator('.resource-notice:visible')).toHaveCount(0)
  expect(
    await page.evaluate(() => ({
      testHook: '__DRAGON_RACE_TEST__' in window,
      debugMirror: document
        .querySelector('#app')
        ?.hasAttribute('data-flight-debug'),
    })),
  ).toEqual({ testHook: false, debugMirror: false })

  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect(page.locator('[data-explore-music-volume="true"]')).toBeVisible()
  await expect.poll(() => loadedAudio.length).toBeGreaterThan(0)
  expect(
    loadedAudio.some(
      ({ url, status, contentType }) =>
        url.endsWith('sovereign-of-the-sunrise-skies-loop.ogg') &&
        (status === 200 || status === 206) &&
        /^(?:audio|application)\/ogg(?:;|$)/i.test(contentType),
    ),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '미션 선택으로' }).click()
  await expect(page.locator('[data-mission-select="true"]')).toBeVisible()

  const first = await sampleCanvas(page)
  expect(first).not.toBeNull()
  expect((first?.maximumLuma ?? 0) - (first?.minimumLuma ?? 255)).toBeGreaterThan(
    40,
  )

  if (testInfo.project.name.startsWith('touch')) {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }
  await expect(page.locator('.race-hud')).toHaveAttribute(
    'data-phase',
    'racing',
    { timeout: 6_000 },
  )
  await expect(page.locator('[data-mission-tracker="true"]')).toBeVisible()
  await page.waitForTimeout(500)
  const second = await sampleCanvas(page)
  expect(second?.hash).not.toBe(first?.hash)

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }))
  expect(layout.scrollWidth).toBe(layout.clientWidth)
  expect(layout.scrollHeight).toBe(layout.clientHeight)
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/production-${testInfo.project.name}.png`,
  })

  expect(errors).toEqual([])
  expect(warnings).toEqual([])
  expect(failedRequests).toEqual([])
})

test('ships the default M46 adventure without QA hooks in every required viewport', async ({ page }, testInfo) => {
  const errors: string[] = []
  const warnings: string[] = []
  const failedRequests: string[] = []
  const loadedModels: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
    if (message.type() === 'warning' && !message.text().includes('GPU stall due to ReadPixels')) warnings.push(message.text())
  })
  page.on('requestfailed', request => {
    if (request.url().includes('/assets/audio/') && request.failure()?.errorText.includes('ERR_ABORTED')) return
    failedRequests.push(`${request.method()} ${request.url()}`)
  })
  page.on('response', response => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
    else if (new URL(response.url()).pathname.endsWith('.glb')) loadedModels.push(response.url())
  })

  // No seeded progress, QA parameters, state mutation, or debug snapshot reads.
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'renderer-ready')
  await expect(page.locator('#app')).toHaveAttribute('data-game-mode', 'explore')
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1)
  await expect.poll(() => loadedModels.some(url => url.endsWith('/world/adventure-hub.glb'))).toBe(true)
  await expect.poll(() => loadedModels.some(url => url.endsWith('/characters/skyknit-dragon.glb'))).toBe(true)
  await expect(page.locator('.resource-notice:visible')).toHaveCount(0)
  expect(await page.evaluate(() => ({
    testHook: '__DRAGON_RACE_TEST__' in window,
    debugMirror: document.querySelector('#app')?.hasAttribute('data-flight-debug'),
  }))).toEqual({ testHook: false, debugMirror: false })

  const start = page.locator('[data-adventure-start]')
  await expect(start).toBeVisible()
  await expect(start).toBeInViewport()
  const startBox = await start.boundingBox()
  expect(startBox?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(startBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `artifacts/browser-qa/${QA_SCOPE}/production-adventure-${testInfo.project.name}-intro.png` })
  if (testInfo.project.name.startsWith('touch')) await start.tap()
  else { await start.focus(); await page.keyboard.press('Enter') }
  await expect(page.locator('[data-adventure-objective]')).toHaveText('누리와 이야기하기')
  const interact = page.locator('[data-adventure-interact]')
  await expect(interact).toBeVisible()
  await expect(interact).toBeInViewport()
  if (testInfo.project.name.startsWith('touch')) await interact.tap()
  else { await page.locator('canvas.game-canvas').focus(); await page.keyboard.press('KeyE') }
  await expect(page.locator('[data-adventure-objective]')).toHaveText('절벽 선반의 바람새 구조하기')

  const first = await sampleCanvas(page)
  await page.waitForTimeout(1100)
  const second = await sampleCanvas(page)
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect((first?.maximumLuma ?? 0) - (first?.minimumLuma ?? 255)).toBeGreaterThan(40)
  expect(second?.hash).not.toBe(first?.hash)
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth, viewportHeight: innerHeight,
  }))
  expect(layout.width).toBe(layout.viewportWidth)
  expect(layout.height).toBe(layout.viewportHeight)
  await page.screenshot({ path: `artifacts/browser-qa/${QA_SCOPE}/production-adventure-${testInfo.project.name}-quest.png` })
  expect(errors).toEqual([])
  expect(warnings).toEqual([])
  expect(failedRequests).toEqual([])
})
