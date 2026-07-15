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

const GRIFFIN_LOADOUT = {
  characterId: 'storm-griffin',
  paletteId: 'moonlight',
  accessoryId: 'wind-goggles',
} as const

const MANTA_LOADOUT = {
  characterId: 'cloud-manta',
  paletteId: 'storm',
  accessoryId: 'festival-ribbon',
} as const

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

describe('Milestone 37 character visual contract', () => {
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
        loadout: { ...GRIFFIN_LOADOUT, accessoryId: 'none' },
      }),
      createDragon(PALETTE, {
        loadout: { ...MANTA_LOADOUT, accessoryId: 'none' },
      }),
    ]

    await Promise.all(dragons.map((dragon) => dragon.ready))
    const requestedUrls = loaderMock.loadAsync.mock.calls.map(
      ([url]) => url as string,
    )

    expect(requestedUrls).toEqual([
      expect.stringMatching(/assets\/models\/characters\/skyknit-dragon\.glb$/),
      expect.stringMatching(/assets\/models\/characters\/skyknit-griffin\.glb$/),
      expect.stringMatching(/assets\/models\/characters\/skyknit-manta\.glb$/),
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

    const dragon = createDragon(PALETTE, { loadout: GRIFFIN_LOADOUT })

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

    const dragon = createDragon(PALETTE, { loadout: MANTA_LOADOUT })

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

    const dragon = createDragon(PALETTE, { loadout: GRIFFIN_LOADOUT })

    await expect(dragon.ready).resolves.toBe('glb')
    expect(dragon.debugSnapshot()).toMatchObject({
      loadout: GRIFFIN_LOADOUT,
      source: 'glb',
    })
  })
})
