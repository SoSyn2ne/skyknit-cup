import {
  isAwardedMissionGrade,
  isMissionId,
  type AwardedMissionGrade,
  type MissionGrade,
  type MissionId,
} from '../missions/missionRules'
import {
  isOpenWorldRegionId,
  type OpenWorldRegionId,
} from '../world/openWorldRegions'

export const SKY_LEAGUE_TOP_LIMIT = 10

export type LeagueMedal = 'gold' | 'silver' | 'bronze'

export interface MissionLeagueEntry {
  readonly elapsedMs: number
  readonly grade: AwardedMissionGrade
}

export type CoinLeagueBoards = Readonly<
  Partial<Record<OpenWorldRegionId, readonly number[]>>
>

export type MissionLeagueBoards = Readonly<
  Partial<Record<MissionId, readonly MissionLeagueEntry[]>>
>

export interface SkyLeagueRecords {
  readonly raceTop10Ms: readonly number[]
  readonly coinTop10Ms: CoinLeagueBoards
  readonly missionTop10: MissionLeagueBoards
}

export interface SkyLeagueRecordResult {
  readonly records: SkyLeagueRecords
  readonly rank: number | null
  readonly medal: LeagueMedal | null
  readonly isNewBest: boolean
  readonly inserted: boolean
}

const EMPTY_TIME_BOARD: readonly number[] = Object.freeze([])
const EMPTY_MISSION_BOARD: readonly MissionLeagueEntry[] = Object.freeze([])
const EMPTY_COIN_BOARDS: CoinLeagueBoards = Object.freeze({})
const EMPTY_MISSION_BOARDS: MissionLeagueBoards = Object.freeze({})

export const EMPTY_SKY_LEAGUE_RECORDS: SkyLeagueRecords = Object.freeze({
  raceTop10Ms: EMPTY_TIME_BOARD,
  coinTop10Ms: EMPTY_COIN_BOARDS,
  missionTop10: EMPTY_MISSION_BOARDS,
})

const MISSION_GRADE_RANK: Readonly<Record<AwardedMissionGrade, number>> = {
  bronze: 1,
  silver: 2,
  gold: 3,
}

interface Insertion<T> {
  readonly board: readonly T[]
  readonly rank: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidLeagueElapsedMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function isMissionLeagueEntry(
  value: unknown,
): value is MissionLeagueEntry {
  return (
    isObject(value) &&
    isValidLeagueElapsedMs(value.elapsedMs) &&
    isAwardedMissionGrade(value.grade)
  )
}

function compareMissionEntries(
  left: MissionLeagueEntry,
  right: MissionLeagueEntry,
): number {
  return (
    MISSION_GRADE_RANK[right.grade] - MISSION_GRADE_RANK[left.grade] ||
    left.elapsedMs - right.elapsedMs
  )
}

function canonicalizeTimeBoard(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isValidLeagueElapsedMs)
    .sort((left, right) => left - right)
    .slice(0, SKY_LEAGUE_TOP_LIMIT)
}

function canonicalizeMissionBoard(
  value: unknown,
): readonly MissionLeagueEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isMissionLeagueEntry)
    .map((entry) => ({
      elapsedMs: entry.elapsedMs,
      grade: entry.grade,
    }))
    .sort(compareMissionEntries)
    .slice(0, SKY_LEAGUE_TOP_LIMIT)
}

export function createEmptySkyLeagueRecords(): SkyLeagueRecords {
  return {
    raceTop10Ms: [],
    coinTop10Ms: {},
    missionTop10: {},
  }
}

export function cloneSkyLeagueRecords(
  records: SkyLeagueRecords,
): SkyLeagueRecords {
  const coinTop10Ms: Partial<
    Record<OpenWorldRegionId, readonly number[]>
  > = {}
  for (const [regionId, board] of Object.entries(records.coinTop10Ms) as [
    OpenWorldRegionId,
    readonly number[],
  ][]) {
    coinTop10Ms[regionId] = [...board]
  }

  const missionTop10: Partial<
    Record<MissionId, readonly MissionLeagueEntry[]>
  > = {}
  for (const [missionId, board] of Object.entries(records.missionTop10) as [
    MissionId,
    readonly MissionLeagueEntry[],
  ][]) {
    missionTop10[missionId] = board.map((entry) => ({
      elapsedMs: entry.elapsedMs,
      grade: entry.grade,
    }))
  }

  return {
    raceTop10Ms: [...records.raceTop10Ms],
    coinTop10Ms,
    missionTop10,
  }
}

export function canonicalizeSkyLeagueRecords(
  value: unknown,
): SkyLeagueRecords {
  if (!isObject(value)) return createEmptySkyLeagueRecords()

  const coinTop10Ms: Partial<
    Record<OpenWorldRegionId, readonly number[]>
  > = {}
  if (isObject(value.coinTop10Ms)) {
    for (const [regionId, rawBoard] of Object.entries(value.coinTop10Ms)) {
      if (!isOpenWorldRegionId(regionId)) continue
      const board = canonicalizeTimeBoard(rawBoard)
      if (board.length > 0) coinTop10Ms[regionId] = board
    }
  }

  const missionTop10: Partial<
    Record<MissionId, readonly MissionLeagueEntry[]>
  > = {}
  if (isObject(value.missionTop10)) {
    for (const [missionId, rawBoard] of Object.entries(value.missionTop10)) {
      if (!isMissionId(missionId)) continue
      const board = canonicalizeMissionBoard(rawBoard)
      if (board.length > 0) missionTop10[missionId] = board
    }
  }

  return {
    raceTop10Ms: canonicalizeTimeBoard(value.raceTop10Ms),
    coinTop10Ms,
    missionTop10,
  }
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function timeBoardsMatch(left: unknown, right: readonly number[]): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  )
}

function missionBoardsMatch(
  left: unknown,
  right: readonly MissionLeagueEntry[],
): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((entry, index) => {
      const expected = right[index]
      return (
        isObject(entry) &&
        isMissionLeagueEntry(entry) &&
        hasOnlyKeys(entry, ['elapsedMs', 'grade']) &&
        entry.elapsedMs === expected.elapsedMs &&
        entry.grade === expected.grade
      )
    })
  )
}

export function isCanonicalSkyLeagueRecords(
  value: unknown,
): value is SkyLeagueRecords {
  if (!isObject(value)) return false
  if (
    !hasOnlyKeys(value, ['raceTop10Ms', 'coinTop10Ms', 'missionTop10']) ||
    !Array.isArray(value.raceTop10Ms) ||
    !isObject(value.coinTop10Ms) ||
    !isObject(value.missionTop10)
  ) {
    return false
  }

  const rawCoinTop10Ms = value.coinTop10Ms
  const rawMissionTop10 = value.missionTop10
  const canonical = canonicalizeSkyLeagueRecords(value)
  if (!timeBoardsMatch(value.raceTop10Ms, canonical.raceTop10Ms)) return false

  const coinKeys = Object.keys(rawCoinTop10Ms)
  const canonicalCoinKeys = Object.keys(canonical.coinTop10Ms)
  if (
    coinKeys.length !== canonicalCoinKeys.length ||
    !coinKeys.every(
      (regionId) =>
        isOpenWorldRegionId(regionId) &&
        canonical.coinTop10Ms[regionId] !== undefined &&
        timeBoardsMatch(
          rawCoinTop10Ms[regionId],
          canonical.coinTop10Ms[regionId],
        ),
    )
  ) {
    return false
  }

  const missionKeys = Object.keys(rawMissionTop10)
  const canonicalMissionKeys = Object.keys(canonical.missionTop10)
  return (
    missionKeys.length === canonicalMissionKeys.length &&
    missionKeys.every(
      (missionId) =>
        isMissionId(missionId) &&
        canonical.missionTop10[missionId] !== undefined &&
        missionBoardsMatch(
          rawMissionTop10[missionId],
          canonical.missionTop10[missionId],
        ),
    )
  )
}

function insertStable<T>(
  board: readonly T[],
  candidate: T,
  compare: (left: T, right: T) => number,
): Insertion<T> | null {
  const firstSlower = board.findIndex(
    (existing) => compare(candidate, existing) < 0,
  )
  const insertionIndex = firstSlower === -1 ? board.length : firstSlower
  if (insertionIndex >= SKY_LEAGUE_TOP_LIMIT) return null

  return {
    board: [
      ...board.slice(0, insertionIndex),
      candidate,
      ...board.slice(insertionIndex, SKY_LEAGUE_TOP_LIMIT - 1),
    ],
    rank: insertionIndex + 1,
  }
}

function noInsertion(records: SkyLeagueRecords): SkyLeagueRecordResult {
  return {
    records,
    rank: null,
    medal: null,
    isNewBest: false,
    inserted: false,
  }
}

function insertionResult(
  records: SkyLeagueRecords,
  rank: number,
): SkyLeagueRecordResult {
  return {
    records,
    rank,
    medal: getLeagueMedal(rank),
    isNewBest: rank === 1,
    inserted: true,
  }
}

export function getLeagueMedal(rank: number | null): LeagueMedal | null {
  switch (rank) {
    case 1:
      return 'gold'
    case 2:
      return 'silver'
    case 3:
      return 'bronze'
    default:
      return null
  }
}

export function getRaceLeaderboard(
  records: SkyLeagueRecords,
): readonly number[] {
  return records.raceTop10Ms
}

export function getCoinLeaderboard(
  records: SkyLeagueRecords,
  regionId: OpenWorldRegionId,
): readonly number[] {
  return records.coinTop10Ms[regionId] ?? EMPTY_TIME_BOARD
}

export function getMissionLeaderboard(
  records: SkyLeagueRecords,
  missionId: MissionId,
): readonly MissionLeagueEntry[] {
  return records.missionTop10[missionId] ?? EMPTY_MISSION_BOARD
}

export function recordRaceLeagueTime(
  records: SkyLeagueRecords,
  elapsedMs: number,
): SkyLeagueRecordResult {
  if (!isValidLeagueElapsedMs(elapsedMs)) return noInsertion(records)
  const insertion = insertStable(
    records.raceTop10Ms,
    elapsedMs,
    (left, right) => left - right,
  )
  if (insertion === null) return noInsertion(records)

  return insertionResult(
    { ...records, raceTop10Ms: insertion.board },
    insertion.rank,
  )
}

export function recordCoinLeagueTime(
  records: SkyLeagueRecords,
  regionId: OpenWorldRegionId,
  elapsedMs: number,
): SkyLeagueRecordResult {
  if (
    !isOpenWorldRegionId(regionId) ||
    !isValidLeagueElapsedMs(elapsedMs)
  ) {
    return noInsertion(records)
  }

  const insertion = insertStable(
    getCoinLeaderboard(records, regionId),
    elapsedMs,
    (left, right) => left - right,
  )
  if (insertion === null) return noInsertion(records)

  return insertionResult(
    {
      ...records,
      coinTop10Ms: {
        ...records.coinTop10Ms,
        [regionId]: insertion.board,
      },
    },
    insertion.rank,
  )
}

export function recordMissionLeagueResult(
  records: SkyLeagueRecords,
  missionId: MissionId,
  elapsedMs: number,
  grade: MissionGrade,
): SkyLeagueRecordResult {
  if (
    !isMissionId(missionId) ||
    !isValidLeagueElapsedMs(elapsedMs) ||
    !isAwardedMissionGrade(grade)
  ) {
    return noInsertion(records)
  }

  const insertion = insertStable(
    getMissionLeaderboard(records, missionId),
    { elapsedMs, grade },
    compareMissionEntries,
  )
  if (insertion === null) return noInsertion(records)

  return insertionResult(
    {
      ...records,
      missionTop10: {
        ...records.missionTop10,
        [missionId]: insertion.board,
      },
    },
    insertion.rank,
  )
}
