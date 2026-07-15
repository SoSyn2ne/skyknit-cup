import { describe, expect, it } from 'vitest'

import { deriveUnlockedMissionIds } from '../missions/missionRules'

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  canonicalizeSkyLeagueGhosts,
  cloneSkyLeagueGhosts,
  createEmptySkyLeagueGhosts,
  isCanonicalSkyLeagueGhosts,
  readSettings,
  recordCoinBestTime,
  recordCoinCompetitionResult,
  saveSettings,
} from './records'

class MemoryStorage {
  readonly values = new Map<string, string>()
  throwOnRead = false
  throwOnWrite = false

  getItem(key: string): string | null {
    if (this.throwOnRead) {
      throw new Error('read blocked')
    }

    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.throwOnWrite) {
      throw new Error('write blocked')
    }

    this.values.set(key, value)
  }
}

const RACE_GHOST = {
  durationMs: 123_456,
  samples: [
    [0, 0, 18, 20, 0, 0, 0, 0, 0],
    [123_456, 40, 22, -60, 0.5, 0.1, -0.2, 1, 11],
  ],
} as const

const COIN_GHOST = {
  durationMs: 18_250,
  samples: [
    [0, 430, 31, 190, 1.25, 0, 0, 0, 0],
    [18_250, 455, 36, 140, 1.5, 0.1, 0.2, 1, 10],
  ],
} as const

const MISSION_GHOST = {
  durationMs: 123_456,
  samples: [
    [0, 0, 18, 20, 0, 0, 0, 0, 0],
    [123_456, 40, 22, -60, 0.5, 0.1, -0.2, 1, 11],
  ],
} as const

describe('versioned game settings', () => {
  it('returns safe defaults when no settings exist', () => {
    expect(readSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS)
  })

  it('creates and deeply clones independent ghost collections', () => {
    const firstEmpty = createEmptySkyLeagueGhosts()
    const secondEmpty = createEmptySkyLeagueGhosts()
    const canonical = canonicalizeSkyLeagueGhosts({
      race: RACE_GHOST,
      coin: { 'festival-hub': COIN_GHOST },
      mission: { 'first-skyknot': MISSION_GHOST },
    })
    const cloned = cloneSkyLeagueGhosts(canonical)

    expect(firstEmpty).toEqual(secondEmpty)
    expect(firstEmpty).not.toBe(secondEmpty)
    expect(firstEmpty.coin).not.toBe(secondEmpty.coin)
    expect(firstEmpty.mission).not.toBe(secondEmpty.mission)
    expect(isCanonicalSkyLeagueGhosts(canonical)).toBe(true)
    expect(cloned).toEqual(canonical)
    expect(cloned).not.toBe(canonical)
    expect(cloned.race).not.toBe(canonical.race)
    expect(cloned.race?.samples).not.toBe(canonical.race?.samples)
    expect(cloned.race?.samples[0]).not.toBe(canonical.race?.samples[0])
    expect(cloned.coin['festival-hub']).not.toBe(
      canonical.coin['festival-hub'],
    )
    expect(cloned.mission['first-skyknot']).not.toBe(
      canonical.mission['first-skyknot'],
    )
  })

  it('round-trips settings, exploration discoveries, league records, and ghosts in version 8', () => {
    const storage = new MemoryStorage()
    const settings = {
      bestTimeMs: 123_456,
      muted: true,
      musicVolume: 0.6,
      quality: 'low' as const,
      missionGrades: {
        'first-skyknot': 'gold' as const,
        'clean-flight': 'bronze' as const,
      },
      coinBestTimesMs: {
        'festival-hub': 18_250,
        'wind-canyon': 24_800,
      },
      skyLeague: {
        raceTop10Ms: [123_456, 130_000],
        coinTop10Ms: {
          'festival-hub': [18_250, 20_000],
          'wind-canyon': [24_800],
        },
        missionTop10: {
          'first-skyknot': [
            { elapsedMs: 123_456, grade: 'gold' as const },
          ],
        },
      },
      ghosts: {
        race: RACE_GHOST,
        coin: { 'festival-hub': COIN_GHOST },
        mission: { 'first-skyknot': MISSION_GHOST },
      },
      exploration: {
        position: { x: 430, y: 31, z: 190 },
        headingRadians: 1.25,
        movement: 'airborne' as const,
        discoveredRegionIds: ['festival-hub', 'cloud-ruins'] as const,
        destinationRegionId: 'cloud-ruins' as const,
        discoveredLandmarkIds: [
          'dawnwing-airfield',
          'whispering-grotto',
        ] as const,
        traversedWindZoneIds: ['harbor-lift'] as const,
      },
    }

    expect(saveSettings(storage, settings)).toBe(true)
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 8,
      ...settings,
    })
    expect(readSettings(storage)).toEqual(settings)
  })

  it('migrates version 6 without losing audio, race, mission, coin, or exploration progress', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 6,
        bestTimeMs: 123_000,
        muted: true,
        musicVolume: 0.55,
        quality: 'high',
        missionGrades: { 'first-skyknot': 'gold' },
        coinBestTimesMs: { 'festival-hub': 18_200 },
        exploration: {
          position: { x: 14, y: 22, z: -38 },
          headingRadians: 0.8,
          movement: 'airborne',
          discoveredRegionIds: ['festival-hub'],
          destinationRegionId: 'wind-canyon',
          discoveredLandmarkIds: ['sunweave-spire'],
          traversedWindZoneIds: ['harbor-lift'],
        },
      }),
    )

    expect(readSettings(storage)).toEqual({
      bestTimeMs: 123_000,
      muted: true,
      musicVolume: 0.55,
      quality: 'high',
      missionGrades: { 'first-skyknot': 'gold' },
      coinBestTimesMs: { 'festival-hub': 18_200 },
      skyLeague: {
        raceTop10Ms: [123_000],
        coinTop10Ms: { 'festival-hub': [18_200] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: {
        position: { x: 14, y: 22, z: -38 },
        headingRadians: 0.8,
        movement: 'airborne',
        discoveredRegionIds: ['festival-hub'],
        destinationRegionId: 'wind-canyon',
        discoveredLandmarkIds: [],
        traversedWindZoneIds: [],
      },
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toMatchObject({
      version: 8,
      bestTimeMs: 123_000,
      musicVolume: 0.55,
      missionGrades: { 'first-skyknot': 'gold' },
      coinBestTimesMs: { 'festival-hub': 18_200 },
      skyLeague: {
        raceTop10Ms: [123_000],
        coinTop10Ms: { 'festival-hub': [18_200] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: {
        discoveredLandmarkIds: [],
        traversedWindZoneIds: [],
      },
    })
  })

  it('migrates version 7 discoveries and keeps unique known landmark and wind-zone ids', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 7,
        bestTimeMs: 88_000,
        missionGrades: { 'time-trial': 'silver' },
        coinBestTimesMs: { 'festival-hub': 14_500 },
        exploration: {
          ...DEFAULT_SETTINGS.exploration,
          discoveredLandmarkIds: [
            'dawnwing-airfield',
            'unknown-landmark',
            'dawnwing-airfield',
            'whispering-grotto',
          ],
          traversedWindZoneIds: [
            'harbor-lift',
            'unknown-wind',
            'harbor-lift',
          ],
        },
      }),
    )

    expect(readSettings(storage).exploration).toMatchObject({
      discoveredLandmarkIds: [
        'dawnwing-airfield',
        'whispering-grotto',
      ],
      traversedWindZoneIds: ['harbor-lift'],
    })
    expect(readSettings(storage)).toMatchObject({
      bestTimeMs: 88_000,
      missionGrades: { 'time-trial': 'silver' },
      coinBestTimesMs: { 'festival-hub': 14_500 },
      skyLeague: {
        raceTop10Ms: [88_000],
        coinTop10Ms: { 'festival-hub': [14_500] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
    })
    expect(
      JSON.parse(storage.values.get(SETTINGS_KEY) ?? '').exploration,
    ).toMatchObject({
      discoveredLandmarkIds: [
        'dawnwing-airfield',
        'whispering-grotto',
      ],
      traversedWindZoneIds: ['harbor-lift'],
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '').version).toBe(8)
  })

  it('migrates version 5 without losing progress and defaults BGM volume', () => {
    const storage = new MemoryStorage()
    const exploration = {
      position: { x: 430, y: 31, z: 190 },
      headingRadians: 0.75,
      movement: 'airborne' as const,
      discoveredRegionIds: ['festival-hub', 'cloud-ruins'] as const,
      destinationRegionId: 'cloud-ruins' as const,
    }
    const migratedExploration = {
      ...exploration,
      discoveredLandmarkIds: [],
      traversedWindZoneIds: [],
    }
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 5,
        bestTimeMs: 42_500,
        muted: true,
        quality: 'high',
        missionGrades: { 'first-skyknot': 'silver' },
        coinBestTimesMs: { 'festival-hub': 17_200 },
        exploration,
      }),
    )

    expect(readSettings(storage)).toEqual({
      bestTimeMs: 42_500,
      muted: true,
      musicVolume: 0.35,
      quality: 'high',
      missionGrades: { 'first-skyknot': 'silver' },
      coinBestTimesMs: { 'festival-hub': 17_200 },
      skyLeague: {
        raceTop10Ms: [42_500],
        coinTop10Ms: { 'festival-hub': [17_200] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: migratedExploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toMatchObject({
      version: 8,
      bestTimeMs: 42_500,
      muted: true,
      musicVolume: 0.35,
      missionGrades: { 'first-skyknot': 'silver' },
      coinBestTimesMs: { 'festival-hub': 17_200 },
      skyLeague: {
        raceTop10Ms: [42_500],
        coinTop10Ms: { 'festival-hub': [17_200] },
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: migratedExploration,
    })
  })

  it('sanitizes invalid version 6 music volume without losing other fields', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 6,
        bestTimeMs: 48_000,
        muted: false,
        musicVolume: 4,
        quality: 'low',
      }),
    )

    expect(readSettings(storage)).toMatchObject({
      bestTimeMs: 48_000,
      muted: false,
      musicVolume: 0.35,
      quality: 'low',
    })
  })

  it('migrates the legacy version 1 best-time record', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      'skyknit-cup:best-time',
      JSON.stringify({ version: 1, bestTimeMs: 51_234 }),
    )

    expect(readSettings(storage)).toEqual({
      bestTimeMs: 51_234,
      muted: false,
      musicVolume: 0.35,
      quality: 'auto',
      missionGrades: {},
      coinBestTimesMs: {},
      skyLeague: {
        raceTop10Ms: [51_234],
        coinTop10Ms: {},
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: DEFAULT_SETTINGS.exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 8,
      bestTimeMs: 51_234,
      muted: false,
      musicVolume: 0.35,
      quality: 'auto',
      missionGrades: {},
      coinBestTimesMs: {},
      skyLeague: {
        raceTop10Ms: [51_234],
        coinTop10Ms: {},
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: DEFAULT_SETTINGS.exploration,
    })
  })

  it('migrates an existing version 2 document before the legacy record', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 2,
        bestTimeMs: 42_000,
        muted: true,
        quality: 'high',
      }),
    )
    storage.values.set(
      'skyknit-cup:best-time',
      JSON.stringify({ version: 1, bestTimeMs: 99_000 }),
    )

    expect(readSettings(storage)).toEqual({
      bestTimeMs: 42_000,
      muted: true,
      musicVolume: 0.35,
      quality: 'high',
      missionGrades: {},
      coinBestTimesMs: {},
      skyLeague: {
        raceTop10Ms: [42_000],
        coinTop10Ms: {},
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: DEFAULT_SETTINGS.exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 8,
      bestTimeMs: 42_000,
      muted: true,
      musicVolume: 0.35,
      quality: 'high',
      missionGrades: {},
      coinBestTimesMs: {},
      skyLeague: {
        raceTop10Ms: [42_000],
        coinTop10Ms: {},
        missionTop10: {},
      },
      ghosts: { race: null, coin: {}, mission: {} },
      exploration: DEFAULT_SETTINGS.exploration,
    })
  })

  it('migrates version 3 and fills exploration with defaults', () => {
    const storage = new MemoryStorage()
    storage.values.set(SETTINGS_KEY, JSON.stringify({ version: 3 }))

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '').version).toBe(8)
  })

  it('migrates version 4 exploration and fills empty coin records', () => {
    const storage = new MemoryStorage()
    const exploration = {
      position: { x: 430, y: 31, z: 190 },
      headingRadians: 0.75,
      movement: 'airborne',
      discoveredRegionIds: ['festival-hub', 'cloud-ruins'],
      destinationRegionId: 'cloud-ruins',
    }
    const migratedExploration = {
      ...exploration,
      discoveredLandmarkIds: [],
      traversedWindZoneIds: [],
    }
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({ version: 4, exploration }),
    )

    expect(readSettings(storage)).toEqual({
      ...DEFAULT_SETTINGS,
      exploration: migratedExploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toMatchObject({
      version: 8,
      coinBestTimesMs: {},
      exploration: migratedExploration,
    })
  })

  it('canonicalizes damaged version 8 league and ghost data while synchronizing compatibility summaries', () => {
    const storage = new MemoryStorage()
    const oversizedGhostSamples = Array.from(
      { length: 6_003 },
      (_, index) => [
        Math.round((index * 600_000) / 6_002),
        index,
        20,
        -index,
        0,
        0,
        0,
        0,
        Math.floor(index / 100),
      ],
    )
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 8,
        bestTimeMs: 99_000,
        muted: false,
        musicVolume: 0.4,
        quality: 'auto',
        missionGrades: { 'time-trial': 'bronze' },
        coinBestTimesMs: { 'festival-hub': 99_000 },
        skyLeague: {
          raceTop10Ms: [12, 4, -1, 8, 3, 11, 1, 7, 10, 6, 9, 5, 2],
          coinTop10Ms: {
            'festival-hub': [30, 10, 20, 0],
            unknown: [1],
          },
          missionTop10: {
            'time-trial': [
              { elapsedMs: 900, grade: 'silver' },
              { elapsedMs: 1_200, grade: 'gold' },
              { elapsedMs: 800, grade: 'gold' },
              { elapsedMs: -1, grade: 'gold' },
            ],
            unknown: [{ elapsedMs: 1, grade: 'gold' }],
          },
        },
        ghosts: {
          race: {
            durationMs: 300,
            samples: [
              [300, 3, 0, 0, 0, 0, 0, 0, 2],
              [100, 1, 0, 0, 0, 0, 0, 0, 0],
              [100, 99, 0, 0, 0, 0, 0, 0, 0],
              [0, 0, 0, 0, 0, 0, 0, 1, 0],
              [200, 'damaged', 0, 0, 0, 0, 0, 0, 1],
              [400, 4, 0, 0, 0, 0, 0, 0, 3],
            ],
          },
          coin: {
            'festival-hub': {
              durationMs: 600_000,
              samples: oversizedGhostSamples,
            },
            unknown: COIN_GHOST,
          },
          mission: { 'time-trial': MISSION_GHOST, unknown: {} },
        },
        exploration: DEFAULT_SETTINGS.exploration,
      }),
    )

    const settings = readSettings(storage)
    expect(settings).toMatchObject({
      bestTimeMs: 1,
      coinBestTimesMs: { 'festival-hub': 10 },
      missionGrades: { 'time-trial': 'gold' },
      skyLeague: {
        raceTop10Ms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        coinTop10Ms: { 'festival-hub': [10, 20, 30] },
        missionTop10: {
          'time-trial': [
            { elapsedMs: 800, grade: 'gold' },
            { elapsedMs: 1_200, grade: 'gold' },
            { elapsedMs: 900, grade: 'silver' },
          ],
        },
      },
      ghosts: {
        race: {
          durationMs: 300,
          samples: [
            [0, 0, 0, 0, 0, 0, 0, 1, 0],
            [100, 1, 0, 0, 0, 0, 0, 0, 0],
            [300, 3, 0, 0, 0, 0, 0, 0, 2],
          ],
        },
        mission: { 'time-trial': MISSION_GHOST },
      },
    })
    expect(deriveUnlockedMissionIds(settings.missionGrades)).toEqual([
      'first-skyknot',
      'boost-mastery',
      'no-respawn',
      'time-trial',
      'clean-flight',
    ])
    expect(
      JSON.parse(storage.values.get(SETTINGS_KEY) ?? '{}'),
    ).not.toHaveProperty('unlockedMissionIds')
    expect(settings.ghosts.coin['festival-hub']?.samples).toHaveLength(6_001)
    expect(settings.ghosts.coin['festival-hub']?.samples[0]?.[0]).toBe(0)
    expect(settings.ghosts.coin['festival-hub']?.samples.at(-1)?.[0]).toBe(
      600_000,
    )
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toMatchObject({
      version: 8,
      bestTimeMs: 1,
      coinBestTimesMs: { 'festival-hub': 10 },
      missionGrades: { 'time-trial': 'gold' },
      skyLeague: settings.skyLeague,
      ghosts: settings.ghosts,
    })
  })

  it('retains faster compatibility summaries when a damaged version 8 board is already non-empty', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 8,
        bestTimeMs: 90_000,
        coinBestTimesMs: { 'festival-hub': 12_000 },
        skyLeague: {
          raceTop10Ms: [100_000, 110_000],
          coinTop10Ms: { 'festival-hub': [14_000, 16_000] },
          missionTop10: {},
        },
        ghosts: { race: null, coin: {}, mission: {} },
        exploration: DEFAULT_SETTINGS.exploration,
      }),
    )

    const settings = readSettings(storage)

    expect(settings.bestTimeMs).toBe(90_000)
    expect(settings.skyLeague.raceTop10Ms).toEqual([
      90_000,
      100_000,
      110_000,
    ])
    expect(settings.coinBestTimesMs).toEqual({ 'festival-hub': 12_000 })
    expect(settings.skyLeague.coinTop10Ms['festival-hub']).toEqual([
      12_000,
      14_000,
      16_000,
    ])
  })

  it('returns deeply independent defaults for league and ghost collections', () => {
    const first = readSettings(new MemoryStorage())
    const second = readSettings(new MemoryStorage())

    expect(first).toEqual(DEFAULT_SETTINGS)
    expect(first).not.toBe(DEFAULT_SETTINGS)
    expect(first.skyLeague).not.toBe(second.skyLeague)
    expect(first.skyLeague.raceTop10Ms).not.toBe(
      second.skyLeague.raceTop10Ms,
    )
    expect(first.ghosts).not.toBe(second.ghosts)
    expect(first.ghosts.coin).not.toBe(second.ghosts.coin)
    expect(first.ghosts.mission).not.toBe(second.ghosts.mission)
  })

  it.each([
    'not json',
    '{}',
    '{"version":1,"bestTimeMs":50000}',
    '{"version":9,"bestTimeMs":50000}',
    '{"version":3,"bestTimeMs":0,"muted":"yes","quality":"ultra"}',
  ])('uses safe values for a damaged or unsupported document: %s', (value) => {
    const storage = new MemoryStorage()
    storage.values.set(SETTINGS_KEY, value)

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps only known mission ids and awarded grades from version 3', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        bestTimeMs: 45_000,
        muted: false,
        quality: 'auto',
        missionGrades: {
          'first-skyknot': 'silver',
          'clean-flight': 'failed',
          'unknown-mission': 'gold',
          'time-trial': 'platinum',
        },
      }),
    )

    expect(readSettings(storage).missionGrades).toEqual({
      'first-skyknot': 'silver',
    })
  })

  it('sanitizes damaged exploration fields in version 4', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 4,
        exploration: {
          position: { x: 99999, y: 'high', z: Number.NaN },
          headingRadians: Number.POSITIVE_INFINITY,
          movement: 'landing',
          discoveredRegionIds: ['festival-hub', 'unknown', 'festival-hub'],
          destinationRegionId: 'unknown',
        },
      }),
    )

    expect(readSettings(storage).exploration).toEqual({
      ...DEFAULT_SETTINGS.exploration,
      discoveredRegionIds: ['festival-hub'],
    })
  })

  it('keeps only known regions with positive finite coin records', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 5,
        coinBestTimesMs: {
          'festival-hub': 15_500,
          'wind-canyon': 0,
          'cloud-ruins': 'fast',
          'unknown-region': 12_000,
        },
      }),
    )

    expect(readSettings(storage).coinBestTimesMs).toEqual({
      'festival-hub': 15_500,
    })
  })

  it('updates only a faster valid regional coin record', () => {
    const records = {
      'festival-hub': 20_000,
      'wind-canyon': 25_000,
    } as const

    expect(recordCoinBestTime(records, 'festival-hub', 18_500)).toEqual({
      'festival-hub': 18_500,
      'wind-canyon': 25_000,
    })
    expect(recordCoinBestTime(records, 'festival-hub', 22_000)).toBe(records)
    expect(recordCoinBestTime(records, 'cloud-ruins', Number.NaN)).toBe(records)
  })

  it('records a slower regional coin run when it still earns a Top 10 rank', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      coinBestTimesMs: { 'festival-hub': 15_000 },
      skyLeague: {
        ...DEFAULT_SETTINGS.skyLeague,
        coinTop10Ms: { 'festival-hub': [15_000, 20_000] },
      },
    }

    const result = recordCoinCompetitionResult(
      settings,
      'festival-hub',
      18_000,
    )

    expect(result.settings.coinBestTimesMs).toEqual({
      'festival-hub': 15_000,
    })
    expect(result.settings.skyLeague.coinTop10Ms['festival-hub']).toEqual([
      15_000,
      18_000,
      20_000,
    ])
    expect(result.placement).toMatchObject({
      rank: 2,
      medal: 'silver',
      isNewBest: false,
      inserted: true,
    })
  })

  it('updates the regional best and Top 10 atomically for a winning coin run', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      coinBestTimesMs: { 'festival-hub': 15_000 },
      skyLeague: {
        ...DEFAULT_SETTINGS.skyLeague,
        coinTop10Ms: { 'festival-hub': [15_000, 20_000] },
      },
    }

    const result = recordCoinCompetitionResult(
      settings,
      'festival-hub',
      12_500,
    )

    expect(result.settings.coinBestTimesMs['festival-hub']).toBe(12_500)
    expect(result.settings.skyLeague.coinTop10Ms['festival-hub']).toEqual([
      12_500,
      15_000,
      20_000,
    ])
    expect(result.placement).toMatchObject({
      rank: 1,
      medal: 'gold',
      isNewBest: true,
      inserted: true,
    })
  })

  it('preserves settings identity when a coin run misses the Top 10', () => {
    const board = Array.from({ length: 10 }, (_, index) => 10_000 + index)
    const settings = {
      ...DEFAULT_SETTINGS,
      coinBestTimesMs: { 'festival-hub': board[0] },
      skyLeague: {
        ...DEFAULT_SETTINGS.skyLeague,
        coinTop10Ms: { 'festival-hub': board },
      },
    }

    const result = recordCoinCompetitionResult(
      settings,
      'festival-hub',
      30_000,
    )

    expect(result.settings).toBe(settings)
    expect(result.placement.inserted).toBe(false)
    expect(result.placement.rank).toBeNull()
  })

  it('continues with defaults when storage reads throw', () => {
    const storage = new MemoryStorage()
    storage.throwOnRead = true

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps a migrated legacy best time when the migration write throws', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      'skyknit-cup:best-time',
      JSON.stringify({ version: 1, bestTimeMs: 52_000 }),
    )
    storage.throwOnWrite = true

    expect(readSettings(storage).bestTimeMs).toBe(52_000)
  })

  it('reports a failed settings write without throwing', () => {
    const storage = new MemoryStorage()
    storage.throwOnWrite = true

    expect(saveSettings(storage, DEFAULT_SETTINGS)).toBe(false)
  })

  it('rejects missing required discovery arrays without throwing', () => {
    const storage = new MemoryStorage()
    const exploration = {
      ...DEFAULT_SETTINGS.exploration,
      discoveredLandmarkIds: undefined,
      traversedWindZoneIds: undefined,
    }

    expect(
      saveSettings(storage, {
        ...DEFAULT_SETTINGS,
        exploration,
      } as never),
    ).toBe(false)
    expect(storage.values.size).toBe(0)
  })

  it.each([
    { bestTimeMs: 0, muted: false, quality: 'auto' },
    { bestTimeMs: Number.NaN, muted: false, quality: 'auto' },
    { bestTimeMs: null, muted: 'no', quality: 'auto' },
    { bestTimeMs: null, muted: false, quality: 'ultra' },
  ])('rejects invalid settings without writing: %j', (settings) => {
    const storage = new MemoryStorage()

    expect(saveSettings(storage, settings as never)).toBe(false)
    expect(storage.values.size).toBe(0)
  })
})
