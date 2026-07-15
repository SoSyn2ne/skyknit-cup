import {
  transitionRace,
  type RaceState,
  type RaceVector,
} from '../race/raceState'
import { cloneMissionSession } from '../missions/missionState'
import { cloneSkyLeagueRecords } from '../competition/skyLeagueRecords'
import { cloneSkyLeagueGhosts } from '../persistence/records'

function cloneVector(vector: RaceVector): RaceVector {
  return { x: vector.x, y: vector.y, z: vector.z }
}

export function prepareRaceForRecovery(state: RaceState): RaceState {
  const paused =
    state.phase === 'countdown' || state.phase === 'racing'
      ? transitionRace(state, { type: 'PAUSE' })
      : state

  return {
    ...paused,
    run: {
      ...paused.run,
      position: cloneVector(paused.run.position),
      velocity: cloneVector(paused.run.velocity),
      temporaryEffects: [...paused.run.temporaryEffects],
    },
    mission: cloneMissionSession(paused.mission),
    persistent: {
      ...paused.persistent,
      characterLoadout: { ...paused.persistent.characterLoadout },
      missionGrades: { ...paused.persistent.missionGrades },
      coinBestTimesMs: { ...paused.persistent.coinBestTimesMs },
      skyLeague: cloneSkyLeagueRecords(paused.persistent.skyLeague),
      ghosts: cloneSkyLeagueGhosts(paused.persistent.ghosts),
    },
    config: {
      ...paused.config,
      spawnPosition: cloneVector(paused.config.spawnPosition),
    },
  }
}
