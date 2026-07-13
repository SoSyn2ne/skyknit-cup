export interface Vec3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface CheckpointGeometry {
  readonly center: Vec3Like
  readonly normal: Vec3Like
  readonly radius: number
}

export interface CheckpointHit {
  readonly t: number
  readonly point: Vec3Like
}

const EPSILON = 1e-9

function dot(left: Vec3Like, right: Vec3Like): number {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function subtract(left: Vec3Like, right: Vec3Like): Vec3Like {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function isFiniteVector(vector: Vec3Like): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  )
}

function normalize(vector: Vec3Like): Vec3Like | null {
  const length = Math.hypot(vector.x, vector.y, vector.z)

  if (!Number.isFinite(length) || length <= EPSILON) {
    return null
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

export function intersectCheckpointSegment(
  previous: Vec3Like,
  current: Vec3Like,
  gate: CheckpointGeometry,
  forgiveness = 0,
): CheckpointHit | null {
  const normal = normalize(gate.normal)

  if (
    normal === null ||
    !isFiniteVector(previous) ||
    !isFiniteVector(current) ||
    !isFiniteVector(gate.center) ||
    !Number.isFinite(gate.radius) ||
    gate.radius < 0 ||
    !Number.isFinite(forgiveness)
  ) {
    return null
  }

  const previousDistance = dot(subtract(previous, gate.center), normal)
  const currentDistance = dot(subtract(current, gate.center), normal)

  if (!(previousDistance < 0 && currentDistance >= 0)) {
    return null
  }

  const distanceDelta = currentDistance - previousDistance

  if (Math.abs(distanceDelta) <= EPSILON) {
    return null
  }

  const t = -previousDistance / distanceDelta

  if (t < 0 || t > 1) {
    return null
  }

  const point = {
    x: previous.x + (current.x - previous.x) * t,
    y: previous.y + (current.y - previous.y) * t,
    z: previous.z + (current.z - previous.z) * t,
  }
  const radialOffset = subtract(point, gate.center)
  const allowedRadius = gate.radius + Math.max(0, forgiveness)

  if (
    !Number.isFinite(allowedRadius) ||
    dot(radialOffset, radialOffset) > allowedRadius * allowedRadius
  ) {
    return null
  }

  return { t, point }
}
