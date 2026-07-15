import {
  deriveUnlockedMissionIds,
  getNextMissionId,
  isAwardedMissionGrade,
  mergeBestGrade,
  type AwardedMissionGrade,
  type MissionId,
} from '../missions/missionRules'
import {
  advanceMissionAttemptClock,
  createMissionSession,
  finishMissionAttempt,
  recordMissionBoostActivation,
  recordMissionCheckpoint,
  recordMissionCollision,
  recordMissionRespawn,
  returnToMissionSelection,
  selectMission,
  startMissionAttempt,
  type MissionSessionState,
} from '../missions/missionState'
import {
  cloneSkyLeagueGhosts,
  type CoinBestTimes,
  type ExplorationProgress,
  type SkyLeagueGhosts,
} from '../persistence/records'
import {
  cloneSkyLeagueRecords,
  recordMissionLeagueResult,
  recordRaceLeagueTime,
  type LeagueMedal,
  type SkyLeagueRecordResult,
  type SkyLeagueRecords,
} from '../competition/skyLeagueRecords'

export type RacePhase =
  | 'loading'
  | 'ready'
  | 'countdown'
  | 'racing'
  | 'paused'
  | 'finished'

export type PausableRacePhase = 'countdown' | 'racing'
export type RaceQuality = 'auto' | 'low' | 'high'

export interface RaceVector {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface RaceRunState {
  readonly countdownRemainingMs: number
  readonly elapsedMs: number
  readonly nextCheckpointIndex: number
  readonly boost: number
  readonly position: RaceVector
  readonly velocity: RaceVector
  readonly temporaryEffects: readonly string[]
}

export interface RacePersistentState {
  readonly muted: boolean
  readonly musicVolume: number
  readonly quality: RaceQuality
  readonly bestTimeMs: number | null
  readonly missionGrades: Readonly<
    Partial<Record<MissionId, AwardedMissionGrade>>
  >
  readonly coinBestTimesMs: Readonly<CoinBestTimes>
  readonly skyLeague: SkyLeagueRecords
  readonly ghosts: SkyLeagueGhosts
  readonly exploration: ExplorationProgress
}

export interface RaceLeaguePlacement {
  readonly rank: number | null
  readonly medal: LeagueMedal | null
  readonly isNewBest: boolean
  readonly inserted: boolean
}

export interface RaceMissionLeaguePlacement extends RaceLeaguePlacement {
  readonly missionId: MissionId
}

export interface RaceLeagueResult {
  readonly race: RaceLeaguePlacement
  readonly mission: RaceMissionLeaguePlacement | null
}

export interface RaceConfig {
  readonly checkpointCount: number
  readonly boostCapacity: number
  readonly spawnPosition: RaceVector
}

export interface RaceState {
  readonly phase: RacePhase
  readonly pausedFrom: PausableRacePhase | null
  readonly run: RaceRunState
  readonly finalElapsedMs: number | null
  readonly leagueResult: RaceLeagueResult | null
  readonly mission: MissionSessionState
  readonly persistent: RacePersistentState
  readonly config: RaceConfig
}

export interface CreateRaceStateOptions extends RaceConfig {
  readonly persistent: RacePersistentState
}

export type RaceEvent =
  | { readonly type: 'ASSETS_READY'; readonly assetsValid: boolean }
  | {
      readonly type: 'START'
      readonly input: 'keyboard' | 'touch' | 'unsupported'
    }
  | { readonly type: 'COUNTDOWN_DONE' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'FINISH' }
  | { readonly type: 'RESTART' }
  | { readonly type: 'RETRY' }
  | { readonly type: 'RETURN_TO_READY' }
  | { readonly type: 'SET_MUTED'; readonly muted: boolean }
  | { readonly type: 'SET_MUSIC_VOLUME'; readonly musicVolume: number }
  | { readonly type: 'SET_QUALITY'; readonly quality: RaceQuality }

const COUNTDOWN_DURATION_MS = 3_000

function cloneVector(vector: RaceVector): RaceVector {
  return { x: vector.x, y: vector.y, z: vector.z }
}

function createCleanRun(config: RaceConfig): RaceRunState {
  return {
    countdownRemainingMs: COUNTDOWN_DURATION_MS,
    elapsedMs: 0,
    nextCheckpointIndex: 0,
    boost: config.boostCapacity,
    position: cloneVector(config.spawnPosition),
    velocity: { x: 0, y: 0, z: 0 },
    temporaryEffects: [],
  }
}

function startFreshCountdown(state: RaceState): RaceState {
  return {
    ...state,
    phase: 'countdown',
    pausedFrom: null,
    run: createCleanRun(state.config),
    finalElapsedMs: null,
    leagueResult: null,
    mission: startMissionAttempt(state.mission),
  }
}

function toLeaguePlacement(
  result: SkyLeagueRecordResult,
): RaceLeaguePlacement {
  return {
    rank: result.rank,
    medal: result.medal,
    isNewBest: result.isNewBest,
    inserted: result.inserted,
  }
}

function finishRace(state: RaceState): RaceState {
  const elapsedMs = state.run.elapsedMs
  const elapsedIsValid = Number.isFinite(elapsedMs) && elapsedMs > 0
  const currentBest = state.persistent.bestTimeMs
  const isNewBest =
    elapsedIsValid && (currentBest === null || elapsedMs < currentBest)
  const mission = finishMissionAttempt(state.mission)
  const missionGrade = mission.result?.grade ?? 'failed'
  const previousMissionGrade =
    state.persistent.missionGrades[mission.selectedMissionId] ?? null
  const bestMissionGrade = mergeBestGrade(
    previousMissionGrade,
    missionGrade,
  )
  const missionGrades =
    bestMissionGrade === null || bestMissionGrade === previousMissionGrade
      ? state.persistent.missionGrades
      : {
          ...state.persistent.missionGrades,
          [mission.selectedMissionId]: bestMissionGrade,
        }

  const raceLeague = elapsedIsValid
    ? recordRaceLeagueTime(state.persistent.skyLeague, elapsedMs)
    : null
  const missionLeague =
    raceLeague !== null && isAwardedMissionGrade(missionGrade)
      ? recordMissionLeagueResult(
          raceLeague.records,
          mission.selectedMissionId,
          elapsedMs,
          missionGrade,
        )
      : null
  const skyLeague =
    missionLeague?.records ??
    raceLeague?.records ??
    state.persistent.skyLeague
  const leagueResult =
    raceLeague === null
      ? null
      : {
          race: toLeaguePlacement(raceLeague),
          mission:
            missionLeague === null
              ? null
              : {
                  missionId: mission.selectedMissionId,
                  ...toLeaguePlacement(missionLeague),
                },
        }

  return {
    ...state,
    phase: 'finished',
    pausedFrom: null,
    finalElapsedMs: elapsedIsValid ? elapsedMs : null,
    leagueResult,
    mission,
    persistent:
      isNewBest ||
      missionGrades !== state.persistent.missionGrades ||
      skyLeague !== state.persistent.skyLeague
        ? {
            ...state.persistent,
            bestTimeMs: isNewBest ? elapsedMs : state.persistent.bestTimeMs,
            missionGrades,
            skyLeague,
          }
        : state.persistent,
  }
}

export function createInitialRaceState(
  options: CreateRaceStateOptions,
): RaceState {
  const config: RaceConfig = {
    checkpointCount: options.checkpointCount,
    boostCapacity: options.boostCapacity,
    spawnPosition: cloneVector(options.spawnPosition),
  }

  return {
    phase: 'loading',
    pausedFrom: null,
    run: createCleanRun(config),
    finalElapsedMs: null,
    leagueResult: null,
    mission: createMissionSession(),
    persistent: {
      ...options.persistent,
      missionGrades: { ...options.persistent.missionGrades },
      coinBestTimesMs: { ...options.persistent.coinBestTimesMs },
      skyLeague: cloneSkyLeagueRecords(options.persistent.skyLeague),
      ghosts: cloneSkyLeagueGhosts(options.persistent.ghosts),
    },
    config,
  }
}

export function transitionRace(
  state: RaceState,
  event: RaceEvent,
): RaceState {
  if (event.type === 'SET_MUTED') {
    return event.muted === state.persistent.muted
      ? state
      : {
          ...state,
          persistent: { ...state.persistent, muted: event.muted },
        }
  }

  if (event.type === 'SET_MUSIC_VOLUME') {
    if (!Number.isFinite(event.musicVolume)) return state
    const musicVolume = Math.min(1, Math.max(0, event.musicVolume))
    return musicVolume === state.persistent.musicVolume
      ? state
      : {
          ...state,
          persistent: { ...state.persistent, musicVolume },
        }
  }

  if (event.type === 'SET_QUALITY') {
    return event.quality === state.persistent.quality
      ? state
      : {
          ...state,
          persistent: { ...state.persistent, quality: event.quality },
        }
  }

  if (
    state.phase === 'loading' &&
    event.type === 'ASSETS_READY' &&
    event.assetsValid
  ) {
    return { ...state, phase: 'ready' }
  }

  if (
    state.phase === 'ready' &&
    event.type === 'START' &&
    (event.input === 'keyboard' || event.input === 'touch') &&
    deriveUnlockedMissionIds(state.persistent.missionGrades).includes(
      state.mission.selectedMissionId,
    )
  ) {
    return startFreshCountdown(state)
  }

  if (
    state.phase === 'countdown' &&
    event.type === 'COUNTDOWN_DONE' &&
    state.run.countdownRemainingMs === 0
  ) {
    return {
      ...state,
      phase: 'racing',
      run: { ...state.run, elapsedMs: 0 },
    }
  }

  if (
    (state.phase === 'countdown' || state.phase === 'racing') &&
    event.type === 'PAUSE'
  ) {
    return {
      ...state,
      phase: 'paused',
      pausedFrom: state.phase,
    }
  }

  if (
    state.phase === 'paused' &&
    event.type === 'RESUME' &&
    state.pausedFrom !== null
  ) {
    return {
      ...state,
      phase: state.pausedFrom,
      pausedFrom: null,
    }
  }

  if (
    state.phase === 'racing' &&
    event.type === 'FINISH' &&
    state.run.nextCheckpointIndex === state.config.checkpointCount
  ) {
    return finishRace(state)
  }

  if (state.phase === 'paused' && event.type === 'RESTART') {
    return startFreshCountdown(state)
  }

  if (state.phase === 'finished' && event.type === 'RETRY') {
    return startFreshCountdown(state)
  }

  if (
    (state.phase === 'paused' || state.phase === 'finished') &&
    event.type === 'RETURN_TO_READY'
  ) {
    return {
      ...state,
      phase: 'ready',
      pausedFrom: null,
      run: createCleanRun(state.config),
      finalElapsedMs: null,
      leagueResult: null,
      mission: returnToMissionSelection(state.mission),
    }
  }

  return state
}

export function canMove(state: RaceState): boolean {
  return state.phase === 'racing'
}

export function advanceRaceClock(
  state: RaceState,
  deltaMs: number,
): RaceState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return state
  }

  if (state.phase === 'countdown') {
    const countdownRemainingMs = Math.max(
      0,
      state.run.countdownRemainingMs - deltaMs,
    )
    const advanced = {
      ...state,
      run: { ...state.run, countdownRemainingMs },
    }

    return countdownRemainingMs === 0
      ? transitionRace(advanced, { type: 'COUNTDOWN_DONE' })
      : advanced
  }

  if (state.phase === 'racing') {
    return {
      ...state,
      mission: advanceMissionAttemptClock(state.mission, deltaMs),
      run: {
        ...state.run,
        elapsedMs: state.run.elapsedMs + deltaMs,
      },
    }
  }

  return state
}

export function recordCheckpointPass(
  state: RaceState,
  checkpointIndex: number,
): RaceState {
  if (
    state.phase !== 'racing' ||
    checkpointIndex !== state.run.nextCheckpointIndex
  ) {
    return state
  }

  const progressed = {
    ...state,
    mission: recordMissionCheckpoint(
      state.mission,
      state.run.nextCheckpointIndex + 1,
    ),
    run: {
      ...state.run,
      nextCheckpointIndex: state.run.nextCheckpointIndex + 1,
    },
  }

  return progressed.run.nextCheckpointIndex === state.config.checkpointCount
    ? transitionRace(progressed, { type: 'FINISH' })
    : progressed
}

export function selectRaceMission(
  state: RaceState,
  missionId: MissionId,
): RaceState {
  if (state.phase !== 'ready' && state.phase !== 'paused') {
    return state
  }
  if (
    !deriveUnlockedMissionIds(state.persistent.missionGrades).includes(
      missionId,
    )
  ) {
    return state
  }
  if (state.mission.selectedMissionId === missionId) {
    return state
  }

  const selectableState =
    state.phase === 'paused'
      ? transitionRace(state, { type: 'RETURN_TO_READY' })
      : state
  const mission = selectMission(selectableState.mission, missionId)
  return mission === selectableState.mission
    ? selectableState
    : { ...selectableState, mission }
}

export function selectNextRaceMission(state: RaceState): RaceState {
  if (state.phase !== 'finished' || state.mission.result?.success !== true) {
    return state
  }

  const nextMissionId = getNextMissionId(state.mission.selectedMissionId)
  if (
    nextMissionId === null ||
    !deriveUnlockedMissionIds(state.persistent.missionGrades).includes(
      nextMissionId,
    )
  ) {
    return state
  }

  const ready = transitionRace(state, { type: 'RETURN_TO_READY' })
  const mission = selectMission(ready.mission, nextMissionId)
  return mission === ready.mission ? ready : { ...ready, mission }
}

export function recordRaceCollision(state: RaceState): RaceState {
  if (state.phase !== 'racing') {
    return state
  }
  return { ...state, mission: recordMissionCollision(state.mission) }
}

export function recordRaceRespawn(state: RaceState): RaceState {
  if (
    state.phase !== 'racing' &&
    !(state.phase === 'paused' && state.pausedFrom === 'racing')
  ) {
    return state
  }
  return { ...state, mission: recordMissionRespawn(state.mission) }
}

export function recordRaceBoostActivation(state: RaceState): RaceState {
  if (state.phase !== 'racing') {
    return state
  }
  return { ...state, mission: recordMissionBoostActivation(state.mission) }
}

export interface RaceRunMotion {
  readonly position: RaceVector
  readonly velocity: RaceVector
  readonly boost: number
}

export function syncRaceRun(
  state: RaceState,
  motion: RaceRunMotion,
): RaceState {
  if (state.phase !== 'racing') {
    return state
  }

  return {
    ...state,
    run: {
      ...state.run,
      position: cloneVector(motion.position),
      velocity: cloneVector(motion.velocity),
      boost: motion.boost,
    },
  }
}
