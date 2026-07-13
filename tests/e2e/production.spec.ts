import { expect, test, type Page } from '@playwright/test'

interface CanvasSample {
  readonly minimumLuma: number
  readonly maximumLuma: number
  readonly hash: number
}

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm6'

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
  const failedRequests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto(
    '/?qaCourse=1&qaCollision=1&qaBoost=1&qaWave=1&qaGateIndicator=1&qaReducedMotion=1&forceWebglFailure=1&forceDragonFailure=1',
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

  const first = await sampleCanvas(page)
  expect(first).not.toBeNull()
  expect((first?.maximumLuma ?? 0) - (first?.minimumLuma ?? 255)).toBeGreaterThan(
    40,
  )

  if (testInfo.project.name.startsWith('touch')) {
    await page.locator('[data-touch-role="joystick"]').tap({
      position: { x: 56, y: 30 },
    })
  } else {
    await page.keyboard.press('ArrowUp')
  }
  await expect(page.locator('.race-hud')).toHaveAttribute(
    'data-phase',
    'racing',
    { timeout: 4_000 },
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
  expect(failedRequests).toEqual([])
})
