import { describe, expect, it } from 'vitest'

import {
  createRaceHud,
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
  replaceChildrenCalls = 0
  focusCalls = 0
  parent: TestElement | null = null

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

  addEventListener(): void {}

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
    ['time-trial', '1:31.250 / 3:00.000'],
    ['clean-flight', '관문 4/12 · 충돌 1'],
    ['no-respawn', '관문 4/12 · 리스폰 2'],
    ['boost-mastery', '관문 4/12 · 돌풍 3회'],
    ['golden-knot', '1:31.250 · 충돌 1 · 리스폰 2 · 돌풍 3'],
  ] as const)('formats %s progress', (missionId, label) => {
    expect(formatMissionProgress(missionId, attempt, 12)).toBe(label)
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
})
