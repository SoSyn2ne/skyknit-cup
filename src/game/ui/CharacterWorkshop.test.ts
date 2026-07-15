import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createCharacterWorkshop,
  type CharacterLoadout,
} from './CharacterWorkshop'

type TestListener = (event: TestEvent) => void

class TestEvent {
  readonly key: string
  readonly shiftKey: boolean
  defaultPrevented = false
  propagationStopped = false

  constructor(options: { key?: string; shiftKey?: boolean } = {}) {
    this.key = options.key ?? ''
    this.shiftKey = options.shiftKey ?? false
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

class TestDocument {
  activeElement: TestElement | null = null

  createElement(tagName: string): TestElement {
    return new TestElement(this, tagName)
  }
}

class TestElement {
  readonly dataset: Record<string, string> = {}
  readonly style: Record<string, string> = {}
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  readonly listeners = new Map<string, TestListener[]>()
  readonly tagName: string
  className = ''
  id = ''
  htmlFor = ''
  type = ''
  textContent = ''
  hidden = false
  disabled = false
  value = ''
  focusCalls = 0
  parent: TestElement | null = null

  constructor(
    private readonly ownerDocument: TestDocument,
    tagName: string,
  ) {
    this.tagName = tagName.toUpperCase()
  }

  append(...elements: TestElement[]): void {
    for (const element of elements) {
      element.parent = this
      this.children.push(element)
    }
  }

  replaceChildren(...elements: TestElement[]): void {
    this.children.splice(0)
    this.append(...elements)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  addEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type: string, event = new TestEvent()): TestEvent {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
    return event
  }

  focus(): void {
    this.focusCalls += 1
    this.ownerDocument.activeElement = this
  }

  remove(): void {
    if (this.parent === null) return
    const index = this.parent.children.indexOf(this)
    if (index >= 0) this.parent.children.splice(index, 1)
    this.parent = null
  }
}

function findByText(root: TestElement, text: string): TestElement {
  if (root.textContent === text) return root
  for (const child of root.children) {
    try {
      return findByText(child, text)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element with text ${text}`)
}

function findByAttribute(
  root: TestElement,
  name: string,
  value: string,
): TestElement {
  if (root.attributes.get(name) === value) return root
  for (const child of root.children) {
    try {
      return findByAttribute(child, name, value)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element [${name}="${value}"]`)
}

function findControlForLabel(root: TestElement, labelText: string): TestElement {
  const label = findByText(root, labelText)
  const control = findById(root, label.htmlFor)
  if (control.tagName !== 'SELECT') {
    throw new Error(`${labelText} must label a native select`)
  }
  return control
}

function findById(root: TestElement, id: string): TestElement {
  if (root.id === id) return root
  for (const child of root.children) {
    try {
      return findById(child, id)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element #${id}`)
}

const committedLoadout: CharacterLoadout = {
  characterId: 'sunrise-dragon',
  paletteId: 'sunrise',
  accessoryId: 'none',
}

let fakeDocument: TestDocument
let previousDocument: PropertyDescriptor | undefined

beforeEach(() => {
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  fakeDocument = new TestDocument()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument as unknown as Document,
  })
})

afterEach(() => {
  if (previousDocument === undefined) {
    Reflect.deleteProperty(globalThis, 'document')
  } else {
    Object.defineProperty(globalThis, 'document', previousDocument)
  }
})

function createWorkshopFixture() {
  const host = fakeDocument.createElement('main')
  const opener = fakeDocument.createElement('button')
  const preview = vi.fn<(loadout: CharacterLoadout) => void>()
  const apply = vi.fn<(loadout: CharacterLoadout) => void>()
  const cancel = vi.fn<() => void>()
  const workshop = createCharacterWorkshop(
    host as unknown as HTMLElement,
    { preview, apply, cancel },
  )

  return { host, opener, preview, apply, cancel, workshop }
}

describe('character workshop', () => {
  it('renders an accessible modal with three labelled native selectors', () => {
    const { workshop, opener } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const dialog = findByAttribute(root, 'role', 'dialog')

    expect(dialog.attributes.get('aria-modal')).toBe('true')
    expect(findByText(root, '캐릭터 꾸미기')).toBeDefined()
    expect(findControlForLabel(root, '캐릭터 형태').children.map(
      (option) => option.value,
    )).toEqual(['sunrise-dragon', 'ember-phoenix', 'storm-white-tiger'])
    expect(findControlForLabel(root, '색상').children.map(
      (option) => option.value,
    )).toEqual(['sunrise', 'storm', 'moonlight'])
    expect(findControlForLabel(root, '장식').children.map(
      (option) => option.value,
    )).toEqual(['none', 'wind-goggles', 'festival-ribbon'])
    expect(findByText(root, '적용').type).toBe('button')
    expect(findByText(root, '돌아가기').type).toBe('button')
  })

  it('loads the committed choices and initially focuses the character selector', () => {
    const { workshop, opener } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const character = findControlForLabel(root, '캐릭터 형태')

    expect(character.value).toBe('sunrise-dragon')
    expect(findControlForLabel(root, '색상').value).toBe('sunrise')
    expect(findControlForLabel(root, '장식').value).toBe('none')
    expect(fakeDocument.activeElement).toBe(character)
  })

  it('updates the guardian story while previewing a different silhouette', () => {
    const { workshop, opener, preview, apply } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const character = findControlForLabel(root, '캐릭터 형태')

    const guardianDescription = findByText(
      root,
      '첫 하늘매듭의 길을 기억하고 잠든 바람 관문을 깨우는 새벽의 수호자',
    )
    expect(guardianDescription.attributes.get('aria-live')).toBe('polite')

    character.value = 'ember-phoenix'
    character.dispatch('change')

    expect(findByText(
      root,
      '구름 유적의 잿불에서 되살아나 흩어진 햇실 조각에 온기를 되돌리는 수호자',
    )).toBeDefined()
    expect(preview).toHaveBeenCalledOnce()
    expect(preview).toHaveBeenCalledWith({
      ...committedLoadout,
      characterId: 'ember-phoenix',
    })
    expect(apply).not.toHaveBeenCalled()
  })

  it('previews the complete draft after each selector change', () => {
    const { workshop, opener, preview } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const character = findControlForLabel(root, '캐릭터 형태')
    const palette = findControlForLabel(root, '색상')
    const accessory = findControlForLabel(root, '장식')

    character.value = 'ember-phoenix'
    character.dispatch('change')
    palette.value = 'moonlight'
    palette.dispatch('change')
    accessory.value = 'festival-ribbon'
    accessory.dispatch('change')

    expect(preview.mock.calls).toEqual([
      [{ ...committedLoadout, characterId: 'ember-phoenix' }],
      [{
        ...committedLoadout,
        characterId: 'ember-phoenix',
        paletteId: 'moonlight',
      }],
      [{
        characterId: 'ember-phoenix',
        paletteId: 'moonlight',
        accessoryId: 'festival-ribbon',
      }],
    ])
  })

  it('applies the current draft, closes, and restores opener focus', () => {
    const { workshop, opener, apply } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const character = findControlForLabel(root, '캐릭터 형태')
    character.value = 'storm-white-tiger'
    character.dispatch('change')

    findByText(root, '적용').dispatch('click')

    expect(apply).toHaveBeenCalledWith({
      ...committedLoadout,
      characterId: 'storm-white-tiger',
    })
    expect(root.hidden).toBe(true)
    expect(fakeDocument.activeElement).toBe(opener)
  })

  it('restores the committed preview when 돌아가기 cancels the draft', () => {
    const { workshop, opener, preview, cancel } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const palette = findControlForLabel(root, '색상')
    palette.value = 'storm'
    palette.dispatch('change')

    findByText(root, '돌아가기').dispatch('click')

    expect(preview).toHaveBeenLastCalledWith(committedLoadout)
    expect(cancel).toHaveBeenCalledOnce()
    expect(root.hidden).toBe(true)
    expect(fakeDocument.activeElement).toBe(opener)
  })

  it('stops Escape propagation while cancelling and restoring focus', () => {
    const { workshop, opener, preview, cancel } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const dialog = findByAttribute(root, 'role', 'dialog')
    const event = dialog.dispatch('keydown', new TestEvent({ key: 'Escape' }))

    expect(event.defaultPrevented).toBe(true)
    expect(event.propagationStopped).toBe(true)
    expect(preview).toHaveBeenLastCalledWith(committedLoadout)
    expect(cancel).toHaveBeenCalledOnce()
    expect(root.hidden).toBe(true)
    expect(fakeDocument.activeElement).toBe(opener)
  })

  it('contains forward and reverse Tab focus inside the modal', () => {
    const { workshop, opener } = createWorkshopFixture()
    workshop.open(committedLoadout, opener as unknown as HTMLElement)
    const root = workshop.element as unknown as TestElement
    const dialog = findByAttribute(root, 'role', 'dialog')
    const first = findControlForLabel(root, '캐릭터 형태')
    const last = findByText(root, '돌아가기')

    last.focus()
    const forward = dialog.dispatch('keydown', new TestEvent({ key: 'Tab' }))
    expect(forward.defaultPrevented).toBe(true)
    expect(fakeDocument.activeElement).toBe(first)

    first.focus()
    const reverse = dialog.dispatch(
      'keydown',
      new TestEvent({ key: 'Tab', shiftKey: true }),
    )
    expect(reverse.defaultPrevented).toBe(true)
    expect(fakeDocument.activeElement).toBe(last)
  })
})
