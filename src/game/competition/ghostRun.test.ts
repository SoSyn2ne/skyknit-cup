import { describe, expect, it } from 'vitest'

import {
  GHOST_DEFAULT_MATCH_DISTANCE,
  GHOST_MAX_DURATION_MS,
  GHOST_MAX_SAMPLES,
  GHOST_SAMPLE_INTERVAL_MS,
  canonicalizeGhostRun,
  captureGhostSample,
  cloneGhostRun,
  createGhostRecorder,
  finishGhostRun,
  formatGhostDelta,
  isCanonicalGhostRun,
  matchGhostProgress,
  sampleGhostRun,
  snapshotGhostRecorder,
  type GhostFlightState,
  type GhostRun,
} from './ghostRun'

function flightAt(
  elapsedMs: number,
  overrides: Partial<GhostFlightState> = {},
): GhostFlightState {
  return {
    position: {
      x: elapsedMs / 40,
      y: 12 + Math.sin(elapsedMs / 1_000) * 3,
      z: -elapsedMs / 25,
    },
    headingRadians: Math.sin(elapsedMs / 2_000) * 2.5,
    pitchRadians: Math.sin(elapsedMs / 700) * 0.3,
    bankRadians: Math.cos(elapsedMs / 900) * 0.5,
    isBoosting: elapsedMs % 600 < 200,
    ...overrides,
  }
}

function recordInBatches(batchPattern: readonly number[]): GhostRun {
  const recorder = createGhostRecorder()
  captureGhostSample(recorder, 0, flightAt(0), 0)

  let step = 0
  let batchIndex = 0

  while (step < 600) {
    const requestedBatch = batchPattern[batchIndex % batchPattern.length] ?? 1
    const batchSize = Math.min(requestedBatch, 600 - step)

    for (let index = 0; index < batchSize; index += 1) {
      step += 1
      const elapsedMs = (step * 1_000) / 60
      captureGhostSample(
        recorder,
        elapsedMs,
        flightAt(elapsedMs),
        Math.floor(elapsedMs / 2_500),
      )
    }

    batchIndex += 1
  }

  const run = finishGhostRun(recorder, 10_000)
  expect(run).not.toBeNull()
  return run as GhostRun
}

describe('ghost recorder', () => {
  it('records identical quantized 100ms samples across host-frame batching', () => {
    const thirtyFps = recordInBatches([2])
    const sixtyFps = recordInBatches([1])
    const oneTwentyFps = recordInBatches([1, 0, 1, 0])
    const jittered = recordInBatches([5, 1, 3, 8, 2])

    expect(thirtyFps).toEqual(sixtyFps)
    expect(oneTwentyFps).toEqual(sixtyFps)
    expect(jittered).toEqual(sixtyFps)
    expect(sixtyFps.samples[0]?.[0]).toBe(0)
    expect(sixtyFps.samples[1]?.[0]).toBe(GHOST_SAMPLE_INTERVAL_MS)
    expect(sixtyFps.samples.at(-1)?.[0]).toBe(10_000)
  })

  it('quantizes state and appends a forced final sample', () => {
    const recorder = createGhostRecorder()

    expect(
      captureGhostSample(
        recorder,
        0,
        flightAt(0, {
          position: { x: 1.234, y: 2.345, z: -3.456 },
          headingRadians: 0.12349,
          pitchRadians: -0.23449,
          bankRadians: 0.34549,
          isBoosting: true,
        }),
        4,
      ),
    ).toBe(true)

    captureGhostSample(recorder, 116.667, flightAt(116.667), 4)
    captureGhostSample(recorder, 183.333, flightAt(183.333), 5)

    const run = finishGhostRun(recorder, 183)

    expect(run?.samples[0]).toEqual([
      0,
      1.2,
      2.3,
      -3.5,
      0.123,
      -0.234,
      0.345,
      1,
      4,
    ])
    expect(run?.samples.map((sample) => sample[0])).toEqual([0, 100, 183])
    expect(run?.samples.at(-1)?.[8]).toBe(5)
  })

  it('rejects non-finite or out-of-range observations without emitting samples', () => {
    const recorder = createGhostRecorder()

    expect(
      captureGhostSample(
        recorder,
        0,
        flightAt(0, { position: { x: Number.NaN, y: 0, z: 0 } }),
        0,
      ),
    ).toBe(false)
    expect(captureGhostSample(recorder, 0, flightAt(0), -1)).toBe(false)
    expect(
      captureGhostSample(
        recorder,
        0,
        flightAt(0, { pitchRadians: Math.PI }),
        0,
      ),
    ).toBe(false)
    expect(snapshotGhostRecorder(recorder).samples).toEqual([])
    expect(finishGhostRun(recorder, 1_000)).toBeNull()
  })

  it('rejects progress that moves backward from the latest accepted observation', () => {
    const recorder = createGhostRecorder()
    captureGhostSample(recorder, 0, flightAt(0), 0)
    captureGhostSample(recorder, 100, flightAt(100), 2)

    expect(captureGhostSample(recorder, 200, flightAt(200), 1)).toBe(false)

    const run = finishGhostRun(recorder, 200)
    expect(run?.samples.map((sample) => sample[8])).toEqual([0, 2, 2])
  })

  it('closes at ten minutes and never grows past 6,001 samples', () => {
    const recorder = createGhostRecorder()

    for (
      let elapsedMs = 0;
      elapsedMs <= GHOST_MAX_DURATION_MS + GHOST_SAMPLE_INTERVAL_MS;
      elapsedMs += GHOST_SAMPLE_INTERVAL_MS
    ) {
      captureGhostSample(recorder, elapsedMs, flightAt(elapsedMs), 0)
    }

    const run = finishGhostRun(recorder, GHOST_MAX_DURATION_MS + 10_000)

    expect(run?.durationMs).toBe(GHOST_MAX_DURATION_MS)
    expect(run?.samples).toHaveLength(GHOST_MAX_SAMPLES)
    expect(run?.samples.at(-1)?.[0]).toBe(GHOST_MAX_DURATION_MS)
    expect(
      captureGhostSample(
        recorder,
        GHOST_MAX_DURATION_MS,
        flightAt(GHOST_MAX_DURATION_MS),
        1,
        true,
      ),
    ).toBe(false)
  })

  it('snapshots and restores pending state without sharing mutable arrays', () => {
    const recorder = createGhostRecorder()
    captureGhostSample(recorder, 0, flightAt(0), 0)
    captureGhostSample(recorder, 166.667, flightAt(166.667), 1)

    const snapshot = snapshotGhostRecorder(recorder)
    const restored = createGhostRecorder(snapshot)
    captureGhostSample(restored, 216.667, flightAt(216.667), 1)

    expect(snapshot.samples.map((sample) => sample[0])).toEqual([0, 100])
    expect(snapshotGhostRecorder(recorder).samples).toEqual(snapshot.samples)
    expect(snapshotGhostRecorder(restored).samples.map((sample) => sample[0])).toEqual([
      0,
      100,
      200,
    ])

    const finished = finishGhostRun(restored, 217)
    const clone = finished === null ? null : cloneGhostRun(finished)

    expect(clone).toEqual(finished)
    expect(clone).not.toBe(finished)
    expect(clone?.samples).not.toBe(finished?.samples)
    expect(clone?.samples[0]).not.toBe(finished?.samples[0])
  })

  it('ignores a malformed restored latest sample that regresses progress', () => {
    const restored = createGhostRecorder({
      samples: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [100, 1, 0, 0, 0, 0, 0, 0, 5],
      ],
      nextSampleMs: 200,
      latestSample: [150, 1.5, 0, 0, 0, 0, 0, 0, 3],
      closed: false,
    })

    expect(snapshotGhostRecorder(restored).latestSample?.[8]).toBe(5)
    expect(captureGhostSample(restored, 200, flightAt(200), 5)).toBe(true)
    expect(finishGhostRun(restored, 200)).not.toBeNull()
  })

  it('keeps a representative four-minute ghost comfortably below 150KB', () => {
    const recorder = createGhostRecorder()

    for (let elapsedMs = 0; elapsedMs <= 240_000; elapsedMs += 100) {
      captureGhostSample(
        recorder,
        elapsedMs,
        flightAt(elapsedMs, {
          position: {
            x: Math.sin(elapsedMs / 5_000) * 2_500,
            y: 20 + Math.sin(elapsedMs / 900) * 80,
            z: Math.cos(elapsedMs / 4_000) * 2_500,
          },
        }),
        Math.floor(elapsedMs / 20_000),
      )
    }

    const run = finishGhostRun(recorder, 240_000)
    const serializedBytes = JSON.stringify(run).length

    expect(run?.samples).toHaveLength(2_401)
    expect(serializedBytes).toBeLessThan(130_000)
  })
})

describe('ghost run canonicalization and playback', () => {
  it('sorts, de-duplicates, bounds, and drops damaged persisted samples', () => {
    const value = {
      durationMs: 300,
      samples: [
        [300, 3, 0, 0, 0, 0, 0, 0, 2],
        [100, 1, 0, 0, 0, 0, 0, 0, 0],
        [100, 99, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 0],
        [200, Number.NaN, 0, 0, 0, 0, 0, 0, 1],
        [250, 2.5, 0, 0, 4, 0, 0, 0, 1],
        [400, 4, 0, 0, 0, 0, 0, 0, 3],
      ],
    }

    const run = canonicalizeGhostRun(value)

    expect(run?.samples).toEqual([
      [0, 0, 0, 0, 0, 0, 0, 1, 0],
      [100, 1, 0, 0, 0, 0, 0, 0, 0],
      [300, 3, 0, 0, 0, 0, 0, 0, 2],
    ])
    expect(isCanonicalGhostRun(run)).toBe(true)
    expect(isCanonicalGhostRun(value)).toBe(false)
  })

  it('drops persisted samples whose progress moves backward', () => {
    const run = canonicalizeGhostRun({
      durationMs: 300,
      samples: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [100, 1, 0, 0, 0, 0, 0, 0, 2],
        [200, 2, 0, 0, 0, 0, 0, 0, 1],
        [300, 3, 0, 0, 0, 0, 0, 0, 3],
      ],
    })

    expect(run?.samples.map((sample) => [sample[0], sample[8]])).toEqual([
      [0, 0],
      [100, 2],
      [300, 3],
    ])
  })

  it('rejects runs without a start and matching forced-final sample', () => {
    expect(
      canonicalizeGhostRun({
        durationMs: 100,
        samples: [[100, 1, 2, 3, 0, 0, 0, 0, 0]],
      }),
    ).toBeNull()
    expect(
      canonicalizeGhostRun({
        durationMs: 200,
        samples: [
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
          [100, 1, 0, 0, 0, 0, 0, 0, 0],
        ],
      }),
    ).toBeNull()
  })

  it('distinguishes raw values from already quantized canonical runs', () => {
    const unquantized = {
      durationMs: 100,
      samples: [
        [0, 0.04, 0, 0, 0, 0, 0, 0, 0],
        [100, 1.04, 0, 0, 0, 0, 0, 0, 0],
      ],
    }

    const canonical = canonicalizeGhostRun(unquantized)

    expect(canonical).not.toBeNull()
    expect(isCanonicalGhostRun(unquantized)).toBe(false)
    expect(isCanonicalGhostRun(canonical)).toBe(true)
  })

  it('rejects otherwise valid persisted runs with unexpected fields', () => {
    const canonical = canonicalizeGhostRun({
      durationMs: 100,
      samples: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [100, 1, 0, 0, 0, 0, 0, 0, 1],
      ],
    }) as GhostRun

    expect(isCanonicalGhostRun({ ...canonical, unexpected: true })).toBe(
      false,
    )
  })

  it('keeps valid maximum pitch samples inside the canonical range', () => {
    const run = canonicalizeGhostRun({
      durationMs: 100,
      samples: [
        [0, 0, 0, 0, 0, -Math.PI / 2, 0, 0, 0],
        [100, 1, 0, 0, 0, Math.PI / 2, 0, 0, 1],
      ],
    })

    expect(run).not.toBeNull()
    expect(isCanonicalGhostRun(run)).toBe(true)
    expect(Math.abs(run?.samples[0]?.[5] ?? Infinity)).toBeLessThanOrEqual(
      Math.PI / 2,
    )
    expect(Math.abs(run?.samples[1]?.[5] ?? Infinity)).toBeLessThanOrEqual(
      Math.PI / 2,
    )
  })

  it('interpolates pitch linearly through level flight', () => {
    const run = canonicalizeGhostRun({
      durationMs: 100,
      samples: [
        [0, 0, 0, 0, 0, -Math.PI / 2, 0, 0, 0],
        [100, 0, 0, 0, 0, Math.PI / 2, 0, 0, 0],
      ],
    })

    expect(run).not.toBeNull()
    expect(sampleGhostRun(run as GhostRun, 50)?.pitchRadians).toBeCloseTo(
      0,
      6,
    )
  })

  it('interpolates position and takes the shortest path across the angle seam', () => {
    const run = canonicalizeGhostRun({
      durationMs: 100,
      samples: [
        [0, 0, 0, 0, 3.1, 0.1, -3.1, 0, 2],
        [100, 10, 20, -10, -3.1, 0.3, 3.1, 1, 2],
      ],
    })

    expect(run).not.toBeNull()
    const pose = sampleGhostRun(run as GhostRun, 50)

    expect(pose?.position).toEqual({ x: 5, y: 10, z: -5 })
    expect(Math.abs(pose?.headingRadians ?? 0)).toBeCloseTo(Math.PI, 2)
    expect(Math.abs(pose?.bankRadians ?? 0)).toBeCloseTo(Math.PI, 2)
    expect(pose?.pitchRadians).toBeCloseTo(0.2, 4)
    expect(pose?.boost).toBe(false)
    expect(pose?.progress).toBe(2)
    expect(sampleGhostRun(run as GhostRun, 100)?.boost).toBe(true)
  })
})

describe('ghost progress matching and delta formatting', () => {
  const run = canonicalizeGhostRun({
    durationMs: 500,
    samples: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [100, 10, 0, 0, 0, 0, 0, 0, 0],
      [200, 20, 0, 0, 0, 0, 0, 0, 0],
      [300, 10, 0, 0, 0, 0, 0, 0, 0],
      [400, 0, 0, 0, 0, 0, 0, 0, 0],
      [500, -10, 0, 0, 0, 0, 0, 0, 1],
    ],
  }) as GhostRun

  it('matches the nearest same-progress segment and respects a monotonic hint', () => {
    const first = matchGhostProgress(run, { x: 9, y: 0, z: 0 }, 0)
    const later = matchGhostProgress(run, { x: 9, y: 0, z: 0 }, 0, {
      sampleIndex: 2,
      referenceElapsedMs: 250,
    })

    expect(first?.referenceElapsedMs).toBeCloseTo(90, 6)
    expect(first?.sampleIndex).toBe(0)
    expect(later?.referenceElapsedMs).toBeCloseTo(310, 6)
    expect(later?.sampleIndex).toBe(3)
  })

  it('refuses another progress index and positions beyond the distance cap', () => {
    expect(matchGhostProgress(run, { x: 9, y: 0, z: 0 }, 1)?.referenceElapsedMs).toBe(
      500,
    )
    expect(
      matchGhostProgress(
        run,
        { x: 0, y: GHOST_DEFAULT_MATCH_DISTANCE + 1, z: 0 },
        0,
      ),
    ).toBeNull()
    expect(
      matchGhostProgress(run, { x: 0, y: 2, z: 0 }, 0, undefined, 1),
    ).toBeNull()
  })

  it('formats signed fixed-width millisecond deltas', () => {
    expect(formatGhostDelta(-250)).toBe('-0:00.250')
    expect(formatGhostDelta(1_120)).toBe('+0:01.120')
    expect(formatGhostDelta(61_002)).toBe('+1:01.002')
    expect(formatGhostDelta(-0)).toBe('+0:00.000')
    expect(formatGhostDelta(Number.NaN)).toBe('—')
  })
})
