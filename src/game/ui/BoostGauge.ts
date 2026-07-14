import type { ExplorationMovement } from '../exploration/explorationFlight'
import { FLIGHT_TUNING } from '../flight/flightModel'
import type { InputDevice } from '../input/InputController'
import type { RacePhase } from '../race/raceState'

export type BoostGaugeContext =
  | {
      readonly mode: 'race'
      readonly phase: RacePhase
    }
  | {
      readonly mode: 'explore'
      readonly movement: ExplorationMovement
      readonly paused: boolean
      readonly mapOpen: boolean
    }

export interface BoostGaugeView {
  readonly visible: boolean
  readonly boostRemaining: number
  readonly inputDevice: InputDevice
  readonly isBoosting?: boolean
}

export interface BoostGauge {
  readonly element: HTMLElement
  update(view: BoostGaugeView): void
  dispose(): void
}

const BOOST_PERCENT_MAX = 100

export function isBoostGaugeVisible(context: BoostGaugeContext): boolean {
  if (context.mode === 'race') {
    return context.phase === 'countdown' || context.phase === 'racing'
  }

  return (
    context.movement === 'airborne' &&
    !context.paused &&
    !context.mapOpen
  )
}

function boostPercent(remaining: number): number {
  if (!Number.isFinite(remaining)) return 0
  return Math.round(
    Math.min(
      BOOST_PERCENT_MAX,
      Math.max(0, (remaining / FLIGHT_TUNING.boostCapacity) * 100),
    ),
  )
}

export function createBoostGauge(host: HTMLElement): BoostGauge {
  const root = document.createElement('div')
  root.className = 'boost-gauge'
  root.dataset.boostGauge = 'true'
  root.hidden = true

  const header = document.createElement('div')
  header.className = 'boost-gauge__header'
  const label = document.createElement('span')
  label.className = 'boost-gauge__label'
  label.textContent = '돌풍'
  const hint = document.createElement('span')
  hint.className = 'boost-gauge__hint'
  hint.dataset.boostHint = 'true'
  const value = document.createElement('strong')
  value.className = 'boost-gauge__value'
  value.dataset.boostValue = 'true'
  header.append(label, hint, value)

  const meter = document.createElement('div')
  meter.className = 'boost-gauge__meter'
  meter.dataset.boostMeter = 'true'
  meter.setAttribute('role', 'meter')
  meter.setAttribute('aria-label', '돌풍 에너지')
  meter.setAttribute('aria-valuemin', '0')
  meter.setAttribute('aria-valuemax', String(BOOST_PERCENT_MAX))
  const fill = document.createElement('span')
  fill.className = 'boost-gauge__fill'
  fill.setAttribute('aria-hidden', 'true')
  meter.append(fill)

  root.append(header, meter)
  host.append(root)

  return {
    element: root,
    update: (view) => {
      const percent = boostPercent(view.boostRemaining)
      root.hidden = !view.visible
      root.dataset.inputDevice = view.inputDevice
      root.dataset.state =
        view.isBoosting === true && percent > 0
          ? 'boosting'
          : percent === 0
            ? 'empty'
          : percent === BOOST_PERCENT_MAX
              ? 'ready'
              : 'recharging'
      root.style.setProperty('--boost-level', `${percent}%`)
      hint.textContent =
        view.inputDevice === 'touch' ? '터치 돌풍' : 'Space / Shift'
      value.textContent = `${percent}%`
      meter.setAttribute('aria-valuenow', String(percent))
      meter.setAttribute('aria-valuetext', `${percent}%`)
    },
    dispose: () => root.remove(),
  }
}
