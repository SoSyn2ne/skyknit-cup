import type { RacePhase } from '../race/raceState'
import type { RaceQuality } from '../race/raceState'
import type { RenderQualityTier } from '../quality/qualityPolicy'
import type { InputDevice } from '../input/InputController'
import type { GateIndicatorState } from './gateIndicator'
import type {
  AwardedMissionGrade,
  MissionAttemptStats,
  MissionGrade,
  MissionId,
} from '../missions/missionRules'
import { MISSION_CATALOG } from '../missions/missionRules'
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
  readonly quality: RaceQuality
  readonly resolvedQuality: RenderQualityTier
  readonly mission: MissionSessionState
  readonly missionGrades: Readonly<MissionGrades>
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
  readonly toggleMute: () => void
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

export function formatMissionGrade(
  grade: MissionGrade | AwardedMissionGrade | null,
): string {
  if (grade === null) return '기록 없음'
  if (grade === 'failed') return '실패'
  if (grade === 'bronze') return '브론즈'
  if (grade === 'silver') return '실버'
  return '골드'
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
    case 'time-trial':
      return `${elapsed} / 3:00.000`
    case 'clean-flight':
      return `${checkpoint} · 충돌 ${attempt.collisionCount}`
    case 'no-respawn':
      return `${checkpoint} · 리스폰 ${attempt.respawnCount}`
    case 'boost-mastery':
      return `${checkpoint} · 돌풍 ${attempt.boostActivationCount}회`
    case 'golden-knot':
      return `${elapsed} · 충돌 ${attempt.collisionCount} · 리스폰 ${attempt.respawnCount} · 돌풍 ${attempt.boostActivationCount}`
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
  timerBlock.append(timerLabel, timer)

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
  panel.setAttribute('aria-live', 'polite')
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
  for (const mission of MISSION_CATALOG) {
    const option = document.createElement('option')
    option.value = mission.id
    option.textContent = mission.name
    missionSelect.append(option)
  }
  missionSelect.addEventListener('change', () => {
    actions.selectMission(missionSelect.value as MissionId)
  })
  const missionObjective = document.createElement('p')
  missionObjective.className = 'race-hud__mission-objective'
  const missionBest = document.createElement('small')
  missionBest.className = 'race-hud__mission-best'
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
    start,
    explore,
  )
  const result = document.createElement('dl')
  result.className = 'race-hud__result'
  result.hidden = true
  const settings = document.createElement('div')
  settings.className = 'race-hud__settings'
  settings.setAttribute('role', 'group')
  settings.setAttribute('aria-label', '게임 설정')
  const mute = createButton('🔊', actions.toggleMute)
  mute.className = 'race-hud__mute'
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
  settings.append(mute, qualityLabel)
  const actionsRow = document.createElement('div')
  actionsRow.className = 'race-hud__actions'

  const resume = createButton('계속 날기', actions.resume)
  const respawn = createButton('관문에서 계속', actions.respawn)
  const restart = createButton('처음부터', actions.restart)
  const retry = createButton('다시 달리기', actions.retry)
  const chooseMission = createButton(
    '미션 선택',
    actions.returnToMissionSelection,
  )
  actionsRow.append(resume, respawn, restart, retry, chooseMission)
  panel.append(
    eyebrow,
    title,
    detail,
    missionPicker,
    settings,
    result,
    actionsRow,
  )
  root.append(status, missionTracker, countdown, gateGuide, panel)
  host.append(root)
  let previousPhase: RacePhase | null = null

  const showOnly = (...buttons: HTMLButtonElement[]): void => {
    for (const button of [resume, respawn, restart, retry, chooseMission]) {
      button.hidden = !buttons.includes(button)
    }
  }

  const updateResult = (view: RaceHudView): void => {
    result.replaceChildren()

    if (view.finalElapsedMs === null) {
      return
    }

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
      ['이번 기록', formatRaceTime(view.finalElapsedMs)],
      [
        '최고 기록',
        view.bestTimeMs === null ? '기록 없음' : formatRaceTime(view.bestTimeMs),
      ],
      [
        '최고 기록 대비',
        view.previousBestTimeMs === null ||
        view.finalElapsedMs < view.previousBestTimeMs
          ? '새 최고 기록'
          : `+${formatRaceTime(
              view.finalElapsedMs - view.previousBestTimeMs,
            )}`,
      ],
    ]

    for (const [term, value] of rows) {
      const termElement = document.createElement('dt')
      termElement.textContent = term
      const valueElement = document.createElement('dd')
      valueElement.textContent = value
      result.append(termElement, valueElement)
    }
  }

  return {
    element: root,
    update: (view) => {
      const phaseChanged = previousPhase !== view.phase
      const missionDefinition =
        MISSION_CATALOG.find(
          (mission) => mission.id === view.mission.selectedMissionId,
        ) ?? MISSION_CATALOG[0]
      root.dataset.phase = view.phase
      root.dataset.mission = view.mission.selectedMissionId
      timer.textContent = formatRaceTime(
        view.finalElapsedMs ?? view.elapsedMs,
      )
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
      settings.hidden = view.phase === 'ready'
      missionPicker.hidden = view.phase !== 'ready'
      missionSelect.value = view.mission.selectedMissionId
      missionObjective.textContent = missionDefinition?.objective ?? ''
      missionBest.textContent = `최고 등급 · ${formatMissionGrade(
        view.missionGrades[view.mission.selectedMissionId] ?? null,
      )}`

      mute.textContent = view.muted ? '🔇' : '🔊'
      const muteAction = view.muted ? '소리 켜기' : '소리 끄기'
      mute.setAttribute('aria-label', muteAction)
      mute.setAttribute('aria-pressed', String(view.muted))
      mute.title = muteAction
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
        result.replaceChildren()
        showOnly()
      } else if (view.phase === 'paused') {
        title.textContent = '바람길 일시정지'
        detail.textContent = '타이머와 비행 진행이 그대로 멈췄습니다.'
        result.replaceChildren()
        showOnly(resume, respawn, restart)
      } else if (view.phase === 'finished') {
        title.textContent = '하늘매듭 완주'
        detail.textContent =
          view.mission.result?.success === true
            ? `${missionDefinition?.name ?? '미션'} 성공 · 더 높은 등급에 도전해 보세요.`
            : `${missionDefinition?.name ?? '미션'} 실패 · 조건을 확인하고 다시 도전하세요.`
        updateResult(view)
        showOnly(retry, chooseMission)
      }

      if (phaseChanged) {
        if (view.phase === 'paused') {
          resume.focus({ preventScroll: true })
        } else if (view.phase === 'finished') {
          retry.focus({ preventScroll: true })
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
