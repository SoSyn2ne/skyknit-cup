import type { FlightInput } from '../flight/flightModel'
import type { ExplorationInput } from '../exploration/explorationFlight'

export type InputDevice = 'keyboard' | 'touch'

export interface RaceInputActions {
  readonly start: boolean
  readonly pause: boolean
  readonly respawn: boolean
}

export interface ExplorationInputActions {
  readonly pause: boolean
  readonly interact: boolean
  readonly toggleMap: boolean
}

export class InputController {
  #activeDevice: InputDevice

  constructor(initialDevice: InputDevice = 'keyboard') {
    this.#activeDevice = initialDevice
  }

  get activeDevice(): InputDevice {
    return this.#activeDevice
  }

  activate(device: InputDevice): void {
    this.#activeDevice = device
  }

  selectInput(
    keyboard: FlightInput,
    touch: FlightInput,
  ): FlightInput {
    return this.#activeDevice === 'touch' ? touch : keyboard
  }

  selectActions(
    keyboard: RaceInputActions,
    touch: RaceInputActions,
  ): RaceInputActions {
    return this.#activeDevice === 'touch' ? touch : keyboard
  }

  selectExplorationInput(
    keyboard: ExplorationInput,
    touch: ExplorationInput,
  ): ExplorationInput {
    return this.#activeDevice === 'touch' ? touch : keyboard
  }

  selectExplorationActions(
    keyboard: ExplorationInputActions,
    touch: ExplorationInputActions,
  ): ExplorationInputActions {
    return this.#activeDevice === 'touch' ? touch : keyboard
  }

  reset(): void {
    this.#activeDevice = 'keyboard'
  }
}
