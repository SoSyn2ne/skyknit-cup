import { expect, test } from '@playwright/test'

test('loads the ready race with a live WebGL canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')

  await expect(page).toHaveTitle('하늘매듭배')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await expect(page.locator('canvas.game-canvas')).toHaveAttribute(
    'data-renderer-ready',
    'true',
  )
  await expect(page.getByRole('heading', { name: '하늘매듭배' })).toBeVisible()
  await expect
    .poll(async () => {
      const raw = await page.locator('#app').getAttribute('data-flight-debug')
      if (raw === null) {
        return null
      }

      return JSON.parse(raw).camera.dragon.source as string
    })
    .toBe('glb')
  expect(errors).toEqual([])
})
