import { describe, expect, it } from 'vitest'

import {
  MISSION_CATALOG,
  MISSION_IDS,
  evaluateMission,
  mergeBestGrade,
  type MissionAttemptStats,
  type MissionCriterionId,
  type MissionId,
} from './missionRules'

function completed(
  overrides: Partial<MissionAttemptStats> = {},
): MissionAttemptStats {
  return {
    elapsedMs: 200_000,
    nextCheckpointIndex: 12,
    collisionCount: 0,
    respawnCount: 0,
    boostActivationCount: 5,
    finished: true,
    ...overrides,
  }
}

function expectUnmetCriteria(
  missionId: MissionId,
  attempt: MissionAttemptStats,
  expected: readonly MissionCriterionId[],
): void {
  const result = evaluateMission(missionId, attempt)

  expect(result.success).toBe(false)
  expect(new Set(result.unmetCriteria)).toEqual(new Set(expected))
}

describe('mission catalog', () => {
  it('defines the six unique missions in progressive difficulty order', () => {
    expect(MISSION_IDS).toEqual([
      'first-skyknot',
      'boost-mastery',
      'no-respawn',
      'time-trial',
      'clean-flight',
      'golden-knot',
    ])
    expect(new Set(MISSION_IDS).size).toBe(6)
    expect(MISSION_CATALOG.map((mission) => mission.id)).toEqual(MISSION_IDS)
    expect(
      MISSION_CATALOG.every(
        (mission) => mission.name.length > 0 && mission.objective.length > 0,
      ),
    ).toBe(true)
  })
})

describe('mission attempt guards', () => {
  it.each(MISSION_IDS)('fails unfinished attempts for %s', (missionId) => {
    expectUnmetCriteria(missionId, completed({ finished: false }), ['finish'])
  })

  it.each(MISSION_IDS)('fails invalid attempts for %s', (missionId) => {
    expectUnmetCriteria(missionId, completed({ elapsedMs: Number.NaN }), [
      'valid-stats',
    ])
  })
})

describe('first-skyknot evaluation', () => {
  it.each([
    [180_000, 'gold'],
    [180_001, 'silver'],
    [210_000, 'silver'],
    [210_001, 'bronze'],
  ] as const)('grades a %sms finish as %s', (elapsedMs, grade) => {
    expect(
      evaluateMission('first-skyknot', completed({ elapsedMs })).grade,
    ).toBe(grade)
  })
})

describe('boost-mastery evaluation', () => {
  it.each([
    [3, 'bronze'],
    [4, 'bronze'],
    [5, 'silver'],
    [6, 'silver'],
    [7, 'gold'],
  ] as const)('grades %s boost activations as %s', (boostActivationCount, grade) => {
    expect(
      evaluateMission(
        'boost-mastery',
        completed({ boostActivationCount }),
      ).grade,
    ).toBe(grade)
  })

  it('reports a missing Bronze boost floor', () => {
    expectUnmetCriteria(
      'boost-mastery',
      completed({ boostActivationCount: 2 }),
      ['boost-count'],
    )
  })
})

describe('no-respawn evaluation', () => {
  it.each([
    [180_000, 7, 'gold'],
    [180_001, 7, 'silver'],
    [180_000, 6, 'silver'],
    [210_000, 5, 'silver'],
    [210_001, 5, 'bronze'],
    [210_000, 4, 'bronze'],
    [999_999, 3, 'bronze'],
  ] as const)(
    'grades %sms with %s boosts as %s',
    (elapsedMs, boostActivationCount, grade) => {
      expect(
        evaluateMission(
          'no-respawn',
          completed({ elapsedMs, boostActivationCount }),
        ).grade,
      ).toBe(grade)
    },
  )

  it('reports both cumulative Bronze failures', () => {
    expectUnmetCriteria(
      'no-respawn',
      completed({ respawnCount: 1, boostActivationCount: 2 }),
      ['respawn-limit', 'boost-count'],
    )
  })
})

describe('time-trial evaluation', () => {
  it.each([
    [150_000, 7, 'gold'],
    [150_001, 7, 'silver'],
    [150_000, 6, 'silver'],
    [165_000, 5, 'silver'],
    [165_001, 5, 'bronze'],
    [165_000, 4, 'bronze'],
    [210_000, 3, 'bronze'],
  ] as const)(
    'grades %sms with %s boosts as %s',
    (elapsedMs, boostActivationCount, grade) => {
      expect(
        evaluateMission(
          'time-trial',
          completed({ elapsedMs, boostActivationCount }),
        ).grade,
      ).toBe(grade)
    },
  )

  it('reports every cumulative Bronze failure', () => {
    expectUnmetCriteria(
      'time-trial',
      completed({
        elapsedMs: 210_001,
        respawnCount: 1,
        boostActivationCount: 2,
      }),
      ['time-limit', 'respawn-limit', 'boost-count'],
    )
  })
})

describe('clean-flight evaluation', () => {
  it.each([
    [150_000, 7, 'gold'],
    [150_001, 7, 'silver'],
    [150_000, 6, 'silver'],
    [165_000, 5, 'silver'],
    [165_001, 5, 'bronze'],
    [165_000, 4, 'bronze'],
    [210_000, 3, 'bronze'],
  ] as const)(
    'grades %sms with %s boosts as %s',
    (elapsedMs, boostActivationCount, grade) => {
      expect(
        evaluateMission(
          'clean-flight',
          completed({ elapsedMs, boostActivationCount }),
        ).grade,
      ).toBe(grade)
    },
  )

  it('reports every cumulative Bronze failure', () => {
    expectUnmetCriteria(
      'clean-flight',
      completed({
        elapsedMs: 210_001,
        collisionCount: 1,
        respawnCount: 1,
        boostActivationCount: 2,
      }),
      ['time-limit', 'collision-limit', 'respawn-limit', 'boost-count'],
    )
  })
})

describe('golden-knot evaluation', () => {
  it.each([
    [150_000, 7, 'gold'],
    [150_001, 7, 'silver'],
    [150_000, 6, 'silver'],
    [165_000, 6, 'silver'],
    [165_001, 6, 'bronze'],
    [165_000, 5, 'bronze'],
    [180_000, 5, 'bronze'],
  ] as const)(
    'grades %sms with %s boosts as %s',
    (elapsedMs, boostActivationCount, grade) => {
      expect(
        evaluateMission(
          'golden-knot',
          completed({ elapsedMs, boostActivationCount }),
        ).grade,
      ).toBe(grade)
    },
  )

  it('reports every final Bronze failure', () => {
    expectUnmetCriteria(
      'golden-knot',
      completed({
        elapsedMs: 180_001,
        collisionCount: 1,
        respawnCount: 1,
        boostActivationCount: 4,
      }),
      ['time-limit', 'collision-limit', 'respawn-limit', 'boost-count'],
    )
  })
})

describe('best mission grade', () => {
  it.each([
    [null, 'failed', null],
    [null, 'bronze', 'bronze'],
    ['silver', 'bronze', 'silver'],
    ['bronze', 'gold', 'gold'],
    ['gold', 'silver', 'gold'],
  ] as const)('merges %s and %s as %s', (previous, candidate, expected) => {
    expect(mergeBestGrade(previous, candidate)).toBe(expected)
  })
})
