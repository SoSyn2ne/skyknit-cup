import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  getAdventureDevice,
  getAdventureObjective,
  isCanonicalAdventureProgress,
  normalizeAdventureProgress,
  type AdventureProgress,
} from '../../src/game/adventure/adventureState'
import { ADVENTURE_ROUTES } from '../../src/game/adventure/adventureWorld'
import { getWindPuzzle } from '../../src/game/adventure/windPuzzle'
import type { GhostRun } from '../../src/game/competition/ghostRun'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import { FLIGHT_TUNING } from '../../src/game/flight/flightModel'
import { DEFAULT_SETTINGS, SETTINGS_KEY, type GameSettings } from '../../src/game/persistence/records'

type FixtureStage = 'device' | 'sense'

// Explicit QA save fixtures, not evidence of a player completing these quests.
// Only the competition entry uses QA hooks; all attempted UI actions use input.
function competitionFixture(stage: FixtureStage): GameSettings & { version: 12 } {
  const pointId = ADVENTURE_ROUTES.ridge.pointIds[0]
  const puzzle = getWindPuzzle(pointId)!
  const adventure = normalizeAdventureProgress({
    started: true,
    route: 'ridge',
    visitedPointIds: [
      'keeper', 'rescue', 'bird-return',
      ...(stage === 'sense' ? ADVENTURE_ROUTES.ridge.pointIds : []),
    ],
    // A solved but uncommitted station must not activate during a record run.
    device: stage === 'device'
      ? { pointId, rotations: puzzle.pieces.map(() => 0) }
      : null,
    placedDecorations: stage === 'sense' ? ['lanterns', 'pennants'] : ['lanterns'],
    elapsedPlaySeconds: 240,
  })
  expect(isCanonicalAdventureProgress(adventure)).toBe(true)
  const raceGhost: GhostRun = {
    durationMs: 90_000,
    samples: [[0, 0, 18, 20, 0, 0, 0, 0, 0], [90_000, 0, 18, -220, 0, 0, 0, 0, 6]],
  }
  const coinGhost: GhostRun = {
    durationMs: 18_250,
    samples: [[0, 430, 31, 190, 0, 0, 0, 0, 0], [18_250, 455, 36, 140, 0, 0, 0, 0, 10]],
  }
  return {
    ...DEFAULT_SETTINGS,
    version: 12,
    adventure,
    bestTimeMs: 90_000,
    muted: true,
    musicVolume: 0.62,
    characterLoadout: { characterId: 'storm-white-tiger', paletteId: 'moonlight', accessoryId: 'festival-ribbon' },
    missionGrades: { 'first-skyknot': 'gold', 'boost-mastery': 'silver' },
    coinBestTimesMs: { 'festival-hub': 18_250 },
    skyLeague: {
      raceTop10Ms: [90_000, 95_000],
      coinTop10Ms: { 'festival-hub': [18_250, 20_000] },
      missionTop10: {
        'first-skyknot': [{ elapsedMs: 90_000, grade: 'gold' }],
        'boost-mastery': [{ elapsedMs: 95_000, grade: 'silver' }],
      },
    },
    ghosts: { race: raceGhost, coin: { 'festival-hub': coinGhost }, mission: { 'first-skyknot': raceGhost, 'boost-mastery': raceGhost } },
    exploration: { ...DEFAULT_SETTINGS.exploration, position: getAdventureObjective(adventure).position },
  }
}

async function snapshot(page: Page): Promise<FlightDebugSnapshot> {
  const value = await page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot())
  expect(value).toBeDefined()
  return value!
}

async function stored(page: Page): Promise<GameSettings> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SETTINGS_KEY)
}

function legacyRecords(settings: GameSettings) {
  return {
    characterLoadout: settings.characterLoadout,
    bestTimeMs: settings.bestTimeMs,
    missionGrades: settings.missionGrades,
    coinBestTimesMs: settings.coinBestTimesMs,
    skyLeague: settings.skyLeague,
    ghosts: settings.ghosts,
    muted: settings.muted,
    musicVolume: settings.musicVolume,
  }
}

function durableAdventure(progress: AdventureProgress) {
  // Play time is checkpointed separately; quest/item state must survive exactly.
  return { ...progress, elapsedPlaySeconds: 0 }
}

async function press(control: Locator, touch: boolean): Promise<void> {
  if (touch) await control.tap()
  else await control.click()
}

async function expectAdventureDisabled(page: Page): Promise<void> {
  await expect(page.locator('[data-adventure-hud]')).toBeHidden()
  await expect(page.locator('[data-adventure-sense]')).toBeDisabled()
  await expect(page.locator('[data-adventure-interact]')).toBeDisabled()
  await expect(page.locator('[data-adventure-device]')).toBeHidden()
  await expect.poll(async () => {
    const adventure = (await snapshot(page)).exploration.adventure
    return {
      canSense: adventure.canSense,
      canInteract: adventure.canInteract,
      senseActive: adventure.senseActive,
      deviceOpen: adventure.deviceOpen,
      objectiveId: adventure.world.objectiveId,
      guides: adventure.world.guideMarkerCount,
      relic: adventure.world.relicVisible,
    }
  }).toEqual({ canSense: false, canInteract: false, senseActive: false, deviceOpen: false, objectiveId: null, guides: 0, relic: false })
}

test.describe('M46 competition isolation — QA fixtures, not real chapter play', () => {
  for (const stage of ['device', 'sense'] as const) {
    for (const competition of ['race', 'coin'] as const) {
      test(`${stage} cannot advance during a running ${competition} challenge`, async ({ page }, info) => {
        test.skip(!['desktop', 'touch-landscape'].includes(info.project.name), 'Contract runs with keyboard and touch; layout matrix is covered separately')
        const touch = info.project.name === 'touch-landscape'
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        const fixture = competitionFixture(stage)
        await page.addInitScript(({ key, value }) => {
          if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
        }, { key: SETTINGS_KEY, value: fixture })
        await page.goto('/')
        await expect.poll(async () => (await snapshot(page)).exploration.adventure.world.assetStatus).toBe('loaded')
        await press(page.locator('[data-adventure-start]'), touch)
        await expect.poll(async () => (await snapshot(page)).exploration.adventure.canInteract).toBe(true)
        const attemptedControls = [page.locator('[data-adventure-interact]')]
        if (stage === 'sense') {
          await expect(page.locator('[data-adventure-sense]')).toBeEnabled()
          expect((await snapshot(page)).exploration.adventure.canSense).toBe(true)
          attemptedControls.push(page.locator('[data-adventure-sense]'))
        } else {
          expect(getAdventureDevice((await snapshot(page)).exploration.adventure.progress)?.connected).toBe(true)
          await press(page.locator('[data-adventure-interact]'), touch)
          await expect(page.locator('[data-adventure-device]')).toBeVisible()
          await expect(page.locator('[data-adventure-device-activate]')).toBeEnabled()
          attemptedControls.push(page.locator('[data-adventure-device-tile="0"]'))
        }
        const formerTargets = []
        for (const control of attemptedControls) {
          const bounds = await control.boundingBox()
          if (bounds) formerTargets.push({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
        }
        if (stage === 'device') await press(page.locator('[data-adventure-device-close]'), touch)

        if (competition === 'race') {
          // Explicit public entry keeps this a legacy race without moving quests.
          await page.goto('/?mode=race')
          await press(page.locator('[data-mission-start="true"]'), touch)
          await expect.poll(async () => (await snapshot(page)).race.phase, { timeout: 5_000 }).toBe('racing')
          expect((await snapshot(page)).race.checkpointCount).toBe(6)
          expect((await snapshot(page)).flight.speed).toBeCloseTo(FLIGHT_TUNING.cruiseSpeed, 1)
          expect((await snapshot(page)).flight.boostRemaining).toBe(FLIGHT_TUNING.boostCapacity)
        } else {
          // Supported positioning/collection QA hook starts an actual CoinRunState.
          await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaCollectCoin('wind-canyon', 0))
          await expect.poll(async () => (await snapshot(page)).exploration.coinRun.phase).toBe('running')
        }
        await expectAdventureDisabled(page)
        const before = await snapshot(page)
        const savedBefore = await stored(page)
        expect(legacyRecords(savedBefore)).toEqual(legacyRecords(fixture))
        for (const target of formerTargets) {
          if (touch) await page.touchscreen.tap(target.x, target.y)
          else await page.mouse.click(target.x, target.y)
        }
        await page.keyboard.press('e')
        await page.keyboard.press('e')
        // Cross the one-second adventure clock checkpoint, not just one frame.
        await page.waitForTimeout(1_300)
        const after = await snapshot(page)
        await expectAdventureDisabled(page)
        expect(after.exploration.adventure.progress).toEqual(before.exploration.adventure.progress)
        expect(after.race.characterLoadout).toEqual(fixture.characterLoadout)
        if (competition === 'race') {
          expect(after.race.phase).toBe('racing')
          expect(after.race.elapsedMs).toBeGreaterThan(before.race.elapsedMs)
          expect(after.race.ghost.recorderSampleCount).toBeGreaterThan(before.race.ghost.recorderSampleCount)
        } else {
          expect(after.gameMode).toBe('explore')
          expect(after.exploration.coinRun.phase).toBe('running')
          expect(after.exploration.coinRun.elapsedMs).toBeGreaterThan(before.exploration.coinRun.elapsedMs)
        }
        expect(legacyRecords(await stored(page))).toEqual(legacyRecords(savedBefore))
        await page.goto('/?mode=race')
        await expect.poll(async () => (await snapshot(page)).race.phase).toBe('ready')
        expect(durableAdventure((await snapshot(page)).exploration.adventure.progress)).toEqual(durableAdventure(before.exploration.adventure.progress))
        expect(legacyRecords(await stored(page))).toEqual(legacyRecords(savedBefore))
        expect(errors).toEqual([])
      })
    }
  }
})
