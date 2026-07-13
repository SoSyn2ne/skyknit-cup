import { describe, expect, it } from 'vitest'

import {
  InputController,
  type RaceInputActions,
} from './InputController'
import type { FlightInput } from '../flight/flightModel'
import type { ExplorationInput } from '../exploration/explorationFlight'

const NEUTRAL_INPUT: FlightInput = { pitch: 0, yaw: 0, boost: false }
const NO_ACTIONS: RaceInputActions = {
  start: false,
  pause: false,
  respawn: false,
}

describe('InputController', () => {
  it('uses keyboard input until another device becomes active', () => {
    const controller = new InputController()
    const keyboard = { pitch: 1, yaw: -0.5, boost: true }
    const touch = { pitch: -1, yaw: 0.75, boost: false }

    expect(controller.selectInput(keyboard, touch)).toEqual(keyboard)
    expect(controller.activeDevice).toBe('keyboard')
  })

  it('selects only the last active device without summing axes', () => {
    const controller = new InputController()
    const keyboard = { pitch: 1, yaw: 1, boost: true }
    const touch = { pitch: -0.4, yaw: -0.75, boost: false }

    controller.activate('touch')

    expect(controller.selectInput(keyboard, touch)).toEqual(touch)
    expect(controller.activeDevice).toBe('touch')
  })

  it('switches back to keyboard after a new keyboard interaction', () => {
    const controller = new InputController('touch')
    const keyboard = { pitch: 0.5, yaw: -1, boost: false }
    const touch = { pitch: -1, yaw: 1, boost: true }

    controller.activate('keyboard')

    expect(controller.selectInput(keyboard, touch)).toEqual(keyboard)
  })

  it('selects one-shot actions from the same active device', () => {
    const controller = new InputController('touch')
    const keyboard: RaceInputActions = {
      start: false,
      pause: true,
      respawn: true,
    }
    const touch: RaceInputActions = {
      start: true,
      pause: false,
      respawn: false,
    }

    expect(controller.selectActions(keyboard, touch)).toEqual(touch)
  })

  it('can return to a neutral keyboard-safe state', () => {
    const controller = new InputController('touch')
    controller.reset()

    expect(controller.activeDevice).toBe('keyboard')
    expect(controller.selectInput(NEUTRAL_INPUT, NEUTRAL_INPUT)).toEqual(
      NEUTRAL_INPUT,
    )
    expect(controller.selectActions(NO_ACTIONS, NO_ACTIONS)).toEqual(
      NO_ACTIONS,
    )
  })

  it('selects exploration brake from the active device', () => {
    const controller = new InputController('touch')
    const keyboard: ExplorationInput = {
      ...NEUTRAL_INPUT,
      brake: false,
    }
    const touch: ExplorationInput = {
      ...NEUTRAL_INPUT,
      brake: true,
    }

    expect(controller.selectExplorationInput(keyboard, touch)).toEqual(touch)
  })

  it('selects exploration one-shot actions from the active device', () => {
    const controller = new InputController()

    expect(
      controller.selectExplorationActions(
        { pause: false, interact: true, toggleMap: true },
        { pause: true, interact: false, toggleMap: false },
      ),
    ).toEqual({ pause: false, interact: true, toggleMap: true })
  })
})
