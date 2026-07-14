import { describe, expect, it } from 'vitest'

import { prepareRaceForRecovery } from './recoveryState'
import type { RacePhase, RaceState } from '../race/raceState'

function makeState(phase: RacePhase): RaceState {
  return {
    phase,
    pausedFrom: phase === 'paused' ? 'racing' : null,
    run: {
      countdownRemainingMs: 1_200,
      elapsedMs: 34_500,
      nextCheckpointIndex: 4,
      boost: 63,
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 },
      temporaryEffects: ['gate-wave'],
    },
    finalElapsedMs: phase === 'finished' ? 34_500 : null,
    leagueResult: null,
    mission: {
      selectedMissionId: 'clean-flight',
      status: phase === 'finished' ? 'finished' : 'active',
      attempt: {
        elapsedMs: 34_500,
        nextCheckpointIndex: 4,
        collisionCount: 1,
        respawnCount: 0,
        boostActivationCount: 2,
        finished: phase === 'finished',
      },
      result:
        phase === 'finished'
          ? {
              success: false,
              grade: 'failed',
              unmetCriteria: ['collision-limit'],
            }
          : null,
    },
    persistent: {
      bestTimeMs: 40_000,
      muted: true,
      musicVolume: 0.35,
      quality: 'low',
      missionGrades: { 'first-skyknot': 'silver' },
      coinBestTimesMs: { 'festival-hub': 18_250 },
      skyLeague: {
        raceTop10Ms: [40_000],
        coinTop10Ms: { 'festival-hub': [18_250] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: {
        position: { x: 0, y: 18, z: 20 },
        headingRadians: 0,
        movement: 'airborne',
        discoveredRegionIds: ['festival-hub'],
        destinationRegionId: null,
        discoveredLandmarkIds: [],
        traversedWindZoneIds: [],
      },
    },
    config: {
      checkpointCount: 12,
      boostCapacity: 100,
      spawnPosition: { x: 0, y: 10, z: 20 },
    },
  }
}

describe('renderer recovery race state', () => {
  it.each(['countdown', 'racing'] as const)(
    'pauses %s while preserving timer and checkpoint progress',
    (phase) => {
      const state = makeState(phase)
      const recovered = prepareRaceForRecovery(state)

      expect(recovered.phase).toBe('paused')
      expect(recovered.pausedFrom).toBe(phase)
      expect(recovered.run).toEqual(state.run)
      expect(recovered.persistent).toEqual(state.persistent)
      expect(recovered.mission).toEqual(state.mission)
      expect(recovered.finalElapsedMs).toBe(state.finalElapsedMs)
    },
  )

  it.each(['ready', 'paused', 'finished'] as const)(
    'keeps the %s phase intact',
    (phase) => {
      const state = makeState(phase)
      expect(prepareRaceForRecovery(state).phase).toBe(phase)
    },
  )

  it('returns a detached snapshot of nested mutable values', () => {
    const state = makeState('racing')
    const recovered = prepareRaceForRecovery(state)

    expect(recovered).not.toBe(state)
    expect(recovered.run).not.toBe(state.run)
    expect(recovered.run.position).not.toBe(state.run.position)
    expect(recovered.persistent).not.toBe(state.persistent)
    expect(recovered.persistent.missionGrades).not.toBe(
      state.persistent.missionGrades,
    )
    expect(recovered.persistent.coinBestTimesMs).not.toBe(
      state.persistent.coinBestTimesMs,
    )
    expect(recovered.persistent.skyLeague).not.toBe(
      state.persistent.skyLeague,
    )
    expect(recovered.persistent.skyLeague.raceTop10Ms).not.toBe(
      state.persistent.skyLeague.raceTop10Ms,
    )
    expect(recovered.persistent.ghosts).not.toBe(
      state.persistent.ghosts,
    )
    expect(recovered.mission).not.toBe(state.mission)
    expect(recovered.mission.attempt).not.toBe(state.mission.attempt)
    expect(recovered.config).not.toBe(state.config)
  })
})
