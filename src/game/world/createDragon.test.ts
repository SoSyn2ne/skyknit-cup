import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loaderMock = vi.hoisted(() => ({
  loadAsync: vi.fn(),
}))

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(url: string): Promise<{ scene: THREE.Group }> {
      return loaderMock.loadAsync(url)
    }
  },
}))

import {
  createDragon,
  GHOST_DRAGON_VISUAL_SPEC,
  type DragonPalette,
} from './createDragon'
import { createInitialFlightState } from '../flight/flightModel'
import type { DragonPoseState } from './dragonPose'

const PALETTE: DragonPalette = {
  ink: '#171820',
  dragonEmber: '#c84c38',
  wingGold: '#f4cc65',
  collisionCoral: '#ff766d',
}

const DEFAULT_LOADOUT = {
  characterId: 'sunrise-dragon',
  paletteId: 'sunrise',
  accessoryId: 'none',
} as const

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

const GUARDIAN_TEST_POSE = {
  shoulderBankRadians: 0.16,
  bodyBankRadians: 0.11,
  headPitchRadians: 0.3,
  wingFoldRadians: 0.1,
  wingFlapRadians: 0.2,
  tailYawRadians: [0.2, 0.16, 0.12, 0.08, 0.04],
  recoilRadians: 0,
  breathScale: 1.02,
  blinkAmount: 0,
  jawOpenRadians: 0.08,
} satisfies DragonPoseState

function createValidDragonAsset(): THREE.Group {
  const scene = new THREE.Group()
  const bodyRoot = new THREE.Group()
  bodyRoot.name = 'DragonRoot'
  scene.add(bodyRoot)

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ba4338' })
  bodyMaterial.name = 'Dragon_Ember'
  bodyMaterial.vertexColors = true
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), bodyMaterial)
  body.name = 'Dragon_Body'
  bodyRoot.add(body)

  const wingMaterial = new THREE.MeshStandardMaterial({ color: '#e9b84c' })
  wingMaterial.name = 'Dragon_WingGold'
  wingMaterial.vertexColors = true
  for (const side of ['L', 'R'] as const) {
    const wing = new THREE.Group()
    wing.name = `WingRig_${side}`
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      wingMaterial,
    )
    mesh.name = `Dragon_Wing_${side}`
    wing.add(mesh)
    bodyRoot.add(wing)
  }

  const head = new THREE.Group()
  head.name = 'HeadRig'
  bodyRoot.add(head)
  for (let index = 1; index <= 5; index += 1) {
    const tail = new THREE.Group()
    tail.name = `TailRig_${index}`
    bodyRoot.add(tail)
  }

  return scene
}

function createRoleCharacterAsset(): {
  readonly scene: THREE.Group
  readonly sourceMaterials: {
    readonly body: THREE.MeshStandardMaterial
    readonly wing: THREE.MeshStandardMaterial
    readonly glow: THREE.MeshStandardMaterial
  }
} {
  const scene = createValidDragonAsset()
  const body = scene.getObjectByName('Dragon_Body') as THREE.Mesh
  const leftWing = scene.getObjectByName('Dragon_Wing_L') as THREE.Mesh
  const rightWing = scene.getObjectByName('Dragon_Wing_R') as THREE.Mesh
  const bodyMaterial = body.material as THREE.MeshStandardMaterial
  const wingMaterial = leftWing.material as THREE.MeshStandardMaterial
  rightWing.material = wingMaterial

  const glowMaterial = new THREE.MeshStandardMaterial({
    color: '#19384a',
    emissive: '#19384a',
  })
  glowMaterial.name = 'M_Rune_Teal'
  const glow = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.1),
    glowMaterial,
  )
  glow.name = 'Character_GlowRune'
  scene.getObjectByName('HeadRig')?.add(glow)

  return {
    scene,
    sourceMaterials: {
      body: bodyMaterial,
      wing: wingMaterial,
      glow: glowMaterial,
    },
  }
}

function createAccessoryAsset(name: string): THREE.Group {
  const root = new THREE.Group()
  root.name = name
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: '#f7df8d' }),
  )
  mesh.name = `${name}_Mesh`
  root.add(mesh)
  return root
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return meshes
}

describe('Sky League ghost dragon appearance', () => {
  beforeEach(() => {
    loaderMock.loadAsync.mockReset()
    vi.stubGlobal('window', { location: { search: '' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the default player names, opaque materials, and shadow control', async () => {
    loaderMock.loadAsync.mockRejectedValue(new Error('fallback'))

    const dragon = createDragon(PALETTE)

    await expect(dragon.ready).resolves.toBe('fallback')
    expect(dragon.movementRoot.name).toBe('M3_DragonMovementRoot')
    expect(
      dragon.movementRoot.getObjectByName('M3_DragonFallback'),
    ).toBeDefined()

    dragon.setShadows(true)
    const meshes = collectMeshes(dragon.movementRoot)
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every((mesh) => mesh.castShadow)).toBe(true)
    expect(
      meshes.every((mesh) => {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        return materials.every(
          (material) => !material.transparent && material.depthWrite,
        )
      }),
    ).toBe(true)
  })

  it('renders the fallback as a translucent teal and gold no-shadow ghost', async () => {
    loaderMock.loadAsync.mockRejectedValue(new Error('fallback'))

    const dragon = createDragon(PALETTE, { appearance: 'ghost' })

    await expect(dragon.ready).resolves.toBe('fallback')
    expect(dragon.movementRoot.name).toBe(
      'M33_SkyLeagueGhostDragonMovementRoot',
    )
    const fallback = dragon.movementRoot.getObjectByName(
      'M33_SkyLeagueGhostDragonFallback',
    )
    expect(fallback).toBeDefined()

    dragon.setShadows(true)
    const meshes = collectMeshes(dragon.movementRoot)
    const colors = new Set<number>()
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(false)
      expect(mesh.receiveShadow).toBe(false)
      expect(mesh.renderOrder).toBe(GHOST_DRAGON_VISUAL_SPEC.renderOrder)
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        expect(material.transparent).toBe(true)
        expect(material.opacity).toBe(GHOST_DRAGON_VISUAL_SPEC.opacity)
        expect(material.depthWrite).toBe(false)
        expect(material.blending).toBe(THREE.NormalBlending)
        if (material instanceof THREE.MeshStandardMaterial) {
          colors.add(material.color.getHex())
        }
      }
    }
    expect(colors).toContain(new THREE.Color(PALETTE.wingGold).getHex())
    expect(colors).toContain(
      new THREE.Color(GHOST_DRAGON_VISUAL_SPEC.teal).getHex(),
    )
    expect(dragon.debugSnapshot()).toMatchObject({
      appearance: 'ghost',
      shadowsEnabled: false,
    })
  })

  it('restyles loaded GLB materials and disposes the ghost exactly once', async () => {
    const asset = createValidDragonAsset()
    loaderMock.loadAsync.mockResolvedValue({ scene: asset })

    const dragon = createDragon(PALETTE, { appearance: 'ghost' })

    await expect(dragon.ready).resolves.toBe('glb')
    expect(
      dragon.movementRoot.getObjectByName(
        'M33_SkyLeagueGhostDragonAsset',
      ),
    ).toBe(asset)

    const meshes = collectMeshes(asset)
    expect(meshes).toHaveLength(3)
    expect(
      meshes.every((mesh) => {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        return materials.every(
          (material) =>
            material.transparent &&
            material.opacity === GHOST_DRAGON_VISUAL_SPEC.opacity &&
            !material.depthWrite &&
            (!(material instanceof THREE.MeshStandardMaterial) ||
              !material.vertexColors),
        )
      }),
    ).toBe(true)

    let geometryDisposals = 0
    let materialDisposals = 0
    for (const mesh of meshes) {
      mesh.geometry.addEventListener('dispose', () => {
        geometryDisposals += 1
      })
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        material.addEventListener('dispose', () => {
          materialDisposals += 1
        })
      }
    }

    dragon.dispose()
    const disposalCounts = { geometryDisposals, materialDisposals }
    expect(dragon.movementRoot.children).toHaveLength(0)
    expect(geometryDisposals).toBeGreaterThan(0)
    expect(materialDisposals).toBeGreaterThan(0)

    dragon.dispose()
    expect({ geometryDisposals, materialDisposals }).toEqual(
      disposalCounts,
    )
  })
})

describe('Milestone 38 guardian visual contract', () => {
  beforeEach(() => {
    loaderMock.loadAsync.mockReset()
    vi.stubGlobal('window', { location: { search: '' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps each character id to its own GLB asset', async () => {
    loaderMock.loadAsync.mockImplementation(async () => ({
      scene: createValidDragonAsset(),
    }))

    const dragons = [
      createDragon(PALETTE, { loadout: DEFAULT_LOADOUT }),
      createDragon(PALETTE, {
        loadout: { ...PHOENIX_LOADOUT, accessoryId: 'none' },
      }),
      createDragon(PALETTE, {
        loadout: { ...WHITE_TIGER_LOADOUT, accessoryId: 'none' },
      }),
    ]

    await Promise.all(dragons.map((dragon) => dragon.ready))
    const requestedUrls = loaderMock.loadAsync.mock.calls.map(
      ([url]) => url as string,
    )

    expect(requestedUrls).toEqual([
      expect.stringMatching(/assets\/models\/characters\/skyknit-dragon\.glb$/),
      expect.stringMatching(/assets\/models\/characters\/skyknit-phoenix\.glb$/),
      expect.stringMatching(/assets\/models\/characters\/skyknit-white-tiger\.glb$/),
    ])
    expect(new Set(requestedUrls).size).toBe(3)
  })

  it('applies the selected palette only to cloned role materials', async () => {
    const asset = createRoleCharacterAsset()
    const originalColors = {
      body: asset.sourceMaterials.body.color.getHex(),
      wing: asset.sourceMaterials.wing.color.getHex(),
      glow: asset.sourceMaterials.glow.color.getHex(),
    }
    const sourceDisposals = { body: 0, wing: 0, glow: 0 }
    for (const role of ['body', 'wing', 'glow'] as const) {
      asset.sourceMaterials[role].addEventListener('dispose', () => {
        sourceDisposals[role] += 1
      })
    }
    const globalPaletteBefore = { ...PALETTE }
    loaderMock.loadAsync.mockResolvedValue({ scene: asset.scene })

    const dragon = createDragon(PALETTE, {
      loadout: {
        characterId: 'sunrise-dragon',
        paletteId: 'moonlight',
        accessoryId: 'none',
      },
    })

    await expect(dragon.ready).resolves.toBe('glb')
    const loadedBody = dragon.movementRoot.getObjectByName(
      'Dragon_Body',
    ) as THREE.Mesh
    const loadedWing = dragon.movementRoot.getObjectByName(
      'Dragon_Wing_L',
    ) as THREE.Mesh
    const loadedGlow = dragon.movementRoot.getObjectByName(
      'Character_GlowRune',
    ) as THREE.Mesh
    const bodyMaterial = loadedBody.material as THREE.MeshStandardMaterial
    const wingMaterial = loadedWing.material as THREE.MeshStandardMaterial
    const glowMaterial = loadedGlow.material as THREE.MeshStandardMaterial

    expect(bodyMaterial).not.toBe(asset.sourceMaterials.body)
    expect(wingMaterial).not.toBe(asset.sourceMaterials.wing)
    expect(glowMaterial).not.toBe(asset.sourceMaterials.glow)
    expect(asset.sourceMaterials.body.color.getHex()).toBe(
      originalColors.body,
    )
    expect(asset.sourceMaterials.wing.color.getHex()).toBe(
      originalColors.wing,
    )
    expect(asset.sourceMaterials.glow.color.getHex()).toBe(
      originalColors.glow,
    )
    expect(bodyMaterial.color.getHex()).not.toBe(originalColors.body)
    expect(wingMaterial.color.getHex()).not.toBe(originalColors.wing)
    expect(glowMaterial.color.getHex()).not.toBe(originalColors.glow)
    expect(bodyMaterial.vertexColors).toBe(true)
    expect(wingMaterial.vertexColors).toBe(true)
    expect(
      new Set([
        bodyMaterial.color.getHex(),
        wingMaterial.color.getHex(),
        glowMaterial.color.getHex(),
      ]).size,
    ).toBe(3)
    expect(PALETTE).toEqual(globalPaletteBefore)
    expect(sourceDisposals).toEqual({ body: 1, wing: 1, glow: 1 })
  })

  it('preserves the white tiger fur identity when applying a palette', async () => {
    const asset = createRoleCharacterAsset()
    asset.sourceMaterials.body.color.set('#f2f2ee')
    loaderMock.loadAsync.mockResolvedValue({ scene: asset.scene })

    const tiger = createDragon(PALETTE, {
      loadout: {
        characterId: 'storm-white-tiger',
        paletteId: 'sunrise',
        accessoryId: 'none',
      },
    })

    await expect(tiger.ready).resolves.toBe('glb')
    const body = tiger.movementRoot.getObjectByName(
      'Dragon_Body',
    ) as THREE.Mesh
    const material = body.material as THREE.MeshStandardMaterial
    const expected = new THREE.Color('#f2f2ee').lerp(
      new THREE.Color('#d94a32'),
      0.18,
    )
    expect(material.color.r).toBeCloseTo(expected.r, 5)
    expect(material.color.g).toBeCloseTo(expected.g, 5)
    expect(material.color.b).toBeCloseTo(expected.b, 5)
  })

  it('applies species motion profiles without changing the shared flight state', async () => {
    loaderMock.loadAsync.mockImplementation(async () => ({
      scene: createValidDragonAsset(),
    }))
    const flight = createInitialFlightState({
      position: { x: 7, y: 11, z: -3 },
      headingRadians: 0.4,
    })
    const flightBefore = structuredClone(flight)
    const dragon = createDragon(PALETTE, { loadout: DEFAULT_LOADOUT })
    const phoenix = createDragon(PALETTE, {
      loadout: { ...PHOENIX_LOADOUT, accessoryId: 'none' },
    })
    const tiger = createDragon(PALETTE, {
      loadout: { ...WHITE_TIGER_LOADOUT, accessoryId: 'none' },
    })

    await Promise.all([dragon.ready, phoenix.ready, tiger.ready])
    dragon.update(flight, GUARDIAN_TEST_POSE)
    phoenix.update(flight, GUARDIAN_TEST_POSE)
    tiger.update(flight, GUARDIAN_TEST_POSE)

    const dragonWing = dragon.movementRoot.getObjectByName('WingRig_L')
    const phoenixWing = phoenix.movementRoot.getObjectByName('WingRig_L')
    const tigerWing = tiger.movementRoot.getObjectByName('WingRig_L')
    const dragonHead = dragon.movementRoot.getObjectByName('HeadRig')
    const phoenixHead = phoenix.movementRoot.getObjectByName('HeadRig')
    const tigerHead = tiger.movementRoot.getObjectByName('HeadRig')
    const dragonTail = dragon.movementRoot.getObjectByName('TailRig_1')
    const phoenixTail = phoenix.movementRoot.getObjectByName('TailRig_1')
    const tigerTail = tiger.movementRoot.getObjectByName('TailRig_1')
    const dragonPoseRoot = dragon.movementRoot.getObjectByName(
      'M3_DragonPoseRoot',
    )
    const phoenixPoseRoot = phoenix.movementRoot.getObjectByName(
      'M3_DragonPoseRoot',
    )
    const tigerPoseRoot = tiger.movementRoot.getObjectByName(
      'M3_DragonPoseRoot',
    )
    const dragonBody = dragon.movementRoot.getObjectByName('DragonRoot')
    const phoenixBody = phoenix.movementRoot.getObjectByName('DragonRoot')
    const tigerBody = tiger.movementRoot.getObjectByName('DragonRoot')

    expect(dragonWing?.rotation.z).toBeCloseTo(0.3, 5)
    expect(phoenixWing?.rotation.z).toBeCloseTo(0.318, 5)
    expect(tigerWing?.rotation.z).toBeCloseTo(0.274, 5)
    expect(dragonHead?.rotation.x).toBeCloseTo(0.3, 5)
    expect(phoenixHead?.rotation.x).toBeCloseTo(0.24, 5)
    expect(tigerHead?.rotation.x).toBeCloseTo(0.18, 5)
    expect(dragonTail?.rotation.y).toBeCloseTo(0.2, 5)
    expect(phoenixTail?.rotation.y).toBeCloseTo(0.25, 5)
    expect(tigerTail?.rotation.y).toBeCloseTo(0.18, 5)
    expect(dragonPoseRoot?.position.y).toBeCloseTo(0.016, 5)
    expect(phoenixPoseRoot?.position.y).toBeCloseTo(0.0072, 5)
    expect(tigerPoseRoot?.position.y).toBeCloseTo(0.00288, 5)
    expect(dragonPoseRoot?.scale.y).toBeCloseTo(1.02, 5)
    expect(phoenixPoseRoot?.scale.y).toBeCloseTo(1.0156, 5)
    expect(tigerPoseRoot?.scale.y).toBeCloseTo(1.008, 5)
    expect(
      (dragonPoseRoot?.rotation.z ?? 0) +
        (dragonBody?.rotation.z ?? 0),
    ).toBeCloseTo(0.11, 5)
    expect(
      (phoenixPoseRoot?.rotation.z ?? 0) +
        (phoenixBody?.rotation.z ?? 0),
    ).toBeCloseTo(0.099, 5)
    expect(
      (tigerPoseRoot?.rotation.z ?? 0) +
        (tigerBody?.rotation.z ?? 0),
    ).toBeCloseTo(0.0495, 5)
    expect(dragon.movementRoot.position.toArray()).toEqual([7, 11, -3])
    expect(phoenix.movementRoot.position.toArray()).toEqual([7, 11, -3])
    expect(tiger.movementRoot.position.toArray()).toEqual([7, 11, -3])
    expect(flight).toEqual(flightBefore)
  })

  it('loads no accessory asset for the none selection', async () => {
    loaderMock.loadAsync.mockResolvedValue({
      scene: createValidDragonAsset(),
    })

    const dragon = createDragon(PALETTE, { loadout: DEFAULT_LOADOUT })

    await expect(dragon.ready).resolves.toBe('glb')
    expect(loaderMock.loadAsync).toHaveBeenCalledTimes(1)
    expect(
      dragon.movementRoot.getObjectByName('M37_WindGogglesAsset'),
    ).toBeUndefined()
    expect(
      dragon.movementRoot.getObjectByName('M37_FestivalRibbonAsset'),
    ).toBeUndefined()
  })

  it('attaches wind goggles to the loaded character head', async () => {
    loaderMock.loadAsync.mockImplementation(async (url: string) => ({
      scene: url.endsWith('wind-goggles.glb')
        ? createAccessoryAsset('M37_WindGogglesAsset')
        : createValidDragonAsset(),
    }))

    const dragon = createDragon(PALETTE, { loadout: PHOENIX_LOADOUT })

    await expect(dragon.ready).resolves.toBe('glb')
    const goggles = dragon.movementRoot.getObjectByName(
      'M37_WindGogglesAsset',
    )
    expect(loaderMock.loadAsync).toHaveBeenCalledWith(
      expect.stringMatching(/assets\/models\/characters\/wind-goggles\.glb$/),
    )
    expect(goggles).toBeDefined()
    expect(['AccessorySocket_Head', 'HeadRig']).toContain(
      goggles?.parent?.name,
    )
  })

  it('attaches the festival ribbon to the loaded character tail', async () => {
    loaderMock.loadAsync.mockImplementation(async (url: string) => ({
      scene: url.endsWith('festival-ribbon.glb')
        ? createAccessoryAsset('M37_FestivalRibbonAsset')
        : createValidDragonAsset(),
    }))

    const dragon = createDragon(PALETTE, { loadout: WHITE_TIGER_LOADOUT })

    await expect(dragon.ready).resolves.toBe('glb')
    const ribbon = dragon.movementRoot.getObjectByName(
      'M37_FestivalRibbonAsset',
    )
    expect(loaderMock.loadAsync).toHaveBeenCalledWith(
      expect.stringMatching(
        /assets\/models\/characters\/festival-ribbon\.glb$/,
      ),
    )
    expect(ribbon).toBeDefined()
    expect(['AccessorySocket_Tail', 'TailRig_5']).toContain(
      ribbon?.parent?.name,
    )
  })

  it('reports the active loadout and loaded source in its debug snapshot', async () => {
    loaderMock.loadAsync.mockImplementation(async (url: string) => ({
      scene: url.endsWith('wind-goggles.glb')
        ? createAccessoryAsset('M37_WindGogglesAsset')
        : createValidDragonAsset(),
    }))

    const dragon = createDragon(PALETTE, { loadout: PHOENIX_LOADOUT })

    await expect(dragon.ready).resolves.toBe('glb')
    expect(dragon.debugSnapshot()).toMatchObject({
      loadout: PHOENIX_LOADOUT,
      source: 'glb',
    })
  })
})
