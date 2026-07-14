import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'rc7'

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

test('frames the RC3 dragon closely on the ready screen', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  await expect
    .poll(async () => {
      const camera = (await readSnapshot(page))?.camera
      return camera === undefined
        ? null
        : {
            source: camera.dragon.source,
            expressionNodes: camera.dragon.expressionNodeCount,
            dragonVisible: camera.dragonNdc.visible,
            gateVisible: camera.gateNdc.visible,
            distance: Math.round(camera.cameraDistanceToDragon * 10) / 10,
          }
    })
    .toEqual({
      source: 'glb',
      expressionNodes: 3,
      dragonVisible: true,
      gateVisible: true,
      distance:
        testInfo.project.name === 'touch-minimum'
          ? 14.3
          : testInfo.project.name === 'touch-portrait'
            ? 12.6
            : 7.5,
    })

  if (
    testInfo.project.name === 'touch-portrait' ||
    testInfo.project.name === 'touch-minimum'
  ) {
    await expect
      .poll(
        async () =>
          (await readSnapshot(page))?.camera.dragonBoundsNdc.allVisible,
      )
      .toBe(true)
  }

  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-ready-character.png`,
  })
})

test('keeps the dragon, wind threads, and active gate readable in flight', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  if (testInfo.project.name.startsWith('touch')) {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 6_000,
    })
    .toBe('racing')

  await expect
    .poll(async () => {
      const camera = (await readSnapshot(page))?.camera
      return camera === undefined
        ? null
        : {
            dragonSource: camera.dragon.source,
            dragonVisible: camera.dragonNdc.visible,
            gateVisible: camera.gateNdc.visible,
            windThreads: camera.windThreadCount,
            routeOuterRadius: camera.windThreadOuterRadius,
            routeCoreRadius: camera.windThreadCoreRadius,
            distanceInRange:
              camera.cameraDistanceToDragon >= 8.2 &&
              camera.cameraDistanceToDragon <= 8.8,
          }
    })
    .toEqual({
      dragonSource: 'glb',
      dragonVisible: true,
      gateVisible: true,
      windThreads: 2,
      routeOuterRadius: 0.16,
      routeCoreRadius: 0.052,
      distanceInRange: true,
    })

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }))
  expect(layout.scrollWidth).toBe(layout.clientWidth)
  expect(layout.scrollHeight).toBe(layout.clientHeight)

  if (testInfo.project.name.startsWith('touch')) {
    const focusStyle = await page.locator('canvas.game-canvas').evaluate(
      (canvas) => ({
        device: canvas.parentElement?.dataset.inputDevice,
        outlineStyle: getComputedStyle(canvas).outlineStyle,
      }),
    )
    expect(focusStyle).toEqual({
      device: 'touch',
      outlineStyle: 'none',
    })
  }

  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-racing.png`,
  })
})

test('drives the RC3 boost and collision expressions', async ({
  page,
}, testInfo) => {
  await page.goto('/?qaBoost=1&qaCollision=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  if (testInfo.project.name.startsWith('touch')) {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 6_000,
    })
    .toBe('racing')

  await page.getByRole('button', { name: 'QA 부스트' }).click()
  await expect
    .poll(async () => {
      const dragon = (await readSnapshot(page))?.camera.dragon
      return dragon === undefined
        ? null
        : {
            jawOpen: dragon.jawOpenRadians > 0.04,
            squinting: dragon.blinkAmount >= 0.28,
          }
    })
    .toEqual({ jawOpen: true, squinting: true })
  await page.locator('.qa-course-control').evaluateAll((controls) => {
    for (const control of controls) control.setAttribute('hidden', '')
  })
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-boost-expression.png`,
  })
  await page.locator('.qa-course-control').evaluateAll((controls) => {
    for (const control of controls) control.removeAttribute('hidden')
  })

  await page.getByRole('button', { name: 'QA 충돌' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.blinkAmount)
    .toBe(1)
  await page.locator('.qa-course-control').evaluateAll((controls) => {
    for (const control of controls) control.setAttribute('hidden', '')
  })
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-hit-expression.png`,
  })
})
