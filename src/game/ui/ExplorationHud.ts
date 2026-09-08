import type { ExplorationMovement } from '../exploration/explorationFlight'
import type { CoinRunState } from '../collectibles/coinRun'
import type { CoinBestTimes } from '../persistence/records'
import type { RaceLeaguePlacement } from '../race/raceState'
import type { SkyLeagueRecords } from '../competition/skyLeagueRecords'
import { formatGhostDelta } from '../competition/ghostRun'
import {
  MISSION_CATALOG,
  type MissionId,
} from '../missions/missionRules'
import {
  FESTIVAL_HUB_LANDMARKS,
  FESTIVAL_HUB_WIND_ZONES,
  type FestivalDiscoveryStep,
  type FestivalJourney,
} from '../world/festivalHubActivities'
import type { DestinationGuidance, OpenWorldRegionId } from '../world/openWorldRegions'
import { OPEN_WORLD_REGIONS } from '../world/openWorldRegions'
import {
  formatLeagueMedal,
  formatMusicVolumePercent,
  formatRaceTime,
  updateCachedDom,
} from './RaceHud'
import type { GateIndicatorState } from './gateIndicator'

export interface FestivalJourneyHudView extends FestivalJourney {
  readonly publicLandmarkCount: number
  readonly windZoneCount: number
  readonly secretDiscovered: boolean
}

export interface ExplorationHudView {
  readonly regionName: string
  readonly currentRegionId: OpenWorldRegionId | null
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
  readonly coinLeagueResult: RaceLeaguePlacement | null
  readonly skyLeague: SkyLeagueRecords
  readonly coinLiveDeltaMs: number | null
  readonly coinIndicator: GateIndicatorState
  readonly selectedMissionId: MissionId
  readonly journey: FestivalJourneyHudView
  readonly discoveryNotice: string | null
  readonly adventureActive?: boolean
  readonly adventureContext?: boolean
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

export function formatCoinLeagueResult(
  placement: RaceLeaguePlacement,
): string {
  const placementLabel =
    placement.rank === null
      ? '지역 Top 10 밖'
      : [
          `지역 ${placement.rank}위`,
          formatLeagueMedal(placement.medal),
          placement.isNewBest ? '새 최고 기록' : null,
        ]
          .filter((label): label is string => label !== null)
          .join(' · ')
  return `${placementLabel} · 잠시 후 다시 도전할 수 있어요`
}

export function resolveCoinLeagueRegionId(
  coinRunRegionId: OpenWorldRegionId | null,
  currentRegionId: OpenWorldRegionId | null,
): OpenWorldRegionId | null {
  return coinRunRegionId ?? currentRegionId
}

export function getExploreCollectibleLabel(
  coinRunRegionId: OpenWorldRegionId | null,
  currentRegionId: OpenWorldRegionId | null,
): '동전' | '냉각 수정' {
  return resolveCoinLeagueRegionId(coinRunRegionId, currentRegionId) ===
    'volcanic-archipelago'
    ? '냉각 수정'
    : '동전'
}

export function formatFestivalJourneyLine(
  journey: FestivalJourneyHudView,
): string {
  const progress = `여정 ${journey.completedSteps}/${journey.totalSteps}`
  switch (journey.nextObjectiveId) {
    case 'landmarks':
      return `${progress} · 다음: 랜드마크 ${journey.publicLandmarkCount}/4 발견`
    case 'wind-zones':
      return `${progress} · 다음: 상승기류 ${journey.windZoneCount}/3 통과`
    case 'secret':
      return `${progress} · 다음: 비밀 장소 찾기`
    case 'coin-run':
      return `${progress} · 다음: 하늘동전 기록 남기기`
    case 'race-mission':
      return `${progress} · 다음: 아치 레이스 완주`
    case null:
      return `${progress} · 축제 여정 완료`
  }
}

export function formatExploreJourneyLine(
  currentRegionId: OpenWorldRegionId | null,
  journey: FestivalJourneyHudView,
): string {
  return currentRegionId === 'volcanic-archipelago'
    ? '태양의 심장 · 냉각 봉인 3개를 깨우고 분화 전에 탈출하세요'
    : formatFestivalJourneyLine(journey)
}

function formatFestivalJourneyProgress(
  journey: FestivalJourneyHudView,
  coinBestTimeMs: number | undefined,
): string {
  const coinRecord =
    coinBestTimeMs === undefined
      ? '미기록'
      : formatCoinRunTime(coinBestTimeMs)
  return `축제 여정 · 랜드마크 ${journey.publicLandmarkCount}/4 · 상승기류 ${journey.windZoneCount}/3 · 비밀 ${journey.secretDiscovered ? '발견' : '미발견'} · 동전 최고 ${coinRecord}`
}

function formatSelectedMissionGuidance(selectedMissionId: MissionId): string {
  const selectedMission =
    MISSION_CATALOG.find(({ id }) => id === selectedMissionId) ??
    MISSION_CATALOG[0]
  const challengeName =
    selectedMission.courseId === 'volcanic-archipelago'
      ? '태양의 심장 봉인 비콘'
      : '왕관 레이스 아치'
  return `선택 미션 ${selectedMission.name} · ${challengeName}에서 도전`
}

export function formatFestivalMapProgress(
  journey: FestivalJourneyHudView,
  coinBestTimeMs: number | undefined,
  selectedMissionId: MissionId,
): string {
  return `${formatFestivalJourneyProgress(journey, coinBestTimeMs)} · ${formatSelectedMissionGuidance(selectedMissionId)}`
}

export function formatExplorationMapProgress(
  journey: FestivalJourneyHudView,
  coinBestTimesMs: Readonly<CoinBestTimes>,
  selectedMissionId: MissionId,
): string {
  const volcanicRecord = coinBestTimesMs['volcanic-archipelago']
  const volcanicRecordLabel =
    volcanicRecord === undefined
      ? '미기록'
      : formatCoinRunTime(volcanicRecord)
  return `${formatFestivalJourneyProgress(
    journey,
    coinBestTimesMs['festival-hub'],
  )} · 용암 군도 · 냉각 수정 최고 ${volcanicRecordLabel} · ${formatSelectedMissionGuidance(selectedMissionId)}`
}

export function formatFestivalDiscoveryNotice(
  discovery: Pick<
    FestivalDiscoveryStep,
    'newLandmarkIds' | 'newWindZoneIds'
  >,
): string | null {
  const landmarks = discovery.newLandmarkIds.map((id) =>
    FESTIVAL_HUB_LANDMARKS.find((landmark) => landmark.id === id),
  )
  const winds = discovery.newWindZoneIds.map((id) =>
    FESTIVAL_HUB_WIND_ZONES.find((zone) => zone.id === id),
  )
  const names = [
    ...landmarks.map((landmark) => landmark?.name).filter(Boolean),
    ...winds.map((wind) => wind?.name).filter(Boolean),
  ]
  if (names.length === 0) return null
  if (names.length > 1) {
    return `새 발견 ${names.length}개 · ${names.join(', ')}`
  }
  const landmark = landmarks[0]
  if (landmark !== undefined) {
    return `${landmark.secret ? '비밀 장소' : '랜드마크'} 발견 · ${landmark.name}`
  }
  return `상승기류 발견 · ${names[0]}`
}

export function getExploreContextLabel(
  atChallenge: boolean,
  movement: ExplorationMovement,
  canLand: boolean,
  currentRegionId: OpenWorldRegionId | null = null,
): string | null {
  if (atChallenge) {
    return currentRegionId === 'volcanic-archipelago'
      ? '태양의 심장 · 냉각 봉인 도전'
      : '레이스 도전'
  }
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
  const coinCount = document.createElement('strong')
  const coinTime = document.createElement('span')
  coinTime.className = 'exploration-hud__coin-time'
  const coinDelta = document.createElement('span')
  coinDelta.className = 'exploration-hud__coin-delta'
  coinDelta.dataset.coinDelta = 'true'
  coinDelta.setAttribute('aria-label', '비행의 메아리와 기록 차이')
  coinDelta.textContent = '메아리 없음'
  const coinResult = document.createElement('span')
  coinResult.className = 'exploration-hud__coin-result'
  coinResult.dataset.coinResult = 'true'
  coinResult.setAttribute('role', 'status')
  coinResult.setAttribute('aria-live', 'polite')
  coinResult.setAttribute('aria-atomic', 'true')
  coinResult.hidden = true

  const coinLeague = document.createElement('section')
  coinLeague.className = 'exploration-hud__coin-league'
  coinLeague.dataset.skyLeague = 'true'
  coinLeague.setAttribute('aria-label', '현재 지역 로컬 Top 10')
  const coinLeagueToggle = button('Top 10', 'exploration-hud__coin-league-toggle', () => {
    setCoinLeagueExpanded(!coinLeagueExpanded)
  })
  coinLeagueToggle.dataset.leagueCategory = 'coin'
  coinLeagueToggle.setAttribute('aria-expanded', 'false')
  const coinLeagueContent = document.createElement('div')
  coinLeagueContent.className = 'exploration-hud__coin-league-content'
  coinLeagueContent.hidden = true
  const coinLeaderboard = document.createElement('ol')
  coinLeaderboard.className = 'exploration-hud__coin-leaderboard'
  coinLeaderboard.setAttribute('aria-label', '현재 지역 하늘동전 Top 10 순위')
  coinLeagueContent.append(coinLeaderboard)
  coinLeague.append(coinLeagueToggle, coinLeagueContent)
  coinRun.append(
    coinCount,
    coinTime,
    coinDelta,
    coinResult,
    coinLeague,
  )

  const coinGuide = document.createElement('div')
  coinGuide.className = 'exploration-hud__coin-guide'
  coinGuide.dataset.coinGuide = 'true'
  coinGuide.setAttribute('aria-hidden', 'true')
  coinGuide.textContent = '➤'

  const journey = document.createElement('div')
  journey.className = 'exploration-hud__journey'
  journey.dataset.exploreJourney = 'true'
  const journeyProgress = document.createElement('strong')
  journeyProgress.className = 'exploration-hud__journey-progress'
  const journeyCopy = document.createElement('span')
  journeyCopy.className = 'exploration-hud__journey-copy'
  const discovery = document.createElement('span')
  discovery.className = 'exploration-hud__discovery'
  discovery.dataset.exploreDiscovery = 'true'
  discovery.setAttribute('role', 'status')
  discovery.setAttribute('aria-live', 'polite')
  discovery.setAttribute('aria-atomic', 'true')
  journey.append(journeyProgress, journeyCopy, discovery)

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
  const festivalProgress = document.createElement('p')
  festivalProgress.className = 'exploration-hud__festival-progress'
  festivalProgress.dataset.exploreFestivalProgress = 'true'
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
  map.append(
    mapTitle,
    mapHint,
    festivalProgress,
    mapRegions,
    clearDestination,
    returnButton,
  )

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

  root.append(
    region,
    coinRun,
    coinGuide,
    journey,
    destination,
    controls,
    context,
    map,
    paused,
  )
  host.append(root)

  let coinLeagueExpanded = false
  let coinLeaderboardSignature: string | null = null
  let coinResultSignature: string | null = null
  let previousCoinRegionId: OpenWorldRegionId | null = null

  function setCoinLeagueExpanded(expanded: boolean): void {
    coinLeagueExpanded = expanded
    coinLeagueContent.hidden = !expanded
    coinLeagueToggle.setAttribute('aria-expanded', String(expanded))
    coinLeagueToggle.textContent = expanded ? '닫기' : 'Top 10'
  }

  const updateCoinLeaderboard = (view: ExplorationHudView): void => {
    const regionId = resolveCoinLeagueRegionId(
      view.coinRun.regionId,
      view.currentRegionId,
    )
    if (regionId === null) return
    const collectibleLabel = getExploreCollectibleLabel(
      view.coinRun.regionId,
      view.currentRegionId,
    )
    const regionDefinition = OPEN_WORLD_REGIONS.find(
      (entry) => entry.id === regionId,
    )
    const board = view.skyLeague.coinTop10Ms[regionId] ?? []
    const nextSignature = `${regionId}:${board.join(',')}`
    coinLeagueToggle.setAttribute(
      'aria-label',
      `${regionDefinition?.name ?? '현재 지역'} ${collectibleLabel} Top 10 ${
        coinLeagueExpanded ? '닫기' : '보기'
      }`,
    )
    coinLeaderboard.setAttribute(
      'aria-label',
      `${regionDefinition?.name ?? '현재 지역'} ${collectibleLabel} Top 10 순위`,
    )
    coinLeaderboardSignature = updateCachedDom(
      coinLeaderboardSignature,
      nextSignature,
      () => {
        coinLeaderboard.replaceChildren()
        if (board.length === 0) {
          const empty = document.createElement('li')
          empty.className = 'exploration-hud__coin-leaderboard-empty'
          empty.textContent = '아직 기록이 없습니다.'
          coinLeaderboard.append(empty)
          return
        }
        board.forEach((elapsedMs, index) => {
          const row = document.createElement('li')
          row.dataset.leaderboardRow = String(index + 1)
          row.textContent = `${index + 1}위 · ${formatCoinRunTime(elapsedMs)}`
          coinLeaderboard.append(row)
        })
      },
    )
  }

  return {
    element: root,
    update: (view) => {
      region.textContent = view.regionName
      const collectibleLabel = getExploreCollectibleLabel(
        view.coinRun.regionId,
        view.currentRegionId,
      )
      coinCount.textContent = `${collectibleLabel} ${view.coinRun.collectedCount}/10`
      coinTime.textContent = formatCoinRunTime(
        view.coinRun.finalElapsedMs ?? view.coinRun.elapsedMs,
      )
      coinDelta.hidden = view.coinRun.phase !== 'running'
      coinDelta.textContent =
        view.coinLiveDeltaMs === null
          ? '메아리 없음'
          : formatGhostDelta(view.coinLiveDeltaMs)
      coinRun.dataset.phase = view.coinRun.phase
      coinRun.dataset.newBest = String(view.coinRunIsNewBest)
      coinRun.title = view.coinRunIsNewBest
        ? `${collectibleLabel} 지역 최고 기록`
        : `${collectibleLabel} 기록 도전`
      coinGuide.hidden =
        view.paused ||
        view.mapOpen ||
        view.movement !== 'airborne' ||
        !view.coinIndicator.show
      coinGuide.style.left = `${view.coinIndicator.left}px`
      coinGuide.style.top = `${view.coinIndicator.top}px`
      coinGuide.style.transform = `translate(-50%, -50%) rotate(${view.coinIndicator.angleRadians}rad)`
      const completedPlacement =
        view.coinRun.phase === 'completed' ? view.coinLeagueResult : null
      const nextCoinResultSignature =
        completedPlacement === null
          ? null
          : JSON.stringify({
              regionId: view.coinRun.regionId,
              placement: completedPlacement,
            })
      coinResultSignature = updateCachedDom(
        coinResultSignature,
        nextCoinResultSignature,
        () => {
          coinResult.textContent =
            completedPlacement === null
              ? ''
              : formatCoinLeagueResult(completedPlacement)
        },
      )
      coinResult.hidden = completedPlacement === null

      const leagueRegionId = resolveCoinLeagueRegionId(
        view.coinRun.regionId,
        view.currentRegionId,
      )
      if (leagueRegionId !== previousCoinRegionId) {
        setCoinLeagueExpanded(false)
        previousCoinRegionId = leagueRegionId
      }
      coinLeague.hidden = leagueRegionId === null || view.paused
      if (leagueRegionId !== null) updateCoinLeaderboard(view)
      const journeyLine = formatExploreJourneyLine(
        view.currentRegionId,
        view.journey,
      )
      const journeySeparatorIndex = journeyLine.indexOf(' · ')
      journeyProgress.textContent =
        journeySeparatorIndex === -1
          ? journeyLine
          : journeyLine.slice(0, journeySeparatorIndex)
      journeyCopy.textContent =
        journeySeparatorIndex === -1
          ? ''
          : journeyLine.slice(journeySeparatorIndex + 3)
      const hasDiscoveryNotice = view.discoveryNotice !== null
      journey.dataset.notice = String(hasDiscoveryNotice)
      journeyCopy.hidden = hasDiscoveryNotice
      discovery.hidden = !hasDiscoveryNotice
      const nextDiscoveryText = view.discoveryNotice ?? ''
      if (discovery.textContent !== nextDiscoveryText) {
        discovery.textContent = nextDiscoveryText
      }
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
        view.currentRegionId,
      )
      context.hidden = label === null || view.paused || view.mapOpen || view.adventureContext === true
      context.textContent = label ?? ''
      context.setAttribute('aria-label', label ?? '상황 동작')
      map.hidden = !view.mapOpen || view.paused
      festivalProgress.textContent = formatExplorationMapProgress(
        view.journey,
        view.coinBestTimesMs,
        view.selectedMissionId,
      )
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
      journey.hidden = view.paused || view.adventureActive === true
      destination.hidden = view.paused || guidance === null
    },
    dispose: () => root.remove(),
  }
}
