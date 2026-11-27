import { describe, expect, it } from 'vitest'

import {
  advanceMissionAttemptClock,
  cloneMissionSession,
  createMissionSession,
  finishMissionAttempt,
  recordMissionBoostActivation,
  recordMissionCheckpoint,
  recordMissionCollision,
  recordMissionRespawn,
  returnToMissionSelection,
  selectMission,
  startMissionAttempt,
} from './missionState'

describe('mission session state', () => {
  it('creates an idle first-mission session with clean statistics', () => {
    expect(createMissionSession()).toEqual({
      selectedMissionId: 'first-skyknot',
      status: 'idle',
      attempt: {
        elapsedMs: 0,
        nextCheckpointIndex: 0,
        collisionCount: 0,
        respawnCount: 0,
        boostActivationCount: 0,
        finished: false,
      },
      result: null,
    })
  })

  it('selects a mission only before an attempt starts', () => {
    const idle = createMissionSession()
    const selected = selectMission(idle, 'clean-flight')
    const active = startMissionAttempt(selected)

    expect(selected.selectedMissionId).toBe('clean-flight')
    expect(selectMission(active, 'time-trial')).toBe(active)
  })

  it('starts and retries with the selected mission and clean statistics', () => {
    const selected = selectMission(createMissionSession(), 'boost-mastery')
    const active = startMissionAttempt(selected)
    const progressed = recordMissionCollision(
      advanceMissionAttemptClock(active, 3_500),
    )
    const retried = startMissionAttempt(progressed)

    expect(active.status).toBe('active')
    expect(retried.selectedMissionId).toBe('boost-mastery')
    expect(retried.attempt).toEqual(active.attempt)
    expect(retried.result).toBeNull()
  })

  it('advances time only for active attempts and valid positive deltas', () => {
    const idle = createMissionSession()
    const active = startMissionAttempt(idle)

    expect(advanceMissionAttemptClock(idle, 1_000)).toBe(idle)
    expect(advanceMissionAttemptClock(active, -1)).toBe(active)
    expect(advanceMissionAttemptClock(active, Number.NaN)).toBe(active)
    expect(advanceMissionAttemptClock(active, 16.5).attempt.elapsedMs).toBe(
      16.5,
    )
  })

  it('records collision, respawn, and boost events exactly once per call', () => {
    let state = startMissionAttempt(createMissionSession())
    state = recordMissionCollision(state)
    state = recordMissionRespawn(state)
    state = recordMissionBoostActivation(state)

    expect(state.attempt).toMatchObject({
      collisionCount: 1,
      respawnCount: 1,
      boostActivationCount: 1,
    })
  })

  it('accepts only the next checkpoint in sequence', () => {
    const active = startMissionAttempt(createMissionSession())
    const first = recordMissionCheckpoint(active, 1)

    expect(recordMissionCheckpoint(active, 2)).toBe(active)
    expect(recordMissionCheckpoint(first, 1)).toBe(first)
    expect(recordMissionCheckpoint(first, 2).attempt.nextCheckpointIndex).toBe(
      2,
    )
  })

  it('evaluates once and ignores every statistic event after finish', () => {
    let active = startMissionAttempt(
      selectMission(createMissionSession(), 'clean-flight'),
    )
    active = advanceMissionAttemptClock(active, 75_000)
    for (let activation = 0; activation < 5; activation += 1) {
      active = recordMissionBoostActivation(active)
    }
    const finished = finishMissionAttempt(active)

    expect(finished.status).toBe('finished')
    expect(finished.attempt.finished).toBe(true)
    expect(finished.result?.grade).toBe('gold')
    expect(finishMissionAttempt(finished)).toBe(finished)
    expect(recordMissionCollision(finished)).toBe(finished)
    expect(recordMissionRespawn(finished)).toBe(finished)
    expect(recordMissionBoostActivation(finished)).toBe(finished)
    expect(advanceMissionAttemptClock(finished, 100)).toBe(finished)
  })

  it('returns to selection with persistent choice but a clean idle attempt', () => {
    const finished = finishMissionAttempt(
      startMissionAttempt(
        selectMission(createMissionSession(), 'no-respawn'),
      ),
    )
    const selected = returnToMissionSelection(finished)

    expect(selected.status).toBe('idle')
    expect(selected.selectedMissionId).toBe('no-respawn')
    expect(selected.attempt.elapsedMs).toBe(0)
    expect(selected.result).toBeNull()
  })

  it('clones nested attempt and result data for recovery', () => {
    const finished = finishMissionAttempt(
      startMissionAttempt(createMissionSession()),
    )
    const cloned = cloneMissionSession(finished)

    expect(cloned).toEqual(finished)
    expect(cloned).not.toBe(finished)
    expect(cloned.attempt).not.toBe(finished.attempt)
    expect(cloned.result).not.toBe(finished.result)
    expect(cloned.result?.unmetCriteria).not.toBe(
      finished.result?.unmetCriteria,
    )
  })
})
