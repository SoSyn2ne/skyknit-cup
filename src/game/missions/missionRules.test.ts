import { describe, expect, it } from 'vitest'

import {
  MISSION_CATALOG,
  MISSION_IDS,
  evaluateMission,
  mergeBestGrade,
  type MissionAttemptStats,
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

describe('mission catalog', () => {
  it('defines six unique missions in stable order', () => {
    expect(MISSION_IDS).toEqual([
      'first-skyknot',
      'time-trial',
      'clean-flight',
      'no-respawn',
      'boost-mastery',
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

describe('mission evaluation', () => {
  it.each(MISSION_IDS)('fails unfinished attempts for %s', (missionId) => {
    expect(
      evaluateMission(missionId, completed({ finished: false })).grade,
    ).toBe('failed')
  })

  it.each([
    [179_999, 'gold'],
    [180_000, 'gold'],
    [180_001, 'silver'],
    [210_000, 'silver'],
    [210_001, 'bronze'],
  ] as const)('grades first completion at %sms as %s', (elapsedMs, grade) => {
    expect(
      evaluateMission('first-skyknot', completed({ elapsedMs })).grade,
    ).toBe(grade)
  })

  it.each([
    [150_000, 'gold'],
    [150_001, 'silver'],
    [165_000, 'silver'],
    [165_001, 'bronze'],
    [180_000, 'bronze'],
    [180_001, 'failed'],
  ] as const)('grades time trial at %sms as %s', (elapsedMs, grade) => {
    expect(evaluateMission('time-trial', completed({ elapsedMs })).grade).toBe(
      grade,
    )
  })

  it('requires zero collisions before applying clean-flight time grades', () => {
    expect(
      evaluateMission('clean-flight', completed({ collisionCount: 1 })).grade,
    ).toBe('failed')
    expect(
      evaluateMission('clean-flight', completed({ elapsedMs: 180_000 })).grade,
    ).toBe('gold')
    expect(
      evaluateMission('clean-flight', completed({ elapsedMs: 210_000 })).grade,
    ).toBe('silver')
    expect(
      evaluateMission('clean-flight', completed({ elapsedMs: 210_001 })).grade,
    ).toBe('bronze')
  })

  it('requires zero respawns before applying no-respawn time grades', () => {
    expect(
      evaluateMission('no-respawn', completed({ respawnCount: 1 })).grade,
    ).toBe('failed')
    expect(
      evaluateMission('no-respawn', completed({ elapsedMs: 180_000 })).grade,
    ).toBe('gold')
    expect(
      evaluateMission('no-respawn', completed({ elapsedMs: 210_000 })).grade,
    ).toBe('silver')
    expect(
      evaluateMission('no-respawn', completed({ elapsedMs: 210_001 })).grade,
    ).toBe('bronze')
  })

  it.each([
    [2, 'failed'],
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

  it.each([
    [completed({ elapsedMs: 210_000, collisionCount: 1, respawnCount: 1, boostActivationCount: 3 }), 'bronze'],
    [completed({ elapsedMs: 195_000, collisionCount: 0, respawnCount: 1, boostActivationCount: 4 }), 'silver'],
    [completed({ elapsedMs: 180_000, collisionCount: 0, respawnCount: 0, boostActivationCount: 5 }), 'gold'],
    [completed({ elapsedMs: 210_001, collisionCount: 0, respawnCount: 0, boostActivationCount: 5 }), 'failed'],
    [completed({ elapsedMs: 180_000, collisionCount: 2, respawnCount: 0, boostActivationCount: 5 }), 'failed'],
    [completed({ elapsedMs: 180_000, collisionCount: 0, respawnCount: 2, boostActivationCount: 5 }), 'failed'],
    [completed({ elapsedMs: 180_000, collisionCount: 0, respawnCount: 0, boostActivationCount: 2 }), 'failed'],
  ] as const)('grades composite attempt as %s', (attempt, grade) => {
    expect(evaluateMission('golden-knot', attempt).grade).toBe(grade)
  })

  it.each([
    completed({ elapsedMs: Number.NaN }),
    completed({ elapsedMs: Number.POSITIVE_INFINITY }),
    completed({ elapsedMs: -1 }),
    completed({ collisionCount: -1 }),
    completed({ respawnCount: 1.5 }),
    completed({ boostActivationCount: Number.NaN }),
  ])('fails invalid attempt statistics', (attempt) => {
    expect(evaluateMission('first-skyknot', attempt).grade).toBe('failed')
  })

  it('reports unmet criteria for failed attempts', () => {
    const result = evaluateMission(
      'golden-knot',
      completed({ collisionCount: 2, boostActivationCount: 1 }),
    )

    expect(result.success).toBe(false)
    expect(result.unmetCriteria).toContain('collision-limit')
    expect(result.unmetCriteria).toContain('boost-count')
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

  it('accepts every catalog id as a mission id', () => {
    const ids: readonly MissionId[] = MISSION_IDS
    expect(ids).toHaveLength(6)
  })
})
