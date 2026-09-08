import {
  ADVENTURE_REWARD_IDS,
  getAdventureBondLevel,
  type AdventureDecoration,
  type AdventureObjective,
  type AdventureProgress,
  type AdventureRouteId,
} from '../adventure/adventureState'
import { formatExploreDistance } from './ExplorationHud'
import './adventure.css'
import type { WindPuzzleView } from '../adventure/windPuzzle'

export interface AdventureHudActions {
  readonly start: () => void
  readonly interact: () => void
  readonly chooseRoute: (route: AdventureRouteId) => void
  readonly sense: () => void
  readonly toggleCharm: () => void
  readonly toggleDecoration: (id: AdventureDecoration) => void
  readonly openRace: () => void
  readonly rotateDevice?: (index: number) => void
  readonly closeDevice?: () => void
}

export interface AdventureHudView {
  readonly visible: boolean
  readonly intro: boolean
  readonly paused: boolean
  readonly competitionActive: boolean
  readonly progress: AdventureProgress
  readonly objective: AdventureObjective
  readonly distance: number
  readonly bearingRadians: number
  readonly canInteract: boolean
  readonly canSense: boolean
  readonly senseActive: boolean
  readonly notice: string | null
  readonly inputDevice: 'keyboard' | 'touch'
  readonly device?: WindPuzzleView | null
  readonly deviceOpen?: boolean
}

export interface AdventureHud {
  readonly element: HTMLElement
  update(view: AdventureHudView): void
  dispose(): void
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, part: string, text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = `adventure-hud__${part}`
  element.textContent = text
  return element
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value
}

function directionLabel(bearing: number): string {
  if (!Number.isFinite(bearing)) return '방향 확인 중'
  const angle = Math.atan2(Math.sin(bearing), Math.cos(bearing))
  if (Math.abs(angle) < Math.PI / 6) return '↑ 앞쪽'
  if (Math.abs(angle) > Math.PI * 5 / 6) return '↓ 뒤쪽'
  return angle > 0 ? '→ 오른쪽' : '← 왼쪽'
}

export function createAdventureHud(host: HTMLElement, actions: AdventureHudActions): AdventureHud {
  const root = node('div', 'root')
  root.className = 'adventure-hud'
  root.dataset.adventureHud = 'true'
  root.hidden = true
  let disposed = false
  let rewardsOpen = false

  const button = (part: string, label: string, action: () => void): HTMLButtonElement => {
    const element = node('button', part, label)
    element.type = 'button'
    element.title = label
    element.addEventListener('click', () => {
      if (!disposed && !root.hidden && !element.disabled && !element.hidden) action()
    })
    return element
  }

  const intro = node('section', 'intro')
  intro.dataset.adventureIntro = 'true'
  intro.setAttribute('aria-label', '돌아오는 바람 · 첫 모험')
  const introCopy = node('p', 'intro-copy', '잠든 둥지에 바람을 돌려주세요. 작은 바람새를 구하고, 수호수와 함께 돌아올 곳을 만들어 가요.')
  const start = button('primary', '모험 시작', actions.start)
  start.dataset.adventureStart = 'true'
  const race = button('secondary', '레이스 도전', actions.openRace)
  race.dataset.adventureRace = 'true'
  const introActions = node('div', 'intro-actions')
  introActions.append(start, race)
  const inputHint = node('p', 'input-hint')
  intro.append(node('span', 'eyebrow', '첫 모험 · 버려진 수호수 둥지'), node('h1', 'title', '돌아오는 바람'), introCopy, introActions, inputHint)

  const tracker = node('section', 'tracker')
  tracker.dataset.adventureTracker = 'true'
  tracker.setAttribute('aria-label', '현재 모험 의뢰')
  const bond = node('span', 'bond')
  bond.dataset.adventureBond = 'true'
  const label = node('strong', 'objective')
  label.dataset.adventureObjective = 'true'
  const description = node('p', 'description')
  const distance = node('span', 'distance')
  distance.dataset.adventureDistance = 'true'
  const meta = node('div', 'meta')
  meta.append(distance, bond)
  const toolbar = node('div', 'toolbar')
  const sense = button('secondary', '유적 감지', actions.sense)
  sense.dataset.adventureSense = 'true'
  const rewardsToggle = button('secondary', '받은 선물', () => {
    rewardsOpen = !rewardsOpen
    rewards.hidden = !rewardsOpen
    rewardsToggle.setAttribute('aria-expanded', String(rewardsOpen))
  })
  rewardsToggle.dataset.adventureRewardsToggle = 'true'
  rewardsToggle.setAttribute('aria-expanded', 'false')
  toolbar.append(sense, rewardsToggle)
  tracker.append(label, description, meta, toolbar)

  const routes = node('div', 'routes')
  routes.dataset.adventureRoutes = 'true'
  routes.setAttribute('aria-label', '풍차로 가는 항로 선택')
  for (const [id, name, copy] of [
    ['sheltered', '피난길', '넓고 낮은 바람길'],
    ['ridge', '능선길', '짧고 높은 바람길'],
  ] as const) {
    const choice = button('route', '', () => actions.chooseRoute(id))
    choice.dataset.adventureRoute = id
    choice.title = `${name} · ${copy}`
    choice.append(node('strong', 'route-name', name), node('span', 'route-description', copy))
    routes.append(choice)
  }
  tracker.append(routes)

  const interact = button('interact', '', actions.interact)
  interact.dataset.adventureInteract = 'true'
  const notice = node('p', 'notice')
  notice.dataset.adventureNotice = 'true'
  notice.setAttribute('role', 'status')
  notice.setAttribute('aria-live', 'polite')

  const rewards = node('section', 'rewards')
  rewards.dataset.adventureRewards = 'true'
  rewards.setAttribute('aria-label', '모험으로 받은 선물')
  rewards.hidden = true
  const closeRewards = button('close', '닫기', () => {
    rewardsOpen = false
    rewards.hidden = true
    rewardsToggle.setAttribute('aria-expanded', 'false')
    rewardsToggle.focus({ preventScroll: true })
  })
  closeRewards.setAttribute('aria-label', '선물 패널 닫기')
  const rewardHeading = node('div', 'rewards-heading')
  rewardHeading.append(node('h2', 'rewards-title', '함께 모은 선물'), closeRewards)
  rewards.append(rewardHeading, node('p', 'reward-caption', '수호수와 둥지에 적용돼요. 비행 성능은 변하지 않아요.'))
  const rewardButtons = [
    { id: 'lanterns', name: '둥지 등불', reward: ADVENTURE_REWARD_IDS.rescue, condition: '바람새를 둥지로 데려오면 열려요.', action: () => actions.toggleDecoration('lanterns') },
    { id: 'pennants', name: '바람 깃발', reward: ADVENTURE_REWARD_IDS.route, condition: '선택한 항로의 장치를 깨우면 열려요.', action: () => actions.toggleDecoration('pennants') },
    { id: 'charm', name: '수호수 햇실 매듭', reward: ADVENTURE_REWARD_IDS.restoration, condition: '둥지의 풍차를 복구하면 열려요.', action: actions.toggleCharm },
  ] as const
  const rewardRows = rewardButtons.map((reward) => {
    const row = node('div', 'reward-row')
    const control = button('reward', reward.name, reward.action)
    control.dataset.adventureReward = reward.id
    const hint = node('span', 'reward-condition', reward.condition)
    row.append(control, hint)
    rewards.append(row)
    return { ...reward, control, hint }
  })

  const devicePanel = node('section', 'device')
  devicePanel.dataset.adventureDevice = 'true'
  devicePanel.setAttribute('role', 'dialog')
  devicePanel.setAttribute('aria-modal', 'true')
  devicePanel.setAttribute('aria-label', '바람길 장치')
  const deviceHeading = node('div', 'rewards-heading')
  const deviceClose = button('secondary', '닫기', () => actions.closeDevice?.())
  deviceClose.dataset.adventureDeviceClose = 'true'
  deviceHeading.append(node('h2', 'device-title', '바람길을 이어 주세요'), deviceClose)
  const deviceCopy = node('p', 'description', '조각을 눌러 돌리고 모든 조각에 바람을 보내세요. 입구와 출구의 화살표를 확인해요.')
  const deviceStatus = node('p', 'device-status')
  deviceStatus.dataset.adventureDeviceStatus = 'true'
  deviceStatus.setAttribute('aria-live', 'polite')
  const deviceGrid = node('div', 'device-grid')
  const tiles = Array.from({ length: 25 }, (_, index) => {
    const tile = button('device-tile', '', () => actions.rotateDevice?.(index))
    tile.dataset.adventureDeviceTile = String(index)
    const pipe = node('span', 'device-pipe')
    pipe.dataset.adventureDevicePipe = 'true'
    pipe.setAttribute('aria-hidden', 'true')
    const ports = ['north', 'east', 'south', 'west'].map(direction => {
      const port = node('span', `device-port device-port--${direction}`)
      port.className = `adventure-hud__device-port adventure-hud__device-port--${direction}`
      pipe.append(port)
      return port
    })
    const terminal = node('span', 'device-terminal')
    terminal.dataset.adventureDeviceTerminal = 'true'
    terminal.setAttribute('aria-hidden', 'true')
    tile.append(pipe, terminal)
    deviceGrid.append(tile)
    return { tile, pipe, ports, terminal }
  })
  const deviceActivate = button('primary', '바람 연결', actions.interact)
  deviceActivate.dataset.adventureDeviceActivate = 'true'
  const deviceFooter = node('div', 'device-footer')
  deviceFooter.append(deviceActivate)
  devicePanel.append(deviceHeading, deviceCopy, deviceStatus, deviceGrid, deviceFooter)
  devicePanel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); actions.closeDevice?.() }
    if (event.key === 'Tab') {
      const focusable = Array.from(devicePanel.querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([hidden])'))
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  })
  let previousDeviceOpen = false
  root.append(intro, tracker, interact, notice, rewards, devicePanel)
  host.append(root)

  return {
    element: root,
    update(view) {
      if (disposed) return
      root.hidden = !view.visible || view.paused || view.competitionActive
      root.dataset.intro = String(view.intro)
      root.dataset.inputDevice = view.inputDevice
      intro.hidden = !view.intro
      tracker.hidden = view.intro
      setText(start, view.progress.started ? '이어하기' : '모험 시작')
      setText(inputHint, view.inputDevice === 'touch' ? '왼쪽 조이스틱으로 비행 · 가까이 가서 동작 버튼' : 'WASD / 방향키 비행 · 가까이 가서 E')
      setText(label, view.objective.label)
      setText(description, view.objective.description)
      setText(distance, `${directionLabel(view.bearingRadians)} · ${formatExploreDistance(view.distance)}`)
      const bondLevel = getAdventureBondLevel(view.progress)
      const discoveryPercent = Math.round((view.progress.bondXp % 1) * 100)
      setText(bond, `유대 ${bondLevel}${bondLevel < 3 && discoveryPercent > 0 ? ` · ${discoveryPercent}%` : ''}`)
      routes.hidden = view.intro || view.progress.stage !== 'choose-route' || !view.canInteract
      for (const choice of Array.from(routes.children)) (choice as HTMLButtonElement).disabled = routes.hidden
      interact.hidden = view.intro || !view.canInteract || view.progress.stage === 'choose-route' || view.objective.id === 'complete' || view.deviceOpen === true
      interact.disabled = interact.hidden
      setText(interact, `${view.inputDevice === 'keyboard' ? 'E · ' : ''}${view.device ? '장치 살펴보기' : view.objective.actionLabel}`)
      interact.title = view.objective.actionLabel
      sense.hidden = !view.progress.claimedRewardIds.includes(ADVENTURE_REWARD_IDS.rescue)
      sense.disabled = !view.canSense || view.senseActive
      setText(sense, view.senseActive ? '감지 중…' : '유적 감지')
      sense.title = view.canSense ? '숨은 유적의 바람 결을 감지합니다' : '안내하는 탐험 지점에 가까이 가면 감지할 수 있어요'
      notice.hidden = view.intro || !view.notice || view.notice === view.objective.label
      setText(notice, view.notice ?? '')
      rewards.hidden = !rewardsOpen || view.intro
      const device = view.device
      const deviceOpen = view.deviceOpen === true && device !== null && device !== undefined && !root.hidden
      devicePanel.hidden = !deviceOpen
      if (deviceOpen && device) {
        tracker.hidden = true
        notice.hidden = true
        rewards.hidden = true
        deviceGrid.style.setProperty('--device-size', String(device.size))
        const powered = device.powered.filter(Boolean).length
        setText(deviceStatus, device.connected ? '모든 조각에 바람이 닿았어요!' : `바람 ${powered}/${device.masks.filter(Boolean).length} · 왼쪽 입구 → 오른쪽 출구`)
        for (let index = 0; index < tiles.length; index++) {
          const { tile, pipe, ports, terminal } = tiles[index]
          const mask = device.masks[index] ?? 0
          tile.hidden = index >= device.masks.length
          tile.disabled = tile.hidden || mask === 0
          tile.dataset.ports = String(mask)
          tile.dataset.powered = String(device.powered[index] ?? false)
          tile.dataset.terminal = index === device.start ? 'in' : index === device.end ? 'out' : ''
          pipe.hidden = mask === 0
          pipe.dataset.ports = String(mask)
          ports.forEach((port, direction) => { port.hidden = (mask & (1 << direction)) === 0 })
          terminal.hidden = index !== device.start && index !== device.end
          setText(terminal, index === device.start ? '입구' : index === device.end ? '출구' : '')
          const directions = ['위', '오른쪽', '아래', '왼쪽'].filter((_, direction) => (mask & (1 << direction)) !== 0).join('·')
          tile.setAttribute('aria-label', `${Math.floor(index / device.size) + 1}행 ${index % device.size + 1}열 바람 조각 돌리기${index === device.start ? ' · 입구' : index === device.end ? ' · 출구' : ''} · ${directions}${device.powered[index] ? ' · 바람 연결됨' : ''}`)
        }
        deviceActivate.disabled = !device.connected
        if (!previousDeviceOpen) deviceClose.focus({ preventScroll: true })
      }
      previousDeviceOpen = deviceOpen
      for (const reward of rewardRows) {
        const unlocked = view.progress.claimedRewardIds.includes(reward.reward)
        const equipped = reward.id === 'charm' ? view.progress.equippedCharm : view.progress.placedDecorations.includes(reward.id)
        reward.control.disabled = !unlocked
        reward.control.setAttribute('aria-pressed', String(equipped))
        reward.control.title = unlocked ? `${reward.name} ${equipped ? '해제' : '적용'}` : reward.condition
        setText(reward.control, `${reward.name} · ${unlocked ? equipped ? '적용 중' : '적용' : '잠김'}`)
        setText(reward.hint, unlocked ? equipped ? '다시 누르면 해제돼요.' : '눌러서 적용해 보세요.' : reward.condition)
      }
    },
    dispose() {
      disposed = true
      root.remove()
    },
  }
}
