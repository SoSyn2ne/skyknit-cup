import { describe, expect, it } from 'vitest'

import {
  formatMissionGrade,
  formatMissionProgress,
  formatMusicVolumePercent,
  formatRaceTime,
} from './RaceHud'

describe('race time formatting', () => {
  it('keeps a stable minute, second, and millisecond shape', () => {
    expect(formatRaceTime(0)).toBe('0:00.000')
    expect(formatRaceTime(123_456)).toBe('2:03.456')
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back safely for invalid elapsed time %s',
    (value) => {
      expect(formatRaceTime(value)).toBe('0:00.000')
    },
  )
})

describe('mission HUD formatting', () => {
  const attempt = {
    elapsedMs: 91_250,
    nextCheckpointIndex: 4,
    collisionCount: 1,
    respawnCount: 2,
    boostActivationCount: 3,
    finished: false,
  }

  it.each([
    [null, '기록 없음'],
    ['bronze', '브론즈'],
    ['silver', '실버'],
    ['gold', '골드'],
  ] as const)('formats mission grade %s', (grade, label) => {
    expect(formatMissionGrade(grade)).toBe(label)
  })

  it.each([
    ['first-skyknot', '관문 4/12 · 1:31.250'],
    ['time-trial', '1:31.250 / 3:00.000'],
    ['clean-flight', '관문 4/12 · 충돌 1'],
    ['no-respawn', '관문 4/12 · 리스폰 2'],
    ['boost-mastery', '관문 4/12 · 돌풍 3회'],
    ['golden-knot', '1:31.250 · 충돌 1 · 리스폰 2 · 돌풍 3'],
  ] as const)('formats %s progress', (missionId, label) => {
    expect(formatMissionProgress(missionId, attempt, 12)).toBe(label)
  })
})

describe('audio setting formatting', () => {
  it('formats a clamped BGM volume percentage', () => {
    expect(formatMusicVolumePercent(0.35)).toBe('35%')
    expect(formatMusicVolumePercent(1.4)).toBe('100%')
    expect(formatMusicVolumePercent(Number.NaN)).toBe('35%')
  })
})
