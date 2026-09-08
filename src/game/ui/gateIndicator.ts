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

export interface IndicatorAvoidanceRect {
  readonly left: number
  readonly top: number
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
const GUIDE_SIZE_CSS = 44
const GUIDE_HALF_SIZE_CSS = GUIDE_SIZE_CSS / 2
const MIN_DIRECTION_COMPONENT = 1e-9

export function createGateIndicator(
  projectedGate: ProjectedGatePoint | null,
  projectedDiameterCss: number,
  viewport: IndicatorViewport,
  avoidanceRects: readonly IndicatorAvoidanceRect[] = [],
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

  if (
    onScreen &&
    safeDiameter >= MINIMUM_GATE_DIAMETER_CSS &&
    !isProjectedTargetCovered(projectedGate, viewport, avoidanceRects)
  ) {
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
  const clearScale = moveIndicatorInsideClearSpace(
    centerLeft,
    centerTop,
    directionX,
    directionY,
    scale,
    avoidanceRects,
  )

  return {
    show: true,
    left: centerLeft + directionX * clearScale,
    top: centerTop + directionY * clearScale,
    angleRadians: Math.atan2(directionY, directionX),
    projectedDiameterCss: safeDiameter,
  }
}

function isProjectedTargetCovered(
  projectedGate: ProjectedGatePoint,
  viewport: IndicatorViewport,
  avoidanceRects: readonly IndicatorAvoidanceRect[],
): boolean {
  const targetRect = {
    left:
      viewport.width / 2 + projectedGate.x * (viewport.width / 2) - GUIDE_HALF_SIZE_CSS,
    top:
      viewport.height / 2 - projectedGate.y * (viewport.height / 2) - GUIDE_HALF_SIZE_CSS,
    width: GUIDE_SIZE_CSS,
    height: GUIDE_SIZE_CSS,
  }

  return normalizedAvoidanceRects(avoidanceRects).some((rect) =>
    rectsOverlap(targetRect, rect),
  )
}

function moveIndicatorInsideClearSpace(
  centerLeft: number,
  centerTop: number,
  directionX: number,
  directionY: number,
  edgeScale: number,
  avoidanceRects: readonly IndicatorAvoidanceRect[],
): number {
  const intervals = normalizedAvoidanceRects(avoidanceRects)
    .map((rect) =>
      findBlockedScaleInterval(
        centerLeft,
        centerTop,
        directionX,
        directionY,
        edgeScale,
        rect,
      ),
    )
    .filter((interval): interval is { readonly start: number; readonly end: number } =>
      interval !== null
    )
    .sort((left, right) => right.start - left.start)

  let clearScale = edgeScale
  for (const interval of intervals) {
    if (
      interval.start <= clearScale + Number.EPSILON &&
      interval.end >= clearScale - Number.EPSILON
    ) {
      clearScale = interval.start
    }
  }

  return Math.max(0, clearScale)
}

function findBlockedScaleInterval(
  centerLeft: number,
  centerTop: number,
  directionX: number,
  directionY: number,
  edgeScale: number,
  rect: IndicatorAvoidanceRect,
): { readonly start: number; readonly end: number } | null {
  const expandedLeft = rect.left - GUIDE_HALF_SIZE_CSS
  const expandedRight = rect.left + rect.width + GUIDE_HALF_SIZE_CSS
  const expandedTop = rect.top - GUIDE_HALF_SIZE_CSS
  const expandedBottom = rect.top + rect.height + GUIDE_HALF_SIZE_CSS
  const xInterval = projectAxisInterval(
    centerLeft,
    directionX,
    expandedLeft,
    expandedRight,
    edgeScale,
  )
  if (xInterval === null) return null
  const yInterval = projectAxisInterval(
    centerTop,
    directionY,
    expandedTop,
    expandedBottom,
    edgeScale,
  )
  if (yInterval === null) return null

  const start = Math.max(0, xInterval.start, yInterval.start)
  const end = Math.min(edgeScale, xInterval.end, yInterval.end)
  return start <= end ? { start, end } : null
}

function projectAxisInterval(
  center: number,
  direction: number,
  minValue: number,
  maxValue: number,
  edgeScale: number,
): { readonly start: number; readonly end: number } | null {
  if (Math.abs(direction) <= MIN_DIRECTION_COMPONENT) {
    if (center < minValue || center > maxValue) return null
    return { start: 0, end: edgeScale }
  }

  const first = (minValue - center) / direction
  const second = (maxValue - center) / direction
  const start = Math.min(first, second)
  const end = Math.max(first, second)
  return { start, end }
}

function normalizedAvoidanceRects(
  rects: readonly IndicatorAvoidanceRect[],
): readonly IndicatorAvoidanceRect[] {
  return rects.filter(
    (rect) =>
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0,
  )
}

function rectsOverlap(
  left: Pick<IndicatorAvoidanceRect, 'left' | 'top' | 'width' | 'height'>,
  right: Pick<IndicatorAvoidanceRect, 'left' | 'top' | 'width' | 'height'>,
): boolean {
  return (
    left.left < right.left + right.width &&
    left.left + left.width > right.left &&
    left.top < right.top + right.height &&
    left.top + left.height > right.top
  )
}
