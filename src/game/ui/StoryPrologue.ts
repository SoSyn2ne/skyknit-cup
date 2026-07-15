export interface StoryPrologueActions {
  readonly close: () => void
}

export interface StoryPrologue {
  readonly element: HTMLElement
  open(opener: HTMLElement): void
  dispose(): void
}

let storyPrologueInstanceCount = 0

export function createStoryPrologue(
  host: HTMLElement,
  actions: StoryPrologueActions,
): StoryPrologue {
  storyPrologueInstanceCount += 1
  const idPrefix = `story-prologue-${storyPrologueInstanceCount}`

  const root = document.createElement('div')
  root.className = 'story-prologue'
  root.hidden = true

  const dialog = document.createElement('section')
  dialog.className = 'story-prologue__dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', '첫 하늘매듭 서막')
  dialog.setAttribute('aria-describedby', `${idPrefix}-story`)

  const eyebrow = document.createElement('p')
  eyebrow.className = 'story-prologue__eyebrow'
  eyebrow.textContent = '하늘매듭 세계 이야기'

  const title = document.createElement('h2')
  title.id = `${idPrefix}-title`
  title.textContent = '서막 · 끊어진 첫 매듭'

  const story = document.createElement('div')
  story.id = `${idPrefix}-story`
  story.className = 'story-prologue__story'

  for (const copy of [
    '태초의 첫 하늘매듭은 세 군도의 바람길을 묶어 매일 새벽을 불러왔다. 잿빛 폭풍이 그 매듭을 찢던 날, 햇실은 하늘동전처럼 빛나는 조각으로 흩어지고 관문은 잠들었다.',
    '해뜰녘 드래곤, 잿불 봉황, 폭풍 백호는 마지막 세 가닥의 햇실을 나누어 지킨다. 한 수호수가 되어 조각을 모으고 관문을 차례로 깨워, 끊어진 길을 다시 묶어라.',
    '하늘에 비치는 반투명한 비행자는 적이 아니다. 먼저 날아간 수호수가 햇실에 남긴 ‘비행의 메아리’다. 그 기록을 넘어 황금 하늘매듭을 완성하면 군도에 새벽이 돌아온다.',
  ]) {
    const paragraph = document.createElement('p')
    paragraph.textContent = copy
    story.append(paragraph)
  }

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.textContent = '비행으로 돌아가기'

  dialog.append(eyebrow, title, story, closeButton)
  root.append(dialog)
  host.append(root)

  let openerElement: HTMLElement | null = null

  const close = (): void => {
    if (root.hidden) return
    root.hidden = true
    actions.close()
    const opener = openerElement
    openerElement = null
    opener?.focus({ preventScroll: true })
  }

  closeButton.addEventListener('click', close)
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      closeButton.focus({ preventScroll: true })
    }
  })

  return {
    element: root,
    open: (opener) => {
      openerElement = opener
      root.hidden = false
      closeButton.focus({ preventScroll: true })
    },
    dispose: () => root.remove(),
  }
}
