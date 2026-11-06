import './styles.css'

import { GAME_DESCRIPTION, GAME_TITLE } from './game/config'
import {
  createRenderer,
  type RendererRecoveryState,
  type RendererSession,
} from './game/createRenderer'
import { PhysicsSession } from './game/physics/PhysicsSession'
import { QA_MODE } from './qaMode'

const appElement = document.querySelector<HTMLElement>('#app')

if (appElement === null) {
  throw new Error('Missing #app root element')
}

const app: HTMLElement = appElement
let rendererSession: RendererSession | null = null
let physicsSession: PhysicsSession | null = null
let debugMirrorTimer: number | null = null
let pendingRecovery: RendererRecoveryState | null = null

function setMetaContent(name: string, content: string): void {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)

  if (meta === null) {
    meta = document.createElement('meta')
    meta.name = name
    document.head.append(meta)
  }

  meta.content = content
}

document.title = GAME_TITLE
setMetaContent('description', GAME_DESCRIPTION)

const themeColor = getComputedStyle(document.documentElement)
  .getPropertyValue('--sky-zenith')
  .trim()

if (themeColor.length > 0) {
  setMetaContent('theme-color', themeColor)
}

function clearTestHook(): void {
  if (QA_MODE) {
    if (debugMirrorTimer !== null) {
      window.clearInterval(debugMirrorTimer)
      debugMirrorTimer = null
    }

    delete app.dataset.flightDebug
    delete window.__DRAGON_RACE_TEST__
  }
}

function retryWithoutForcedFailure(): void {
  if (QA_MODE) {
    const url = new URL(window.location.href)
    url.searchParams.delete('forceWebglFailure')
    window.history.replaceState(null, '', url)
  }

  const recovery = pendingRecovery
  pendingRecovery = null
  startApplication(recovery ?? undefined)
}

function showRendererFailure(
  contextWasLost: boolean,
  recovery?: RendererRecoveryState,
): void {
  pendingRecovery = contextWasLost ? recovery ?? null : null
  rendererSession?.dispose()
  rendererSession = null
  clearTestHook()

  const section = document.createElement('section')
  section.className = 'renderer-failure'
  section.setAttribute('role', 'alert')
  section.setAttribute('aria-labelledby', 'renderer-failure-title')

  const mark = document.createElement('div')
  mark.className = 'renderer-failure__mark'
  mark.setAttribute('aria-hidden', 'true')

  const title = document.createElement('h1')
  title.id = 'renderer-failure-title'
  title.textContent = contextWasLost
    ? '하늘과의 연결이 끊겼어요'
    : '하늘을 불러오지 못했어요'

  const detail = document.createElement('p')
  detail.textContent = contextWasLost
    ? '그래픽 연결을 다시 준비하면 같은 화면에서 계속 시작할 수 있습니다.'
    : '브라우저의 그래픽 가속 상태를 확인한 뒤 다시 시도해 주세요.'

  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = '다시 시도'
  retry.addEventListener('click', retryWithoutForcedFailure, { once: true })

  section.append(mark, title, detail, retry)
  app.dataset.state = 'renderer-error'
  app.replaceChildren(section)
  retry.focus()
}

function startPhysicsApplication(): void {
  rendererSession?.dispose()
  rendererSession = null
  physicsSession?.dispose()
  physicsSession = null
  clearTestHook()
  app.replaceChildren()

  const container = document.createElement('div')
  container.className = 'physics-canvas-container'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.overflow = 'hidden'
  container.style.position = 'relative'

  // HUD Overlay
  const hud = document.createElement('div')
  hud.className = 'physics-hud'
  hud.style.position = 'absolute'
  hud.style.top = '16px'
  hud.style.left = '16px'
  hud.style.padding = '14px 20px'
  hud.style.background = 'rgba(18, 24, 33, 0.82)'
  hud.style.color = '#fff'
  hud.style.borderRadius = '12px'
  hud.style.backdropFilter = 'blur(8px)'
  hud.style.fontFamily = 'system-ui, sans-serif'
  hud.style.boxShadow = '0 8px 32px rgba(0,0,0,0.25)'
  hud.style.zIndex = '100'

  hud.innerHTML = `
    <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px; color: #ffaa33;">
      🚗 Bruno Simon 스타일 Rapier3D 물리 놀이터
    </div>
    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 10px;">
      <b>WASD / 방향키</b>: 가속 및 조향 &nbsp;|&nbsp; <b>Shift</b>: 드리프트 &nbsp;|&nbsp; <b>Space</b>: 점프
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div id="physics-speed" style="font-size: 14px; font-weight: 600; color: #38bdf8;">속도: 0.0 km/h</div>
      <a href="?mode=race" style="margin-left: 16px; font-size: 12px; color: #94a3b8; text-decoration: underline;">🐉 드래곤 비행 복귀</a>
    </div>
  `

  container.appendChild(hud)
  app.appendChild(container)

  const speedEl = hud.querySelector<HTMLElement>('#physics-speed')

  physicsSession = new PhysicsSession(container, {
    onSpeedChange: (speed) => {
      if (speedEl) {
        speedEl.textContent = `속도: ${(Math.abs(speed) * 3.6).toFixed(1)} km/h`
      }
    },
  })

  physicsSession.init().catch((err) => {
    console.error('Failed to init physics session', err)
  })
}

function startApplication(recovery?: RendererRecoveryState): void {
  const urlParams = new URLSearchParams(window.location.search)
  const isPhysicsMode =
    urlParams.get('mode') === 'physics' || urlParams.get('mode') === 'bruno'

  if (isPhysicsMode) {
    startPhysicsApplication()
    return
  }

  rendererSession?.dispose()
  rendererSession = null
  physicsSession?.dispose()
  physicsSession = null
  clearTestHook()
  app.replaceChildren()

  try {
    rendererSession = createRenderer(
      app,
      (recoveryState) => {
        showRendererFailure(true, recoveryState)
      },
      recovery,
    )
    app.dataset.state = 'renderer-ready'

    if (QA_MODE) {
      window.__DRAGON_RACE_TEST__ = {
        loseContext: () => rendererSession?.loseContext?.(),
        qaPassCheckpoint: () => rendererSession?.qaPassCheckpoint?.(),
        qaExploreRegion: (regionId) =>
          rendererSession?.qaExploreRegion?.(regionId),
        qaExploreChallenge: () => rendererSession?.qaExploreChallenge?.(),
        qaExploreVolcanicChallenge: () =>
          rendererSession?.qaExploreVolcanicChallenge?.(),
        qaExploreLandmark: (landmarkId) =>
          rendererSession?.qaExploreLandmark?.(landmarkId),
        qaExploreLandmarkView: (landmarkId) =>
          rendererSession?.qaExploreLandmarkView?.(landmarkId),
        qaExploreOverview: () => rendererSession?.qaExploreOverview?.(),
        qaExploreLandingPad: (landingPadId) =>
          rendererSession?.qaExploreLandingPad?.(landingPadId),
        qaExploreWindZone: (windZoneId) =>
          rendererSession?.qaExploreWindZone?.(windZoneId),
        qaExploreCollision: () => rendererSession?.qaExploreCollision?.(),
        qaCollectCoin: (regionId, index) =>
          rendererSession?.qaCollectCoin?.(regionId, index),
        qaGeometryLedger: () =>
          rendererSession?.qaGeometryLedger?.() ?? null,
        snapshot: () => rendererSession?.debugSnapshot?.() ?? null,
      }

      if (import.meta.env.DEV) {
        const mirrorDebugSnapshot = (): void => {
          const snapshot = rendererSession?.debugSnapshot?.()

          if (snapshot !== null && snapshot !== undefined) {
            app.dataset.flightDebug = JSON.stringify(snapshot)
          }
        }

        mirrorDebugSnapshot()
        debugMirrorTimer = window.setInterval(mirrorDebugSnapshot, 100)
      }
    }
  } catch {
    showRendererFailure(false)
  }
}

startApplication()

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    rendererSession?.dispose()
    clearTestHook()
  })
}
