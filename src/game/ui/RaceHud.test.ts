import { describe, expect, it } from 'vitest'

import {
  createRaceHud,
  formatHazardAnnouncement,
  formatHazardWarning,
  formatLeagueMedal,
  formatLeaguePlacement,
  formatMissionGrade,
  formatMissionProgress,
  formatMusicVolumePercent,
  formatRaceTime,
  updateCachedDom,
  type RaceHudView,
} from './RaceHud'

class TestElement {
  readonly dataset: Record<string, string> = {}
  readonly style: Record<string, string> = {}
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  className = ''
  id = ''
  htmlFor = ''
  type = ''
  textContent = ''
  hidden = false
  value = ''
  valueAsNumber = 0
  min = ''
  max = ''
  step = ''
  title = ''
  disabled = false
  replaceChildrenCalls = 0
  focusCalls = 0
  parent: TestElement | null = null
  readonly listeners = new Map<string, (() => void)[]>()

  append(...elements: TestElement[]): void {
    for (const element of elements) {
      element.parent = this
      this.children.push(element)
    }
  }

  replaceChildren(...elements: TestElement[]): void {
    this.replaceChildrenCalls += 1
    this.children.splice(0)
    this.append(...elements)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }

  focus(): void {
    this.focusCalls += 1
  }

  remove(): void {
    if (this.parent === null) return
    const index = this.parent.children.indexOf(this)
    if (index >= 0) this.parent.children.splice(index, 1)
    this.parent = null
  }
}

function findByClass(root: TestElement, className: string): TestElement {
  if (root.className.split(' ').includes(className)) return root
  for (const child of root.children) {
    try {
      return findByClass(child, className)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element .${className}`)
}

function findByText(root: TestElement, text: string): TestElement {
  if (root.textContent === text) return root
  for (const child of root.children) {
    try {
      return findByText(child, text)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element with text ${text}`)
}

function findByDataset(
  root: TestElement,
  key: string,
  value: string,
): TestElement {
  if (root.dataset[key] === value) return root
  for (const child of root.children) {
    try {
      return findByDataset(child, key, value)
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing test element [data-${key}="${value}"]`)
}

function createFinishedRaceHudView(): RaceHudView {
  return {
    phase: 'finished',
    countdownRemainingMs: 0,
    elapsedMs: 80_000,
    nextCheckpointIndex: 12,
    checkpointCount: 12,
    finalElapsedMs: 80_000,
    bestTimeMs: 80_000,
    previousBestTimeMs: 90_000,
    gateIndicator: {
      show: false,
      left: 0,
      top: 0,
      angleRadians: 0,
      projectedDiameterCss: 80,
    },
    inputDevice: 'keyboard',
    muted: false,
    musicVolume: 0.35,
    quality: 'auto',
    resolvedQuality: 'high',
    mission: {
      selectedMissionId: 'time-trial',
      status: 'finished',
      attempt: {
        elapsedMs: 80_000,
        nextCheckpointIndex: 12,
        collisionCount: 0,
        respawnCount: 0,
        boostActivationCount: 4,
        finished: true,
      },
      result: { success: true, grade: 'gold', unmetCriteria: [] },
    },
    missionGrades: { 'time-trial': 'gold' },
    liveDeltaMs: null,
    leagueResult: {
      race: {
        rank: 1,
        medal: 'gold',
        isNewBest: true,
        inserted: true,
      },
      mission: {
        missionId: 'time-trial',
        rank: 1,
        medal: 'gold',
        isNewBest: true,
        inserted: true,
      },
    },
    skyLeague: {
      raceTop10Ms: [80_000, 90_000],
      coinTop10Ms: {},
      missionTop10: {
        'time-trial': [{ elapsedMs: 80_000, grade: 'gold' }],
      },
    },
  }
}

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
    ['boost-mastery', '관문 4/12 · 돌풍 3/3'],
    ['no-respawn', '관문 4/12 · 돌풍 3/3 · 리스폰 2'],
    ['time-trial', '1:31.250 / 3:30.000 · 돌풍 3/3 · 리스폰 2'],
    [
      'clean-flight',
      '1:31.250 / 3:30.000 · 충돌 1 · 리스폰 2 · 돌풍 3/3',
    ],
    [
      'golden-knot',
      '1:31.250 / 3:00.000 · 충돌 1 · 리스폰 2 · 돌풍 3/5',
    ],
    [
      'heart-of-sun',
      '분화 탈출 · 남은 0:00.000 · 충돌 1 · 리스폰 2 · 돌풍 3/2',
    ],
  ] as const)('formats %s progress', (missionId, label) => {
    expect(formatMissionProgress(missionId, attempt, 12)).toBe(label)
  })
})

describe('volcanic hazard warning formatting', () => {
  it('keeps telegraphs timed and active hazards urgent', () => {
    expect(
      formatHazardWarning({
        kind: 'rockfall',
        phase: 'telegraph',
        eventKey: 'rockfall:1',
        remainingMs: 1_240,
      }),
    ).toBe('낙석 주의 · 1.2초')
    expect(
      formatHazardWarning({
        kind: 'lava-wave',
        phase: 'active',
        eventKey: 'lava-wave:1',
        remainingMs: 900,
      }),
    ).toBe('용암 파도 · 회피!')
    expect(
      formatHazardAnnouncement({
        kind: 'lava-wave',
        phase: 'telegraph',
        eventKey: 'lava-wave:1',
        remainingMs: 1_200,
      }),
    ).toBe('용암 파도 접근 주의')
  })

  it('separates the visual countdown from one concise alert message', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    )
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
      } as unknown as Document,
    })

    try {
      const host = new TestElement()
      const noop = (): void => {}
      const hud = createRaceHud(host as unknown as HTMLElement, {
        start: noop,
        startExplore: noop,
        selectMission: noop,
        returnToMissionSelection: noop,
        resume: noop,
        restart: noop,
        respawn: noop,
        retry: noop,
        nextMission: noop,
        openCharacterWorkshop: noop,
        openStoryPrologue: noop,
        toggleMute: noop,
        setMusicVolume: noop,
        setQuality: noop,
      })
      const finished = createFinishedRaceHudView()
      hud.update({
        ...finished,
        phase: 'racing',
        finalElapsedMs: null,
        leagueResult: null,
        mission: {
          ...finished.mission,
          status: 'active',
          result: null,
        },
        hazardWarning: {
          kind: 'rockfall',
          phase: 'telegraph',
          eventKey: 'rockfall:8',
          remainingMs: 1_200,
        },
      })

      const root = hud.element as unknown as TestElement
      const visual = findByDataset(root, 'hazardWarning', 'true')
      const announcement = findByDataset(
        root,
        'hazardAnnouncement',
        'true',
      )
      expect(visual.attributes.get('aria-hidden')).toBe('true')
      expect(visual.attributes.get('aria-live')).toBeUndefined()
      expect(announcement.attributes.get('role')).toBe('alert')
      expect(announcement.attributes.get('aria-live')).toBeUndefined()
      expect(announcement.textContent).toBe('낙석 접근 주의')
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', previousDocument)
      }
    }
  })
})

describe('audio setting formatting', () => {
  it('formats a clamped BGM volume percentage', () => {
    expect(formatMusicVolumePercent(0.35)).toBe('35%')
    expect(formatMusicVolumePercent(1.4)).toBe('100%')
    expect(formatMusicVolumePercent(Number.NaN)).toBe('35%')
  })
})

describe('Sky League HUD formatting', () => {
  it('uses accessible Korean medal and placement labels', () => {
    expect(formatLeagueMedal('gold')).toBe('금메달')
    expect(formatLeagueMedal('silver')).toBe('은메달')
    expect(formatLeagueMedal('bronze')).toBe('동메달')
    expect(formatLeagueMedal(null)).toBe('메달 없음')

    expect(
      formatLeaguePlacement({
        rank: 1,
        medal: 'gold',
        isNewBest: true,
        inserted: true,
      }),
    ).toBe('1위 · 금메달 · 새 최고 기록')
    expect(
      formatLeaguePlacement({
        rank: 4,
        medal: null,
        isNewBest: false,
        inserted: true,
      }),
    ).toBe('4위 · 메달 없음')
    expect(
      formatLeaguePlacement({
        rank: null,
        medal: null,
        isNewBest: false,
        inserted: false,
      }),
    ).toBe('Top 10 밖')
  })

  it('only rebuilds cached result and leaderboard DOM for a new signature', () => {
    let signature: string | null = null
    let rebuildCount = 0
    const rebuild = (): void => {
      rebuildCount += 1
    }

    signature = updateCachedDom(signature, 'race:1', rebuild)
    signature = updateCachedDom(signature, 'race:1', rebuild)
    signature = updateCachedDom(signature, 'race:2', rebuild)

    expect(signature).toBe('race:2')
    expect(rebuildCount).toBe(2)
  })

  it('keeps finished result nodes and retry focus stable across frame updates', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    )
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
      } as unknown as Document,
    })

    try {
      const host = new TestElement()
      const noop = (): void => {}
      const hud = createRaceHud(host as unknown as HTMLElement, {
        start: noop,
        startExplore: noop,
        selectMission: noop,
        returnToMissionSelection: noop,
        resume: noop,
        restart: noop,
        respawn: noop,
        retry: noop,
        nextMission: noop,
        openCharacterWorkshop: noop,
        openStoryPrologue: noop,
        toggleMute: noop,
        setMusicVolume: noop,
        setQuality: noop,
      })
      const view = createFinishedRaceHudView()

      hud.update(view)
      const result = findByClass(
        hud.element as unknown as TestElement,
        'race-hud__result',
      )
      const leaderboard = findByClass(
        hud.element as unknown as TestElement,
        'race-hud__leaderboard',
      )
      const retry = findByText(
        hud.element as unknown as TestElement,
        '다시 달리기',
      )
      const firstResultNode = result.children[0]

      expect(result.attributes.get('role')).toBeUndefined()
      expect(result.attributes.get('aria-live')).toBe('polite')

      hud.update({ ...view, elapsedMs: 81_000 })

      expect(result.replaceChildrenCalls).toBe(1)
      expect(result.children[0]).toBe(firstResultNode)
      expect(leaderboard.replaceChildrenCalls).toBe(1)
      expect(retry.focusCalls).toBe(1)

      hud.update({
        ...view,
        skyLeague: {
          ...view.skyLeague,
          raceTop10Ms: [79_000, 80_000, 90_000],
        },
      })

      expect(result.replaceChildrenCalls).toBe(1)
      expect(leaderboard.replaceChildrenCalls).toBe(2)
      expect(retry.focusCalls).toBe(1)
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', previousDocument)
      }
    }
  })

  it('shows the same ordered lock state in ready and Escape pause selectors', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    )
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
      } as unknown as Document,
    })

    try {
      const host = new TestElement()
      const noop = (): void => {}
      const hud = createRaceHud(host as unknown as HTMLElement, {
        start: noop,
        startExplore: noop,
        selectMission: noop,
        returnToMissionSelection: noop,
        resume: noop,
        restart: noop,
        respawn: noop,
        retry: noop,
        nextMission: noop,
        openCharacterWorkshop: noop,
        openStoryPrologue: noop,
        toggleMute: noop,
        setMusicVolume: noop,
        setQuality: noop,
      })
      const finished = createFinishedRaceHudView()
      const ready: RaceHudView = {
        ...finished,
        phase: 'ready',
        finalElapsedMs: null,
        mission: {
          ...finished.mission,
          selectedMissionId: 'first-skyknot',
          status: 'idle',
          result: null,
        },
        missionGrades: {},
      }

      hud.update(ready)
      const picker = findByClass(
        hud.element as unknown as TestElement,
        'race-hud__mission-picker',
      )
      const select = findByDataset(
        hud.element as unknown as TestElement,
        'missionSelect',
        'true',
      )

      expect(picker.hidden).toBe(false)
      expect(select.children).toHaveLength(7)
      expect(select.children.map((option) => option.value)).toEqual([
        'first-skyknot',
        'boost-mastery',
        'no-respawn',
        'time-trial',
        'clean-flight',
        'golden-knot',
        'heart-of-sun',
      ])
      expect(select.children[0]?.disabled).toBe(false)
      expect(select.children[1]?.disabled).toBe(true)
      expect(select.children[1]?.textContent).toContain('브론즈')

      hud.update({
        ...ready,
        phase: 'paused',
        pausedFrom: undefined,
        mission: {
          ...ready.mission,
          status: 'active',
        },
        missionGrades: { 'first-skyknot': 'bronze' },
      } as RaceHudView)

      expect(picker.hidden).toBe(false)
      expect(select.children[1]?.disabled).toBe(false)
      expect(select.children[2]?.disabled).toBe(true)
      expect(select.children[2]?.textContent).toContain('브론즈')
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', previousDocument)
      }
    }
  })

  it('offers the next mission only after a successful non-final result', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    )
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
      } as unknown as Document,
    })

    try {
      const host = new TestElement()
      const noop = (): void => {}
      const hud = createRaceHud(host as unknown as HTMLElement, {
        start: noop,
        startExplore: noop,
        selectMission: noop,
        returnToMissionSelection: noop,
        resume: noop,
        restart: noop,
        respawn: noop,
        retry: noop,
        nextMission: noop,
        openCharacterWorkshop: noop,
        openStoryPrologue: noop,
        toggleMute: noop,
        setMusicVolume: noop,
        setQuality: noop,
      })
      const firstSuccess: RaceHudView = {
        ...createFinishedRaceHudView(),
        mission: {
          ...createFinishedRaceHudView().mission,
          selectedMissionId: 'first-skyknot',
        },
        missionGrades: { 'first-skyknot': 'gold' },
      }

      hud.update(firstSuccess)
      const next = findByText(
        hud.element as unknown as TestElement,
        '다음 미션',
      )
      expect(next.hidden).toBe(false)

      hud.update({
        ...firstSuccess,
        mission: {
          ...firstSuccess.mission,
          selectedMissionId: 'heart-of-sun',
        },
        missionGrades: {
          'first-skyknot': 'gold',
          'boost-mastery': 'gold',
          'no-respawn': 'gold',
          'time-trial': 'gold',
          'clean-flight': 'gold',
          'golden-knot': 'gold',
          'heart-of-sun': 'gold',
        },
      })

      expect(next.hidden).toBe(true)
      expect(
        findByClass(
          hud.element as unknown as TestElement,
          'race-hud__detail',
        ).textContent,
      ).toContain('모든 미션')
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', previousDocument)
      }
    }
  })

  it('shows an accessible character workshop opener in ready and pause only', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    )
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
      } as unknown as Document,
    })

    try {
      const host = new TestElement()
      let openCalls = 0
      const noop = (): void => {}
      const hud = createRaceHud(host as unknown as HTMLElement, {
        start: noop,
        startExplore: noop,
        selectMission: noop,
        returnToMissionSelection: noop,
        resume: noop,
        restart: noop,
        respawn: noop,
        retry: noop,
        nextMission: noop,
        openCharacterWorkshop: () => {
          openCalls += 1
        },
        openStoryPrologue: noop,
        toggleMute: noop,
        setMusicVolume: noop,
        setQuality: noop,
      })
      const finished = createFinishedRaceHudView()
      const ready: RaceHudView = {
        ...finished,
        phase: 'ready',
        finalElapsedMs: null,
        mission: {
          ...finished.mission,
          selectedMissionId: 'first-skyknot',
          status: 'idle',
          result: null,
        },
        missionGrades: {},
      }

      hud.update(ready)
      const opener = findByDataset(
        hud.element as unknown as TestElement,
        'characterWorkshopOpen',
        'true',
      )
      expect(opener.textContent).toBe('캐릭터 꾸미기')
      expect(opener.attributes.get('aria-label')).toBe('캐릭터 꾸미기')
      expect(opener.className).toContain('race-hud__character-workshop')
      expect(opener.hidden).toBe(false)
      opener.dispatch('click')
      expect(openCalls).toBe(1)

      hud.update({
        ...ready,
        phase: 'paused',
        mission: { ...ready.mission, status: 'active' },
      } as RaceHudView)
      expect(opener.hidden).toBe(false)

      hud.update(finished)
      expect(opener.hidden).toBe(true)
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', previousDocument)
      }
    }
  })

  it('offers the opening story in ready and pause without replacing the pause flow', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    )
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => new TestElement(),
      } as unknown as Document,
    })

    try {
      const host = new TestElement()
      let openCalls = 0
      const noop = (): void => {}
      const hud = createRaceHud(host as unknown as HTMLElement, {
        start: noop,
        startExplore: noop,
        selectMission: noop,
        returnToMissionSelection: noop,
        resume: noop,
        restart: noop,
        respawn: noop,
        retry: noop,
        nextMission: noop,
        openCharacterWorkshop: noop,
        openStoryPrologue: () => {
          openCalls += 1
        },
        toggleMute: noop,
        setMusicVolume: noop,
        setQuality: noop,
      })
      const finished = createFinishedRaceHudView()
      const ready: RaceHudView = {
        ...finished,
        phase: 'ready',
        finalElapsedMs: null,
        mission: {
          ...finished.mission,
          selectedMissionId: 'first-skyknot',
          status: 'idle',
          result: null,
        },
        missionGrades: {},
      }

      hud.update(ready)
      const root = hud.element as unknown as TestElement
      const opener = findByDataset(root, 'storyPrologueOpen', 'true')
      const storyHook = findByClass(root, 'race-hud__story-hook')
      const liveDelta = findByDataset(root, 'raceDelta', 'true')

      expect(storyHook.textContent).toBe(
        '끊어진 첫 매듭을 잇고, 세 군도의 새벽을 되돌리세요.',
      )
      expect(storyHook.hidden).toBe(false)
      expect(opener.textContent).toBe('서막 보기')
      expect(opener.attributes.get('aria-label')).toBe(
        '첫 하늘매듭 서막 보기',
      )
      expect(opener.hidden).toBe(false)
      expect(liveDelta.textContent).toBe('메아리 없음')
      expect(liveDelta.attributes.get('aria-label')).toBe(
        '비행의 메아리와 기록 차이',
      )
      opener.dispatch('click')
      expect(openCalls).toBe(1)

      hud.update({
        ...ready,
        phase: 'paused',
        mission: { ...ready.mission, status: 'active' },
      } as RaceHudView)
      expect(opener.hidden).toBe(false)
      expect(storyHook.hidden).toBe(true)
      expect(findByText(root, '계속 날기').hidden).toBe(false)
      expect(findByText(root, '미션 변경')).toBeDefined()

      hud.update(finished)
      expect(opener.hidden).toBe(true)
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', previousDocument)
      }
    }
  })
})
