import type { RacePhase } from '../race/raceState'
import type { TouchInput } from '../input/TouchInput'

export interface TouchControls {
  readonly element: HTMLElement
  update(phase: RacePhase, mode?: 'race' | 'explore'): void
  dispose(): void
}

function pointerPoint(event: PointerEvent): { readonly x: number; readonly y: number } {
  return { x: event.clientX, y: event.clientY }
}

export function createTouchControls(
  host: HTMLElement,
  input: TouchInput,
): TouchControls {
  const root = document.createElement('div')
  root.className = 'touch-controls'
  root.dataset.touchControls = 'true'

  const flightControls = document.createElement('div')
  flightControls.className = 'touch-controls__flight'

  const joystick = document.createElement('div')
  joystick.className = 'touch-controls__joystick'
  joystick.dataset.touchControl = 'true'
  joystick.dataset.touchRole = 'joystick'
  joystick.setAttribute('role', 'group')
  joystick.setAttribute('aria-label', '비행 방향 조이스틱')
  joystick.setAttribute('aria-roledescription', '가상 조이스틱')

  const joystickGuide = document.createElement('span')
  joystickGuide.className = 'touch-controls__joystick-guide'
  joystickGuide.setAttribute('aria-hidden', 'true')
  const joystickKnob = document.createElement('span')
  joystickKnob.className = 'touch-controls__joystick-knob'
  joystickKnob.setAttribute('aria-hidden', 'true')
  joystick.append(joystickGuide, joystickKnob)

  const boost = document.createElement('button')
  boost.type = 'button'
  boost.className = 'touch-controls__boost'
  boost.dataset.touchControl = 'true'
  boost.dataset.touchRole = 'boost'
  boost.setAttribute('aria-label', '돌풍 부스트')
  boost.title = '돌풍 부스트'
  boost.textContent = '돌풍'

  const brake = document.createElement('button')
  brake.type = 'button'
  brake.className = 'touch-controls__brake'
  brake.dataset.touchControl = 'true'
  brake.dataset.touchRole = 'brake'
  brake.setAttribute('aria-label', '감속 및 호버')
  brake.title = '감속 및 호버'
  brake.textContent = '감속'

  const pause = document.createElement('button')
  pause.type = 'button'
  pause.className = 'touch-controls__pause'
  pause.dataset.touchControl = 'true'
  pause.dataset.touchRole = 'pause'
  pause.setAttribute('aria-label', '일시정지')
  pause.title = '일시정지'
  pause.textContent = 'Ⅱ'

  flightControls.append(joystick, brake, boost)
  root.append(flightControls, pause)
  host.append(root)

  const coarsePointer = window.matchMedia('(pointer: coarse)')
  const syncCapability = (): void => {
    root.hidden =
      !coarsePointer.matches && window.navigator.maxTouchPoints <= 0
  }
  syncCapability()
  coarsePointer.addEventListener('change', syncCapability)

  const setJoystickVisual = (): void => {
    const axes = input.debugSnapshot().input
    joystickKnob.style.setProperty('--stick-x', `${axes.yaw * 34}px`)
    joystickKnob.style.setProperty('--stick-y', `${-axes.pitch * 34}px`)
  }

  const handleJoystickDown = (event: PointerEvent): void => {
    const bounds = joystick.getBoundingClientRect()
    const accepted = input.startJoystick(
      event.pointerId,
      {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      },
      pointerPoint(event),
      Math.min(bounds.width, bounds.height) * 0.31,
    )

    if (!accepted) {
      return
    }

    joystick.setPointerCapture(event.pointerId)
    joystick.dataset.active = 'true'
    setJoystickVisual()
    event.preventDefault()
  }

  const handleJoystickMove = (event: PointerEvent): void => {
    if (!input.moveJoystick(event.pointerId, pointerPoint(event))) {
      return
    }

    setJoystickVisual()
    event.preventDefault()
  }

  const releaseJoystick = (event: PointerEvent): void => {
    if (!input.endJoystick(event.pointerId)) {
      return
    }

    if (joystick.hasPointerCapture(event.pointerId)) {
      joystick.releasePointerCapture(event.pointerId)
    }
    delete joystick.dataset.active
    setJoystickVisual()
    event.preventDefault()
  }

  const cancelJoystick = (event: PointerEvent): void => {
    input.cancelJoystick()
    if (joystick.hasPointerCapture(event.pointerId)) {
      joystick.releasePointerCapture(event.pointerId)
    }
    delete joystick.dataset.active
    setJoystickVisual()
    event.preventDefault()
  }

  const handleLostJoystickCapture = (event: PointerEvent): void => {
    if (input.joystickPointerId === event.pointerId) {
      cancelJoystick(event)
    }
  }

  const handleBoostDown = (event: PointerEvent): void => {
    if (!input.pressBoost(event.pointerId)) {
      return
    }

    boost.setPointerCapture(event.pointerId)
    boost.dataset.active = 'true'
    event.preventDefault()
  }

  const releaseBoost = (event: PointerEvent): void => {
    if (!input.releaseBoost(event.pointerId)) {
      return
    }

    if (boost.hasPointerCapture(event.pointerId)) {
      boost.releasePointerCapture(event.pointerId)
    }
    delete boost.dataset.active
    event.preventDefault()
  }

  const cancelBoost = (event: PointerEvent): void => {
    input.cancelBoost()
    if (boost.hasPointerCapture(event.pointerId)) {
      boost.releasePointerCapture(event.pointerId)
    }
    delete boost.dataset.active
    event.preventDefault()
  }

  const handleLostBoostCapture = (event: PointerEvent): void => {
    if (input.boostPointerId === event.pointerId) {
      cancelBoost(event)
    }
  }

  const handleBrakeDown = (event: PointerEvent): void => {
    if (!input.pressBrake(event.pointerId)) return
    brake.setPointerCapture(event.pointerId)
    brake.dataset.active = 'true'
    event.preventDefault()
  }

  const releaseBrake = (event: PointerEvent): void => {
    if (!input.releaseBrake(event.pointerId)) return
    if (brake.hasPointerCapture(event.pointerId)) {
      brake.releasePointerCapture(event.pointerId)
    }
    delete brake.dataset.active
    event.preventDefault()
  }

  const cancelBrake = (event: PointerEvent): void => {
    input.cancelBrake()
    if (brake.hasPointerCapture(event.pointerId)) {
      brake.releasePointerCapture(event.pointerId)
    }
    delete brake.dataset.active
    event.preventDefault()
  }

  const handleLostBrakeCapture = (event: PointerEvent): void => {
    if (input.releaseBrake(event.pointerId)) delete brake.dataset.active
  }

  const handlePause = (): void => input.pressPause()

  joystick.addEventListener('pointerdown', handleJoystickDown)
  joystick.addEventListener('pointermove', handleJoystickMove)
  joystick.addEventListener('pointerup', releaseJoystick)
  joystick.addEventListener('pointercancel', cancelJoystick)
  joystick.addEventListener('lostpointercapture', handleLostJoystickCapture)
  boost.addEventListener('pointerdown', handleBoostDown)
  boost.addEventListener('pointerup', releaseBoost)
  boost.addEventListener('pointercancel', cancelBoost)
  boost.addEventListener('lostpointercapture', handleLostBoostCapture)
  brake.addEventListener('pointerdown', handleBrakeDown)
  brake.addEventListener('pointerup', releaseBrake)
  brake.addEventListener('pointercancel', cancelBrake)
  brake.addEventListener('lostpointercapture', handleLostBrakeCapture)
  pause.addEventListener('click', handlePause)

  return {
    element: root,
    update: (phase, mode = 'race') => {
      root.dataset.phase = phase
      root.dataset.mode = mode
      flightControls.hidden =
        (mode === 'race' && phase === 'ready') ||
        phase === 'paused' ||
        (mode === 'race' && phase === 'finished')
      brake.hidden = mode !== 'explore'
      pause.hidden =
        mode === 'race'
          ? phase !== 'countdown' && phase !== 'racing'
          : phase === 'paused'
    },
    dispose: () => {
      coarsePointer.removeEventListener('change', syncCapability)
      joystick.removeEventListener('pointerdown', handleJoystickDown)
      joystick.removeEventListener('pointermove', handleJoystickMove)
      joystick.removeEventListener('pointerup', releaseJoystick)
      joystick.removeEventListener('pointercancel', cancelJoystick)
      joystick.removeEventListener(
        'lostpointercapture',
        handleLostJoystickCapture,
      )
      boost.removeEventListener('pointerdown', handleBoostDown)
      boost.removeEventListener('pointerup', releaseBoost)
      boost.removeEventListener('pointercancel', cancelBoost)
      boost.removeEventListener('lostpointercapture', handleLostBoostCapture)
      brake.removeEventListener('pointerdown', handleBrakeDown)
      brake.removeEventListener('pointerup', releaseBrake)
      brake.removeEventListener('pointercancel', cancelBrake)
      brake.removeEventListener('lostpointercapture', handleLostBrakeCapture)
      pause.removeEventListener('click', handlePause)
      input.dispose()
      root.remove()
    },
  }
}
