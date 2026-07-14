import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'rc7'

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => FlightDebugSnapshot | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot() ?? null
  })
}

test('applies the automatic render budget for the device class', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const touch = testInfo.project.name.startsWith('touch')
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      return snapshot === null
        ? null
        : {
            preference: snapshot.render.qualityPreference,
            tier: snapshot.render.qualityTier,
            pixelRatio: snapshot.render.pixelRatio,
            cloudCount: snapshot.camera.world.cloudCount,
            cloudWispCount: snapshot.camera.world.cloudWispCount,
            cloudDeckCount: snapshot.camera.world.cloudDeckCount,
            boostRingCount: snapshot.camera.boostRingCount,
            speedStreakCount: snapshot.camera.speedStreakCount,
            worldShadows: snapshot.camera.world.shadowsEnabled,
            dragonShadows: snapshot.camera.dragon.shadowsEnabled,
            rendererShadows: snapshot.render.shadows,
            shadowMapSize: snapshot.render.shadowMapSize,
          }
    })
    .toEqual({
      preference: 'auto',
      tier: touch ? 'low' : 'high',
      pixelRatio: touch ? 1 : 1,
      cloudCount: touch ? 24 : 32,
      cloudWispCount: touch ? 12 : 16,
      cloudDeckCount: touch ? 0 : 8,
      boostRingCount: touch ? 1 : 3,
      speedStreakCount: touch ? 0 : 18,
      worldShadows: !touch,
      dragonShadows: !touch,
      rendererShadows: !touch,
      shadowMapSize: touch ? 0 : 1_024,
    })

  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'touch-minimum') {
    await page.screenshot({
      path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-auto-${touch ? 'low' : 'high'}.png`,
    })
  }
})

test('changes and saves quality without resetting race progress', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/?qaCourse=1')
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 8_000,
    })
    .toBe('racing')
  await page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: { qaPassCheckpoint: () => void }
    }
    testWindow.__DRAGON_RACE_TEST__?.qaPassCheckpoint()
  })
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')
  const before = await readSnapshot(page)

  await page.getByLabel('화질').selectOption('low')
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      return snapshot === null
        ? null
        : {
            phase: snapshot.race.phase,
            elapsedMs: snapshot.race.elapsedMs,
            checkpoint: snapshot.race.nextCheckpointIndex,
            preference: snapshot.render.qualityPreference,
            tier: snapshot.render.qualityTier,
            cloudCount: snapshot.camera.world.cloudCount,
            cloudWispCount: snapshot.camera.world.cloudWispCount,
            cloudDeckCount: snapshot.camera.world.cloudDeckCount,
            boostRingCount: snapshot.camera.boostRingCount,
            speedStreakCount: snapshot.camera.speedStreakCount,
            worldShadows: snapshot.camera.world.shadowsEnabled,
            dragonShadows: snapshot.camera.dragon.shadowsEnabled,
            rendererShadows: snapshot.render.shadows,
          }
    })
    .toEqual({
      phase: 'paused',
      elapsedMs: before?.race.elapsedMs,
      checkpoint: before?.race.nextCheckpointIndex,
      preference: 'low',
      tier: 'low',
      cloudCount: 24,
      cloudWispCount: 12,
      cloudDeckCount: 0,
      boostRingCount: 1,
      speedStreakCount: 0,
      worldShadows: false,
      dragonShadows: false,
      rendererShadows: false,
    })

  const storedAfterQuality = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? 'null'),
  )
  expect(storedAfterQuality).toMatchObject({ version: 8, quality: 'low' })

  const mute = page.getByRole('button', { name: '소리 끄기' })
  await expect(mute).toHaveAttribute('title', '소리 끄기')
  await mute.click()
  await expect(page.getByRole('button', { name: '소리 켜기' })).toBeVisible()
  await expect
    .poll(async () => {
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? 'null'),
      )
      return stored?.muted
    })
    .toBe(true)

  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/desktop-paused-settings.png`,
  })

  await page.reload()
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      return snapshot === null
        ? null
        : {
            muted: snapshot.audio.muted,
            contextCreated: snapshot.audio.contextCreated,
            preference: snapshot.render.qualityPreference,
            tier: snapshot.render.qualityTier,
          }
    })
    .toEqual({
      muted: true,
      contextCreated: false,
      preference: 'low',
      tier: 'low',
    })
})

test('fits settings and pause actions at the minimum viewport', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'touch-minimum')
  await page.goto('/')
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 6_000,
    })
    .toBe('racing')
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('paused')

  const panel = page.getByRole('dialog', { name: '바람길 일시정지' })
  await expect(panel).toBeVisible()
  const panelBox = await panel.boundingBox()
  expect(panelBox).not.toBeNull()
  if (panelBox !== null) {
    expect(panelBox.x).toBeGreaterThanOrEqual(0)
    expect(panelBox.y).toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(320)
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(568)
  }
  await expect(page.getByLabel('화질')).toBeVisible()
  await expect(page.getByRole('button', { name: '소리 끄기' })).toBeVisible()
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/touch-minimum-paused-settings.png`,
  })
})
