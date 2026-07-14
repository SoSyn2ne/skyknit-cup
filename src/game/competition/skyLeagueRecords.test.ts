import { describe, expect, it } from 'vitest'

import type { MissionGrade } from '../missions/missionRules'
import type { OpenWorldRegionId } from '../world/openWorldRegions'
import {
  EMPTY_SKY_LEAGUE_RECORDS,
  canonicalizeSkyLeagueRecords,
  cloneSkyLeagueRecords,
  createEmptySkyLeagueRecords,
  getCoinLeaderboard,
  getLeagueMedal,
  getMissionLeaderboard,
  getRaceLeaderboard,
  isCanonicalSkyLeagueRecords,
  recordCoinLeagueTime,
  recordMissionLeagueResult,
  recordRaceLeagueTime,
} from './skyLeagueRecords'

describe('Sky League Top 10 rules', () => {
  it('creates and deeply clones independent empty or populated records', () => {
    const first = createEmptySkyLeagueRecords()
    const second = createEmptySkyLeagueRecords()

    expect(first).toEqual(EMPTY_SKY_LEAGUE_RECORDS)
    expect(first).not.toBe(second)
    expect(first.raceTop10Ms).not.toBe(second.raceTop10Ms)
    expect(first.coinTop10Ms).not.toBe(second.coinTop10Ms)
    expect(first.missionTop10).not.toBe(second.missionTop10)

    const populated = canonicalizeSkyLeagueRecords({
      raceTop10Ms: [1_000],
      coinTop10Ms: { 'festival-hub': [2_000] },
      missionTop10: {
        'time-trial': [{ elapsedMs: 3_000, grade: 'gold' }],
      },
    })
    const cloned = cloneSkyLeagueRecords(populated)

    expect(cloned).toEqual(populated)
    expect(cloned).not.toBe(populated)
    expect(cloned.raceTop10Ms).not.toBe(populated.raceTop10Ms)
    expect(cloned.coinTop10Ms['festival-hub']).not.toBe(
      populated.coinTop10Ms['festival-hub'],
    )
    expect(cloned.missionTop10['time-trial']).not.toBe(
      populated.missionTop10['time-trial'],
    )
    expect(cloned.missionTop10['time-trial']?.[0]).not.toBe(
      populated.missionTop10['time-trial']?.[0],
    )
  })

  it('inserts race times immutably, keeps exact ties stable, and derives medals', () => {
    const empty = createEmptySkyLeagueRecords()
    const winner = recordRaceLeagueTime(empty, 1_000)

    expect(winner).toMatchObject({
      rank: 1,
      medal: 'gold',
      isNewBest: true,
      inserted: true,
    })
    expect(winner.records).not.toBe(empty)
    expect(getRaceLeaderboard(winner.records)).toEqual([1_000])
    expect(empty).toEqual(EMPTY_SKY_LEAGUE_RECORDS)

    const exactTie = recordRaceLeagueTime(winner.records, 1_000)
    expect(exactTie).toMatchObject({
      rank: 2,
      medal: 'silver',
      isNewBest: false,
      inserted: true,
    })
    expect(getRaceLeaderboard(exactTie.records)).toEqual([1_000, 1_000])

    expect(getLeagueMedal(1)).toBe('gold')
    expect(getLeagueMedal(2)).toBe('silver')
    expect(getLeagueMedal(3)).toBe('bronze')
    expect(getLeagueMedal(4)).toBeNull()
    expect(getLeagueMedal(null)).toBeNull()
  })

  it('caps race boards at ten and preserves the records reference for invalid or eleventh places', () => {
    const full = canonicalizeSkyLeagueRecords({
      raceTop10Ms: Array.from({ length: 10 }, (_, index) => index + 1),
      coinTop10Ms: {},
      missionTop10: {},
    })

    const eleventh = recordRaceLeagueTime(full, 11)
    expect(eleventh).toEqual({
      records: full,
      rank: null,
      medal: null,
      isNewBest: false,
      inserted: false,
    })
    expect(eleventh.records).toBe(full)

    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = recordRaceLeagueTime(full, invalid)
      expect(result.records).toBe(full)
      expect(result.inserted).toBe(false)
      expect(result.rank).toBeNull()
    }
  })

  it('keeps coin region boards independent and shares unaffected immutable branches', () => {
    const festival = recordCoinLeagueTime(
      createEmptySkyLeagueRecords(),
      'festival-hub',
      5_000,
    )
    const canyon = recordCoinLeagueTime(
      festival.records,
      'wind-canyon',
      4_000,
    )

    expect(festival).toMatchObject({
      rank: 1,
      medal: 'gold',
      isNewBest: true,
      inserted: true,
    })
    expect(getCoinLeaderboard(canyon.records, 'festival-hub')).toEqual([
      5_000,
    ])
    expect(getCoinLeaderboard(canyon.records, 'wind-canyon')).toEqual([4_000])
    expect(getCoinLeaderboard(canyon.records, 'cloud-ruins')).toEqual([])
    expect(canyon.records.coinTop10Ms['festival-hub']).toBe(
      festival.records.coinTop10Ms['festival-hub'],
    )
    expect(canyon.records.raceTop10Ms).toBe(festival.records.raceTop10Ms)
    expect(canyon.records.missionTop10).toBe(festival.records.missionTop10)

    const invalidRegion = recordCoinLeagueTime(
      canyon.records,
      'unknown-region' as OpenWorldRegionId,
      3_000,
    )
    expect(invalidRegion.records).toBe(canyon.records)
    expect(invalidRegion.inserted).toBe(false)
  })

  it('orders missions by grade then time and leaves exact ties behind existing entries', () => {
    let records = createEmptySkyLeagueRecords()
    records = recordMissionLeagueResult(
      records,
      'time-trial',
      100,
      'bronze',
    ).records
    records = recordMissionLeagueResult(
      records,
      'time-trial',
      200,
      'gold',
    ).records
    records = recordMissionLeagueResult(
      records,
      'time-trial',
      50,
      'silver',
    ).records
    records = recordMissionLeagueResult(
      records,
      'time-trial',
      150,
      'gold',
    ).records

    const exactTie = recordMissionLeagueResult(
      records,
      'time-trial',
      150,
      'gold',
    )
    expect(exactTie).toMatchObject({
      rank: 2,
      medal: 'silver',
      isNewBest: false,
      inserted: true,
    })
    expect(getMissionLeaderboard(exactTie.records, 'time-trial')).toEqual([
      { elapsedMs: 150, grade: 'gold' },
      { elapsedMs: 150, grade: 'gold' },
      { elapsedMs: 200, grade: 'gold' },
      { elapsedMs: 50, grade: 'silver' },
      { elapsedMs: 100, grade: 'bronze' },
    ])

    const failed = recordMissionLeagueResult(
      exactTie.records,
      'time-trial',
      1,
      'failed' as MissionGrade,
    )
    expect(failed.records).toBe(exactTie.records)
    expect(failed.inserted).toBe(false)
  })

  it('canonicalizes damaged persistence input into sorted bounded known boards', () => {
    const damaged = {
      raceTop10Ms: [12, 4, Number.NaN, -1, 8, 3, 11, 1, 7, 10, 6, 9, 5, 2],
      coinTop10Ms: {
        'festival-hub': [30, 10, 20, 0, Number.POSITIVE_INFINITY],
        'wind-canyon': 'damaged',
        'cloud-ruins': [],
        unknown: [1],
      },
      missionTop10: {
        'time-trial': [
          { elapsedMs: 90, grade: 'silver' },
          { elapsedMs: 200, grade: 'gold' },
          { elapsedMs: 100, grade: 'gold', ignored: true },
          { elapsedMs: -1, grade: 'gold' },
          { elapsedMs: 1, grade: 'failed' },
          null,
        ],
        unknown: [{ elapsedMs: 1, grade: 'gold' }],
      },
    }
    const canonical = canonicalizeSkyLeagueRecords(damaged)

    expect(canonical).toEqual({
      raceTop10Ms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      coinTop10Ms: {
        'festival-hub': [10, 20, 30],
      },
      missionTop10: {
        'time-trial': [
          { elapsedMs: 100, grade: 'gold' },
          { elapsedMs: 200, grade: 'gold' },
          { elapsedMs: 90, grade: 'silver' },
        ],
      },
    })
    expect(isCanonicalSkyLeagueRecords(damaged)).toBe(false)
    expect(isCanonicalSkyLeagueRecords(canonical)).toBe(true)
    expect(
      isCanonicalSkyLeagueRecords({
        ...canonical,
        raceTop10Ms: [...canonical.raceTop10Ms].reverse(),
      }),
    ).toBe(false)
    expect(isCanonicalSkyLeagueRecords(null)).toBe(false)
  })

  it('trims each mission independently and returns a no-op for an eleventh result', () => {
    const full = canonicalizeSkyLeagueRecords({
      raceTop10Ms: [],
      coinTop10Ms: {},
      missionTop10: {
        'golden-knot': Array.from({ length: 10 }, (_, index) => ({
          elapsedMs: index + 1,
          grade: 'gold',
        })),
      },
    })
    const eleventh = recordMissionLeagueResult(
      full,
      'golden-knot',
      11,
      'gold',
    )

    expect(eleventh.records).toBe(full)
    expect(eleventh).toMatchObject({
      rank: null,
      medal: null,
      isNewBest: false,
      inserted: false,
    })
    expect(getMissionLeaderboard(full, 'time-trial')).toEqual([])
  })
})
