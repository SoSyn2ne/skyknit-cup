import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createStoryPrologue } from './StoryPrologue'

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

type TestListener = (event: TestEvent) => void

class TestDocument {
  activeElement: TestElement | null = null

  createElement(tagName: string): TestElement {
    return new TestElement(this, tagName)
  }
}

class TestElement {
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  readonly listeners = new Map<string, TestListener[]>()
  readonly tagName: string
  className = ''
  id = ''
  textContent = ''
  type = ''
  hidden = false
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

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
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

function createFixture() {
  const host = fakeDocument.createElement('main')
  const opener = fakeDocument.createElement('button')
  const close = vi.fn<() => void>()
  const prologue = createStoryPrologue(
    host as unknown as HTMLElement,
    { close },
  )

  return { host, opener, close, prologue }
}

describe('story prologue', () => {
  it('renders the complete opening story in an accessible modal', () => {
    const { prologue, opener } = createFixture()
    prologue.open(opener as unknown as HTMLElement)
    const root = prologue.element as unknown as TestElement
    const dialog = findByAttribute(root, 'role', 'dialog')

    expect(dialog.attributes.get('aria-modal')).toBe('true')
    expect(dialog.attributes.get('aria-label')).toBe('첫 하늘매듭 서막')
    expect(dialog.attributes.get('aria-labelledby')).toBeUndefined()
    expect(findByText(root, '서막 · 끊어진 첫 매듭')).toBeDefined()
    expect(findByText(
      root,
      '태초의 첫 하늘매듭은 세 군도의 바람길을 묶어 매일 새벽을 불러왔다. 잿빛 폭풍이 그 매듭을 찢던 날, 햇실은 하늘동전처럼 빛나는 조각으로 흩어지고 관문은 잠들었다.',
    )).toBeDefined()
    expect(findByText(
      root,
      '해뜰녘 드래곤, 잿불 봉황, 폭풍 백호는 마지막 세 가닥의 햇실을 나누어 지킨다. 한 수호수가 되어 조각을 모으고 관문을 차례로 깨워, 끊어진 길을 다시 묶어라.',
    )).toBeDefined()
    expect(findByText(
      root,
      '하늘에 비치는 반투명한 비행자는 적이 아니다. 먼저 날아간 수호수가 햇실에 남긴 ‘비행의 메아리’다. 그 기록을 넘어 황금 하늘매듭을 완성하면 군도에 새벽이 돌아온다.',
    )).toBeDefined()
    expect(findByText(root, '비행으로 돌아가기').type).toBe('button')
  })

  it('continues the story with the volcanic archipelago chapter', () => {
    const { prologue, opener } = createFixture()
    prologue.open(opener as unknown as HTMLElement)
    const root = prologue.element as unknown as TestElement
    const chapterTitle = findByText(
      root,
      '제2장 · 태양의 심장 — 용암 군도',
    )
    const chapter = chapterTitle.parent

    expect(chapterTitle.tagName).toBe('H3')
    expect(chapter?.tagName).toBe('SECTION')
    expect(chapter?.attributes.get('aria-labelledby')).toBe(chapterTitle.id)
    expect(findByText(
      root,
      '황금 하늘매듭을 완성한 뒤, 용암 군도의 태양의 심장이 깨어났다. 세 냉각 봉인을 차례로 깨우고 분화가 덮치기 전에 하늘길로 탈출하라.',
    )).toBeDefined()
    expect(findByText(
      root,
      '잿불 봉황은 화산의 열기에 온기로 빛나고 폭풍 백호의 깃 가장자리는 청록빛으로 반응한다. 모습은 달라도 두 수호수와 해뜰녘 드래곤의 비행 성능은 모두 같다.',
    )).toBeDefined()
  })

  it('focuses the close action, contains Tab, and restores the opener', () => {
    const { prologue, opener, close } = createFixture()
    prologue.open(opener as unknown as HTMLElement)
    const root = prologue.element as unknown as TestElement
    const dialog = findByAttribute(root, 'role', 'dialog')
    const closeButton = findByText(root, '비행으로 돌아가기')

    expect(fakeDocument.activeElement).toBe(closeButton)

    const tab = dialog.dispatch('keydown', new TestEvent({ key: 'Tab' }))
    expect(tab.defaultPrevented).toBe(true)
    expect(fakeDocument.activeElement).toBe(closeButton)

    closeButton.dispatch('click')
    expect(close).toHaveBeenCalledOnce()
    expect(root.hidden).toBe(true)
    expect(fakeDocument.activeElement).toBe(opener)
  })

  it('stops Escape before the race pause handler and closes only the story', () => {
    const { prologue, opener, close } = createFixture()
    prologue.open(opener as unknown as HTMLElement)
    const root = prologue.element as unknown as TestElement
    const dialog = findByAttribute(root, 'role', 'dialog')

    const escape = dialog.dispatch(
      'keydown',
      new TestEvent({ key: 'Escape' }),
    )

    expect(escape.defaultPrevented).toBe(true)
    expect(escape.propagationStopped).toBe(true)
    expect(close).toHaveBeenCalledOnce()
    expect(root.hidden).toBe(true)
    expect(fakeDocument.activeElement).toBe(opener)
  })
})
