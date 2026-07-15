import type {
  RaceLeaguePlacement,
  RaceLeagueResult,
  RacePhase,
  RaceQuality,
} from '../race/raceState'
import type { RenderQualityTier } from '../quality/qualityPolicy'
import type { InputDevice } from '../input/InputController'
import type { GateIndicatorState } from './gateIndicator'
import { formatGhostDelta } from '../competition/ghostRun'
import type {
  LeagueMedal,
  SkyLeagueRecords,
} from '../competition/skyLeagueRecords'
import type {
  AwardedMissionGrade,
  MissionAttemptStats,
  MissionGrade,
  MissionId,
} from '../missions/missionRules'
import {
  MISSION_CATALOG,
  deriveUnlockedMissionIds,
  getMissionLockRequirement,
  getNextMissionId,
} from '../missions/missionRules'
import type { MissionSessionState } from '../missions/missionState'
import type { MissionGrades } from '../persistence/records'

export interface RaceHudView {
  readonly phase: RacePhase
  readonly countdownRemainingMs: number
  readonly elapsedMs: number
  readonly nextCheckpointIndex: number
  readonly checkpointCount: number
  readonly finalElapsedMs: number | null
  readonly bestTimeMs: number | null
  readonly previousBestTimeMs: number | null
  readonly gateIndicator: GateIndicatorState
  readonly inputDevice: InputDevice
  readonly muted: boolean
  readonly musicVolume: number
  readonly quality: RaceQuality
  readonly resolvedQuality: RenderQualityTier
  readonly mission: MissionSessionState
  readonly missionGrades: Readonly<MissionGrades>
  readonly liveDeltaMs: number | null
  readonly leagueResult: RaceLeagueResult | null
  readonly skyLeague: SkyLeagueRecords
}

export interface RaceHudActions {
  readonly start: () => void
  readonly startExplore: () => void
  readonly selectMission: (missionId: MissionId) => void
  readonly returnToMissionSelection: () => void
  readonly resume: () => void
  readonly restart: () => void
  readonly respawn: () => void
  readonly retry: () => void
  readonly nextMission: () => void
  readonly toggleMute: () => void
  readonly setMusicVolume: (volume: number) => void
  readonly setQuality: (quality: RaceQuality) => void
}

export interface RaceHud {
  readonly element: HTMLElement
  update(view: RaceHudView): void
  dispose(): void
}

export function formatRaceTime(milliseconds: number): string {
  const safeMilliseconds =
    Number.isFinite(milliseconds) && milliseconds >= 0
      ? Math.floor(milliseconds)
      : 0
  const minutes = Math.floor(safeMilliseconds / 60_000)
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000)
  const millis = safeMilliseconds % 1_000

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(
    millis,
  ).padStart(3, '0')}`
}

export function formatMusicVolumePercent(volume: number): string {
  const safeVolume = Number.isFinite(volume)
    ? Math.min(1, Math.max(0, volume))
    : 0.35
  return `${Math.round(safeVolume * 100)}%`
}

export function formatMissionGrade(
  grade: MissionGrade | AwardedMissionGrade | null,
): string {
  if (grade === null) return '기록 없음'
  if (grade === 'failed') return '실패'
  if (grade === 'bronze') return '브론즈'
  if (grade === 'silver') return '실버'
  return '골드'
}

export function formatLeagueMedal(medal: LeagueMedal | null): string {
  if (medal === 'gold') return '금메달'
  if (medal === 'silver') return '은메달'
  if (medal === 'bronze') return '동메달'
  return '메달 없음'
}

export function formatLeaguePlacement(
  placement: RaceLeaguePlacement,
): string {
  if (placement.rank === null) return 'Top 10 밖'
  return [
    `${placement.rank}위`,
    formatLeagueMedal(placement.medal),
    placement.isNewBest ? '새 최고 기록' : null,
  ]
    .filter((label): label is string => label !== null)
    .join(' · ')
}

export function updateCachedDom(
  previousSignature: string | null,
  nextSignature: string | null,
  update: () => void,
): string | null {
  if (previousSignature === nextSignature) return previousSignature
  update()
  return nextSignature
}

export function formatMissionProgress(
  missionId: MissionId,
  attempt: MissionAttemptStats,
  checkpointCount: number,
): string {
  const checkpoint = `관문 ${Math.min(
    attempt.nextCheckpointIndex,
    checkpointCount,
  )}/${checkpointCount}`
  const elapsed = formatRaceTime(attempt.elapsedMs)

  switch (missionId) {
    case 'first-skyknot':
      return `${checkpoint} · ${elapsed}`
    case 'boost-mastery':
      return `${checkpoint} · 돌풍 ${attempt.boostActivationCount}/3`
    case 'no-respawn':
      return `${checkpoint} · 돌풍 ${attempt.boostActivationCount}/3 · 리스폰 ${attempt.respawnCount}`
    case 'time-trial':
      return `${elapsed} / 3:30.000 · 돌풍 ${attempt.boostActivationCount}/3 · 리스폰 ${attempt.respawnCount}`
    case 'clean-flight':
      return `${elapsed} / 3:30.000 · 충돌 ${attempt.collisionCount} · 리스폰 ${attempt.respawnCount} · 돌풍 ${attempt.boostActivationCount}/3`
    case 'golden-knot':
      return `${elapsed} / 3:00.000 · 충돌 ${attempt.collisionCount} · 리스폰 ${attempt.respawnCount} · 돌풍 ${attempt.boostActivationCount}/5`
  }
}

function createButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', action)
  return button
}

export function createRaceHud(
  host: HTMLElement,
  actions: RaceHudActions,
  flightFocusTarget?: HTMLElement,
): RaceHud {
  const root = document.createElement('div')
  root.className = 'race-hud'

  const status = document.createElement('div')
  status.className = 'race-hud__status'

  const timerBlock = document.createElement('div')
  timerBlock.className = 'race-hud__metric'
  const timerLabel = document.createElement('span')
  timerLabel.textContent = '기록'
  const timer = document.createElement('strong')
  timer.dataset.raceTimer = 'true'
  timer.textContent = formatRaceTime(0)
  const liveDelta = document.createElement('small')
  liveDelta.className = 'race-hud__delta'
  liveDelta.dataset.raceDelta = 'true'
  liveDelta.textContent = '기준 없음'
  timerBlock.append(timerLabel, timer, liveDelta)

  const gateBlock = document.createElement('div')
  gateBlock.className = 'race-hud__metric race-hud__metric--gate'
  const gateLabel = document.createElement('span')
  gateLabel.textContent = '바람 관문'
  const gate = document.createElement('strong')
  gate.dataset.raceCheckpoint = 'true'
  gateBlock.append(gateLabel, gate)
  status.append(timerBlock, gateBlock)

  const missionTracker = document.createElement('div')
  missionTracker.className = 'race-hud__mission-tracker'
  missionTracker.dataset.missionTracker = 'true'
  missionTracker.setAttribute('aria-live', 'polite')
  const missionTrackerName = document.createElement('strong')
  const missionTrackerProgress = document.createElement('span')
  missionTracker.append(missionTrackerName, missionTrackerProgress)

  const countdown = document.createElement('div')
  countdown.className = 'race-hud__countdown'
  countdown.setAttribute('role', 'status')
  countdown.setAttribute('aria-live', 'assertive')

  const gateGuide = document.createElement('div')
  gateGuide.className = 'race-hud__gate-guide'
  gateGuide.dataset.gateGuide = 'true'
  gateGuide.setAttribute('aria-hidden', 'true')
  gateGuide.textContent = '➤'

  const panel = document.createElement('section')
  panel.className = 'race-hud__panel'
  const eyebrow = document.createElement('p')
  eyebrow.className = 'race-hud__eyebrow'
  eyebrow.textContent = 'SKYKNOT CUP'
  const title = document.createElement('h1')
  title.id = 'race-hud-title'
  panel.setAttribute('aria-labelledby', title.id)
  const detail = document.createElement('p')
  detail.className = 'race-hud__detail'
  const missionPicker = document.createElement('div')
  missionPicker.className = 'race-hud__mission-picker'
  const missionLabel = document.createElement('label')
  missionLabel.htmlFor = 'race-mission-select'
  missionLabel.textContent = '도전 미션'
  const missionSelect = document.createElement('select')
  missionSelect.id = 'race-mission-select'
  missionSelect.dataset.missionSelect = 'true'
  const missionOptions = new Map<MissionId, HTMLOptionElement>()
  for (const mission of MISSION_CATALOG) {
    const option = document.createElement('option')
    option.value = mission.id
    option.textContent = mission.name
    missionSelect.append(option)
    missionOptions.set(mission.id, option)
  }
  missionSelect.addEventListener('change', () => {
    actions.selectMission(missionSelect.value as MissionId)
  })
  const missionObjective = document.createElement('p')
  missionObjective.className = 'race-hud__mission-objective'
  const missionBest = document.createElement('small')
  missionBest.className = 'race-hud__mission-best'
  const missionUnlockStatus = document.createElement('small')
  missionUnlockStatus.className = 'race-hud__mission-unlock-status'
  missionUnlockStatus.dataset.missionUnlockStatus = 'true'
  const start = createButton('비행 시작', actions.start)
  start.className = 'race-hud__mission-start'
  start.dataset.missionStart = 'true'
  const explore = createButton('하늘 탐험', actions.startExplore)
  explore.className = 'race-hud__explore-start'
  explore.dataset.exploreStart = 'true'
  missionPicker.append(
    missionLabel,
    missionSelect,
    missionObjective,
    missionBest,
    missionUnlockStatus,
    start,
    explore,
  )
  const result = document.createElement('dl')
  result.className = 'race-hud__result'
  result.setAttribute('aria-live', 'polite')
  result.setAttribute('aria-atomic', 'true')
  result.hidden = true
  const settings = document.createElement('div')
  settings.className = 'race-hud__settings'
  settings.setAttribute('role', 'group')
  settings.setAttribute('aria-label', '게임 설정')
  const mute = createButton('🔊', actions.toggleMute)
  mute.className = 'race-hud__mute'
  const musicVolumeLabel = document.createElement('label')
  musicVolumeLabel.className = 'race-hud__music-volume'
  const musicVolumeText = document.createElement('span')
  musicVolumeText.textContent = 'BGM'
  const musicVolume = document.createElement('input')
  musicVolume.type = 'range'
  musicVolume.min = '0'
  musicVolume.max = '100'
  musicVolume.step = '5'
  musicVolume.setAttribute('aria-label', '배경 음악 음량')
  musicVolume.dataset.raceMusicVolume = 'true'
  const musicVolumeOutput = document.createElement('output')
  musicVolume.addEventListener('input', () => {
    actions.setMusicVolume(musicVolume.valueAsNumber / 100)
  })
  musicVolumeLabel.append(
    musicVolumeText,
    musicVolume,
    musicVolumeOutput,
  )
  const qualityLabel = document.createElement('label')
  qualityLabel.className = 'race-hud__quality'
  const qualityLabelText = document.createElement('span')
  qualityLabelText.textContent = '화질'
  const quality = document.createElement('select')
  quality.setAttribute('aria-label', '화질')
  quality.title = '화질 설정'
  for (const [value, label] of [
    ['auto', '자동'],
    ['low', '낮음'],
    ['high', '높음'],
  ] as const) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    quality.append(option)
  }
  quality.addEventListener('change', () => {
    actions.setQuality(quality.value as RaceQuality)
  })
  const qualityStatus = document.createElement('small')
  qualityStatus.setAttribute('aria-live', 'polite')
  qualityLabel.append(qualityLabelText, quality, qualityStatus)
  settings.append(mute, musicVolumeLabel, qualityLabel)
  const actionsRow = document.createElement('div')
  actionsRow.className = 'race-hud__actions'

  const league = document.createElement('section')
  league.className = 'race-hud__league'
  league.dataset.skyLeague = 'true'
  league.setAttribute('aria-label', '로컬 Sky League 기록판')
  const leagueToggle = createButton('로컬 Top 10 보기', () => {
    setLeagueExpanded(!leagueExpanded)
  })
  leagueToggle.className = 'race-hud__league-toggle'
  leagueToggle.setAttribute('aria-expanded', 'false')
  const leagueContent = document.createElement('div')
  leagueContent.className = 'race-hud__league-content'
  leagueContent.hidden = true
  const leagueCategories = document.createElement('div')
  leagueCategories.className = 'race-hud__league-categories'
  leagueCategories.setAttribute('role', 'group')
  leagueCategories.setAttribute('aria-label', '기록판 종류')
  const raceLeagueButton = createButton('전체 레이스', () => {
    setLeagueCategory('race')
  })
  raceLeagueButton.dataset.leagueCategory = 'race'
  raceLeagueButton.setAttribute('aria-pressed', 'true')
  const missionLeagueButton = createButton('선택 미션', () => {
    setLeagueCategory('mission')
  })
  missionLeagueButton.dataset.leagueCategory = 'mission'
  missionLeagueButton.setAttribute('aria-pressed', 'false')
  leagueCategories.append(raceLeagueButton, missionLeagueButton)
  const leaderboard = document.createElement('ol')
  leaderboard.className = 'race-hud__leaderboard'
  leaderboard.setAttribute('aria-label', '로컬 Top 10 순위')
  leagueContent.append(leagueCategories, leaderboard)
  league.append(leagueToggle, leagueContent)

  const resume = createButton('계속 날기', actions.resume)
  const respawn = createButton('관문에서 계속', actions.respawn)
  const restart = createButton('처음부터', actions.restart)
  const retry = createButton('다시 달리기', actions.retry)
  const nextMission = createButton('다음 미션', actions.nextMission)
  nextMission.dataset.nextMission = 'true'
  const chooseMission = createButton(
    '미션 선택',
    actions.returnToMissionSelection,
  )
  actionsRow.append(
    resume,
    respawn,
    restart,
    retry,
    nextMission,
    chooseMission,
  )
  panel.append(
    eyebrow,
    title,
    detail,
    missionPicker,
    settings,
    result,
    league,
    actionsRow,
  )
  root.append(status, missionTracker, countdown, gateGuide, panel)
  host.append(root)
  let previousPhase: RacePhase | null = null
  let resultSignature: string | null = null
  let leaderboardSignature: string | null = null
  let leagueExpanded = false
  let leagueCategory: 'race' | 'mission' = 'race'
  let latestView: RaceHudView | null = null

  const showOnly = (...buttons: HTMLButtonElement[]): void => {
    for (const button of [
      resume,
      respawn,
      restart,
      retry,
      nextMission,
      chooseMission,
    ]) {
      button.hidden = !buttons.includes(button)
    }
  }

  function setLeagueExpanded(expanded: boolean): void {
    leagueExpanded = expanded
    leagueContent.hidden = !expanded
    leagueToggle.setAttribute('aria-expanded', String(expanded))
    leagueToggle.textContent = expanded
      ? '로컬 Top 10 닫기'
      : '로컬 Top 10 보기'
  }

  function setLeagueCategory(category: 'race' | 'mission'): void {
    leagueCategory = category
    raceLeagueButton.setAttribute(
      'aria-pressed',
      String(category === 'race'),
    )
    missionLeagueButton.setAttribute(
      'aria-pressed',
      String(category === 'mission'),
    )
    if (latestView !== null) updateLeaderboard(latestView)
  }

  const appendResultRow = (
    term: string,
    value: string,
    category?: 'race' | 'mission',
    placement?: RaceLeaguePlacement,
  ): void => {
    const termElement = document.createElement('dt')
    termElement.textContent = term
    const valueElement = document.createElement('dd')
    valueElement.textContent = value
    if (category !== undefined && placement !== undefined) {
      valueElement.dataset.leagueCategory = category
      valueElement.dataset.resultRank = String(placement.rank ?? 'none')
      valueElement.dataset.resultMedal = placement.medal ?? 'none'
    }
    result.append(termElement, valueElement)
  }

  const updateResult = (view: RaceHudView): void => {
    if (view.finalElapsedMs === null) return
    const finalElapsedMs = view.finalElapsedMs

    const nextSignature = JSON.stringify({
      finalElapsedMs,
      bestTimeMs: view.bestTimeMs,
      previousBestTimeMs: view.previousBestTimeMs,
      missionId: view.mission.selectedMissionId,
      missionResult: view.mission.result,
      missionGrade: view.missionGrades[view.mission.selectedMissionId] ?? null,
      leagueResult: view.leagueResult,
    })

    resultSignature = updateCachedDom(
      resultSignature,
      nextSignature,
      () => {
        result.replaceChildren()

        const rows: readonly [string, string][] = [
          [
            '미션 결과',
            view.mission.result?.success === true ? '성공' : '실패',
          ],
          [
            '이번 등급',
            formatMissionGrade(view.mission.result?.grade ?? 'failed'),
          ],
          [
            '최고 등급',
            formatMissionGrade(
              view.missionGrades[view.mission.selectedMissionId] ?? null,
            ),
          ],
          ['이번 기록', formatRaceTime(finalElapsedMs)],
          [
            '최고 기록',
            view.bestTimeMs === null
              ? '기록 없음'
              : formatRaceTime(view.bestTimeMs),
          ],
          [
            '최고 기록 대비',
            view.previousBestTimeMs === null ||
            finalElapsedMs < view.previousBestTimeMs
              ? '새 최고 기록'
              : `+${formatRaceTime(
                  finalElapsedMs - view.previousBestTimeMs,
                )}`,
          ],
        ]

        for (const [term, value] of rows) appendResultRow(term, value)

        if (view.leagueResult !== null) {
          appendResultRow(
            '전체 레이스 순위',
            formatLeaguePlacement(view.leagueResult.race),
            'race',
            view.leagueResult.race,
          )
          if (
            view.mission.result?.success === true &&
            view.leagueResult.mission !== null
          ) {
            appendResultRow(
              '선택 미션 순위',
              formatLeaguePlacement(view.leagueResult.mission),
              'mission',
              view.leagueResult.mission,
            )
          }
        }
      },
    )
  }

  const updateLeaderboard = (view: RaceHudView): void => {
    const missionId = view.mission.selectedMissionId
    const missionDefinition =
      MISSION_CATALOG.find((mission) => mission.id === missionId) ??
      MISSION_CATALOG[0]
    missionLeagueButton.textContent = missionDefinition.name
    const raceBoard = view.skyLeague.raceTop10Ms
    const missionBoard = view.skyLeague.missionTop10[missionId] ?? []
    const nextSignature =
      leagueCategory === 'race'
        ? `race:${raceBoard.join(',')}`
        : `mission:${missionId}:${missionBoard
            .map((entry) => `${entry.grade}:${entry.elapsedMs}`)
            .join(',')}`

    leaderboardSignature = updateCachedDom(
      leaderboardSignature,
      nextSignature,
      () => {
        leaderboard.replaceChildren()
        const rowCount =
          leagueCategory === 'race' ? raceBoard.length : missionBoard.length
        if (rowCount === 0) {
          const empty = document.createElement('li')
          empty.className = 'race-hud__leaderboard-empty'
          empty.textContent = '아직 기록이 없습니다.'
          leaderboard.append(empty)
          return
        }

        if (leagueCategory === 'race') {
          raceBoard.forEach((elapsedMs, index) => {
            const row = document.createElement('li')
            row.dataset.leaderboardRow = String(index + 1)
            row.textContent = `${index + 1}위 · ${formatRaceTime(elapsedMs)}`
            leaderboard.append(row)
          })
          return
        }

        missionBoard.forEach((entry, index) => {
          const row = document.createElement('li')
          row.dataset.leaderboardRow = String(index + 1)
          row.textContent = `${index + 1}위 · ${formatMissionGrade(
            entry.grade,
          )} · ${formatRaceTime(entry.elapsedMs)}`
          leaderboard.append(row)
        })
      },
    )
  }

  const clearResult = (): void => {
    resultSignature = updateCachedDom(resultSignature, null, () => {
      result.replaceChildren()
    })
  }

  return {
    element: root,
    update: (view) => {
      latestView = view
      const phaseChanged = previousPhase !== view.phase
      const missionDefinition =
        MISSION_CATALOG.find(
          (mission) => mission.id === view.mission.selectedMissionId,
        ) ?? MISSION_CATALOG[0]
      const unlockedMissionIds = deriveUnlockedMissionIds(
        view.missionGrades,
      )
      const unlockedMissions = new Set(unlockedMissionIds)
      const nextLockedMission = MISSION_CATALOG.find(
        (mission) => !unlockedMissions.has(mission.id),
      )
      for (const mission of MISSION_CATALOG) {
        const option = missionOptions.get(mission.id)
        if (option === undefined) continue
        const unlocked = unlockedMissions.has(mission.id)
        const requirement = getMissionLockRequirement(mission.id)
        option.disabled = !unlocked
        option.textContent = unlocked
          ? mission.name
          : `🔒 ${mission.name} · ${requirement ?? '잠김'}`
        option.title = unlocked ? mission.objective : (requirement ?? '')
      }
      root.dataset.phase = view.phase
      root.dataset.mission = view.mission.selectedMissionId
      timer.textContent = formatRaceTime(
        view.finalElapsedMs ?? view.elapsedMs,
      )
      liveDelta.hidden =
        view.phase !== 'countdown' && view.phase !== 'racing'
      liveDelta.textContent =
        view.liveDeltaMs === null
          ? '기준 없음'
          : formatGhostDelta(view.liveDeltaMs)
      gate.textContent = `${Math.min(
        view.nextCheckpointIndex,
        view.checkpointCount,
      )} / ${view.checkpointCount}`
      status.hidden = view.phase === 'ready'
      missionTracker.hidden =
        view.phase !== 'countdown' && view.phase !== 'racing'
      missionTrackerName.textContent = missionDefinition?.name ?? ''
      missionTrackerProgress.textContent = formatMissionProgress(
        view.mission.selectedMissionId,
        view.mission.attempt,
        view.checkpointCount,
      )
      countdown.hidden = view.phase !== 'countdown'
      countdown.textContent = String(
        Math.max(1, Math.ceil(view.countdownRemainingMs / 1_000)),
      )
      gateGuide.hidden =
        (view.phase !== 'countdown' && view.phase !== 'racing') ||
        !view.gateIndicator.show
      gateGuide.style.left = `${view.gateIndicator.left}px`
      gateGuide.style.top = `${view.gateIndicator.top}px`
      gateGuide.style.transform = `translate(-50%, -50%) rotate(${view.gateIndicator.angleRadians}rad)`
      panel.hidden = view.phase === 'countdown' || view.phase === 'racing'
      result.hidden = view.phase !== 'finished'
      league.hidden = view.phase !== 'finished'
      missionPicker.hidden =
        view.phase !== 'ready' && view.phase !== 'paused'
      missionSelect.value = view.mission.selectedMissionId
      missionLabel.textContent =
        view.phase === 'paused' ? '미션 변경' : '도전 미션'
      missionObjective.textContent = missionDefinition?.objective ?? ''
      missionBest.textContent = `최고 등급 · ${formatMissionGrade(
        view.missionGrades[view.mission.selectedMissionId] ?? null,
      )}`
      missionUnlockStatus.textContent =
        nextLockedMission === undefined
          ? '모든 미션 해금 완료'
          : `다음 해금 · ${nextLockedMission.name}: ${
              getMissionLockRequirement(nextLockedMission.id) ?? ''
            }`
      start.hidden = view.phase !== 'ready'
      explore.hidden = view.phase !== 'ready'
      start.disabled = !unlockedMissions.has(
        view.mission.selectedMissionId,
      )

      mute.textContent = view.muted ? '🔇' : '🔊'
      const muteAction = view.muted ? '소리 켜기' : '소리 끄기'
      mute.setAttribute('aria-label', muteAction)
      mute.setAttribute('aria-pressed', String(view.muted))
      mute.title = muteAction
      musicVolume.value = String(Math.round(view.musicVolume * 100))
      musicVolumeOutput.textContent = formatMusicVolumePercent(
        view.musicVolume,
      )
      quality.value = view.quality
      qualityStatus.textContent = `현재 ${
        view.resolvedQuality === 'low' ? '낮음' : '높음'
      }`

      if (view.phase === 'paused' || view.phase === 'finished') {
        panel.setAttribute('role', 'dialog')
        panel.setAttribute('aria-modal', 'true')
      } else {
        panel.removeAttribute('role')
        panel.removeAttribute('aria-modal')
      }

      if (view.phase === 'ready') {
        title.textContent = '하늘매듭배'
        detail.textContent =
          view.inputDevice === 'touch'
            ? '미션을 고르고 비행 시작을 누르세요.'
            : '미션을 고른 뒤 Enter 또는 비행 키로 출발하세요.'
        clearResult()
        showOnly()
      } else if (view.phase === 'paused') {
        title.textContent = '바람길 일시정지'
        detail.textContent = '타이머와 비행 진행이 그대로 멈췄습니다.'
        chooseMission.textContent = '미션 변경'
        clearResult()
        showOnly(resume, respawn, restart)
      } else if (view.phase === 'finished') {
        if (phaseChanged) {
          setLeagueCategory('race')
          setLeagueExpanded(false)
        }
        title.textContent = '하늘매듭 완주'
        const nextMissionId =
          view.mission.result?.success === true
            ? getNextMissionId(view.mission.selectedMissionId)
            : null
        detail.textContent =
          view.mission.result?.success !== true
            ? `${missionDefinition?.name ?? '미션'} 실패 · 조건을 확인하고 다시 도전하세요.`
            : nextMissionId === null
              ? `${missionDefinition?.name ?? '미션'} 성공 · 모든 미션을 완주했습니다.`
              : `${missionDefinition?.name ?? '미션'} 성공 · 다음 미션이 열렸습니다.`
        chooseMission.textContent = '미션 선택'
        updateResult(view)
        updateLeaderboard(view)
        showOnly(
          retry,
          ...(nextMissionId === null ? [] : [nextMission]),
          chooseMission,
        )
      }

      if (phaseChanged) {
        if (view.phase === 'paused') {
          resume.focus({ preventScroll: true })
        } else if (view.phase === 'finished') {
          retry.focus({ preventScroll: true })
        } else if (
          view.phase === 'ready' &&
          (previousPhase === 'paused' || previousPhase === 'finished')
        ) {
          missionSelect.focus({ preventScroll: true })
        } else if (
          view.phase === 'countdown' ||
          view.phase === 'racing'
        ) {
          flightFocusTarget?.focus({ preventScroll: true })
        }
      }

      previousPhase = view.phase
    },
    dispose: () => root.remove(),
  }
}
