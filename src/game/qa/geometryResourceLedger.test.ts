import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Scene,
} from 'three'
import { describe, expect, it, vi } from 'vitest'

import { GeometryResourceLedger } from './geometryResourceLedger'

function invokeBeforeRender(object: Mesh, scene: Scene) {
  const args = [
    null,
    scene,
    null,
    object.geometry,
    object.material,
    null,
  ] as unknown as Parameters<typeof object.onBeforeRender>
  object.onBeforeRender(...args)
}

function invokeBeforeShadow(object: Mesh, scene: Scene) {
  const args = [
    null,
    scene,
    null,
    null,
    object.geometry,
    object.material,
    null,
  ] as unknown as Parameters<typeof object.onBeforeShadow>
  object.onBeforeShadow(...args)
}

describe('GeometryResourceLedger', () => {
  it('inventories attached mesh, line, points, and instanced geometries', () => {
    const scene = new Scene()
    const owner = new Group()
    owner.name = 'VolcanicRegion'
    scene.add(owner)

    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const line = new Line(new BoxGeometry(), new LineBasicMaterial())
    const points = new Points(new BoxGeometry(), new PointsMaterial())
    const instances = new InstancedMesh(
      new BoxGeometry(),
      new MeshBasicMaterial(),
      2,
    )
    mesh.name = 'Crater'
    line.name = 'Bridge'
    points.name = 'Ash'
    instances.name = 'Rocks'
    owner.add(mesh, line, points, instances)

    const ledger = new GeometryResourceLedger()
    const snapshot = ledger.observe(scene, 42)

    expect(snapshot.currentCount).toBe(4)
    expect(snapshot.entries.map((entry) => entry.objectType)).toEqual([
      'Points',
      'Line',
      'Mesh',
      'Mesh',
    ])
    expect(snapshot.entries.every((entry) => entry.topLevelOwnerName === owner.name)).toBe(
      true,
    )
    expect(snapshot.entries.every((entry) => entry.firstSeenFrame === 42)).toBe(
      true,
    )
    expect(snapshot.entries.every((entry) => entry.firstSeenObservation === 1)).toBe(
      true,
    )
  })

  it('deduplicates a geometry shared by multiple renderable objects', () => {
    const scene = new Scene()
    const geometry = new BoxGeometry()
    const first = new Mesh(geometry, new MeshBasicMaterial())
    const second = new Mesh(geometry, new MeshBasicMaterial())
    first.name = 'First'
    second.name = 'Second'
    scene.add(first, second)

    const snapshot = new GeometryResourceLedger().observe(scene)

    expect(snapshot.currentCount).toBe(1)
    expect(snapshot.trackedCount).toBe(1)
    expect(snapshot.entries[0]?.objectName).toBe('First')
  })

  it('records disposed geometry as disposed instead of orphaned', () => {
    const scene = new Scene()
    const geometry = new BoxGeometry()
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    scene.add(mesh)
    const ledger = new GeometryResourceLedger()
    ledger.observe(scene)

    scene.remove(mesh)
    geometry.dispose()
    const snapshot = ledger.observe(scene)

    expect(snapshot.disposedCount).toBe(1)
    expect(snapshot.disposed).toHaveLength(1)
    expect(snapshot.disposed[0]?.disposed).toBe(true)
    expect(snapshot.orphaned).toEqual([])
    expect(snapshot.renderedOrphans).toEqual([])
  })

  it('separates rendered orphans from detached geometry never sent to render', () => {
    const scene = new Scene()
    const rendered = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const lazy = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    rendered.name = 'Rendered'
    lazy.name = 'Lazy'
    const originalBeforeRender = vi.fn()
    rendered.onBeforeRender = originalBeforeRender
    scene.add(rendered, lazy)
    const ledger = new GeometryResourceLedger()
    ledger.observe(scene, 10)

    invokeBeforeRender(rendered, scene)
    ledger.observe(scene, 11)
    invokeBeforeRender(rendered, scene)
    expect(ledger.snapshot().renderedResidentCount).toBe(1)
    scene.remove(rendered, lazy)
    const snapshot = ledger.observe(scene, 12)

    expect(originalBeforeRender).toHaveBeenCalledTimes(2)
    expect(snapshot.orphaned.map((entry) => entry.objectName)).toEqual([
      'Lazy',
      'Rendered',
    ])
    expect(snapshot.renderedOrphans.map((entry) => entry.objectName)).toEqual([
      'Rendered',
    ])
    expect(snapshot.renderedResidentCount).toBe(0)
  })

  it('counts geometry first registered by a shadow render pass', () => {
    const scene = new Scene()
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const originalBeforeShadow = vi.fn()
    mesh.onBeforeShadow = originalBeforeShadow
    scene.add(mesh)
    const ledger = new GeometryResourceLedger()
    ledger.observe(scene, 20)

    invokeBeforeShadow(mesh, scene)
    const snapshot = ledger.snapshot()

    expect(originalBeforeShadow).toHaveBeenCalledOnce()
    expect(snapshot.renderedResidentCount).toBe(1)
    expect(snapshot.entries[0]?.rendered).toBe(true)
  })

  it('keeps first owner metadata stable and sorts entries and groups deterministically', () => {
    const scene = new Scene()
    const zetaOwner = new Group()
    const alphaOwner = new Group()
    zetaOwner.name = 'Zeta'
    alphaOwner.name = 'Alpha'

    const zetaMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const alphaSecond = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const alphaFirst = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    zetaMesh.name = 'Volcano'
    alphaSecond.name = 'Temple'
    alphaFirst.name = 'Bridge'
    zetaMesh.geometry.name = 'ZetaGeometry'
    alphaSecond.geometry.name = 'TempleGeometry'
    alphaFirst.geometry.name = 'BridgeGeometry'
    zetaOwner.add(zetaMesh)
    alphaOwner.add(alphaSecond, alphaFirst)
    scene.add(zetaOwner, alphaOwner)

    const ledger = new GeometryResourceLedger()
    const firstSnapshot = ledger.observe(scene, 7)
    alphaOwner.remove(alphaFirst)
    zetaOwner.add(alphaFirst)
    const secondSnapshot = ledger.observe(scene, 8)

    expect(firstSnapshot.groups.map((group) => group.topLevelOwnerName)).toEqual([
      'Alpha',
      'Zeta',
    ])
    expect(firstSnapshot.entries.map((entry) => entry.objectName)).toEqual([
      'Bridge',
      'Temple',
      'Volcano',
    ])
    expect(secondSnapshot.entries.find((entry) => entry.objectName === 'Bridge')).toMatchObject(
      {
        topLevelOwnerName: 'Alpha',
        firstSeenFrame: 7,
        firstSeenObservation: 1,
      },
    )
  })
})
