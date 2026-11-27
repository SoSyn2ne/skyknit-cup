import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dragonFactoryMock = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('./createDragon', () => ({
  createDragon: (...args: unknown[]) => dragonFactoryMock.create(...args),
  GHOST_DRAGON_VISUAL_SPEC: { opacity: 0.32 },
}))

vi.mock('./createWorld', () => ({
  createWorld: () => ({
    update: vi.fn(),
    setQuality: vi.fn(),
    debugSnapshot: vi.fn(),
  }),
}))

import { resolveRenderQuality } from '../quality/qualityPolicy'
import type { CharacterLoadout } from '../customization/characterCatalog'
import { createInitialFlightState } from '../flight/flightModel'
import {
  createFlightSandbox,
  type FlightSandboxPalette,
} from './createFlightSandbox'

const PALETTE: FlightSandboxPalette = {
  skyZenith: '#2578ac',
  skyHaze: '#bde9ef',
  cloud: '#ffffff',
  rock: '#635a51',
  gateRune: '#62e9df',
  ink: '#171820',
  dragonEmber: '#c84c38',
  wingGold: '#f4cc65',
  collisionCoral: '#ff766d',
}

const PHOENIX_LOADOUT = {
  characterId: 'ember-phoenix',
  paletteId: 'moonlight',
  accessoryId: 'wind-goggles',
} as const

const WHITE_TIGER_LOADOUT = {
  characterId: 'storm-white-tiger',
  paletteId: 'storm',
  accessoryId: 'festival-ribbon',
} as const

function deferred<T>(): {
  readonly promise: Promise<T>
  resolve(value: T): void
} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  }
}

function createMockDragon(
  name: string,
  ready: Promise<'fallback' | 'glb'>,
) {
  const movementRoot = new THREE.Group()
  movementRoot.name = name
  return {
    movementRoot,
    ready,
    update: vi.fn(),
    setShadows: vi.fn(),
    setVolcanicReaction: vi.fn(),
    debugSnapshot: vi.fn(),
    dispose: vi.fn(() => movementRoot.removeFromParent()),
  }
}

function createSandbox(
  scene: THREE.Scene,
  initialCharacterLoadout?: CharacterLoadout,
) {
  const camera = new THREE.PerspectiveCamera()
  const quality = resolveRenderQuality({
    preference: 'low',
    coarsePointer: false,
    viewportWidth: 1_280,
    devicePixelRatio: 1,
  })
  return createFlightSandbox(
    scene,
    camera,
    PALETTE,
    quality,
    [],
    initialCharacterLoadout,
  )
}

describe('Milestone 38 transactional guardian visuals', () => {
  beforeEach(() => {
    dragonFactoryMock.create.mockReset()
    vi.stubGlobal('window', {
      innerWidth: 1_280,
      innerHeight: 720,
      location: { search: '' },
      matchMedia: () => ({ matches: false }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a restored character directly as the initial visual', async () => {
    const restored = createMockDragon(
      'M38_RestoredGuardian',
      Promise.resolve('glb'),
    )
    dragonFactoryMock.create.mockReturnValueOnce(restored)
    const scene = new THREE.Scene()

    const sandbox = createSandbox(scene, WHITE_TIGER_LOADOUT)

    await expect(sandbox.ready).resolves.toBe('glb')
    expect(dragonFactoryMock.create).toHaveBeenCalledTimes(1)
    expect(dragonFactoryMock.create).toHaveBeenCalledWith(PALETTE, {
      loadout: WHITE_TIGER_LOADOUT,
    })
    expect(scene.children).toContain(restored.movementRoot)
  })

  it('uses the selected guardian profile for visual poses without changing the flight state', async () => {
    const phoenix = createMockDragon(
      'M41_PhoenixGuardian',
      Promise.resolve('glb'),
    )
    const tiger = createMockDragon(
      'M41_TigerGuardian',
      Promise.resolve('glb'),
    )
    dragonFactoryMock.create
      .mockReturnValueOnce(phoenix)
      .mockReturnValueOnce(tiger)
    const scene = new THREE.Scene()
    const sandbox = createSandbox(scene, PHOENIX_LOADOUT)
    const flight = {
      ...createInitialFlightState(),
      bankRadians: 0.34,
      pitchRadians: 0.24,
    }
    const flightBefore = structuredClone(flight)

    await sandbox.ready
    sandbox.step(flight, 1 / 60, 1 / 60, 0, 0, 'race')
    const phoenixPose = phoenix.update.mock.calls.at(-1)?.[1]

    await expect(sandbox.setCharacterLoadout(WHITE_TIGER_LOADOUT)).resolves.toBe(
      'glb',
    )
    sandbox.step(flight, 2 / 60, 1 / 60, 0, 0, 'race')
    const tigerPose = tiger.update.mock.calls.at(-1)?.[1]

    expect(phoenixPose).toMatchObject({ wingMode: 'climb' })
    expect(tigerPose).toMatchObject({ wingMode: 'climb' })
    expect(tigerPose.wingFlapRadians).not.toBeCloseTo(
      phoenixPose.wingFlapRadians,
      6,
    )
    expect(tigerPose.tailYawRadians[0]).not.toBeCloseTo(
      phoenixPose.tailYawRadians[0],
      6,
    )
    expect(flight).toEqual(flightBefore)
  })

  it('lets only the latest completed load request replace the current visual', async () => {
    const firstReady = deferred<'fallback' | 'glb'>()
    const latestReady = deferred<'fallback' | 'glb'>()
    const initial = createMockDragon(
      'M38_InitialGuardian',
      Promise.resolve('glb'),
    )
    const stale = createMockDragon('M38_StaleGuardian', firstReady.promise)
    const latest = createMockDragon(
      'M38_LatestGuardian',
      latestReady.promise,
    )
    dragonFactoryMock.create
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(latest)
    const scene = new THREE.Scene()
    const sandbox = createSandbox(scene)

    const staleRequest = sandbox.setCharacterLoadout(PHOENIX_LOADOUT)
    const latestRequest = sandbox.setCharacterLoadout(WHITE_TIGER_LOADOUT)
    expect(scene.children).toContain(initial.movementRoot)

    latestReady.resolve('glb')
    await expect(latestRequest).resolves.toBe('glb')
    expect(scene.children).toContain(latest.movementRoot)
    expect(scene.children).not.toContain(initial.movementRoot)
    expect(initial.dispose).toHaveBeenCalledTimes(1)

    firstReady.resolve('glb')
    await expect(staleRequest).resolves.toBe('glb')
    expect(scene.children).toContain(latest.movementRoot)
    expect(scene.children).not.toContain(stale.movementRoot)
    expect(stale.dispose).toHaveBeenCalledTimes(1)
    expect(initial.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps the current visual when a replacement falls back', async () => {
    const initial = createMockDragon(
      'M38_CurrentGuardian',
      Promise.resolve('glb'),
    )
    const failed = createMockDragon(
      'M38_FailedGuardian',
      Promise.resolve('fallback'),
    )
    dragonFactoryMock.create
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(failed)
    const scene = new THREE.Scene()
    const sandbox = createSandbox(scene)

    await expect(
      sandbox.setCharacterLoadout(PHOENIX_LOADOUT),
    ).resolves.toBe('fallback')

    expect(scene.children).toContain(initial.movementRoot)
    expect(scene.children).not.toContain(failed.movementRoot)
    expect(initial.dispose).not.toHaveBeenCalled()
    expect(failed.dispose).toHaveBeenCalledTimes(1)
  })
})
