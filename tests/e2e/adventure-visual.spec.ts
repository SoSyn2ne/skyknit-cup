import { expect, test } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../../src/game/persistence/records'
import {
  EMPTY_ADVENTURE_PROGRESS, canUseAdventureSense, getAdventureObjective,
  interactAdventure, setAdventureCharm, setAdventureDecoration, startAdventure,
  useAdventureSense, type AdventureStage,
  rotateAdventureDevice,
} from '../../src/game/adventure/adventureState'
import { ADVENTURE_HOME, ADVENTURE_GARDEN_PAD } from '../../src/game/adventure/adventureWorld'
import { getWindPuzzle } from '../../src/game/adventure/windPuzzle'

// These are explicit visual fixtures, not real-input quest-completion evidence.
function visualFixture(stage: AdventureStage) {
  let progress = startAdventure(EMPTY_ADVENTURE_PROGRESS)
  for (let i = 0; i < 32 && progress.stage !== stage; i++) {
    const context = { position: getAdventureObjective(progress).position, gameMode: 'explore' as const, coinRunActive: false, paused: false, mapOpen: false }
    if (progress.stage === 'route-flight') {
      const puzzle = getWindPuzzle(getAdventureObjective(progress).id)!
      for (let index = 0; index < puzzle.pieces.length; index++) {
        for (let n = 0; n < (4 - puzzle.initialRotations[index]) % 4; n++) progress = rotateAdventureDevice(progress, context, index)
      }
    }
    progress = canUseAdventureSense(progress, context) ? useAdventureSense(progress, context) : interactAdventure(progress, context, 'sheltered')
  }
  if (progress.stage !== stage) throw new Error('Invalid visual fixture')
  if (stage === 'complete') {
    progress = setAdventureCharm(progress, true)
    progress = setAdventureDecoration(setAdventureDecoration(progress, 'lanterns', true), 'pennants', true)
  }
  return { version: 12, ...DEFAULT_SETTINGS, adventure: progress, exploration: { ...DEFAULT_SETTINGS.exploration, position: { ...ADVENTURE_HOME.position, y: ADVENTURE_HOME.position.y + 1.2 }, headingRadians: ADVENTURE_HOME.headingRadians, movement: 'landed' } }
}

for (const stage of ['restore-nest', 'complete'] as const) {
  test(`M46 visual fixture ${stage} at the same home overview camera`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.addInitScript(value => localStorage.setItem('skyknit-cup:settings', JSON.stringify(value)), visualFixture(stage))
    await page.goto('/')
    const world = () => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot()?.exploration.adventure.world)
    await expect.poll(world).toMatchObject({ assetStatus: 'loaded', lanternsVisible: stage === 'complete', pennantsVisible: stage === 'complete', secretPathVisible: stage === 'complete', charmVisible: stage === 'complete' })
    await page.screenshot({ path: `artifacts/browser-qa/m46-adventure/${info.project.name}-visual-fixture-${stage}.png` })
    await page.locator('[data-adventure-start]').click()
    const first = (await world())!.windmillRotationRadians
    await page.waitForTimeout(1100)
    const second = (await world())!.windmillRotationRadians
    if (stage === 'complete') expect(second).not.toBe(first)
    else expect(second).toBe(first)
    expect(errors).toEqual([])
  })
}

test('M46 preview and reload preserve an unstarted legacy exploration location', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One canonical migration integration case')
  const exploration = { ...DEFAULT_SETTINGS.exploration, position: { x: 430, y: 38, z: 190 }, headingRadians: 1.1, movement: 'airborne' as const }
  await page.addInitScript(({ settings, location }) => {
    if (!localStorage.getItem('skyknit-cup:settings')) localStorage.setItem('skyknit-cup:settings', JSON.stringify({ ...settings, version: 11, exploration: location }))
  }, { settings: DEFAULT_SETTINGS, location: exploration })
  await page.goto('/')
  await expect(page.locator('[data-adventure-start]')).toBeVisible()
  await page.waitForTimeout(2300)
  await page.reload()
  await expect(page.locator('[data-adventure-start]')).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skyknit-cup:settings') ?? '{}'))
  expect(saved.version).toBe(12)
  expect(saved.exploration).toEqual(exploration)
  expect(saved.adventure.started).toBe(false)
})

for (const stage of ['restore-nest', 'complete'] as const) {
  test(`M46 garden landing fixture is gated by restoration: ${stage}`, async ({ page }, info) => {
    test.skip(!['desktop', 'touch-landscape'].includes(info.project.name), 'Landing contract on keyboard and touch')
    const settings = visualFixture(stage)
    settings.exploration.position = { ...ADVENTURE_GARDEN_PAD.position, y: ADVENTURE_GARDEN_PAD.position.y + 1.2 }
    await page.addInitScript(value => localStorage.setItem('skyknit-cup:settings', JSON.stringify(value)), settings)
    await page.goto('/')
    const state = () => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot())
    await expect.poll(async () => (await state())?.exploration.adventure.world.assetStatus).toBe('loaded')
    expect((await state())?.exploration.landingPadId).toBe(stage === 'complete' ? ADVENTURE_GARDEN_PAD.id : null)
    expect((await state())?.exploration.adventure.world.secretPathVisible).toBe(stage === 'complete')
    if (stage === 'complete') {
      await page.locator('[data-adventure-start]').click()
      if (info.project.name.startsWith('touch')) await page.locator('[data-adventure-interact]').tap()
      else { await page.locator('canvas').focus(); await page.keyboard.press('KeyE') }
      await expect.poll(async () => (await state())?.exploration.adventure.objective.id).toBe('complete')
      await expect(page.locator('.exploration-hud__journey')).toBeHidden()
      const tracker = await page.locator('[data-adventure-tracker]').boundingBox()
      const coins = await page.locator('[data-coin-run]').boundingBox()
      expect(tracker!.y).toBeGreaterThanOrEqual(coins!.y + coins!.height + 8)
      await page.screenshot({ path: `artifacts/browser-qa/m46-adventure/${info.project.name}-garden-landing.png` })
    }
  })
}
