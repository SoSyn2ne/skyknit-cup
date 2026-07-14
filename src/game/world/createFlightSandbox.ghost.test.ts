import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dragonFactoryMock = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('./createDragon', () => ({
  createDragon: (...args: unknown[]) => dragonFactoryMock.create(...args),
}))

vi.mock('./createWorld', () => ({
  createWorld: () => ({
    update: vi.fn(),
    setQuality: vi.fn(),
    debugSnapshot: vi.fn(),
  }),
}))

import type { GhostPose } from '../competition/ghostRun'
import { resolveRenderQuality } from '../quality/qualityPolicy'
import {
  createFlightSandbox,
  getGhostWingFlapRadians,
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

function createMockDragon(name: string) {
  const movementRoot = new THREE.Group()
  movementRoot.name = name
  return {
    movementRoot,
    ready: Promise.resolve('fallback' as const),
    update: vi.fn(),
    setShadows: vi.fn(),
    debugSnapshot: vi.fn(),
    dispose: vi.fn(() => movementRoot.clear()),
  }
}

const GHOST_POSE: GhostPose = {
  elapsedMs: 1_250,
  position: { x: 12, y: 24, z: -36 },
  headingRadians: 0.4,
  pitchRadians: -0.12,
  bankRadians: 0.22,
  boost: false,
  progress: 3,
}

describe('flight sandbox ghost dragon', () => {
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

  it('derives wing motion only from the recorded elapsed time and boost state', () => {
    const first = getGhostWingFlapRadians(1_250, false)
    const repeated = getGhostWingFlapRadians(1_250, false)
    const boost = getGhostWingFlapRadians(1_250, true)

    expect(repeated).toBe(first)
    expect(boost).not.toBe(first)
    expect(Math.abs(first)).toBeLessThanOrEqual(0.28)
    expect(Math.abs(boost)).toBeLessThanOrEqual(0.12)
    expect(getGhostWingFlapRadians(Number.NaN, false)).toBe(0)
  })

  it('reuses one hidden ghost and updates it without moving the camera', () => {
    const player = createMockDragon('M3_DragonMovementRoot')
    const ghost = createMockDragon('M33_SkyLeagueGhostDragonMovementRoot')
    dragonFactoryMock.create
      .mockReturnValueOnce(player)
      .mockReturnValueOnce(ghost)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(4, 5, 6)
    const cameraPosition = camera.position.clone()
    const quality = resolveRenderQuality({
      preference: 'low',
      coarsePointer: false,
      viewportWidth: 1_280,
      devicePixelRatio: 1,
    })

    const sandbox = createFlightSandbox(scene, camera, PALETTE, quality, [])

    expect(dragonFactoryMock.create).toHaveBeenCalledTimes(1)
    expect(scene.children).not.toContain(ghost.movementRoot)

    sandbox.updateGhost(GHOST_POSE, 1 / 60)

    expect(dragonFactoryMock.create).toHaveBeenNthCalledWith(
      2,
      PALETTE,
      { appearance: 'ghost' },
    )
    expect(scene.children).toContain(ghost.movementRoot)

    sandbox.updateGhost(GHOST_POSE, 1 / 30)

    expect(ghost.movementRoot.visible).toBe(true)
    expect(ghost.update).toHaveBeenCalledTimes(2)
    const [flight, pose] = ghost.update.mock.calls[1] ?? []
    expect(flight).toMatchObject({
      position: GHOST_POSE.position,
      headingRadians: GHOST_POSE.headingRadians,
      pitchRadians: GHOST_POSE.pitchRadians,
      bankRadians: GHOST_POSE.bankRadians,
      isBoosting: GHOST_POSE.boost,
    })
    expect(pose.wingFlapRadians).toBe(
      getGhostWingFlapRadians(GHOST_POSE.elapsedMs, GHOST_POSE.boost),
    )
    expect(camera.position).toEqual(cameraPosition)

    sandbox.updateGhost(null, 1 / 60)
    expect(ghost.movementRoot.visible).toBe(false)

    sandbox.dispose()
    expect(ghost.dispose).toHaveBeenCalledTimes(1)
    expect(scene.children).not.toContain(ghost.movementRoot)
  })
})
