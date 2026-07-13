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
})
