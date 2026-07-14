import { expect, test, type Page } from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm8'

async function capture(
  page: Page,
  projectName: string,
  state: string,
): Promise<void> {
  await page.screenshot({
    path: `artifacts/browser-qa/${QA_SCOPE}/${projectName}-${state}.png`,
    style: '.qa-course-control { visibility: hidden !important; }',
  })
}

async function snapshot(page: Page): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
}

async function startSelectedMission(page: Page): Promise<void> {
  await page.locator('[data-mission-start="true"]').click()
  await expect
    .poll(async () => (await snapshot(page))?.race.phase, { timeout: 6_000 })
    .toBe('racing')
}

async function finishQaCourse(page: Page): Promise<void> {
  const nextGate = page.getByRole('button', { name: 'QA 다음 관문' })
  for (let checkpoint = 0; checkpoint < 12; checkpoint += 1) {
    await nextGate.click()
  }
  await expect
    .poll(async () => (await snapshot(page))?.race.phase)
    .toBe('finished')
}

test('selects, fails, and retries a collision-free mission', async ({
  page,
}, testInfo) => {
  await page.goto('/?qaCourse=1&qaCollision=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const missionSelect = page.locator('[data-mission-select="true"]')
  await missionSelect.selectOption('clean-flight')
  await expect(page.locator('.race-hud__mission-objective')).toContainText(
    '부딪히지 않고',
  )
  await capture(page, testInfo.project.name, 'mission-select')
  await startSelectedMission(page)
  await expect(page.locator('[data-mission-tracker="true"]')).toContainText(
    '충돌 0',
  )
  await capture(page, testInfo.project.name, 'mission-progress')

  await page.getByRole('button', { name: 'QA 충돌' }).click()
  await expect
    .poll(
      async () =>
        (await snapshot(page))?.race.mission.attempt.collisionCount,
    )
    .toBe(1)
  await finishQaCourse(page)

  const result = page.locator('.race-hud__result')
  await expect(result).toContainText('미션 결과')
  await expect(result).toContainText('실패')
  await expect(result).toContainText('최고 등급')
  await expect(result).toContainText('기록 없음')
  await capture(page, testInfo.project.name, 'mission-failure')

  await page.getByRole('button', { name: '다시 달리기' }).click()
  await expect
    .poll(async () => (await snapshot(page))?.race.mission)
    .toMatchObject({
      selectedMissionId: 'clean-flight',
      status: 'active',
      attempt: {
        collisionCount: 0,
        respawnCount: 0,
        boostActivationCount: 0,
      },
      result: null,
    })
  await capture(page, testInfo.project.name, 'mission-retry')
})

test('completes a mission, saves its grade, and returns to selection', async ({
  page,
}, testInfo) => {
  await page.goto('/?qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const missionSelect = page.locator('[data-mission-select="true"]')
  if (testInfo.project.name === 'desktop') {
    await missionSelect.focus()
    await page.keyboard.press('ArrowDown')
    await expect
      .poll(async () => (await snapshot(page))?.race.phase)
      .toBe('ready')
  }
  await missionSelect.selectOption('first-skyknot')
  const start = page.locator('[data-mission-start="true"]')
  const startBox = await start.boundingBox()
  expect(startBox?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(startBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  await startSelectedMission(page)
  await finishQaCourse(page)

  const mission = (await snapshot(page))?.race.mission
  expect(mission?.result).toMatchObject({ success: true, grade: 'gold' })
  await expect(page.locator('.race-hud__result')).toContainText('골드')
  await capture(page, testInfo.project.name, 'mission-success')

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('skyknit-cup:settings')
    return raw === null ? null : (JSON.parse(raw) as unknown)
  })
  expect(stored).toMatchObject({
    version: 8,
    missionGrades: { 'first-skyknot': 'gold' },
    skyLeague: {
      raceTop10Ms: [expect.any(Number)],
      missionTop10: {
        'first-skyknot': [
          { elapsedMs: expect.any(Number), grade: 'gold' },
        ],
      },
    },
    ghosts: {
      race: {
        durationMs: expect.any(Number),
        samples: expect.any(Array),
      },
      mission: {
        'first-skyknot': {
          durationMs: expect.any(Number),
          samples: expect.any(Array),
        },
      },
    },
  })

  await page.getByRole('button', { name: '미션 선택' }).click()
  await expect
    .poll(async () => (await snapshot(page))?.race.phase)
    .toBe('ready')
  await expect(missionSelect).toHaveValue('first-skyknot')
  await expect(page.locator('.race-hud__mission-best')).toContainText('골드')
  await capture(page, testInfo.project.name, 'mission-selection-return')
})

test('changes the selected mission from the Escape pause dialog with the keyboard', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/?qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )

  const missionSelect = page.locator('[data-mission-select="true"]')
  await missionSelect.selectOption('clean-flight')
  await startSelectedMission(page)
  await page.keyboard.press('Escape')
  await expect
    .poll(async () => (await snapshot(page))?.race.phase)
    .toBe('paused')

  const pauseDialog = page.getByRole('dialog', {
    name: '바람길 일시정지',
  })
  const changeMission = pauseDialog.getByRole('button', {
    name: '미션 변경',
  })
  await expect(changeMission).toBeVisible()
  await changeMission.focus()
  await expect(changeMission).toBeFocused()
  await page.keyboard.press('Enter')

  await expect
    .poll(async () => (await snapshot(page))?.race)
    .toMatchObject({
      phase: 'ready',
      mission: {
        selectedMissionId: 'clean-flight',
        status: 'idle',
      },
      elapsedMs: 0,
      nextCheckpointIndex: 0,
    })
  await expect(missionSelect).toBeVisible()
  await expect(missionSelect).toBeFocused()
  await missionSelect.selectOption('time-trial')
  await expect
    .poll(async () => (await snapshot(page))?.race)
    .toMatchObject({
      phase: 'ready',
      mission: {
        selectedMissionId: 'time-trial',
        status: 'idle',
      },
    })
})

test('keeps mission change visible in the pause dialog at every required viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/?qaCourse=1')
  await expect(page.locator('#app')).toHaveAttribute(
    'data-state',
    'renderer-ready',
  )
  await startSelectedMission(page)

  if (testInfo.project.name.startsWith('touch')) {
    await page.getByRole('button', { name: '일시정지' }).tap()
  } else {
    await page.keyboard.press('Escape')
  }

  const pauseDialog = page.getByRole('dialog', {
    name: '바람길 일시정지',
  })
  const changeMission = pauseDialog.getByRole('button', {
    name: '미션 변경',
  })
  await expect(changeMission).toBeVisible()
  await expect(changeMission).toBeInViewport()
  const box = await changeMission.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  await capture(page, testInfo.project.name, 'pause-mission-change')
})
