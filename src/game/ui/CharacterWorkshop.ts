import {
  CHARACTER_ACCESSORIES,
  CHARACTER_CATALOG,
  CHARACTER_PALETTES,
  type CharacterLoadout,
} from '../customization/characterCatalog'

export type { CharacterLoadout } from '../customization/characterCatalog'

export interface CharacterWorkshopActions {
  readonly preview: (loadout: CharacterLoadout) => void
  readonly apply: (loadout: CharacterLoadout) => void
  readonly cancel: () => void
}

export interface CharacterWorkshop {
  readonly element: HTMLElement
  open(loadout: CharacterLoadout, opener: HTMLElement): void
  dispose(): void
}

let workshopInstanceCount = 0

export function createCharacterWorkshop(
  host: HTMLElement,
  actions: CharacterWorkshopActions,
): CharacterWorkshop {
  workshopInstanceCount += 1
  const idPrefix = `character-workshop-${workshopInstanceCount}`

  const root = document.createElement('div')
  root.className = 'character-workshop'
  root.hidden = true

  const dialog = document.createElement('section')
  dialog.className = 'character-workshop__dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', `${idPrefix}-title`)

  const title = document.createElement('h2')
  title.id = `${idPrefix}-title`
  title.textContent = '캐릭터 꾸미기'

  const description = document.createElement('p')
  description.className = 'character-workshop__description'
  description.textContent =
    '비행 생명체의 형태와 색상, 장식을 골라 미리 확인하세요.'

  const form = document.createElement('div')
  form.className = 'character-workshop__fields'

  const characterLabel = document.createElement('label')
  characterLabel.htmlFor = `${idPrefix}-character`
  characterLabel.textContent = '캐릭터 형태'
  const characterSelect = document.createElement('select')
  characterSelect.id = characterLabel.htmlFor
  for (const character of CHARACTER_CATALOG) {
    const option = document.createElement('option')
    option.value = character.id
    option.textContent = character.label
    characterSelect.append(option)
  }

  const guardianDescription = document.createElement('p')
  guardianDescription.className = 'character-workshop__guardian-description'
  guardianDescription.setAttribute('aria-live', 'polite')

  const updateGuardianDescription = (characterId: string): void => {
    guardianDescription.textContent =
      CHARACTER_CATALOG.find((character) => character.id === characterId)
        ?.description ?? CHARACTER_CATALOG[0]?.description ?? ''
  }
  updateGuardianDescription(characterSelect.value)

  const paletteLabel = document.createElement('label')
  paletteLabel.htmlFor = `${idPrefix}-palette`
  paletteLabel.textContent = '색상'
  const paletteSelect = document.createElement('select')
  paletteSelect.id = paletteLabel.htmlFor
  for (const palette of CHARACTER_PALETTES) {
    const option = document.createElement('option')
    option.value = palette.id
    option.textContent = palette.label
    paletteSelect.append(option)
  }

  const accessoryLabel = document.createElement('label')
  accessoryLabel.htmlFor = `${idPrefix}-accessory`
  accessoryLabel.textContent = '장식'
  const accessorySelect = document.createElement('select')
  accessorySelect.id = accessoryLabel.htmlFor
  for (const accessory of CHARACTER_ACCESSORIES) {
    const option = document.createElement('option')
    option.value = accessory.id
    option.textContent = accessory.label
    accessorySelect.append(option)
  }

  form.append(
    characterLabel,
    characterSelect,
    paletteLabel,
    paletteSelect,
    accessoryLabel,
    accessorySelect,
  )

  const actionRow = document.createElement('div')
  actionRow.className = 'character-workshop__actions'
  const apply = document.createElement('button')
  apply.type = 'button'
  apply.textContent = '적용'
  const back = document.createElement('button')
  back.type = 'button'
  back.textContent = '돌아가기'
  actionRow.append(apply, back)

  dialog.append(title, description, guardianDescription, form, actionRow)
  root.append(dialog)
  host.append(root)

  let committedLoadout: CharacterLoadout | null = null
  let draftLoadout: CharacterLoadout | null = null
  let openerElement: HTMLElement | null = null

  const close = (): void => {
    root.hidden = true
    const opener = openerElement
    openerElement = null
    opener?.focus({ preventScroll: true })
  }

  const cancel = (): void => {
    if (root.hidden || committedLoadout === null) return
    actions.preview({ ...committedLoadout })
    actions.cancel()
    close()
  }

  const previewDraft = (nextDraft: CharacterLoadout): void => {
    draftLoadout = nextDraft
    actions.preview({ ...nextDraft })
  }

  characterSelect.addEventListener('change', () => {
    if (draftLoadout === null) return
    updateGuardianDescription(characterSelect.value)
    previewDraft({
      ...draftLoadout,
      characterId:
        characterSelect.value as CharacterLoadout['characterId'],
    })
  })
  paletteSelect.addEventListener('change', () => {
    if (draftLoadout === null) return
    previewDraft({
      ...draftLoadout,
      paletteId: paletteSelect.value as CharacterLoadout['paletteId'],
    })
  })
  accessorySelect.addEventListener('change', () => {
    if (draftLoadout === null) return
    previewDraft({
      ...draftLoadout,
      accessoryId:
        accessorySelect.value as CharacterLoadout['accessoryId'],
    })
  })

  apply.addEventListener('click', () => {
    if (root.hidden || draftLoadout === null) return
    actions.apply({ ...draftLoadout })
    close()
  })
  back.addEventListener('click', cancel)

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      return
    }

    if (event.key !== 'Tab') return
    if (event.shiftKey && document.activeElement === characterSelect) {
      event.preventDefault()
      back.focus({ preventScroll: true })
    } else if (!event.shiftKey && document.activeElement === back) {
      event.preventDefault()
      characterSelect.focus({ preventScroll: true })
    }
  })

  return {
    element: root,
    open: (loadout, opener) => {
      committedLoadout = { ...loadout }
      draftLoadout = { ...loadout }
      openerElement = opener
      characterSelect.value = loadout.characterId
      updateGuardianDescription(loadout.characterId)
      paletteSelect.value = loadout.paletteId
      accessorySelect.value = loadout.accessoryId
      root.hidden = false
      characterSelect.focus({ preventScroll: true })
    },
    dispose: () => root.remove(),
  }
}
