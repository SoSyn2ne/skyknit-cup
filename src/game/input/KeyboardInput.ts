import type { FlightInput } from '../flight/flightModel'
import type { ExplorationInput } from '../exploration/explorationFlight'
import type { ExplorationInputActions } from './InputController'

export type InputClearReason =
  | 'manual'
  | 'blur'
  | 'visibility-hidden'

export interface KeyboardStateSnapshot {
  readonly input: FlightInput
  readonly blurCount: number
  readonly hiddenCount: number
  readonly lastClearReason: InputClearReason | null
}

export interface KeyboardActions {
  readonly start: boolean
  readonly pause: boolean
  readonly respawn: boolean
}

const SUPPORTED_CODES = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'KeyC',
  'ControlLeft',
  'ControlRight',
])
const ACTION_CODES = new Set(['Escape', 'KeyR', 'KeyE', 'Enter', 'KeyM'])
const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, [contenteditable="true"]'

export function isInteractiveKeyboardTarget(
  target: EventTarget | null,
): boolean {
  const candidate = target as { closest?: (selector: string) => unknown } | null
  return (
    typeof candidate?.closest === 'function' &&
    candidate.closest(INTERACTIVE_SELECTOR) !== null
  )
}

function axis(positive: boolean, negative: boolean): number {
  return Number(positive) - Number(negative)
}

function inputFromCodes(codes: ReadonlySet<string>): FlightInput {
  const pitchUp = codes.has('KeyW') || codes.has('ArrowUp')
  const pitchDown = codes.has('KeyS') || codes.has('ArrowDown')
  const yawRight = codes.has('KeyD') || codes.has('ArrowRight')
  const yawLeft = codes.has('KeyA') || codes.has('ArrowLeft')
  const boost =
    codes.has('ShiftLeft') ||
    codes.has('ShiftRight') ||
    codes.has('Space')

  return {
    pitch: axis(pitchUp, pitchDown),
    yaw: axis(yawRight, yawLeft),
    boost,
  }
}

function explorationInputFromCodes(
  codes: ReadonlySet<string>,
): ExplorationInput {
  return {
    ...inputFromCodes(codes),
    brake:
      codes.has('KeyC') ||
      codes.has('ControlLeft') ||
      codes.has('ControlRight'),
  }
}

export class KeyboardState {
  readonly #heldCodes = new Set<string>()
  readonly #bufferedPresses = new Set<string>()
  #blurCount = 0
  #hiddenCount = 0
  #lastClearReason: InputClearReason | null = null
  #startBuffered = false
  #pauseBuffered = false
  #respawnBuffered = false
  #interactBuffered = false
  #mapBuffered = false

  press(code: string): boolean {
    if (code === 'Escape') {
      this.#pauseBuffered = true
      return true
    }

    if (code === 'KeyR') {
      this.#respawnBuffered = true
      return true
    }


    if (code === 'KeyE' || code === 'Enter') {
      this.#interactBuffered = true
      return true
    }

    if (code === 'KeyM') {
      this.#mapBuffered = true
      return true
    }

    if (!SUPPORTED_CODES.has(code)) {
      return false
    }

    this.#heldCodes.add(code)
    this.#bufferedPresses.add(code)
    this.#startBuffered = true
    return true
  }

  release(code: string): boolean {
    if (ACTION_CODES.has(code)) {
      return true
    }

    if (!SUPPORTED_CODES.has(code)) {
      return false
    }

    this.#heldCodes.delete(code)
    return true
  }

  clear(reason: InputClearReason): void {
    this.#heldCodes.clear()
    this.#bufferedPresses.clear()
    this.#startBuffered = false
    this.#pauseBuffered = false
    this.#respawnBuffered = false
    this.#interactBuffered = false
    this.#mapBuffered = false
    this.#lastClearReason = reason

    if (reason === 'blur') {
      this.#blurCount += 1
    } else if (reason === 'visibility-hidden') {
      this.#hiddenCount += 1
    }
  }

  consumeInput(): FlightInput {
    const effectiveCodes = new Set([
      ...this.#heldCodes,
      ...this.#bufferedPresses,
    ])
    this.#bufferedPresses.clear()
    return inputFromCodes(effectiveCodes)
  }

  consumeExplorationInput(): ExplorationInput {
    const effectiveCodes = new Set([
      ...this.#heldCodes,
      ...this.#bufferedPresses,
    ])
    this.#bufferedPresses.clear()
    return explorationInputFromCodes(effectiveCodes)
  }

  consumeActions(): KeyboardActions {
    const actions = {
      start: this.#startBuffered,
      pause: this.#pauseBuffered,
      respawn: this.#respawnBuffered,
    }
    this.#startBuffered = false
    this.#pauseBuffered = false
    this.#respawnBuffered = false
    return actions
  }

  consumeExplorationActions(): ExplorationInputActions {
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

  snapshot(): KeyboardStateSnapshot {
    return {
      input: inputFromCodes(this.#heldCodes),
      blurCount: this.#blurCount,
      hiddenCount: this.#hiddenCount,
      lastClearReason: this.#lastClearReason,
    }
  }
}

export class KeyboardInput {
  readonly #state = new KeyboardState()
  readonly #window: Window
  readonly #document: Document
  readonly #onLifecyclePause: ((reason: InputClearReason) => void) | null
  readonly #onInteraction: ((code: string) => void) | null
  #disposed = false

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (isInteractiveKeyboardTarget(event.target)) {
      return
    }
    if (this.#state.press(event.code)) {
      this.#onInteraction?.(event.code)
      event.preventDefault()
    }
  }

  readonly #handleKeyUp = (event: KeyboardEvent): void => {
    if (isInteractiveKeyboardTarget(event.target)) {
      return
    }
    if (this.#state.release(event.code)) {
      event.preventDefault()
    }
  }

  readonly #handleBlur = (): void => {
    this.#state.clear('blur')
    this.#onLifecyclePause?.('blur')
  }

  readonly #handleVisibilityChange = (): void => {
    if (this.#document.hidden) {
      this.#state.clear('visibility-hidden')
      this.#onLifecyclePause?.('visibility-hidden')
    }
  }

  constructor(
    windowRef: Window = window,
    documentRef: Document = document,
    onLifecyclePause: ((reason: InputClearReason) => void) | null = null,
    onInteraction: ((code: string) => void) | null = null,
  ) {
    this.#window = windowRef
    this.#document = documentRef
    this.#onLifecyclePause = onLifecyclePause
    this.#onInteraction = onInteraction
    this.#window.addEventListener('keydown', this.#handleKeyDown)
    this.#window.addEventListener('keyup', this.#handleKeyUp)
    this.#window.addEventListener('blur', this.#handleBlur)
    this.#document.addEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
  }

  read(): FlightInput {
    return this.#state.consumeInput()
  }

  readActions(): KeyboardActions {
    return this.#state.consumeActions()
  }

  readExploration(): ExplorationInput {
    return this.#state.consumeExplorationInput()
  }

  readExplorationActions(): ExplorationInputActions {
    return this.#state.consumeExplorationActions()
  }

  debugSnapshot(): KeyboardStateSnapshot {
    return this.#state.snapshot()
  }

  clear(): void {
    this.#state.clear('manual')
  }

  dispose(): void {
    if (this.#disposed) {
      return
    }

    this.#disposed = true
    this.#window.removeEventListener('keydown', this.#handleKeyDown)
    this.#window.removeEventListener('keyup', this.#handleKeyUp)
    this.#window.removeEventListener('blur', this.#handleBlur)
    this.#document.removeEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    this.clear()
  }
}
