import { describe, expect, it } from 'vitest'

import {
  ADVENTURE_HOME,
  ADVENTURE_LANDING_PAD,
  ADVENTURE_POINTS,
  ADVENTURE_ROUTES,
  ADVENTURE_SEARCH_POINT_IDS,
  getAdventureTravelEstimate,
} from './adventureWorld'

describe('adventure authored travel contracts', () => {
  it('spawns within talk range with a separate ground-height landing pad', () => {
    expect(ADVENTURE_LANDING_PAD.position).toEqual({ x: -82, y: 6, z: 30 })
    expect(ADVENTURE_LANDING_PAD.radius).toBe(14)
    const keeper = ADVENTURE_POINTS.keeper
    expect(Math.hypot(ADVENTURE_HOME.position.x - keeper.position.x,
      ADVENTURE_HOME.position.y + 1.2 - keeper.position.y,
      ADVENTURE_HOME.position.z - keeper.position.z)).toBeLessThan(keeper.interactionRadius)
  })

  it('puts the first rescue near home without imposing a time gate', () => {
    const from = ADVENTURE_POINTS.keeper.position
    const to = ADVENTURE_POINTS.rescue.position
    const directReturnSeconds = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * 2 / 18
    // Travel lower bound only; a real input run verifies the under-three-minute reward target.
    expect(directReturnSeconds).toBeLessThan(30)
  })

  it('has four distinct devices per branch with lower longer sheltered travel and taller ridge travel', () => {
    const sheltered = ADVENTURE_ROUTES.sheltered.pointIds
    const ridge = ADVENTURE_ROUTES.ridge.pointIds
    expect(new Set(sheltered).size).toBe(4)
    expect(new Set(ridge).size).toBe(4)
    expect(Math.max(...sheltered.map((id) => ADVENTURE_POINTS[id].position.y))).toBeLessThan(40)
    expect(Math.max(...ridge.map((id) => ADVENTURE_POINTS[id].position.y))).toBeGreaterThan(100)
    expect(getAdventureTravelEstimate('sheltered').distance).toBeGreaterThan(getAdventureTravelEstimate('ridge').distance * 1.15)
  })

  it.each(['sheltered', 'ridge'] as const)('requires moving between every successive %s objective', (route) => {
    const ids = ['keeper', 'rescue', 'bird-return', ...ADVENTURE_ROUTES[route].pointIds,
      ...ADVENTURE_SEARCH_POINT_IDS, 'ruins', 'repair']
    for (let index = 1; index < ids.length; index += 1) {
      const previous = ADVENTURE_POINTS[ids[index - 1]]
      const current = ADVENTURE_POINTS[ids[index]]
      expect(Math.hypot(current.position.x - previous.position.x,
        current.position.y - previous.position.y, current.position.z - previous.position.z))
        .toBeGreaterThan(previous.interactionRadius + current.interactionRadius)
    }
  })

  it('keeps all spatial data finite and every point keyed by its stable save identifier', () => {
    for (const [id, point] of Object.entries(ADVENTURE_POINTS)) {
      expect(point.id).toBe(id)
      expect(Object.values(point.position).every(Number.isFinite)).toBe(true)
      expect(point.interactionRadius).toBeGreaterThan(0)
      expect(point.label.length).toBeGreaterThan(0)
      expect(point.actionLabel.length).toBeGreaterThan(0)
    }
  })
})
