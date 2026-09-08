import { describe, expect, it } from 'vitest'

import {
  isExplorationVolcanicHazardRegionActive,
  selectRaceHudTransientNotice,
  sampleExplorationVolcanicHazardStep,
  stepExplorationVolcanicHazardClock,
} from './createRenderer'
import {
  ROCKFALL_TELEGRAPH_MS,
  VOLCANIC_HAZARD_STEP_MS,
  getVolcanicHazardCollisionObstacles,
  sampleVolcanicHazards,
} from './world/volcanicHazards'

describe('exploration volcanic hazard runtime seam', () => {
  it('keeps hazards dormant when the nearest volcanic region is unloaded', () => {
    expect(
      isExplorationVolcanicHazardRegionActive(
        'volcanic-archipelago',
        ['festival-hub'],
      ),
    ).toBe(false)
    expect(
      isExplorationVolcanicHazardRegionActive(
        'volcanic-archipelago',
        ['festival-hub', 'volcanic-archipelago'],
      ),
    ).toBe(true)
    expect(
      isExplorationVolcanicHazardRegionActive(
        'festival-hub',
        ['festival-hub', 'volcanic-archipelago'],
      ),
    ).toBe(false)
  })

  it('starts a local telegraph when entering at a globally active hazard time', () => {
    const globallyActiveFrame = sampleVolcanicHazards(
      ROCKFALL_TELEGRAPH_MS,
      333,
    )
    expect(getVolcanicHazardCollisionObstacles(globallyActiveFrame)).not.toEqual(
      [],
    )

    const entered = stepExplorationVolcanicHazardClock(
      { elapsedSeconds: 0, active: false },
      {
        insideRegion: true,
        simulationActive: true,
        fixedStepSeconds: VOLCANIC_HAZARD_STEP_MS / 1_000,
      },
    )
    const localFrame = sampleVolcanicHazards(
      entered.clock.elapsedSeconds * 1_000,
      333,
    )

    expect(entered.resetEvents).toBe(true)
    expect(entered.clock.active).toBe(true)
    expect(entered.clock.elapsedSeconds).toBeCloseTo(
      VOLCANIC_HAZARD_STEP_MS / 1_000,
    )
    expect(getVolcanicHazardCollisionObstacles(localFrame)).toEqual([])
  })

  it('clears the local timeline and event state on leave and re-entry', () => {
    const left = stepExplorationVolcanicHazardClock(
      {
        elapsedSeconds: ROCKFALL_TELEGRAPH_MS / 1_000,
        active: true,
      },
      {
        insideRegion: false,
        simulationActive: true,
        fixedStepSeconds: VOLCANIC_HAZARD_STEP_MS / 1_000,
      },
    )
    const reentered = stepExplorationVolcanicHazardClock(left.clock, {
      insideRegion: true,
      simulationActive: true,
      fixedStepSeconds: VOLCANIC_HAZARD_STEP_MS / 1_000,
    })

    expect(left).toEqual({
      clock: { elapsedSeconds: 0, active: false },
      resetEvents: true,
    })
    expect(reentered.resetEvents).toBe(true)
    expect(reentered.clock.elapsedSeconds).toBeCloseTo(
      VOLCANIC_HAZARD_STEP_MS / 1_000,
    )
    expect(
      getVolcanicHazardCollisionObstacles(
        sampleVolcanicHazards(reentered.clock.elapsedSeconds * 1_000, 333),
      ),
    ).toEqual([])
  })

  it('preserves a recovered in-region clock while simulation is inactive', () => {
    const recovered = {
      elapsedSeconds: 1.25,
      active: true,
    } as const
    const paused = stepExplorationVolcanicHazardClock(recovered, {
      insideRegion: true,
      simulationActive: false,
      fixedStepSeconds: VOLCANIC_HAZARD_STEP_MS / 1_000,
    })
    const resumed = stepExplorationVolcanicHazardClock(paused.clock, {
      insideRegion: true,
      simulationActive: true,
      fixedStepSeconds: VOLCANIC_HAZARD_STEP_MS / 1_000,
    })

    expect(paused).toEqual({ clock: recovered, resetEvents: false })
    expect(resumed.resetEvents).toBe(false)
    expect(resumed.clock.active).toBe(true)
    expect(resumed.clock.elapsedSeconds).toBeCloseTo(
      recovered.elapsedSeconds + VOLCANIC_HAZARD_STEP_MS / 1_000,
    )
  })

  it('samples the end of the fixed step and deduplicates collision events', () => {
    const seed = 333
    const endFrame = sampleVolcanicHazards(ROCKFALL_TELEGRAPH_MS, seed)
    const obstacle = getVolcanicHazardCollisionObstacles(endFrame)[0]
    expect(obstacle).toBeDefined()

    const currentSimulationSeconds =
      (ROCKFALL_TELEGRAPH_MS - VOLCANIC_HAZARD_STEP_MS) / 1_000
    const query = {
      previous: { ...obstacle.center },
      current: { ...obstacle.center },
      movingRadius: 1.2,
      handledEventKeys: [] as readonly string[],
    }
    const first = sampleExplorationVolcanicHazardStep(
      currentSimulationSeconds,
      VOLCANIC_HAZARD_STEP_MS / 1_000,
      seed,
      {},
      query,
    )
    const repeated = sampleExplorationVolcanicHazardStep(
      currentSimulationSeconds,
      VOLCANIC_HAZARD_STEP_MS / 1_000,
      seed,
      {},
      {
        ...query,
        handledEventKeys: first.collision.handledEventKeys,
      },
    )

    expect(first.frame.elapsedMs).toBeCloseTo(ROCKFALL_TELEGRAPH_MS)
    expect(first.collision.hit?.eventKey).toBe(obstacle.eventKey)
    expect(repeated.collision.hit).toBeNull()
  })
})

describe('race HUD transient notice selection', () => {
  it('prioritizes respawn over collision and off-course recovery', () => {
    expect(selectRaceHudTransientNotice(0.9, 0.85, 1.2)).toEqual({
      kind: 'respawn',
    })
    expect(selectRaceHudTransientNotice(0.9, 0, 1.2)).toEqual({
      kind: 'collision',
    })
    expect(selectRaceHudTransientNotice(0.9, 0, 0)).toEqual({
      kind: 'off-course',
    })
    expect(selectRaceHudTransientNotice(0, 0, 0)).toBeNull()
  })
})
