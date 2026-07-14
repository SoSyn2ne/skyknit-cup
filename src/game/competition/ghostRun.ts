import type { FlightState, Vec3Value } from '../flight/flightModel'

export const GHOST_SAMPLE_INTERVAL_MS = 100
export const GHOST_MAX_DURATION_MS = 10 * 60 * 1_000
export const GHOST_MAX_SAMPLES =
  GHOST_MAX_DURATION_MS / GHOST_SAMPLE_INTERVAL_MS + 1
export const GHOST_DEFAULT_MATCH_DISTANCE = 30

const MAX_POSITION_MAGNITUDE = 100_000
const MAX_PROGRESS = 65_535
const POSITION_DECIMALS = 1
const ANGLE_DECIMALS = 3
const ANGLE_QUANTIZATION_FACTOR = 10 ** ANGLE_DECIMALS
const MAX_CANONICAL_PITCH =
  Math.floor((Math.PI / 2) * ANGLE_QUANTIZATION_FACTOR) /
  ANGLE_QUANTIZATION_FACTOR
const SAMPLE_CLOCK_EPSILON_MS = 0.001

export type GhostSample = readonly [
  elapsedMs: number,
  x: number,
  y: number,
  z: number,
  headingRadians: number,
  pitchRadians: number,
  bankRadians: number,
  boostFlag: 0 | 1,
  progress: number,
]

export interface GhostRun {
  readonly durationMs: number
  readonly samples: readonly GhostSample[]
}

export type GhostFlightState = Pick<
  FlightState,
  | 'position'
  | 'headingRadians'
  | 'pitchRadians'
  | 'bankRadians'
  | 'isBoosting'
>

export interface GhostPose {
  readonly elapsedMs: number
  readonly position: Vec3Value
  readonly headingRadians: number
  readonly pitchRadians: number
  readonly bankRadians: number
  readonly boost: boolean
  readonly progress: number
}

export interface GhostProgressHint {
  readonly sampleIndex: number
  readonly referenceElapsedMs: number
}

export interface GhostProgressMatch extends GhostProgressHint {
  readonly distanceSquared: number
}

export interface GhostRecorderSnapshot {
  readonly samples: readonly GhostSample[]
  readonly nextSampleMs: number
  readonly latestSample: GhostSample | null
  readonly closed: boolean
}

export interface GhostRecorder {
  samples: GhostSample[]
  nextSampleMs: number
  latestSample: GhostSample | null
  closed: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function quantize(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const quantized = Math.round(value * factor) / factor
  return Object.is(quantized, -0) ? 0 : quantized
}

function wrapRadians(radians: number): number {
  const fullTurn = Math.PI * 2
  return ((radians + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

function quantizeWrappedRadians(radians: number): number {
  return quantize(
    wrapRadians(quantize(wrapRadians(radians), ANGLE_DECIMALS)),
    ANGLE_DECIMALS,
  )
}

function quantizePitchRadians(radians: number): number {
  return Math.min(
    MAX_CANONICAL_PITCH,
    Math.max(-MAX_CANONICAL_PITCH, quantize(radians, ANGLE_DECIMALS)),
  )
}

function isFiniteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function isValidProgress(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_PROGRESS
  )
}

function cloneSample(sample: GhostSample): GhostSample {
  return [...sample]
}

function sampleAtElapsed(sample: GhostSample, elapsedMs: number): GhostSample {
  return [
    elapsedMs,
    sample[1],
    sample[2],
    sample[3],
    sample[4],
    sample[5],
    sample[6],
    sample[7],
    sample[8],
  ]
}

function samplesEqual(left: GhostSample, right: GhostSample): boolean {
  return left.every((value, index) => value === right[index])
}

function rawSampleEquals(value: unknown, sample: GhostSample): boolean {
  return (
    Array.isArray(value) &&
    value.length === sample.length &&
    sample.every((entry, index) => Object.is(value[index], entry))
  )
}

function canonicalizeSample(value: unknown): GhostSample | null {
  if (!Array.isArray(value) || value.length !== 9) {
    return null
  }

  const [elapsedMs, x, y, z, heading, pitch, bank, boostFlag, progress] =
    value

  if (
    !isFiniteInRange(elapsedMs, 0, GHOST_MAX_DURATION_MS) ||
    !isFiniteInRange(x, -MAX_POSITION_MAGNITUDE, MAX_POSITION_MAGNITUDE) ||
    !isFiniteInRange(y, -MAX_POSITION_MAGNITUDE, MAX_POSITION_MAGNITUDE) ||
    !isFiniteInRange(z, -MAX_POSITION_MAGNITUDE, MAX_POSITION_MAGNITUDE) ||
    !isFiniteInRange(heading, -Math.PI, Math.PI) ||
    !isFiniteInRange(pitch, -Math.PI / 2, Math.PI / 2) ||
    !isFiniteInRange(bank, -Math.PI, Math.PI) ||
    (boostFlag !== 0 && boostFlag !== 1) ||
    !isValidProgress(progress)
  ) {
    return null
  }

  return [
    Math.round(elapsedMs),
    quantize(x, POSITION_DECIMALS),
    quantize(y, POSITION_DECIMALS),
    quantize(z, POSITION_DECIMALS),
    quantizeWrappedRadians(heading),
    quantizePitchRadians(pitch),
    quantizeWrappedRadians(bank),
    boostFlag,
    progress,
  ]
}

function createSample(
  elapsedMs: number,
  flight: GhostFlightState,
  progress: number,
): GhostSample | null {
  if (
    !isFiniteInRange(elapsedMs, 0, GHOST_MAX_DURATION_MS) ||
    !isValidProgress(progress) ||
    typeof flight.isBoosting !== 'boolean'
  ) {
    return null
  }

  return canonicalizeSample([
    elapsedMs,
    flight.position.x,
    flight.position.y,
    flight.position.z,
    flight.headingRadians,
    flight.pitchRadians,
    flight.bankRadians,
    flight.isBoosting ? 1 : 0,
    progress,
  ])
}

function appendOrReplaceSample(
  samples: GhostSample[],
  sample: GhostSample,
): boolean {
  const lastIndex = samples.length - 1
  const last = samples[lastIndex]

  if (last === undefined) {
    samples.push(sample)
    return true
  }

  if (sample[0] < last[0]) {
    return false
  }

  if (sample[0] === last[0]) {
    if (samplesEqual(last, sample)) {
      return false
    }

    samples[lastIndex] = sample
    return true
  }

  if (samples.length >= GHOST_MAX_SAMPLES) {
    return false
  }

  samples.push(sample)
  return true
}

function appendCanonicalSample(
  samples: GhostSample[],
  sample: GhostSample,
): void {
  const last = samples.at(-1)

  if (
    last !== undefined &&
    (last[0] === sample[0] || sample[8] < last[8])
  ) {
    return
  }

  samples.push(sample)
}

function canonicalizeRecorderSamples(value: unknown): GhostSample[] {
  if (!Array.isArray(value)) {
    return []
  }

  const samples = value
    .map(canonicalizeSample)
    .filter((sample): sample is GhostSample => sample !== null)
    .sort((left, right) => left[0] - right[0])
  const unique: GhostSample[] = []

  for (const sample of samples) {
    appendCanonicalSample(unique, sample)
  }

  if (unique[0]?.[0] !== 0) {
    return []
  }

  return unique.slice(0, GHOST_MAX_SAMPLES).map(cloneSample)
}

export function createGhostRecorder(snapshot?: unknown): GhostRecorder {
  if (!isRecord(snapshot)) {
    return {
      samples: [],
      nextSampleMs: GHOST_SAMPLE_INTERVAL_MS,
      latestSample: null,
      closed: false,
    }
  }

  const samples = canonicalizeRecorderSamples(snapshot.samples)
  const last = samples.at(-1) ?? null
  const restoredLatest = canonicalizeSample(snapshot.latestSample)
  const latestSample =
    restoredLatest !== null &&
    (last === null ||
      (restoredLatest[0] >= last[0] && restoredLatest[8] >= last[8]))
      ? cloneSample(restoredLatest)
      : last === null
        ? null
        : cloneSample(last)
  const derivedNextSampleMs = Math.min(
    GHOST_MAX_DURATION_MS,
    (Math.floor((last?.[0] ?? 0) / GHOST_SAMPLE_INTERVAL_MS) + 1) *
      GHOST_SAMPLE_INTERVAL_MS,
  )
  const restoredNextSampleMs = snapshot.nextSampleMs
  const nextSampleMs =
    typeof restoredNextSampleMs === 'number' &&
    Number.isInteger(restoredNextSampleMs) &&
    restoredNextSampleMs % GHOST_SAMPLE_INTERVAL_MS === 0 &&
    restoredNextSampleMs >= derivedNextSampleMs &&
    restoredNextSampleMs <= GHOST_MAX_DURATION_MS
      ? restoredNextSampleMs
      : derivedNextSampleMs
  const closed =
    samples.length > 0 &&
    (snapshot.closed === true ||
      samples.length >= GHOST_MAX_SAMPLES ||
      last?.[0] === GHOST_MAX_DURATION_MS)

  return {
    samples,
    nextSampleMs,
    latestSample,
    closed,
  }
}

export function snapshotGhostRecorder(
  recorder: GhostRecorder,
): GhostRecorderSnapshot {
  return {
    samples: recorder.samples.map(cloneSample),
    nextSampleMs: recorder.nextSampleMs,
    latestSample:
      recorder.latestSample === null
        ? null
        : cloneSample(recorder.latestSample),
    closed: recorder.closed,
  }
}

export function captureGhostSample(
  recorder: GhostRecorder,
  elapsedMs: number,
  flight: GhostFlightState,
  progress: number,
  force = false,
): boolean {
  if (recorder.closed) {
    return false
  }

  const observed = createSample(elapsedMs, flight, progress)

  if (observed === null) {
    return false
  }

  if (
    recorder.latestSample !== null &&
    observed[8] < recorder.latestSample[8]
  ) {
    return false
  }

  recorder.latestSample = cloneSample(observed)
  let changed = false

  if (recorder.samples.length === 0) {
    const startSample = sampleAtElapsed(observed, 0)
    changed = appendOrReplaceSample(recorder.samples, startSample)
  }

  if (force) {
    changed = appendOrReplaceSample(recorder.samples, observed) || changed
  } else {
    const latestGridMs = Math.min(
      GHOST_MAX_DURATION_MS,
      Math.floor(
        (observed[0] + SAMPLE_CLOCK_EPSILON_MS) /
          GHOST_SAMPLE_INTERVAL_MS,
      ) * GHOST_SAMPLE_INTERVAL_MS,
    )

    if (latestGridMs >= recorder.nextSampleMs) {
      const scheduledSample = sampleAtElapsed(observed, latestGridMs)
      changed =
        appendOrReplaceSample(recorder.samples, scheduledSample) || changed
      recorder.nextSampleMs = Math.min(
        GHOST_MAX_DURATION_MS,
        latestGridMs + GHOST_SAMPLE_INTERVAL_MS,
      )
    }
  }

  if (
    recorder.samples.length >= GHOST_MAX_SAMPLES ||
    recorder.samples.at(-1)?.[0] === GHOST_MAX_DURATION_MS
  ) {
    recorder.closed = true
  }

  return changed
}

export function canonicalizeGhostRun(value: unknown): GhostRun | null {
  if (
    !isRecord(value) ||
    !isFiniteInRange(value.durationMs, 1, GHOST_MAX_DURATION_MS) ||
    !Array.isArray(value.samples)
  ) {
    return null
  }

  const durationMs = Math.round(value.durationMs)
  const sortedSamples = value.samples
    .map(canonicalizeSample)
    .filter(
      (sample): sample is GhostSample =>
        sample !== null && sample[0] <= durationMs,
    )
    .sort((left, right) => left[0] - right[0])
  const uniqueSamples: GhostSample[] = []

  for (const sample of sortedSamples) {
    appendCanonicalSample(uniqueSamples, sample)
  }

  const boundedSamples =
    uniqueSamples.length <= GHOST_MAX_SAMPLES
      ? uniqueSamples
      : [
          ...uniqueSamples.slice(0, GHOST_MAX_SAMPLES - 1),
          uniqueSamples.at(-1) as GhostSample,
        ]

  if (
    boundedSamples.length < 2 ||
    boundedSamples[0]?.[0] !== 0 ||
    boundedSamples.at(-1)?.[0] !== durationMs
  ) {
    return null
  }

  return {
    durationMs,
    samples: boundedSamples.map(cloneSample),
  }
}

export function finishGhostRun(
  recorder: GhostRecorder,
  durationMs: number,
): GhostRun | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null
  }

  const finalElapsedMs = Math.min(
    GHOST_MAX_DURATION_MS,
    Math.round(durationMs),
  )
  const latest = recorder.latestSample

  if (latest === null || recorder.samples[0]?.[0] !== 0) {
    return null
  }

  recorder.samples = recorder.samples.filter(
    (sample) => sample[0] <= finalElapsedMs,
  )
  const finalSample = sampleAtElapsed(latest, finalElapsedMs)

  if (
    recorder.samples.length >= GHOST_MAX_SAMPLES &&
    recorder.samples.at(-1)?.[0] !== finalElapsedMs
  ) {
    recorder.samples.splice(GHOST_MAX_SAMPLES - 1)
  }

  appendOrReplaceSample(recorder.samples, finalSample)
  recorder.latestSample = cloneSample(finalSample)
  recorder.closed = true

  return canonicalizeGhostRun({
    durationMs: finalElapsedMs,
    samples: recorder.samples,
  })
}

export function cloneGhostRun(run: GhostRun): GhostRun {
  return {
    durationMs: run.durationMs,
    samples: run.samples.map(cloneSample),
  }
}

export function isCanonicalGhostRun(value: unknown): value is GhostRun {
  const canonical = canonicalizeGhostRun(value)

  if (canonical === null || !isRecord(value) || !Array.isArray(value.samples)) {
    return false
  }

  const keys = Object.keys(value)
  if (
    keys.length !== 2 ||
    !keys.every((key) => key === 'durationMs' || key === 'samples')
  ) {
    return false
  }

  const originalSamples = value.samples

  if (
    value.durationMs !== canonical.durationMs ||
    originalSamples.length !== canonical.samples.length
  ) {
    return false
  }

  return canonical.samples.every((sample, index) => {
    return rawSampleEquals(originalSamples[index], sample)
  })
}

function poseFromSample(sample: GhostSample): GhostPose {
  return {
    elapsedMs: sample[0],
    position: { x: sample[1], y: sample[2], z: sample[3] },
    headingRadians: sample[4],
    pitchRadians: sample[5],
    bankRadians: sample[6],
    boost: sample[7] === 1,
    progress: sample[8],
  }
}

function interpolateAngle(from: number, to: number, ratio: number): number {
  return wrapRadians(from + wrapRadians(to - from) * ratio)
}

export function sampleGhostRun(
  run: GhostRun,
  elapsedMs: number,
): GhostPose | null {
  if (!Number.isFinite(elapsedMs) || run.samples.length === 0) {
    return null
  }

  const first = run.samples[0]
  const last = run.samples.at(-1)

  if (first === undefined || last === undefined) {
    return null
  }

  const clampedElapsedMs = Math.min(
    last[0],
    Math.max(first[0], elapsedMs),
  )

  if (clampedElapsedMs <= first[0]) {
    return poseFromSample(first)
  }

  if (clampedElapsedMs >= last[0]) {
    return poseFromSample(last)
  }

  let lowerIndex = 0
  let upperIndex = run.samples.length - 1

  while (lowerIndex + 1 < upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2)
    const middle = run.samples[middleIndex]

    if (middle !== undefined && middle[0] <= clampedElapsedMs) {
      lowerIndex = middleIndex
    } else {
      upperIndex = middleIndex
    }
  }

  const from = run.samples[lowerIndex]
  const to = run.samples[upperIndex]

  if (from === undefined || to === undefined) {
    return null
  }

  const segmentDurationMs = to[0] - from[0]
  const ratio =
    segmentDurationMs <= 0
      ? 0
      : (clampedElapsedMs - from[0]) / segmentDurationMs

  return {
    elapsedMs: clampedElapsedMs,
    position: {
      x: from[1] + (to[1] - from[1]) * ratio,
      y: from[2] + (to[2] - from[2]) * ratio,
      z: from[3] + (to[3] - from[3]) * ratio,
    },
    headingRadians: interpolateAngle(from[4], to[4], ratio),
    pitchRadians: from[5] + (to[5] - from[5]) * ratio,
    bankRadians: interpolateAngle(from[6], to[6], ratio),
    boost: from[7] === 1,
    progress: from[8],
  }
}

function squaredDistance(
  left: Vec3Value,
  right: Vec3Value,
): number {
  const x = left.x - right.x
  const y = left.y - right.y
  const z = left.z - right.z
  return x * x + y * y + z * z
}

function isFinitePosition(position: Vec3Value): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  )
}

export function matchGhostProgress(
  run: GhostRun,
  position: Vec3Value,
  progress: number,
  hint?: GhostProgressHint,
  maxDistance = GHOST_DEFAULT_MATCH_DISTANCE,
): GhostProgressMatch | null {
  if (
    !isFinitePosition(position) ||
    !isValidProgress(progress) ||
    !Number.isFinite(maxDistance) ||
    maxDistance < 0
  ) {
    return null
  }

  const startIndex =
    hint !== undefined &&
    Number.isInteger(hint.sampleIndex) &&
    hint.sampleIndex >= 0
      ? hint.sampleIndex
      : 0
  const minimumReferenceElapsedMs =
    hint !== undefined &&
    Number.isFinite(hint.referenceElapsedMs) &&
    hint.referenceElapsedMs >= 0
      ? hint.referenceElapsedMs
      : 0
  const maximumDistanceSquared = maxDistance * maxDistance
  let best: GhostProgressMatch | null = null

  const consider = (
    sampleIndex: number,
    referenceElapsedMs: number,
    referencePosition: Vec3Value,
  ): void => {
    if (referenceElapsedMs < minimumReferenceElapsedMs) {
      return
    }

    const distanceSquared = squaredDistance(position, referencePosition)

    if (distanceSquared > maximumDistanceSquared) {
      return
    }

    if (
      best === null ||
      distanceSquared < best.distanceSquared ||
      (distanceSquared === best.distanceSquared &&
        referenceElapsedMs < best.referenceElapsedMs)
    ) {
      best = { sampleIndex, referenceElapsedMs, distanceSquared }
    }
  }

  for (
    let sampleIndex = startIndex;
    sampleIndex < run.samples.length - 1;
    sampleIndex += 1
  ) {
    const from = run.samples[sampleIndex]
    const to = run.samples[sampleIndex + 1]

    if (
      from === undefined ||
      to === undefined ||
      from[8] !== progress ||
      to[8] !== progress ||
      to[0] < minimumReferenceElapsedMs
    ) {
      continue
    }

    const segmentX = to[1] - from[1]
    const segmentY = to[2] - from[2]
    const segmentZ = to[3] - from[3]
    const segmentLengthSquared =
      segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ
    const projectedRatio =
      segmentLengthSquared <= Number.EPSILON
        ? 0
        : ((position.x - from[1]) * segmentX +
            (position.y - from[2]) * segmentY +
            (position.z - from[3]) * segmentZ) /
          segmentLengthSquared
    const minimumRatio =
      to[0] === from[0]
        ? 0
        : (minimumReferenceElapsedMs - from[0]) / (to[0] - from[0])
    const ratio = Math.min(1, Math.max(0, minimumRatio, projectedRatio))

    consider(
      sampleIndex,
      from[0] + (to[0] - from[0]) * ratio,
      {
        x: from[1] + segmentX * ratio,
        y: from[2] + segmentY * ratio,
        z: from[3] + segmentZ * ratio,
      },
    )
  }

  for (
    let sampleIndex = startIndex;
    sampleIndex < run.samples.length;
    sampleIndex += 1
  ) {
    const sample = run.samples[sampleIndex]

    if (sample === undefined || sample[8] !== progress) {
      continue
    }

    consider(sampleIndex, sample[0], {
      x: sample[1],
      y: sample[2],
      z: sample[3],
    })
  }

  return best
}

export function formatGhostDelta(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) {
    return '—'
  }

  const sign = deltaMs < 0 ? '-' : '+'
  const absoluteMilliseconds = Math.round(Math.abs(deltaMs))
  const minutes = Math.floor(absoluteMilliseconds / 60_000)
  const seconds = Math.floor((absoluteMilliseconds % 60_000) / 1_000)
  const milliseconds = absoluteMilliseconds % 1_000

  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`
}
