import { expect, test, type Page } from '@playwright/test'

import type { CharacterLoadout } from '../../src/game/customization/characterCatalog'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const DEFAULT_LOADOUT: CharacterLoadout = {
  characterId: 'sunrise-dragon',
  paletteId: 'sunrise',
  accessoryId: 'none',
}

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function selectLoadout(
  page: Page,
  loadout: CharacterLoadout,
): Promise<void> {
  await page.getByLabel('캐릭터 형태').selectOption(loadout.characterId)
  await page.getByLabel('색상').selectOption(loadout.paletteId)
  await page.getByLabel('장식').selectOption(loadout.accessoryId)
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(loadout)
}

async function expectPortraitPreviewClearance(
  page: Page,
  dialogTop: number,
  viewportHeight: number,
): Promise<void> {
  for (let sample = 0; sample < 5; sample += 1) {
    const snapshot = await readSnapshot(page)
    expect(snapshot).not.toBeNull()
    const boundsBottom =
      (1 - (snapshot?.camera.dragonBoundsNdc.minY ?? -1)) *
      0.5 *
      viewportHeight
    expect(boundsBottom).toBeLessThanOrEqual(dialogTop - 12)
    await page.waitForTimeout(100)
  }
}

test('previews a flying creature safely inside every supported viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  expect((await readSnapshot(page))?.race.phase).toBe('ready')

  const opener = page.getByRole('button', { name: '캐릭터 꾸미기' })
  await expect(opener).toBeVisible()
  const openerBox = await opener.boundingBox()
  expect(openerBox).not.toBeNull()
  expect(openerBox?.width).toBeGreaterThanOrEqual(44)
  expect(openerBox?.height).toBeGreaterThanOrEqual(44)
  await opener.click()

  const dialog = page.getByRole('dialog', { name: '캐릭터 꾸미기' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.race-hud')).toBeHidden()
  expect((await readSnapshot(page))?.race.phase).toBe('ready')

  const draft: CharacterLoadout = {
    characterId: 'storm-griffin',
    paletteId: 'moonlight',
    accessoryId: 'wind-goggles',
  }
  await selectLoadout(page, draft)
  expect(
    await page.evaluate(() => localStorage.getItem('skyknit-cup:settings')),
  ).toBeNull()

  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    }
  })
  expect(layout.left).toBeGreaterThanOrEqual(0)
  expect(layout.top).toBeGreaterThanOrEqual(0)
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight)
  expect(layout.documentWidth).toBe(layout.viewportWidth)
  expect(layout.documentHeight).toBe(layout.viewportHeight)

  if (layout.viewportWidth < layout.viewportHeight) {
    await expectPortraitPreviewClearance(
      page,
      layout.top,
      layout.viewportHeight,
    )
  }

  if (testInfo.project.name === 'touch-minimum') {
    const compactLoadouts: readonly CharacterLoadout[] = [
      DEFAULT_LOADOUT,
      {
        characterId: 'cloud-manta',
        paletteId: 'storm',
        accessoryId: 'festival-ribbon',
      },
      draft,
    ]
    for (const loadout of compactLoadouts) {
      await selectLoadout(page, loadout)
      await expectPortraitPreviewClearance(
        page,
        layout.top,
        layout.viewportHeight,
      )
    }
  }

  for (const control of await dialog.locator('select, button').all()) {
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  await page.screenshot({
    path: `artifacts/browser-qa/m37-character-workshop/${testInfo.project.name}-griffin-preview.png`,
  })
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(DEFAULT_LOADOUT)
})

test('ignores a stale initial model failure after a newer preview succeeds', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  let releaseInitialLoad: () => void = () => undefined
  let markInitialLoadFinished: () => void = () => undefined
  const initialLoadGate = new Promise<void>((resolve) => {
    releaseInitialLoad = resolve
  })
  const initialLoadFinished = new Promise<void>((resolve) => {
    markInitialLoadFinished = resolve
  })
  await page.route('**/skyknit-dragon.glb', async (route) => {
    await initialLoadGate
    await route.fulfill({ status: 503, body: 'delayed initial failure' })
    markInitialLoadFinished()
  })

  await page.goto('/')
  await page.getByRole('button', { name: '캐릭터 꾸미기' }).click()
  await selectLoadout(page, {
    characterId: 'storm-griffin',
    paletteId: 'moonlight',
    accessoryId: 'wind-goggles',
  })
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.source)
    .toBe('glb')

  releaseInitialLoad()
  await initialLoadFinished
  await expect(page.locator('.resource-notice')).toBeHidden()
})

test('persists an applied creature through reload, pause, and context recovery', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('m37-seeded') === 'true') return
    sessionStorage.setItem('m37-seeded', 'true')
    localStorage.setItem(
      'skyknit-cup:settings',
      JSON.stringify({
        version: 8,
        bestTimeMs: 48_210,
        coinBestTimesMs: { 'festival-hub': 17_200 },
        missionGrades: { 'first-skyknot': 'gold' },
      }),
    )
  })
  await page.goto('/')

  await page.getByRole('button', { name: '캐릭터 꾸미기' }).click()
  const applied: CharacterLoadout = {
    characterId: 'cloud-manta',
    paletteId: 'storm',
    accessoryId: 'festival-ribbon',
  }
  await selectLoadout(page, applied)
  await page.screenshot({
    path: `artifacts/browser-qa/m37-character-workshop/${testInfo.project.name}-manta-preview.png`,
  })
  await page.getByRole('button', { name: '적용' }).click()

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? '{}'),
  )
  expect(stored).toMatchObject({
    version: 9,
    bestTimeMs: 48_210,
    coinBestTimesMs: { 'festival-hub': 17_200 },
    missionGrades: { 'first-skyknot': 'gold' },
    characterLoadout: applied,
  })
  expect((await readSnapshot(page))?.race.characterLoadout).toEqual(applied)

  await page.reload()
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(applied)

  await page.getByRole('button', { name: '비행 시작' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 6_000,
    })
    .toBe('racing')
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')
  const pausedBeforeWorkshop = await readSnapshot(page)
  expect(pausedBeforeWorkshop).not.toBeNull()
  await expect(
    page.getByRole('button', { name: '캐릭터 꾸미기' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '캐릭터 꾸미기' }).click()
  await selectLoadout(page, {
    characterId: 'storm-griffin',
    paletteId: 'sunrise',
    accessoryId: 'none',
  })
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(applied)
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')
  const pausedAfterCancel = await readSnapshot(page)
  expect(pausedAfterCancel?.race.elapsedMs).toBe(
    pausedBeforeWorkshop?.race.elapsedMs,
  )
  expect(pausedAfterCancel?.race.nextCheckpointIndex).toBe(
    pausedBeforeWorkshop?.race.nextCheckpointIndex,
  )
  expect(pausedAfterCancel?.race.mission).toEqual(
    pausedBeforeWorkshop?.race.mission,
  )

  await page.evaluate(() => window.__DRAGON_RACE_TEST__?.loseContext())
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
    .toEqual(applied)
  expect((await readSnapshot(page))?.race.characterLoadout).toEqual(applied)
})
