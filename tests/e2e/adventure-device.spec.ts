import { expect, test } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../../src/game/persistence/records'
import { EMPTY_ADVENTURE_PROGRESS, getAdventureObjective, interactAdventure, rotateAdventureDevice, startAdventure } from '../../src/game/adventure/adventureState'
import { getWindPuzzle } from '../../src/game/adventure/windPuzzle'

function finalDeviceFixture() {
  let progress = startAdventure(EMPTY_ADVENTURE_PROGRESS)
  for (let step = 0; step < 3; step++) progress = interactAdventure(progress, { position: getAdventureObjective(progress).position, gameMode: 'explore', coinRunActive: false, paused: false, mapOpen: false })
  progress = interactAdventure(progress, { position: getAdventureObjective(progress).position, gameMode: 'explore', coinRunActive: false, paused: false, mapOpen: false }, 'ridge')
  for (let station = 0; station < 3; station++) {
    const context = { position: getAdventureObjective(progress).position, gameMode: 'explore' as const, coinRunActive: false, paused: false, mapOpen: false }
    const puzzle = getWindPuzzle(getAdventureObjective(progress).id)!
    for (let tile = 0; tile < puzzle.pieces.length; tile++) {
      for (let n = 0; n < (4 - puzzle.initialRotations[tile]) % 4; n++) progress = rotateAdventureDevice(progress, context, tile)
    }
    progress = interactAdventure(progress, context)
  }
  return { ...DEFAULT_SETTINGS, version: 12, adventure: progress, exploration: { ...DEFAULT_SETTINGS.exploration, position: getAdventureObjective(progress).position } }
}

test('M46 device fixture supports rotation, frozen flight, live play time and saved draft', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(settings => {
    if (!localStorage.getItem('skyknit-cup:settings')) localStorage.setItem('skyknit-cup:settings', JSON.stringify(settings))
  }, finalDeviceFixture())
  const state = () => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot())
  await page.goto('/')
  await expect.poll(async () => (await state())?.exploration.adventure.world.assetStatus).toBe('loaded')
  await page.locator('[data-adventure-start]').click()
  await page.locator('[data-adventure-interact]').click()
  const dialog = page.getByRole('dialog', { name: '바람길 장치' })
  await expect(dialog).toBeVisible()
  const before = await state()
  const tile = page.locator('[data-adventure-device-tile="0"]')
  const bounds = await tile.boundingBox()
  expect(bounds!.width).toBeGreaterThanOrEqual(44)
  expect(bounds!.height).toBeGreaterThanOrEqual(44)
  await tile.click()
  const draft = (await state())!.exploration.adventure.progress.device
  expect(draft).not.toBeNull()
  await page.waitForTimeout(1300)
  const after = await state()
  expect(after!.flight.position).toEqual(before!.flight.position)
  expect(after!.exploration.adventure.progress.elapsedPlaySeconds).toBeGreaterThan(before!.exploration.adventure.progress.elapsedPlaySeconds)
  await page.screenshot({ path: `artifacts/browser-qa/m46-adventure/${info.project.name}-device-fixture.png` })
  await page.reload()
  await page.locator('[data-adventure-start]').click()
  expect((await state())!.exploration.adventure.progress.device).toEqual(draft)
  await page.locator('[data-adventure-interact]').click()
  await expect(dialog).toBeVisible()
  await page.locator('[data-adventure-device-close]').click()
  await expect(dialog).toBeHidden()
  expect((await state())!.exploration.paused).toBe(false)
  expect(errors).toEqual([])
})
