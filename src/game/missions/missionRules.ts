export const MISSION_IDS = [
  'first-skyknot',
  'boost-mastery',
  'no-respawn',
  'time-trial',
  'clean-flight',
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
    id: 'boost-mastery',
    name: '돌풍 조율사',
    objective: '돌풍을 세 번 이상 활성화하고 완주하세요.',
  },
  {
    id: 'no-respawn',
    name: '끊기지 않는 매듭',
    objective: '돌풍을 세 번 이상 활성화하고 리스폰 없이 완주하세요.',
  },
  {
    id: 'time-trial',
    name: '질풍 시간전',
    objective: '돌풍 3회 이상, 리스폰 없이 3분 30초 안에 완주하세요.',
  },
  {
    id: 'clean-flight',
    name: '구름 한 점 없이',
    objective: '시간·돌풍·무리스폰 조건을 지키며 충돌 없이 완주하세요.',
  },
  {
    id: 'golden-knot',
    name: '황금 하늘매듭',
    objective: '3분 안에 충돌·리스폰 없이 돌풍을 5회 이상 쓰세요.',
  },
]

interface MissionThreshold {
  readonly maxElapsedMs?: number
  readonly maxCollisionCount?: number
  readonly maxRespawnCount?: number
  readonly minBoostActivationCount?: number
}

interface MissionGradeThresholds {
  readonly bronze: MissionThreshold
  readonly silver: MissionThreshold
  readonly gold: MissionThreshold
}

const MISSION_GRADE_THRESHOLDS: Readonly<
  Record<MissionId, MissionGradeThresholds>
> = {
  'first-skyknot': {
    bronze: {},
    silver: { maxElapsedMs: 210_000 },
    gold: { maxElapsedMs: 180_000 },
  },
  'boost-mastery': {
    bronze: { minBoostActivationCount: 3 },
    silver: { minBoostActivationCount: 5 },
    gold: { minBoostActivationCount: 7 },
  },
  'no-respawn': {
    bronze: { maxRespawnCount: 0, minBoostActivationCount: 3 },
    silver: {
      maxElapsedMs: 210_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
    gold: {
      maxElapsedMs: 180_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 7,
    },
  },
  'time-trial': {
    bronze: {
      maxElapsedMs: 210_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 3,
    },
    silver: {
      maxElapsedMs: 165_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
    gold: {
      maxElapsedMs: 150_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 7,
    },
  },
  'clean-flight': {
    bronze: {
      maxElapsedMs: 210_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 3,
    },
    silver: {
      maxElapsedMs: 165_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
    gold: {
      maxElapsedMs: 150_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 7,
    },
  },
  'golden-knot': {
    bronze: {
      maxElapsedMs: 180_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
    silver: {
      maxElapsedMs: 165_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 6,
    },
    gold: {
      maxElapsedMs: 150_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 7,
    },
  },
}

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

function collectUnmetCriteria(
  stats: MissionAttemptStats,
  threshold: MissionThreshold,
): MissionCriterionId[] {
  const unmet: MissionCriterionId[] = []
  if (
    threshold.maxElapsedMs !== undefined &&
    stats.elapsedMs > threshold.maxElapsedMs
  ) {
    unmet.push('time-limit')
  }
  if (
    threshold.maxCollisionCount !== undefined &&
    stats.collisionCount > threshold.maxCollisionCount
  ) {
    unmet.push('collision-limit')
  }
  if (
    threshold.maxRespawnCount !== undefined &&
    stats.respawnCount > threshold.maxRespawnCount
  ) {
    unmet.push('respawn-limit')
  }
  if (
    threshold.minBoostActivationCount !== undefined &&
    stats.boostActivationCount < threshold.minBoostActivationCount
  ) {
    unmet.push('boost-count')
  }
  return unmet
}

function meetsThreshold(
  stats: MissionAttemptStats,
  threshold: MissionThreshold,
): boolean {
  return collectUnmetCriteria(stats, threshold).length === 0
}

function evaluateThresholds(
  stats: MissionAttemptStats,
  thresholds: MissionGradeThresholds,
): MissionResult {
  const unmetBronzeCriteria = collectUnmetCriteria(stats, thresholds.bronze)
  if (unmetBronzeCriteria.length > 0) {
    return result('failed', unmetBronzeCriteria)
  }
  if (meetsThreshold(stats, thresholds.gold)) {
    return result('gold')
  }
  if (meetsThreshold(stats, thresholds.silver)) {
    return result('silver')
  }
  return result('bronze')
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

  return evaluateThresholds(stats, MISSION_GRADE_THRESHOLDS[missionId])
}

export function deriveUnlockedMissionIds(
  grades: Readonly<Record<string, unknown>>,
): readonly MissionId[] {
  let highestAwardedMissionIndex = -1

  MISSION_IDS.forEach((missionId, missionIndex) => {
    if (isAwardedMissionGrade(grades[missionId])) {
      highestAwardedMissionIndex = missionIndex
    }
  })

  const unlockedCount = Math.min(
    MISSION_IDS.length,
    Math.max(1, highestAwardedMissionIndex + 2),
  )
  return MISSION_IDS.slice(0, unlockedCount)
}

export function getNextMissionId(missionId: MissionId): MissionId | null {
  const nextMissionIndex = MISSION_IDS.indexOf(missionId) + 1
  return MISSION_IDS[nextMissionIndex] ?? null
}

export function getMissionLockRequirement(
  missionId: MissionId,
): string | null {
  const missionIndex = MISSION_IDS.indexOf(missionId)
  if (missionIndex <= 0) {
    return null
  }

  return `${MISSION_CATALOG[missionIndex - 1].name} 브론즈 달성 필요`
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
