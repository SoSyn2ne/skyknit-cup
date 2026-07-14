import { describe, expect, it } from 'vitest'

import {
  formatCoinLeagueResult,
  formatCoinRunTime,
  formatExploreDistance,
  formatFestivalDiscoveryNotice,
  formatFestivalJourneyLine,
  formatFestivalMapProgress,
  getExploreContextLabel,
  resolveCoinLeagueRegionId,
} from './ExplorationHud'
import type { FestivalJourneyObjectiveId } from '../world/festivalHubActivities'

describe('exploration HUD formatting', () => {
  it('formats short and long destination distances compactly', () => {
    expect(formatExploreDistance(87.8)).toBe('88 m')
    expect(formatExploreDistance(1_420)).toBe('1.4 km')
    expect(formatExploreDistance(Number.NaN)).toBe('—')
  })

  it('prioritizes challenge, then takeoff, then landing actions', () => {
    expect(getExploreContextLabel(true, 'airborne', true)).toBe('레이스 도전')
    expect(getExploreContextLabel(false, 'landed', true)).toBe('이륙')
    expect(getExploreContextLabel(false, 'airborne', true)).toBe('착륙')
    expect(getExploreContextLabel(false, 'airborne', false)).toBeNull()
  })

  it('formats the coin run clock with a stable compact width', () => {
    expect(formatCoinRunTime(0)).toBe('0:00.000')
    expect(formatCoinRunTime(65_432)).toBe('1:05.432')
    expect(formatCoinRunTime(Number.NaN)).toBe('0:00.000')
  })

  it('summarizes a completed regional Sky League run without a live countdown', () => {
    expect(
      formatCoinLeagueResult({
        rank: 2,
        medal: 'silver',
        isNewBest: false,
        inserted: true,
      }),
    ).toBe('지역 2위 · 은메달 · 잠시 후 다시 도전할 수 있어요')
    expect(
      formatCoinLeagueResult({
        rank: null,
        medal: null,
        isNewBest: false,
        inserted: false,
      }),
    ).toBe('지역 Top 10 밖 · 잠시 후 다시 도전할 수 있어요')
  })

  it('keeps the current-region board available while idle and pins an active course', () => {
    expect(resolveCoinLeagueRegionId(null, 'cloud-ruins')).toBe('cloud-ruins')
    expect(
      resolveCoinLeagueRegionId('festival-hub', 'cloud-ruins'),
    ).toBe('festival-hub')
    expect(resolveCoinLeagueRegionId(null, null)).toBeNull()
  })

  it.each([
    ['landmarks', 1, 2, '여정 1/5 · 다음: 랜드마크 2/4 발견'],
    ['wind-zones', 2, 1, '여정 2/5 · 다음: 상승기류 1/3 통과'],
    ['secret', 2, 3, '여정 2/5 · 다음: 비밀 장소 찾기'],
    ['coin-run', 3, 3, '여정 3/5 · 다음: 하늘동전 기록 남기기'],
    ['race-mission', 4, 3, '여정 4/5 · 다음: 아치 레이스 완주'],
    [null, 5, 3, '여정 5/5 · 축제 여정 완료'],
  ] as const)(
    'formats the %s festival objective compactly',
    (nextObjectiveId, completedSteps, windZoneCount, expected) => {
      expect(
        formatFestivalJourneyLine({
          completedSteps,
          totalSteps: 5,
          nextObjectiveId: nextObjectiveId as FestivalJourneyObjectiveId | null,
          isComplete: nextObjectiveId === null,
          publicLandmarkCount: 2,
          windZoneCount,
          secretDiscovered: false,
        }),
      ).toBe(expected)
    },
  )

  it('does not count an early secret as a public landmark', () => {
    expect(
      formatFestivalJourneyLine({
        completedSteps: 1,
        totalSteps: 5,
        nextObjectiveId: 'landmarks',
        isComplete: false,
        publicLandmarkCount: 0,
        windZoneCount: 0,
        secretDiscovered: true,
      }),
    ).toBe('여정 1/5 · 다음: 랜드마크 0/4 발견')
  })

  it('summarizes Festival Hub progress and records inside the map', () => {
    expect(
      formatFestivalMapProgress(
        {
          completedSteps: 2,
          totalSteps: 5,
          nextObjectiveId: 'wind-zones',
          isComplete: false,
          publicLandmarkCount: 3,
          windZoneCount: 1,
          secretDiscovered: true,
        },
        65_432,
        'golden-knot',
      ),
    ).toBe(
      '축제 여정 · 랜드마크 3/4 · 상승기류 1/3 · 비밀 발견 · 동전 최고 1:05.432 · 선택 미션 황금 하늘매듭 · 왕관 레이스 아치에서 도전',
    )
    expect(
      formatFestivalMapProgress(
        {
          completedSteps: 0,
          totalSteps: 5,
          nextObjectiveId: 'landmarks',
          isComplete: false,
          publicLandmarkCount: 0,
          windZoneCount: 0,
          secretDiscovered: false,
        },
        undefined,
        'first-skyknot',
      ),
    ).toContain(
      '비밀 미발견 · 동전 최고 미기록 · 선택 미션 첫 하늘매듭 · 왕관 레이스 아치에서 도전',
    )
  })

  it('adds the selected golden-knot mission and Crown Race Arch guidance to map progress', () => {
    const progress = formatFestivalMapProgress(
      {
        completedSteps: 4,
        totalSteps: 5,
        nextObjectiveId: 'race-mission',
        isComplete: false,
        publicLandmarkCount: 4,
        windZoneCount: 3,
        secretDiscovered: true,
      },
      65_432,
      'golden-knot',
    )

    expect(progress).toContain('선택 미션 황금 하늘매듭')
    expect(progress).toContain('왕관 레이스 아치에서 도전')
  })

  it.each([
    [
      { newLandmarkIds: ['dawnwing-airfield'], newWindZoneIds: [] },
      '랜드마크 발견 · 새벽날개 비행장',
    ],
    [
      { newLandmarkIds: ['whispering-grotto'], newWindZoneIds: [] },
      '비밀 장소 발견 · 속삭임 동굴',
    ],
    [
      { newLandmarkIds: [], newWindZoneIds: ['harbor-lift'] },
      '상승기류 발견 · 항구 상승류',
    ],
    [
      {
        newLandmarkIds: ['dawnwing-airfield'],
        newWindZoneIds: ['harbor-lift'],
      },
      '새 발견 2개 · 새벽날개 비행장, 항구 상승류',
    ],
    [{ newLandmarkIds: [], newWindZoneIds: [] }, null],
  ] as const)('formats festival discovery notice %#', (step, expected) => {
    expect(formatFestivalDiscoveryNotice(step)).toBe(expected)
  })
})
