import { describe, expect, it } from 'vitest'

import { createGateIndicator } from './gateIndicator'

const viewport = { width: 320, height: 568 }

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
})
