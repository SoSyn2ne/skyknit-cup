export const MISSION_IDS = [
  'first-skyknot',
  'time-trial',
  'clean-flight',
  'no-respawn',
  'boost-mastery',
  'golden-knot',
] as const

export type MissionId = (typeof MISSION_IDS)[number]
export type MissionGrade = 'failed' | 'bronze' | 'silver' | 'gold'
export type AwardedMissionGrade = Exclude<MissionGrade, 'failed'>
export type MissionCriterionId =
  | 'finish'
  | 'valid-stats'
  | 'time-limit'
  | 'collision-limit'
  | 'respawn-limit'
  | 'boost-count'

export interface MissionDefinition {
  readonly id: MissionId
  readonly name: string
  readonly objective: string
}

export interface MissionAttemptStats {
  readonly elapsedMs: number
  readonly nextCheckpointIndex: number
  readonly collisionCount: number
  readonly respawnCount: number
  readonly boostActivationCount: number
  readonly finished: boolean
}

export interface MissionResult {
  readonly success: boolean
  readonly grade: MissionGrade
  readonly unmetCriteria: readonly MissionCriterionId[]
}

export const MISSION_CATALOG: readonly MissionDefinition[] = [
  {
    id: 'first-skyknot',
    name: '첫 하늘매듭',
    objective: '모든 바람 관문을 순서대로 통과해 완주하세요.',
  },
  {
    id: 'time-trial',
    name: '질풍 시간전',
    objective: '3분 안에 하늘매듭을 완성하세요.',
  },
  {
    id: 'clean-flight',
    name: '구름 한 점 없이',
    objective: '어떤 장애물에도 부딪히지 않고 완주하세요.',
  },
  {
    id: 'no-respawn',
    name: '끊기지 않는 매듭',
    objective: '리스폰 없이 한 번의 비행으로 완주하세요.',
  },
  {
    id: 'boost-mastery',
    name: '돌풍 조율사',
    objective: '돌풍을 세 번 이상 정확히 활성화하고 완주하세요.',
  },
  {
    id: 'golden-knot',
    name: '황금 하늘매듭',
    objective: '시간, 충돌, 리스폰, 돌풍 조건을 함께 달성하세요.',
  },
]

const GRADE_RANK: Readonly<Record<MissionGrade, number>> = {
  failed: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function hasValidStats(stats: MissionAttemptStats): boolean {
  return (
    Number.isFinite(stats.elapsedMs) &&
    stats.elapsedMs >= 0 &&
    isNonNegativeInteger(stats.nextCheckpointIndex) &&
    isNonNegativeInteger(stats.collisionCount) &&
    isNonNegativeInteger(stats.respawnCount) &&
    isNonNegativeInteger(stats.boostActivationCount)
  )
}

function result(
  grade: MissionGrade,
  unmetCriteria: readonly MissionCriterionId[] = [],
): MissionResult {
  return { success: grade !== 'failed', grade, unmetCriteria }
}

function timeGrade(
  elapsedMs: number,
  goldMs: number,
  silverMs: number,
): AwardedMissionGrade {
  if (elapsedMs <= goldMs) {
    return 'gold'
  }
  if (elapsedMs <= silverMs) {
    return 'silver'
  }
  return 'bronze'
}

function evaluateGoldenKnot(stats: MissionAttemptStats): MissionResult {
  if (
    stats.elapsedMs <= 180_000 &&
    stats.collisionCount === 0 &&
    stats.respawnCount === 0 &&
    stats.boostActivationCount >= 5
  ) {
    return result('gold')
  }
  if (
    stats.elapsedMs <= 195_000 &&
    stats.collisionCount === 0 &&
    stats.respawnCount <= 1 &&
    stats.boostActivationCount >= 4
  ) {
    return result('silver')
  }
  if (
    stats.elapsedMs <= 210_000 &&
    stats.collisionCount <= 1 &&
    stats.respawnCount <= 1 &&
    stats.boostActivationCount >= 3
  ) {
    return result('bronze')
  }

  const unmet: MissionCriterionId[] = []
  if (stats.elapsedMs > 210_000) unmet.push('time-limit')
  if (stats.collisionCount > 1) unmet.push('collision-limit')
  if (stats.respawnCount > 1) unmet.push('respawn-limit')
  if (stats.boostActivationCount < 3) unmet.push('boost-count')
  return result('failed', unmet)
}

export function evaluateMission(
  missionId: MissionId,
  stats: MissionAttemptStats,
): MissionResult {
  if (!hasValidStats(stats)) {
    return result('failed', ['valid-stats'])
  }
  if (!stats.finished) {
    return result('failed', ['finish'])
  }

  switch (missionId) {
    case 'first-skyknot':
      return result(timeGrade(stats.elapsedMs, 180_000, 210_000))
    case 'time-trial':
      return stats.elapsedMs <= 180_000
        ? result(timeGrade(stats.elapsedMs, 150_000, 165_000))
        : result('failed', ['time-limit'])
    case 'clean-flight':
      return stats.collisionCount === 0
        ? result(timeGrade(stats.elapsedMs, 180_000, 210_000))
        : result('failed', ['collision-limit'])
    case 'no-respawn':
      return stats.respawnCount === 0
        ? result(timeGrade(stats.elapsedMs, 180_000, 210_000))
        : result('failed', ['respawn-limit'])
    case 'boost-mastery':
      if (stats.boostActivationCount >= 7) return result('gold')
      if (stats.boostActivationCount >= 5) return result('silver')
      if (stats.boostActivationCount >= 3) return result('bronze')
      return result('failed', ['boost-count'])
    case 'golden-knot':
      return evaluateGoldenKnot(stats)
  }
}

export function mergeBestGrade(
  previous: AwardedMissionGrade | null,
  candidate: MissionGrade,
): AwardedMissionGrade | null {
  if (candidate === 'failed') {
    return previous
  }
  return previous === null || GRADE_RANK[candidate] > GRADE_RANK[previous]
    ? candidate
    : previous
}

export function isMissionId(value: unknown): value is MissionId {
  return typeof value === 'string' && MISSION_IDS.includes(value as MissionId)
}

export function isAwardedMissionGrade(
  value: unknown,
): value is AwardedMissionGrade {
  return value === 'bronze' || value === 'silver' || value === 'gold'
}
