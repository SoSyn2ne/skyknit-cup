export const CHARACTER_IDS = Object.freeze([
  'sunrise-dragon',
  'ember-phoenix',
  'storm-white-tiger',
] as const)

export const CHARACTER_PALETTE_IDS = Object.freeze([
  'sunrise',
  'storm',
  'moonlight',
] as const)

export const CHARACTER_ACCESSORY_IDS = Object.freeze([
  'none',
  'wind-goggles',
  'festival-ribbon',
] as const)

export type CharacterId = (typeof CHARACTER_IDS)[number]
export type CharacterPaletteId = (typeof CHARACTER_PALETTE_IDS)[number]
export type CharacterAccessoryId =
  (typeof CHARACTER_ACCESSORY_IDS)[number]
export type CharacterMotionProfile = 'dragon' | 'avian' | 'feline'

export interface CharacterLoadout {
  readonly characterId: CharacterId
  readonly paletteId: CharacterPaletteId
  readonly accessoryId: CharacterAccessoryId
}

export interface CharacterDefinition {
  readonly id: CharacterId
  readonly label: string
  readonly description: string
  readonly modelPath: string
  readonly motionProfile: CharacterMotionProfile
  readonly bodyTintStrength: number
}

export interface CharacterPaletteDefinition {
  readonly id: CharacterPaletteId
  readonly label: string
  readonly body: string
  readonly membrane: string
  readonly glow: string
}

export interface CharacterAccessoryDefinition {
  readonly id: CharacterAccessoryId
  readonly label: string
  readonly modelPath: string | null
  readonly anchor: 'none' | 'head' | 'tail'
}

function freezeCatalog<T extends object>(entries: readonly T[]): readonly T[] {
  return Object.freeze(entries.map((entry) => Object.freeze(entry)))
}

export const CHARACTER_CATALOG: readonly CharacterDefinition[] =
  freezeCatalog([
    {
      id: 'sunrise-dragon',
      label: '해뜰녘 드래곤',
      description:
        '첫 하늘매듭의 길을 기억하고 잠든 바람 관문을 깨우는 새벽의 수호자',
      modelPath: 'assets/models/characters/skyknit-dragon.glb',
      motionProfile: 'dragon',
      bodyTintStrength: 1,
    },
    {
      id: 'ember-phoenix',
      label: '잿불 봉황',
      description:
        '구름 유적의 잿불에서 되살아나 흩어진 햇실 조각에 온기를 되돌리는 수호자',
      modelPath: 'assets/models/characters/skyknit-phoenix.glb',
      motionProfile: 'avian',
      bodyTintStrength: 0.55,
    },
    {
      id: 'storm-white-tiger',
      label: '폭풍 백호',
      description:
        '큰 깃털 날개로 바람 협곡의 폭풍을 가르며 끊어진 매듭을 단단히 조이는 수호자',
      modelPath: 'assets/models/characters/skyknit-white-tiger.glb',
      motionProfile: 'feline',
      bodyTintStrength: 0.18,
    },
  ])

export const CHARACTER_PALETTES: readonly CharacterPaletteDefinition[] =
  freezeCatalog([
    {
      id: 'sunrise',
      label: '해뜰녘',
      body: '#d94a32',
      membrane: '#f2b94b',
      glow: '#45d8c4',
    },
    {
      id: 'storm',
      label: '폭풍',
      body: '#34495e',
      membrane: '#7892a8',
      glow: '#8ee9ff',
    },
    {
      id: 'moonlight',
      label: '달빛',
      body: '#554f8d',
      membrane: '#b18bd9',
      glow: '#e5ddff',
    },
  ])

export const CHARACTER_ACCESSORIES: readonly CharacterAccessoryDefinition[] =
  freezeCatalog([
    {
      id: 'none',
      label: '없음',
      modelPath: null,
      anchor: 'none',
    },
    {
      id: 'wind-goggles',
      label: '바람 고글',
      modelPath: 'assets/models/characters/wind-goggles.glb',
      anchor: 'head',
    },
    {
      id: 'festival-ribbon',
      label: '축제 리본',
      modelPath: 'assets/models/characters/festival-ribbon.glb',
      anchor: 'tail',
    },
  ])

export const DEFAULT_CHARACTER_LOADOUT: CharacterLoadout = Object.freeze({
  characterId: 'sunrise-dragon',
  paletteId: 'sunrise',
  accessoryId: 'none',
})

const CHARACTER_ID_SET = new Set<string>(CHARACTER_IDS)
const PALETTE_ID_SET = new Set<string>(CHARACTER_PALETTE_IDS)
const ACCESSORY_ID_SET = new Set<string>(CHARACTER_ACCESSORY_IDS)
const LEGACY_CHARACTER_ID_REPLACEMENTS = Object.freeze({
  'storm-griffin': 'ember-phoenix',
  'cloud-manta': 'storm-white-tiger',
} satisfies Readonly<Record<string, CharacterId>>)

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_ID_SET.has(value)
}

export function isCharacterPaletteId(
  value: unknown,
): value is CharacterPaletteId {
  return typeof value === 'string' && PALETTE_ID_SET.has(value)
}

export function isCharacterAccessoryId(
  value: unknown,
): value is CharacterAccessoryId {
  return typeof value === 'string' && ACCESSORY_ID_SET.has(value)
}

function normalizeCharacterId(value: unknown): CharacterId {
  if (isCharacterId(value)) return value
  if (typeof value !== 'string') return DEFAULT_CHARACTER_LOADOUT.characterId
  return (
    LEGACY_CHARACTER_ID_REPLACEMENTS[
      value as keyof typeof LEGACY_CHARACTER_ID_REPLACEMENTS
    ] ?? DEFAULT_CHARACTER_LOADOUT.characterId
  )
}

export function isCharacterLoadout(value: unknown): value is CharacterLoadout {
  return (
    isObjectRecord(value) &&
    isCharacterId(value.characterId) &&
    isCharacterPaletteId(value.paletteId) &&
    isCharacterAccessoryId(value.accessoryId)
  )
}

export function normalizeCharacterLoadout(value: unknown): CharacterLoadout {
  if (!isObjectRecord(value)) return DEFAULT_CHARACTER_LOADOUT

  return {
    characterId: normalizeCharacterId(value.characterId),
    paletteId: isCharacterPaletteId(value.paletteId)
      ? value.paletteId
      : DEFAULT_CHARACTER_LOADOUT.paletteId,
    accessoryId: isCharacterAccessoryId(value.accessoryId)
      ? value.accessoryId
      : DEFAULT_CHARACTER_LOADOUT.accessoryId,
  }
}
