import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

async function readPhase(page: Page): Promise<FlightDebugSnapshot['race']['phase'] | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => FlightDebugSnapshot | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot()?.race.phase ?? null
  })
}

async function finishQaCourse(page: Page): Promise<void> {
  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
    await page.evaluate(() => {
      const testWindow = window as unknown as {
        __DRAGON_RACE_TEST__?: {
          qaPassCheckpoint: () => void
        }
      }
      testWindow.__DRAGON_RACE_TEST__?.qaPassCheckpoint()
    })
  }
}

test.describe('accessible race focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?qaCourse=1')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
  })

  test('moves focus into modal race states and back to flight', async ({
    page,
  }) => {
    const canvas = page.locator('canvas.game-canvas')
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => readPhase(page), { timeout: 4_000 }).toBe('racing')

    await page.keyboard.press('Escape')
    await expect.poll(() => readPhase(page)).toBe('paused')
    const pauseDialog = page.getByRole('dialog', {
      name: '바람길 일시정지',
    })
    await expect(pauseDialog).toBeVisible()
    await expect(page.getByRole('button', { name: '계속 날기' })).toBeFocused()

    await page.keyboard.press('Enter')
    await expect.poll(() => readPhase(page)).toBe('racing')
    await expect(canvas).toBeFocused()

    await finishQaCourse(page)
    await expect.poll(() => readPhase(page)).toBe('finished')
    const finishDialog = page.getByRole('dialog', { name: '하늘매듭 완주' })
    await expect(finishDialog).toBeVisible()
    await expect(page.getByRole('button', { name: '다시 달리기' })).toBeFocused()

    await page.keyboard.press('Enter')
    await expect.poll(() => readPhase(page)).toBe('countdown')
    await expect(canvas).toBeFocused()
  })

  test('exposes names and tooltips for touch controls', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('touch'))

    await page.getByRole('button', { name: '비행 시작' }).tap()
    await expect.poll(() => readPhase(page), { timeout: 4_000 }).toBe('racing')

    await expect(
      page.getByRole('group', { name: '비행 방향 조이스틱' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '돌풍 부스트' })).toHaveAttribute(
      'title',
      '돌풍 부스트',
    )
    const pause = page.locator('[data-touch-role="pause"]')
    await expect(pause).toHaveAttribute('aria-label', '일시정지')
    await expect(pause).toHaveAttribute(
      'title',
      '일시정지',
    )
  })
})
