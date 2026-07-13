import { findSweptSphereCollision } from '../collision/obstacleCollision'
import type { Vec3Value } from '../flight/flightModel'
import type { OpenWorldRegionId } from '../world/openWorldRegions'
import { COIN_COURSES, getCoinCourse } from './coinCourses'

export type CoinRunPhase = 'idle' | 'running' | 'completed'

export interface CoinRunState {
  readonly phase: CoinRunPhase
  readonly regionId: OpenWorldRegionId | null
  readonly collectedCount: number
  readonly elapsedMs: number
  readonly finalElapsedMs: number | null
  readonly retryRemainingMs: number
}

export interface CoinRunStepResult {
  readonly state: CoinRunState
  readonly collectedCoinId: string | null
  readonly completedRegionId: OpenWorldRegionId | null
  readonly completedTimeMs: number | null
}

export const COIN_RETRY_DELAY_MS = 3_000
export const COIN_RUN_CANCEL_RADIUS = 500
const DRAGON_PICKUP_RADIUS = 1.1

export function createCoinRunState(): CoinRunState {
  return {
    phase: 'idle',
    regionId: null,
    collectedCount: 0,
    elapsedMs: 0,
    finalElapsedMs: null,
    retryRemainingMs: 0,
  }
}

function result(
  state: CoinRunState,
  collectedCoinId: string | null = null,
  completedRegionId: OpenWorldRegionId | null = null,
  completedTimeMs: number | null = null,
): CoinRunStepResult {
  return {
    state,
    collectedCoinId,
    completedRegionId,
    completedTimeMs,
  }
}

function crossedCoin(
  previous: Vec3Value,
  current: Vec3Value,
  coin: { readonly id: string; readonly position: Vec3Value; readonly radius: number },
): boolean {
  return (
    findSweptSphereCollision(previous, current, DRAGON_PICKUP_RADIUS, [
      { id: coin.id, center: coin.position, radius: coin.radius },
    ]) !== null
  )
}

function outsideCourse(
  position: Vec3Value,
  center: Vec3Value,
): boolean {
  return (
    Math.hypot(position.x - center.x, position.z - center.z) >
    COIN_RUN_CANCEL_RADIUS
  )
}

export function stepCoinRun(
  state: CoinRunState,
  previous: Vec3Value,
  current: Vec3Value,
  dtMs: number,
): CoinRunStepResult {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return result(state)

  if (state.phase === 'completed') {
    const retryRemainingMs = Math.max(0, state.retryRemainingMs - dtMs)
    return retryRemainingMs === 0
      ? result(createCoinRunState())
      : result({ ...state, retryRemainingMs })
  }

  if (state.phase === 'idle') {
    for (const course of COIN_COURSES) {
      const firstCoin = course.coins[0]
      if (!crossedCoin(previous, current, firstCoin)) continue
      return result(
        {
          phase: 'running',
          regionId: course.regionId,
          collectedCount: 1,
          elapsedMs: 0,
          finalElapsedMs: null,
          retryRemainingMs: 0,
        },
        firstCoin.id,
      )
    }
    return result(state)
  }

  if (state.regionId === null) return result(createCoinRunState())
  const course = getCoinCourse(state.regionId)
  if (outsideCourse(current, course.center)) {
    return result(createCoinRunState())
  }

  const elapsedMs = state.elapsedMs + dtMs
  const nextCoin = course.coins[state.collectedCount]
  if (nextCoin === undefined || !crossedCoin(previous, current, nextCoin)) {
    return result({ ...state, elapsedMs })
  }

  const collectedCount = state.collectedCount + 1
  if (collectedCount < course.coins.length) {
    return result(
      { ...state, collectedCount, elapsedMs },
      nextCoin.id,
    )
  }

  return result(
    {
      phase: 'completed',
      regionId: course.regionId,
      collectedCount,
      elapsedMs,
      finalElapsedMs: elapsedMs,
      retryRemainingMs: COIN_RETRY_DELAY_MS,
    },
    nextCoin.id,
    course.regionId,
    elapsedMs,
  )
}
