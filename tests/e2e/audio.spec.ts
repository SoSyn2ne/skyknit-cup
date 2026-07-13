import { expect, test, type Page } from '@playwright/test'

interface AudioSnapshot {
  readonly contextCreated: boolean
  readonly unlocked: boolean
  readonly muted: boolean
  readonly gateCues: number
  readonly boostCues: number
  readonly finishCues: number
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
  await page.goto('/?qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect.poll(() => readAudio(page)).toEqual({
    contextCreated: false,
    unlocked: false,
    muted: false,
    gateCues: 0,
    boostCues: 0,
    finishCues: 0,
  })

  await page.keyboard.press('ArrowUp')
  await expect
    .poll(async () => (await readAudio(page))?.unlocked)
    .toBe(true)
  await expect.poll(() => readPhase(page), { timeout: 4_000 }).toBe('racing')

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

  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
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
    .toEqual({ gateCues: 12, finishCues: 1 })

  await page.getByRole('button', { name: '소리 끄기' }).click()
  await expect
    .poll(async () => (await readAudio(page))?.muted)
    .toBe(true)
  await page.getByRole('button', { name: '다시 달리기' }).click()
  await expect.poll(() => readPhase(page), { timeout: 4_000 }).toBe('racing')
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  expect((await readAudio(page))?.boostCues).toBe(2)
})
