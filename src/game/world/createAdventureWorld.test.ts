import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { EMPTY_ADVENTURE_PROGRESS, getAdventureObjective, type AdventureProgress } from '../adventure/adventureState'
import { ADVENTURE_HOME, ADVENTURE_POINTS, ADVENTURE_ROUTES } from '../adventure/adventureWorld'
import { createAdventureWorld, type AdventureWorldContext } from './createAdventureWorld'

const NODE_NAMES = ['Terrain', 'Nest', 'WindmillTower', 'WindmillRotor', 'Keeper', 'Lanterns', 'Pennants', 'SecretPath', 'Bird', 'BirdPerch', 'RelayDevice', 'Relic', 'Charm']

function createAsset(): THREE.Group {
  const asset = new THREE.Group()
  asset.name = 'AdventureRoot'
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial()
  for (const name of NODE_NAMES) {
    const node = new THREE.Mesh(geometry, material)
    node.name = name
    asset.add(node)
  }
  asset.getObjectByName('WindmillRotor')!.position.set(-19, 14, -12)
  return asset
}

function context(progress: AdventureProgress, overrides: Partial<AdventureWorldContext> = {}): AdventureWorldContext {
  return {
    visible: true,
    simulationSeconds: 0,
    position: ADVENTURE_HOME.position,
    headingRadians: 0,
    pitchRadians: 0,
    bankRadians: 0,
    objective: getAdventureObjective(progress),
    senseActive: false,
    competitionActive: false,
    ...overrides,
  }
}

async function loadWorld() {
  const scene = new THREE.Scene()
  const asset = createAsset()
  const world = createAdventureWorld(scene, { assetLoader: { load: async () => asset } })
  world.update(EMPTY_ADVENTURE_PROGRESS, context(EMPTY_ADVENTURE_PROGRESS))
  await Promise.resolve()
  await Promise.resolve()
  return { scene, asset, world }
}

describe('M46 adventure world presentation', () => {
  it('vertex-lights static structures without converting the guardian, keeper or moving quest props', async () => {
    const scene = new THREE.Scene()
    const hemisphere = new THREE.HemisphereLight(); hemisphere.name = 'RC7_DawnFillLight'
    const key = new THREE.DirectionalLight(); key.name = 'RC7_DawnKeyLight'
    const rim = new THREE.DirectionalLight(); rim.name = 'RC7_SkyRimLight'
    scene.add(hemisphere, key, rim)
    const asset = createAsset()
    const source = (asset.getObjectByName('Terrain') as THREE.Mesh).material as THREE.MeshStandardMaterial
    source.vertexColors = true
    const sourceDispose = vi.spyOn(source, 'dispose')
    const world = createAdventureWorld(scene, { assetLoader: { load: async () => asset } })
    await Promise.resolve(); await Promise.resolve()
    const surface = (asset.getObjectByName('Terrain') as THREE.Mesh).material
    expect(surface).toBeInstanceOf(THREE.MeshBasicMaterial)
    for (const name of ['Nest', 'WindmillTower', 'Lanterns', 'Pennants', 'SecretPath']) {
      expect((asset.getObjectByName(name) as THREE.Mesh).material).toBe(surface)
    }
    for (const name of ['Keeper', 'Bird', 'Charm', 'WindmillRotor', 'RelayDevice', 'Relic']) {
      expect((asset.getObjectByName(name) as THREE.Mesh).material).toBe(source)
    }
    expect(sourceDispose).not.toHaveBeenCalled()
    const convertedDispose = vi.spyOn(surface as THREE.Material, 'dispose')
    world.dispose()
    expect(sourceDispose).toHaveBeenCalledOnce()
    expect(convertedDispose).toHaveBeenCalledOnce()
  })
  it('culls hidden back faces only on closed home surfaces while preserving shared PBR colors and disposal', async () => {
    const scene = new THREE.Scene()
    const asset = createAsset()
    const source = (asset.getObjectByName('Terrain') as THREE.Mesh).material as THREE.MeshStandardMaterial
    source.side = THREE.DoubleSide
    source.vertexColors = true
    source.color.setHex(0xabcdef)
    const sourceDispose = vi.spyOn(source, 'dispose')
    const world = createAdventureWorld(scene, { assetLoader: { load: async () => asset } })
    await Promise.resolve()
    await Promise.resolve()
    const surface = (asset.getObjectByName('Terrain') as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(surface).not.toBe(source)
    expect(surface.isMeshStandardMaterial).toBe(true)
    expect(surface.side).toBe(THREE.FrontSide)
    expect(surface.color.getHex()).toBe(source.color.getHex())
    expect(surface.vertexColors).toBe(true)
    expect((asset.getObjectByName('Nest') as THREE.Mesh).material).toBe(surface)
    expect((asset.getObjectByName('SecretPath') as THREE.Mesh).material).toBe(surface)
    expect((asset.getObjectByName('Keeper') as THREE.Mesh).material).toBe(source)
    expect(source.side).toBe(THREE.DoubleSide)
    const surfaceDispose = vi.spyOn(surface, 'dispose')
    world.dispose()
    expect(sourceDispose).toHaveBeenCalledOnce()
    expect(surfaceDispose).toHaveBeenCalledOnce()
  })
  it('loads the authored hub at home and hides unused source templates', async () => {
    const { world, asset } = await loadWorld()
    expect(world.debugSnapshot().assetStatus).toBe('loaded')
    expect(world.debugSnapshot().assetNodeNames).toEqual(expect.arrayContaining(NODE_NAMES))
    expect(asset.parent!.position.toArray()).toEqual([-82, 6, 30])
    for (const name of ['Bird', 'BirdPerch', 'RelayDevice', 'Relic', 'Charm']) {
      expect(asset.getObjectByName(name)!.visible).toBe(false)
    }
    expect(world.debugSnapshot()).toMatchObject({
      windmillRotationRadians: 0,
      lanternsVisible: false,
      pennantsVisible: false,
      secretPathVisible: false,
      charmVisible: false,
      birdLocation: 'rescue',
    })
    world.dispose()
  })

  it('keeps the authored rescue perch in the world without attaching it to the following bird', async () => {
    const { world, scene } = await loadWorld()
    const perch = scene.getObjectByName('M46_RescuePerch')!
    expect(perch).toBeDefined()
    expect(perch.position.toArray()).toEqual(Object.values(ADVENTURE_POINTS.rescue.position))
    const returning = { ...EMPTY_ADVENTURE_PROGRESS, started: true, stage: 'return-bird' as const }
    world.update(returning, context(returning, { position: { x: 12, y: 25, z: -18 } }))
    expect(perch.position.toArray()).toEqual(Object.values(ADVENTURE_POINTS.rescue.position))
    expect(perch.parent?.name).toBe('M46_AdventureWorld')
    world.dispose()
  })

  it('moves the bird from its rescue point to the companion and finally the nest', async () => {
    const { world } = await loadWorld()
    expect(world.debugSnapshot().birdPosition).toMatchObject(ADVENTURE_POINTS.rescue.position)
    const returning = { ...EMPTY_ADVENTURE_PROGRESS, started: true, stage: 'return-bird' as const }
    world.update(returning, context(returning, { position: { x: 12, y: 25, z: -18 } }))
    expect(world.debugSnapshot().birdLocation).toBe('following')
    expect(world.debugSnapshot().birdPosition!.x).toBeCloseTo(14.6)
    const home = { ...returning, stage: 'choose-route' as const }
    world.update(home, context(home))
    expect(world.debugSnapshot().birdLocation).toBe('nest')
    expect(world.debugSnapshot().birdPosition!.x).toBeCloseTo(-85)
    world.dispose()
  })

  it('only displays devices from the chosen route', async () => {
    const { world } = await loadWorld()
    const progress = { ...EMPTY_ADVENTURE_PROGRESS, started: true, stage: 'route-flight' as const, route: 'ridge' as const }
    world.update(progress, context(progress))
    expect(world.debugSnapshot().visibleRelayIds).toEqual(ADVENTURE_ROUTES.ridge.pointIds)
    world.update(progress, context(progress, { competitionActive: true }))
    expect(world.debugSnapshot().objectiveId).toBeNull()
    expect(world.debugSnapshot().visibleRelayIds).toEqual([])
    world.dispose()
  })

  it('keeps activated devices as landmarks and animates only their rune overlay', async () => {
    const { world, scene } = await loadWorld()
    const id = ADVENTURE_ROUTES.ridge.pointIds[0]
    const progress = { ...EMPTY_ADVENTURE_PROGRESS, started: true, stage: 'route-flight' as const,
      route: 'ridge' as const, visitedPointIds: [id] }
    const saved = JSON.stringify(progress)
    world.update(progress, context(progress, { simulationSeconds: 1 }))
    expect(world.debugSnapshot().visibleRelayIds).toEqual(ADVENTURE_ROUTES.ridge.pointIds)
    const relay = scene.getObjectByName(`M46_Relay_${id}`)!
    const runes = scene.getObjectByName('M46_ActivatedRunes') as THREE.InstancedMesh
    expect(runes.count).toBe(1)
    const before = new THREE.Matrix4()
    const after = new THREE.Matrix4()
    runes.getMatrixAt(0, before)
    world.update(progress, context(progress, { simulationSeconds: 2 }))
    runes.getMatrixAt(0, after)
    expect(after.equals(before)).toBe(false)
    expect(relay.rotation.x).toBeCloseTo(0)
    expect(relay.rotation.y).toBeCloseTo(0)
    expect(relay.rotation.z).toBeCloseTo(0)
    expect(relay.position.toArray()).toEqual(Object.values(ADVENTURE_POINTS[id].position))
    const later = { ...progress, stage: 'search-ruins' as const }
    world.update(later, context(later))
    expect(world.debugSnapshot().visibleRelayIds).toEqual([id])
    expect(runes.count).toBe(1)
    world.update(later, context(later, { competitionActive: true }))
    expect(world.debugSnapshot().visibleRelayIds).toEqual([])
    expect(runes.count).toBe(0)
    expect(JSON.stringify(progress)).toBe(saved)
    world.dispose()
  })

  it('guides to the secret garden after repair and hides guidance only after its discovery', async () => {
    const { world, scene } = await loadWorld()
    const progress = { ...EMPTY_ADVENTURE_PROGRESS, started: true, stage: 'complete' as const, windmillRepaired: true }
    const garden = { ...ADVENTURE_POINTS.complete, id: 'secret-garden', position: { x: -22, y: 16, z: 70 } }
    world.update(progress, context(progress, { objective: garden }))
    expect(world.debugSnapshot()).toMatchObject({ secretPathVisible: true, objectiveId: 'secret-garden' })
    expect(world.debugSnapshot().guideMarkerCount).toBeGreaterThan(0)
    expect(scene.getObjectByName('M46_ObjectiveBeacon')!.position.toArray()).toEqual([-22, 16, 70])
    world.update(progress, context(progress, { objective: ADVENTURE_POINTS.complete }))
    expect(world.debugSnapshot().objectiveId).toBeNull()
    expect(world.debugSnapshot().guideMarkerCount).toBe(0)
    world.dispose()
  })

  it('keeps recovery and decoration visibility independent and animates the repaired rotor deterministically', async () => {
    const { world } = await loadWorld()
    const repaired = { ...EMPTY_ADVENTURE_PROGRESS, stage: 'complete' as const, windmillRepaired: true, placedDecorations: ['lanterns', 'pennants'] as const }
    world.update(repaired, context(repaired, { simulationSeconds: 2 }))
    expect(world.debugSnapshot()).toMatchObject({ lanternsVisible: true, pennantsVisible: true, secretPathVisible: true })
    const firstRotation = world.debugSnapshot().windmillRotationRadians
    expect(firstRotation).not.toBe(0)
    world.update(repaired, context(repaired, { simulationSeconds: 2 }))
    expect(world.debugSnapshot().windmillRotationRadians).toBe(firstRotation)
    world.update(repaired, context(repaired, { simulationSeconds: 3 }))
    expect(world.debugSnapshot().windmillRotationRadians).not.toBe(firstRotation)
    world.update({ ...repaired, placedDecorations: [] }, context(repaired))
    expect(world.debugSnapshot()).toMatchObject({ lanternsVisible: false, pennantsVisible: false, secretPathVisible: true })
    world.dispose()
  })

  it('does not reveal the relic before sense or during a record competition', async () => {
    const { world } = await loadWorld()
    const searching = { ...EMPTY_ADVENTURE_PROGRESS, started: true, stage: 'search-ruins' as const }
    world.update(searching, context(searching))
    expect(world.debugSnapshot().relicVisible).toBe(false)
    const revealed = { ...searching, ruinsRevealed: true }
    world.update(revealed, context(revealed))
    expect(world.debugSnapshot().relicVisible).toBe(true)
    world.update(revealed, context(revealed, { competitionActive: true, senseActive: true }))
    expect(world.debugSnapshot().relicVisible).toBe(false)
    expect(world.debugSnapshot().objectiveId).toBeNull()
    world.dispose()
  })

  it('attaches the earned cosmetic to the live guardian pose even in competition without affecting state', async () => {
    const { world, scene } = await loadWorld()
    const progress = { ...EMPTY_ADVENTURE_PROGRESS, equippedCharm: true }
    const original = JSON.stringify(progress)
    world.update(progress, context(progress, {
      visible: false,
      characterVisible: true,
      competitionActive: true,
      position: { x: 12, y: 25, z: -18 },
      headingRadians: Math.PI / 2,
      pitchRadians: 0.15,
      bankRadians: -0.2,
    }))
    expect(world.debugSnapshot().charmVisible).toBe(true)
    const follower = scene.getObjectByName('M46_GuardianCharmPose')!
    expect(follower.position.toArray()).toEqual([12, 25, -18])
    expect(follower.rotation.y).toBeCloseTo(-Math.PI / 2)
    expect(follower.rotation.x).toBeCloseTo(0.15)
    expect(follower.rotation.z).toBeCloseTo(-0.2)
    expect(JSON.stringify(progress)).toBe(original)
    world.dispose()
  })

  it('does not traverse the asset on a steady-state frame', async () => {
    const { world } = await loadWorld()
    const traverse = vi.spyOn(THREE.Object3D.prototype, 'traverse')
    world.update(EMPTY_ADVENTURE_PROGRESS, context(EMPTY_ADVENTURE_PROGRESS, { simulationSeconds: 1 }))
    world.debugSnapshot()
    expect(traverse).not.toHaveBeenCalled()
    traverse.mockRestore()
    world.dispose()
  })

  it('disposes shared source/clone geometry and material only once', async () => {
    const { world, scene, asset } = await loadWorld()
    const source = asset.getObjectByName('Bird') as THREE.Mesh
    const geometryDispose = vi.spyOn(source.geometry, 'dispose')
    const materialDispose = vi.spyOn(source.material as THREE.Material, 'dispose')
    world.dispose()
    world.dispose()
    expect(scene.children).toHaveLength(0)
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
  })

  it('disposes late loaded assets without reattaching them after teardown', async () => {
    let finishLoad!: (asset: THREE.Group) => void
    const scene = new THREE.Scene()
    const world = createAdventureWorld(scene, { assetLoader: { load: () => new Promise((resolve) => { finishLoad = resolve }) } })
    world.dispose()
    const asset = createAsset()
    const geometryDispose = vi.spyOn((asset.children[0] as THREE.Mesh).geometry, 'dispose')
    finishLoad(asset)
    await Promise.resolve()
    await Promise.resolve()
    expect(scene.children).toHaveLength(0)
    expect(geometryDispose).toHaveBeenCalledOnce()
  })

  it('reports load errors without rejected promises or fake successful asset state', async () => {
    const world = createAdventureWorld(new THREE.Scene(), { assetLoader: { load: async () => { throw new Error('load failed') } } })
    await Promise.resolve()
    await Promise.resolve()
    expect(world.debugSnapshot().assetStatus).toBe('error')
    world.dispose()
  })
})
