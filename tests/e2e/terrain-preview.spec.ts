import { expect, test, type Page } from '@playwright/test'

type TerrainPreviewSnapshot = {
  status: string
  preset: string
  viewMode: string
  wireframe: boolean
  heightScale: number
  autoSlope: number
  autoHeight: number
  usePbrTextures: boolean
  pbrTexturesLoaded: boolean
  props: {
    visible: boolean
    loading: boolean
    loadedAssetCount: number
    instanceCount: number
    landmarkCount: number
    dragonLoaded: boolean
  }
  motion: boolean
  toolMode: string
  brushMode: string
  inspectorOpen: boolean
  reducedMotion: boolean
  elapsed: number
  sculptCount: number
  camera: { position: number[]; target: number[] }
  clipmap: {
    lodCount: number
    vertexCount: number
    triangleCount: number
    terrainDrawCalls: number
    level0Origin: [number, number]
    levelLastOrigin: [number, number]
  }
  render: {
    drawCalls: number
    triangles: number
    dpr: number
  }
}

type TerrainTestBridge = {
  snapshot: () => TerrainPreviewSnapshot
  moveCameraTo: (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
  ) => void
  applyTestBrush: (worldX: number, worldZ: number) => boolean
  sampleHeight: (worldX: number, worldZ: number) => number
}

const getSnapshot = (page: Page) =>
  page.evaluate(() =>
    (
      window as Window & {
        __TERRAIN_PREVIEW_TEST__?: TerrainTestBridge
      }
    ).__TERRAIN_PREVIEW_TEST__?.snapshot(),
  )

async function sampleCanvasPixels(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const gl = document.querySelector('canvas')?.getContext('webgl2')
    if (!gl) {
      throw new Error('Missing WebGL2 canvas')
    }
    const data = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    )
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    )
    const sampled: number[] = []
    for (let i = 0; i < data.length; i += 256) {
      sampled.push(data[i], data[i + 1], data[i + 2])
    }
    return sampled
  })
}

test.skip(
  process.env.M6_PRODUCTION === '1',
  'Terrain3D preview is an isolated dev-only sandbox',
)

test('Terrain3D sandbox renders crack-free GPU clipmap across 5 viewports without mutating game saves', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  await page.addInitScript(() => {
    localStorage.setItem('skyknit-cup:settings', '{"terrain-sentinel":true}')
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('skyknit-cup:')) {
        throw new Error('Terrain preview attempted to mutate game save')
      }
      return original.call(this, key, value)
    }
  })

  await page.goto('/terrain-preview.html')
  await expect(
    page.getByRole('heading', { name: '하늘섬 드래곤 · Terrain3D 실험실' }),
  ).toBeVisible({ timeout: 5000 })
  await expect
    .poll(() => getSnapshot(page), { timeout: 15_000 })
    .toMatchObject({
      status: 'ready',
      preset: 'sky-highlands',
      viewMode: 'lit',
      pbrTexturesLoaded: true,
      props: {
        visible: true,
        loading: false,
        dragonLoaded: true,
      },
    })

  const snap0 = (await getSnapshot(page))!
  expect(snap0.clipmap.lodCount).toBe(5)
  expect(snap0.clipmap.terrainDrawCalls).toBe(1)
  expect(snap0.props.instanceCount).toBeGreaterThan(80)
  expect(snap0.props.landmarkCount).toBeGreaterThanOrEqual(3)
  expect(snap0.render.drawCalls).toBeLessThanOrEqual(70)
  expect(snap0.render.triangles).toBeGreaterThan(20_000)
  expect(snap0.render.dpr).toBeLessThanOrEqual(1.5)

  // Verify non-blank pixels and pixel motion over 1.1s
  const firstPixels = await sampleCanvasPixels(page)
  const spread = Math.max(...firstPixels) - Math.min(...firstPixels)
  expect(spread).toBeGreaterThan(45)

  await page.waitForTimeout(1100)
  const laterPixels = await sampleCanvasPixels(page)
  expect(laterPixels).not.toEqual(firstPixels)

  // Verify responsive UI geometry (44x44 touch targets, safe bounds, zero overlap, zero horizontal scroll)
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    viewport: { width: innerWidth, height: innerHeight },
    targets: Array.from(
      document.querySelectorAll(
        'header button, header a, footer button, footer select',
      ),
    ).map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect()
      return {
        label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
        x,
        y,
        width,
        height,
        hidden: el.getClientRects().length === 0,
      }
    }),
    save: localStorage.getItem('skyknit-cup:settings'),
  }))

  expect(geometry.overflow).toBe(false)
  expect(geometry.save).toBe('{"terrain-sentinel":true}')

  const visibleTargets = geometry.targets.filter((target) => !target.hidden)
  for (const [index, target] of visibleTargets.entries()) {
    expect(target.width, `width for ${target.label}`).toBeGreaterThanOrEqual(44)
    expect(target.height, `height for ${target.label}`).toBeGreaterThanOrEqual(44)
    expect(target.x, `left bound for ${target.label}`).toBeGreaterThanOrEqual(0)
    expect(target.y, `top bound for ${target.label}`).toBeGreaterThanOrEqual(0)
    expect(
      target.x + target.width,
      `right bound for ${target.label}`,
    ).toBeLessThanOrEqual(geometry.viewport.width + 0.5)
    expect(
      target.y + target.height,
      `bottom bound for ${target.label}`,
    ).toBeLessThanOrEqual(geometry.viewport.height + 0.5)

    for (const other of visibleTargets.slice(index + 1)) {
      const overlapX =
        Math.min(target.x + target.width, other.x + other.width) -
        Math.max(target.x, other.x)
      const overlapY =
        Math.min(target.y + target.height, other.y + other.height) -
        Math.max(target.y, other.y)
      expect(
        overlapX <= 0.5 || overlapY <= 0.5,
        `overlap between ${target.label} and ${other.label}`,
      ).toBe(true)
    }
  }

  // Pause motion for crisp deterministic screenshots across view modes
  await page.getByRole('button', { name: '자동 공전 일시정지' }).click()
  await page.screenshot({
    path: `test-results/terrain-preview/${info.project.name}-lit.png`,
  })

  // Switch to LOD visualizer mode and verify clipmap visual shift
  await page.getByRole('button', { name: 'LOD', exact: true }).click()
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({ viewMode: 'lod' })
  await page.screenshot({
    path: `test-results/terrain-preview/${info.project.name}-lod.png`,
  })

  // Switch back to lit & verify zero errors
  await page.getByRole('button', { name: '렌더', exact: true }).click()
  expect(errors).toEqual([])
})

test('Terrain3D supports presets, clipmap snapping, wireframe, inspector sculpt brush, and reduced motion', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Full feature matrix on desktop')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/terrain-preview.html')
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({
      status: 'ready',
      motion: false,
      reducedMotion: true,
    })

  // Test Clipmap LOD snapping when camera flies across the world
  const originBefore = (await getSnapshot(page))!.clipmap.level0Origin
  await page.evaluate(() => {
    const bridge = (
      window as Window & { __TERRAIN_PREVIEW_TEST__?: TerrainTestBridge }
    ).__TERRAIN_PREVIEW_TEST__!
    bridge.moveCameraTo(-82, 108, -94, -10, 24, -10)
  })
  const originAfter = (await getSnapshot(page))!.clipmap.level0Origin
  expect(originAfter).not.toEqual(originBefore)

  // Test Wind Canyon & Volcanic Caldera presets with screenshots (wait for async CC0 props)
  await page.getByLabel('지형 프리셋').selectOption('wind-canyon')
  await expect
    .poll(() => getSnapshot(page), { timeout: 15_000 })
    .toMatchObject({
      preset: 'wind-canyon',
      props: { loading: false },
    })
  await page.getByRole('button', { name: '시점 초기화' }).click()
  await page.screenshot({
    path: 'test-results/terrain-preview/desktop-wind-canyon.png',
  })

  await page.getByLabel('지형 프리셋').selectOption('volcanic-caldera')
  await expect
    .poll(() => getSnapshot(page), { timeout: 15_000 })
    .toMatchObject({
      preset: 'volcanic-caldera',
      props: { loading: false },
    })
  await page.screenshot({
    path: 'test-results/terrain-preview/desktop-volcanic-caldera.png',
  })

  // Test Slope heatmap + Wireframe toggle
  await page.getByRole('button', { name: '경사', exact: true }).click()
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({ viewMode: 'slope' })
  await page.getByRole('button', { name: '와이어프레임' }).click()
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({ wireframe: true })
  await page.getByRole('button', { name: '와이어프레임' }).click()
  await page.getByRole('button', { name: '렌더', exact: true }).click()

  // Open Inspector drawer, switch to brush mode, sculpt terrain, verify height rises
  await page.getByLabel('지형 프리셋').selectOption('sky-highlands')
  await page.getByRole('button', { name: '지형 브러시 및 셰이더 설정' }).click()
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({ inspectorOpen: true })
  await page.getByRole('button', { name: '브러시 편집' }).click()
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({ toolMode: 'sculpt', brushMode: 'raise' })

  const heightDelta = await page.evaluate(() => {
    const bridge = (
      window as Window & { __TERRAIN_PREVIEW_TEST__?: TerrainTestBridge }
    ).__TERRAIN_PREVIEW_TEST__!
    const before = bridge.sampleHeight(0, 0)
    bridge.applyTestBrush(0, 0)
    const after = bridge.sampleHeight(0, 0)
    return after - before
  })
  expect(heightDelta).toBeGreaterThan(2)
  expect((await getSnapshot(page))!.sculptCount).toBeGreaterThanOrEqual(1)

  await page.screenshot({
    path: 'test-results/terrain-preview/desktop-inspector-sculpt.png',
  })

  await page.getByRole('button', { name: '설정 닫기' }).click()
  await expect
    .poll(() => getSnapshot(page))
    .toMatchObject({ inspectorOpen: false })

  expect(errors).toEqual([])
})
