import { describe, expect, it } from 'vitest'

import {
  isInteractiveKeyboardTarget,
  KeyboardInput,
  KeyboardState,
} from './KeyboardInput'

function createKeyboardEvent(type: 'keydown' | 'keyup', code: string): Event {
  const event = new Event(type, { cancelable: true })
  Object.defineProperty(event, 'code', { value: code })
  return event
}

describe('keyboard flight input state', () => {
  it('leaves form controls to native keyboard interaction', () => {
    const formTarget = {
      closest: (selector: string) =>
        selector.includes('select') ? formTarget : null,
    }
    const canvasTarget = { closest: () => null }

    expect(isInteractiveKeyboardTarget(formTarget as never)).toBe(true)
    expect(isInteractiveKeyboardTarget(canvasTarget as never)).toBe(false)
    expect(isInteractiveKeyboardTarget(null)).toBe(false)
  })

  it('releases pitch keys without leaving held input behind', () => {
    const state = new KeyboardState()

    expect(state.press('KeyW')).toBe(true)
    expect(state.snapshot().input.pitch).toBe(1)

    state.press('KeyS')
    expect(state.snapshot().input.pitch).toBe(0)

    state.release('KeyS')
    expect(state.snapshot().input.pitch).toBe(1)

    state.release('KeyW')
    expect(state.snapshot().input.pitch).toBe(0)
  })

  it('maps arrows and A/D to signed pitch and yaw', () => {
    const state = new KeyboardState()

    state.press('ArrowDown')
    state.press('KeyD')
    expect(state.snapshot().input).toEqual({
      pitch: -1,
      yaw: 1,
      boost: false,
    })

    state.clear('manual')
    state.press('ArrowUp')
    state.press('KeyA')
    expect(state.snapshot().input).toEqual({
      pitch: 1,
      yaw: -1,
      boost: false,
    })
  })

  it('keeps boost active until every boost key is released', () => {
    const state = new KeyboardState()

    state.press('ShiftLeft')
    state.press('Space')
    state.release('ShiftLeft')
    expect(state.snapshot().input.boost).toBe(true)

    state.release('Space')
    expect(state.snapshot().input.boost).toBe(false)
  })

  it('buffers a quick tap for exactly one simulation read', () => {
    const state = new KeyboardState()

    state.press('KeyW')
    state.release('KeyW')

    expect(state.snapshot().input.pitch).toBe(0)
    expect(state.consumeInput().pitch).toBe(1)
    expect(state.consumeInput().pitch).toBe(0)
  })

  it('discards buffered taps when focus is lost', () => {
    const state = new KeyboardState()

    state.press('KeyD')
    state.release('KeyD')
    state.clear('blur')

    expect(state.consumeInput()).toEqual({
      pitch: 0,
      yaw: 0,
      boost: false,
    })
  })

  it('clears all held input on blur and hidden visibility changes', () => {
    const state = new KeyboardState()

    state.press('KeyW')
    state.press('KeyD')
    state.press('ShiftRight')
    state.clear('blur')

    expect(state.snapshot()).toEqual({
      input: { pitch: 0, yaw: 0, boost: false },
      blurCount: 1,
      hiddenCount: 0,
      lastClearReason: 'blur',
    })

    state.press('KeyA')
    state.clear('visibility-hidden')
    expect(state.snapshot()).toEqual({
      input: { pitch: 0, yaw: 0, boost: false },
      blurCount: 1,
      hiddenCount: 1,
      lastClearReason: 'visibility-hidden',
    })
  })

  it('supports race action keys without changing flight axes', () => {
    const state = new KeyboardState()

    expect(state.press('Escape')).toBe(true)
    expect(state.press('KeyR')).toBe(true)
    expect(state.snapshot().input).toEqual({
      pitch: 0,
      yaw: 0,
      boost: false,
    })
    expect(state.consumeActions()).toEqual({
      start: false,
      pause: true,
      respawn: true,
    })
    expect(state.consumeActions()).toEqual({
      start: false,
      pause: false,
      respawn: false,
    })
  })

  it('keeps exploration brake held and buffers a quick tap once', () => {
    const state = new KeyboardState()

    state.press('ControlLeft')
    expect(state.consumeExplorationInput()).toMatchObject({ brake: true })
    expect(state.consumeExplorationInput()).toMatchObject({ brake: true })

    state.release('ControlLeft')
    expect(state.consumeExplorationInput()).toMatchObject({ brake: false })

    state.press('KeyC')
    state.release('KeyC')
    expect(state.consumeExplorationInput()).toMatchObject({ brake: true })
    expect(state.consumeExplorationInput()).toMatchObject({ brake: false })
  })

  it('buffers exploration interact and map actions independently', () => {
    const state = new KeyboardState()

    state.press('KeyE')
    state.press('Enter')
    state.press('KeyM')

    expect(state.consumeExplorationActions()).toEqual({
      pause: false,
      interact: true,
      toggleMap: true,
    })
    expect(state.consumeExplorationActions()).toEqual({
      pause: false,
      interact: false,
      toggleMap: false,
    })
  })

  it('turns a flight-key press into one start action', () => {
    const state = new KeyboardState()

    state.press('ArrowUp')

    expect(state.consumeActions().start).toBe(true)
    expect(state.consumeActions().start).toBe(false)
  })

  it('buffers real quick-tap events and prevents their browser defaults', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const input = new KeyboardInput(
      windowTarget as unknown as Window,
      documentTarget as unknown as Document,
    )
    const keyDown = createKeyboardEvent('keydown', 'ArrowUp')
    const keyUp = createKeyboardEvent('keyup', 'ArrowUp')

    windowTarget.dispatchEvent(keyDown)
    windowTarget.dispatchEvent(keyUp)

    expect(keyDown.defaultPrevented).toBe(true)
    expect(keyUp.defaultPrevented).toBe(true)
    expect(input.read().pitch).toBe(1)
    expect(input.read().pitch).toBe(0)
    input.dispose()
  })

  it('clears runtime input on window blur and hidden visibility changes', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    let hidden = false
    Object.defineProperty(documentTarget, 'hidden', {
      get: () => hidden,
    })
    const input = new KeyboardInput(
      windowTarget as unknown as Window,
      documentTarget as unknown as Document,
    )

    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'KeyD'))
    windowTarget.dispatchEvent(new Event('blur'))
    expect(input.debugSnapshot()).toMatchObject({
      input: { pitch: 0, yaw: 0, boost: false },
      blurCount: 1,
      lastClearReason: 'blur',
    })

    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'Space'))
    hidden = true
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(input.debugSnapshot()).toMatchObject({
      input: { pitch: 0, yaw: 0, boost: false },
      hiddenCount: 1,
      lastClearReason: 'visibility-hidden',
    })
    expect(input.read()).toEqual({ pitch: 0, yaw: 0, boost: false })
    input.dispose()
  })

  it('reports blur and hidden lifecycle pauses to the runtime', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const reasons: string[] = []
    let hidden = false
    Object.defineProperty(documentTarget, 'hidden', {
      get: () => hidden,
    })
    const input = new KeyboardInput(
      windowTarget as unknown as Window,
      documentTarget as unknown as Document,
      (reason) => reasons.push(reason),
    )

    windowTarget.dispatchEvent(new Event('blur'))
    hidden = true
    documentTarget.dispatchEvent(new Event('visibilitychange'))

    expect(reasons).toEqual(['blur', 'visibility-hidden'])
    input.dispose()
  })

  it('reports accepted key interactions for device arbitration', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const codes: string[] = []
    const input = new KeyboardInput(
      windowTarget as unknown as Window,
      documentTarget as unknown as Document,
      null,
      (code) => codes.push(code),
    )

    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'KeyW'))
    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'Escape'))
    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'F12'))

    expect(codes).toEqual(['KeyW', 'Escape'])
    input.dispose()
  })
})
