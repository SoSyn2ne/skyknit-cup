import { expect, test, type Locator, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const REQUIRED_VIEWPORTS: Readonly<Record<string, readonly [number, number]>> = {
  desktop: [1_440, 900],
  'desktop-compact': [1_280, 720],
  'touch-landscape': [844, 390],
  'touch-portrait': [390, 844],
  'touch-minimum': [320, 568],
}

async function snapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function expectControlInViewport(
  control: Locator,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  await expect(control).toBeVisible()
  await expect(control).toBeInViewport()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
}

async function expectDialogFitsViewport(
  page: Page,
  dialog: Locator,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeInViewport()

  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
    }
  })

  expect(layout.left).toBeGreaterThanOrEqual(0)
  expect(layout.top).toBeGreaterThanOrEqual(0)
  expect(layout.right).toBeLessThanOrEqual(viewport.width)
  expect(layout.bottom).toBeLessThanOrEqual(viewport.height)
  expect(layout.documentWidth).toBe(layout.viewportWidth)
  expect(layout.documentHeight).toBe(layout.viewportHeight)

  for (const control of await dialog.locator('button:visible').all()) {
    await expectControlInViewport(control, viewport)
  }

  const story = dialog.locator('.story-prologue__story')
  const lastParagraph = story.locator('p').last()
  const scrollState = await story.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))

  expect(scrollState.clientHeight).toBeGreaterThan(0)
  expect(scrollState.scrollHeight).toBeGreaterThanOrEqual(
    scrollState.clientHeight,
  )

  if (scrollState.scrollHeight > scrollState.clientHeight) {
    await story.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(lastParagraph).toBeInViewport()
    await expectControlInViewport(dialog.locator('button'), viewport)
  }
}

test('keeps the prologue accessible and the paused mission state intact at every viewport', async ({
  page,
}, testInfo) => {
  const expectedViewport = REQUIRED_VIEWPORTS[testInfo.project.name]
  expect(expectedViewport).toBeDefined()
  const viewport = {
    width: expectedViewport[0],
    height: expectedViewport[1],
  }

  await page.goto('/?mode=race&qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  expect(page.viewportSize()).toEqual(viewport)

  const storyOpener = page.getByRole('button', {
    name: '첫 하늘매듭 서막 보기',
  })
  await expect(storyOpener).toHaveText('서막 보기')
  await expectControlInViewport(storyOpener, viewport)
  await storyOpener.click()

  const storyDialog = page.getByRole('dialog', {
    name: '첫 하늘매듭 서막',
  })
  await expect(storyDialog).toBeVisible()
  await expect(
    storyDialog.getByRole('heading', {
      name: '서막 · 끊어진 첫 매듭',
    }),
  ).toBeVisible()
  await expect(storyDialog).toContainText('비행의 메아리')
  await expect(page.locator('.race-hud')).toBeHidden()
  expect((await snapshot(page))?.race.phase).toBe('ready')
  await expectDialogFitsViewport(page, storyDialog, viewport)

  await page.keyboard.press('Escape')
  await expect(storyDialog).toBeHidden()
  await expect(storyOpener).toBeFocused()
  await expect(page.locator('.race-hud')).toBeVisible()
  expect((await snapshot(page))?.race.phase).toBe('ready')

  await page.getByRole('button', { name: '비행 시작' }).click()
  await expect
    .poll(async () => (await snapshot(page))?.race.phase, {
      timeout: 6_000,
    })
    .toBe('racing')
  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaPassCheckpoint())
  await expect
    .poll(async () => (await snapshot(page))?.race.nextCheckpointIndex)
    .toBe(1)

  if (testInfo.project.name.startsWith('touch')) {
    await page.getByRole('button', { name: '일시정지' }).tap()
  } else {
    await page.keyboard.press('Escape')
  }
  await expect
    .poll(async () => (await snapshot(page))?.race.phase)
    .toBe('paused')

  const pauseDialog = page.getByRole('dialog', {
    name: '바람길 일시정지',
  })
  const missionSelect = pauseDialog.locator('[data-mission-select="true"]')
  await expect(missionSelect).toBeVisible()
  await expect(missionSelect).toBeEnabled()
  await expect(missionSelect.locator('option')).toHaveCount(7)
  const pausedBeforeStory = await snapshot(page)
  expect(pausedBeforeStory).not.toBeNull()

  await expectControlInViewport(storyOpener, viewport)
  await storyOpener.click()
  await expect
    .poll(() =>
      storyDialog
        .locator('.story-prologue__story')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(0)
  await expectDialogFitsViewport(page, storyDialog, viewport)
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')

  await expect(storyDialog).toBeHidden()
  await expect(pauseDialog).toBeVisible()
  await expect(storyOpener).toBeFocused()
  await expect(missionSelect).toBeVisible()
  await expect(missionSelect).toBeInViewport()
  await expect(page.getByRole('button', { name: '계속 날기' })).toBeVisible()

  const pausedAfterStory = await snapshot(page)
  expect(pausedAfterStory?.race.phase).toBe('paused')
  expect(pausedAfterStory?.race.elapsedMs).toBe(
    pausedBeforeStory?.race.elapsedMs,
  )
  expect(pausedAfterStory?.race.nextCheckpointIndex).toBe(
    pausedBeforeStory?.race.nextCheckpointIndex,
  )
  expect(pausedAfterStory?.race.mission).toEqual(
    pausedBeforeStory?.race.mission,
  )
})
