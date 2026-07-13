import { expect, test, type Page } from '@playwright/test'

interface CanvasSample {
  readonly width: number
  readonly height: number
  readonly minimumLuma: number
  readonly maximumLuma: number
  readonly sampledPixels: number
  readonly hash: number
}

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
    let sampledPixels = 0
    let hash = 2_166_136_261
    const pixelStride = Math.max(1, Math.floor((width * height) / 50_000))
    for (let pixel = 0; pixel < width * height; pixel += pixelStride) {
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
      sampledPixels += 1
    }

    return {
      width,
      height,
      minimumLuma,
      maximumLuma,
      sampledPixels,
      hash,
    }
  })
}

test('renders nonblank pixels that change over time', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const first = await sampleCanvas(page)
  expect(first).not.toBeNull()
  expect((first?.maximumLuma ?? 0) - (first?.minimumLuma ?? 255)).toBeGreaterThan(
    40,
  )
  await page.waitForTimeout(500)
  const second = await sampleCanvas(page)
  expect(second).not.toBeNull()
  expect(second?.hash).not.toBe(first?.hash)

  console.log(
    `canvas-pixels ${testInfo.project.name}: ${first?.width}x${first?.height}, ` +
      `luma ${first?.minimumLuma}-${first?.maximumLuma}, ` +
      `${first?.sampledPixels} samples, hashes ${first?.hash}->${second?.hash}`,
  )
})
