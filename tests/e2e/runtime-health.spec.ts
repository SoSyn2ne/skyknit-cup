import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

test('has no console, rejection, or network failures during flight', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  const failedRequests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? ''
    if (
      failure === 'net::ERR_ABORTED' &&
      request.url().includes('/assets/audio/sovereign-of-the-sunrise-skies-loop.')
    ) {
      return
    }
    failedRequests.push(
      `${request.method()} ${request.url()} ${failure}`,
    )
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`)
    }
  })
  await page.addInitScript(() => {
    const rejectionMessages: string[] = []
    Object.defineProperty(window, '__M6_REJECTIONS__', {
      configurable: true,
      value: rejectionMessages,
    })
    window.addEventListener('unhandledrejection', (event) => {
      rejectionMessages.push(String(event.reason))
    })
  })

  await page.goto('/?mode=race')
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
  await page.waitForTimeout(1_250)

  const rejections = await page.evaluate(
    () =>
      (window as unknown as { __M6_REJECTIONS__?: string[] })
        .__M6_REJECTIONS__ ?? [],
  )
  expect(errors).toEqual([])
  expect(rejections).toEqual([])
  expect(failedRequests).toEqual([])
})
