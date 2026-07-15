import { describe, expect, it } from 'vitest'

import {
  CHARACTER_ACCESSORIES,
  CHARACTER_CATALOG,
  CHARACTER_PALETTES,
  DEFAULT_CHARACTER_LOADOUT,
  normalizeCharacterLoadout,
} from './characterCatalog'

describe('character customization catalog', () => {
  it('uses the sunrise dragon without an accessory as the immutable default', () => {
    expect(DEFAULT_CHARACTER_LOADOUT).toEqual({
      characterId: 'sunrise-dragon',
      paletteId: 'sunrise',
      accessoryId: 'none',
    })
    expect(Object.isFrozen(DEFAULT_CHARACTER_LOADOUT)).toBe(true)
  })

  it('provides exactly the three approved creature silhouettes', () => {
    expect(CHARACTER_CATALOG.map((character) => character.id)).toEqual([
      'sunrise-dragon',
      'storm-griffin',
      'cloud-manta',
    ])
  })

  it('provides exactly the three approved palettes', () => {
    expect(CHARACTER_PALETTES.map((palette) => palette.id)).toEqual([
      'sunrise',
      'storm',
      'moonlight',
    ])
  })

  it('provides exactly the three approved accessory choices', () => {
    expect(CHARACTER_ACCESSORIES.map((accessory) => accessory.id)).toEqual([
      'none',
      'wind-goggles',
      'festival-ribbon',
    ])
  })

  it('accepts all 27 combinations without changing their independent choices', () => {
    const combinations = CHARACTER_CATALOG.flatMap((character) =>
      CHARACTER_PALETTES.flatMap((palette) =>
        CHARACTER_ACCESSORIES.map((accessory) => ({
          characterId: character.id,
          paletteId: palette.id,
          accessoryId: accessory.id,
        })),
      ),
    )

    expect(combinations).toHaveLength(27)
    for (const loadout of combinations) {
      expect(normalizeCharacterLoadout(loadout)).toEqual(loadout)
    }
  })

  it.each([
    {
      damaged: {
        characterId: 'unknown-creature',
        paletteId: 'moonlight',
        accessoryId: 'festival-ribbon',
      },
      expected: {
        characterId: 'sunrise-dragon',
        paletteId: 'moonlight',
        accessoryId: 'festival-ribbon',
      },
    },
    {
      damaged: {
        characterId: 'storm-griffin',
        paletteId: 'neon',
        accessoryId: 'wind-goggles',
      },
      expected: {
        characterId: 'storm-griffin',
        paletteId: 'sunrise',
        accessoryId: 'wind-goggles',
      },
    },
    {
      damaged: {
        characterId: 'cloud-manta',
        paletteId: 'storm',
        accessoryId: 'crown',
      },
      expected: {
        characterId: 'cloud-manta',
        paletteId: 'storm',
        accessoryId: 'none',
      },
    },
  ])(
    'repairs only a damaged loadout axis while retaining the other valid choices',
    ({ damaged, expected }) => {
      expect(normalizeCharacterLoadout(damaged)).toEqual(expected)
    },
  )

  it('falls back to the complete default for a non-object document', () => {
    expect(normalizeCharacterLoadout(null)).toEqual(
      DEFAULT_CHARACTER_LOADOUT,
    )
  })
})
