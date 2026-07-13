import { describe, expect, it } from 'vitest'

import {
  TouchJoystick,
  calculateJoystickAxes,
} from './touchJoystick'

describe('calculateJoystickAxes', () => {
  it('maps the center and cardinal directions to flight axes', () => {
    const center = { x: 100, y: 100 }

    expect(calculateJoystickAxes(center, center, 50)).toEqual({
      pitch: 0,
      yaw: 0,
    })
    expect(calculateJoystickAxes(center, { x: 100, y: 50 }, 50)).toEqual({
      pitch: 1,
      yaw: 0,
    })
    expect(calculateJoystickAxes(center, { x: 100, y: 150 }, 50)).toEqual({
      pitch: -1,
      yaw: 0,
    })
    expect(calculateJoystickAxes(center, { x: 150, y: 100 }, 50)).toEqual({
      pitch: 0,
      yaw: 1,
    })
  })

  it('clamps diagonal input to the unit circle', () => {
    const axes = calculateJoystickAxes(
      { x: 0, y: 0 },
      { x: 100, y: -100 },
      50,
    )

    expect(Math.hypot(axes.pitch, axes.yaw)).toBeCloseTo(1)
    expect(axes.pitch).toBeCloseTo(Math.SQRT1_2)
    expect(axes.yaw).toBeCloseTo(Math.SQRT1_2)
  })

  it('returns neutral inside the radial dead zone', () => {
    expect(
      calculateJoystickAxes(
        { x: 0, y: 0 },
        { x: 4, y: -3 },
        50,
        0.12,
      ),
    ).toEqual({ pitch: 0, yaw: 0 })
  })

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns neutral for an invalid radius %s',
    (radius) => {
      expect(
        calculateJoystickAxes(
          { x: 0, y: 0 },
          { x: 50, y: 50 },
          radius,
        ),
      ).toEqual({ pitch: 0, yaw: 0 })
    },
  )
})

describe('TouchJoystick', () => {
  it('tracks only the pointer that started the gesture', () => {
    const joystick = new TouchJoystick()

    expect(
      joystick.start(7, { x: 100, y: 100 }, { x: 125, y: 75 }, 50),
    ).toBe(true)
    expect(joystick.start(8, { x: 0, y: 0 }, { x: 50, y: 0 }, 50)).toBe(
      false,
    )
    expect(joystick.move(8, { x: 150, y: 100 })).toBe(false)
    expect(joystick.axes).toEqual({ pitch: 0.5, yaw: 0.5 })
  })

  it('returns to neutral on pointer release or cancellation', () => {
    const joystick = new TouchJoystick()
    joystick.start(7, { x: 100, y: 100 }, { x: 150, y: 100 }, 50)

    expect(joystick.end(8)).toBe(false)
    expect(joystick.axes.yaw).toBe(1)
    expect(joystick.end(7)).toBe(true)
    expect(joystick.axes).toEqual({ pitch: 0, yaw: 0 })

    joystick.start(9, { x: 100, y: 100 }, { x: 100, y: 50 }, 50)
    joystick.cancel()
    expect(joystick.axes).toEqual({ pitch: 0, yaw: 0 })
    expect(joystick.activePointerId).toBeNull()
  })
})
