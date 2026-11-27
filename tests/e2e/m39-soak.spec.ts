import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CharacterLoadout } from '../../src/game/customization/characterCatalog'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import type {
  GeometryResourceEntry,
  GeometryResourceGroup,
  GeometryResourceLedgerSnapshot,
} from '../../src/game/qa/geometryResourceLedger'
import type { OpenWorldRegionId } from '../../src/game/world/openWorldRegions'

const SETTINGS_KEY = 'skyknit-cup:settings'
const DEFAULT_SOAK_DURATION_MS = 600_000
const MINIMUM_SOAK_DURATION_MS = 1_000
const MAXIMUM_SOAK_DURATION_MS = 900_000
const SHORT_SOAK_MINIMUM_CYCLES = 2
const MAXIMUM_DRAW_CALLS = 120
const MAXIMUM_RENDERER_GEOMETRIES = 96
const MAXIMUM_VOLCANIC_DRAW_CALLS = 6
const VOLCANIC_VFX_POOL_KEYS = [
  'thermal-columns',
  'ash-particles',
  'rock-telegraphs',
  'falling-rocks',
  'lava-telegraphs',
  'lava-waves',
] as const
const FLIGHT_EFFECT_POOL_KEYS = [
  'boost-ring-1',
  'boost-ring-2',
  'boost-ring-3',
  'speed-streaks',
  'gate-pass-wave',
] as const
const DOCUMENT_LOAD_COUNT_KEY = 'm39-soak:document-load-count'
const SETTINGS_SEEDED_KEY = 'm39-soak:settings-seeded'
const ARTIFACT_DIRECTORY = path.resolve('artifacts/browser-qa/m39')

type SoakQuality = 'high' | 'low'
type VolcanicVfxPoolKey = (typeof VOLCANIC_VFX_POOL_KEYS)[number]
type FlightEffectPoolKey = (typeof FLIGHT_EFFECT_POOL_KEYS)[number]

interface SoakProfile {
  readonly key: string
  readonly quality: SoakQuality
  readonly loadout: CharacterLoadout
}

interface ListenerProbeSnapshot {
  readonly active: number
  readonly peak: number
  readonly added: number
  readonly removed: number
}

interface ResourceCounts {
  readonly drawCalls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly regionMeshCount: number
  readonly volcanicDrawCalls: number
  readonly ghostMeshCount: number
  readonly ghostResident: boolean
  readonly ghostVisible: boolean
}

interface RuntimeMeasurement {
  readonly snapshot: FlightDebugSnapshot | null
  readonly geometryLedger: GeometryResourceLedgerSnapshot | null
}

interface ProfileBaseline {
  readonly profile: SoakProfile
  readonly loaded: ResourceCounts
  readonly ready: ResourceCounts
}

interface GeometryLedgerBaseline {
  readonly currentCount: number
  readonly signatures: readonly string[]
}

interface GeometryLedgerProfileBaseline {
  readonly loaded: GeometryLedgerBaseline
  readonly ready: GeometryLedgerBaseline
}

interface GeometryLedgerSample {
  readonly cycle: number
  readonly profileKey: string
  readonly phase: 'loaded' | 'ready'
  readonly rendererGeometries: number
  readonly currentCount: number
  readonly renderedResidentCount: number
  readonly trackedCount: number
  readonly disposedCount: number
  readonly orphanedCount: number
  readonly renderedOrphanCount: number
  readonly groups: readonly GeometryResourceGroup[]
}

interface CycleSample {
  readonly cycle: number
  readonly profileKey: string
  readonly quality: SoakQuality
  readonly characterId: CharacterLoadout['characterId']
  readonly loaded: ResourceCounts
  readonly ready: ResourceCounts
  readonly listeners: ListenerProbeSnapshot
}

const SOAK_PROFILES = [
  {
    key: 'dragon-high',
    quality: 'high',
    loadout: {
      characterId: 'sunrise-dragon',
      paletteId: 'sunrise',
      accessoryId: 'none',
    },
  },
  {
    key: 'phoenix-low',
    quality: 'low',
    loadout: {
      characterId: 'ember-phoenix',
      paletteId: 'moonlight',
      accessoryId: 'wind-goggles',
    },
  },
  {
    key: 'tiger-high',
    quality: 'high',
    loadout: {
      characterId: 'storm-white-tiger',
      paletteId: 'storm',
      accessoryId: 'festival-ribbon',
    },
  },
  {
    key: 'dragon-low',
    quality: 'low',
    loadout: {
      characterId: 'sunrise-dragon',
      paletteId: 'storm',
      accessoryId: 'festival-ribbon',
    },
  },
  {
    key: 'phoenix-high',
    quality: 'high',
    loadout: {
      characterId: 'ember-phoenix',
      paletteId: 'sunrise',
      accessoryId: 'none',
    },
  },
  {
    key: 'tiger-low',
    quality: 'low',
    loadout: {
      characterId: 'storm-white-tiger',
      paletteId: 'moonlight',
      accessoryId: 'wind-goggles',
    },
  },
] as const satisfies readonly SoakProfile[]

const FULL_SOAK_MINIMUM_CYCLES = SOAK_PROFILES.length

const AWAY_REGIONS = [
  'festival-hub',
  'cloud-ruins',
] as const satisfies readonly OpenWorldRegionId[]

function soakDurationMs(rawDuration: string | undefined): number {
  if (rawDuration === undefined) return DEFAULT_SOAK_DURATION_MS
  const parsed = Number(rawDuration)
  if (!Number.isFinite(parsed)) return DEFAULT_SOAK_DURATION_MS
  return Math.min(
    MAXIMUM_SOAK_DURATION_MS,
    Math.max(MINIMUM_SOAK_DURATION_MS, Math.floor(parsed)),
  )
}

function requiredCycleCount(durationMs: number): number {
  return durationMs >= DEFAULT_SOAK_DURATION_MS
    ? FULL_SOAK_MINIMUM_CYCLES
    : SHORT_SOAK_MINIMUM_CYCLES
}

function soakArtifactPath(durationMs: number): string {
  return path.join(
    ARTIFACT_DIRECTORY,
    durationMs >= DEFAULT_SOAK_DURATION_MS
      ? 'soak-10m.json'
      : 'soak-smoke.json',
  )
}

async function installListenerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Listener = EventListenerOrEventListenerObject
    type CaptureSet = Set<boolean>
    type ListenerMap = Map<Listener, CaptureSet>
    type EventMap = Map<string, ListenerMap>

    const tracked = new WeakMap<EventTarget, EventMap>()
    const originalAdd = EventTarget.prototype.addEventListener
    const originalRemove = EventTarget.prototype.removeEventListener
    let active = 0
    let peak = 0
    let added = 0
    let removed = 0

    const captureValue = (
      options: boolean | AddEventListenerOptions | undefined,
    ): boolean =>
      typeof options === 'boolean' ? options : options?.capture === true

    const isPersistentListener = (
      options: boolean | AddEventListenerOptions | undefined,
    ): boolean =>
      typeof options !== 'object' ||
      options === null ||
      (options.once !== true && options.signal === undefined)

    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: Listener | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (listener !== null && isPersistentListener(options)) {
        let eventMap = tracked.get(this)
        if (eventMap === undefined) {
          eventMap = new Map()
          tracked.set(this, eventMap)
        }
        let listenerMap = eventMap.get(type)
        if (listenerMap === undefined) {
          listenerMap = new Map()
          eventMap.set(type, listenerMap)
        }
        let captures = listenerMap.get(listener)
        if (captures === undefined) {
          captures = new Set()
          listenerMap.set(listener, captures)
        }
        const capture = captureValue(options)
        if (!captures.has(capture)) {
          captures.add(capture)
          active += 1
          added += 1
          peak = Math.max(peak, active)
        }
      }
      Reflect.apply(originalAdd, this, [type, listener, options])
    }

    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: Listener | null,
      options?: boolean | EventListenerOptions,
    ): void {
      if (listener !== null) {
        const captures = tracked.get(this)?.get(type)?.get(listener)
        const capture =
          typeof options === 'boolean'
            ? options
            : options?.capture === true
        if (captures?.delete(capture) === true) {
          active -= 1
          removed += 1
        }
      }
      Reflect.apply(originalRemove, this, [type, listener, options])
    }

    Object.defineProperty(window, '__M39_LISTENER_PROBE__', {
      configurable: true,
      value: {
        snapshot: () => ({ active, peak, added, removed }),
      },
    })
    const documentLoadCount = Number(
      sessionStorage.getItem('m39-soak:document-load-count') ?? '0',
    )
    sessionStorage.setItem(
      'm39-soak:document-load-count',
      String(documentLoadCount + 1),
    )
  })
}

async function readSnapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function readRuntimeMeasurement(page: Page): Promise<RuntimeMeasurement> {
  return page.evaluate(() => ({
    snapshot: window.__DRAGON_RACE_TEST__?.snapshot() ?? null,
    geometryLedger:
      window.__DRAGON_RACE_TEST__?.qaGeometryLedger() ?? null,
  }))
}

async function readListenerProbe(
  page: Page,
): Promise<ListenerProbeSnapshot | null> {
  return page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __M39_LISTENER_PROBE__?: {
          snapshot: () => ListenerProbeSnapshot
        }
      }
    ).__M39_LISTENER_PROBE__
    return probe?.snapshot() ?? null
  })
}

async function readDocumentLoadCount(page: Page): Promise<number> {
  return page.evaluate(
    (key) => Number(sessionStorage.getItem(key) ?? '0'),
    DOCUMENT_LOAD_COUNT_KEY,
  )
}

async function waitForHostFrames(page: Page, frameCount = 3): Promise<void> {
  const startFrame = (await readSnapshot(page))?.hostFrames ?? 0
  await expect
    .poll(async () => (await readSnapshot(page))?.hostFrames ?? 0)
    .toBeGreaterThanOrEqual(startFrame + frameCount)
}

function resourceCounts(
  snapshot: FlightDebugSnapshot | null,
): ResourceCounts {
  if (snapshot === null) {
    throw new Error('Missing renderer snapshot while measuring M39 resources')
  }
  return {
    drawCalls: snapshot.render.drawCalls,
    triangles: snapshot.render.triangles,
    geometries: snapshot.render.geometries,
    textures: snapshot.render.textures,
    regionMeshCount: snapshot.exploration.regionMeshCount,
    volcanicDrawCalls: snapshot.exploration.volcanicVisual.drawCalls,
    ghostMeshCount: snapshot.camera.ghostDragon?.meshCount ?? 0,
    ghostResident: snapshot.camera.ghostDragon !== null,
    ghostVisible: snapshot.camera.ghostVisible,
  }
}

function expectResourcesBounded(
  actual: ResourceCounts,
  baseline: ResourceCounts,
  label: string,
): void {
  expect(actual.drawCalls, `${label} exceeds the render budget`).toBeLessThanOrEqual(
    MAXIMUM_DRAW_CALLS,
  )
  expect(
    actual.volcanicDrawCalls,
    `${label} exceeds the volcanic VFX draw-call budget`,
  ).toBeLessThanOrEqual(MAXIMUM_VOLCANIC_DRAW_CALLS)
  expect(
    actual.geometries,
    `${label} exceeds the renderer geometry budget`,
  ).toBeLessThanOrEqual(MAXIMUM_RENDERER_GEOMETRIES)
  expect(
    actual.textures,
    `${label} leaked renderer textures`,
  ).toBeLessThanOrEqual(baseline.textures)
  expect(
    actual.regionMeshCount,
    `${label} retained extra streamed scene meshes`,
  ).toBeLessThanOrEqual(baseline.regionMeshCount)
  expect(
    actual.ghostMeshCount,
    `${label} retained an oversized ghost scene`,
  ).toBeLessThanOrEqual(baseline.ghostMeshCount)
}

function geometrySignature(entry: GeometryResourceEntry): string {
  return [
    entry.topLevelOwnerName,
    entry.objectName,
    entry.objectType,
    entry.geometryName,
    entry.geometryType,
  ].join('|')
}

function geometryLedgerBaseline(
  snapshot: GeometryResourceLedgerSnapshot,
): GeometryLedgerBaseline {
  return {
    currentCount: snapshot.currentCount,
    signatures: snapshot.entries.map(geometrySignature).sort(),
  }
}

function expectGeometryLedgerStable(
  actual: GeometryResourceLedgerSnapshot,
  baseline: GeometryLedgerBaseline,
  rendererGeometries: number,
  label: string,
): void {
  expect(actual.orphaned, `${label} detached geometry without dispose`).toEqual(
    [],
  )
  expect(
    actual.renderedOrphans,
    `${label} retained detached renderer geometry`,
  ).toEqual([])
  expect(
    actual.renderedResidentCount,
    `${label} renderer and scene geometry ledgers diverged`,
  ).toBe(rendererGeometries)
  expect(actual.currentCount, `${label} retained extra scene geometry`).toBe(
    baseline.currentCount,
  )
  expect(
    actual.entries.map(geometrySignature).sort(),
    `${label} changed the live scene geometry inventory`,
  ).toEqual(baseline.signatures)
}

function geometryLedgerSample(
  cycle: number,
  profileKey: string,
  phase: GeometryLedgerSample['phase'],
  rendererGeometries: number,
  snapshot: GeometryResourceLedgerSnapshot,
): GeometryLedgerSample {
  return {
    cycle,
    profileKey,
    phase,
    rendererGeometries,
    currentCount: snapshot.currentCount,
    renderedResidentCount: snapshot.renderedResidentCount,
    trackedCount: snapshot.trackedCount,
    disposedCount: snapshot.disposedCount,
    orphanedCount: snapshot.orphaned.length,
    renderedOrphanCount: snapshot.renderedOrphans.length,
    groups: snapshot.groups,
  }
}

async function applyGuardian(
  page: Page,
  loadout: CharacterLoadout,
): Promise<void> {
  await page.getByRole('button', { name: '캐릭터 꾸미기' }).click()
  await page.getByLabel('캐릭터 형태').selectOption(loadout.characterId)
  await page.getByLabel('색상').selectOption(loadout.paletteId)
  await page.getByLabel('장식').selectOption(loadout.accessoryId)
  await expect
    .poll(async () => {
      const dragon = (await readSnapshot(page))?.camera.dragon
      return dragon === undefined
        ? null
        : { loadout: dragon.loadout, source: dragon.source }
    })
    .toEqual({ loadout, source: 'glb' })
  await page.getByRole('button', { name: '적용', exact: true }).click()
  await expect
    .poll(async () => (await readSnapshot(page))?.race.characterLoadout)
    .toEqual(loadout)
  await waitForHostFrames(page)
}

async function setQuality(
  page: Page,
  quality: SoakQuality,
): Promise<void> {
  await page.locator('.race-hud__quality select').selectOption(quality)
  await expect
    .poll(async () => {
      const render = (await readSnapshot(page))?.render
      return render === undefined
        ? null
        : {
            preference: render.qualityPreference,
            tier: render.qualityTier,
          }
    })
    .toEqual({ preference: quality, tier: quality })
}

async function visitRegion(
  page: Page,
  regionId: OpenWorldRegionId,
  quality: SoakQuality,
  previousRegionId?: OpenWorldRegionId,
): Promise<void> {
  await page.evaluate(
    (id) => window.__DRAGON_RACE_TEST__?.qaExploreRegion(id),
    regionId,
  )
  await expect
    .poll(async () => {
      const exploration = (await readSnapshot(page))?.exploration
      const asset = exploration?.regionAssets.find(({ id }) => id === regionId)
      return {
        gameMode: (await readSnapshot(page))?.gameMode ?? null,
        asset: asset ?? null,
        previousLoaded:
          previousRegionId === undefined
            ? false
            : (exploration?.loadedRegionIds.includes(previousRegionId) ?? true),
      }
    })
    .toEqual({
      gameMode: 'explore',
      asset: { id: regionId, lod: quality, status: 'loaded' },
      previousLoaded: false,
    })
}

async function enterVolcanicRoundTrips(
  page: Page,
  quality: SoakQuality,
  awayRegions: readonly OpenWorldRegionId[],
): Promise<RuntimeMeasurement> {
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await visitRegion(page, 'volcanic-archipelago', quality)
  for (const awayRegionId of awayRegions) {
    await visitRegion(
      page,
      awayRegionId,
      quality,
      'volcanic-archipelago',
    )
    await visitRegion(
      page,
      'volcanic-archipelago',
      quality,
      awayRegionId,
    )
  }
  await expect
    .poll(async () => {
      const volcanic = (await readSnapshot(page))?.exploration.volcanicVisual
      return volcanic === undefined
        ? null
        : { active: volcanic.active, loaded: volcanic.loaded }
    })
    .toEqual({ active: true, loaded: true })
  await waitForHostFrames(page)
  const measurement = await readRuntimeMeasurement(page)
  expect(measurement.snapshot?.exploration.volcanicVisual).toMatchObject({
    active: true,
    loaded: true,
  })
  return measurement
}

async function waitForVolcanicRace(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const race = (await readSnapshot(page))?.race
        return race === undefined
          ? null
          : {
              phase: race.phase,
              courseId: race.courseId,
              checkpointCount: race.checkpointCount,
              missionId: race.mission.selectedMissionId,
            }
      },
      { timeout: 7_000 },
    )
    .toEqual({
      phase: 'racing',
      courseId: 'volcanic-archipelago',
      checkpointCount: 4,
      missionId: 'heart-of-sun',
    })
}

async function finishVolcanicRace(page: Page): Promise<void> {
  const race = (await readSnapshot(page))?.race
  const remaining =
    (race?.checkpointCount ?? 0) - (race?.nextCheckpointIndex ?? 0)
  for (let checkpoint = 0; checkpoint < remaining; checkpoint += 1) {
    await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaPassCheckpoint())
  }
  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('finished')
}

async function prewarmEveryVolcanicGate(page: Page): Promise<void> {
  const race = (await readSnapshot(page))?.race
  const checkpointCount = race?.checkpointCount ?? 0
  let nextCheckpointIndex = race?.nextCheckpointIndex ?? 0

  await expect
    .poll(async () => (await readSnapshot(page))?.camera.activeGateIndex)
    .toBe(nextCheckpointIndex)
  await waitForHostFrames(page)

  while (nextCheckpointIndex < checkpointCount) {
    await page.evaluate(() => window.__DRAGON_RACE_TEST__?.qaPassCheckpoint())
    await expect
      .poll(async () => (await readSnapshot(page))?.camera.gatePassWaveActive)
      .toBe(true)

    nextCheckpointIndex += 1
    if (nextCheckpointIndex < checkpointCount) {
      await expect
        .poll(async () => (await readSnapshot(page))?.camera.activeGateIndex)
        .toBe(nextCheckpointIndex)
    }
    await waitForHostFrames(page)
  }

  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase)
    .toBe('finished')
}

function observeVolcanicVfxPools(
  snapshot: FlightDebugSnapshot | null,
  observed: Set<VolcanicVfxPoolKey>,
): void {
  const visual = snapshot?.exploration.volcanicVisual
  if (visual === undefined) return
  if (visual.thermalColumnCount > 0) observed.add('thermal-columns')
  if (visual.ashParticleCount > 0) observed.add('ash-particles')
  if (visual.rockTelegraphCount > 0) observed.add('rock-telegraphs')
  if (visual.fallingRockCount > 0) observed.add('falling-rocks')
  if (visual.lavaTelegraphSegmentCount > 0) {
    observed.add('lava-telegraphs')
  }
  if (visual.lavaWaveSegmentCount > 0) observed.add('lava-waves')
}

async function prewarmVolcanicVfxPools(
  page: Page,
): Promise<{
  readonly volcanic: readonly VolcanicVfxPoolKey[]
  readonly flight: readonly FlightEffectPoolKey[]
}> {
  await page.getByRole('button', { name: '하늘 탐험' }).click()
  await visitRegion(page, 'volcanic-archipelago', 'high')
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreVolcanicChallenge(),
  )
  const contextAction = page.locator('[data-explore-context]')
  await expect(contextAction).toHaveText('태양의 심장 · 냉각 봉인 도전')
  await contextAction.click()
  await waitForVolcanicRace(page)

  await page.getByRole('button', { name: 'QA 부스트' }).click()
  await expect
    .poll(async () => {
      const camera = (await readSnapshot(page))?.camera
      return camera === undefined
        ? null
        : {
            boostRingCount: camera.boostRingCount,
            boostRingsVisible: camera.boostRingsVisible,
            speedStreakCount: camera.speedStreakCount,
            speedStreaksVisible: camera.speedStreaksVisible,
          }
    })
    .toEqual({
      boostRingCount: 3,
      boostRingsVisible: true,
      speedStreakCount: 18,
      speedStreaksVisible: true,
    })
  await waitForHostFrames(page)

  await page.getByRole('button', { name: 'QA 통과 파동' }).click()
  await expect
    .poll(
      async () => (await readSnapshot(page))?.camera.gatePassWaveActive,
    )
    .toBe(true)
  await waitForHostFrames(page)

  const observed = new Set<VolcanicVfxPoolKey>()
  const deadline = Date.now() + 7_000
  let elapsedMs = 0
  while (Date.now() < deadline) {
    const snapshot = await readSnapshot(page)
    observeVolcanicVfxPools(snapshot, observed)
    elapsedMs = snapshot?.race.elapsedMs ?? elapsedMs
    if (
      observed.size === VOLCANIC_VFX_POOL_KEYS.length &&
      elapsedMs >= 2_500
    ) {
      break
    }
    await page.waitForTimeout(50)
  }

  const observedPools = VOLCANIC_VFX_POOL_KEYS.filter((key) =>
    observed.has(key),
  )
  expect(observedPools, 'every pooled volcanic VFX geometry was rendered').toEqual(
    VOLCANIC_VFX_POOL_KEYS,
  )
  expect(elapsedMs, 'volcanic VFX prewarm covered the active lava phase').toBeGreaterThanOrEqual(
    2_500,
  )
  await waitForHostFrames(page)
  await prewarmEveryVolcanicGate(page)
  await page.getByRole('button', { name: '미션 선택', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      return {
        gameMode: snapshot?.gameMode,
        phase: snapshot?.race.phase,
        volcanicLoaded: snapshot?.exploration.loadedRegionIds.includes(
          'volcanic-archipelago',
        ),
      }
    })
    .toEqual({ gameMode: 'race', phase: 'ready', volcanicLoaded: true })
  await waitForHostFrames(page)
  return { volcanic: observedPools, flight: FLIGHT_EFFECT_POOL_KEYS }
}

async function runVolcanicMissionRetryPair(
  page: Page,
  verifyPause: boolean,
): Promise<RuntimeMeasurement> {
  await page.evaluate(() =>
    window.__DRAGON_RACE_TEST__?.qaExploreVolcanicChallenge(),
  )
  const contextAction = page.locator('[data-explore-context]')
  await expect(contextAction).toHaveText('태양의 심장 · 냉각 봉인 도전')
  await contextAction.click()
  await waitForVolcanicRace(page)

  if (verifyPause) {
    await page.keyboard.press('Escape')
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase)
      .toBe('paused')
    const pausedElapsedMs = (await readSnapshot(page))?.race.elapsedMs
    await page.waitForTimeout(120)
    expect((await readSnapshot(page))?.race.elapsedMs).toBe(pausedElapsedMs)
    await page.getByRole('button', { name: '계속 날기' }).click()
    await waitForVolcanicRace(page)
  }

  await finishVolcanicRace(page)
  await page.getByRole('button', { name: '다시 달리기' }).click()
  await waitForVolcanicRace(page)
  await finishVolcanicRace(page)
  await page.getByRole('button', { name: '미션 선택', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page)
      return {
        gameMode: snapshot?.gameMode,
        phase: snapshot?.race.phase,
        volcanicAsset: snapshot?.exploration.regionAssets.find(
          ({ id }) => id === 'volcanic-archipelago',
        ),
      }
    })
    .toEqual({
      gameMode: 'race',
      phase: 'ready',
      volcanicAsset: {
        id: 'volcanic-archipelago',
        lod: (await readSnapshot(page))?.render.qualityTier,
        status: 'loaded',
      },
    })
  await waitForHostFrames(page)
  return readRuntimeMeasurement(page)
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .split(String.fromCharCode(27))
    .map((part) => part.replace(/^\[[0-9;]*m/, ''))
    .join('')
}

test('keeps M39 streaming, LOD, retries, pause, guardians, and resources stable during an opt-in soak', async ({
  page,
}, testInfo) => {
  test.skip(process.env.M39_SOAK !== '1', 'set M39_SOAK=1 to run the soak')
  test.skip(testInfo.project.name !== 'desktop', 'desktop soak contract')

  const configuredDurationMs = soakDurationMs(
    process.env.M39_SOAK_DURATION_MS,
  )
  const artifactPath = soakArtifactPath(configuredDurationMs)
  const minimumMeasuredCycles = requiredCycleCount(configuredDurationMs)
  test.setTimeout(configuredDurationMs + 240_000)

  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const requestFailures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'failed'
    if (
      failure === 'net::ERR_ABORTED' &&
      request
        .url()
        .includes('/assets/audio/sovereign-of-the-sunrise-skies-loop.')
    ) {
      return
    }
    requestFailures.push(`${request.method()} ${request.url()} ${failure}`)
  })

  const baselines: Record<string, ProfileBaseline> = {}
  const cycleSamples: CycleSample[] = []
  const geometryLedgerBaselines: Record<
    string,
    GeometryLedgerProfileBaseline
  > = {}
  const geometryLedgerSamples: GeometryLedgerSample[] = []
  let listenerBaseline: ListenerProbeSnapshot | null = null
  let finalListenerProbe: ListenerProbeSnapshot | null = null
  let finalSnapshot: FlightDebugSnapshot | null = null
  let finalGeometryLedger: GeometryResourceLedgerSnapshot | null = null
  let finalDocumentLoadCount: number
  let measuredCycles = 0
  let regionRoundTrips = 0
  let missionRuns = 0
  let missionRetries = 0
  let pauseResumes = 0
  let guardianSwaps = 0
  let highLodLoads = 0
  let lowLodLoads = 0
  let prewarmedVolcanicPools: readonly VolcanicVfxPoolKey[] = []
  let prewarmedFlightEffectPools: readonly FlightEffectPoolKey[] = []
  let failure: unknown = null
  const overallStartedAt = Date.now()
  let soakStartedAt = overallStartedAt

  try {
    await installListenerProbe(page)
    await page.addInitScript(({ seededKey, settingsKey }) => {
      if (sessionStorage.getItem(seededKey) === 'true') return
      sessionStorage.setItem(seededKey, 'true')
      localStorage.setItem(
        settingsKey,
        JSON.stringify({
          version: 11,
          quality: 'high',
          missionGrades: { 'golden-knot': 'bronze' },
        }),
      )
    }, { seededKey: SETTINGS_SEEDED_KEY, settingsKey: SETTINGS_KEY })
    await page.goto(
      '/?mode=race&qaCourse=1&qaBoost=1&qaWave=1&qaGeometryLedger=1',
    )
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )
    expect(await readDocumentLoadCount(page)).toBe(1)
    const prewarmedPools = await prewarmVolcanicVfxPools(page)
    prewarmedVolcanicPools = prewarmedPools.volcanic
    prewarmedFlightEffectPools = prewarmedPools.flight

    for (const profile of SOAK_PROFILES) {
      await applyGuardian(page, profile.loadout)
      await setQuality(page, profile.quality)
      await enterVolcanicRoundTrips(
        page,
        profile.quality,
        AWAY_REGIONS,
      )
      await runVolcanicMissionRetryPair(page, false)
    }
    for (const profile of SOAK_PROFILES) {
      await applyGuardian(page, profile.loadout)
      await setQuality(page, profile.quality)
      const loadedMeasurement = await enterVolcanicRoundTrips(
        page,
        profile.quality,
        AWAY_REGIONS,
      )
      const loaded = resourceCounts(loadedMeasurement.snapshot)
      const loadedGeometryLedger = loadedMeasurement.geometryLedger
      if (loadedGeometryLedger === null) {
        throw new Error(
          `Missing geometry ledger baseline for ${profile.key} loaded`,
        )
      }
      const readyMeasurement = await runVolcanicMissionRetryPair(page, false)
      const ready = resourceCounts(readyMeasurement.snapshot)
      const readyGeometryLedger = readyMeasurement.geometryLedger
      if (readyGeometryLedger === null) {
        throw new Error(
          `Missing geometry ledger baseline for ${profile.key} ready`,
        )
      }
      baselines[profile.key] = { profile, loaded, ready }
      geometryLedgerBaselines[profile.key] = {
        loaded: geometryLedgerBaseline(loadedGeometryLedger),
        ready: geometryLedgerBaseline(readyGeometryLedger),
      }
    }

    listenerBaseline = await readListenerProbe(page)
    expect(listenerBaseline).not.toBeNull()
    soakStartedAt = Date.now()

    while (
      Date.now() - soakStartedAt < configuredDurationMs ||
      measuredCycles < minimumMeasuredCycles
    ) {
      const profile = SOAK_PROFILES[measuredCycles % SOAK_PROFILES.length]
      const baseline = baselines[profile.key]
      if (baseline === undefined) {
        throw new Error(`Missing resource baseline for ${profile.key}`)
      }
      const ledgerBaseline = geometryLedgerBaselines[profile.key]
      if (ledgerBaseline === undefined) {
        throw new Error(`Missing geometry ledger baseline for ${profile.key}`)
      }

      await applyGuardian(page, profile.loadout)
      guardianSwaps += 1
      await setQuality(page, profile.quality)
      if (profile.quality === 'high') highLodLoads += 1
      else lowLodLoads += 1

      const loadedMeasurement = await enterVolcanicRoundTrips(
        page,
        profile.quality,
        AWAY_REGIONS,
      )
      const loaded = resourceCounts(loadedMeasurement.snapshot)
      regionRoundTrips += AWAY_REGIONS.length
      const loadedGeometryLedger = loadedMeasurement.geometryLedger
      if (loadedGeometryLedger === null) {
        throw new Error(
          `Missing geometry ledger for ${profile.key} loaded cycle ${measuredCycles}`,
        )
      }
      expectGeometryLedgerStable(
        loadedGeometryLedger,
        ledgerBaseline.loaded,
        loaded.geometries,
        `${profile.key} loaded cycle ${measuredCycles}`,
      )
      geometryLedgerSamples.push(
        geometryLedgerSample(
          measuredCycles,
          profile.key,
          'loaded',
          loaded.geometries,
          loadedGeometryLedger,
        ),
      )
      expectResourcesBounded(
        loaded,
        baseline.loaded,
        `${profile.key} loaded cycle ${measuredCycles}`,
      )

      const readyMeasurement = await runVolcanicMissionRetryPair(page, true)
      const ready = resourceCounts(readyMeasurement.snapshot)
      missionRuns += 2
      missionRetries += 1
      pauseResumes += 1
      const readyGeometryLedger = readyMeasurement.geometryLedger
      if (readyGeometryLedger === null) {
        throw new Error(
          `Missing geometry ledger for ${profile.key} ready cycle ${measuredCycles}`,
        )
      }
      expectGeometryLedgerStable(
        readyGeometryLedger,
        ledgerBaseline.ready,
        ready.geometries,
        `${profile.key} ready cycle ${measuredCycles}`,
      )
      geometryLedgerSamples.push(
        geometryLedgerSample(
          measuredCycles,
          profile.key,
          'ready',
          ready.geometries,
          readyGeometryLedger,
        ),
      )
      expectResourcesBounded(
        ready,
        baseline.ready,
        `${profile.key} ready cycle ${measuredCycles}`,
      )

      const listeners = await readListenerProbe(page)
      if (listeners === null || listenerBaseline === null) {
        throw new Error('Missing listener probe during measured soak cycle')
      }
      expect(
        listeners.active,
        `listener count grew during cycle ${measuredCycles}`,
      ).toBeLessThanOrEqual(listenerBaseline.active)
      expect(
        listeners.peak,
        `listener peak grew during cycle ${measuredCycles}`,
      ).toBeLessThanOrEqual(listenerBaseline.peak)

      cycleSamples.push({
        cycle: measuredCycles,
        profileKey: profile.key,
        quality: profile.quality,
        characterId: profile.loadout.characterId,
        loaded,
        ready,
        listeners,
      })
      measuredCycles += 1
    }

    const finalMeasurement = await readRuntimeMeasurement(page)
    finalSnapshot = finalMeasurement.snapshot
    finalListenerProbe = await readListenerProbe(page)
    finalGeometryLedger = finalMeasurement.geometryLedger
    finalDocumentLoadCount = await readDocumentLoadCount(page)
    expect(regionRoundTrips).toBeGreaterThanOrEqual(
      minimumMeasuredCycles * AWAY_REGIONS.length,
    )
    if (configuredDurationMs >= DEFAULT_SOAK_DURATION_MS) {
      expect(regionRoundTrips).toBeGreaterThanOrEqual(10)
      expect(
        [...new Set(cycleSamples.map(({ profileKey }) => profileKey))].sort(),
        'the full soak did not measure every quality and guardian profile',
      ).toEqual(SOAK_PROFILES.map(({ key }) => key).sort())
    }
    expect(missionRetries).toBeGreaterThanOrEqual(minimumMeasuredCycles)
    expect(pauseResumes).toBeGreaterThanOrEqual(minimumMeasuredCycles)
    expect(guardianSwaps).toBeGreaterThanOrEqual(minimumMeasuredCycles)
    expect(highLodLoads).toBeGreaterThan(0)
    expect(lowLodLoads).toBeGreaterThan(0)
    expect(finalSnapshot).toMatchObject({
      gameMode: 'race',
      race: {
        phase: 'ready',
        courseId: 'volcanic-archipelago',
        mission: { selectedMissionId: 'heart-of-sun' },
      },
      exploration: {
        loadedRegionIds: ['volcanic-archipelago'],
        paused: false,
        mapOpen: false,
        volcanicVisual: { active: true, loaded: true },
      },
    })
    expect(finalListenerProbe?.active).toBeLessThanOrEqual(
      listenerBaseline.active,
    )
    expect(finalGeometryLedger).not.toBeNull()
    expect(finalGeometryLedger?.orphaned).toEqual([])
    expect(finalGeometryLedger?.renderedOrphans).toEqual([])
    expect(
      finalDocumentLoadCount,
      'the dev document reloaded during the soak',
    ).toBe(1)
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(requestFailures).toEqual([])
  } catch (error) {
    failure = error
  } finally {
    const fallbackMeasurement = await readRuntimeMeasurement(page).catch(
      (): RuntimeMeasurement => ({ snapshot: null, geometryLedger: null }),
    )
    finalSnapshot ??= fallbackMeasurement.snapshot
    finalListenerProbe ??= await readListenerProbe(page).catch(() => null)
    finalGeometryLedger ??= fallbackMeasurement.geometryLedger
    finalDocumentLoadCount = await readDocumentLoadCount(page).catch(() => 0)
    await mkdir(path.dirname(artifactPath), { recursive: true })
    await writeFile(
      artifactPath,
      `${JSON.stringify(
        {
          configuredDurationMs,
          actualDurationMs: Date.now() - soakStartedAt,
          totalDurationMs: Date.now() - overallStartedAt,
          minimumMeasuredCycles,
          measuredCycles,
          documentLoadCount: finalDocumentLoadCount,
          passed: failure === null,
          failure: failure === null ? null : errorMessage(failure),
          coverage: {
            prewarmedVolcanicPools,
            prewarmedFlightEffectPools,
            regionRoundTrips,
            missionRuns,
            missionRetries,
            pauseResumes,
            guardianSwaps,
            highLodLoads,
            lowLodLoads,
          },
          resources: {
            baselines,
            cycleSamples,
            final:
              finalSnapshot === null
                ? null
                  : resourceCounts(finalSnapshot),
          },
          geometryLedger: {
            baselines: geometryLedgerBaselines,
            samples: geometryLedgerSamples,
            final: finalGeometryLedger,
          },
          listeners: {
            baseline: listenerBaseline,
            final: finalListenerProbe,
          },
          finalState:
            finalSnapshot === null
              ? null
              : {
                  gameMode: finalSnapshot.gameMode,
                  racePhase: finalSnapshot.race.phase,
                  courseId: finalSnapshot.race.courseId,
                  missionId:
                    finalSnapshot.race.mission.selectedMissionId,
                  missionRecordCount:
                    finalSnapshot.race.selectedMissionTop10.length,
                  characterId:
                    finalSnapshot.race.characterLoadout.characterId,
                  qualityTier: finalSnapshot.render.qualityTier,
                  loadedRegionIds:
                    finalSnapshot.exploration.loadedRegionIds,
                  regionMeshCount:
                    finalSnapshot.exploration.regionMeshCount,
                },
          errors: {
            console: consoleErrors,
            page: pageErrors,
            requests: requestFailures,
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }

  if (failure !== null) throw failure
})
