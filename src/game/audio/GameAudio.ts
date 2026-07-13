export interface GameAudioDebugSnapshot {
  readonly contextCreated: boolean
  readonly unlocked: boolean
  readonly muted: boolean
  readonly gateCues: number
  readonly boostCues: number
  readonly finishCues: number
}

export interface GameAudio {
  unlock(): Promise<void>
  setMuted(muted: boolean): void
  playGate(): void
  setBoosting(boosting: boolean): void
  playFinish(): void
  debugSnapshot(): GameAudioDebugSnapshot
  dispose(): void
}

export type AudioContextFactory = () => AudioContext

function defaultContextFactory(): AudioContext {
  return new AudioContext()
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
): GameAudio {
  let context: AudioContext | null = null
  let unlocked = false
  let muted = initiallyMuted
  let boosting = false
  let disposed = false
  let gateCues = 0
  let boostCues = 0
  let finishCues = 0
  const activeOscillators = new Set<OscillatorNode>()

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
      if (disposed || unlocked) {
        return
      }

      try {
        context ??= contextFactory()
        if (context.state === 'suspended') {
          await context.resume()
        }
        unlocked = context.state === 'running'
      } catch {
        unlocked = false
      }
    },
    setMuted: (nextMuted) => {
      muted = nextMuted
      if (muted) {
        stopActiveOscillators()
      }
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
      if (context !== null && context.state !== 'closed') {
        void context.close().catch(() => undefined)
      }
      context = null
      unlocked = false
    },
  }
}
