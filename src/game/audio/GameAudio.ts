export interface GameAudioDebugSnapshot {
  readonly contextCreated: boolean
  readonly unlocked: boolean
  readonly muted: boolean
  readonly musicVolume: number
  readonly musicActive: boolean
  readonly pageVisible: boolean
  readonly bgmCreated: boolean
  readonly bgmPlaying: boolean
  readonly bgmPositionSeconds: number
  readonly bgmPlayAttempts: number
  readonly bgmPlayFailures: number
  readonly gateCues: number
  readonly boostCues: number
  readonly finishCues: number
}

export interface GameAudio {
  unlock(): Promise<void>
  setMuted(muted: boolean): void
  setMusicVolume(volume: number): void
  setMusicPositionSeconds(positionSeconds: number): void
  getMusicPositionSeconds(): number
  setMusicActive(active: boolean): void
  setPageVisible(visible: boolean): void
  playGate(): void
  setBoosting(boosting: boolean): void
  playFinish(): void
  debugSnapshot(): GameAudioDebugSnapshot
  dispose(): void
}

export type AudioContextFactory = () => AudioContext
export type MusicElementFactory = () => HTMLAudioElement

function defaultContextFactory(): AudioContext {
  return new AudioContext()
}

function defaultMusicElementFactory(): HTMLAudioElement {
  return new Audio()
}

const MUSIC_FILE_BASENAME = 'sovereign-of-the-sunrise-skies-loop'

function musicAssetUrl(extension: 'ogg' | 'm4a'): string {
  return `${import.meta.env.BASE_URL}assets/audio/${MUSIC_FILE_BASENAME}.${extension}`
}

interface Tone {
  readonly frequency: number
  readonly durationSeconds: number
  readonly delaySeconds?: number
  readonly type?: OscillatorType
  readonly volume?: number
}

export function createGameAudio(
  contextFactory: AudioContextFactory = defaultContextFactory,
  initiallyMuted = false,
  initialMusicVolume = 0.35,
  musicElementFactory: MusicElementFactory = defaultMusicElementFactory,
): GameAudio {
  let context: AudioContext | null = null
  let unlocked = false
  let muted = initiallyMuted
  let musicVolume =
    Number.isFinite(initialMusicVolume) && initialMusicVolume >= 0 && initialMusicVolume <= 1
      ? initialMusicVolume
      : 0.35
  let musicActive = false
  let pageVisible = true
  let gestureUnlocked = false
  let musicElement: HTMLAudioElement | null = null
  let musicPositionSeconds = 0
  let bgmPlaying = false
  let musicPlayPending = false
  let bgmPlayAttempts = 0
  let bgmPlayFailures = 0
  let musicPlaybackToken = 0
  let boosting = false
  let disposed = false
  let gateCues = 0
  let boostCues = 0
  let finishCues = 0
  const activeOscillators = new Set<OscillatorNode>()

  const shouldPlayMusic = (): boolean =>
    !disposed &&
    gestureUnlocked &&
    musicActive &&
    pageVisible &&
    !muted &&
    musicVolume > 0

  const getMusicElement = (): HTMLAudioElement | null => {
    if (musicElement !== null) return musicElement

    try {
      const element = musicElementFactory()
      const supportsOgg = element.canPlayType('audio/ogg; codecs="vorbis"') !== ''
      element.src = musicAssetUrl(supportsOgg ? 'ogg' : 'm4a')
      element.preload = 'metadata'
      element.loop = true
      element.volume = musicVolume
      if (musicPositionSeconds > 0) {
        try {
          element.currentTime = musicPositionSeconds
        } catch {
          element.addEventListener(
            'loadedmetadata',
            () => {
              try {
                element.currentTime = musicPositionSeconds
              } catch {
                // An invalid seek must not block starting from the beginning.
              }
            },
            { once: true },
          )
        }
      }
      musicElement = element
      return element
    } catch {
      return null
    }
  }

  const pauseMusic = (): void => {
    musicPlaybackToken += 1
    bgmPlaying = false
    musicPlayPending = false
    try {
      musicElement?.pause()
    } catch {
      // Media shutdown is best-effort and must never interrupt gameplay.
    }
  }

  const getMusicPositionSeconds = (): number => {
    const position = musicElement?.currentTime ?? musicPositionSeconds
    return Number.isFinite(position) && position >= 0
      ? position
      : musicPositionSeconds
  }

  const syncMusicPlayback = (): void => {
    if (!shouldPlayMusic()) {
      pauseMusic()
      return
    }

    const element = getMusicElement()
    if (element === null) return
    element.volume = musicVolume
    if (!element.paused || musicPlayPending) return

    const token = ++musicPlaybackToken
    bgmPlayAttempts += 1
    musicPlayPending = true
    try {
      void Promise.resolve(element.play()).then(
        () => {
          if (
            token !== musicPlaybackToken ||
            element !== musicElement ||
            !shouldPlayMusic()
          ) {
            if (element !== musicElement || !shouldPlayMusic()) {
              try {
                element.pause()
              } catch {
                // A stale play completion is already logically stopped.
              }
            }
            return
          }
          musicPlayPending = false
          bgmPlaying = true
        },
        () => {
          if (token !== musicPlaybackToken) return
          musicPlayPending = false
          bgmPlaying = false
          bgmPlayFailures += 1
        },
      )
    } catch {
      if (token === musicPlaybackToken) {
        musicPlayPending = false
        bgmPlaying = false
        bgmPlayFailures += 1
      }
    }
  }

  const stopActiveOscillators = (): void => {
    for (const oscillator of [...activeOscillators]) {
      try {
        oscillator.stop()
      } catch {
        activeOscillators.delete(oscillator)
      }
    }
  }

  const playTone = (tone: Tone): boolean => {
    if (disposed || muted || !unlocked || context === null) {
      return false
    }

    let oscillator: OscillatorNode | null = null
    let gain: GainNode | null = null
    try {
      oscillator = context.createOscillator()
      gain = context.createGain()
      const startAt = context.currentTime + (tone.delaySeconds ?? 0)
      const stopAt = startAt + tone.durationSeconds
      oscillator.type = tone.type ?? 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, startAt)
      gain.gain.setValueAtTime(tone.volume ?? 0.08, startAt)
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        activeOscillators.delete(oscillator as OscillatorNode)
        try {
          oscillator?.disconnect()
          gain?.disconnect()
        } catch {
          // A disconnected optional audio node needs no further recovery.
        }
      }
      activeOscillators.add(oscillator)
      oscillator.start(startAt)
      oscillator.stop(stopAt)
      return true
    } catch {
      if (oscillator !== null) {
        activeOscillators.delete(oscillator)
        try {
          oscillator.disconnect()
        } catch {
          // Creation/start failure is intentionally non-blocking.
        }
      }
      try {
        gain?.disconnect()
      } catch {
        // Creation/start failure is intentionally non-blocking.
      }
      return false
    }
  }

  return {
    unlock: async () => {
      if (disposed) {
        return
      }

      gestureUnlocked = true
      const attemptsBeforeUnlock = bgmPlayAttempts
      syncMusicPlayback()
      if (unlocked) return

      try {
        context ??= contextFactory()
        if (context.state === 'suspended') {
          await context.resume()
        }
        unlocked = context.state === 'running'
      } catch {
        unlocked = false
      }
      if (bgmPlayAttempts === attemptsBeforeUnlock) {
        syncMusicPlayback()
      }
    },
    setMuted: (nextMuted) => {
      muted = nextMuted
      if (muted) {
        stopActiveOscillators()
      }
      syncMusicPlayback()
    },
    setMusicVolume: (nextVolume) => {
      if (!Number.isFinite(nextVolume)) return
      musicVolume = Math.min(1, Math.max(0, nextVolume))
      if (musicElement !== null) musicElement.volume = musicVolume
      syncMusicPlayback()
    },
    setMusicPositionSeconds: (positionSeconds) => {
      if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return
      musicPositionSeconds = positionSeconds
      if (musicElement !== null) {
        try {
          musicElement.currentTime = positionSeconds
        } catch {
          // A later metadata event or normal playback can recover the seek.
        }
      }
    },
    getMusicPositionSeconds,
    setMusicActive: (active) => {
      musicActive = active
      syncMusicPlayback()
    },
    setPageVisible: (visible) => {
      pageVisible = visible
      syncMusicPlayback()
    },
    playGate: () => {
      if (
        playTone({
          frequency: 620,
          durationSeconds: 0.16,
          type: 'triangle',
          volume: 0.07,
        })
      ) {
        gateCues += 1
      }
    },
    setBoosting: (nextBoosting) => {
      const risingEdge = nextBoosting && !boosting
      boosting = nextBoosting
      if (
        risingEdge &&
        playTone({
          frequency: 180,
          durationSeconds: 0.22,
          type: 'sawtooth',
          volume: 0.045,
        })
      ) {
        boostCues += 1
      }
    },
    playFinish: () => {
      const played = [
        { frequency: 440, delaySeconds: 0 },
        { frequency: 554, delaySeconds: 0.12 },
        { frequency: 659, delaySeconds: 0.24 },
      ]
        .map((tone) =>
          playTone({
            ...tone,
            durationSeconds: 0.32,
            type: 'triangle',
            volume: 0.065,
          }),
        )
        .some(Boolean)
      if (played) {
        finishCues += 1
      }
    },
    debugSnapshot: () => ({
      contextCreated: context !== null,
      unlocked,
      muted,
      musicVolume,
      musicActive,
      pageVisible,
      bgmCreated: musicElement !== null,
      bgmPlaying,
      bgmPositionSeconds: getMusicPositionSeconds(),
      bgmPlayAttempts,
      bgmPlayFailures,
      gateCues,
      boostCues,
      finishCues,
    }),
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      stopActiveOscillators()
      pauseMusic()
      if (musicElement !== null) {
        musicPositionSeconds = getMusicPositionSeconds()
        try {
          musicElement.removeAttribute('src')
          musicElement.load()
        } catch {
          // Releasing a media resource is best-effort during teardown.
        }
        musicElement = null
      }
      if (context !== null && context.state !== 'closed') {
        void context.close().catch(() => undefined)
      }
      context = null
      unlocked = false
    },
  }
}
