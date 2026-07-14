import './styles.css'

import { GAME_DESCRIPTION, GAME_TITLE } from './game/config'
import {
  createRenderer,
  type RendererRecoveryState,
  type RendererSession,
} from './game/createRenderer'

const appElement = document.querySelector<HTMLElement>('#app')

if (appElement === null) {
  throw new Error('Missing #app root element')
}

const app: HTMLElement = appElement
let rendererSession: RendererSession | null = null
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
  if (import.meta.env.DEV) {
    if (debugMirrorTimer !== null) {
      window.clearInterval(debugMirrorTimer)
      debugMirrorTimer = null
    }

    delete app.dataset.flightDebug
    delete window.__DRAGON_RACE_TEST__
  }
}

function retryWithoutForcedFailure(): void {
  if (import.meta.env.DEV) {
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

function startApplication(recovery?: RendererRecoveryState): void {
  rendererSession?.dispose()
  rendererSession = null
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

    if (import.meta.env.DEV) {
      window.__DRAGON_RACE_TEST__ = {
        loseContext: () => rendererSession?.loseContext?.(),
        qaPassCheckpoint: () => rendererSession?.qaPassCheckpoint?.(),
        qaExploreRegion: (regionId) =>
          rendererSession?.qaExploreRegion?.(regionId),
        qaExploreChallenge: () => rendererSession?.qaExploreChallenge?.(),
        qaExploreLandmark: (landmarkId) =>
          rendererSession?.qaExploreLandmark?.(landmarkId),
        qaExploreWindZone: (windZoneId) =>
          rendererSession?.qaExploreWindZone?.(windZoneId),
        qaExploreCollision: () => rendererSession?.qaExploreCollision?.(),
        qaCollectCoin: (regionId, index) =>
          rendererSession?.qaCollectCoin?.(regionId, index),
        snapshot: () => rendererSession?.debugSnapshot?.() ?? null,
      }

      const mirrorDebugSnapshot = (): void => {
        const snapshot = rendererSession?.debugSnapshot?.()

        if (snapshot !== null && snapshot !== undefined) {
          app.dataset.flightDebug = JSON.stringify(snapshot)
        }
      }

      mirrorDebugSnapshot()
      debugMirrorTimer = window.setInterval(mirrorDebugSnapshot, 100)
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
