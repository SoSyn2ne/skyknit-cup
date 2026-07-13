import type { FlightInput } from '../flight/flightModel'
import type { ExplorationInput } from '../exploration/explorationFlight'
import type {
  ExplorationInputActions,
  RaceInputActions,
} from './InputController'
import { TouchJoystick, type Point2D } from './touchJoystick'

const NO_ACTIONS: RaceInputActions = {
  start: false,
  pause: false,
  respawn: false,
}

export class TouchInput {
  readonly #joystick = new TouchJoystick()
  readonly #onInteraction: (() => void) | null
  #boostPointerId: number | null = null
  #brakePointerId: number | null = null
  #boostTapBuffered = false
  #startBuffered = false
  #pauseBuffered = false
  #interactBuffered = false
  #mapBuffered = false

  constructor(onInteraction: (() => void) | null = null) {
    this.#onInteraction = onInteraction
  }

  get joystickPointerId(): number | null {
    return this.#joystick.activePointerId
  }

  get boostPointerId(): number | null {
    return this.#boostPointerId
  }

  startJoystick(
    pointerId: number,
    center: Point2D,
    pointer: Point2D,
    radius: number,
    deadZone = 0.12,
  ): boolean {
    const accepted = this.#joystick.start(
      pointerId,
      center,
      pointer,
      radius,
      deadZone,
    )

    if (accepted) {
      this.#startBuffered = true
      this.#onInteraction?.()
    }
    return accepted
  }

  moveJoystick(pointerId: number, pointer: Point2D): boolean {
    const accepted = this.#joystick.move(pointerId, pointer)
    if (accepted) {
      this.#onInteraction?.()
    }
    return accepted
  }

  endJoystick(pointerId: number): boolean {
    return this.#joystick.end(pointerId)
  }

  cancelJoystick(): void {
    this.#joystick.cancel()
  }

  pressBoost(pointerId: number): boolean {
    if (this.#boostPointerId !== null || !Number.isFinite(pointerId)) {
      return false
    }

    this.#boostPointerId = pointerId
    this.#boostTapBuffered = true
    this.#startBuffered = true
    this.#onInteraction?.()
    return true
  }

  releaseBoost(pointerId: number): boolean {
    if (pointerId !== this.#boostPointerId) {
      return false
    }

    this.#boostPointerId = null
    return true
  }

  cancelBoost(): void {
    this.#boostPointerId = null
    this.#boostTapBuffered = false
  }

  pressBrake(pointerId: number): boolean {
    if (this.#brakePointerId !== null || !Number.isFinite(pointerId)) {
      return false
    }
    this.#brakePointerId = pointerId
    this.#onInteraction?.()
    return true
  }

  releaseBrake(pointerId: number): boolean {
    if (pointerId !== this.#brakePointerId) {
      return false
    }
    this.#brakePointerId = null
    return true
  }

  cancelBrake(): void {
    this.#brakePointerId = null
  }

  pressExploreAction(): void {
    this.#interactBuffered = true
    this.#onInteraction?.()
  }

  pressMap(): void {
    this.#mapBuffered = true
    this.#onInteraction?.()
  }

  pressPause(): void {
    this.#pauseBuffered = true
    this.#onInteraction?.()
  }

  read(): FlightInput {
    const axes = this.#joystick.axes
    const boost =
      this.#boostPointerId !== null || this.#boostTapBuffered
    this.#boostTapBuffered = false

    return {
      pitch: axes.pitch,
      yaw: axes.yaw,
      boost,
    }
  }

  readExploration(): ExplorationInput {
    return {
      ...this.read(),
      brake: this.#brakePointerId !== null,
    }
  }

  readActions(): RaceInputActions {
    const actions = {
      start: this.#startBuffered,
      pause: this.#pauseBuffered,
      respawn: false,
    }
    this.#startBuffered = false
    this.#pauseBuffered = false
    return actions
  }

  readExplorationActions(): ExplorationInputActions {
    const actions = {
      pause: this.#pauseBuffered,
      interact: this.#interactBuffered,
      toggleMap: this.#mapBuffered,
    }
    this.#pauseBuffered = false
    this.#interactBuffered = false
    this.#mapBuffered = false
    return actions
  }

  clear(): void {
    this.#joystick.cancel()
    this.#boostPointerId = null
    this.#brakePointerId = null
    this.#boostTapBuffered = false
    this.#startBuffered = false
    this.#pauseBuffered = false
    this.#interactBuffered = false
    this.#mapBuffered = false
  }

  dispose(): void {
    this.clear()
  }

  debugSnapshot(): {
    readonly input: FlightInput
    readonly actions: RaceInputActions
  } {
    const axes = this.#joystick.axes
    return {
      input: {
        pitch: axes.pitch,
        yaw: axes.yaw,
        boost: this.#boostPointerId !== null,
      },
      actions: this.#startBuffered || this.#pauseBuffered
        ? {
            start: this.#startBuffered,
            pause: this.#pauseBuffered,
            respawn: false,
          }
        : NO_ACTIONS,
    }
  }
}
