import * as THREE from 'three'

import type { RenderQualityTier } from '../quality/qualityPolicy'
import { FESTIVAL_HUB_WIND_ZONES } from './festivalHubActivities'
import type { OpenWorldRegionId } from './openWorldRegions'

export interface OpenWorldActivitiesSnapshot {
  readonly qualityTier: RenderQualityTier
  readonly zoneCount: number
  readonly visibleInstanceCount: number
  readonly triangles: number
  readonly drawCalls: number
  readonly disposed: boolean
}

export interface OpenWorldActivitiesVisual {
  update(
    simulationSeconds: number,
    loadedRegionIds: readonly OpenWorldRegionId[],
    visible: boolean,
  ): void
  setQuality(tier: RenderQualityTier): void
  debugSnapshot(): OpenWorldActivitiesSnapshot
  dispose(): void
}

interface WindZoneFrame {
  readonly center: THREE.Vector3
  readonly direction: THREE.Vector3
  readonly tangent: THREE.Vector3
  readonly bitangent: THREE.Vector3
  readonly orientation: THREE.Quaternion
  readonly radius: number
}

const HIGH_RIBBONS_PER_ZONE = 4
const LOW_RIBBONS_PER_ZONE = 2
const BASE_NORMAL = new THREE.Vector3(0, 0, 1)
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0)

function createZoneFrames(): readonly WindZoneFrame[] {
  return FESTIVAL_HUB_WIND_ZONES.map((zone) => {
    const direction = new THREE.Vector3(
      zone.velocity.x,
      zone.velocity.y,
      zone.velocity.z,
    ).normalize()
    const tangent = new THREE.Vector3().crossVectors(direction, WORLD_UP)
    if (tangent.lengthSq() < 0.001) {
      tangent.crossVectors(direction, WORLD_RIGHT)
    }
    tangent.normalize()
    const bitangent = new THREE.Vector3()
      .crossVectors(direction, tangent)
      .normalize()
    return {
      center: new THREE.Vector3(
        zone.center.x,
        zone.center.y,
        zone.center.z,
      ),
      direction,
      tangent,
      bitangent,
      orientation: new THREE.Quaternion().setFromUnitVectors(
        BASE_NORMAL,
        direction,
      ),
      radius: zone.radius,
    }
  })
}

export function createOpenWorldActivities(
  scene: THREE.Scene,
  initialQualityTier: RenderQualityTier,
  windColor: THREE.ColorRepresentation,
  reducedMotion: () => boolean = () => false,
): OpenWorldActivitiesVisual {
  const zoneFrames = createZoneFrames()
  const maximumInstanceCount =
    zoneFrames.length * HIGH_RIBBONS_PER_ZONE
  const geometry = new THREE.TorusGeometry(
    1,
    0.055,
    5,
    24,
    Math.PI * 1.55,
  )
  const material = new THREE.MeshBasicMaterial({
    color: windColor,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    fog: true,
  })
  const ribbons = new THREE.InstancedMesh(
    geometry,
    material,
    maximumInstanceCount,
  )
  ribbons.name = 'M32_FestivalWindRibbons'
  ribbons.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  ribbons.renderOrder = 2
  ribbons.frustumCulled = false
  ribbons.visible = false
  ribbons.count = 0
  scene.add(ribbons)
  const trianglesPerRibbon =
    (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const spin = new THREE.Quaternion()
  const matrix = new THREE.Matrix4()
  let qualityTier = initialQualityTier
  let disposed = false
  let snapshot: OpenWorldActivitiesSnapshot = {
    qualityTier,
    zoneCount: zoneFrames.length,
    visibleInstanceCount: 0,
    triangles: 0,
    drawCalls: 0,
    disposed: false,
  }

  const updateMatrices = (
    simulationSeconds: number,
    ribbonsPerZone: number,
  ): number => {
    let instanceIndex = 0
    zoneFrames.forEach((zone, zoneIndex) => {
      for (let ribbonIndex = 0; ribbonIndex < ribbonsPerZone; ribbonIndex += 1) {
        const phase =
          (ribbonIndex / ribbonsPerZone +
            simulationSeconds * (0.12 + zoneIndex * 0.018)) %
          1
        const travel = (phase * 2 - 1) * zone.radius * 0.72
        const spiral =
          phase * Math.PI * 2 * 1.35 +
          zoneIndex * 1.7 +
          simulationSeconds * 0.24
        const driftRadius = zone.radius * (0.055 + ribbonIndex * 0.008)
        position
          .copy(zone.center)
          .addScaledVector(zone.direction, travel)
          .addScaledVector(zone.tangent, Math.cos(spiral) * driftRadius)
          .addScaledVector(zone.bitangent, Math.sin(spiral) * driftRadius)
        spin.setFromAxisAngle(zone.direction, spiral * 0.22)
        rotation.copy(spin).multiply(zone.orientation)
        const size =
          zone.radius *
          (0.34 + 0.08 * Math.sin(phase * Math.PI))
        scale.setScalar(size)
        matrix.compose(position, rotation, scale)
        ribbons.setMatrixAt(instanceIndex, matrix)
        instanceIndex += 1
      }
    })
    return instanceIndex
  }

  return {
    update: (simulationSeconds, loadedRegionIds, visible) => {
      if (disposed) return
      const show =
        visible && loadedRegionIds.includes('festival-hub')
      if (!show) {
        ribbons.visible = false
        ribbons.count = 0
        snapshot = {
          qualityTier,
          zoneCount: zoneFrames.length,
          visibleInstanceCount: 0,
          triangles: 0,
          drawCalls: 0,
          disposed: false,
        }
        return
      }

      const ribbonsPerZone =
        qualityTier === 'high'
          ? HIGH_RIBBONS_PER_ZONE
          : LOW_RIBBONS_PER_ZONE
      const visibleInstanceCount = updateMatrices(
        reducedMotion()
          ? 0
          : Number.isFinite(simulationSeconds)
            ? simulationSeconds
            : 0,
        ribbonsPerZone,
      )
      ribbons.count = visibleInstanceCount
      ribbons.visible = true
      ribbons.instanceMatrix.needsUpdate = true
      snapshot = {
        qualityTier,
        zoneCount: zoneFrames.length,
        visibleInstanceCount,
        triangles: trianglesPerRibbon * visibleInstanceCount,
        drawCalls: 1,
        disposed: false,
      }
    },
    setQuality: (tier) => {
      if (disposed || tier === qualityTier) return
      qualityTier = tier
      snapshot = { ...snapshot, qualityTier }
    },
    debugSnapshot: () => ({ ...snapshot }),
    dispose: () => {
      if (disposed) return
      disposed = true
      ribbons.removeFromParent()
      geometry.dispose()
      material.dispose()
      snapshot = {
        qualityTier,
        zoneCount: zoneFrames.length,
        visibleInstanceCount: 0,
        triangles: 0,
        drawCalls: 0,
        disposed: true,
      }
    },
  }
}
