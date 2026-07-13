import { describe, expect, it } from 'vitest'

import { createGameAudio } from './GameAudio'

class FakeAudioParam {
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

class FakeOscillator {
  readonly frequency = new FakeAudioParam()
  type: OscillatorType = 'sine'
  onended: (() => void) | null = null
  starts = 0
  stops = 0
  throwOnStart = false

  connect(): void {}

  disconnect(): void {}

  start(): void {
    if (this.throwOnStart) {
      throw new Error('start blocked')
    }
    this.starts += 1
  }

  stop(): void {
    this.stops += 1
    this.onended?.()
  }
}

class FakeGain {
  readonly gain = new FakeAudioParam()

  connect(): void {}

  disconnect(): void {}
}

class FakeAudioContext {
  readonly destination = {} as AudioDestinationNode
  readonly oscillators: FakeOscillator[] = []
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
    return new FakeGain() as unknown as GainNode
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
    audio.setBoosting(true)
    audio.playFinish()

    expect(factoryCalls).toBe(0)
    expect(audio.debugSnapshot()).toEqual({
      contextCreated: false,
      unlocked: false,
      muted: false,
      musicVolume: 0.35,
      explorationActive: false,
      pageVisible: true,
      bgmCreated: false,
      bgmPlaying: false,
      bgmPositionSeconds: 0,
      bgmPlayAttempts: 0,
      bgmPlayFailures: 0,
      gateCues: 0,
      boostCues: 0,
      finishCues: 0,
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
    expect(context.oscillators).toHaveLength(6)
  })

  it('blocks new cues and stops active nodes while muted', async () => {
    const context = new FakeAudioContext()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
    )
    await audio.unlock()
    audio.playGate()
    const createdBeforeMute = context.oscillators.length

    audio.setMuted(true)
    audio.playGate()
    audio.setBoosting(true)
    audio.playFinish()

    expect(context.oscillators).toHaveLength(createdBeforeMute)
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

  it('streams the looping exploration master only after a user gesture', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )

    audio.setExplorationActive(true)
    expect(music.plays).toBe(0)

    await audio.unlock()
    await Promise.resolve()

    expect(music.src).toMatch(/sovereign-of-the-sunrise-skies-loop\.ogg$/)
    expect(music.preload).toBe('metadata')
    expect(music.loop).toBe(true)
    expect(music.volume).toBe(0.35)
    expect(music.plays).toBe(1)
    expect(audio.debugSnapshot()).toMatchObject({
      explorationActive: true,
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

    audio.setExplorationActive(true)
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
    audio.setExplorationActive(true)
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
    audio.setExplorationActive(true)
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

  it('pauses BGM while hidden or outside exploration and resumes safely', async () => {
    const context = new FakeAudioContext()
    const music = new FakeMusicElement()
    const audio = createGameAudio(
      () => context as unknown as AudioContext,
      false,
      0.35,
      () => music as unknown as HTMLAudioElement,
    )
    audio.setExplorationActive(true)
    await audio.unlock()
    await Promise.resolve()

    audio.setPageVisible(false)
    expect(music.paused).toBe(true)
    audio.setPageVisible(true)
    await Promise.resolve()
    expect(music.plays).toBe(2)

    audio.setExplorationActive(false)
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
    audio.setExplorationActive(true)

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
    audio.setExplorationActive(true)
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
    audio.setExplorationActive(true)
    await audio.unlock()

    audio.dispose()

    expect(music.paused).toBe(true)
    expect(music.src).toBe('')
    expect(music.removedSources).toBe(1)
    expect(music.loads).toBe(1)
  })
})
