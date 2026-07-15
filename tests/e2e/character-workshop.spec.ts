import { expect, test, type Page } from '@playwright/test'

import type { CharacterLoadout } from '../../src/game/customization/characterCatalog'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const DEFAULT_LOADOUT: CharacterLoadout = {
  characterId: 'sunrise-dragon',
  paletteId: 'sunrise',
  accessoryId: 'none',
}

type LegacyGuardianId = 'storm-griffin' | 'cloud-manta'

function createCompleteV9Fixture(characterId: LegacyGuardianId) {
  const raceGhost = {
    durationMs: 123_456,
    samples: [
      [0, 0, 18, 20, 0, 0, 0, 0, 0],
      [123_456, 40, 22, -60, 0.5, 0.1, -0.2, 1, 11],
    ],
  }
  const coinGhost = {
    durationMs: 18_250,
    samples: [
      [0, 430, 31, 190, 1.25, 0, 0, 0, 0],
      [18_250, 455, 36, 140, 1.5, 0.1, 0.2, 1, 10],
    ],
  }

  return {
    version: 9,
    bestTimeMs: 123_456,
    muted: true,
    musicVolume: 0.62,
    quality: 'high',
    characterLoadout: {
      characterId,
      paletteId: 'moonlight',
      accessoryId: 'festival-ribbon',
    },
    missionGrades: {
      'first-skyknot': 'gold',
      'boost-mastery': 'silver',
    },
    coinBestTimesMs: {
      'festival-hub': 18_250,
      'wind-canyon': 24_800,
    },
    skyLeague: {
      raceTop10Ms: [123_456, 130_000],
      coinTop10Ms: {
        'festival-hub': [18_250, 20_000],
        'wind-canyon': [24_800],
      },
      missionTop10: {
        'first-skyknot': [{ elapsedMs: 123_456, grade: 'gold' }],
      },
    },
    ghosts: {
      race: raceGhost,
      coin: { 'festival-hub': coinGhost },
      mission: { 'first-skyknot': raceGhost },
    },
    exploration: {
      position: { x: 430, y: 31, z: 190 },
      headingRadians: 1.25,
      movement: 'airborne',
      discoveredRegionIds: ['festival-hub', 'cloud-ruins'],
      destinationRegionId: 'cloud-ruins',
      discoveredLandmarkIds: [
        'dawnwing-airfield',
        'whispering-grotto',
      ],
      traversedWindZoneIds: ['harbor-lift'],
    },
  }
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

for (const [legacyCharacterId, expectedCharacterId] of [
  ['storm-griffin', 'ember-phoenix'],
  ['cloud-manta', 'storm-white-tiger'],
] as const) {
  test(`migrates complete v9 ${legacyCharacterId} progress to ${expectedCharacterId}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop')
    const legacySettings = createCompleteV9Fixture(legacyCharacterId)
    const expectedLoadout: CharacterLoadout = {
      characterId: expectedCharacterId,
      paletteId: 'moonlight',
      accessoryId: 'festival-ribbon',
    }
    await page.addInitScript((settings) => {
      localStorage.setItem('skyknit-cup:settings', JSON.stringify(settings))
    }, legacySettings)

    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    await expect
      .poll(async () => (await readSnapshot(page))?.camera.dragon.loadout)
      .toEqual(expectedLoadout)

    const snapshot = await readSnapshot(page)
    expect(snapshot?.race.characterLoadout).toEqual(expectedLoadout)
    expect(snapshot?.race.bestTimeMs).toBe(legacySettings.bestTimeMs)
    expect(snapshot?.race.raceTop10Ms).toEqual(
      legacySettings.skyLeague.raceTop10Ms,
    )
    expect(snapshot?.race.missionGrades).toEqual(
      legacySettings.missionGrades,
    )
    expect(snapshot?.audio).toMatchObject({
      muted: legacySettings.muted,
      musicVolume: legacySettings.musicVolume,
    })
    expect(snapshot?.render.qualityPreference).toBe(legacySettings.quality)
    expect(snapshot?.exploration).toMatchObject({
      discoveredRegionIds: legacySettings.exploration.discoveredRegionIds,
      discoveredLandmarkIds:
        legacySettings.exploration.discoveredLandmarkIds,
      traversedWindZoneIds:
        legacySettings.exploration.traversedWindZoneIds,
      destinationRegionId: legacySettings.exploration.destinationRegionId,
      coinBestTimesMs: legacySettings.coinBestTimesMs,
    })

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? '{}'),
    )
    expect(stored).toEqual({
      ...legacySettings,
      version: 10,
      characterLoadout: expectedLoadout,
    })

    await page.getByRole('button', { name: '캐릭터 꾸미기' }).click()
    await expect(page.getByLabel('캐릭터 형태')).toHaveValue(
      expectedCharacterId,
    )
    await expect(page.getByLabel('색상')).toHaveValue('moonlight')
    await expect(page.getByLabel('장식')).toHaveValue('festival-ribbon')
  })
}

test('previews a guardian safely inside every supported viewport', async ({
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
    characterId: 'ember-phoenix',
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
        characterId: 'storm-white-tiger',
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
    path: `artifacts/browser-qa/m38-guardian-creatures/${testInfo.project.name}-phoenix-preview.png`,
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
    characterId: 'ember-phoenix',
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

test('persists an applied guardian through reload, pause, and context recovery', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('m38-seeded') === 'true') return
    sessionStorage.setItem('m38-seeded', 'true')
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
    characterId: 'storm-white-tiger',
    paletteId: 'storm',
    accessoryId: 'festival-ribbon',
  }
  await selectLoadout(page, applied)
  await page.screenshot({
    path: `artifacts/browser-qa/m38-guardian-creatures/${testInfo.project.name}-white-tiger-preview.png`,
  })
  await page.getByRole('button', { name: '적용' }).click()

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? '{}'),
  )
  expect(stored).toMatchObject({
    version: 10,
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
    characterId: 'ember-phoenix',
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
