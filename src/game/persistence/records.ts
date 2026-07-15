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
import {
  canonicalizeGhostRun,
  cloneGhostRun,
  isCanonicalGhostRun,
  type GhostRun,
} from '../competition/ghostRun'
import {
  canonicalizeSkyLeagueRecords,
  cloneSkyLeagueRecords,
  createEmptySkyLeagueRecords,
  isCanonicalSkyLeagueRecords,
  recordCoinLeagueTime,
  SKY_LEAGUE_TOP_LIMIT,
  type SkyLeagueRecordResult,
  type SkyLeagueRecords,
} from '../competition/skyLeagueRecords'
import {
  DEFAULT_CHARACTER_LOADOUT,
  isCharacterLoadout,
  normalizeCharacterLoadout,
  type CharacterLoadout,
} from '../customization/characterCatalog'

export interface RecordStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type QualityPreference = 'auto' | 'low' | 'high'
export type MissionGrades = Partial<Record<MissionId, AwardedMissionGrade>>
export type CoinBestTimes = Partial<Record<OpenWorldRegionId, number>>

export interface SkyLeagueGhosts {
  readonly race: GhostRun | null
  readonly coin: Readonly<Partial<Record<OpenWorldRegionId, GhostRun>>>
  readonly mission: Readonly<Partial<Record<MissionId, GhostRun>>>
}

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
  readonly characterLoadout: CharacterLoadout
  readonly missionGrades: Readonly<MissionGrades>
  readonly coinBestTimesMs: Readonly<CoinBestTimes>
  readonly skyLeague: SkyLeagueRecords
  readonly ghosts: SkyLeagueGhosts
  readonly exploration: ExplorationProgress
}

export interface CoinCompetitionResult {
  readonly settings: GameSettings
  readonly placement: SkyLeagueRecordResult
}

const SETTINGS_VERSION = 11

interface StoredSettings extends GameSettings {
  readonly version: typeof SETTINGS_VERSION
}

interface LegacyStoredRecord {
  readonly version: 1
  readonly bestTimeMs: number
}

export const SETTINGS_KEY = 'skyknit-cup:settings'
const LEGACY_RECORD_KEY = 'skyknit-cup:best-time'

export const EMPTY_SKY_LEAGUE_GHOSTS: SkyLeagueGhosts = Object.freeze({
  race: null,
  coin: Object.freeze({}),
  mission: Object.freeze({}),
})

export const DEFAULT_SETTINGS: GameSettings = {
  bestTimeMs: null,
  muted: false,
  musicVolume: 0.35,
  quality: 'auto',
  characterLoadout: DEFAULT_CHARACTER_LOADOUT,
  missionGrades: {},
  coinBestTimesMs: {},
  skyLeague: createEmptySkyLeagueRecords(),
  ghosts: EMPTY_SKY_LEAGUE_GHOSTS,
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createEmptySkyLeagueGhosts(): SkyLeagueGhosts {
  return { race: null, coin: {}, mission: {} }
}

export function cloneSkyLeagueGhosts(
  ghosts: SkyLeagueGhosts,
): SkyLeagueGhosts {
  const coin: Partial<Record<OpenWorldRegionId, GhostRun>> = {}
  for (const [regionId, run] of Object.entries(ghosts.coin) as [
    OpenWorldRegionId,
    GhostRun,
  ][]) {
    coin[regionId] = cloneGhostRun(run)
  }

  const mission: Partial<Record<MissionId, GhostRun>> = {}
  for (const [missionId, run] of Object.entries(ghosts.mission) as [
    MissionId,
    GhostRun,
  ][]) {
    mission[missionId] = cloneGhostRun(run)
  }

  return {
    race: ghosts.race === null ? null : cloneGhostRun(ghosts.race),
    coin,
    mission,
  }
}

export function canonicalizeSkyLeagueGhosts(
  value: unknown,
): SkyLeagueGhosts {
  if (!isObjectRecord(value)) return createEmptySkyLeagueGhosts()

  const race = canonicalizeGhostRun(value.race)
  const coin: Partial<Record<OpenWorldRegionId, GhostRun>> = {}
  if (isObjectRecord(value.coin)) {
    for (const [regionId, rawRun] of Object.entries(value.coin)) {
      if (!isOpenWorldRegionId(regionId)) continue
      const run = canonicalizeGhostRun(rawRun)
      if (run !== null) coin[regionId] = run
    }
  }

  const mission: Partial<Record<MissionId, GhostRun>> = {}
  if (isObjectRecord(value.mission)) {
    for (const [missionId, rawRun] of Object.entries(value.mission)) {
      if (!isMissionId(missionId)) continue
      const run = canonicalizeGhostRun(rawRun)
      if (run !== null) mission[missionId] = run
    }
  }

  return { race, coin, mission }
}

export function isCanonicalSkyLeagueGhosts(
  value: unknown,
): value is SkyLeagueGhosts {
  if (!isObjectRecord(value)) return false
  if (
    Object.keys(value).some(
      (key) => key !== 'race' && key !== 'coin' && key !== 'mission',
    ) ||
    !('race' in value) ||
    !(value.race === null || isCanonicalGhostRun(value.race)) ||
    !isObjectRecord(value.coin) ||
    !isObjectRecord(value.mission)
  ) {
    return false
  }

  return (
    Object.entries(value.coin).every(
      ([regionId, run]) =>
        isOpenWorldRegionId(regionId) && isCanonicalGhostRun(run),
    ) &&
    Object.entries(value.mission).every(
      ([missionId, run]) =>
        isMissionId(missionId) && isCanonicalGhostRun(run),
    )
  )
}

function freshDefaults(): GameSettings {
  return {
    ...DEFAULT_SETTINGS,
    characterLoadout: { ...DEFAULT_CHARACTER_LOADOUT },
    missionGrades: {},
    coinBestTimesMs: {},
    skyLeague: cloneSkyLeagueRecords(DEFAULT_SETTINGS.skyLeague),
    ghosts: cloneSkyLeagueGhosts(DEFAULT_SETTINGS.ghosts),
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

function synchronizeSkyLeague(
  records: SkyLeagueRecords,
  bestTimeMs: number | null,
  coinBestTimesMs: Readonly<CoinBestTimes>,
): SkyLeagueRecords {
  const raceTop10Ms = mergeBestTimeIntoBoard(
    records.raceTop10Ms,
    bestTimeMs,
  )
  const coinTop10Ms: Partial<
    Record<OpenWorldRegionId, readonly number[]>
  > = { ...records.coinTop10Ms }
  for (const [regionId, elapsedMs] of Object.entries(coinBestTimesMs) as [
    OpenWorldRegionId,
    number,
  ][]) {
    coinTop10Ms[regionId] = mergeBestTimeIntoBoard(
      coinTop10Ms[regionId] ?? [],
      elapsedMs,
    )
  }

  return {
    raceTop10Ms,
    coinTop10Ms,
    missionTop10: records.missionTop10,
  }
}

function mergeBestTimeIntoBoard(
  board: readonly number[],
  bestTimeMs: number | null,
): readonly number[] {
  if (bestTimeMs === null || (board[0] !== undefined && board[0] <= bestTimeMs)) {
    return board
  }
  return [bestTimeMs, ...board].slice(0, SKY_LEAGUE_TOP_LIMIT)
}

function deriveCoinBestTimes(
  records: SkyLeagueRecords,
): CoinBestTimes {
  const bestTimes: CoinBestTimes = {}
  for (const [regionId, board] of Object.entries(records.coinTop10Ms) as [
    OpenWorldRegionId,
    readonly number[],
  ][]) {
    const bestTime = board[0]
    if (bestTime !== undefined) bestTimes[regionId] = bestTime
  }
  return bestTimes
}

function strongerMissionGrade(
  left: AwardedMissionGrade | undefined,
  right: AwardedMissionGrade,
): AwardedMissionGrade {
  if (left === 'gold' || right === 'gold') return 'gold'
  if (left === 'silver' || right === 'silver') return 'silver'
  return 'bronze'
}

function synchronizeMissionGrades(
  grades: MissionGrades,
  records: SkyLeagueRecords,
): MissionGrades {
  const synchronized: MissionGrades = { ...grades }
  for (const [missionId, board] of Object.entries(records.missionTop10) as [
    MissionId,
    readonly { readonly grade: AwardedMissionGrade }[],
  ][]) {
    const leagueGrade = board[0]?.grade
    if (leagueGrade !== undefined) {
      synchronized[missionId] = strongerMissionGrade(
        synchronized[missionId],
        leagueGrade,
      )
    }
  }
  return synchronized
}

function stringRecordMatches(left: object, right: object): boolean {
  const rightRecord = right as Readonly<Record<string, unknown>>
  const leftEntries = Object.entries(left)
  return (
    leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(([key, value]) => rightRecord[key] === value)
  )
}

function hasCanonicalCompatibilitySummaries(
  settings: GameSettings,
): boolean {
  return (
    settings.bestTimeMs === (settings.skyLeague.raceTop10Ms[0] ?? null) &&
    stringRecordMatches(
      settings.coinBestTimesMs,
      deriveCoinBestTimes(settings.skyLeague),
    ) &&
    stringRecordMatches(
      settings.missionGrades,
      synchronizeMissionGrades(
        { ...settings.missionGrades },
        settings.skyLeague,
      ),
    )
  )
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

function parseExploration(
  value: unknown,
  includeFestivalDiscoveries: boolean,
): ExplorationProgress {
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
    includeFestivalDiscoveries &&
    'discoveredLandmarkIds' in value &&
    Array.isArray(value.discoveredLandmarkIds)
      ? [
          ...new Set(
            value.discoveredLandmarkIds.filter(isFestivalHubLandmarkId),
          ),
        ]
      : defaults.discoveredLandmarkIds
  const traversedWindZoneIds =
    includeFestivalDiscoveries &&
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

function arrayMatches(
  value: unknown,
  expected: readonly string[],
): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  )
}

function hasCanonicalFestivalDiscoveries(
  value: unknown,
  exploration: ExplorationProgress,
): boolean {
  if (typeof value !== 'object' || value === null) return false
  const landmarks =
    'discoveredLandmarkIds' in value
      ? value.discoveredLandmarkIds
      : undefined
  const windZones =
    'traversedWindZoneIds' in value
      ? value.traversedWindZoneIds
      : undefined
  return (
    arrayMatches(landmarks, exploration.discoveredLandmarkIds) &&
    arrayMatches(windZones, exploration.traversedWindZoneIds)
  )
}

function characterLoadoutMatches(
  value: unknown,
  expected: CharacterLoadout,
): boolean {
  return (
    isObjectRecord(value) &&
    Object.keys(value).length === 3 &&
    isCharacterLoadout(value) &&
    value.characterId === expected.characterId &&
    value.paletteId === expected.paletteId &&
    value.accessoryId === expected.accessoryId
  )
}

function isSupportedSettingsVersion(value: unknown): value is
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11 {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 2 &&
    value <= SETTINGS_VERSION
  )
}

function parseSettings(
  raw: string,
): { readonly settings: GameSettings; readonly shouldMigrate: boolean } | null {
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !isSupportedSettingsVersion(parsed.version)
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
  const rawCharacterLoadout =
    parsed.version >= 9 && 'characterLoadout' in parsed
      ? parsed.characterLoadout
      : undefined
  const characterLoadout =
    parsed.version >= 9
      ? normalizeCharacterLoadout(rawCharacterLoadout)
      : { ...DEFAULT_CHARACTER_LOADOUT }
  const missionGrades =
    parsed.version >= 3 &&
    'missionGrades' in parsed
      ? parseMissionGrades(parsed.missionGrades)
      : {}
  const rawExploration =
    parsed.version >= 4 && 'exploration' in parsed
      ? parsed.exploration
      : undefined
  const exploration =
    rawExploration === undefined
      ? freshDefaults().exploration
      : parseExploration(rawExploration, parsed.version >= 7)
  const coinBestTimesMs =
    parsed.version >= 5 && 'coinBestTimesMs' in parsed
      ? parseCoinBestTimes(parsed.coinBestTimesMs)
      : {}
  const rawSkyLeague =
    parsed.version >= 8 && 'skyLeague' in parsed
      ? parsed.skyLeague
      : undefined
  const skyLeague = synchronizeSkyLeague(
    parsed.version >= 8
      ? canonicalizeSkyLeagueRecords(rawSkyLeague)
      : createEmptySkyLeagueRecords(),
    bestTimeMs,
    coinBestTimesMs,
  )
  const synchronizedBestTimeMs = skyLeague.raceTop10Ms[0] ?? null
  const synchronizedCoinBestTimesMs = deriveCoinBestTimes(skyLeague)
  const synchronizedMissionGrades = synchronizeMissionGrades(
    missionGrades,
    skyLeague,
  )
  const rawGhosts =
    parsed.version >= 8 && 'ghosts' in parsed ? parsed.ghosts : undefined
  const ghosts = canonicalizeSkyLeagueGhosts(rawGhosts)

  return {
    settings: {
      bestTimeMs: synchronizedBestTimeMs,
      muted,
      musicVolume,
      quality,
      characterLoadout,
      missionGrades: synchronizedMissionGrades,
      coinBestTimesMs: synchronizedCoinBestTimesMs,
      skyLeague,
      ghosts,
      exploration,
    },
    shouldMigrate:
      parsed.version !== SETTINGS_VERSION ||
      !characterLoadoutMatches(rawCharacterLoadout, characterLoadout) ||
      !hasCanonicalFestivalDiscoveries(rawExploration, exploration) ||
      !isCanonicalSkyLeagueRecords(rawSkyLeague) ||
      JSON.stringify(rawSkyLeague) !== JSON.stringify(skyLeague) ||
      !isCanonicalSkyLeagueGhosts(rawGhosts) ||
      bestTimeMs !== synchronizedBestTimeMs ||
      !stringRecordMatches(
        coinBestTimesMs,
        synchronizedCoinBestTimesMs,
      ) ||
      !stringRecordMatches(missionGrades, synchronizedMissionGrades),
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
  if (typeof settings !== 'object' || settings === null) return false
  const exploration = settings.exploration
  if (typeof exploration !== 'object' || exploration === null) return false

  return (
    (settings.bestTimeMs === null || isValidBestTime(settings.bestTimeMs)) &&
    typeof settings.muted === 'boolean' &&
    isMusicVolume(settings.musicVolume) &&
    isQualityPreference(settings.quality) &&
    isCharacterLoadout(settings.characterLoadout) &&
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
    isCanonicalSkyLeagueRecords(settings.skyLeague) &&
    isCanonicalSkyLeagueGhosts(settings.ghosts) &&
    hasCanonicalCompatibilitySummaries(settings) &&
    isValidExplorationPosition(exploration.position) &&
    Number.isFinite(exploration.headingRadians) &&
    (exploration.movement === 'airborne' ||
      exploration.movement === 'landed') &&
    Array.isArray(exploration.discoveredRegionIds) &&
    exploration.discoveredRegionIds.every(isOpenWorldRegionId) &&
    Array.isArray(exploration.discoveredLandmarkIds) &&
    exploration.discoveredLandmarkIds.every(isFestivalHubLandmarkId) &&
    Array.isArray(exploration.traversedWindZoneIds) &&
    exploration.traversedWindZoneIds.every(isFestivalHubWindZoneId) &&
    (exploration.destinationRegionId === null ||
      isOpenWorldRegionId(exploration.destinationRegionId))
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

    const defaults = freshDefaults()
    const migrated: GameSettings = {
      ...defaults,
      bestTimeMs: legacy.bestTimeMs,
      skyLeague: synchronizeSkyLeague(
        defaults.skyLeague,
        legacy.bestTimeMs,
        defaults.coinBestTimesMs,
      ),
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
    version: SETTINGS_VERSION,
    ...settings,
    characterLoadout: { ...settings.characterLoadout },
    missionGrades: { ...settings.missionGrades },
    coinBestTimesMs: { ...settings.coinBestTimesMs },
    skyLeague: cloneSkyLeagueRecords(settings.skyLeague),
    ghosts: cloneSkyLeagueGhosts(settings.ghosts),
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

export function recordCoinCompetitionResult(
  settings: GameSettings,
  regionId: OpenWorldRegionId,
  elapsedMs: number,
): CoinCompetitionResult {
  const placement = recordCoinLeagueTime(
    settings.skyLeague,
    regionId,
    elapsedMs,
  )
  const coinBestTimesMs = recordCoinBestTime(
    settings.coinBestTimesMs,
    regionId,
    elapsedMs,
  )

  if (
    placement.records === settings.skyLeague &&
    coinBestTimesMs === settings.coinBestTimesMs
  ) {
    return { settings, placement }
  }

  return {
    settings: {
      ...settings,
      coinBestTimesMs,
      skyLeague: placement.records,
    },
    placement,
  }
}
