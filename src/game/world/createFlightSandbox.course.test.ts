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
    debugSnapshot: vi.fn(() => ({})),
  }),
}))

import { createInitialFlightState } from '../flight/flightModel'
import { resolveRenderQuality } from '../quality/qualityPolicy'
import {
  createFlightSandbox,
  type FlightSandboxPalette,
} from './createFlightSandbox'
import {
  SKYKNOT_COURSE,
  VOLCANIC_ARCHIPELAGO_COURSE,
} from './course'

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

function createMockDragon() {
  const movementRoot = new THREE.Group()
  movementRoot.name = 'M39_CourseSwitchPlayer'
  return {
    movementRoot,
    ready: Promise.resolve('fallback' as const),
    update: vi.fn(),
    setShadows: vi.fn(),
    setVolcanicReaction: vi.fn(),
    debugSnapshot: vi.fn(() => ({})),
    dispose: vi.fn(() => movementRoot.removeFromParent()),
  }
}

describe('flight sandbox course switching', () => {
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

  it('rebuilds only course gates when switching from Skyknot to the volcanic course', () => {
    const player = createMockDragon()
    dragonFactoryMock.create.mockReturnValue(player)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const quality = resolveRenderQuality({
      preference: 'low',
      coarsePointer: false,
      viewportWidth: 1_280,
      devicePixelRatio: 1,
    })
    const sandbox = createFlightSandbox(
      scene,
      camera,
      PALETTE,
      quality,
      SKYKNOT_COURSE,
    )
    const flight = createInitialFlightState({
      position: { x: 0, y: 18, z: -700 },
    })
    sandbox.step(flight, 0, 0, 0, 0, 'race')

    const initialGates = scene.children.filter((child) =>
      child.name.startsWith('M2_CourseGate_'),
    )
    const passWave = scene.getObjectByName('M3_GatePassWave')
    const windThreads = [
      scene.getObjectByName('RC7_WindThreadHaloLeft'),
      scene.getObjectByName('RC7_WindThreadCoreLeft'),
      scene.getObjectByName('RC7_WindThreadHaloRight'),
      scene.getObjectByName('RC7_WindThreadCoreRight'),
    ]
    const cameraPosition = camera.position.clone()
    const cameraQuaternion = camera.quaternion.clone()
    const cameraFov = camera.fov

    expect(initialGates).toHaveLength(6)
    expect(sandbox.debugSnapshot?.(flight)).toMatchObject({
      activeGateIndex: 0,
      checkpointCount: 6,
    })

    sandbox.setCourse(VOLCANIC_ARCHIPELAGO_COURSE)

    const volcanicGates = scene.children.filter(
      (child) =>
        child.name.startsWith('M2_CoolingSeal_') ||
        child.name.startsWith('M2_EscapeGate_'),
    )
    expect(volcanicGates.map(({ name }) => name)).toEqual([
      'M2_CoolingSeal_01',
      'M2_CoolingSeal_02',
      'M2_CoolingSeal_03',
      'M2_EscapeGate_04',
    ])
    expect(initialGates.every(({ parent }) => parent === null)).toBe(true)
    expect(dragonFactoryMock.create).toHaveBeenCalledTimes(1)
    expect(scene.getObjectByName(player.movementRoot.name)).toBe(
      player.movementRoot,
    )
    expect(scene.getObjectByName('M3_GatePassWave')).toBe(passWave)
    for (const windThread of windThreads) {
      expect(windThread).toBeDefined()
      expect(scene.children).toContain(windThread)
    }
    expect(camera.position).toEqual(cameraPosition)
    expect(camera.quaternion.angleTo(cameraQuaternion)).toBeCloseTo(0, 10)
    expect(camera.fov).toBe(cameraFov)
    expect(sandbox.debugSnapshot?.(flight)).toMatchObject({
      activeGateIndex: 0,
      checkpointCount: 4,
      gatePassWaveActive: false,
    })

    expect(() => {
      sandbox.dispose()
      sandbox.setCourse(SKYKNOT_COURSE)
      sandbox.dispose()
    }).not.toThrow()
    expect(player.dispose).toHaveBeenCalledTimes(1)
    expect(volcanicGates.every(({ parent }) => parent === null)).toBe(true)
  })

  it('gives the active gate a dedicated approach halo without changing course state', () => {
    const player = createMockDragon()
    dragonFactoryMock.create.mockReturnValue(player)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const quality = resolveRenderQuality({
      preference: 'low',
      coarsePointer: false,
      viewportWidth: 1_280,
      devicePixelRatio: 1,
    })
    const sandbox = createFlightSandbox(
      scene,
      camera,
      PALETTE,
      quality,
      SKYKNOT_COURSE,
    )
    const flight = createInitialFlightState({
      position: { x: 0, y: 18, z: -700 },
    })

    sandbox.step(flight, 1, 1 / 60, 0, 0, 'race')

    const activeGate = scene.getObjectByName('M2_CourseGate_01')
    const approachHalo = activeGate?.getObjectByName('M42_GateApproachHalo')

    expect(approachHalo).toBeInstanceOf(THREE.Mesh)
    expect(
      (approachHalo as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
      >).material.opacity,
    ).toBeGreaterThan(0.15)
    expect(sandbox.debugSnapshot?.(flight)).toMatchObject({
      activeGateIndex: 0,
      checkpointCount: 6,
    })

    sandbox.dispose()
  })
})
