import { describe, expect, it } from 'vitest'

import {
  createBoostGauge,
  isBoostGaugeVisible,
  type BoostGaugeContext,
} from './BoostGauge'

class TestStyle {
  readonly values = new Map<string, string>()

  setProperty(name: string, value: string): void {
    this.values.set(name, value)
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? ''
  }
}

class TestClassList {
  readonly values = new Set<string>()

  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name)
    if (enabled) this.values.add(name)
    else this.values.delete(name)
    return enabled
  }
}

class TestElement {
  readonly dataset: Record<string, string> = {}
  readonly style = new TestStyle()
  readonly classList = new TestClassList()
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  className = ''
  textContent = ''
  hidden = false
  parent: TestElement | null = null
  replaceChildrenCalls = 0

  append(...elements: TestElement[]): void {
    for (const element of elements) {
      element.parent = this
      this.children.push(element)
    }
  }

  replaceChildren(...elements: TestElement[]): void {
    this.replaceChildrenCalls += 1
    this.children.splice(0)
    this.append(...elements)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  remove(): void {
    if (this.parent === null) return
    const index = this.parent.children.indexOf(this)
    if (index >= 0) this.parent.children.splice(index, 1)
    this.parent = null
  }
}

function findByDataset(
  root: TestElement,
  name: string,
): TestElement {
  if (root.dataset[name] === 'true') return root
  for (const child of root.children) {
    try {
      return findByDataset(child, name)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element [data-${name}]`)
}

function withTestDocument(run: (host: TestElement) => void): void {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  )
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => new TestElement(),
    } as unknown as Document,
  })

  try {
    run(new TestElement())
  } finally {
    if (previousDocument === undefined) {
      Reflect.deleteProperty(globalThis, 'document')
    } else {
      Object.defineProperty(globalThis, 'document', previousDocument)
    }
  }
}

describe('boost gauge visibility', () => {
  it.each([
    [{ mode: 'race', phase: 'racing' }, true],
    [{ mode: 'race', phase: 'ready' }, false],
    [{ mode: 'race', phase: 'countdown' }, true],
    [{ mode: 'race', phase: 'paused' }, false],
    [{ mode: 'race', phase: 'finished' }, false],
    [
      {
        mode: 'explore',
        movement: 'airborne',
        paused: false,
        mapOpen: false,
      },
      true,
    ],
    [
      {
        mode: 'explore',
        movement: 'airborne',
        paused: true,
        mapOpen: false,
      },
      false,
    ],
    [
      {
        mode: 'explore',
        movement: 'airborne',
        paused: false,
        mapOpen: true,
      },
      false,
    ],
    [
      {
        mode: 'explore',
        movement: 'landed',
        paused: false,
        mapOpen: false,
      },
      false,
    ],
  ] satisfies readonly (readonly [BoostGaugeContext, boolean])[])(
    'resolves active flight context %# to %s',
    (context, expected) => {
      expect(isBoostGaugeVisible(context)).toBe(expected)
    },
  )
})

describe('boost gauge DOM contract', () => {
  it('shows 0-100 energy as an accessible meter without rebuilding its DOM', () => {
    withTestDocument((host) => {
      const gauge = createBoostGauge(host as unknown as HTMLElement)

      gauge.update({
        visible: true,
        boostRemaining: 100,
        inputDevice: 'keyboard',
      })
      const meter = findByDataset(
        gauge.element as unknown as TestElement,
        'boostMeter',
      )
      const value = findByDataset(
        gauge.element as unknown as TestElement,
        'boostValue',
      )

      expect(gauge.element.hidden).toBe(false)
      expect(meter.attributes.get('role')).toBe('meter')
      expect(meter.attributes.get('aria-label')).toBe('돌풍 에너지')
      expect(meter.attributes.get('aria-valuemin')).toBe('0')
      expect(meter.attributes.get('aria-valuemax')).toBe('100')
      expect(meter.attributes.get('aria-valuenow')).toBe('100')
      expect(meter.attributes.get('aria-valuetext')).toBe('100%')
      expect(value.textContent).toBe('100%')

      gauge.update({
        visible: true,
        boostRemaining: 42.4,
        inputDevice: 'keyboard',
      })

      expect(
        findByDataset(
          gauge.element as unknown as TestElement,
          'boostMeter',
        ),
      ).toBe(meter)
      expect(
        findByDataset(
          gauge.element as unknown as TestElement,
          'boostValue',
        ),
      ).toBe(value)
      expect(meter.attributes.get('aria-valuenow')).toBe('42')
      expect(meter.attributes.get('aria-valuetext')).toBe('42%')
      expect(value.textContent).toBe('42%')
      expect(
        (gauge.element as unknown as TestElement).replaceChildrenCalls,
      ).toBe(0)

      gauge.update({
        visible: true,
        boostRemaining: 0,
        inputDevice: 'keyboard',
      })

      expect(meter.attributes.get('aria-valuenow')).toBe('0')
      expect(meter.attributes.get('aria-valuetext')).toBe('0%')
      expect(value.textContent).toBe('0%')
    })
  })

  it('switches the control hint between Space or Shift and touch', () => {
    withTestDocument((host) => {
      const gauge = createBoostGauge(host as unknown as HTMLElement)

      gauge.update({
        visible: true,
        boostRemaining: 75,
        inputDevice: 'keyboard',
      })
      const hint = findByDataset(
        gauge.element as unknown as TestElement,
        'boostHint',
      )
      expect(hint.textContent).toBe('Space / Shift')

      gauge.update({
        visible: true,
        boostRemaining: 75,
        inputDevice: 'touch',
      })

      expect(
        findByDataset(
          gauge.element as unknown as TestElement,
          'boostHint',
        ),
      ).toBe(hint)
      expect(hint.textContent).toBe('터치 돌풍')
    })
  })

  it('keeps the overlay hidden outside active flight', () => {
    withTestDocument((host) => {
      const gauge = createBoostGauge(host as unknown as HTMLElement)

      gauge.update({
        visible: false,
        boostRemaining: 64,
        inputDevice: 'keyboard',
      })

      expect(gauge.element.hidden).toBe(true)
    })
  })
})
