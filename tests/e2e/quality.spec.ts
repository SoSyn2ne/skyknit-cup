import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

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
            boostRingCount: snapshot.camera.boostRingCount,
          }
    })
    .toEqual({
      preference: 'auto',
      tier: touch ? 'low' : 'high',
      pixelRatio: touch ? 1 : 1,
      cloudCount: touch ? 24 : 32,
      boostRingCount: touch ? 1 : 3,
    })

  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'touch-minimum') {
    await page.screenshot({
      path: `artifacts/browser-qa/m5/${testInfo.project.name}-auto-${touch ? 'low' : 'high'}.png`,
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
            boostRingCount: snapshot.camera.boostRingCount,
          }
    })
    .toEqual({
      phase: 'paused',
      elapsedMs: before?.race.elapsedMs,
      checkpoint: before?.race.nextCheckpointIndex,
      preference: 'low',
      tier: 'low',
      cloudCount: 24,
      boostRingCount: 1,
    })

  const storedAfterQuality = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? 'null'),
  )
  expect(storedAfterQuality).toMatchObject({ version: 5, quality: 'low' })

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
    path: 'artifacts/browser-qa/m5/desktop-paused-settings.png',
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
      timeout: 4_000,
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
    path: 'artifacts/browser-qa/m5/touch-minimum-paused-settings.png',
  })
})
