import { describe, expect, it } from 'vitest'

import { DEFAULT_CHARACTER_LOADOUT } from '../customization/characterCatalog'
import {
  advanceRaceClock,
  canMove,
  createInitialRaceState,
  recordRaceBoostActivation,
  recordRaceCollision,
  recordRaceRespawn,
  recordCheckpointPass,
  selectNextRaceMission,
  selectRaceMission,
  syncRaceRun,
  transitionRace,
  type RaceEvent,
  type RacePhase,
  type RaceState,
} from './raceState'

const options = {
  courseId: 'skyknot' as const,
  checkpointCount: 3,
  boostCapacity: 100,
  spawnPosition: { x: 2, y: 12, z: -4 },
  persistent: {
    muted: true,
    musicVolume: 0.35,
    quality: 'high' as const,
    characterLoadout: DEFAULT_CHARACTER_LOADOUT,
    bestTimeMs: 50_000,
    missionGrades: { 'first-skyknot': 'silver' as const },
    coinBestTimesMs: { 'festival-hub': 18_250 },
    skyLeague: {
      raceTop10Ms: [50_000],
      coinTop10Ms: { 'festival-hub': [18_250] },
      missionTop10: {},
    },
    ghosts: { race: null, coin: {}, mission: {} },
    exploration: {
      position: { x: 0, y: 18, z: 20 },
      headingRadians: 0,
      movement: 'airborne' as const,
      discoveredRegionIds: ['festival-hub'] as const,
      destinationRegionId: null,
      discoveredLandmarkIds: [] as const,
      traversedWindZoneIds: [] as const,
    },
  },
}

function makeState(phase: RacePhase): RaceState {
  return {
    phase,
    pausedFrom: phase === 'paused' ? 'racing' : null,
    run: {
      countdownRemainingMs: 1_250,
      elapsedMs: 42_000,
      nextCheckpointIndex: 2,
      boost: 35,
      position: { x: 9, y: 8, z: 7 },
      velocity: { x: 3, y: 2, z: 1 },
      temporaryEffects: ['gate-wave'],
    },
    finalElapsedMs: phase === 'finished' ? 42_000 : null,
    leagueResult: null,
    mission: {
      selectedMissionId: 'first-skyknot',
      status: phase === 'finished' ? 'finished' : 'active',
      attempt: {
        elapsedMs: 42_000,
        nextCheckpointIndex: 2,
        collisionCount: 0,
        respawnCount: 0,
        boostActivationCount: 0,
        finished: phase === 'finished',
      },
      result:
        phase === 'finished'
          ? { success: true, grade: 'gold', unmetCriteria: [] }
          : null,
    },
    persistent: { ...options.persistent },
    config: {
      courseId: options.courseId,
      checkpointCount: options.checkpointCount,
      boostCapacity: options.boostCapacity,
      spawnPosition: { ...options.spawnPosition },
    },
  }
}

function withRun(
  state: RaceState,
  run: Partial<RaceState['run']>,
): RaceState {
  return {
    ...state,
    run: {
      ...state.run,
      ...run,
    },
  }
}

describe('race state', () => {
  it('creates the loading state with a clean run', () => {
    const state = createInitialRaceState(options)

    expect(state.phase).toBe('loading')
    expect(state.run).toEqual({
      countdownRemainingMs: 3_000,
      elapsedMs: 0,
      nextCheckpointIndex: 0,
      boost: 100,
      position: options.spawnPosition,
      velocity: { x: 0, y: 0, z: 0 },
      temporaryEffects: [],
    })
    expect(state.persistent).toEqual(options.persistent)
  })

  it('moves from loading to ready when required assets are valid', () => {
    const loading = createInitialRaceState(options)
    const ready = transitionRace(loading, {
      type: 'ASSETS_READY',
      assetsValid: true,
    })

    expect(ready.phase).toBe('ready')
    expect(ready.run.elapsedMs).toBe(0)
  })

  it('rejects ASSETS_READY when required assets are invalid', () => {
    const loading = createInitialRaceState(options)

    expect(
      transitionRace(loading, {
        type: 'ASSETS_READY',
        assetsValid: false,
      }),
    ).toBe(loading)
  })

  it.each(['keyboard', 'touch'] as const)(
    'starts a fresh three-second countdown from ready for %s',
    (input) => {
      const ready = makeState('ready')
      const countdown = transitionRace(ready, { type: 'START', input })

      expect(countdown.phase).toBe('countdown')
      expect(countdown.pausedFrom).toBeNull()
      expect(countdown.run).toEqual({
        countdownRemainingMs: 3_000,
        elapsedMs: 0,
        nextCheckpointIndex: 0,
        boost: 100,
        position: options.spawnPosition,
        velocity: { x: 0, y: 0, z: 0 },
        temporaryEffects: [],
      })
      expect(countdown.persistent).toEqual(ready.persistent)
    },
  )

  it('rejects an unsupported start input', () => {
    const ready = makeState('ready')

    expect(
      transitionRace(ready, { type: 'START', input: 'unsupported' }),
    ).toBe(ready)
  })

  it('enters racing only when countdown reaches zero', () => {
    const countdown = makeState('countdown')
    expect(transitionRace(countdown, { type: 'COUNTDOWN_DONE' })).toBe(
      countdown,
    )

    const completed = withRun(countdown, { countdownRemainingMs: 0 })
    const racing = transitionRace(completed, { type: 'COUNTDOWN_DONE' })

    expect(racing.phase).toBe('racing')
    expect(racing.run.elapsedMs).toBe(0)
    expect(canMove(racing)).toBe(true)
  })

  it('pauses countdown and preserves its exact remaining time', () => {
    const countdown = makeState('countdown')
    const paused = transitionRace(countdown, { type: 'PAUSE' })

    expect(paused.phase).toBe('paused')
    expect(paused.pausedFrom).toBe('countdown')
    expect(paused.run).toBe(countdown.run)
    expect(canMove(paused)).toBe(false)
  })

  it('pauses racing and preserves elapsed time and run progress', () => {
    const racing = makeState('racing')
    const paused = transitionRace(racing, { type: 'PAUSE' })

    expect(paused.phase).toBe('paused')
    expect(paused.pausedFrom).toBe('racing')
    expect(paused.run).toBe(racing.run)
  })

  it.each(['countdown', 'racing'] as const)(
    'resumes the exact %s phase and data recorded by pause',
    (pausedFrom) => {
      const paused = { ...makeState('paused'), pausedFrom }
      const resumed = transitionRace(paused, { type: 'RESUME' })

      expect(resumed.phase).toBe(pausedFrom)
      expect(resumed.pausedFrom).toBeNull()
      expect(resumed.run).toBe(paused.run)
    },
  )

  it('rejects resume when the paused source phase is missing', () => {
    const paused = { ...makeState('paused'), pausedFrom: null }

    expect(transitionRace(paused, { type: 'RESUME' })).toBe(paused)
  })

  it('finishes only after every checkpoint has passed', () => {
    const incomplete = makeState('racing')
    expect(transitionRace(incomplete, { type: 'FINISH' })).toBe(incomplete)

    const complete = withRun(incomplete, { nextCheckpointIndex: 3 })
    const finished = transitionRace(complete, { type: 'FINISH' })

    expect(finished.phase).toBe('finished')
    expect(finished.finalElapsedMs).toBe(42_000)
    expect(finished.persistent.bestTimeMs).toBe(42_000)
    expect(finished.persistent.skyLeague.raceTop10Ms).toEqual([
      42_000,
      50_000,
    ])
    expect(finished.leagueResult).toMatchObject({
      race: { rank: 1, medal: 'gold', isNewBest: true },
      mission: {
        missionId: 'first-skyknot',
        rank: 1,
        medal: 'gold',
        isNewBest: true,
      },
    })
    expect(finished.run).toBe(complete.run)
  })

  it('records a volcanic finish only on its mission board', () => {
    const base = makeState('racing')
    const racing: RaceState = {
      ...withRun(base, {
        elapsedMs: 44_000,
        nextCheckpointIndex: 4,
      }),
      config: {
        ...base.config,
        courseId: 'volcanic-archipelago',
        checkpointCount: 4,
      },
      mission: {
        ...base.mission,
        selectedMissionId: 'heart-of-sun',
        attempt: {
          ...base.mission.attempt,
          elapsedMs: 44_000,
          nextCheckpointIndex: 4,
          boostActivationCount: 2,
        },
      },
      persistent: {
        ...base.persistent,
        missionGrades: {
          ...base.persistent.missionGrades,
          'golden-knot': 'bronze',
        },
      },
    }

    const finished = transitionRace(racing, { type: 'FINISH' })

    expect(finished.mission.result?.grade).toBe('gold')
    expect(finished.persistent.bestTimeMs).toBe(50_000)
    expect(finished.persistent.skyLeague.raceTop10Ms).toEqual([50_000])
    expect(finished.persistent.skyLeague.missionTop10['heart-of-sun']).toEqual([
      { elapsedMs: 44_000, grade: 'gold' },
    ])
    expect(finished.leagueResult).toMatchObject({
      race: { rank: null, inserted: false, isNewBest: false },
      mission: {
        missionId: 'heart-of-sun',
        rank: 1,
        inserted: true,
        isNewBest: true,
      },
    })
  })

  it('uses the mission course to protect legacy records from mismatched recovered config', () => {
    const base = makeState('racing')
    const racing: RaceState = {
      ...withRun(base, { elapsedMs: 40_000, nextCheckpointIndex: 3 }),
      mission: {
        ...base.mission,
        selectedMissionId: 'heart-of-sun',
        attempt: {
          ...base.mission.attempt,
          elapsedMs: 40_000,
          nextCheckpointIndex: 3,
          boostActivationCount: 2,
        },
      },
    }

    const finished = transitionRace(racing, { type: 'FINISH' })

    expect(finished.persistent.bestTimeMs).toBe(50_000)
    expect(finished.persistent.skyLeague.raceTop10Ms).toEqual([50_000])
  })

  it('keeps a faster existing best time after a valid finish', () => {
    const racing = withRun(makeState('racing'), {
      elapsedMs: 55_000,
      nextCheckpointIndex: 3,
    })
    const finished = transitionRace(racing, { type: 'FINISH' })

    expect(finished.persistent.bestTimeMs).toBe(50_000)
    expect(finished.persistent.skyLeague.raceTop10Ms).toEqual([
      50_000,
      55_000,
    ])
    expect(finished.leagueResult?.race).toMatchObject({
      rank: 2,
      medal: 'silver',
      isNewBest: false,
      inserted: true,
    })
  })

  it('keeps failed missions off their board while retaining the race result', () => {
    const base = makeState('racing')
    const racing = {
      ...withRun(base, {
        elapsedMs: 45_000,
        nextCheckpointIndex: 3,
      }),
      mission: {
        ...base.mission,
        selectedMissionId: 'clean-flight' as const,
        attempt: {
          ...base.mission.attempt,
          elapsedMs: 45_000,
          nextCheckpointIndex: 3,
          collisionCount: 1,
        },
      },
    }
    const finished = transitionRace(racing, { type: 'FINISH' })

    expect(finished.mission.result?.grade).toBe('failed')
    expect(finished.persistent.skyLeague.raceTop10Ms).toEqual([
      45_000,
      50_000,
    ])
    expect(finished.persistent.skyLeague.missionTop10['clean-flight']).toBe(
      undefined,
    )
    expect(finished.leagueResult?.mission).toBeNull()
  })

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not record an invalid final elapsed time %s as a best time',
    (elapsedMs) => {
      const racing = withRun(makeState('racing'), {
        elapsedMs,
        nextCheckpointIndex: 3,
      })
      const finished = transitionRace(racing, { type: 'FINISH' })

      expect(finished.phase).toBe('finished')
      expect(finished.finalElapsedMs).toBeNull()
      expect(finished.persistent.bestTimeMs).toBe(50_000)
    },
  )

  it('restarts a paused race with transient state reset and best time preserved', () => {
    const paused = makeState('paused')
    const restarted = transitionRace(paused, { type: 'RESTART' })

    expect(restarted.phase).toBe('countdown')
    expect(restarted.run.elapsedMs).toBe(0)
    expect(restarted.run.nextCheckpointIndex).toBe(0)
    expect(restarted.run.boost).toBe(100)
    expect(restarted.run.position).toEqual(options.spawnPosition)
    expect(restarted.run.velocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(restarted.run.temporaryEffects).toEqual([])
    expect(restarted.persistent).toEqual(paused.persistent)
    expect(restarted.leagueResult).toBeNull()
  })

  it('retries a finished race with transient state reset and best time preserved', () => {
    const finished = makeState('finished')
    const retried = transitionRace(finished, { type: 'RETRY' })

    expect(retried.phase).toBe('countdown')
    expect(retried.finalElapsedMs).toBeNull()
    expect(retried.run).toEqual({
      countdownRemainingMs: 3_000,
      elapsedMs: 0,
      nextCheckpointIndex: 0,
      boost: 100,
      position: options.spawnPosition,
      velocity: { x: 0, y: 0, z: 0 },
      temporaryEffects: [],
    })
    expect(retried.persistent).toEqual(finished.persistent)
    expect(retried.leagueResult).toBeNull()
  })

  it('returns the same state for every unlisted event and phase pair', () => {
    const phases: readonly RacePhase[] = [
      'loading',
      'ready',
      'countdown',
      'racing',
      'paused',
      'finished',
    ]
    const events: readonly RaceEvent[] = [
      { type: 'ASSETS_READY', assetsValid: true },
      { type: 'START', input: 'keyboard' },
      { type: 'COUNTDOWN_DONE' },
      { type: 'PAUSE' },
      { type: 'RESUME' },
      { type: 'FINISH' },
      { type: 'RESTART' },
      { type: 'RETRY' },
      { type: 'RETURN_TO_READY' },
    ]
    const listedPairs = new Set([
      'loading:ASSETS_READY',
      'ready:START',
      'countdown:COUNTDOWN_DONE',
      'countdown:PAUSE',
      'racing:PAUSE',
      'racing:FINISH',
      'paused:RESUME',
      'paused:RESTART',
      'paused:RETURN_TO_READY',
      'finished:RETRY',
      'finished:RETURN_TO_READY',
    ])

    for (const phase of phases) {
      for (const event of events) {
        if (listedPairs.has(`${phase}:${event.type}`)) {
          continue
        }

        const state = makeState(phase)
        expect(transitionRace(state, event)).toBe(state)
      }
    }
  })

  it('counts down to racing without starting the elapsed timer early', () => {
    const countdown = withRun(makeState('countdown'), {
      countdownRemainingMs: 20,
      elapsedMs: 0,
    })
    const almost = advanceRaceClock(countdown, 15)
    const racing = advanceRaceClock(almost, 5)

    expect(almost.phase).toBe('countdown')
    expect(almost.run.countdownRemainingMs).toBe(5)
    expect(racing.phase).toBe('racing')
    expect(racing.run.countdownRemainingMs).toBe(0)
    expect(racing.run.elapsedMs).toBe(0)
  })

  it('advances elapsed time only while racing', () => {
    const racing = withRun(makeState('racing'), { elapsedMs: 2_000 })
    const advanced = advanceRaceClock(racing, 16.5)
    const ready = makeState('ready')

    expect(advanced.run.elapsedMs).toBeCloseTo(2_016.5)
    expect(advanceRaceClock(ready, 500)).toBe(ready)
  })

  it('freezes countdown and elapsed time while paused', () => {
    const paused = makeState('paused')

    expect(advanceRaceClock(paused, 1_000)).toBe(paused)
  })

  it('counts only the currently active checkpoint', () => {
    const racing = withRun(makeState('racing'), {
      nextCheckpointIndex: 1,
    })

    expect(recordCheckpointPass(racing, 0)).toBe(racing)
    expect(recordCheckpointPass(racing, 2)).toBe(racing)
    expect(recordCheckpointPass(racing, 1).run.nextCheckpointIndex).toBe(2)
  })

  it('ignores checkpoint passes while paused', () => {
    const paused = withRun(makeState('paused'), {
      nextCheckpointIndex: 1,
    })

    expect(recordCheckpointPass(paused, 1)).toBe(paused)
  })

  it('finishes immediately after the final active checkpoint', () => {
    const racing = withRun(makeState('racing'), {
      elapsedMs: 75_000,
      nextCheckpointIndex: 2,
    })
    const finished = recordCheckpointPass(racing, 2)

    expect(finished.phase).toBe('finished')
    expect(finished.run.nextCheckpointIndex).toBe(3)
    expect(finished.finalElapsedMs).toBe(75_000)
  })

  it('syncs live flight values only while racing', () => {
    const racing = makeState('racing')
    const synced = syncRaceRun(racing, {
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 },
      boost: 72,
    })

    expect(synced.run).toMatchObject({
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 },
      boost: 72,
    })

    const paused = makeState('paused')
    expect(
      syncRaceRun(paused, {
        position: { x: 1, y: 2, z: 3 },
        velocity: { x: 4, y: 5, z: 6 },
        boost: 72,
      }),
    ).toBe(paused)
  })

  it.each<RacePhase>([
    'loading',
    'ready',
    'countdown',
    'racing',
    'paused',
    'finished',
  ])('changes quality without resetting %s race progress', (phase) => {
    const state = makeState(phase)
    const changed = transitionRace(state, {
      type: 'SET_QUALITY',
      quality: 'low',
    })

    expect(changed.phase).toBe(phase)
    expect(changed.run).toBe(state.run)
    expect(changed.finalElapsedMs).toBe(state.finalElapsedMs)
    expect(changed.persistent).toEqual({
      ...state.persistent,
      quality: 'low',
    })
  })

  it('changes mute without resetting race progress', () => {
    const state = makeState('racing')
    const changed = transitionRace(state, {
      type: 'SET_MUTED',
      muted: false,
    })

    expect(changed.run).toBe(state.run)
    expect(changed.persistent).toEqual({
      ...state.persistent,
      muted: false,
    })
  })

  it('updates clamped BGM volume without touching active run data', () => {
    const state = makeState('racing')
    const changed = transitionRace(state, {
      type: 'SET_MUSIC_VOLUME',
      musicVolume: 1.4,
    })

    expect(changed.persistent.musicVolume).toBe(1)
    expect(changed.run).toBe(state.run)
    expect(
      transitionRace(changed, {
        type: 'SET_MUSIC_VOLUME',
        musicVolume: Number.NaN,
      }),
    ).toBe(changed)
  })

  it('keeps identity when a setting already has the requested value', () => {
    const state = makeState('racing')

    expect(
      transitionRace(state, { type: 'SET_QUALITY', quality: 'high' }),
    ).toBe(state)
    expect(transitionRace(state, { type: 'SET_MUTED', muted: true })).toBe(
      state,
    )
  })

  it.each(['ready', 'paused'] as const)(
    'applies a detached character loadout while the race is %s',
    (phase) => {
      const state = makeState(phase)
      const loadout = {
        characterId: 'storm-white-tiger' as const,
        paletteId: 'moonlight' as const,
        accessoryId: 'festival-ribbon' as const,
      }
      const changed = transitionRace(state, {
        type: 'SET_CHARACTER_LOADOUT',
        loadout,
      })

      expect(changed.phase).toBe(phase)
      expect(changed.persistent.characterLoadout).toEqual(loadout)
      expect(changed.persistent.characterLoadout).not.toBe(loadout)
    },
  )

  it('preserves active progress and existing persistent collections when applying a loadout', () => {
    const state = makeState('paused')
    const changed = transitionRace(state, {
      type: 'SET_CHARACTER_LOADOUT',
      loadout: {
        characterId: 'ember-phoenix',
        paletteId: 'storm',
        accessoryId: 'wind-goggles',
      },
    })

    expect(changed.run).toBe(state.run)
    expect(changed.mission).toBe(state.mission)
    expect(changed.config).toBe(state.config)
    expect(changed.persistent.missionGrades).toBe(
      state.persistent.missionGrades,
    )
    expect(changed.persistent.coinBestTimesMs).toBe(
      state.persistent.coinBestTimesMs,
    )
    expect(changed.persistent.skyLeague).toBe(state.persistent.skyLeague)
    expect(changed.persistent.ghosts).toBe(state.persistent.ghosts)
    expect(changed.persistent.exploration).toBe(
      state.persistent.exploration,
    )
  })

  it.each([
    'loading',
    'countdown',
    'racing',
    'finished',
  ] as const)('rejects a character loadout change while %s', (phase) => {
    const state = makeState(phase)

    expect(
      transitionRace(state, {
        type: 'SET_CHARACTER_LOADOUT',
        loadout: {
          characterId: 'ember-phoenix',
          paletteId: 'moonlight',
          accessoryId: 'wind-goggles',
        },
      }),
    ).toBe(state)
  })

  it('selects missions only while ready', () => {
    const ready = {
      ...makeState('ready'),
      mission: {
        ...makeState('ready').mission,
        status: 'idle' as const,
      },
      persistent: {
        ...makeState('ready').persistent,
        missionGrades: {
          'first-skyknot': 'gold' as const,
          'boost-mastery': 'gold' as const,
          'no-respawn': 'gold' as const,
          'time-trial': 'gold' as const,
        },
      },
    }
    const selected = selectRaceMission(ready, 'clean-flight')
    const racing = makeState('racing')

    expect(selected.mission.selectedMissionId).toBe('clean-flight')
    expect(selectRaceMission(racing, 'time-trial')).toBe(racing)
  })

  it('rejects locked mission selection for a new player', () => {
    const ready = {
      ...makeState('ready'),
      mission: {
        ...makeState('ready').mission,
        status: 'idle' as const,
      },
      persistent: {
        ...makeState('ready').persistent,
        missionGrades: {},
      },
    }

    expect(selectRaceMission(ready, 'boost-mastery')).toBe(ready)
    expect(selectRaceMission(ready, 'golden-knot')).toBe(ready)
  })

  it('rejects starting a locked mission from a recovered ready state', () => {
    const ready = {
      ...makeState('ready'),
      mission: {
        ...makeState('ready').mission,
        selectedMissionId: 'golden-knot' as const,
        status: 'idle' as const,
      },
      persistent: {
        ...makeState('ready').persistent,
        missionGrades: {},
      },
    }

    expect(
      transitionRace(ready, { type: 'START', input: 'keyboard' }),
    ).toBe(ready)
  })

  it('preserves access around a sparse later historical grade', () => {
    const ready = {
      ...makeState('ready'),
      mission: {
        ...makeState('ready').mission,
        status: 'idle' as const,
      },
      persistent: {
        ...makeState('ready').persistent,
        missionGrades: { 'time-trial': 'bronze' as const },
      },
    }

    expect(
      selectRaceMission(ready, 'clean-flight').mission.selectedMissionId,
    ).toBe('clean-flight')
    expect(selectRaceMission(ready, 'golden-knot')).toBe(ready)
  })

  it('switches checkpoint count and spawn when selecting a mission on another course', () => {
    const ready = {
      ...makeState('ready'),
      mission: {
        ...makeState('ready').mission,
        status: 'idle' as const,
      },
      persistent: {
        ...makeState('ready').persistent,
        missionGrades: { 'golden-knot': 'bronze' as const },
      },
    }

    const volcanic = selectRaceMission(ready, 'heart-of-sun')
    const skyknot = selectRaceMission(volcanic, 'golden-knot')

    expect(volcanic.config).toMatchObject({
      courseId: 'volcanic-archipelago',
      checkpointCount: 4,
      spawnPosition: { x: -240, y: 34, z: -700 },
    })
    expect(volcanic.run).toMatchObject({
      nextCheckpointIndex: 0,
      position: { x: -240, y: 34, z: -700 },
    })
    expect(skyknot.config).toMatchObject({
      courseId: 'skyknot',
      checkpointCount: 12,
      spawnPosition: { x: 0, y: 8, z: 0 },
    })
  })

  it('changes to an unlocked mission from pause by abandoning only the attempt', () => {
    const paused = makeState('paused')
    const changed = selectRaceMission(paused, 'boost-mastery')

    expect(changed).toMatchObject({
      phase: 'ready',
      pausedFrom: null,
      mission: {
        selectedMissionId: 'boost-mastery',
        status: 'idle',
        attempt: {
          elapsedMs: 0,
          nextCheckpointIndex: 0,
          finished: false,
        },
        result: null,
      },
    })
    expect(changed.persistent).toBe(paused.persistent)
  })

  it('moves a successful result to the newly unlocked next mission without starting', () => {
    const finished = makeState('finished')
    const next = selectNextRaceMission(finished)

    expect(next).toMatchObject({
      phase: 'ready',
      mission: {
        selectedMissionId: 'boost-mastery',
        status: 'idle',
      },
    })
    expect(next.persistent).toBe(finished.persistent)
  })

  it('has no next-mission transition after failure or final completion', () => {
    const failed = {
      ...makeState('finished'),
      mission: {
        ...makeState('finished').mission,
        result: {
          success: false,
          grade: 'failed' as const,
          unmetCriteria: ['boost-count' as const],
        },
      },
    }
    const final = {
      ...makeState('finished'),
      mission: {
        ...makeState('finished').mission,
        selectedMissionId: 'heart-of-sun' as const,
      },
      persistent: {
        ...makeState('finished').persistent,
        missionGrades: {
          'first-skyknot': 'gold' as const,
          'boost-mastery': 'gold' as const,
          'no-respawn': 'gold' as const,
          'time-trial': 'gold' as const,
          'clean-flight': 'gold' as const,
          'golden-knot': 'gold' as const,
          'heart-of-sun': 'gold' as const,
        },
      },
    }

    expect(selectNextRaceMission(failed)).toBe(failed)
    expect(selectNextRaceMission(final)).toBe(final)
  })

  it('starts and retries a clean attempt while preserving mission choice', () => {
    const ready = {
      ...makeState('ready'),
      mission: {
        ...makeState('ready').mission,
        selectedMissionId: 'boost-mastery' as const,
        status: 'idle' as const,
      },
    }
    const countdown = transitionRace(ready, {
      type: 'START',
      input: 'keyboard',
    })
    const finished = {
      ...makeState('finished'),
      mission: {
        ...makeState('finished').mission,
        selectedMissionId: 'boost-mastery' as const,
      },
    }
    const retried = transitionRace(finished, { type: 'RETRY' })

    expect(countdown.mission.status).toBe('active')
    expect(countdown.mission.attempt.elapsedMs).toBe(0)
    expect(retried.mission.selectedMissionId).toBe('boost-mastery')
    expect(retried.mission.attempt.collisionCount).toBe(0)
  })

  it('keeps mission elapsed time synchronized with the race clock', () => {
    const racing = makeState('racing')
    const advanced = advanceRaceClock(racing, 16.5)
    const paused = makeState('paused')

    expect(advanced.mission.attempt.elapsedMs).toBe(42_016.5)
    expect(advanceRaceClock(paused, 100)).toBe(paused)
  })

  it('records validated collision, respawn, and boost events by race phase', () => {
    const racing = makeState('racing')
    const collided = recordRaceCollision(racing)
    const boosted = recordRaceBoostActivation(collided)
    const respawned = recordRaceRespawn(boosted)
    const paused = makeState('paused')
    const ready = makeState('ready')

    expect(respawned.mission.attempt).toMatchObject({
      collisionCount: 1,
      respawnCount: 1,
      boostActivationCount: 1,
    })
    expect(recordRaceCollision(paused)).toBe(paused)
    expect(recordRaceBoostActivation(ready)).toBe(ready)
    expect(
      recordRaceRespawn({ ...makeState('paused'), pausedFrom: 'racing' })
        .mission.attempt.respawnCount,
    ).toBe(1)
  })

  it('evaluates the mission at the final checkpoint and saves only a higher grade', () => {
    const racing = {
      ...withRun(makeState('racing'), {
        elapsedMs: 150_000,
        nextCheckpointIndex: 2,
      }),
      mission: {
        ...makeState('racing').mission,
        selectedMissionId: 'clean-flight' as const,
        attempt: {
          ...makeState('racing').mission.attempt,
          elapsedMs: 150_000,
          nextCheckpointIndex: 2,
          boostActivationCount: 7,
        },
      },
    }
    const finished = recordCheckpointPass(racing, 2)

    expect(finished.phase).toBe('finished')
    expect(finished.mission.result?.grade).toBe('gold')
    expect(finished.mission.attempt.nextCheckpointIndex).toBe(3)
    expect(finished.persistent.missionGrades['clean-flight']).toBe('gold')
    expect(finished.persistent.missionGrades['first-skyknot']).toBe('silver')
  })

  it('returns from results to ready mission selection without losing grades', () => {
    const finished = makeState('finished')
    const ready = transitionRace(finished, { type: 'RETURN_TO_READY' })

    expect(ready.phase).toBe('ready')
    expect(ready.mission.status).toBe('idle')
    expect(ready.persistent.missionGrades).toEqual(
      finished.persistent.missionGrades,
    )
  })

  it('returns a paused mission attempt to ready selection without starting a new race', () => {
    const paused = makeState('paused')
    const ready = transitionRace(paused, { type: 'RETURN_TO_READY' })

    expect(ready).toMatchObject({
      phase: 'ready',
      pausedFrom: null,
      run: {
        countdownRemainingMs: 3_000,
        elapsedMs: 0,
        nextCheckpointIndex: 0,
      },
      mission: {
        selectedMissionId: 'first-skyknot',
        status: 'idle',
        attempt: {
          elapsedMs: 0,
          nextCheckpointIndex: 0,
          finished: false,
        },
        result: null,
      },
    })
    expect(ready.persistent).toBe(paused.persistent)
  })
})
