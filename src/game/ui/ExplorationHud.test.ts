import { describe, expect, it } from 'vitest'

import {
  formatCoinRunTime,
  formatExploreDistance,
  getExploreContextLabel,
} from './ExplorationHud'

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
})
