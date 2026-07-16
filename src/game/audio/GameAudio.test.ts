import { describe, expect, it } from 'vitest'

import { createGameAudio } from './GameAudio'

class FakeAudioParam {
  readonly setValues: Array<{ readonly value: number; readonly time: number }> = []
  readonly ramps: Array<{ readonly value: number; readonly time: number }> = []
  readonly targets: Array<{
    readonly value: number
    readonly time: number
    readonly timeConstant: number
  }> = []

  setValueAtTime(value: number, time: number): void {
    this.setValues.push({ value, time })
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.ramps.push({ value, time })
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.targets.push({ value, time, timeConstant })
  }
}

class FakeOscillator {
  readonly frequency = new FakeAudioParam()
  type: OscillatorType = 'sine'
  onended: (() => void) | null = null
  starts = 0
  stops = 0
  readonly stopTimes: number[] = []
  throwOnStart = false

  connect(): void {}

  disconnect(): void {}

  start(): void {
    if (this.throwOnStart) {
      throw new Error('start blocked')
    }
    this.starts += 1
  }

  stop(when = 0): void {
    this.stops += 1
    this.stopTimes.push(when)
    if (when === 0) {
      this.onended?.()
    }
  }
}

class FakeGain {
  readonly gain = new FakeAudioParam()

  connect(): void {}

  disconnect(): void {}
}

class FakeAudioBuffer {
  private readonly samples: Float32Array

  constructor(length: number) {
    this.samples = new Float32Array(length)
  }

  getChannelData(): Float32Array {
    return this.samples
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null
  loop = false
  onended: (() => void) | null = null
  starts = 0
  stops = 0
  readonly startTimes: number[] = []
  readonly stopTimes: number[] = []

  connect(): void {}

  disconnect(): void {}

  start(when = 0): void {
    this.starts += 1
    this.startTimes.push(when)
  }

  stop(when = 0): void {
    this.stops += 1
    this.stopTimes.push(when)
  }
}

class FakeBiquadFilter {
  readonly frequency = new FakeAudioParam()
  readonly Q = new FakeAudioParam()
  type: BiquadFilterType = 'lowpass'

  connect(): void {}

  disconnect(): void {}
}

class FakeAudioContext {
  readonly destination = {} as AudioDestinationNode
  readonly oscillators: FakeOscillator[] = []
  readonly bufferSources: FakeBufferSource[] = []
  readonly filters: FakeBiquadFilter[] = []
  readonly gains: FakeGain[] = []
  readonly sampleRate = 48_000
  currentTime = 10
  state: AudioContextState = 'suspended'
  resumes = 0
  closes = 0
  throwOnResume = false
  throwOnCreate = false
  throwOnStart = false

  async resume(): Promise<void> {
    this.resumes += 1
    if (this.throwOnResume) {
      throw new Error('resume blocked')
    }
    this.state = 'running'
  }

  createOscillator(): OscillatorNode {
    if (this.throwOnCreate) {
      throw new Error('create blocked')
    }
    const oscillator = new FakeOscillator()
    oscillator.throwOnStart = this.throwOnStart
    this.oscillators.push(oscillator)
    return oscillator as unknown as OscillatorNode
  }

  createGain(): GainNode {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain as unknown as GainNode
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    return new FakeAudioBuffer(length) as unknown as AudioBuffer
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource()
    this.bufferSources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  createBiquadFilter(): BiquadFilterNode {
    const filter = new FakeBiquadFilter()
    this.filters.push(filter)
    return filter as unknown as BiquadFilterNode
  }

  async close(): Promise<void> {
    this.closes += 1
    this.state = 'closed'
  }
}

class FakeMusicElement {
  src = ''
  preload = ''
  loop = false
  volume = 1
  currentTime = 0
  paused = true
  plays = 0
  pauses = 0
  loads = 0
  removedSources = 0
  rejectPlay = false

  canPlayType(type: string): CanPlayTypeResult {
    return type.includes('ogg') ? 'probably' : 'maybe'
  }

  play(): Promise<void> {
    this.plays += 1
    if (this.rejectPlay) {
      return Promise.reject(new Error('autoplay blocked'))
    }
    this.paused = false
    return Promise.resolve()
  }

  pause(): void {
    this.pauses += 1
    this.paused = true
  }

  load(): void {
    this.loads += 1
  }

  removeAttribute(name: string): void {
    if (name !== 'src') return
    this.src = ''
    this.removedSources += 1
  }
}

class DeferredMusicElement extends FakeMusicElement {
  readonly pendingPlayResolutions: Array<() => void> = []

  play(): Promise<void> {
    this.plays += 1
    this.paused = false
    return new Promise((resolve) => {
      this.pendingPlayResolutions.push(resolve)
    })
  }
}

describe('generated game audio', () => {
  it('does not create or resume a context before user unlock', () => {
    let factoryCalls = 0
    const audio = createGameAudio(() => {
      factoryCalls += 1
      return new FakeAudioContext() as unknown as AudioContext
    })

    audio.playGate()
    audio.playDiscovery()
    audio.playWindEntry()
    audio.setAmbientWind(0.6)
    audio.setVolcanicIntensity(0.7)
    audio.playRockWarning()
    audio.playLavaWarning()
    audio.playCoolingSeal()
    audio.playEruptionEscape()
    audio.setBoosting(true)
    audio.playFinish()

    expect(factoryCalls).toBe(0)
    expect(audio.debugSnapshot()).toEqual({
      contextCreated: false,
      unlocked: false,
      muted: false,
      musicVolume: 0.35,
      musicActive: false,
      pageVisible: true,
      bgmCreated: false,
      bgmPlaying: false,
      bgmPositionSeconds: 0,
      bgmPlayAttempts: 0,
      bgmPlayFailures: 0,
      gateCues: 0,
      wingFlapCues: 0,
      boostCues: 0,
      finishCues: 0,
      discoveryCues: 0,
      windEntryCues: 0,
      ambientWindStrength: 0.6,
      windBedPlaying: false,
      volcanicAmbienceIntensity: 0.7,
      volcanicBedPlaying: false,
      rockWarningCues: 0,
      lavaWarningCues: 0,
      coolingSealCues: 0,
      eruptionEscapeCues: 0,
    })
  })

  it('creates and resumes the context only when unlocked', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )

    await audio.unlock()
    await audio.unlock()

    expect(context.resumes).toBe(1)
    expect(audio.debugSnapshot()).toMatchObject({
      contextCreated: true,
      unlocked: true,
    })
  })

  it('plays one boost cue per rising edge plus gate and finish cues', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()

    audio.playGate()
    audio.setBoosting(true)
    audio.setBoosting(true)
    audio.setBoosting(false)
    audio.setBoosting(true)
    audio.playFinish()

    expect(audio.debugSnapshot()).toMatchObject({
      gateCues: 1,
      boostCues: 2,
      finishCues: 1,
    })
    expect(context.oscillators).toHaveLength(4)
    expect(context.bufferSources).toHaveLength(2)
  })

  it('uses a long descending filtered-air burst for boost instead of a chirp', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()

    audio.setBoosting(true)

    expect(context.oscillators).toHaveLength(0)
    expect(context.bufferSources).toHaveLength(1)
    const source = context.bufferSources[0]
    const filter = context.filters[0]
    expect(source).toBeDefined()
    expect(filter?.type).toBe('bandpass')
    const durationSeconds =
      (source?.stopTimes[0] ?? 0) - (source?.startTimes[0] ?? 0)
    expect(durationSeconds).toBeGreaterThanOrEqual(0.5)
    expect(filter?.frequency.setValues[0]?.value).toBeGreaterThan(1_000)
    expect(filter?.frequency.ramps.at(-1)?.value).toBeLessThan(400)
  })

  it('plays a short filtered air pulse for each requested wing downstroke', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()

    audio.playWingFlap()
    audio.playWingFlap()

    expect(audio.debugSnapshot().wingFlapCues).toBe(2)
    expect(context.bufferSources).toHaveLength(2)
    expect(context.filters.map((filter) => filter.type)).toEqual([
      'bandpass',
      'bandpass',
    ])
  })

  it('runs one looped ambient wind bed and follows authored strength', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    audio.setAmbientWind(0.65)
    await audio.unlock()

    expect(context.bufferSources).toHaveLength(1)
    expect(context.bufferSources[0]?.loop).toBe(true)
    expect(context.filters[0]?.type).toBe('bandpass')
    const initialGainTarget = context.gains[0]?.gain.targets.at(-1)?.value ?? 0
    audio.setAmbientWind(0.85)
    expect(context.bufferSources).toHaveLength(1)
    expect(context.gains[0]?.gain.targets.at(-1)?.value ?? 0).toBeGreaterThan(
      initialGainTarget,
    )
    audio.setAmbientWind(2)
    expect(audio.debugSnapshot().ambientWindStrength).toBe(1)
    audio.setAmbientWind(Number.NaN)
    expect(audio.debugSnapshot().ambientWindStrength).toBe(1)
    expect(audio.debugSnapshot()).toMatchObject({
      ambientWindStrength: 1,
      windBedPlaying: true,
    })

    audio.setAmbientWind(0)
    expect(context.bufferSources[0]?.stops).toBeGreaterThan(0)
    expect(context.bufferSources[0]?.stopTimes[0]).toBeCloseTo(10.18)
    expect(audio.debugSnapshot().windBedPlaying).toBe(false)
  })

  it('clamps one looped volcanic bed and recreates it across lifecycle boundaries', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )

    audio.setVolcanicIntensity(-2)
    expect(audio.debugSnapshot().volcanicAmbienceIntensity).toBe(0)
    audio.setVolcanicIntensity(1.7)
    audio.setVolcanicIntensity(Number.NaN)
    expect(audio.debugSnapshot()).toMatchObject({
      volcanicAmbienceIntensity: 1,
      volcanicBedPlaying: false,
    })

    await audio.unlock()
    expect(context.bufferSources).toHaveLength(1)
    expect(context.bufferSources[0]?.loop).toBe(true)
    expect(context.filters[0]?.type).toBe('lowpass')
    expect(audio.debugSnapshot().volcanicBedPlaying).toBe(true)

    audio.setPageVisible(false)
    expect(audio.debugSnapshot().volcanicBedPlaying).toBe(false)
    audio.setPageVisible(true)
    expect(context.bufferSources).toHaveLength(2)
    expect(audio.debugSnapshot().volcanicBedPlaying).toBe(true)

    audio.setMuted(true)
    expect(audio.debugSnapshot().volcanicBedPlaying).toBe(false)
    audio.setMuted(false)
    expect(context.bufferSources).toHaveLength(3)
    expect(audio.debugSnapshot().volcanicBedPlaying).toBe(true)

    audio.dispose()
    audio.setVolcanicIntensity(0.5)
    expect(context.bufferSources).toHaveLength(3)
    expect(audio.debugSnapshot().volcanicBedPlaying).toBe(false)
  })

  it('plays dedicated volcanic warning, seal, and escape cues only while audible', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()

    audio.playRockWarning()
    audio.playLavaWarning()
    audio.playCoolingSeal()
    audio.playEruptionEscape()

    expect(audio.debugSnapshot()).toMatchObject({
      rockWarningCues: 1,
      lavaWarningCues: 1,
      coolingSealCues: 1,
      eruptionEscapeCues: 1,
    })
    expect(context.oscillators.length).toBeGreaterThanOrEqual(8)
    expect(context.bufferSources.length).toBeGreaterThanOrEqual(2)

    audio.setMuted(true)
    audio.playRockWarning()
    audio.playLavaWarning()
    audio.playCoolingSeal()
    audio.playEruptionEscape()
    expect(audio.debugSnapshot()).toMatchObject({
      rockWarningCues: 1,
      lavaWarningCues: 1,
      coolingSealCues: 1,
      eruptionEscapeCues: 1,
    })
  })

  it('plays dedicated landmark and wind-entry cues after unlock', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()

    audio.playDiscovery()
    audio.playWindEntry()

    expect(audio.debugSnapshot()).toMatchObject({
      discoveryCues: 1,
      windEntryCues: 1,
    })
    expect(context.oscillators.length).toBeGreaterThanOrEqual(2)
    expect(context.bufferSources).toHaveLength(1)
  })

  it('stops and recreates ambient wind across visibility and mute boundaries', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    audio.setAmbientWind(0.5)
    await audio.unlock()

    audio.setPageVisible(false)
    expect(audio.debugSnapshot().windBedPlaying).toBe(false)
    audio.setPageVisible(true)
    expect(context.bufferSources).toHaveLength(2)
    expect(audio.debugSnapshot().windBedPlaying).toBe(true)

    audio.setMuted(true)
    expect(audio.debugSnapshot().windBedPlaying).toBe(false)
    audio.setMuted(false)
    expect(context.bufferSources).toHaveLength(3)
    expect(audio.debugSnapshot().windBedPlaying).toBe(true)
  })

  it('blocks discovery and wind-entry cues while the page is hidden', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()
    audio.setPageVisible(false)

    audio.playDiscovery()
    audio.playWindEntry()

    expect(audio.debugSnapshot()).toMatchObject({
      discoveryCues: 0,
      windEntryCues: 0,
    })
    expect(context.oscillators).toHaveLength(0)
    expect(context.bufferSources).toHaveLength(0)
  })

  it('stops cues that were already playing when the page becomes hidden', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()
    audio.playDiscovery()
    audio.playWindEntry()

    expect(context.oscillators.length).toBeGreaterThan(0)
    expect(context.bufferSources.length).toBeGreaterThan(0)
    const oscillatorStopsBeforeHide = context.oscillators.map(
      (node) => node.stops,
    )
    const sourceStopsBeforeHide = context.bufferSources.map(
      (node) => node.stops,
    )

    audio.setPageVisible(false)

    expect(
      context.oscillators.every(
        (node, index) => node.stops > oscillatorStopsBeforeHide[index],
      ),
    ).toBe(true)
    expect(
      context.bufferSources.every(
        (node, index) => node.stops > sourceStopsBeforeHide[index],
      ),
    ).toBe(true)
  })

  it('blocks new cues and stops active nodes while muted', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()
    audio.playGate()
    audio.playWingFlap()
    const createdBeforeMute = context.oscillators.length
    const airBurstsBeforeMute = context.bufferSources.length

    audio.setMuted(true)
    audio.playGate()
    audio.playWingFlap()
    audio.setBoosting(true)
    audio.playFinish()

    expect(context.oscillators).toHaveLength(createdBeforeMute)
    expect(context.bufferSources).toHaveLength(airBurstsBeforeMute)
    expect(context.bufferSources.every((node) => node.stops >= 2)).toBe(true)
    expect(context.oscillators.every((node) => node.stops > 0)).toBe(true)
    expect(audio.debugSnapshot().muted).toBe(true)
  })

  it.each(['factory', 'resume', 'create', 'start'] as const)(
    'keeps failures non-blocking when %s throws',
    async (failure) => {
      const context = new FakeAudioContext()
      context.throwOnResume = failure === 'resume'
      context.throwOnCreate = failure === 'create'
      context.throwOnStart = failure === 'start'
      const audio = createGameAudio(() => {
        if (failure === 'factory') {
          throw new Error('factory blocked')
        }
        return context as unknown as AudioContext
      })

      await expect(audio.unlock()).resolves.toBeUndefined()
      expect(() => audio.playGate()).not.toThrow()
      expect(() => audio.setBoosting(true)).not.toThrow()
      expect(() => audio.playFinish()).not.toThrow()
    },
  )

  it('stops nodes and closes the context on dispose', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()
    audio.playGate()

    audio.dispose()
    await Promise.resolve()

    expect(context.oscillators.every((node) => node.stops > 0)).toBe(true)
    expect(context.closes).toBe(1)
  })

  it('streams the looping game master only after flight start and a user gesture', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )

    audio.setMusicActive(true)
    expect(music.plays).toBe(0)

    await audio.unlock()
    await Promise.resolve()

    expect(music.src).toMatch(/sovereign-of-the-sunrise-skies-loop\.ogg$/)
    expect(music.preload).toBe('metadata')
    expect(music.loop).toBe(true)
    expect(music.volume).toBe(0.35)
    expect(music.plays).toBe(1)
    expect(audio.debugSnapshot()).toMatchObject({
      musicActive: true,
      musicVolume: 0.35,
      bgmCreated: true,
      bgmPlaying: true,
      bgmPlayFailures: 0,
    })
  })

  it('uses the AAC loop when Ogg Vorbis is unavailable', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    music.canPlayType = () => ''
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )

    audio.setMusicActive(true)
    await audio.unlock()

    expect(music.src).toMatch(/sovereign-of-the-sunrise-skies-loop\.m4a$/)
  })

  it('applies a preserved playback position before starting the stream', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )

    audio.setMusicPositionSeconds(47.25)
    audio.setMusicPositionSeconds(Number.NaN)
    audio.setMusicActive(true)
    await audio.unlock()

    expect(music.currentTime).toBe(47.25)
    expect(audio.debugSnapshot().bgmPositionSeconds).toBe(47.25)
  })

  it('uses mute as a master switch while music volume affects only BGM', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )
    audio.setMusicActive(true)
    await audio.unlock()
    await Promise.resolve()

    audio.setMusicVolume(0.62)
    expect(music.volume).toBe(0.62)
    audio.playGate()
    const cuesBeforeMute = audio.debugSnapshot().gateCues

    audio.setMuted(true)
    audio.playGate()
    expect(music.paused).toBe(true)
    expect(audio.debugSnapshot().gateCues).toBe(cuesBeforeMute)

    audio.setMuted(false)
    await Promise.resolve()
    expect(music.plays).toBe(2)
    expect(music.volume).toBe(0.62)
  })

  it('keeps BGM through mode changes but pauses while hidden or inactive', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )
    audio.setMusicActive(true)
    await audio.unlock()
    await Promise.resolve()

    audio.setPageVisible(false)
    expect(music.paused).toBe(true)
    audio.setPageVisible(true)
    await Promise.resolve()
    expect(music.plays).toBe(2)

    audio.setMusicActive(true)
    expect(music.plays).toBe(2)
    expect(music.paused).toBe(false)

    audio.setMusicActive(false)
    expect(music.paused).toBe(true)
    expect(audio.debugSnapshot().bgmPlaying).toBe(false)
  })

  it('contains media play rejection without an unhandled failure', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    music.rejectPlay = true
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )
    audio.setMusicActive(true)

    await expect(audio.unlock()).resolves.toBeUndefined()
    await Promise.resolve()
    await Promise.resolve()

    expect(audio.debugSnapshot()).toMatchObject({
      bgmPlaying: false,
      bgmPlayFailures: 1,
    })
  })

  it('does not let a stale play completion pause a newer valid attempt', async () => {
    const context = new FakeAudioContext()
    const music = new DeferredMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )
    audio.setMusicActive(true)
    await audio.unlock()

    audio.setMuted(true)
    audio.setMuted(false)
    expect(music.plays).toBe(2)

    music.pendingPlayResolutions[0]?.()
    await Promise.resolve()
    expect(music.paused).toBe(false)

    music.pendingPlayResolutions[1]?.()
    await Promise.resolve()
    expect(audio.debugSnapshot().bgmPlaying).toBe(true)
    expect(music.paused).toBe(false)
  })

  it('releases the streamed source when disposed', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )
    audio.setMusicActive(true)
    await audio.unlock()

    audio.dispose()

    expect(music.paused).toBe(true)
    expect(music.src).toBe('')
    expect(music.removedSources).toBe(1)
    expect(music.loads).toBe(1)
  })
})
