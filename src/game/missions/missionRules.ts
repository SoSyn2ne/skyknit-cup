import type { RaceCourseId } from '../world/course'

export const MISSION_IDS = [
  'first-skyknot',
  'boost-mastery',
  'no-respawn',
  'time-trial',
  'clean-flight',
  'golden-knot',
  'heart-of-sun',
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
  readonly courseId: RaceCourseId
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
    courseId: 'skyknot',
    name: '첫 하늘매듭',
    objective: '잠든 바람 관문을 순서대로 깨워 첫 매듭의 길을 복원하세요.',
  },
  {
    id: 'boost-mastery',
    courseId: 'skyknot',
    name: '돌풍 조율사',
    objective: '돌풍을 두 번 이상 일으켜 바람실에 힘을 더하고 완주하세요.',
  },
  {
    id: 'no-respawn',
    courseId: 'skyknot',
    name: '끊기지 않는 매듭',
    objective:
      '돌풍을 두 번 이상 일으키고 리스폰 없이 완주해 햇실 한 가닥을 끊김 없이 이으세요.',
  },
  {
    id: 'time-trial',
    courseId: 'skyknot',
    name: '질풍 시간전',
    objective:
      '햇실이 흐려지기 전, 돌풍 2회 이상과 무리스폰으로 1분 40초 안에 완주하세요.',
  },
  {
    id: 'clean-flight',
    courseId: 'skyknot',
    name: '구름 한 점 없이',
    objective:
      '시간·돌풍·무리스폰 조건을 지키고 충돌 없이 날아 햇실을 온전히 보존하세요.',
  },
  {
    id: 'golden-knot',
    courseId: 'skyknot',
    name: '황금 하늘매듭',
    objective:
      '1분 30초 안에 충돌·리스폰 없이 돌풍을 4회 이상 사용해 황금 매듭을 완성하세요.',
  },
  {
    id: 'heart-of-sun',
    courseId: 'volcanic-archipelago',
    name: '태양의 심장',
    objective:
      '세 개의 냉각 봉인을 깨우고 분화가 덮치기 전에 태양의 심장에서 탈출하세요.',
  },
]

export const PLAYABLE_MISSION_IDS: readonly MissionId[] = [
  'first-skyknot',
  'no-respawn',
  'time-trial',
  'clean-flight',
  'golden-knot',
  'heart-of-sun',
] as const

const PLAYABLE_MISSION_SET = new Set<MissionId>(PLAYABLE_MISSION_IDS)

export const PLAYABLE_MISSION_CATALOG: readonly MissionDefinition[] =
  MISSION_CATALOG.filter((mission) => PLAYABLE_MISSION_SET.has(mission.id))

function getPlayableMissionProgressIndex(missionId: MissionId): number {
  if (missionId === 'boost-mastery') {
    return 0
  }

  return PLAYABLE_MISSION_IDS.indexOf(missionId)
}

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
    silver: { maxElapsedMs: 100_000 },
    gold: { maxElapsedMs: 90_000 },
  },
  'boost-mastery': {
    bronze: { minBoostActivationCount: 2 },
    silver: { minBoostActivationCount: 4 },
    gold: { minBoostActivationCount: 5 },
  },
  'no-respawn': {
    bronze: { maxRespawnCount: 0, minBoostActivationCount: 2 },
    silver: {
      maxElapsedMs: 100_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 4,
    },
    gold: {
      maxElapsedMs: 90_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
  },
  'time-trial': {
    bronze: {
      maxElapsedMs: 100_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 2,
    },
    silver: {
      maxElapsedMs: 85_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 4,
    },
    gold: {
      maxElapsedMs: 75_000,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
  },
  'clean-flight': {
    bronze: {
      maxElapsedMs: 100_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 2,
    },
    silver: {
      maxElapsedMs: 85_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 4,
    },
    gold: {
      maxElapsedMs: 75_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
  },
  'golden-knot': {
    bronze: {
      maxElapsedMs: 90_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 4,
    },
    silver: {
      maxElapsedMs: 85_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 5,
    },
    gold: {
      maxElapsedMs: 75_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 6,
    },
  },
  'heart-of-sun': {
    bronze: { maxElapsedMs: 75_000 },
    silver: {
      maxElapsedMs: 60_000,
      maxCollisionCount: 2,
      maxRespawnCount: 1,
    },
    gold: {
      maxElapsedMs: 45_000,
      maxCollisionCount: 0,
      maxRespawnCount: 0,
      minBoostActivationCount: 2,
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

export function getMissionDefinition(
  missionId: MissionId,
): MissionDefinition {
  return MISSION_CATALOG[MISSION_IDS.indexOf(missionId)]
}

export function deriveUnlockedMissionIds(
  grades: Readonly<Record<string, unknown>>,
): readonly MissionId[] {
  let highestAwardedMissionIndex = -1

  MISSION_IDS.forEach((missionId) => {
    if (isAwardedMissionGrade(grades[missionId])) {
      highestAwardedMissionIndex = Math.max(
        highestAwardedMissionIndex,
        getPlayableMissionProgressIndex(missionId),
      )
    }
  })

  const unlockedCount = Math.min(
    PLAYABLE_MISSION_IDS.length,
    Math.max(1, highestAwardedMissionIndex + 2),
  )
  return PLAYABLE_MISSION_IDS.slice(0, unlockedCount)
}

export function getNextMissionId(missionId: MissionId): MissionId | null {
  if (missionId === 'boost-mastery') {
    return 'no-respawn'
  }

  const nextMissionIndex = getPlayableMissionProgressIndex(missionId) + 1
  return PLAYABLE_MISSION_IDS[nextMissionIndex] ?? null
}

export function getMissionLockRequirement(
  missionId: MissionId,
): string | null {
  const missionIndex = getPlayableMissionProgressIndex(missionId)
  if (missionIndex <= 0) {
    return null
  }

  return `${PLAYABLE_MISSION_CATALOG[missionIndex - 1].name} 브론즈 달성 필요`
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
