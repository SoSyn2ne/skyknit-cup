import {
  evaluateMission,
  type MissionAttemptStats,
  type MissionId,
  type MissionResult,
} from './missionRules'

export type MissionSessionStatus = 'idle' | 'active' | 'finished'

export interface MissionSessionState {
  readonly selectedMissionId: MissionId
  readonly status: MissionSessionStatus
  readonly attempt: MissionAttemptStats
  readonly result: MissionResult | null
}

function createCleanAttempt(): MissionAttemptStats {
  return {
    elapsedMs: 0,
    nextCheckpointIndex: 0,
    collisionCount: 0,
    respawnCount: 0,
    boostActivationCount: 0,
    finished: false,
  }
}

function updateActiveAttempt(
  state: MissionSessionState,
  update: (attempt: MissionAttemptStats) => MissionAttemptStats,
): MissionSessionState {
  return state.status === 'active'
    ? { ...state, attempt: update(state.attempt) }
    : state
}

export function createMissionSession(): MissionSessionState {
  return {
    selectedMissionId: 'first-skyknot',
    status: 'idle',
    attempt: createCleanAttempt(),
    result: null,
  }
}

export function selectMission(
  state: MissionSessionState,
  missionId: MissionId,
): MissionSessionState {
  if (state.status !== 'idle' || state.selectedMissionId === missionId) {
    return state
  }
  return { ...state, selectedMissionId: missionId }
}

export function startMissionAttempt(
  state: MissionSessionState,
): MissionSessionState {
  return {
    selectedMissionId: state.selectedMissionId,
    status: 'active',
    attempt: createCleanAttempt(),
    result: null,
  }
}

export function returnToMissionSelection(
  state: MissionSessionState,
): MissionSessionState {
  return {
    selectedMissionId: state.selectedMissionId,
    status: 'idle',
    attempt: createCleanAttempt(),
    result: null,
  }
}

export function advanceMissionAttemptClock(
  state: MissionSessionState,
  deltaMs: number,
): MissionSessionState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return state
  }
  return updateActiveAttempt(state, (attempt) => ({
    ...attempt,
    elapsedMs: attempt.elapsedMs + deltaMs,
  }))
}

export function recordMissionCheckpoint(
  state: MissionSessionState,
  nextCheckpointIndex: number,
): MissionSessionState {
  if (nextCheckpointIndex !== state.attempt.nextCheckpointIndex + 1) {
    return state
  }
  return updateActiveAttempt(state, (attempt) => ({
    ...attempt,
    nextCheckpointIndex,
  }))
}

export function recordMissionCollision(
  state: MissionSessionState,
): MissionSessionState {
  return updateActiveAttempt(state, (attempt) => ({
    ...attempt,
    collisionCount: attempt.collisionCount + 1,
  }))
}

export function recordMissionRespawn(
  state: MissionSessionState,
): MissionSessionState {
  return updateActiveAttempt(state, (attempt) => ({
    ...attempt,
    respawnCount: attempt.respawnCount + 1,
  }))
}

export function recordMissionBoostActivation(
  state: MissionSessionState,
): MissionSessionState {
  return updateActiveAttempt(state, (attempt) => ({
    ...attempt,
    boostActivationCount: attempt.boostActivationCount + 1,
  }))
}

export function finishMissionAttempt(
  state: MissionSessionState,
): MissionSessionState {
  if (state.status !== 'active') {
    return state
  }
  const attempt = { ...state.attempt, finished: true }
  return {
    ...state,
    status: 'finished',
    attempt,
    result: evaluateMission(state.selectedMissionId, attempt),
  }
}

export function cloneMissionSession(
  state: MissionSessionState,
): MissionSessionState {
  return {
    ...state,
    attempt: { ...state.attempt },
    result:
      state.result === null
        ? null
        : {
            ...state.result,
            unmetCriteria: [...state.result.unmetCriteria],
          },
  }
}
