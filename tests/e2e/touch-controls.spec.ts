import { expect, test } from '@playwright/test'

test.describe('touch controls', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('touch'))
    await page.goto('/')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
  })

  test('keeps every visible control at least 44px and inside the viewport', async ({
    page,
  }, testInfo) => {
    const controls = page.locator('[data-touch-control]')
    await expect(controls).toHaveCount(4)

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    const boxes = await controls.evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        .map((element) => {
          const box = element.getBoundingClientRect()
          return {
            width: box.width,
            height: box.height,
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            name: element.getAttribute('aria-label'),
          }
        }),
    )

    expect(boxes.length).toBeGreaterThanOrEqual(2)
    for (const box of boxes) {
      expect(box.name).not.toBe('')
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(viewport?.width ?? 0)
      expect(box.bottom).toBeLessThanOrEqual(viewport?.height ?? 0)
    }

    await page.screenshot({
      path: `artifacts/browser-qa/m4/${testInfo.project.name}-ready.png`,
    })
  })

  test('starts countdown from a joystick touch', async ({ page }) => {
    const joystick = page.locator('[data-touch-role="joystick"]')
    await expect(joystick).toBeVisible()

    await joystick.tap({ position: { x: 56, y: 30 } })

    await expect
      .poll(async () => {
        const raw = await page.locator('#app').getAttribute('data-flight-debug')
        return raw === null ? null : JSON.parse(raw).race.phase
      })
      .toBe('countdown')
  })
})

test('hides touch controls for a fine pointer desktop', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/')

  await expect(page.locator('[data-touch-controls]')).toBeHidden()
})
