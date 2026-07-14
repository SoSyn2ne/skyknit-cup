import { describe, expect, it } from 'vitest'

import { COIN_COURSES } from './coinCourses'
import {
  COIN_RETRY_DELAY_MS,
  createCoinRunState,
  getCoinRunTarget,
  stepCoinRun,
} from './coinRun'

const FESTIVAL = COIN_COURSES[0]

function crossCoin(index: number, margin = 1) {
  const coin = FESTIVAL.coins[index]
  return {
    previous: {
      x: coin.position.x - coin.radius - margin,
      y: coin.position.y,
      z: coin.position.z,
    },
    current: {
      x: coin.position.x + coin.radius + margin,
      y: coin.position.y,
      z: coin.position.z,
    },
  }
}

describe('sky-coin run rules', () => {
  it('selects one current-region target when loaded regions overlap', () => {
    expect(
      getCoinRunTarget(
        createCoinRunState(),
        'cloud-ruins',
        ['festival-hub', 'cloud-ruins'],
      )?.id,
    ).toBe('cloud-ruins-coin-1')

    expect(
      getCoinRunTarget(
        {
          phase: 'running',
          regionId: 'festival-hub',
          collectedCount: 1,
          elapsedMs: 500,
          finalElapsedMs: null,
          retryRemainingMs: 0,
        },
        'cloud-ruins',
        ['festival-hub', 'cloud-ruins'],
      )?.id,
    ).toBe('festival-hub-coin-2')
  })

  it('starts at coin one with a zero timer and ignores a later coin', () => {
    const idle = createCoinRunState()
    const wrong = crossCoin(1)
    expect(stepCoinRun(idle, wrong.previous, wrong.current, 16).state).toBe(
      idle,
    )

    const first = crossCoin(0)
    const result = stepCoinRun(idle, first.previous, first.current, 16)
    expect(result).toMatchObject({
      collectedCoinId: FESTIVAL.coins[0].id,
      completedRegionId: null,
      completedTimeMs: null,
      state: {
        phase: 'running',
        regionId: 'festival-hub',
        collectedCount: 1,
        elapsedMs: 0,
      },
    })
  })

  it('collects the active coin with a high-speed segment and advances time', () => {
    const first = crossCoin(0, 80)
    const state = stepCoinRun(
      createCoinRunState(),
      first.previous,
      first.current,
      16,
    ).state
    const second = crossCoin(1, 80)
    const result = stepCoinRun(
      state,
      second.previous,
      second.current,
      250,
    )

    expect(result.collectedCoinId).toBe(FESTIVAL.coins[1].id)
    expect(result.state.collectedCount).toBe(2)
    expect(result.state.elapsedMs).toBe(250)
  })

  it('freezes for invalid or paused-equivalent time deltas', () => {
    const first = crossCoin(0)
    const running = stepCoinRun(
      createCoinRunState(),
      first.previous,
      first.current,
      16,
    ).state
    const second = crossCoin(1)

    expect(stepCoinRun(running, second.previous, second.current, 0).state).toBe(
      running,
    )
    expect(
      stepCoinRun(running, second.previous, second.current, Number.NaN).state,
    ).toBe(running)
  })

  it('completes after coin ten and resets for retry after three seconds', () => {
    const first = crossCoin(0)
    let state = stepCoinRun(
      createCoinRunState(),
      first.previous,
      first.current,
      16,
    ).state

    let completion = stepCoinRun(state, first.previous, first.current, 1)
    for (let index = 1; index < FESTIVAL.coins.length; index += 1) {
      const crossing = crossCoin(index)
      completion = stepCoinRun(
        state,
        crossing.previous,
        crossing.current,
        100,
      )
      state = completion.state
    }

    expect(completion).toMatchObject({
      completedRegionId: 'festival-hub',
      completedTimeMs: 900,
      state: {
        phase: 'completed',
        collectedCount: 10,
        elapsedMs: 900,
        finalElapsedMs: 900,
        retryRemainingMs: COIN_RETRY_DELAY_MS,
      },
    })

    const almostReady = stepCoinRun(
      completion.state,
      FESTIVAL.center,
      FESTIVAL.center,
      COIN_RETRY_DELAY_MS - 1,
    ).state
    expect(almostReady.phase).toBe('completed')
    expect(
      stepCoinRun(almostReady, FESTIVAL.center, FESTIVAL.center, 1).state,
    ).toEqual(createCoinRunState())
  })

  it('cancels only the active attempt after leaving its region', () => {
    const first = crossCoin(0)
    const running = stepCoinRun(
      createCoinRunState(),
      first.previous,
      first.current,
      16,
    ).state
    const outside = {
      ...FESTIVAL.center,
      x: FESTIVAL.center.x + 501,
    }

    expect(stepCoinRun(running, FESTIVAL.center, outside, 100).state).toEqual(
      createCoinRunState(),
    )
  })
})
