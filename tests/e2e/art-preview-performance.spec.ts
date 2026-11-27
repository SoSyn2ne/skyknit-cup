import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

type PreviewWindow = Window & { __ART_PREVIEW_TEST__?: { snapshot: () => {
  status: string; motion: boolean; variant: string; mode: string
  render: { drawCalls: number; triangles: number; dpr: number }
} } }

// Informational dev-preview measurements, not production-game acceptance.
test('records isolated Art V2 cold transfer and 30 second animation sample', async ({ page }, info) => {
  test.skip(process.env.ART_V2_PERFORMANCE !== '1' || process.env.M6_PRODUCTION === '1', 'Opt-in dev-preview measurement')
  test.skip(!['desktop', 'touch-landscape'].includes(info.project.name), 'Two representative emulated viewports')
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/art-preview.html')
  await expect.poll(() => page.evaluate(() => (window as PreviewWindow).__ART_PREVIEW_TEST__?.snapshot().status), { timeout: 20_000 }).toBe('ready')
  await page.waitForTimeout(1500)

  const frames = await page.evaluate(() => new Promise<{
    elapsedMs: number; count: number; medianFrameMs: number; p95FrameMs: number; bucketFps: number[]
  }>(resolve => {
    let start = 0, previous = 0
    const intervals: number[] = [], bucketFps: number[] = []
    function sample(time: number) {
      if (!start) { start = time; previous = time; requestAnimationFrame(sample); return }
      const elapsed = time - start
      intervals.push(time - previous)
      previous = time
      const bucket = Math.min(29, Math.floor(elapsed / 1000))
      bucketFps[bucket] = (bucketFps[bucket] ?? 0) + 1
      if (elapsed < 30_000) { requestAnimationFrame(sample); return }
      const sorted = [...intervals].sort((a, b) => a - b)
      resolve({ elapsedMs: elapsed, count: intervals.length,
        medianFrameMs: sorted[Math.floor(sorted.length * .5)],
        p95FrameMs: sorted[Math.floor(sorted.length * .95)], bucketFps })
    }
    requestAnimationFrame(sample)
  }))
  const observed = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      snapshot: (window as PreviewWindow).__ART_PREVIEW_TEST__?.snapshot(),
      renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : 'unavailable',
      coldPageTransferBytes: resources.reduce((sum, item) => sum + item.transferSize, 0) + (navigation?.transferSize ?? 0),
      resourceCount: resources.length,
      assets: resources.filter(item => /\/artifacts\/art-v2\/.*\.glb/.test(item.name)).map(item => ({
        path: new URL(item.name).pathname, transferBytes: item.transferSize,
        encodedBodyBytes: item.encodedBodySize, decodedBodyBytes: item.decodedBodySize,
        durationMs: item.duration,
      })),
    }
  })
  expect(observed.snapshot).toMatchObject({ status: 'ready', motion: true, variant: 'v2', mode: 'scene' })
  expect(observed.assets).toHaveLength(2)
  for (const asset of observed.assets) expect(asset.decodedBodyBytes).toBeGreaterThan(100_000)
  expect(frames.count).toBeGreaterThan(0)
  expect(errors).toEqual([])
  const report = {
    scope: 'Art V2 development preview only; browser emulation, not physical-device or game performance',
    profile: info.project.name, viewport: page.viewportSize(),
    averageFps: frames.count * 1000 / frames.elapsedMs, ...frames, ...observed, errors,
  }
  await mkdir('artifacts/browser-qa/art-v2', { recursive: true })
  const output = `artifacts/browser-qa/art-v2/${info.project.name}-performance.json`
  await writeFile(output, JSON.stringify(report, null, 2))
  await info.attach('preview-performance', { path: output, contentType: 'application/json' })
  console.log(`Art V2 ${info.project.name}: ${report.averageFps.toFixed(1)} FPS; p95 ${frames.p95FrameMs.toFixed(1)} ms; ${observed.assets.reduce((sum, asset) => sum + asset.transferBytes, 0)} transferred GLB bytes`)
})
