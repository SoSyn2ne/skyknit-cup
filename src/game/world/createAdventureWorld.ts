import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createStaticPrelitMaterial, getStaticWorldLighting } from './staticPrelitMaterial'

import type { AdventureObjective, AdventureProgress } from '../adventure/adventureState'
import { ADVENTURE_HOME, ADVENTURE_POINTS, ADVENTURE_ROUTES, ADVENTURE_SEARCH_POINT_IDS } from '../adventure/adventureWorld'
import type { Vec3Value } from '../flight/flightModel'

export interface AdventureWorldContext {
  readonly visible: boolean
  readonly characterVisible?: boolean
  readonly simulationSeconds: number
  readonly position: Vec3Value
  readonly headingRadians: number
  readonly pitchRadians: number
  readonly bankRadians: number
  readonly objective: AdventureObjective
  readonly senseActive: boolean
  readonly competitionActive: boolean
}

export interface AdventureWorldSnapshot {
  readonly assetStatus: 'loading' | 'loaded' | 'error'
  readonly assetNodeNames: readonly string[]
  readonly worldVisible: boolean
  readonly meshCount: number
  readonly visibleRelayIds: readonly string[]
  readonly objectiveId: string | null
  readonly birdLocation: 'rescue' | 'following' | 'nest' | 'hidden'
  readonly birdPosition: Vec3Value | null
  readonly windmillRotationRadians: number
  readonly lanternsVisible: boolean
  readonly pennantsVisible: boolean
  readonly secretPathVisible: boolean
  readonly relicVisible: boolean
  readonly charmVisible: boolean
  readonly charmPosition: Vec3Value | null
  readonly guideMarkerCount: number
}

export interface AdventureWorldVisual {
  update(progress: AdventureProgress, context: AdventureWorldContext): void
  debugSnapshot(): AdventureWorldSnapshot
  dispose(): void
}

interface AdventureWorldOptions {
  readonly assetLoader?: { load(url: string): Promise<THREE.Group> }
}

const TEMPLATE_NAMES = ['Bird', 'BirdPerch', 'RelayDevice', 'Relic', 'Charm'] as const
const REQUIRED_NODE_NAMES = ['Terrain', 'Nest', 'WindmillTower', 'WindmillRotor', 'Keeper', 'Lanterns', 'Pennants', 'SecretPath', ...TEMPLATE_NAMES] as const
const GUIDE_CAPACITY = 10
const RUNE_CAPACITY = Object.values(ADVENTURE_ROUTES).reduce((count, route) => count + route.pointIds.length, 0) + ADVENTURE_SEARCH_POINT_IDS.length

// The other GLB owners keep this same deduplicated disposal policy private.
// All source meshes and clones here belong to one lifetime, including the charm.
function disposeObjects(root: THREE.Object3D, retainedMaterials: Iterable<THREE.Material> = []): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>(retainedMaterials)
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) texture.dispose()
  root.removeFromParent()
}

function setPosition(object: THREE.Object3D, position: Vec3Value): void {
  object.position.set(position.x, position.y, position.z)
}

export function createAdventureWorld(
  scene: THREE.Scene,
  options: AdventureWorldOptions = {},
): AdventureWorldVisual {
  const owner = new THREE.Group()
  owner.name = 'M46_AdventureVisuals'
  const world = new THREE.Group()
  world.name = 'M46_AdventureWorld'
  world.visible = false
  const home = new THREE.Group()
  home.name = 'M46_AdventureHome'
  setPosition(home, ADVENTURE_HOME.position)
  world.add(home)
  const charmPose = new THREE.Group()
  charmPose.name = 'M46_GuardianCharmPose'
  charmPose.visible = false
  owner.add(world, charmPose)
  scene.add(owner)

  const markerMaterial = new THREE.MeshBasicMaterial({
    name: 'M46_ObjectiveGold', color: 0xf2c14e, transparent: true,
    opacity: 0.92, depthWrite: false, depthTest: false, toneMapped: false,
  })
  const beacon = new THREE.Group()
  beacon.name = 'M46_ObjectiveBeacon'
  beacon.visible = false
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.16, 5, 28), markerMaterial)
  ring.name = 'M46_ObjectiveReticle'
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), markerMaterial)
  diamond.name = 'M46_ObjectiveDiamond'
  diamond.position.y = 5.6
  beacon.add(ring, diamond)
  world.add(beacon)
  const guideMaterial = new THREE.MeshBasicMaterial({
    name: 'M46_WindGuideGold', color: 0xf2c14e, transparent: true,
    opacity: 0.7, depthWrite: false, toneMapped: false,
  })
  const guides = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.4, 0), guideMaterial, GUIDE_CAPACITY)
  guides.name = 'M46_ObjectiveWindGuide'
  guides.count = 0
  guides.frustumCulled = false
  guides.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  world.add(guides)
  // Completed route devices retain their authored silhouette. One instanced
  // overlay carries all activation motion without spinning their stone bases.
  const runes = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshBasicMaterial({ name: 'M46_ActiveRune', color: 0x8ce8d3, toneMapped: false }),
    RUNE_CAPACITY,
  )
  runes.name = 'M46_ActivatedRunes'
  runes.count = 0
  runes.frustumCulled = false
  runes.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  world.add(runes)

  const scratch = new THREE.Object3D()
  const direction = new THREE.Vector3()
  const target = new THREE.Vector3()
  const birdOffset = new THREE.Vector3()
  const charmPosition = new THREE.Vector3()
  const nodes = new Map<string, THREE.Object3D>()
  const relays = new Map<string, THREE.Object3D>()
  const clues = new Map<string, THREE.Object3D>()
  const frontFaceMaterials = new Map<THREE.Material, THREE.Material>()
  const replacedStaticMaterials = new Set<THREE.Material>()
  let bird: THREE.Object3D | null = null
  let relic: THREE.Object3D | null = null
  let charm: THREE.Object3D | null = null
  let rotorBase = 0
  let disposed = false
  let assetStatus: AdventureWorldSnapshot['assetStatus'] = 'loading'
  let assetNodeNames: string[] = []
  let meshCount = 0
  let objectiveId: string | null = null
  let visibleRelayIds: string[] = []
  let birdLocation: AdventureWorldSnapshot['birdLocation'] = 'hidden'
  let lastUpdate: { progress: AdventureProgress; context: AdventureWorldContext } | null = null

  const addRune = (position: THREE.Vector3, time: number): void => {
    scratch.position.copy(position)
    scratch.position.y += 2.2 + Math.sin(time * 2) * 0.15
    scratch.rotation.set(0, time * 0.7, 0)
    scratch.scale.setScalar(1)
    scratch.updateMatrix()
    runes.setMatrixAt(runes.count, scratch.matrix)
    runes.count += 1
  }

  const update = (progress: AdventureProgress, context: AdventureWorldContext): void => {
    if (disposed) return
    lastUpdate = { progress, context }
    world.visible = context.visible
    const interactiveVisible = context.visible && !context.competitionActive
    const time = Number.isFinite(context.simulationSeconds) ? context.simulationSeconds : 0
    const rotor = nodes.get('WindmillRotor')
    if (rotor) rotor.rotation.z = rotorBase + (progress.windmillRepaired ? time * 0.82 : 0)
    const lanterns = nodes.get('Lanterns')
    if (lanterns) lanterns.visible = progress.placedDecorations.includes('lanterns')
    const pennants = nodes.get('Pennants')
    if (pennants) pennants.visible = progress.placedDecorations.includes('pennants')
    const secretPath = nodes.get('SecretPath')
    if (secretPath) secretPath.visible = progress.windmillRepaired

    if (bird) {
      bird.visible = context.visible
      if (progress.stage === 'return-bird') {
        birdLocation = 'following'
        birdOffset.set(2.6, 1.6 + Math.sin(time * 3) * 0.2, 2.4)
        birdOffset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -context.headingRadians)
        setPosition(bird, context.position)
        bird.position.add(birdOffset)
        bird.rotation.y = -context.headingRadians
      } else if (progress.stage === 'meet-keeper' || progress.stage === 'rescue-bird') {
        birdLocation = 'rescue'
        setPosition(bird, ADVENTURE_POINTS.rescue.position)
        bird.rotation.y = 0.4
      } else {
        birdLocation = 'nest'
        bird.position.set(ADVENTURE_HOME.position.x - 3, ADVENTURE_HOME.position.y + 1.7, ADVENTURE_HOME.position.z - 1)
        bird.rotation.y = -0.6
      }
      if (!context.visible) birdLocation = 'hidden'
    }

    visibleRelayIds = []
    runes.count = 0
    const routeIds: readonly string[] = progress.route === null ? [] : ADVENTURE_ROUTES[progress.route].pointIds
    for (const [id, relay] of relays) {
      const activated = progress.visitedPointIds.includes(id)
      relay.visible = interactiveVisible && routeIds.includes(id)
        && (progress.stage === 'route-flight' || activated)
      if (relay.visible) visibleRelayIds.push(id)
      if (relay.visible && activated) addRune(relay.position, time)
    }
    for (const [id, clue] of clues) {
      clue.visible = interactiveVisible && progress.stage === 'search-ruins'
        && !progress.ruinsRevealed && context.objective.id === id
      if (clue.visible && context.senseActive) addRune(clue.position, time)
    }
    if (runes.count > 0) runes.instanceMatrix.needsUpdate = true
    if (relic) {
      relic.visible = interactiveVisible && progress.ruinsRevealed && progress.stage === 'search-ruins'
    }

    charmPose.visible = progress.equippedCharm && (context.characterVisible ?? context.visible) && charm !== null
    setPosition(charmPose, context.position)
    charmPose.rotation.set(context.pitchRadians, -context.headingRadians, context.bankRadians, 'YXZ')

    objectiveId = interactiveVisible && context.objective.id !== 'complete' ? context.objective.id : null
    beacon.visible = objectiveId !== null
    guides.count = 0
    if (beacon.visible) {
      setPosition(beacon, context.objective.position)
      target.set(context.position.x, context.position.y, context.position.z)
      beacon.lookAt(target)
      const distance = target.distanceTo(beacon.position)
      beacon.scale.setScalar(Math.max(1, Math.min(3.5, distance / 120)))
      diamond.rotation.y = time * 0.9
      diamond.position.y = 5.6 + Math.sin(time * 2) * 0.2
      markerMaterial.color.setHex(context.senseActive && !context.competitionActive ? 0x8ce8d3 : 0xf2c14e)
      direction.copy(beacon.position).sub(target)
      const count = Math.min(GUIDE_CAPACITY, Math.floor(distance / 14))
      for (let index = 0; index < count; index += 1) {
        const fraction = (index + 1) / (count + 1)
        scratch.position.copy(target).addScaledVector(direction, fraction)
        scratch.position.y -= 1.1
        scratch.scale.setScalar(0.8 + fraction * 0.8)
        scratch.rotation.set(0, 0, 0)
        scratch.updateMatrix()
        guides.setMatrixAt(index, scratch.matrix)
      }
      guides.count = count
      if (count > 0) guides.instanceMatrix.needsUpdate = true
    }
  }

  const cloneTemplate = (name: typeof TEMPLATE_NAMES[number], instanceName: string, parent: THREE.Object3D): THREE.Object3D => {
    const clone = nodes.get(name)!.clone(true)
    clone.name = instanceName
    clone.visible = true
    clone.position.set(0, 0, 0)
    parent.add(clone)
    return clone
  }

  const loader = options.assetLoader ?? {
    load: async (url: string) => (await new GLTFLoader().loadAsync(url)).scene,
  }
  void loader.load(`${import.meta.env.BASE_URL}assets/models/world/adventure-hub.glb`).then((asset) => {
    if (disposed) {
      disposeObjects(asset)
      return
    }
    home.add(asset)
    asset.traverse((object) => {
      if (object.name) {
        assetNodeNames.push(object.name)
        nodes.set(object.name, object)
      }
      if (object instanceof THREE.Mesh) {
        meshCount += 1
        // Authored vertex colors carry depth; additional shadow passes cost more
        // than these small quest props contribute at the mobile camera distance.
        object.castShadow = false
        object.receiveShadow = false
      }
    })
    if (REQUIRED_NODE_NAMES.some((name) => !nodes.has(name))) {
      disposeObjects(asset)
      nodes.clear()
      assetNodeNames = []
      meshCount = 0
      assetStatus = 'error'
      return
    }
    // These authored floors, shingles and stone terraces have outward-facing
    // surfaces. Do not shade their hidden backs at the close landing camera.
    // Keep the original PBR response and shared template materials unchanged.
    const frontFaceMaterial = (material: THREE.Material): THREE.Material => {
      if (material.side !== THREE.DoubleSide || material.transparent) return material
      let front = frontFaceMaterials.get(material)
      if (!front) {
        front = material.clone()
        front.side = THREE.FrontSide
        frontFaceMaterials.set(material, front)
      }
      return front
    }
    for (const name of ['Terrain', 'Nest', 'SecretPath']) {
      const object = nodes.get(name)
      if (object instanceof THREE.Mesh) {
        object.material = Array.isArray(object.material)
          ? object.material.map(frontFaceMaterial) : frontFaceMaterial(object.material)
      }
    }
    const lighting = getStaticWorldLighting(scene)
    if (lighting) {
      const converted = new Map<THREE.Material, THREE.Material>()
      const convert = (source: THREE.Material): THREE.Material => {
        let material = converted.get(source)
        if (!material) {
          material = createStaticPrelitMaterial(source, lighting)
          converted.set(source, material)
          if (material !== source) replacedStaticMaterials.add(source)
        }
        return material
      }
      for (const name of ['Terrain', 'Nest', 'WindmillTower', 'Lanterns', 'Pennants', 'SecretPath']) {
        const object = nodes.get(name)
        if (object instanceof THREE.Mesh) {
          object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material)
        }
      }
    }
    rotorBase = nodes.get('WindmillRotor')!.rotation.z
    for (const name of TEMPLATE_NAMES) nodes.get(name)!.visible = false
    bird = cloneTemplate('Bird', 'M46_RescuedBird', world)
    const perch = cloneTemplate('BirdPerch', 'M46_RescuePerch', world)
    setPosition(perch, ADVENTURE_POINTS.rescue.position)
    for (const route of Object.values(ADVENTURE_ROUTES)) {
      for (const id of route.pointIds) {
        const relay = cloneTemplate('RelayDevice', `M46_Relay_${id}`, world)
        setPosition(relay, ADVENTURE_POINTS[id].position)
        relays.set(id, relay)
      }
    }
    for (const id of ADVENTURE_SEARCH_POINT_IDS) {
      const clue = cloneTemplate('RelayDevice', `M46_SenseClue_${id}`, world)
      setPosition(clue, ADVENTURE_POINTS[id].position)
      clue.scale.multiplyScalar(0.75)
      clues.set(id, clue)
    }
    relic = cloneTemplate('Relic', 'M46_HiddenRelic', world)
    setPosition(relic, ADVENTURE_POINTS.ruins.position)
    charm = cloneTemplate('Charm', 'M46_EquippedGuardianCharm', charmPose)
    charm.position.set(0, 0.7, 0.4)
    assetStatus = 'loaded'
    if (lastUpdate) update(lastUpdate.progress, lastUpdate.context)
  }).catch(() => {
    if (!disposed) assetStatus = 'error'
  })

  const isVisible = (name: string): boolean => world.visible && nodes.get(name)?.visible === true
  return {
    update,
    debugSnapshot: () => {
      if (charm) charm.getWorldPosition(charmPosition)
      return {
        assetStatus,
        assetNodeNames,
        worldVisible: world.visible,
        meshCount,
        visibleRelayIds,
        objectiveId,
        birdLocation,
        birdPosition: bird ? { x: bird.position.x, y: bird.position.y, z: bird.position.z } : null,
        windmillRotationRadians: nodes.get('WindmillRotor')?.rotation.z ?? 0,
        lanternsVisible: isVisible('Lanterns'),
        pennantsVisible: isVisible('Pennants'),
        secretPathVisible: isVisible('SecretPath'),
        relicVisible: world.visible && relic?.visible === true,
        charmVisible: charmPose.visible,
        charmPosition: charm ? { x: charmPosition.x, y: charmPosition.y, z: charmPosition.z } : null,
        guideMarkerCount: world.visible ? guides.count : 0,
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeObjects(owner, [...frontFaceMaterials.keys(), ...replacedStaticMaterials])
      frontFaceMaterials.clear()
      replacedStaticMaterials.clear()
      world.visible = false
      charmPose.visible = false
      nodes.clear()
      relays.clear()
      clues.clear()
      assetNodeNames = []
      visibleRelayIds = []
      objectiveId = null
      meshCount = 0
      birdLocation = 'hidden'
      bird = null
      relic = null
      charm = null
      lastUpdate = null
    },
  }
}
