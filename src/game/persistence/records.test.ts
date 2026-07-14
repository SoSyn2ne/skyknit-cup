import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  readSettings,
  recordCoinBestTime,
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

describe('versioned game settings', () => {
  it('returns safe defaults when no settings exist', () => {
    expect(readSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips settings, exploration discoveries, and coin records in version 7', () => {
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
      version: 7,
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
      version: 7,
      bestTimeMs: 123_000,
      musicVolume: 0.55,
      missionGrades: { 'first-skyknot': 'gold' },
      coinBestTimesMs: { 'festival-hub': 18_200 },
    })
  })

  it('keeps unique known landmark and wind-zone ids from version 7', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({
        version: 7,
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
      exploration: migratedExploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toMatchObject({
      version: 7,
      bestTimeMs: 42_500,
      muted: true,
      musicVolume: 0.35,
      missionGrades: { 'first-skyknot': 'silver' },
      coinBestTimesMs: { 'festival-hub': 17_200 },
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
      exploration: DEFAULT_SETTINGS.exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 7,
      bestTimeMs: 51_234,
      muted: false,
      musicVolume: 0.35,
      quality: 'auto',
      missionGrades: {},
      coinBestTimesMs: {},
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
      exploration: DEFAULT_SETTINGS.exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 7,
      bestTimeMs: 42_000,
      muted: true,
      musicVolume: 0.35,
      quality: 'high',
      missionGrades: {},
      coinBestTimesMs: {},
      exploration: DEFAULT_SETTINGS.exploration,
    })
  })

  it('migrates version 3 and fills exploration with defaults', () => {
    const storage = new MemoryStorage()
    storage.values.set(SETTINGS_KEY, JSON.stringify({ version: 3 }))

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '').version).toBe(7)
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
      version: 7,
      coinBestTimesMs: {},
      exploration: migratedExploration,
    })
  })

  it.each([
    'not json',
    '{}',
    '{"version":1,"bestTimeMs":50000}',
    '{"version":8,"bestTimeMs":50000}',
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
