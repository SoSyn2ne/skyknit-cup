import { expect, test, type Page } from '@playwright/test'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'rc7'

interface AudioSnapshot {
  readonly contextCreated: boolean
  readonly unlocked: boolean
  readonly muted: boolean
  readonly musicVolume: number
  readonly musicActive: boolean
  readonly pageVisible: boolean
  readonly bgmCreated: boolean
  readonly bgmPlaying: boolean
  readonly bgmPositionSeconds: number
  readonly bgmPlayAttempts: number
  readonly bgmPlayFailures: number
  readonly gateCues: number
  readonly wingFlapCues: number
  readonly boostCues: number
  readonly finishCues: number
  readonly discoveryCues: number
  readonly windEntryCues: number
  readonly ambientWindStrength: number
  readonly windBedPlaying: boolean
  readonly volcanicAmbienceIntensity: number
  readonly volcanicBedPlaying: boolean
  readonly rockWarningCues: number
  readonly lavaWarningCues: number
  readonly coolingSealCues: number
  readonly eruptionEscapeCues: number
}

async function readAudio(page: Page): Promise<AudioSnapshot | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => { audio?: AudioSnapshot } | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot()?.audio ?? null
  })
}

async function readPhase(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => { race?: { phase: string } } | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot()?.race?.phase ?? null
  })
}

test('gates generated audio behind gesture, edges, and mute', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/?mode=race&qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect.poll(() => readAudio(page)).toEqual({
    contextCreated: false,
    unlocked: false,
    muted: false,
    musicVolume: 0.35,
    musicActive: false,
    pageVisible: true,
    bgmCreated: false,
    bgmPlaying: false,
    bgmPositionSeconds: 0,
    bgmPlayAttempts: 0,
    bgmPlayFailures: 0,
    gateCues: 0,
    wingFlapCues: 0,
    boostCues: 0,
    finishCues: 0,
    discoveryCues: 0,
    windEntryCues: 0,
    ambientWindStrength: 0,
    windBedPlaying: false,
    volcanicAmbienceIntensity: 0,
    volcanicBedPlaying: false,
    rockWarningCues: 0,
    lavaWarningCues: 0,
    coolingSealCues: 0,
    eruptionEscapeCues: 0,
  })

  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readAudio(page))?.unlocked)
    .toBe(true)
  await expect.poll(() => readPhase(page), { timeout: 6_000 }).toBe('racing')
  await expect.poll(async () => readAudio(page)).toMatchObject({
    musicActive: true,
    bgmPlaying: true,
  })
  await expect
    .poll(async () => (await readAudio(page))?.wingFlapCues)
    .toBeGreaterThan(0)

  await page.keyboard.press('Escape')
  await expect.poll(() => readPhase(page)).toBe('paused')
  const pausedWingFlapCues = (await readAudio(page))?.wingFlapCues ?? 0
  await page.waitForTimeout(600)
  expect((await readAudio(page))?.wingFlapCues).toBe(pausedWingFlapCues)
  await page.getByRole('button', { name: '계속 날기' }).click()
  await expect.poll(() => readPhase(page)).toBe('racing')
  await expect
    .poll(async () => (await readAudio(page))?.wingFlapCues)
    .toBeGreaterThan(pausedWingFlapCues)

  await page.keyboard.down('Space')
  await expect
    .poll(async () => (await readAudio(page))?.boostCues)
    .toBe(1)
  await page.waitForTimeout(150)
  expect((await readAudio(page))?.boostCues).toBe(1)
  await page.keyboard.up('Space')
  await page.waitForTimeout(50)
  await page.keyboard.down('Space')
  await expect
    .poll(async () => (await readAudio(page))?.boostCues)
    .toBe(2)
  await page.keyboard.up('Space')

  for (let checkpoint = 0; checkpoint < 6; checkpoint += 1) {
    await page.evaluate(() => {
      const testWindow = window as unknown as {
        __DRAGON_RACE_TEST__?: { qaPassCheckpoint: () => void }
      }
      testWindow.__DRAGON_RACE_TEST__?.qaPassCheckpoint()
    })
  }
  await expect.poll(() => readPhase(page)).toBe('finished')
  await expect
    .poll(async () => {
      const audio = await readAudio(page)
      return audio === null
        ? null
        : { gateCues: audio.gateCues, finishCues: audio.finishCues }
    })
    .toEqual({ gateCues: 6, finishCues: 1 })

  await page.getByRole('button', { name: '소리 끄기' }).click()
  await expect
    .poll(async () => (await readAudio(page))?.muted)
    .toBe(true)
  const mutedWingFlapCues = (await readAudio(page))?.wingFlapCues ?? 0
  await page.getByRole('button', { name: '다시 달리기' }).click()
  await expect.poll(() => readPhase(page), { timeout: 6_000 }).toBe('racing')
  await page.waitForTimeout(600)
  expect((await readAudio(page))?.wingFlapCues).toBe(mutedWingFlapCues)
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  expect((await readAudio(page))?.boostCues).toBe(2)
})

test('exposes BGM settings on the ready screen without starting playback', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop' &&
      testInfo.project.name !== 'touch-landscape' &&
      testInfo.project.name !== 'touch-minimum',
  )
  await page.goto('/?mode=race')
  const volume = page.locator('[data-race-music-volume="true"]')
  await expect(volume).toBeVisible()
  await expect(volume).toHaveValue('35')

  const box = await volume.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  const expectedViewport = {
    desktop: { width: 1_440, height: 900 },
    'touch-landscape': { width: 844, height: 390 },
    'touch-minimum': { width: 320, height: 568 },
  }[testInfo.project.name]
  expect(expectedViewport).toBeDefined()
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: document.documentElement.clientHeight,
    })),
  ).toEqual({
    width: expectedViewport?.width,
    viewportWidth: expectedViewport?.width,
    height: expectedViewport?.height,
    viewportHeight: expectedViewport?.height,
  })
  if (testInfo.project.name === 'touch-landscape') {
    expect(
      await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.race-hud__panel')
        const mute = document.querySelector<HTMLElement>('.race-hud__mute')
        const volume = document.querySelector<HTMLElement>(
          '[data-race-music-volume="true"]',
        )
        if (panel === null || mute === null || volume === null) return null
        const panelRect = panel.getBoundingClientRect()
        const muteRect = mute.getBoundingClientRect()
        const volumeRect = volume.getBoundingClientRect()
        const isInside = (rect: DOMRect): boolean =>
          rect.left >= panelRect.left &&
          rect.right <= panelRect.right &&
          rect.top >= panelRect.top &&
          rect.bottom <= panelRect.bottom &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        return {
          panelFitsWithoutScroll: panel.scrollHeight <= panel.clientHeight + 1,
          muteInside: isInside(muteRect),
          volumeInside: isInside(volumeRect),
          muteSize: [muteRect.width, muteRect.height],
          volumeHeight: volumeRect.height,
        }
      }),
    ).toEqual({
      panelFitsWithoutScroll: true,
      muteInside: true,
      volumeInside: true,
      muteSize: [44, 44],
      volumeHeight: 44,
    })
  }
  if (testInfo.project.name === 'touch-minimum') {
    await expect(page.locator('[data-touch-role="joystick"]')).toBeHidden()
    await expect(page.locator('[data-touch-role="boost"]')).toBeHidden()
    expect(
      await page.evaluate(() => {
        const panel = document.querySelector('.race-hud__panel')
        const controls = [
          document.querySelector('[data-touch-role="joystick"]'),
          document.querySelector('[data-touch-role="boost"]'),
        ]
        if (panel === null || controls.some((control) => control === null)) {
          return null
        }
        const panelRect = panel.getBoundingClientRect()
        return controls.map((control) => {
          const controlRect = control!.getBoundingClientRect()
          return !(
            panelRect.right <= controlRect.left ||
            controlRect.right <= panelRect.left ||
            panelRect.bottom <= controlRect.top ||
            controlRect.bottom <= panelRect.top
          )
        })
      }),
    ).toEqual([false, false])
  }
  await volume.fill('50')
  await expect.poll(async () => readAudio(page)).toMatchObject({
    musicVolume: 0.5,
    bgmCreated: false,
    bgmPlayAttempts: 0,
  })
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${testInfo.project.name}-ready-audio.png`,
  })
})

test('streams, controls, persists, and keeps game BGM across modes', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop' &&
      testInfo.project.name !== 'touch-minimum',
  )
  const failedAudioResponses: string[] = []
  page.on('response', (response) => {
    if (
      response.url().includes('/assets/audio/') &&
      response.status() >= 400
    ) {
      failedAudioResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/?mode=race')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await expect
    .poll(async () => (await readAudio(page))?.bgmPlaying)
    .toBe(true)
  await expect.poll(async () => readAudio(page)).toMatchObject({
    musicActive: true,
    musicVolume: 0.35,
    bgmCreated: true,
    bgmPlayFailures: 0,
  })
  if (testInfo.project.name === 'touch-minimum') {
    expect(
      await page.evaluate(() => {
        const region = document.querySelector('.exploration-hud__region')
        const coinRun = document.querySelector('.exploration-hud__coin-run')
        const controls = document.querySelector('.exploration-hud__controls')
        if (region === null || coinRun === null || controls === null) return null
        const regionRect = region.getBoundingClientRect()
        const coinRunRect = coinRun.getBoundingClientRect()
        const controlsRect = controls.getBoundingClientRect()
        const overlaps = (left: DOMRect, right: DOMRect): boolean =>
          !(
            left.right <= right.left ||
            right.right <= left.left ||
            left.bottom <= right.top ||
            right.bottom <= left.top
          )
        return {
          regionOverlap: overlaps(regionRect, controlsRect),
          coinRunOverlap: overlaps(coinRunRect, controlsRect),
          withinViewport: controlsRect.right <= window.innerWidth,
        }
      }),
    ).toEqual({
      regionOverlap: false,
      coinRunOverlap: false,
      withinViewport: true,
    })
    await page.screenshot({
      path: `artifacts/browser-qa/${QA_SCOPE}/audio-touch-minimum.png`,
    })
  }

  const volume = page.locator('[data-explore-music-volume="true"]')
  await expect(volume).toHaveAttribute('aria-label', '배경 음악 음량')
  await expect(volume).toHaveValue('35')
  await volume.fill('60')
  await expect
    .poll(async () => (await readAudio(page))?.musicVolume)
    .toBe(0.6)

  await page.getByRole('button', { name: '소리 끄기' }).click()
  await expect.poll(async () => readAudio(page)).toMatchObject({
    muted: true,
    bgmPlaying: false,
  })
  await page.getByRole('button', { name: '소리 켜기' }).click()
  await expect
    .poll(async () => (await readAudio(page))?.bgmPlaying)
    .toBe(true)

  await page.getByRole('button', { name: '일시정지' }).click()
  await page.getByRole('button', { name: '미션 선택으로' }).click()
  await expect.poll(async () => readAudio(page)).toMatchObject({
    musicActive: true,
    bgmPlaying: true,
  })
  expect(failedAudioResponses).toEqual([])

  await page.reload()
  await page.getByRole('button', { name: '비행 시작' }).click()
  await expect(page.locator('[data-explore-music-volume="true"]')).toHaveValue(
    '60',
  )
  await expect
    .poll(async () => (await readAudio(page))?.musicVolume)
    .toBe(0.6)
  await expect
    .poll(async () => (await readAudio(page))?.bgmPlaying)
    .toBe(true)
})
