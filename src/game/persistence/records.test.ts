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

  it('round-trips settings, exploration, and coin records in version 5', () => {
    const storage = new MemoryStorage()
    const settings = {
      bestTimeMs: 123_456,
      muted: true,
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
      },
    }

    expect(saveSettings(storage, settings)).toBe(true)
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 5,
      ...settings,
    })
    expect(readSettings(storage)).toEqual(settings)
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
      quality: 'auto',
      missionGrades: {},
      coinBestTimesMs: {},
      exploration: DEFAULT_SETTINGS.exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 5,
      bestTimeMs: 51_234,
      muted: false,
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
      quality: 'high',
      missionGrades: {},
      coinBestTimesMs: {},
      exploration: DEFAULT_SETTINGS.exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toEqual({
      version: 5,
      bestTimeMs: 42_000,
      muted: true,
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
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '').version).toBe(5)
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
    storage.values.set(
      SETTINGS_KEY,
      JSON.stringify({ version: 4, exploration }),
    )

    expect(readSettings(storage)).toEqual({
      ...DEFAULT_SETTINGS,
      exploration,
    })
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '')).toMatchObject({
      version: 5,
      coinBestTimesMs: {},
      exploration,
    })
  })

  it.each([
    'not json',
    '{}',
    '{"version":1,"bestTimeMs":50000}',
    '{"version":6,"bestTimeMs":50000}',
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
