export interface ProjectedGatePoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly behindCamera?: boolean
}

export interface IndicatorViewport {
  readonly width: number
  readonly height: number
}

export interface GateIndicatorState {
  readonly show: boolean
  readonly left: number
  readonly top: number
  readonly angleRadians: number
  readonly projectedDiameterCss: number
}

const MINIMUM_GATE_DIAMETER_CSS = 48
const EDGE_MARGIN_CSS = 32

export function createGateIndicator(
  projectedGate: ProjectedGatePoint | null,
  projectedDiameterCss: number,
  viewport: IndicatorViewport,
): GateIndicatorState {
  const centerLeft = viewport.width / 2
  const centerTop = viewport.height / 2
  const hidden = {
    show: false,
    left: centerLeft,
    top: centerTop,
    angleRadians: 0,
    projectedDiameterCss,
  }

  if (
    projectedGate === null ||
    !Number.isFinite(projectedGate.x) ||
    !Number.isFinite(projectedGate.y) ||
    !Number.isFinite(projectedGate.z) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= EDGE_MARGIN_CSS * 2 ||
    viewport.height <= EDGE_MARGIN_CSS * 2
  ) {
    return hidden
  }

  const onScreen =
    Math.abs(projectedGate.x) <= 1 &&
    Math.abs(projectedGate.y) <= 1 &&
    projectedGate.z >= -1 &&
    projectedGate.z <= 1
  const safeDiameter = Number.isFinite(projectedDiameterCss)
    ? Math.max(0, projectedDiameterCss)
    : 0

  if (onScreen && safeDiameter >= MINIMUM_GATE_DIAMETER_CSS) {
    return { ...hidden, projectedDiameterCss: safeDiameter }
  }

  let directionX = projectedGate.x
  let directionY = -projectedGate.y

  if (projectedGate.behindCamera === true) {
    directionX *= -1
    directionY *= -1
  }

  if (Math.hypot(directionX, directionY) <= Number.EPSILON) {
    directionX = 0
    directionY = -1
  }

  const scale = Math.min(
    (centerLeft - EDGE_MARGIN_CSS) / Math.max(Math.abs(directionX), 1e-9),
    (centerTop - EDGE_MARGIN_CSS) / Math.max(Math.abs(directionY), 1e-9),
  )

  return {
    show: true,
    left: centerLeft + directionX * scale,
    top: centerTop + directionY * scale,
    angleRadians: Math.atan2(directionY, directionX),
    projectedDiameterCss: safeDiameter,
  }
}
