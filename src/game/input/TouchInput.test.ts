import { describe, expect, it } from 'vitest'

import { TouchInput } from './TouchInput'

describe('TouchInput', () => {
  it('maps the joystick and held boost into flight input', () => {
    const input = new TouchInput()

    input.startJoystick(
      1,
      { x: 100, y: 100 },
      { x: 125, y: 75 },
      50,
      0,
    )
    input.pressBoost(2)

    expect(input.read()).toEqual({
      pitch: 0.5,
      yaw: 0.5,
      boost: true,
    })
  })

  it('buffers a quick boost tap for one simulation read', () => {
    const input = new TouchInput()

    expect(input.pressBoost(2)).toBe(true)
    expect(input.releaseBoost(2)).toBe(true)
    expect(input.read().boost).toBe(true)
    expect(input.read().boost).toBe(false)
  })

  it('turns the first flight gesture into one start action', () => {
    const input = new TouchInput()

    input.startJoystick(
      1,
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      50,
    )

    expect(input.readActions().start).toBe(true)
    expect(input.readActions().start).toBe(false)
  })

  it('buffers pause independently from the flight axes', () => {
    const input = new TouchInput()

    input.pressPause()

    expect(input.read()).toEqual({ pitch: 0, yaw: 0, boost: false })
    expect(input.readActions()).toEqual({
      start: false,
      pause: true,
      respawn: false,
    })
  })

  it('clears joystick, boost, and buffered actions together', () => {
    const input = new TouchInput()
    input.startJoystick(
      1,
      { x: 100, y: 100 },
      { x: 150, y: 100 },
      50,
    )
    input.pressBoost(2)
    input.pressPause()

    input.clear()

    expect(input.read()).toEqual({ pitch: 0, yaw: 0, boost: false })
    expect(input.readActions()).toEqual({
      start: false,
      pause: false,
      respawn: false,
    })
  })

  it('cancels only the matching boost pointer and all joystick input', () => {
    const input = new TouchInput()
    input.startJoystick(
      1,
      { x: 100, y: 100 },
      { x: 150, y: 100 },
      50,
    )
    input.pressBoost(2)

    expect(input.releaseBoost(3)).toBe(false)
    expect(input.read().boost).toBe(true)
    input.cancelJoystick()
    expect(input.read()).toEqual({ pitch: 0, yaw: 0, boost: true })
    input.cancelBoost()
    expect(input.read()).toEqual({ pitch: 0, yaw: 0, boost: false })
  })

  it('reports accepted touch interactions for device arbitration', () => {
    let interactions = 0
    const input = new TouchInput(() => {
      interactions += 1
    })

    input.startJoystick(
      1,
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      50,
    )
    input.moveJoystick(1, { x: 125, y: 100 })
    input.pressBoost(2)
    input.pressPause()

    expect(interactions).toBe(4)
  })

  it('exposes held brake only through exploration input', () => {
    const input = new TouchInput()

    expect(input.pressBrake(3)).toBe(true)
    expect(input.readExploration()).toEqual({
      pitch: 0,
      yaw: 0,
      boost: false,
      brake: true,
    })
    expect(input.releaseBrake(4)).toBe(false)
    expect(input.releaseBrake(3)).toBe(true)
    expect(input.readExploration().brake).toBe(false)
  })

  it('buffers exploration context and map actions once', () => {
    const input = new TouchInput()

    input.pressExploreAction()
    input.pressMap()

    expect(input.readExplorationActions()).toEqual({
      pause: false,
      interact: true,
      toggleMap: true,
    })
    expect(input.readExplorationActions()).toEqual({
      pause: false,
      interact: false,
      toggleMap: false,
    })
  })
})
