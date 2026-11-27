import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  EMPTY_ADVENTURE_PROGRESS,
  canUseAdventureSense,
  getAdventureObjective,
  interactAdventure,
  isCanonicalAdventureProgress,
  rotateAdventureDevice,
  setAdventureCharm,
  setAdventureDecoration,
  startAdventure,
  useAdventureSense,
  type AdventureProgress,
} from '../../src/game/adventure/adventureState'
import { ADVENTURE_HOME } from '../../src/game/adventure/adventureWorld'
import { getWindPuzzle } from '../../src/game/adventure/windPuzzle'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import { DEFAULT_SETTINGS } from '../../src/game/persistence/records'

const BASE_URL = process.env.DRAGON_PERFORMANCE_URL ?? 'http://127.0.0.1:4176/'
const OUTPUT = path.resolve(`artifacts/browser-qa/${process.env.DRAGON_QA_SCOPE ?? 'm46-adventure'}`)
const SAMPLE_DURATION_MS = 30_000
const LAUNCH_ARGS = [
  '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--use-gl=angle', '--use-angle=swiftshader',
]
const SCENARIOS = ['fresh-intro', 'active-home', 'restored-home'] as const
const PROFILES = [
  { id: 'desktop-high', quality: 'high', viewport: { width: 1440, height: 900 }, touch: false },
  { id: 'mobile-low', quality: 'low', viewport: { width: 844, height: 390 }, touch: true },
] as const
type Scenario = typeof SCENARIOS[number]

// A canonical save fixture, not evidence of playing or completing the quests.
// The real-input chapter test owns completion and first-reward timing evidence.
function restoredFixture(): AdventureProgress {
  let progress = startAdventure(EMPTY_ADVENTURE_PROGRESS)
  for (let attempt = 0; attempt < 32 && getAdventureObjective(progress).id !== 'complete'; attempt++) {
    const objective = getAdventureObjective(progress)
    const context = {
      position: objective.position, gameMode: 'explore' as const,
      coinRunActive: false, paused: false, mapOpen: false,
    }
    if (progress.stage === 'route-flight') {
      const puzzle = getWindPuzzle(objective.id)
      if (!puzzle) throw new Error(`Missing fixture puzzle: ${objective.id}`)
      for (let index = 0; index < puzzle.pieces.length; index++) {
        for (let turn = 0; turn < (4 - puzzle.initialRotations[index]) % 4; turn++) {
          progress = rotateAdventureDevice(progress, context, index)
        }
      }
    }
    progress = canUseAdventureSense(progress, context)
      ? useAdventureSense(progress, context)
      : interactAdventure(progress, context, 'sheltered')
  }
  progress = setAdventureCharm(progress, true)
  progress = setAdventureDecoration(progress, 'lanterns', true)
  progress = setAdventureDecoration(progress, 'pennants', true)
  if (getAdventureObjective(progress).id !== 'complete' || !isCanonicalAdventureProgress(progress)) {
    throw new Error('Restored performance fixture must satisfy the adventure save contract')
  }
  return progress
}

const readSnapshot = (page: Page) => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)

interface BucketDiagnostic {
  readonly bucketIndex: number
  readonly render: FlightDebugSnapshot['render'] | null
  readonly position: FlightDebugSnapshot['flight']['position'] | null
  readonly movement: FlightDebugSnapshot['exploration']['movement'] | null
  readonly world: FlightDebugSnapshot['exploration']['adventure']['world'] | null
}

async function collectFrames(page: Page) {
  return page.evaluate(durationMs => new Promise<{
    durationMs: number
    frameCount: number
    bucketFps: number[]
    bucketDiagnostics: BucketDiagnostic[]
  }>(resolve => {
    let startTime: number | null = null
    let frameCount = 0
    let lastDiagnosticBucket = -1
    const bucketFps: number[] = []
    const bucketDiagnostics: BucketDiagnostic[] = []
    const sample = (time: number): void => {
      startTime ??= time
      const elapsed = time - startTime
      if (elapsed >= durationMs) {
        resolve({ durationMs: elapsed, frameCount, bucketFps, bucketDiagnostics })
        return
      }
      const bucket = Math.floor(elapsed / 1000)
      if (bucket !== lastDiagnosticBucket) {
        const snapshot = window.__DRAGON_RACE_TEST__?.snapshot() ?? null
        bucketDiagnostics.push({
          bucketIndex: bucket,
          render: snapshot?.render ?? null,
          position: snapshot?.flight.position ?? null,
          movement: snapshot?.exploration.movement ?? null,
          world: snapshot?.exploration.adventure.world ?? null,
        })
        lastDiagnosticBucket = bucket
      }
      bucketFps[bucket] = (bucketFps[bucket] ?? 0) + 1
      frameCount++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }), SAMPLE_DURATION_MS)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

function minimumSustainedFps(values: readonly number[], windowSize: number): number {
  if (windowSize < 1 || values.length < windowSize) return 0
  let windowFrames = values.slice(0, windowSize).reduce((sum, frames) => sum + frames, 0)
  let minimumFps = windowFrames / windowSize
  for (let index = windowSize; index < values.length; index++) {
    windowFrames += values[index] ?? 0
    windowFrames -= values[index - windowSize] ?? 0
    minimumFps = Math.min(minimumFps, windowFrames / windowSize)
  }
  return minimumFps
}

async function prepareScenario(page: Page, scenario: Scenario, quality: 'low' | 'high', touch: boolean) {
  await page.addInitScript(value => localStorage.setItem('skyknit-cup:settings', JSON.stringify(value)), {
    version: 12,
    ...DEFAULT_SETTINGS,
    quality,
    muted: false,
    adventure: scenario === 'restored-home' ? restoredFixture() : EMPTY_ADVENTURE_PROGRESS,
    exploration: {
      ...DEFAULT_SETTINGS.exploration,
      position: { ...ADVENTURE_HOME.position, y: ADVENTURE_HOME.position.y + 1.2 },
      headingRadians: ADVENTURE_HOME.headingRadians,
      movement: 'landed',
    },
  })
  const entry = new URL(BASE_URL)
  entry.searchParams.delete('mode')
  await page.goto(entry.href)
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'renderer-ready')
  await expect.poll(async () => (await readSnapshot(page))?.camera.dragon.source, { timeout: 10000 }).toBe('glb')
  await expect.poll(async () => (await readSnapshot(page))?.render.qualityTier).toBe(quality)
  await expect.poll(async () => (await readSnapshot(page))?.exploration.adventure.world.assetStatus).toBe('loaded')
  await expect.poll(async () => (await readSnapshot(page))?.exploration.regionAssets.find(asset => asset.id === 'festival-hub'))
    .toEqual({ id: 'festival-hub', lod: quality, status: 'loaded' })
  await expect(page.locator('[data-adventure-start]')).toBeVisible()
  if (scenario !== 'fresh-intro') {
    if (touch) await page.locator('[data-adventure-start]').tap()
    else await page.locator('[data-adventure-start]').click()
    await expect.poll(async () => (await readSnapshot(page))?.audio.bgmPlaying).toBe(true)
  }
  await expect.poll(async () => (await readSnapshot(page))?.exploration.adventure.intro).toBe(scenario === 'fresh-intro')
  await expect.poll(async () => (await readSnapshot(page))?.exploration.adventure.world).toMatchObject({
    worldVisible: true,
    lanternsVisible: scenario === 'restored-home',
    pennantsVisible: scenario === 'restored-home',
    secretPathVisible: scenario === 'restored-home',
    charmVisible: scenario === 'restored-home',
  })
  // Keep the authored home and its current effects in view, without QA teleports.
  await expect.poll(async () => (await readSnapshot(page))?.exploration.movement).toBe('landed')
  await page.waitForTimeout(5000)
}

test.describe('M46 RPG 30 second performance fixtures', () => {
  test.skip(process.env.M6_PERFORMANCE !== '1', 'Explicit performance runner only; these are not real-input completion tests')
  for (const scenario of SCENARIOS) {
    for (const profile of PROFILES) {
      test(`${scenario} ${profile.id} respects the frame and draw-call budgets`, async ({ browser }) => {
        test.setTimeout(75000)
        // As in the legacy suite, a fresh process prevents retained SwiftShader
        // allocations from charging this profile for preceding WebGL contexts.
        const measuredBrowser = await browser.browserType().launch({ headless: true, args: LAUNCH_ARGS })
        const page = await measuredBrowser.newPage({
          viewport: profile.viewport, hasTouch: profile.touch, isMobile: profile.touch,
        })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        try {
          await prepareScenario(page, scenario, profile.quality, profile.touch)
          const start = await readSnapshot(page)
          const frames = await collectFrames(page)
          const end = await readSnapshot(page)
          expect(start).not.toBeNull()
          expect(end).not.toBeNull()
          // Exact legacy math: discard the first and last one-second buckets.
          const fullBuckets = frames.bucketFps.slice(1, -1)
          const result = {
            evidenceKind: 'canonical-save performance fixture; not real-input quest completion',
            scenario, profile: profile.id, viewport: profile.viewport, quality: profile.quality,
            durationMs: frames.durationMs,
            medianFps: median(fullBuckets),
            meanFps: fullBuckets.reduce((sum, fps) => sum + fps, 0) / fullBuckets.length,
            minimumBucketFps: Math.min(...fullBuckets),
            minimumTwoSecondFps: minimumSustainedFps(fullBuckets, 2),
            bucketFps: fullBuckets,
            bucketDiagnostics: frames.bucketDiagnostics.slice(1, -1),
            maximumDrawCalls: Math.max(...frames.bucketDiagnostics.map(bucket => bucket.render?.drawCalls ?? 0)),
            hostFrames: (end?.hostFrames ?? 0) - (start?.hostFrames ?? 0),
            fixedSteps: (end?.stepCount ?? 0) - (start?.stepCount ?? 0),
            canvas: await page.locator('canvas.game-canvas').evaluate(canvas => [canvas.width, canvas.height]),
            start, end, errors,
          }
          await mkdir(OUTPUT, { recursive: true })
          const artifact = path.join(OUTPUT, `performance-${scenario}-${profile.id}-30s.json`)
          await writeFile(artifact, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
          await page.screenshot({ path: path.join(OUTPUT, `performance-${scenario}-${profile.id}.png`) })
          console.log(JSON.stringify({ scenario, profile: profile.id, medianFps: result.medianFps, minimumBucketFps: result.minimumBucketFps, maximumDrawCalls: result.maximumDrawCalls }))
          expect(fullBuckets).toHaveLength(28)
          expect(result.medianFps).toBeGreaterThanOrEqual(profile.quality === 'high' ? 55 : 30)
          expect(result.minimumBucketFps).toBeGreaterThanOrEqual(profile.quality === 'high' ? 50 : 30)
          expect(result.maximumDrawCalls).toBeLessThanOrEqual(120)
          expect(end?.gameMode).toBe('explore')
          expect(end?.flight.position).toEqual(start?.flight.position)
          expect(end?.exploration.adventure.intro).toBe(scenario === 'fresh-intro')
          if (scenario !== 'fresh-intro') {
            expect(result.fixedSteps).toBeGreaterThanOrEqual(1790)
            expect(result.fixedSteps).toBeLessThanOrEqual(1810)
          }
          if (scenario === 'restored-home') {
            expect(end?.exploration.adventure.world.windmillRotationRadians).not.toBe(start?.exploration.adventure.world.windmillRotationRadians)
            expect(end?.exploration.adventure.world.charmVisible).toBe(true)
          }
          expect(errors).toEqual([])
        } finally {
          await measuredBrowser.close()
        }
      })
    }
  }
})
