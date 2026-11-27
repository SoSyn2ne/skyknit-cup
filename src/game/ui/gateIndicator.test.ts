import { describe, expect, it } from 'vitest'

import {
  createGateIndicator,
  type IndicatorAvoidanceRect,
} from './gateIndicator'

const viewport = { width: 320, height: 568 }

function overlaps(
  indicator: { readonly left: number; readonly top: number },
  rect: IndicatorAvoidanceRect,
): boolean {
  return !(
    indicator.left + 22 <= rect.left ||
    indicator.left - 22 >= rect.left + rect.width ||
    indicator.top + 22 <= rect.top ||
    indicator.top - 22 >= rect.top + rect.height
  )
}

describe('active gate edge indicator', () => {
  it('stays hidden when the on-screen gate is at least 48 CSS pixels', () => {
    const indicator = createGateIndicator(
      { x: 0.25, y: 0.2, z: 0.5 },
      52,
      viewport,
    )

    expect(indicator.show).toBe(false)
  })

  it('appears at the screen edge when an on-screen gate is too small', () => {
    const indicator = createGateIndicator(
      { x: 0, y: 0, z: 0.9 },
      40,
      viewport,
    )

    expect(indicator.show).toBe(true)
    expect(indicator.top).toBe(32)
    expect(indicator.left).toBe(viewport.width / 2)
  })

  it('clamps an off-screen gate direction inside the safe margin', () => {
    const indicator = createGateIndicator(
      { x: 2, y: 0.25, z: 0.5 },
      80,
      viewport,
    )

    expect(indicator.show).toBe(true)
    expect(indicator.left).toBe(viewport.width - 32)
    expect(indicator.top).toBeGreaterThan(32)
    expect(indicator.top).toBeLessThan(viewport.height - 32)
  })

  it('keeps a behind-right target on the right side of the viewport', () => {
    const indicator = createGateIndicator(
      { x: -0.2, y: 0, z: 1.02, behindCamera: true },
      80,
      viewport,
    )

    expect(indicator.show).toBe(true)
    expect(indicator.left).toBe(viewport.width - 32)
  })

  it('keeps the marker hidden when no active gate projection exists', () => {
    const indicator = createGateIndicator(null, 0, viewport)

    expect(indicator.show).toBe(false)
  })

  it('shows the guide when an on-screen gate is visually covered by the HUD', () => {
    const landscapeViewport = { width: 844, height: 390 }
    const topRightMetric = {
      left: 680,
      top: 16,
      width: 148,
      height: 54,
    }

    const indicator = createGateIndicator(
      {
        x: (725.99 - landscapeViewport.width / 2) / (landscapeViewport.width / 2),
        y: (landscapeViewport.height / 2 - 70.65) / (landscapeViewport.height / 2),
        z: 0.5,
      },
      64,
      landscapeViewport,
      [topRightMetric],
    )

    expect(indicator.show).toBe(true)
    expect(indicator.angleRadians).toBeLessThan(0)
    expect(overlaps(indicator, topRightMetric)).toBe(false)
  })

  it('moves an off-screen guide inward when the edge cue would sit under HUD chrome', () => {
    const blockedEdge = {
      left: viewport.width - 58,
      top: 252,
      width: 52,
      height: 76,
    }

    const indicator = createGateIndicator(
      { x: 2, y: 0.25, z: 0.5 },
      80,
      viewport,
      [blockedEdge],
    )

    expect(indicator.show).toBe(true)
    expect(indicator.left).toBeLessThan(viewport.width - 32)
    expect(overlaps(indicator, blockedEdge)).toBe(false)
  })

  it('preserves the old edge placement when no avoidance rectangles are supplied', () => {
    const indicator = createGateIndicator(
      { x: 2, y: 0.25, z: 0.5 },
      80,
      viewport,
      [],
    )

    expect(indicator.show).toBe(true)
    expect(indicator.left).toBe(viewport.width - 32)
  })
})
