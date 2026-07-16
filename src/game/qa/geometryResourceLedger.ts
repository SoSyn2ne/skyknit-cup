import * as THREE from 'three'

export interface GeometryResourceEntry {
  readonly uuid: string
  readonly geometryType: string
  readonly geometryName: string
  readonly objectName: string
  readonly objectType: string
  readonly topLevelOwnerName: string
  readonly firstSeenFrame: number | null
  readonly firstSeenObservation: number
  readonly current: boolean
  readonly rendered: boolean
  readonly disposed: boolean
}

export interface GeometryResourceGroup {
  readonly topLevelOwnerName: string
  readonly count: number
  readonly renderedCount: number
}

export interface GeometryResourceLedgerSnapshot {
  readonly observation: number
  readonly currentCount: number
  readonly trackedCount: number
  readonly disposedCount: number
  readonly renderedResidentCount: number
  readonly entries: readonly GeometryResourceEntry[]
  readonly groups: readonly GeometryResourceGroup[]
  readonly orphaned: readonly GeometryResourceEntry[]
  readonly renderedOrphans: readonly GeometryResourceEntry[]
  readonly disposed: readonly GeometryResourceEntry[]
}

interface MutableGeometryResourceEntry {
  uuid: string
  geometryType: string
  geometryName: string
  objectName: string
  objectType: string
  topLevelOwnerName: string
  firstSeenFrame: number | null
  firstSeenObservation: number
  current: boolean
  rendered: boolean
  disposed: boolean
}

type RenderableObject = THREE.Object3D & {
  readonly geometry: THREE.BufferGeometry
}

function renderableGeometry(object: THREE.Object3D): THREE.BufferGeometry | null {
  const geometry = (object as Partial<RenderableObject>).geometry
  return geometry instanceof THREE.BufferGeometry ? geometry : null
}

function topLevelOwnerName(object: THREE.Object3D, scene: THREE.Scene): string {
  let owner = object
  while (owner.parent !== null && owner.parent !== scene) owner = owner.parent
  return owner.name || owner.type
}

function entrySortKey(entry: GeometryResourceEntry): string {
  return [
    entry.topLevelOwnerName,
    entry.objectName,
    entry.objectType,
    entry.geometryName,
    entry.geometryType,
    entry.uuid,
  ].join('\u0000')
}

function sortedEntries(
  entries: Iterable<MutableGeometryResourceEntry>,
): GeometryResourceEntry[] {
  return [...entries]
    .map((entry) => ({ ...entry }))
    .sort((left, right) => entrySortKey(left).localeCompare(entrySortKey(right)))
}

export class GeometryResourceLedger {
  private readonly records = new Map<string, MutableGeometryResourceEntry>()
  private readonly currentUuids = new Set<string>()
  private readonly wrappedObjects = new WeakSet<THREE.Object3D>()
  private observation = 0

  observe(
    scene: THREE.Scene,
    frame: number | null = null,
  ): GeometryResourceLedgerSnapshot {
    this.track(scene, frame)
    return this.snapshot()
  }

  track(scene: THREE.Scene, frame: number | null = null): void {
    this.observation += 1
    for (const uuid of this.currentUuids) {
      const record = this.records.get(uuid)
      if (record !== undefined) record.current = false
    }
    this.currentUuids.clear()

    scene.traverse((object) => {
      const geometry = renderableGeometry(object)
      if (geometry === null) return

      let record = this.records.get(geometry.uuid)
      if (record === undefined) {
        record = {
          uuid: geometry.uuid,
          geometryType: geometry.type,
          geometryName: geometry.name,
          objectName: object.name,
          objectType: object.type,
          topLevelOwnerName: topLevelOwnerName(object, scene),
          firstSeenFrame: frame,
          firstSeenObservation: this.observation,
          current: true,
          rendered: false,
          disposed: false,
        }
        this.records.set(geometry.uuid, record)

        const handleDispose = (): void => {
          geometry.removeEventListener('dispose', handleDispose)
          record!.disposed = true
          record!.current = false
          this.currentUuids.delete(geometry.uuid)
        }
        geometry.addEventListener('dispose', handleDispose)
      }
      record.current = true
      this.currentUuids.add(geometry.uuid)

      if (!this.wrappedObjects.has(object)) {
        this.wrappedObjects.add(object)
        const markActiveGeometryRendered = (): void => {
          const activeGeometry = renderableGeometry(object)
          if (activeGeometry === null) return

          const activeRecord = this.records.get(activeGeometry.uuid)
          if (activeRecord !== undefined && !activeRecord.disposed) {
            activeRecord.rendered = true
          }
        }
        const originalBeforeRender = object.onBeforeRender
        object.onBeforeRender = (...args): void => {
          markActiveGeometryRendered()
          Reflect.apply(originalBeforeRender, object, args)
        }
        const originalBeforeShadow = object.onBeforeShadow
        object.onBeforeShadow = (...args): void => {
          markActiveGeometryRendered()
          Reflect.apply(originalBeforeShadow, object, args)
        }
      }
    })
  }

  snapshot(): GeometryResourceLedgerSnapshot {
    const all = [...this.records.values()]
    const current = all.filter((entry) => entry.current && !entry.disposed)
    const orphaned = all.filter((entry) => !entry.current && !entry.disposed)
    const renderedOrphans = orphaned.filter((entry) => entry.rendered)
    const disposed = all.filter((entry) => entry.disposed)
    const groups = new Map<string, { count: number; renderedCount: number }>()

    for (const entry of current) {
      const group = groups.get(entry.topLevelOwnerName) ?? {
        count: 0,
        renderedCount: 0,
      }
      group.count += 1
      if (entry.rendered) group.renderedCount += 1
      groups.set(entry.topLevelOwnerName, group)
    }

    return {
      observation: this.observation,
      currentCount: current.length,
      trackedCount: all.length,
      disposedCount: disposed.length,
      renderedResidentCount: current.filter((entry) => entry.rendered).length,
      entries: sortedEntries(current),
      groups: [...groups]
        .map(([owner, counts]) => ({
          topLevelOwnerName: owner,
          ...counts,
        }))
        .sort((left, right) =>
          left.topLevelOwnerName.localeCompare(right.topLevelOwnerName),
        ),
      orphaned: sortedEntries(orphaned),
      renderedOrphans: sortedEntries(renderedOrphans),
      disposed: sortedEntries(disposed),
    }
  }
}
