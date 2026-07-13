export interface Point2D {
  readonly x: number
  readonly y: number
}

export interface JoystickAxes {
  readonly pitch: number
  readonly yaw: number
}

const NEUTRAL_AXES: JoystickAxes = { pitch: 0, yaw: 0 }

export function calculateJoystickAxes(
  center: Point2D,
  pointer: Point2D,
  radius: number,
  deadZone = 0,
): JoystickAxes {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(pointer.x) ||
    !Number.isFinite(pointer.y) ||
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    return NEUTRAL_AXES
  }

  const yaw = (pointer.x - center.x) / radius
  const pitch = (center.y - pointer.y) / radius
  const magnitude = Math.hypot(pitch, yaw)
  const safeDeadZone = Number.isFinite(deadZone)
    ? Math.min(0.95, Math.max(0, deadZone))
    : 0

  if (magnitude <= safeDeadZone || magnitude <= Number.EPSILON) {
    return NEUTRAL_AXES
  }

  const clampedMagnitude = Math.min(1, magnitude)
  const remappedMagnitude =
    (clampedMagnitude - safeDeadZone) / (1 - safeDeadZone)
  const scale = remappedMagnitude / magnitude

  return {
    pitch: pitch * scale,
    yaw: yaw * scale,
  }
}

export class TouchJoystick {
  #activePointerId: number | null = null
  #center: Point2D = { x: 0, y: 0 }
  #radius = 1
  #deadZone = 0
  #axes: JoystickAxes = NEUTRAL_AXES

  get activePointerId(): number | null {
    return this.#activePointerId
  }

  get axes(): JoystickAxes {
    return { ...this.#axes }
  }

  start(
    pointerId: number,
    center: Point2D,
    pointer: Point2D,
    radius: number,
    deadZone = 0,
  ): boolean {
    if (this.#activePointerId !== null || !Number.isFinite(pointerId)) {
      return false
    }

    this.#activePointerId = pointerId
    this.#center = { ...center }
    this.#radius = radius
    this.#deadZone = deadZone
    this.#axes = calculateJoystickAxes(
      this.#center,
      pointer,
      this.#radius,
      this.#deadZone,
    )
    return true
  }

  move(pointerId: number, pointer: Point2D): boolean {
    if (pointerId !== this.#activePointerId) {
      return false
    }

    this.#axes = calculateJoystickAxes(
      this.#center,
      pointer,
      this.#radius,
      this.#deadZone,
    )
    return true
  }

  end(pointerId: number): boolean {
    if (pointerId !== this.#activePointerId) {
      return false
    }

    this.cancel()
    return true
  }

  cancel(): void {
    this.#activePointerId = null
    this.#axes = NEUTRAL_AXES
  }
}
