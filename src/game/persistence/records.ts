import type { Vec3Value } from '../flight/flightModel'
import {
  isAwardedMissionGrade,
  isMissionId,
  type AwardedMissionGrade,
  type MissionId,
} from '../missions/missionRules'
import {
  isOpenWorldRegionId,
  type OpenWorldRegionId,
} from '../world/openWorldRegions'
import {
  isFestivalHubLandmarkId,
  isFestivalHubWindZoneId,
  type FestivalHubLandmarkId,
  type FestivalHubWindZoneId,
} from '../world/festivalHubActivities'

export interface RecordStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type QualityPreference = 'auto' | 'low' | 'high'
export type MissionGrades = Partial<Record<MissionId, AwardedMissionGrade>>
export type CoinBestTimes = Partial<Record<OpenWorldRegionId, number>>

export interface ExplorationProgress {
  readonly position: Vec3Value
  readonly headingRadians: number
  readonly movement: 'airborne' | 'landed'
  readonly discoveredRegionIds: readonly OpenWorldRegionId[]
  readonly destinationRegionId: OpenWorldRegionId | null
  readonly discoveredLandmarkIds: readonly FestivalHubLandmarkId[]
  readonly traversedWindZoneIds: readonly FestivalHubWindZoneId[]
}

export interface GameSettings {
  readonly bestTimeMs: number | null
  readonly muted: boolean
  readonly musicVolume: number
  readonly quality: QualityPreference
  readonly missionGrades: Readonly<MissionGrades>
  readonly coinBestTimesMs: Readonly<CoinBestTimes>
  readonly exploration: ExplorationProgress
}

interface StoredSettings extends GameSettings {
  readonly version: 7
}

interface LegacyStoredRecord {
  readonly version: 1
  readonly bestTimeMs: number
}

export const SETTINGS_KEY = 'skyknit-cup:settings'
const LEGACY_RECORD_KEY = 'skyknit-cup:best-time'

export const DEFAULT_SETTINGS: GameSettings = {
  bestTimeMs: null,
  muted: false,
  musicVolume: 0.35,
  quality: 'auto',
  missionGrades: {},
  coinBestTimesMs: {},
  exploration: {
    position: { x: 0, y: 18, z: 20 },
    headingRadians: 0,
    movement: 'airborne',
    discoveredRegionIds: ['festival-hub'],
    destinationRegionId: null,
    discoveredLandmarkIds: [],
    traversedWindZoneIds: [],
  },
}

function freshDefaults(): GameSettings {
  return {
    ...DEFAULT_SETTINGS,
    missionGrades: {},
    coinBestTimesMs: {},
    exploration: {
      ...DEFAULT_SETTINGS.exploration,
      position: { ...DEFAULT_SETTINGS.exploration.position },
      discoveredRegionIds: [
        ...DEFAULT_SETTINGS.exploration.discoveredRegionIds,
      ],
      discoveredLandmarkIds: [
        ...DEFAULT_SETTINGS.exploration.discoveredLandmarkIds,
      ],
      traversedWindZoneIds: [
        ...DEFAULT_SETTINGS.exploration.traversedWindZoneIds,
      ],
    },
  }
}

function isValidBestTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isQualityPreference(value: unknown): value is QualityPreference {
  return value === 'auto' || value === 'low' || value === 'high'
}

function isMusicVolume(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}

function parseMissionGrades(value: unknown): MissionGrades {
  if (typeof value !== 'object' || value === null) return {}
  const grades: MissionGrades = {}
  for (const [missionId, grade] of Object.entries(value)) {
    if (isMissionId(missionId) && isAwardedMissionGrade(grade)) {
      grades[missionId] = grade
    }
  }
  return grades
}

function parseCoinBestTimes(value: unknown): CoinBestTimes {
  if (typeof value !== 'object' || value === null) return {}
  const bestTimes: CoinBestTimes = {}
  for (const [regionId, elapsedMs] of Object.entries(value)) {
    if (isOpenWorldRegionId(regionId) && isValidBestTime(elapsedMs)) {
      bestTimes[regionId] = elapsedMs
    }
  }
  return bestTimes
}

function isValidExplorationPosition(value: unknown): value is Vec3Value {
  if (typeof value !== 'object' || value === null) return false
  if (!('x' in value) || !('y' in value) || !('z' in value)) return false
  return (
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    value.x >= -400 &&
    value.x <= 1_300 &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    value.y >= -100 &&
    value.y <= 400 &&
    typeof value.z === 'number' &&
    Number.isFinite(value.z) &&
    value.z >= -1_100 &&
    value.z <= 600
  )
}

function parseExploration(value: unknown): ExplorationProgress {
  const defaults = freshDefaults().exploration
  if (typeof value !== 'object' || value === null) return defaults

  const position =
    'position' in value && isValidExplorationPosition(value.position)
      ? { ...value.position }
      : defaults.position
  const headingRadians =
    'headingRadians' in value &&
    typeof value.headingRadians === 'number' &&
    Number.isFinite(value.headingRadians)
      ? value.headingRadians
      : defaults.headingRadians
  const movement =
    'movement' in value &&
    (value.movement === 'airborne' || value.movement === 'landed')
      ? value.movement
      : defaults.movement
  const discoveredRegionIds =
    'discoveredRegionIds' in value && Array.isArray(value.discoveredRegionIds)
      ? [...new Set(value.discoveredRegionIds.filter(isOpenWorldRegionId))]
      : defaults.discoveredRegionIds
  const destinationRegionId =
    'destinationRegionId' in value &&
    isOpenWorldRegionId(value.destinationRegionId)
      ? value.destinationRegionId
      : null
  const discoveredLandmarkIds =
    'discoveredLandmarkIds' in value &&
    Array.isArray(value.discoveredLandmarkIds)
      ? [
          ...new Set(
            value.discoveredLandmarkIds.filter(isFestivalHubLandmarkId),
          ),
        ]
      : defaults.discoveredLandmarkIds
  const traversedWindZoneIds =
    'traversedWindZoneIds' in value &&
    Array.isArray(value.traversedWindZoneIds)
      ? [
          ...new Set(
            value.traversedWindZoneIds.filter(isFestivalHubWindZoneId),
          ),
        ]
      : defaults.traversedWindZoneIds

  return {
    position,
    headingRadians,
    movement,
    discoveredRegionIds,
    destinationRegionId,
    discoveredLandmarkIds,
    traversedWindZoneIds,
  }
}

function parseSettings(
  raw: string,
): { readonly settings: GameSettings; readonly shouldMigrate: boolean } | null {
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    (parsed.version !== 2 &&
      parsed.version !== 3 &&
      parsed.version !== 4 &&
      parsed.version !== 5 &&
      parsed.version !== 6 &&
      parsed.version !== 7)
  ) {
    return null
  }

  const bestTimeMs =
    'bestTimeMs' in parsed && isValidBestTime(parsed.bestTimeMs)
      ? parsed.bestTimeMs
      : null
  const muted =
    'muted' in parsed && typeof parsed.muted === 'boolean'
      ? parsed.muted
      : false
  const musicVolume =
    parsed.version >= 6 &&
    'musicVolume' in parsed &&
    isMusicVolume(parsed.musicVolume)
      ? parsed.musicVolume
      : DEFAULT_SETTINGS.musicVolume
  const quality =
    'quality' in parsed && isQualityPreference(parsed.quality)
      ? parsed.quality
      : 'auto'
  const missionGrades =
    parsed.version >= 3 &&
    'missionGrades' in parsed
      ? parseMissionGrades(parsed.missionGrades)
      : {}
  const exploration =
    parsed.version >= 4 && 'exploration' in parsed
      ? parseExploration(parsed.exploration)
      : freshDefaults().exploration
  const coinBestTimesMs =
    parsed.version >= 5 && 'coinBestTimesMs' in parsed
      ? parseCoinBestTimes(parsed.coinBestTimesMs)
      : {}

  return {
    settings: {
      bestTimeMs,
      muted,
      musicVolume,
      quality,
      missionGrades,
      coinBestTimesMs,
      exploration,
    },
    shouldMigrate: parsed.version !== 7,
  }
}

function parseLegacyRecord(raw: string): LegacyStoredRecord | null {
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('bestTimeMs' in parsed) ||
    !isValidBestTime(parsed.bestTimeMs)
  ) {
    return null
  }
  return { version: 1, bestTimeMs: parsed.bestTimeMs }
}

function isValidSettings(settings: GameSettings): boolean {
  return (
    (settings.bestTimeMs === null || isValidBestTime(settings.bestTimeMs)) &&
    typeof settings.muted === 'boolean' &&
    isMusicVolume(settings.musicVolume) &&
    isQualityPreference(settings.quality) &&
    typeof settings.missionGrades === 'object' &&
    settings.missionGrades !== null &&
    Object.entries(settings.missionGrades).every(
      ([missionId, grade]) =>
        isMissionId(missionId) && isAwardedMissionGrade(grade),
    ) &&
    typeof settings.coinBestTimesMs === 'object' &&
    settings.coinBestTimesMs !== null &&
    Object.entries(settings.coinBestTimesMs).every(
      ([regionId, elapsedMs]) =>
        isOpenWorldRegionId(regionId) && isValidBestTime(elapsedMs),
    ) &&
    isValidExplorationPosition(settings.exploration.position) &&
    Number.isFinite(settings.exploration.headingRadians) &&
    (settings.exploration.movement === 'airborne' ||
      settings.exploration.movement === 'landed') &&
    settings.exploration.discoveredRegionIds.every(isOpenWorldRegionId) &&
    settings.exploration.discoveredLandmarkIds.every(
      isFestivalHubLandmarkId,
    ) &&
    settings.exploration.traversedWindZoneIds.every(
      isFestivalHubWindZoneId,
    ) &&
    (settings.exploration.destinationRegionId === null ||
      isOpenWorldRegionId(settings.exploration.destinationRegionId))
  )
}

export function readSettings(storage: RecordStorage): GameSettings {
  try {
    const currentRaw = storage.getItem(SETTINGS_KEY)
    if (currentRaw !== null) {
      const parsed = parseSettings(currentRaw)
      if (parsed !== null) {
        if (parsed.shouldMigrate) saveSettings(storage, parsed.settings)
        return parsed.settings
      }
    }

    const legacyRaw = storage.getItem(LEGACY_RECORD_KEY)
    if (legacyRaw === null) return freshDefaults()
    const legacy = parseLegacyRecord(legacyRaw)
    if (legacy === null) return freshDefaults()

    const migrated: GameSettings = {
      ...freshDefaults(),
      bestTimeMs: legacy.bestTimeMs,
    }
    saveSettings(storage, migrated)
    return migrated
  } catch {
    return freshDefaults()
  }
}

export function saveSettings(
  storage: RecordStorage,
  settings: GameSettings,
): boolean {
  if (!isValidSettings(settings)) return false

  const stored: StoredSettings = {
    version: 7,
    ...settings,
    missionGrades: { ...settings.missionGrades },
    coinBestTimesMs: { ...settings.coinBestTimesMs },
    exploration: {
      ...settings.exploration,
      position: { ...settings.exploration.position },
      discoveredRegionIds: [...settings.exploration.discoveredRegionIds],
      discoveredLandmarkIds: [
        ...settings.exploration.discoveredLandmarkIds,
      ],
      traversedWindZoneIds: [
        ...settings.exploration.traversedWindZoneIds,
      ],
    },
  }
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

export function recordCoinBestTime(
  records: Readonly<CoinBestTimes>,
  regionId: OpenWorldRegionId,
  elapsedMs: number,
): Readonly<CoinBestTimes> {
  if (!isValidBestTime(elapsedMs)) return records
  const currentBest = records[regionId]
  if (currentBest !== undefined && elapsedMs >= currentBest) return records
  return { ...records, [regionId]: elapsedMs }
}
