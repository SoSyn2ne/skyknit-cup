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
    nextCheckpointIndex: 8,
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
  it('defines seven unique missions in progressive difficulty order', () => {
    expect(MISSION_IDS).toEqual([
      'first-skyknot',
      'boost-mastery',
      'no-respawn',
      'time-trial',
      'clean-flight',
      'golden-knot',
      'heart-of-sun',
    ])
    expect(new Set(MISSION_IDS).size).toBe(7)
    expect(MISSION_CATALOG.map((mission) => mission.id)).toEqual(MISSION_IDS)
    expect(
      MISSION_CATALOG.every(
        (mission) => mission.name.length > 0 && mission.objective.length > 0,
      ),
    ).toBe(true)
    expect(MISSION_CATALOG.map((mission) => mission.courseId)).toEqual([
      'skyknot',
      'skyknot',
      'skyknot',
      'skyknot',
      'skyknot',
      'skyknot',
      'volcanic-archipelago',
    ])
  })

  it('frames every objective as a step in restoring the first sky knot', () => {
    expect(MISSION_CATALOG.map((mission) => mission.objective)).toEqual([
      '잠든 바람 관문을 순서대로 깨워 첫 매듭의 길을 복원하세요.',
      '돌풍을 세 번 이상 일으켜 바람실에 힘을 더하고 완주하세요.',
      '돌풍을 세 번 이상 일으키고 리스폰 없이 완주해 햇실 한 가닥을 끊김 없이 이으세요.',
      '햇실이 흐려지기 전, 돌풍 3회 이상과 무리스폰으로 2분 15초 안에 완주하세요.',
      '시간·돌풍·무리스폰 조건을 지키고 충돌 없이 날아 햇실을 온전히 보존하세요.',
      '2분 안에 충돌·리스폰 없이 돌풍을 5회 이상 사용해 황금 매듭을 완성하세요.',
      '세 개의 냉각 봉인을 깨우고 분화가 덮치기 전에 태양의 심장에서 탈출하세요.',
    ])
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
    [120_000, 'gold'],
    [120_001, 'silver'],
    [135_000, 'silver'],
    [135_001, 'bronze'],
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
    [120_000, 7, 'gold'],
    [120_001, 7, 'silver'],
    [120_000, 6, 'silver'],
    [135_000, 5, 'silver'],
    [135_001, 5, 'bronze'],
    [135_000, 4, 'bronze'],
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
    [95_000, 7, 'gold'],
    [95_001, 7, 'silver'],
    [95_000, 6, 'silver'],
    [110_000, 5, 'silver'],
    [110_001, 5, 'bronze'],
    [110_000, 4, 'bronze'],
    [135_000, 3, 'bronze'],
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
        elapsedMs: 135_001,
        respawnCount: 1,
        boostActivationCount: 2,
      }),
      ['time-limit', 'respawn-limit', 'boost-count'],
    )
  })
})

describe('clean-flight evaluation', () => {
  it.each([
    [95_000, 7, 'gold'],
    [95_001, 7, 'silver'],
    [95_000, 6, 'silver'],
    [110_000, 5, 'silver'],
    [110_001, 5, 'bronze'],
    [110_000, 4, 'bronze'],
    [135_000, 3, 'bronze'],
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
        elapsedMs: 135_001,
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
    [95_000, 7, 'gold'],
    [95_001, 7, 'silver'],
    [95_000, 6, 'silver'],
    [110_000, 6, 'silver'],
    [110_001, 6, 'bronze'],
    [110_000, 5, 'bronze'],
    [120_000, 5, 'bronze'],
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
        elapsedMs: 120_001,
        collisionCount: 1,
        respawnCount: 1,
        boostActivationCount: 4,
      }),
      ['time-limit', 'collision-limit', 'respawn-limit', 'boost-count'],
    )
  })
})

describe('heart-of-sun evaluation', () => {
  it.each([
    [45_000, 0, 0, 2, 'gold'],
    [45_000, 0, 0, 1, 'silver'],
    [45_001, 0, 0, 2, 'silver'],
    [60_000, 2, 1, 0, 'silver'],
    [60_001, 0, 0, 2, 'bronze'],
    [75_000, 99, 99, 0, 'bronze'],
  ] as const)(
    'grades %sms, %s collisions, %s respawns, and %s boosts as %s',
    (
      elapsedMs,
      collisionCount,
      respawnCount,
      boostActivationCount,
      grade,
    ) => {
      expect(
        evaluateMission(
          'heart-of-sun',
          completed({
            elapsedMs,
            nextCheckpointIndex: 4,
            collisionCount,
            respawnCount,
            boostActivationCount,
          }),
        ).grade,
      ).toBe(grade)
    },
  )

  it('reports a missed eruption deadline as a failed attempt', () => {
    expectUnmetCriteria(
      'heart-of-sun',
      completed({ elapsedMs: 75_001, nextCheckpointIndex: 4 }),
      ['time-limit'],
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
