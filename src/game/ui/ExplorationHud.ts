import type { ExplorationMovement } from '../exploration/explorationFlight'
import type { CoinRunState } from '../collectibles/coinRun'
import type { CoinBestTimes } from '../persistence/records'
import type { DestinationGuidance, OpenWorldRegionId } from '../world/openWorldRegions'
import { OPEN_WORLD_REGIONS } from '../world/openWorldRegions'
import { formatMusicVolumePercent, formatRaceTime } from './RaceHud'

export interface ExplorationHudView {
  readonly regionName: string
  readonly discoveredRegionIds: readonly OpenWorldRegionId[]
  readonly destinationRegionId: OpenWorldRegionId | null
  readonly destinationGuidance: DestinationGuidance | null
  readonly movement: ExplorationMovement
  readonly canLand: boolean
  readonly atChallenge: boolean
  readonly mapOpen: boolean
  readonly paused: boolean
  readonly muted: boolean
  readonly musicVolume: number
  readonly coinRun: CoinRunState
  readonly coinBestTimesMs: Readonly<CoinBestTimes>
  readonly coinRunIsNewBest: boolean
}

export interface ExplorationHudActions {
  readonly interact: () => void
  readonly toggleMap: () => void
  readonly selectDestination: (id: OpenWorldRegionId | null) => void
  readonly pause: () => void
  readonly toggleMute: () => void
  readonly setMusicVolume: (volume: number) => void
  readonly returnToMissions: () => void
}

export interface ExplorationHud {
  readonly element: HTMLElement
  update(view: ExplorationHudView): void
  dispose(): void
}

export function formatExploreDistance(distance: number): string {
  if (!Number.isFinite(distance) || distance < 0) return '—'
  if (distance >= 1_000) return `${(distance / 1_000).toFixed(1)} km`
  return `${Math.round(distance)} m`
}

export function formatCoinRunTime(milliseconds: number): string {
  return formatRaceTime(milliseconds)
}

export function getExploreContextLabel(
  atChallenge: boolean,
  movement: ExplorationMovement,
  canLand: boolean,
): string | null {
  if (atChallenge) return '레이스 도전'
  if (movement === 'landed') return '이륙'
  if (canLand && movement === 'airborne') return '착륙'
  return null
}

function button(
  label: string,
  className: string,
  action: () => void,
): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.textContent = label
  element.addEventListener('click', action)
  return element
}

export function createExplorationHud(
  host: HTMLElement,
  actions: ExplorationHudActions,
): ExplorationHud {
  const root = document.createElement('div')
  root.className = 'exploration-hud'

  const region = document.createElement('strong')
  region.className = 'exploration-hud__region'
  region.dataset.exploreRegion = 'true'

  const destination = document.createElement('div')
  destination.className = 'exploration-hud__destination'
  destination.dataset.exploreDestination = 'true'
  destination.setAttribute('aria-live', 'polite')
  const destinationArrow = document.createElement('span')
  destinationArrow.textContent = '➤'
  destinationArrow.setAttribute('aria-hidden', 'true')
  const destinationText = document.createElement('span')
  destination.append(destinationArrow, destinationText)

  const coinRun = document.createElement('div')
  coinRun.className = 'exploration-hud__coin-run'
  coinRun.dataset.coinRun = 'true'
  coinRun.setAttribute('aria-live', 'polite')
  const coinCount = document.createElement('strong')
  const coinTime = document.createElement('span')
  coinRun.append(coinCount, coinTime)

  const controls = document.createElement('div')
  controls.className = 'exploration-hud__controls'
  const createAudioSettings = (
    compact: boolean,
  ): {
    readonly element: HTMLDivElement
    readonly mute: HTMLButtonElement
    readonly volume: HTMLInputElement
    readonly output: HTMLOutputElement
  } => {
    const element = document.createElement('div')
    element.className = 'exploration-hud__audio'
    const mute = button('🔊', 'exploration-hud__mute', actions.toggleMute)
    const label = document.createElement('label')
    const labelText = document.createElement('span')
    labelText.textContent = 'BGM'
    const volume = document.createElement('input')
    volume.type = 'range'
    volume.min = '0'
    volume.max = '100'
    volume.step = '5'
    volume.setAttribute('aria-label', '배경 음악 음량')
    if (compact) volume.dataset.exploreMusicVolume = 'true'
    const output = document.createElement('output')
    volume.addEventListener('input', () => {
      actions.setMusicVolume(volume.valueAsNumber / 100)
    })
    label.append(labelText, volume, output)
    element.append(mute, label)
    return { element, mute, volume, output }
  }
  const audioSettings = createAudioSettings(true)
  const mapButton = button('지도', 'exploration-hud__map-button', actions.toggleMap)
  mapButton.setAttribute('aria-label', '군도 지도 열기')
  mapButton.title = '군도 지도 (M)'
  const pauseButton = button('Ⅱ', 'exploration-hud__pause', actions.pause)
  pauseButton.setAttribute('aria-label', '일시정지')
  pauseButton.title = '일시정지 (Esc)'
  controls.append(audioSettings.element, mapButton, pauseButton)

  const context = button('', 'exploration-hud__context', actions.interact)
  context.dataset.exploreContext = 'true'

  const map = document.createElement('section')
  map.className = 'exploration-hud__map'
  map.setAttribute('aria-label', '군도 지도')
  const mapTitle = document.createElement('h2')
  mapTitle.textContent = '하늘 군도'
  const mapHint = document.createElement('p')
  mapHint.textContent = '목적지를 선택하세요.'
  const mapRegions = document.createElement('div')
  mapRegions.className = 'exploration-hud__map-regions'
  const regionButtons = new Map<OpenWorldRegionId, HTMLButtonElement>()
  for (const entry of OPEN_WORLD_REGIONS) {
    const regionButton = button(
      entry.name,
      'exploration-hud__region-button',
      () => actions.selectDestination(entry.id),
    )
    regionButton.dataset.regionId = entry.id
    regionButtons.set(entry.id, regionButton)
    mapRegions.append(regionButton)
  }
  const clearDestination = button('목적지 해제', 'exploration-hud__clear', () =>
    actions.selectDestination(null),
  )
  const returnButton = button('미션 선택으로', 'exploration-hud__return', actions.returnToMissions)
  map.append(mapTitle, mapHint, mapRegions, clearDestination, returnButton)

  const paused = document.createElement('section')
  paused.className = 'exploration-hud__paused'
  paused.setAttribute('role', 'dialog')
  paused.setAttribute('aria-modal', 'true')
  const pausedTitle = document.createElement('h2')
  pausedTitle.textContent = '탐험 일시정지'
  const pausedAudioSettings = createAudioSettings(false)
  const resume = button('계속 탐험', 'exploration-hud__resume', actions.pause)
  paused.append(
    pausedTitle,
    pausedAudioSettings.element,
    resume,
    returnButton.cloneNode(true),
  )
  const pausedReturn = paused.lastElementChild as HTMLButtonElement
  pausedReturn.addEventListener('click', actions.returnToMissions)

  root.append(region, coinRun, destination, controls, context, map, paused)
  host.append(root)

  return {
    element: root,
    update: (view) => {
      region.textContent = view.regionName
      coinCount.textContent = `동전 ${view.coinRun.collectedCount}/10`
      coinTime.textContent = formatCoinRunTime(
        view.coinRun.finalElapsedMs ?? view.coinRun.elapsedMs,
      )
      coinRun.dataset.phase = view.coinRun.phase
      coinRun.dataset.newBest = String(view.coinRunIsNewBest)
      coinRun.title = view.coinRunIsNewBest ? '지역 최고 기록' : '하늘동전 기록 도전'
      for (const settings of [audioSettings, pausedAudioSettings]) {
        settings.mute.textContent = view.muted ? '🔇' : '🔊'
        const muteAction = view.muted ? '소리 켜기' : '소리 끄기'
        settings.mute.setAttribute('aria-label', muteAction)
        settings.mute.setAttribute('aria-pressed', String(view.muted))
        settings.mute.title = muteAction
        settings.volume.value = String(Math.round(view.musicVolume * 100))
        settings.output.textContent = formatMusicVolumePercent(view.musicVolume)
      }
      const guidance = view.destinationGuidance
      destination.hidden = guidance === null
      if (guidance !== null) {
        destinationArrow.style.transform = `rotate(${guidance.relativeBearingRadians}rad)`
        destinationText.textContent = `${guidance.destination.name} · ${formatExploreDistance(guidance.distance)}`
      }
      const label = getExploreContextLabel(
        view.atChallenge,
        view.movement,
        view.canLand,
      )
      context.hidden = label === null || view.paused
      context.textContent = label ?? ''
      context.setAttribute('aria-label', label ?? '상황 동작')
      map.hidden = !view.mapOpen || view.paused
      mapButton.setAttribute('aria-expanded', String(view.mapOpen))
      for (const [id, regionButton] of regionButtons) {
        const entry = OPEN_WORLD_REGIONS.find((candidate) => candidate.id === id)
        const bestTime = view.coinBestTimesMs[id]
        regionButton.textContent = `${entry?.name ?? id}${
          bestTime === undefined
            ? ''
            : ` · 최고 ${formatCoinRunTime(bestTime)}`
        }`
        regionButton.dataset.discovered = String(
          view.discoveredRegionIds.includes(id),
        )
        regionButton.setAttribute(
          'aria-pressed',
          String(view.destinationRegionId === id),
        )
      }
      paused.hidden = !view.paused
      controls.hidden = view.paused
      region.hidden = view.paused
      coinRun.hidden = view.paused
      destination.hidden = view.paused || guidance === null
    },
    dispose: () => root.remove(),
  }
}
