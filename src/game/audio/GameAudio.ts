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
  readonly wingFlapCues: number
  readonly boostCues: number
  readonly finishCues: number
  readonly discoveryCues: number
  readonly windEntryCues: number
  readonly ambientWindStrength: number
  readonly windBedPlaying: boolean
  readonly volcanicAmbienceIntensity: number
  readonly volcanicBedPlaying: boolean
  readonly rockWarningCues: number
  readonly lavaWarningCues: number
  readonly coolingSealCues: number
  readonly eruptionEscapeCues: number
}

export interface GameAudio {
  unlock(): Promise<void>
  setMuted(muted: boolean): void
  setMusicVolume(volume: number): void
  setMusicPositionSeconds(positionSeconds: number): void
  getMusicPositionSeconds(): number
  setMusicActive(active: boolean): void
  setPageVisible(visible: boolean): void
  setAmbientWind(strength: number): void
  setVolcanicIntensity(intensity: number): void
  playGate(): void
  playDiscovery(): void
  playWindEntry(): void
  playRockWarning(): void
  playLavaWarning(): void
  playCoolingSeal(): void
  playEruptionEscape(): void
  playWingFlap(): void
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

interface NoiseBurst {
  readonly durationSeconds: number
  readonly attackSeconds: number
  readonly filterStartHz: number
  readonly filterEndHz: number
  readonly filterQ: number
  readonly volume: number
}

const NOISE_BUFFER_SECONDS = 2
const WING_FLAP_BURST: NoiseBurst = {
  durationSeconds: 0.18,
  attackSeconds: 0.012,
  filterStartHz: 720,
  filterEndHz: 220,
  filterQ: 0.85,
  volume: 0.055,
}
const BOOST_WHOOSH_BURST: NoiseBurst = {
  durationSeconds: 0.78,
  attackSeconds: 0.018,
  filterStartHz: 2_100,
  filterEndHz: 260,
  filterQ: 0.68,
  volume: 0.12,
}
const WIND_ENTRY_BURST: NoiseBurst = {
  durationSeconds: 0.42,
  attackSeconds: 0.08,
  filterStartHz: 320,
  filterEndHz: 1_100,
  filterQ: 0.58,
  volume: 0.045,
}
const ROCK_WARNING_BURST: NoiseBurst = {
  durationSeconds: 0.46,
  attackSeconds: 0.025,
  filterStartHz: 170,
  filterEndHz: 74,
  filterQ: 1.15,
  volume: 0.072,
}
const LAVA_WARNING_BURST: NoiseBurst = {
  durationSeconds: 0.62,
  attackSeconds: 0.12,
  filterStartHz: 95,
  filterEndHz: 310,
  filterQ: 0.72,
  volume: 0.065,
}
const ERUPTION_ESCAPE_BURST: NoiseBurst = {
  durationSeconds: 0.9,
  attackSeconds: 0.04,
  filterStartHz: 260,
  filterEndHz: 1_450,
  filterQ: 0.62,
  volume: 0.09,
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
  let wingFlapCues = 0
  let boostCues = 0
  let finishCues = 0
  let discoveryCues = 0
  let windEntryCues = 0
  let ambientWindStrength = 0
  let windBedSource: AudioBufferSourceNode | null = null
  let windBedFilter: BiquadFilterNode | null = null
  let windBedGain: GainNode | null = null
  let lastAppliedAmbientWindStrength = -1
  let volcanicAmbienceIntensity = 0
  let volcanicBedSource: AudioBufferSourceNode | null = null
  let volcanicBedFilter: BiquadFilterNode | null = null
  let volcanicBedGain: GainNode | null = null
  let lastAppliedVolcanicAmbienceIntensity = -1
  let rockWarningCues = 0
  let lavaWarningCues = 0
  let coolingSealCues = 0
  let eruptionEscapeCues = 0
  let noiseBuffer: AudioBuffer | null = null
  const activeSources = new Set<AudioScheduledSourceNode>()

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

  const stopWindBed = (immediate = true): void => {
    const source = windBedSource
    const filter = windBedFilter
    const gain = windBedGain
    windBedSource = null
    windBedFilter = null
    windBedGain = null
    lastAppliedAmbientWindStrength = -1
    if (source === null) return
    const stopAt =
      immediate || context === null
        ? undefined
        : context.currentTime + 0.18
    try {
      if (!immediate && gain !== null && context !== null) {
        gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.05)
      }
      source.stop(stopAt)
    } catch {
      // An already-stopped ambient source needs no further recovery.
    }
    if (immediate) {
      activeSources.delete(source)
      try {
        source.disconnect()
        filter?.disconnect()
        gain?.disconnect()
      } catch {
        // Ambient teardown is best-effort during lifecycle boundaries.
      }
    }
  }

  const stopVolcanicBed = (immediate = true): void => {
    const source = volcanicBedSource
    const filter = volcanicBedFilter
    const gain = volcanicBedGain
    volcanicBedSource = null
    volcanicBedFilter = null
    volcanicBedGain = null
    lastAppliedVolcanicAmbienceIntensity = -1
    if (source === null) return
    const stopAt =
      immediate || context === null
        ? undefined
        : context.currentTime + 0.24
    try {
      if (!immediate && gain !== null && context !== null) {
        gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.08)
      }
      source.stop(stopAt)
    } catch {
      // An already-stopped ambience source needs no further recovery.
    }
    if (immediate) {
      activeSources.delete(source)
      try {
        source.disconnect()
        filter?.disconnect()
        gain?.disconnect()
      } catch {
        // Volcanic ambience teardown is best-effort at lifecycle boundaries.
      }
    }
  }

  const stopActiveSources = (): void => {
    stopWindBed()
    stopVolcanicBed()
    for (const source of [...activeSources]) {
      try {
        source.stop()
      } catch {
        activeSources.delete(source)
      }
    }
  }

  const playTone = (tone: Tone): boolean => {
    if (
      disposed ||
      muted ||
      !unlocked ||
      !pageVisible ||
      context === null
    ) {
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
        activeSources.delete(oscillator as OscillatorNode)
        try {
          oscillator?.disconnect()
          gain?.disconnect()
        } catch {
          // A disconnected optional audio node needs no further recovery.
        }
      }
      activeSources.add(oscillator)
      oscillator.start(startAt)
      oscillator.stop(stopAt)
      return true
    } catch {
      if (oscillator !== null) {
        activeSources.delete(oscillator)
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

  const getNoiseBuffer = (): AudioBuffer | null => {
    if (noiseBuffer !== null) return noiseBuffer
    if (context === null) return null

    try {
      const sampleCount = Math.ceil(context.sampleRate * NOISE_BUFFER_SECONDS)
      const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
      const samples = buffer.getChannelData(0)
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = Math.random() * 2 - 1
      }
      noiseBuffer = buffer
      return buffer
    } catch {
      return null
    }
  }

  const syncAmbientWind = (): void => {
    const shouldPlay =
      !disposed &&
      !muted &&
      unlocked &&
      pageVisible &&
      ambientWindStrength > 0.001 &&
      context !== null
    if (!shouldPlay || context === null) {
      const lifecycleStop =
        disposed || muted || !unlocked || !pageVisible || context === null
      stopWindBed(lifecycleStop)
      return
    }

    if (
      windBedSource === null ||
      windBedFilter === null ||
      windBedGain === null
    ) {
      const buffer = getNoiseBuffer()
      if (buffer === null) return
      try {
        const source = context.createBufferSource()
        const filter = context.createBiquadFilter()
        const gain = context.createGain()
        source.buffer = buffer
        source.loop = true
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(380, context.currentTime)
        filter.Q.setValueAtTime(0.55, context.currentTime)
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        source.connect(filter)
        filter.connect(gain)
        gain.connect(context.destination)
        source.onended = () => {
          activeSources.delete(source)
          if (windBedSource === source) {
            windBedSource = null
            windBedFilter = null
            windBedGain = null
          }
          try {
            source.disconnect()
            filter.disconnect()
            gain.disconnect()
          } catch {
            // A completed ambient source has no remaining resources.
          }
        }
        windBedSource = source
        windBedFilter = filter
        windBedGain = gain
        activeSources.add(source)
        source.start(context.currentTime, 0)
      } catch {
        stopWindBed()
        return
      }
    }

    if (
      Math.abs(ambientWindStrength - lastAppliedAmbientWindStrength) <
      0.01
    ) {
      return
    }
    const frequency = 380 + ambientWindStrength * 820
    const volume = 0.008 + ambientWindStrength * 0.038
    windBedFilter.frequency.setTargetAtTime(
      frequency,
      context.currentTime,
      0.12,
    )
    windBedGain.gain.setTargetAtTime(
      volume,
      context.currentTime,
      0.12,
    )
    lastAppliedAmbientWindStrength = ambientWindStrength
  }

  const syncVolcanicAmbience = (): void => {
    const shouldPlay =
      !disposed &&
      !muted &&
      unlocked &&
      pageVisible &&
      volcanicAmbienceIntensity > 0.001 &&
      context !== null
    if (!shouldPlay || context === null) {
      const lifecycleStop =
        disposed || muted || !unlocked || !pageVisible || context === null
      stopVolcanicBed(lifecycleStop)
      return
    }

    if (
      volcanicBedSource === null ||
      volcanicBedFilter === null ||
      volcanicBedGain === null
    ) {
      const buffer = getNoiseBuffer()
      if (buffer === null) return
      try {
        const source = context.createBufferSource()
        const filter = context.createBiquadFilter()
        const gain = context.createGain()
        source.buffer = buffer
        source.loop = true
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(240, context.currentTime)
        filter.Q.setValueAtTime(1.2, context.currentTime)
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        source.connect(filter)
        filter.connect(gain)
        gain.connect(context.destination)
        source.onended = () => {
          activeSources.delete(source)
          if (volcanicBedSource === source) {
            volcanicBedSource = null
            volcanicBedFilter = null
            volcanicBedGain = null
          }
          try {
            source.disconnect()
            filter.disconnect()
            gain.disconnect()
          } catch {
            // A completed volcanic bed has no resources left to recover.
          }
        }
        volcanicBedSource = source
        volcanicBedFilter = filter
        volcanicBedGain = gain
        activeSources.add(source)
        source.start(context.currentTime, 0)
      } catch {
        stopVolcanicBed()
        return
      }
    }

    if (
      Math.abs(
        volcanicAmbienceIntensity -
          lastAppliedVolcanicAmbienceIntensity,
      ) < 0.01
    ) {
      return
    }
    const frequency = 210 + volcanicAmbienceIntensity * 390
    const volume = 0.006 + volcanicAmbienceIntensity * 0.032
    volcanicBedFilter.frequency.setTargetAtTime(
      frequency,
      context.currentTime,
      0.18,
    )
    volcanicBedGain.gain.setTargetAtTime(
      volume,
      context.currentTime,
      0.18,
    )
    lastAppliedVolcanicAmbienceIntensity = volcanicAmbienceIntensity
  }

  const playNoiseBurst = (burst: NoiseBurst, variationIndex: number): boolean => {
    if (
      disposed ||
      muted ||
      !unlocked ||
      !pageVisible ||
      context === null
    ) {
      return false
    }

    const buffer = getNoiseBuffer()
    if (buffer === null) return false

    let source: AudioBufferSourceNode | null = null
    let filter: BiquadFilterNode | null = null
    let gain: GainNode | null = null
    try {
      source = context.createBufferSource()
      filter = context.createBiquadFilter()
      gain = context.createGain()
      const startAt = context.currentTime
      const attackAt = startAt + burst.attackSeconds
      const stopAt = startAt + burst.durationSeconds
      const availableOffset = Math.max(
        0,
        NOISE_BUFFER_SECONDS - burst.durationSeconds,
      )
      const offsetSeconds =
        availableOffset === 0
          ? 0
          : (variationIndex * 0.173) % availableOffset

      source.buffer = buffer
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(burst.filterStartHz, startAt)
      filter.frequency.exponentialRampToValueAtTime(
        burst.filterEndHz,
        stopAt,
      )
      filter.Q.setValueAtTime(burst.filterQ, startAt)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(burst.volume, attackAt)
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)
      source.connect(filter)
      filter.connect(gain)
      gain.connect(context.destination)
      source.onended = () => {
        activeSources.delete(source as AudioBufferSourceNode)
        try {
          source?.disconnect()
          filter?.disconnect()
          gain?.disconnect()
        } catch {
          // A completed air burst has no remaining resources to recover.
        }
      }
      activeSources.add(source)
      source.start(startAt, offsetSeconds)
      source.stop(stopAt)
      return true
    } catch {
      if (source !== null) activeSources.delete(source)
      try {
        source?.disconnect()
        filter?.disconnect()
        gain?.disconnect()
      } catch {
        // Optional flight audio must never interrupt gameplay.
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
      syncAmbientWind()
      syncVolcanicAmbience()
    },
    setMuted: (nextMuted) => {
      muted = nextMuted
      if (muted) {
        stopActiveSources()
      }
      syncMusicPlayback()
      syncAmbientWind()
      syncVolcanicAmbience()
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
      if (!visible) {
        stopActiveSources()
      }
      syncMusicPlayback()
      syncAmbientWind()
      syncVolcanicAmbience()
    },
    setAmbientWind: (strength) => {
      if (!Number.isFinite(strength)) return
      ambientWindStrength = Math.min(1, Math.max(0, strength))
      syncAmbientWind()
    },
    setVolcanicIntensity: (intensity) => {
      if (!Number.isFinite(intensity) || disposed) return
      volcanicAmbienceIntensity = Math.min(1, Math.max(0, intensity))
      syncVolcanicAmbience()
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
    playWingFlap: () => {
      if (playNoiseBurst(WING_FLAP_BURST, wingFlapCues)) {
        wingFlapCues += 1
      }
    },
    playDiscovery: () => {
      const played = [
        { frequency: 740, delaySeconds: 0 },
        { frequency: 988, delaySeconds: 0.1 },
      ]
        .map((tone) =>
          playTone({
            ...tone,
            durationSeconds: 0.24,
            type: 'triangle',
            volume: 0.045,
          }),
        )
        .some(Boolean)
      if (played) discoveryCues += 1
    },
    playWindEntry: () => {
      if (playNoiseBurst(WIND_ENTRY_BURST, windEntryCues + 501)) {
        windEntryCues += 1
      }
    },
    playRockWarning: () => {
      const played = [
        playNoiseBurst(ROCK_WARNING_BURST, rockWarningCues + 701),
        playTone({
          frequency: 144,
          durationSeconds: 0.36,
          type: 'square',
          volume: 0.045,
        }),
        playTone({
          frequency: 108,
          durationSeconds: 0.42,
          delaySeconds: 0.16,
          type: 'square',
          volume: 0.04,
        }),
      ].some(Boolean)
      if (played) rockWarningCues += 1
    },
    playLavaWarning: () => {
      const played = [
        playNoiseBurst(LAVA_WARNING_BURST, lavaWarningCues + 809),
        playTone({
          frequency: 92,
          durationSeconds: 0.5,
          type: 'sawtooth',
          volume: 0.038,
        }),
        playTone({
          frequency: 138,
          durationSeconds: 0.54,
          delaySeconds: 0.12,
          type: 'sawtooth',
          volume: 0.035,
        }),
      ].some(Boolean)
      if (played) lavaWarningCues += 1
    },
    playCoolingSeal: () => {
      const played = [
        { frequency: 660, delaySeconds: 0 },
        { frequency: 880, delaySeconds: 0.1 },
        { frequency: 1_174, delaySeconds: 0.2 },
      ]
        .map((tone) =>
          playTone({
            ...tone,
            durationSeconds: 0.38,
            type: 'sine',
            volume: 0.052,
          }),
        )
        .some(Boolean)
      if (played) coolingSealCues += 1
    },
    playEruptionEscape: () => {
      const played = [
        playNoiseBurst(
          ERUPTION_ESCAPE_BURST,
          eruptionEscapeCues + 907,
        ),
        ...[
          { frequency: 262, delaySeconds: 0 },
          { frequency: 392, delaySeconds: 0.12 },
          { frequency: 523, delaySeconds: 0.24 },
        ].map((tone) =>
          playTone({
            ...tone,
            durationSeconds: 0.46,
            type: 'triangle',
            volume: 0.055,
          }),
        ),
      ].some(Boolean)
      if (played) eruptionEscapeCues += 1
    },
    setBoosting: (nextBoosting) => {
      const risingEdge = nextBoosting && !boosting
      boosting = nextBoosting
      if (risingEdge && playNoiseBurst(BOOST_WHOOSH_BURST, boostCues + 101)) {
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
      wingFlapCues,
      boostCues,
      finishCues,
      discoveryCues,
      windEntryCues,
      ambientWindStrength,
      windBedPlaying: windBedSource !== null,
      volcanicAmbienceIntensity,
      volcanicBedPlaying: volcanicBedSource !== null,
      rockWarningCues,
      lavaWarningCues,
      coolingSealCues,
      eruptionEscapeCues,
    }),
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      stopActiveSources()
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
      noiseBuffer = null
      unlocked = false
    },
  }
}
