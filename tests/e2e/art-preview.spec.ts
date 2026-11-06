import { expect, test, type Page } from '@playwright/test'

type PreviewSnapshot = {
  mode: string; variant: string; status: string; motion: boolean; wireframe: boolean
  elapsed: number; cacheSize: number; activeModels: string[]; reducedMotion: boolean
  camera: { position: number[]; target: number[] }
  render: { drawCalls: number; triangles: number; dpr: number; shadowMapSize: number }
}

const snapshot = (page: Page) => page.evaluate(() =>
  (window as Window & { __ART_PREVIEW_TEST__?: { snapshot: () => PreviewSnapshot } }).__ART_PREVIEW_TEST__?.snapshot())

async function pixels(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const gl = document.querySelector('canvas')?.getContext('webgl2')
    if (!gl) throw new Error('Missing WebGL canvas')
    const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data)
    return Array.from(data.filter((_, index) => index % 128 === 0))
  })
}

async function sceneFraming(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const gl = document.querySelector('canvas')!.getContext('webgl2')!
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight
    const data = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
    let left = width, right = 0, bottom = height, top = 0
    // The preview sky is CSS; nontransparent GL pixels are the authored models.
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] < 16) continue
      left = Math.min(left, x); right = Math.max(right, x)
      bottom = Math.min(bottom, y); top = Math.max(top, y)
    }
    const availableTop = document.querySelector('.preview-header')!.getBoundingClientRect().bottom
    const availableBottom = document.querySelector('.preview-footer')!.getBoundingClientRect().top
    return { left: left / width, right: right / width, top: 1 - top / height,
      bottom: 1 - bottom / height, height: (top - bottom) / height * innerHeight,
      availableHeight: availableBottom - availableTop }
  })
}

test.skip(process.env.M6_PRODUCTION === '1', 'Art V2 is an isolated dev-only preview')

test('Art V2 opens a responsive inspectable scene without changing game saves', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript(() => {
    localStorage.setItem('skyknit-cup:settings', '{"preview-sentinel":true}')
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('skyknit-cup:')) throw new Error('Preview attempted to mutate game save')
      return original.call(this, key, value)
    }
  })
  await page.goto('/art-preview.html')
  await expect(page.getByRole('heading', { name: '하늘매듭배 · 아트 작업실' })).toBeVisible({ timeout: 5000 })
  await expect.poll(() => snapshot(page)).toMatchObject({ mode: 'scene', variant: 'v2', status: 'ready' })
  const canvas = page.getByRole('img', { name: '드래곤과 부유섬 3D 미리보기' })
  await expect(canvas).toBeVisible()
  await expect.poll(async () => (await snapshot(page))!.render.triangles).toBeGreaterThan(1000)
  expect((await snapshot(page))!.render.dpr).toBeLessThanOrEqual(1.5)
  expect((await snapshot(page))!.render.shadowMapSize).toBeLessThanOrEqual(1024)
  if (page.viewportSize()!.width / page.viewportSize()!.height < 0.85) {
    const framing = await sceneFraming(page)
    expect(framing.height).toBeGreaterThanOrEqual(framing.availableHeight * 0.4)
    expect(framing.left).toBeGreaterThan(0)
    expect(framing.right).toBeLessThan(1)
    expect(framing.top).toBeGreaterThan(0)
    expect(framing.bottom).toBeLessThan(1)
  }
  const firstPixels = await pixels(page)
  expect(Math.max(...firstPixels) - Math.min(...firstPixels)).toBeGreaterThan(40)
  await page.waitForTimeout(1100)
  expect(await pixels(page)).not.toEqual(firstPixels)
  await page.getByRole('button', { name: '동작 일시정지' }).click()
  const paused = (await snapshot(page))!.elapsed
  await page.waitForTimeout(1100)
  expect((await snapshot(page))!.elapsed).toBe(paused)
  const frozenPixels = await pixels(page)
  await page.waitForTimeout(150)
  expect(await pixels(page)).toEqual(frozenPixels)
  await page.getByRole('button', { name: '와이어프레임' }).click()
  expect((await snapshot(page))!.wireframe).toBe(true)
  await page.getByRole('button', { name: '와이어프레임' }).click()
  for (const [label, mode] of [['드래곤', 'dragon'], ['부유섬', 'hub'], ['함께', 'scene']]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect.poll(() => snapshot(page)).toMatchObject({ mode, status: 'ready' })
    await page.screenshot({ path: `artifacts/art-v2/browser/${info.project.name}-${mode}.png` })
    const before = (await snapshot(page))!.camera
    await canvas.focus()
    await page.keyboard.press('ArrowLeft')
    await expect.poll(async () => (await snapshot(page))!.camera).not.toEqual(before)
    await page.getByRole('button', { name: '시점 초기화' }).click()
    await expect.poll(async () => (await snapshot(page))!.camera.position.map((value, index) => Math.abs(value - before.position[index])).reduce((sum, value) => sum + value, 0)).toBeLessThan(0.000001)
  }
  const dragStart = (await snapshot(page))!.camera.position
  const viewport = page.viewportSize()!
  const x = viewport.width * 0.5, y = viewport.height * 0.42
  if (info.project.use.hasTouch) {
    const session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    for (let step = 1; step <= 5; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 10, y: y + step * 2, id: 1 }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const beforePinch = (await snapshot(page))!.camera.position
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 24, y, id: 1 }, { x: x + 24, y, id: 2 }] })
    for (let step = 1; step <= 5; step++) await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x - 24 - step * 7, y, id: 1 }, { x: x + 24 + step * 7, y, id: 2 }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => (await snapshot(page))!.camera.position).not.toEqual(beforePinch)
    await session.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 90, y + 20, { steps: 5 })
    await page.mouse.up()
    const beforeZoom = (await snapshot(page))!.camera.position
    await page.mouse.wheel(0, -200)
    await expect.poll(async () => (await snapshot(page))!.camera.position).not.toEqual(beforeZoom)
  }
  await expect.poll(async () => (await snapshot(page))!.camera.position).not.toEqual(dragStart)
  await page.getByRole('button', { name: '시점 초기화' }).click()
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    viewport: { width: innerWidth, height: innerHeight },
    targets: Array.from(document.querySelectorAll('button, select, .preview-home')).map(element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height, hidden: element.getClientRects().length === 0 }
    }),
    save: localStorage.getItem('skyknit-cup:settings'),
  }))
  expect(geometry.overflow).toBe(false)
  const visibleTargets = geometry.targets.filter(target => !target.hidden)
  for (const [index, target] of visibleTargets.entries()) {
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)
    expect(target.x).toBeGreaterThanOrEqual(0)
    expect(target.y).toBeGreaterThanOrEqual(0)
    expect(target.x + target.width).toBeLessThanOrEqual(geometry.viewport.width)
    expect(target.y + target.height).toBeLessThanOrEqual(geometry.viewport.height)
    for (const other of visibleTargets.slice(index + 1)) {
      const overlapWidth = Math.min(target.x + target.width, other.x + other.width) - Math.max(target.x, other.x)
      const overlapHeight = Math.min(target.y + target.height, other.y + other.height) - Math.max(target.y, other.y)
      expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true)
    }
  }
  expect(geometry.save).toBe('{"preview-sentinel":true}')
  await page.screenshot({ path: `artifacts/art-v2/browser/${info.project.name}-scene.png` })
  if (viewport.width / viewport.height < 0.85) {
    await page.setViewportSize({ width: 844, height: 390 })
    await expect.poll(async () => (await sceneFraming(page)).right).toBeLessThan(1)
    await page.setViewportSize(viewport)
    await expect.poll(async () => {
      const framing = await sceneFraming(page)
      return framing.height / framing.availableHeight
    }).toBeGreaterThanOrEqual(0.4)
    expect((await snapshot(page))!.activeModels).toEqual(['v2:hub', 'v2:dragon'])
    await page.screenshot({ path: `artifacts/art-v2/browser/${info.project.name}-scene-resized.png` })
  }
  expect(errors).toEqual([])
})

test('Art V2 compares current assets and ignores stale model loads', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One async model loading contract')
  await page.route('**/artifacts/art-v2/dragon-v2.glb', async route => {
    await new Promise(resolve => setTimeout(resolve, 700))
    await route.continue()
  })
  await page.goto('/art-preview.html')
  await page.getByLabel('비교 버전').selectOption('current')
  await page.getByRole('button', { name: '부유섬', exact: true }).click()
  await expect.poll(() => snapshot(page)).toMatchObject({ mode: 'hub', variant: 'current', status: 'ready', activeModels: ['current:hub'] })
  await page.waitForTimeout(900)
  expect(await snapshot(page)).toMatchObject({ mode: 'hub', variant: 'current', activeModels: ['current:hub'] })
  await page.getByRole('button', { name: '함께', exact: true }).click()
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready', activeModels: ['current:hub', 'current:dragon'] })
  await expect.poll(async () => {
    const currentPixels = await pixels(page)
    return Math.max(...currentPixels) - Math.min(...currentPixels)
  }).toBeGreaterThan(40)
  await page.screenshot({ path: 'artifacts/art-v2/browser/desktop-current-scene.png' })
  await page.getByLabel('비교 버전').selectOption('v2')
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready', activeModels: ['v2:hub', 'v2:dragon'] })
  expect((await snapshot(page))!.cacheSize).toBeLessThanOrEqual(4)
})

test('Art V2 reports failed assets and allows retry', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One recoverable load failure contract')
  await page.route('**/artifacts/art-v2/dragon-v2.glb', route => route.abort())
  await page.goto('/art-preview.html')
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible()
  expect((await snapshot(page))!.status).toBe('error')
  await page.unroute('**/artifacts/art-v2/dragon-v2.glb')
  await page.getByRole('button', { name: '다시 불러오기' }).click()
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready' })
})

test('Art V2 preserves the last valid camera during resize while loading a variant', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One delayed-load resize contract')
  await page.goto('/art-preview.html')
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready' })
  const before = (await snapshot(page))!.camera
  let releaseLoad!: () => void
  const delayed = new Promise<void>(resolve => { releaseLoad = resolve })
  await page.route('**/assets/models/**', async route => { await delayed; await route.continue() })
  await page.getByLabel('비교 버전').selectOption('current')
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'loading' })
  try {
    await page.setViewportSize({ width: 1000, height: 700 })
    await expect.poll(() => page.locator('canvas').evaluate(canvas => canvas.width)).toBe(1000)
    expect((await snapshot(page))!.camera).toEqual(before)
  } finally {
    releaseLoad()
  }
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready', variant: 'current' })
  expect((await sceneFraming(page)).height).toBeGreaterThan(0)
})

test('Art V2 respects reduced motion with an explicit playback control', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One media preference contract')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/art-preview.html')
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready', motion: false, reducedMotion: true })
  await page.getByRole('button', { name: '동작 재생' }).click()
  await expect.poll(() => snapshot(page)).toMatchObject({ motion: true })
})

test('Art V2 remains usable after navigating away and returning', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One browser navigation lifecycle contract')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/art-preview.html')
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready' })
  await page.goto('about:blank')
  await page.goBack()
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready' })
  await page.getByRole('button', { name: '드래곤', exact: true }).click()
  await expect.poll(() => snapshot(page)).toMatchObject({ status: 'ready', mode: 'dragon' })
  const result = await pixels(page)
  expect(Math.max(...result) - Math.min(...result)).toBeGreaterThan(40)
  expect(errors).toEqual([])
})
