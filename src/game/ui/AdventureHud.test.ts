import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EMPTY_ADVENTURE_PROGRESS } from '../adventure/adventureState'
import { createAdventureHud, type AdventureHudView } from './AdventureHud'
import { getWindPuzzleView } from '../adventure/windPuzzle'

class TestElement {
  readonly dataset: Record<string, string> = {}
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  readonly listeners = new Map<string, (() => void)[]>()
  readonly style = { setProperty: vi.fn() }
  readonly focus = vi.fn()
  className = ''
  id = ''
  type = ''
  title = ''
  hidden = false
  disabled = false
  textContent = ''
  parent: TestElement | null = null

  append(...elements: TestElement[]): void {
    for (const element of elements) {
      element.parent = this
      this.children.push(element)
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  click(): void {
    if (!this.disabled) for (const listener of this.listeners.get('click') ?? []) listener()
  }

  remove(): void {
    if (!this.parent) return
    this.parent.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
  }
}

function find(root: TestElement, key: string, value = 'true'): TestElement {
  if (root.dataset[key] === value) return root
  for (const child of root.children) {
    try { return find(child, key, value) } catch { /* Search the next branch. */ }
  }
  throw new Error(`Missing ${key}=${value}`)
}

function countNodes(root: TestElement): number {
  return 1 + root.children.reduce((sum, child) => sum + countNodes(child), 0)
}

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => new TestElement() })
})
afterEach(() => vi.unstubAllGlobals())

function fixture(overrides: Partial<AdventureHudView> = {}) {
  const host = new TestElement()
  const actions = {
    start: vi.fn(), interact: vi.fn(), chooseRoute: vi.fn(), sense: vi.fn(),
    toggleCharm: vi.fn(), toggleDecoration: vi.fn(), openRace: vi.fn(),
    rotateDevice: vi.fn(), closeDevice: vi.fn(),
  }
  const hud = createAdventureHud(host as unknown as HTMLElement, actions)
  const view: AdventureHudView = {
    visible: true, intro: false, paused: false, competitionActive: false,
    progress: EMPTY_ADVENTURE_PROGRESS,
    objective: {
      id: 'keeper', label: '누리에게 다가가기', description: '둥지 옆 누리의 이야기를 들어 보세요.',
      position: { x: 0, y: 0, z: 0 }, interactionRadius: 18, actionLabel: '이야기 듣기',
    },
    distance: 84.4, bearingRadians: 0, canInteract: false, canSense: false,
    senseActive: false, notice: null, inputDevice: 'keyboard', ...overrides,
  }
  hud.update(view)
  return { host, actions, hud, view, root: hud.element as unknown as TestElement }
}

describe('adventure HUD', () => {
  it('separates circuit ports from terminal labels without rebuilding tiles', () => {
    const device = getWindPuzzleView('ridge-heart')!
    const { root, hud, view } = fixture({ deviceOpen: true, device })
    const tile = find(root, 'adventureDeviceTile', String(device.start))
    const pipe = find(tile, 'adventureDevicePipe')
    const terminal = find(tile, 'adventureDeviceTerminal')
    expect(pipe.dataset.ports).toBe(String(device.masks[device.start]))
    expect(terminal.textContent).toBe('입구')
    expect(pipe.attributes.get('aria-hidden')).toBe('true')
    const originalCount = countNodes(root)
    hud.update({ ...view, device: getWindPuzzleView('ridge-heart', Array(25).fill(0)) })
    expect(find(tile, 'adventureDevicePipe')).toBe(pipe)
    expect(pipe.dataset.ports).toBe('9')
    expect(countNodes(root)).toBe(originalCount)
  })
  it('renders an actionable circuit and enables activation only when fully connected', () => {
    const { root, hud, view, actions } = fixture({ deviceOpen: true, device: getWindPuzzleView('ridge-vane'), canInteract: true })
    expect(find(root, 'adventureDevice').hidden).toBe(false)
    expect(find(root, 'adventureDeviceActivate').disabled).toBe(true)
    find(root, 'adventureDeviceTile', '0').click()
    expect(actions.rotateDevice).toHaveBeenCalledWith(0)
    hud.update({ ...view, device: getWindPuzzleView('ridge-vane', Array(9).fill(0)) })
    expect(find(root, 'adventureDeviceActivate').disabled).toBe(false)
    find(root, 'adventureDeviceActivate').click()
    expect(actions.interact).toHaveBeenCalledOnce()
    find(root, 'adventureDeviceClose').click()
    expect(actions.closeDevice).toHaveBeenCalledOnce()
  })
  it('starts from a compact introduction with a secondary race entry and resumes saves', () => {
    const { root, actions, hud, view } = fixture({ intro: true })
    const start = find(root, 'adventureStart')
    expect(find(root, 'adventureIntro').hidden).toBe(false)
    expect(find(root, 'adventureTracker').hidden).toBe(true)
    expect(start.textContent).toBe('모험 시작')
    start.click()
    find(root, 'adventureRace').click()
    expect(actions.start).toHaveBeenCalledOnce()
    expect(actions.openRace).toHaveBeenCalledOnce()
    hud.update({ ...view, progress: { ...view.progress, started: true } })
    expect(start.textContent).toBe('이어하기')
  })

  it('shows one current objective with distance and exposes interaction only when close', () => {
    const { root, hud, view, actions } = fixture()
    const interact = find(root, 'adventureInteract')
    expect(find(root, 'adventureObjective').textContent).toBe('누리에게 다가가기')
    expect(find(root, 'adventureDistance').textContent).toContain('84 m')
    expect(interact.hidden).toBe(true)
    interact.click()
    expect(actions.interact).not.toHaveBeenCalled()
    hud.update({ ...view, canInteract: true, distance: 8 })
    expect(interact.hidden).toBe(false)
    expect(interact.textContent).toBe('E · 이야기 듣기')
    interact.click()
    expect(actions.interact).toHaveBeenCalledOnce()
    hud.update({ ...view, inputDevice: 'touch', canInteract: true })
    expect(interact.textContent).toBe('이야기 듣기')
  })

  it('offers two routes only at the nearby route-choice stage', () => {
    const { root, hud, view, actions } = fixture()
    const sheltered = find(root, 'adventureRoute', 'sheltered')
    expect(find(root, 'adventureRoutes').hidden).toBe(true)
    hud.update({ ...view, progress: { ...view.progress, stage: 'choose-route' }, canInteract: true })
    expect(find(root, 'adventureRoutes').hidden).toBe(false)
    sheltered.click()
    find(root, 'adventureRoute', 'ridge').click()
    expect(actions.chooseRoute.mock.calls).toEqual([['sheltered'], ['ridge']])
    hud.update({ ...view, progress: { ...view.progress, stage: 'choose-route' } })
    sheltered.click()
    expect(actions.chooseRoute).toHaveBeenCalledTimes(2)
  })

  it('locks rewards with the acquisition condition and reflects equipped state without mutation', () => {
    const { root, hud, view, actions } = fixture()
    find(root, 'adventureRewardsToggle').click()
    const lanterns = find(root, 'adventureReward', 'lanterns')
    const charm = find(root, 'adventureReward', 'charm')
    expect(find(root, 'adventureRewards').hidden).toBe(false)
    expect(lanterns.disabled).toBe(true)
    expect(lanterns.title).toContain('바람새')
    lanterns.click()
    expect(actions.toggleDecoration).not.toHaveBeenCalled()
    const progress = {
      ...view.progress, claimedRewardIds: ['rescue-bird', 'wind-route', 'restore-nest'] as const,
      equippedCharm: true, placedDecorations: ['lanterns'] as const,
    }
    hud.update({ ...view, progress })
    expect(lanterns.disabled).toBe(false)
    expect(lanterns.attributes.get('aria-pressed')).toBe('true')
    expect(charm.attributes.get('aria-pressed')).toBe('true')
    lanterns.click()
    charm.click()
    expect(actions.toggleDecoration).toHaveBeenCalledWith('lanterns')
    expect(actions.toggleCharm).toHaveBeenCalledOnce()
    expect(progress.placedDecorations).toEqual(['lanterns'])
  })

  it('enables sensing only when available and hides every adventure control during competition or pause', () => {
    const { root, hud, view, actions } = fixture()
    const sense = find(root, 'adventureSense')
    sense.click()
    expect(actions.sense).not.toHaveBeenCalled()
    const unlocked = { ...view, progress: { ...view.progress, claimedRewardIds: ['rescue-bird'] as const }, canSense: true }
    hud.update(unlocked)
    sense.click()
    expect(actions.sense).toHaveBeenCalledOnce()
    for (const state of [{ paused: true }, { competitionActive: true }, { visible: false }]) {
      hud.update({ ...unlocked, ...state })
      expect(root.hidden).toBe(true)
      sense.click()
    }
    expect(actions.sense).toHaveBeenCalledOnce()
  })

  it('preserves DOM identity and single action listeners across repeated frame updates', () => {
    const { root, hud, view, actions, host } = fixture({ canInteract: true })
    const interact = find(root, 'adventureInteract')
    const originalCount = countNodes(root)
    for (let frame = 0; frame < 120; frame += 1) hud.update({ ...view, distance: frame })
    expect(countNodes(root)).toBe(originalCount)
    expect(find(root, 'adventureInteract')).toBe(interact)
    interact.click()
    expect(actions.interact).toHaveBeenCalledOnce()
    expect(root.listeners.has('keydown')).toBe(false)
    hud.dispose()
    expect(host.children).toHaveLength(0)
    interact.click()
    expect(actions.interact).toHaveBeenCalledOnce()
  })

  it('keeps guidance finite, reports progress, and exposes an accessible one-shot notice', () => {
    const { root, hud, view } = fixture({ distance: Number.NaN, bearingRadians: Number.NaN })
    expect(find(root, 'adventureDistance').textContent).toBe('방향 확인 중 · —')
    hud.update({ ...view, distance: 1420, bearingRadians: Math.PI / 2, notice: '등불을 받았어요.', progress: { ...view.progress, bondXp: 2 } })
    expect(find(root, 'adventureDistance').textContent).toBe('→ 오른쪽 · 1.4 km')
    expect(find(root, 'adventureBond').textContent).toBe('유대 2')
    expect(find(root, 'adventureNotice').attributes.get('role')).toBe('status')
    expect(find(root, 'adventureNotice').textContent).toBe('등불을 받았어요.')
    hud.update({ ...view, notice: null })
    expect(find(root, 'adventureNotice').hidden).toBe(true)
  })
})
