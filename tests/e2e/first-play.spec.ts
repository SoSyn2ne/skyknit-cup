import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  expect,
  test,
  type CDPSession,
  type Page,
} from '@playwright/test'

import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import {
  getCourseSegment,
  SKYKNOT_COURSE,
} from '../../src/game/world/course'
import { WORLD_OBSTACLES } from '../../src/game/world/worldLayout'

const QA_SCOPE = process.env.DRAGON_QA_SCOPE ?? 'm44-speed-pass'
const ARTIFACT_DIR = join('artifacts', 'browser-qa', QA_SCOPE)
const CONTROL_INTERVAL_MS = 80
const MAX_AUTOPILOT_WALL_MS = 160_000
const STALL_TIMEOUT_MS = 22_000
const KEYBOARD_DUTY_STEPS = 5
const TOUCH_POINTER_ID = 41
const MAX_MOVEMENT_PITCH_RADIANS = (22 * Math.PI) / 180
const OFF_COURSE_PROBE_DISTANCE = 180
const OFF_COURSE_PROBE_DROP = 80

const FESTIVAL_SPIRE = WORLD_OBSTACLES.find(
  (obstacle) => obstacle.id === 'festival-spire',
)

if (FESTIVAL_SPIRE === undefined) {
  throw new Error('Missing festival-spire obstacle for M44 collision probe')
}

type InputMode = 'keyboard' | 'touch'

interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

interface PilotCommand {
  readonly yaw: number
  readonly pitch: number
}

interface TouchPoint {
  readonly id: number
  readonly x: number
  readonly y: number
}

interface TelemetryCheckpoint {
  readonly progress: number
  readonly wallMs: number
  readonly raceElapsedMs: number
  readonly gateProjectedDiameterCss: number
  readonly gateVisible: boolean
  readonly edgeGuideVisible: boolean
  readonly navigationCue: 'gate' | 'guide' | 'none'
  readonly navigationCueCssPoint: {
    readonly x: number
    readonly y: number
  } | null
  readonly hudOcclusion: {
    readonly occluded: boolean
    readonly overlappingSelectors: readonly string[]
  } | null
  readonly collision: FlightDebugSnapshot['collision']
  readonly respawnImmunitySeconds: number
}

interface RunTelemetry {
  readonly scope: string
  readonly automation: 'automated-real-input'
  readonly inputMode: InputMode
  readonly project: string
  readonly startedAt: string
  readonly checkpoints: TelemetryCheckpoint[]
  readonly samples: Array<{
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly progress: number
    readonly headingRadians: number
    readonly movementPitchRadians: number
    readonly position: FlightDebugSnapshot['flight']['position']
    readonly gateVisible: boolean
    readonly gateProjectedDiameterCss: number
    readonly collision: FlightDebugSnapshot['collision']
    readonly respawnImmunitySeconds: number
  }>
  readonly collisions: Array<{
    readonly wallMs: number
    readonly progress: number
    readonly obstacleId: string
  }>
  readonly respawns: Array<{
    readonly wallMs: number
    readonly progress: number
  }>
  startAction?: {
    readonly wallMs: number
    readonly phase: FlightDebugSnapshot['race']['phase']
  }
  finished?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly wallElapsedMs: number
  }
  retry?: {
    readonly wallMs: number
    readonly reachedPhase: FlightDebugSnapshot['race']['phase']
  }
  final?: {
    readonly progress: number
    readonly raceElapsedMs: number
    readonly wallElapsedMs: number
    readonly collision: FlightDebugSnapshot['collision']
    readonly respawnImmunitySeconds: number
  }
  errors: {
    readonly console: string[]
    readonly page: string[]
    readonly response: string[]
  }
}

interface RecoveryProbeTelemetry {
  readonly scope: string
  readonly automation: 'automated-recovery-probe'
  readonly inputMode: InputMode
  readonly project: string
  readonly startedAt: string
  before?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly nextCheckpointIndex: number
    readonly missionNextCheckpointIndex: number
    readonly trackerText: string
  }
  offCourse?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly nextCheckpointIndex: number
    readonly missionNextCheckpointIndex: number
    readonly outsideDurationSeconds: number
    readonly trackerText: string
  }
  after?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly nextCheckpointIndex: number
    readonly missionNextCheckpointIndex: number
    readonly respawnImmunitySeconds: number
    readonly trackerText: string
  }
  errors: {
    readonly console: string[]
    readonly page: string[]
    readonly response: string[]
  }
}

interface CollisionProbeTelemetry {
  readonly scope: string
  readonly automation: 'automated-collision-probe'
  readonly inputMode: InputMode
  readonly project: string
  readonly startedAt: string
  before?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly nextCheckpointIndex: number
    readonly missionNextCheckpointIndex: number
    readonly trackerText: string
  }
  collision?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly nextCheckpointIndex: number
    readonly missionNextCheckpointIndex: number
    readonly obstacleId: string | null
    readonly collisionRecoveryRemainingSeconds: number
    readonly trackerText: string
  }
  after?: {
    readonly wallMs: number
    readonly raceElapsedMs: number
    readonly nextCheckpointIndex: number
    readonly missionNextCheckpointIndex: number
    readonly collisionRecoveryRemainingSeconds: number
    readonly trackerText: string
  }
  errors: {
    readonly console: string[]
    readonly page: string[]
    readonly response: string[]
  }
}

interface Pilot {
  start(): Promise<void>
  apply(command: PilotCommand, tickIndex: number): Promise<void>
  stop(): Promise<void>
}

test.use({ video: 'on' })

test('M44 automated real input clears all 6 real gates and retries', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)

  const inputMode: InputMode = testInfo.project.name.startsWith('touch')
    ? 'touch'
    : 'keyboard'
  const telemetry: RunTelemetry = {
    scope: QA_SCOPE,
    automation: 'automated-real-input',
    inputMode,
    project: testInfo.project.name,
    startedAt: new Date().toISOString(),
    checkpoints: [],
    samples: [],
    collisions: [],
    respawns: [],
    errors: {
      console: [],
      page: [],
      response: [],
    },
  }
  const consoleErrors = telemetry.errors.console as string[]
  const pageErrors = telemetry.errors.page as string[]
  const responseErrors = telemetry.errors.response as string[]

  await mkdir(ARTIFACT_DIR, { recursive: true })

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      responseErrors.push(`${response.status()} ${response.url()}`)
    }
  })

  const video = page.video()
  const pilot =
    inputMode === 'touch'
      ? createTouchPilot(page)
      : createKeyboardPilot(page)

  const startedAt = Date.now()
  let lastCollisionKey: string | null = null
  let previousRespawnActive = false

  try {
    await page.goto('/?mode=race')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )

    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-baseline-ready.png`,
      ),
    })

    await startRace(page, inputMode)
    telemetry.startAction = {
      wallMs: Date.now() - startedAt,
      phase: (await readSnapshot(page))?.race.phase ?? 'ready',
    }

    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 8_000,
      })
      .toBe('racing')

    await pilot.start()

    let lastProgress = 0
    let lastProgressAt = Date.now()
    telemetry.checkpoints.push(
      await captureCheckpointTelemetry(
        page,
        0,
        startedAt,
      ),
    )

    let tickIndex = 0
    while (Date.now() - startedAt <= MAX_AUTOPILOT_WALL_MS) {
      const snapshot = await readSnapshot(page)
      expect(snapshot).not.toBeNull()
      if (snapshot === null) {
        throw new Error('Missing debug snapshot during M44 autopilot run')
      }

      const collisionId = snapshot.collision.lastObstacleId
      if (collisionId !== null && collisionId !== lastCollisionKey) {
        telemetry.collisions.push({
          wallMs: Date.now() - startedAt,
          progress: snapshot.race.nextCheckpointIndex,
          obstacleId: collisionId,
        })
        lastCollisionKey = collisionId
      }
      if (collisionId === null) {
        lastCollisionKey = null
      }

      const respawnActive = snapshot.race.respawnImmunitySeconds > 0.8
      if (respawnActive && !previousRespawnActive) {
        telemetry.respawns.push({
          wallMs: Date.now() - startedAt,
          progress: snapshot.race.nextCheckpointIndex,
        })
      }
      previousRespawnActive = respawnActive

      if (snapshot.race.nextCheckpointIndex !== lastProgress) {
        expect(snapshot.race.nextCheckpointIndex).toBe(lastProgress + 1)
        const progress = snapshot.race.nextCheckpointIndex
        telemetry.checkpoints.push(
          await captureCheckpointTelemetry(
            page,
            progress,
            startedAt,
          ),
        )
        await page.screenshot({
          path: join(
            ARTIFACT_DIR,
            `${testInfo.project.name}-m44-gate-${String(progress).padStart(2, '0')}.png`,
          ),
        })
        lastProgress = progress
        lastProgressAt = Date.now()
      }

      telemetry.samples.push({
        wallMs: Date.now() - startedAt,
        raceElapsedMs: snapshot.race.elapsedMs,
        progress: snapshot.race.nextCheckpointIndex,
        headingRadians: snapshot.flight.headingRadians,
        movementPitchRadians: snapshot.flight.movementPitchRadians,
        position: { ...snapshot.flight.position },
        gateVisible: snapshot.camera.gateNdc.visible,
        gateProjectedDiameterCss:
          snapshot.camera.gateProjectedDiameterCss,
        collision: snapshot.collision,
        respawnImmunitySeconds:
          snapshot.race.respawnImmunitySeconds,
      })

      if (snapshot.race.phase === 'finished') {
        telemetry.finished = {
          wallMs: Date.now() - startedAt,
          raceElapsedMs:
            snapshot.race.finalElapsedMs ?? snapshot.race.elapsedMs,
          wallElapsedMs: Date.now() - startedAt,
        }
        telemetry.final = {
          progress: snapshot.race.nextCheckpointIndex,
          raceElapsedMs:
            snapshot.race.finalElapsedMs ?? snapshot.race.elapsedMs,
          wallElapsedMs: Date.now() - startedAt,
          collision: snapshot.collision,
          respawnImmunitySeconds:
            snapshot.race.respawnImmunitySeconds,
        }
        break
      }

      if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
        throw new Error(
          `Autopilot stalled at gate ${snapshot.race.nextCheckpointIndex + 1}`,
        )
      }

      const desired = computePilotCommand(snapshot)
      await pilot.apply(desired, tickIndex)
      tickIndex += 1
      await page.waitForTimeout(CONTROL_INTERVAL_MS)
    }

    await pilot.stop()

    const finishedSnapshot = await readSnapshot(page)
    expect(finishedSnapshot?.race.phase).toBe('finished')
    expect(finishedSnapshot?.race.nextCheckpointIndex).toBe(
      SKYKNOT_COURSE.length,
    )
    expect(
      telemetry.checkpoints.map((checkpoint) => checkpoint.progress),
    ).toEqual(
      Array.from(
        { length: SKYKNOT_COURSE.length + 1 },
        (_, index) => index,
      ),
    )
    for (const checkpoint of telemetry.checkpoints) {
      if (checkpoint.progress >= SKYKNOT_COURSE.length) {
        continue
      }
      expect(
        checkpoint.navigationCue,
        `checkpoint ${checkpoint.progress} should keep a readable navigation cue`,
      ).not.toBe('none')
      if (checkpoint.navigationCue === 'gate') {
        expect(
          checkpoint.gateVisible,
          `checkpoint ${checkpoint.progress} should keep the active gate on-screen`,
        ).toBe(true)
        expect(
          checkpoint.gateProjectedDiameterCss,
          `checkpoint ${checkpoint.progress} gate should stay at least 48px`,
        ).toBeGreaterThanOrEqual(48)
      } else {
        expect(
          checkpoint.edgeGuideVisible,
          `checkpoint ${checkpoint.progress} should keep the edge guide visible when the gate shrinks`,
        ).toBe(true)
      }
      expect(
        checkpoint.hudOcclusion?.occluded ?? false,
        `checkpoint ${checkpoint.progress} navigation cue should stay clear of opaque HUD/touch controls`,
      ).toBe(false)
    }

    const retryButton = page.getByRole('button', { name: '다시 달리기' })
    await expect(retryButton).toBeVisible()
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-final-finished.png`,
      ),
    })

    if (inputMode === 'touch') {
      await retryButton.tap()
    } else {
      await expect(retryButton).toBeFocused()
      await page.keyboard.press('Enter')
    }

    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 2_000,
      })
      .toBe('countdown')
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 8_000,
      })
      .toBe('racing')

    telemetry.retry = {
      wallMs: Date.now() - startedAt,
      reachedPhase: 'racing',
    }

    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-retry-racing.png`,
      ),
    })

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(responseErrors).toEqual([])
  } finally {
    await pilot.stop()
    const telemetryPath = join(
      ARTIFACT_DIR,
      `${testInfo.project.name}-m44-telemetry.json`,
    )
    await writeFile(telemetryPath, JSON.stringify(telemetry, null, 2), 'utf8')
    await testInfo.attach('m44-telemetry', {
      path: telemetryPath,
      contentType: 'application/json',
    })

    if (video !== null) {
      const videoPath = join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-final.webm`,
      )
      try {
        await page.close()
      } catch {
        // Ignore close failures while preserving telemetry/video save attempts.
      }
      await video.saveAs(videoPath)
    }
  }
})

test('M44 out-of-bounds recovery probe keeps timer and gate progress through automatic respawn', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)

  const inputMode: InputMode = testInfo.project.name.startsWith('touch')
    ? 'touch'
    : 'keyboard'
  const telemetry: RecoveryProbeTelemetry = {
    scope: QA_SCOPE,
    automation: 'automated-recovery-probe',
    inputMode,
    project: testInfo.project.name,
    startedAt: new Date().toISOString(),
    errors: {
      console: [],
      page: [],
      response: [],
    },
  }
  const consoleErrors = telemetry.errors.console as string[]
  const pageErrors = telemetry.errors.page as string[]
  const responseErrors = telemetry.errors.response as string[]

  await mkdir(ARTIFACT_DIR, { recursive: true })

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      responseErrors.push(`${response.status()} ${response.url()}`)
    }
  })

  const video = page.video()
  const pilot =
    inputMode === 'touch'
      ? createTouchPilot(page)
      : createKeyboardPilot(page)
  const startedAt = Date.now()

  try {
    await page.goto('/?mode=race')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )

    await startRace(page, inputMode)
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 8_000,
      })
      .toBe('racing')

    const before = await pilotUntil(
      page,
      pilot,
      (snapshot) => computePilotCommand(snapshot),
      (snapshot) => snapshot.race.nextCheckpointIndex >= 1,
      25_000,
      'gate 1 before recovery probe',
    )
    const beforeTrackerText = await readMissionTrackerText(page)

    telemetry.before = {
      wallMs: Date.now() - startedAt,
      raceElapsedMs: before.race.elapsedMs,
      nextCheckpointIndex: before.race.nextCheckpointIndex,
      missionNextCheckpointIndex: before.race.mission.attempt.nextCheckpointIndex,
      trackerText: beforeTrackerText,
    }
    expect(before.race.nextCheckpointIndex).toBeGreaterThan(0)
    expect(before.race.mission.attempt.nextCheckpointIndex).toBe(
      before.race.nextCheckpointIndex,
    )
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-recovery-before.png`,
      ),
    })

    const offCourse = await pilotUntil(
      page,
      pilot,
      (snapshot) => computeOffCourseProbeCommand(snapshot),
      (snapshot) => snapshot.race.outOfBoundsSeconds >= 0.25,
      15_000,
      'out-of-bounds warning',
    )
    const offCourseTrackerText = await waitForMissionTrackerText(
      page,
      (text) => text.includes('코스 이탈'),
      3_000,
      'off-course mission tracker text',
    )
    telemetry.offCourse = {
      wallMs: Date.now() - startedAt,
      raceElapsedMs: offCourse.race.elapsedMs,
      nextCheckpointIndex: offCourse.race.nextCheckpointIndex,
      missionNextCheckpointIndex:
        offCourse.race.mission.attempt.nextCheckpointIndex,
      outsideDurationSeconds: offCourse.race.outOfBoundsSeconds,
      trackerText: offCourseTrackerText,
    }
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-recovery-offcourse.png`,
      ),
    })

    const after = await waitForSnapshot(
      page,
      (snapshot) => snapshot.race.respawnImmunitySeconds > 0.8,
      15_000,
      'automatic respawn',
    )
    const afterTrackerText = await waitForMissionTrackerText(
      page,
      (text) => text.includes('관문 복귀 · 기록 계속'),
      3_000,
      'respawn mission tracker text',
    )
    telemetry.after = {
      wallMs: Date.now() - startedAt,
      raceElapsedMs: after.race.elapsedMs,
      nextCheckpointIndex: after.race.nextCheckpointIndex,
      missionNextCheckpointIndex: after.race.mission.attempt.nextCheckpointIndex,
      respawnImmunitySeconds: after.race.respawnImmunitySeconds,
      trackerText: afterTrackerText,
    }

    expect(after.race.phase).toBe('racing')
    expect(after.race.nextCheckpointIndex).toBe(
      before.race.nextCheckpointIndex,
    )
    expect(after.race.mission.attempt.nextCheckpointIndex).toBe(
      before.race.mission.attempt.nextCheckpointIndex,
    )
    expect(after.race.elapsedMs).toBeGreaterThan(before.race.elapsedMs)
    expect(telemetry.offCourse.trackerText).toContain('코스 이탈')
    expect(telemetry.after.trackerText).toContain('관문 복귀 · 기록 계속')
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-recovery-after.png`,
      ),
    })

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(responseErrors).toEqual([])
  } finally {
    await pilot.stop()
    const telemetryPath = join(
      ARTIFACT_DIR,
      `${testInfo.project.name}-m44-recovery-telemetry.json`,
    )
    await writeFile(telemetryPath, JSON.stringify(telemetry, null, 2), 'utf8')
    await testInfo.attach('m44-recovery-telemetry', {
      path: telemetryPath,
      contentType: 'application/json',
    })

    if (video !== null) {
      const videoPath = join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-recovery.webm`,
      )
      try {
        await page.close()
      } catch {
        // Ignore close failures while preserving telemetry/video save attempts.
      }
      await video.saveAs(videoPath)
    }
  }
})

test('M44 festival-spire collision probe keeps progress/time and returns to normal navigation', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)

  const inputMode: InputMode = testInfo.project.name.startsWith('touch')
    ? 'touch'
    : 'keyboard'
  const telemetry: CollisionProbeTelemetry = {
    scope: QA_SCOPE,
    automation: 'automated-collision-probe',
    inputMode,
    project: testInfo.project.name,
    startedAt: new Date().toISOString(),
    errors: {
      console: [],
      page: [],
      response: [],
    },
  }
  const consoleErrors = telemetry.errors.console as string[]
  const pageErrors = telemetry.errors.page as string[]
  const responseErrors = telemetry.errors.response as string[]

  await mkdir(ARTIFACT_DIR, { recursive: true })

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      responseErrors.push(`${response.status()} ${response.url()}`)
    }
  })

  const video = page.video()
  const pilot =
    inputMode === 'touch'
      ? createTouchPilot(page)
      : createKeyboardPilot(page)
  const startedAt = Date.now()

  try {
    await page.goto('/?mode=race')
    await expect(page.locator('#app')).toHaveAttribute(
      'data-state',
      'renderer-ready',
    )

    await startRace(page, inputMode)
    await expect
      .poll(async () => (await readSnapshot(page))?.race.phase, {
        timeout: 8_000,
      })
      .toBe('racing')

    const before = await pilotUntil(
      page,
      pilot,
      (snapshot) => computePilotCommand(snapshot),
      (snapshot) => snapshot.race.nextCheckpointIndex >= 1,
      25_000,
      'gate 1 before collision probe',
    )
    const beforeTrackerText = await readMissionTrackerText(page)
    telemetry.before = {
      wallMs: Date.now() - startedAt,
      raceElapsedMs: before.race.elapsedMs,
      nextCheckpointIndex: before.race.nextCheckpointIndex,
      missionNextCheckpointIndex: before.race.mission.attempt.nextCheckpointIndex,
      trackerText: beforeTrackerText,
    }
    expect(before.race.nextCheckpointIndex).toBeGreaterThan(0)
    expect(before.race.mission.attempt.nextCheckpointIndex).toBe(
      before.race.nextCheckpointIndex,
    )
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-collision-before.png`,
      ),
    })

    const collision = await pilotUntil(
      page,
      pilot,
      (snapshot) =>
        computePilotCommandToTarget(snapshot, FESTIVAL_SPIRE.center),
      (snapshot) =>
        snapshot.collision.lastObstacleId === FESTIVAL_SPIRE.id,
      25_000,
      'festival-spire collision',
    )
    const collisionTrackerText = await waitForMissionTrackerText(
      page,
      (text) => text.includes('충돌 감속 · 곧 회복'),
      3_000,
      'collision mission tracker text',
    )
    telemetry.collision = {
      wallMs: Date.now() - startedAt,
      raceElapsedMs: collision.race.elapsedMs,
      nextCheckpointIndex: collision.race.nextCheckpointIndex,
      missionNextCheckpointIndex:
        collision.race.mission.attempt.nextCheckpointIndex,
      obstacleId: collision.collision.lastObstacleId,
      collisionRecoveryRemainingSeconds:
        collision.collision.recoveryRemainingSeconds,
      trackerText: collisionTrackerText,
    }
    expect(collision.collision.lastObstacleId).toBe(FESTIVAL_SPIRE.id)
    expect(collisionTrackerText).toContain('충돌 감속 · 곧 회복')
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-collision-hit.png`,
      ),
    })

    const after = await pilotUntil(
      page,
      pilot,
      (snapshot) => computePilotCommand(snapshot),
      async (snapshot) =>
        snapshot.collision.recoveryRemainingSeconds <= 0 &&
        snapshot.collision.speedMultiplier >= 1 &&
        snapshot.race.mission.attempt.respawnCount ===
          before.race.mission.attempt.respawnCount &&
        snapshot.race.mission.attempt.collisionCount >
          before.race.mission.attempt.collisionCount &&
        isNormalMissionTrackerText(
          await readMissionTrackerText(page),
          snapshot.race.checkpointCount,
        ),
      18_000,
      'collision recovery and return to normal mission tracker',
    )
    const afterTrackerText = await readMissionTrackerText(page)
    telemetry.after = {
      wallMs: Date.now() - startedAt,
      raceElapsedMs: after.race.elapsedMs,
      nextCheckpointIndex: after.race.nextCheckpointIndex,
      missionNextCheckpointIndex: after.race.mission.attempt.nextCheckpointIndex,
      collisionRecoveryRemainingSeconds:
        after.collision.recoveryRemainingSeconds,
      trackerText: afterTrackerText,
    }

    expect(after.race.phase).toBe('racing')
    expect(after.race.nextCheckpointIndex).toBe(
      before.race.nextCheckpointIndex,
    )
    expect(after.race.mission.attempt.nextCheckpointIndex).toBe(
      before.race.mission.attempt.nextCheckpointIndex,
    )
    expect(after.race.mission.attempt.respawnCount).toBe(
      before.race.mission.attempt.respawnCount,
    )
    expect(after.race.mission.attempt.collisionCount).toBeGreaterThan(
      before.race.mission.attempt.collisionCount,
    )
    expect(after.collision.recoveryRemainingSeconds).toBe(0)
    expect(after.collision.speedMultiplier).toBe(1)
    expect(after.race.elapsedMs).toBeGreaterThan(before.race.elapsedMs)
    expect(afterTrackerText).not.toContain('충돌 감속 · 곧 회복')
    expect(
      isNormalMissionTrackerText(
        afterTrackerText,
        after.race.checkpointCount,
      ),
    ).toBe(true)
    await page.screenshot({
      path: join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-collision-after.png`,
      ),
    })

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(responseErrors).toEqual([])
  } finally {
    await pilot.stop()
    const telemetryPath = join(
      ARTIFACT_DIR,
      `${testInfo.project.name}-m44-collision-telemetry.json`,
    )
    await writeFile(telemetryPath, JSON.stringify(telemetry, null, 2), 'utf8')
    await testInfo.attach('m44-collision-telemetry', {
      path: telemetryPath,
      contentType: 'application/json',
    })

    if (video !== null) {
      const videoPath = join(
        ARTIFACT_DIR,
        `${testInfo.project.name}-m44-collision.webm`,
      )
      try {
        await page.close()
      } catch {
        // Ignore close failures while preserving telemetry/video save attempts.
      }
      await video.saveAs(videoPath)
    }
  }
})

async function readSnapshot(
  page: Page,
): Promise<FlightDebugSnapshot | null> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __DRAGON_RACE_TEST__?: {
        snapshot: () => FlightDebugSnapshot | null
      }
    }
    return testWindow.__DRAGON_RACE_TEST__?.snapshot() ?? null
  })
}

async function startRace(
  page: Page,
  inputMode: InputMode,
): Promise<void> {
  if (inputMode === 'touch') {
    await page.getByRole('button', { name: '비행 시작' }).tap()
  } else {
    await page.keyboard.press('ArrowUp')
  }

  await expect
    .poll(async () => (await readSnapshot(page))?.race.phase, {
      timeout: 1_000,
      intervals: [25],
    })
    .toBe('countdown')
}

async function waitForSnapshot(
  page: Page,
  predicate: (snapshot: FlightDebugSnapshot) => boolean,
  timeoutMs: number,
  label: string,
): Promise<FlightDebugSnapshot> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = await readSnapshot(page)
    if (snapshot !== null && predicate(snapshot)) {
      return snapshot
    }
    await page.waitForTimeout(100)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function readMissionTrackerText(page: Page): Promise<string> {
  const tracker = page.locator('[data-mission-tracker="true"]')
  return (await tracker.innerText()).replace(/\s+/g, ' ').trim()
}

async function waitForMissionTrackerText(
  page: Page,
  predicate: (text: string) => boolean,
  timeoutMs: number,
  label: string,
): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const text = await readMissionTrackerText(page)
    if (predicate(text)) {
      return text
    }
    await page.waitForTimeout(100)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function pilotUntil(
  page: Page,
  pilot: Pilot,
  commandForSnapshot:
    | ((snapshot: FlightDebugSnapshot, tickIndex: number) => PilotCommand)
    | ((snapshot: FlightDebugSnapshot, tickIndex: number) => Promise<PilotCommand>),
  predicate:
    | ((snapshot: FlightDebugSnapshot) => boolean)
    | ((snapshot: FlightDebugSnapshot) => Promise<boolean>),
  timeoutMs: number,
  label: string,
): Promise<FlightDebugSnapshot> {
  const startedAt = Date.now()
  let tickIndex = 0
  await pilot.start()
  try {
    while (Date.now() - startedAt <= timeoutMs) {
      const snapshot = await readSnapshot(page)
      expect(snapshot).not.toBeNull()
      if (snapshot === null) {
        throw new Error(`Missing debug snapshot while piloting toward ${label}`)
      }
      if (await predicate(snapshot)) {
        return snapshot
      }
      await pilot.apply(await commandForSnapshot(snapshot, tickIndex), tickIndex)
      tickIndex += 1
      await page.waitForTimeout(CONTROL_INTERVAL_MS)
    }
  } finally {
    await pilot.stop()
  }

  throw new Error(`Timed out while piloting toward ${label}`)
}

function computePilotCommand(
  snapshot: FlightDebugSnapshot,
): PilotCommand {
  const checkpoint = SKYKNOT_COURSE[snapshot.race.nextCheckpointIndex] ?? null
  if (checkpoint === null) {
    return { yaw: 0, pitch: 0 }
  }

  const segment = getCourseSegment(
    'skyknot',
    snapshot.race.nextCheckpointIndex,
  )
  const segmentDirection = normalize(
    subtract(segment.end, segment.start),
  )
  const position = snapshot.flight.position
  const distanceToGate = distance(position, checkpoint.center)
  const planeDistance = dot(
    subtract(position, checkpoint.center),
    checkpoint.normal,
  )
  const target =
    planeDistance < 8
      ? checkpoint.center
      : add(checkpoint.center, scale(segmentDirection, 12))

  const targetDelta = subtract(target, position)
  const targetHeading = Math.atan2(targetDelta.x, -targetDelta.z)
  const headingError = normalizeAngle(
    targetHeading - snapshot.flight.headingRadians,
  )
  const targetPitch = Math.atan2(
    targetDelta.y,
    Math.max(1, Math.hypot(targetDelta.x, targetDelta.z)),
  )
  let yaw = clamp(headingError / 0.52, -1, 1)
  let pitch = clamp(
    targetPitch / MAX_MOVEMENT_PITCH_RADIANS,
    -1,
    1,
  )

  if (distanceToGate < 55) {
    yaw *= 0.82
    pitch *= 0.88
  }

  return { yaw, pitch }
}

function computePilotCommandToTarget(
  snapshot: FlightDebugSnapshot,
  target: Vec3,
): PilotCommand {
  const targetDelta = subtract(target, snapshot.flight.position)
  const targetHeading = Math.atan2(targetDelta.x, -targetDelta.z)
  const headingError = normalizeAngle(
    targetHeading - snapshot.flight.headingRadians,
  )
  const targetPitch = Math.atan2(
    targetDelta.y,
    Math.max(1, Math.hypot(targetDelta.x, targetDelta.z)),
  )
  const targetDistance = distance(snapshot.flight.position, target)
  let yaw = clamp(headingError / 0.52, -1, 1)
  let pitch = clamp(targetPitch / MAX_MOVEMENT_PITCH_RADIANS, -1, 1)

  if (targetDistance < FESTIVAL_SPIRE.radius + 26) {
    yaw *= 0.92
    pitch *= 0.9
  }

  return { yaw, pitch }
}

function computeOffCourseProbeCommand(
  snapshot: FlightDebugSnapshot,
): PilotCommand {
  const segment = getCourseSegment('skyknot', snapshot.race.nextCheckpointIndex)
  const segmentDirection = normalize(subtract(segment.end, segment.start))
  const lateral = normalize({
    x: segmentDirection.z,
    y: 0,
    z: -segmentDirection.x,
  })

  return computePilotCommandToTarget(
    snapshot,
    add(
      add(
        snapshot.flight.position,
        scale(lateral, OFF_COURSE_PROBE_DISTANCE),
      ),
      { x: 0, y: -OFF_COURSE_PROBE_DROP, z: 0 },
    ),
  )
}

async function captureCheckpointTelemetry(
  page: Page,
  progress: number,
  startedAt: number,
): Promise<TelemetryCheckpoint> {
  const snapshot = await readSnapshot(page)
  expect(snapshot).not.toBeNull()
  if (snapshot === null) {
    throw new Error('Missing snapshot while recording checkpoint telemetry')
  }

  const gateCssPoint =
    progress < SKYKNOT_COURSE.length
      ? toCssPoint(snapshot.camera.gateNdc, page.viewportSize())
      : null
  const edgeGuide = await readEdgeGuideCue(page)
  const gateReadable =
    progress < SKYKNOT_COURSE.length &&
    snapshot.camera.gateNdc.visible &&
    snapshot.camera.gateProjectedDiameterCss >= 48 &&
    gateCssPoint !== null
  const navigationCue =
    progress >= SKYKNOT_COURSE.length
      ? 'none'
      : edgeGuide.visible
        ? 'guide'
        : gateReadable
          ? 'gate'
          : 'none'
  const navigationCueCssPoint =
    navigationCue === 'gate'
      ? gateCssPoint
      : navigationCue === 'guide'
        ? edgeGuide.cssPoint
        : null

  return {
    progress,
    wallMs: Date.now() - startedAt,
    raceElapsedMs:
      snapshot.race.finalElapsedMs ?? snapshot.race.elapsedMs,
    gateProjectedDiameterCss:
      snapshot.camera.gateProjectedDiameterCss,
    gateVisible: snapshot.camera.gateNdc.visible,
    edgeGuideVisible: edgeGuide.visible,
    navigationCue,
    navigationCueCssPoint,
    hudOcclusion:
      navigationCueCssPoint === null
        ? null
        : await readHudOcclusion(page, navigationCueCssPoint),
    collision: snapshot.collision,
    respawnImmunitySeconds: snapshot.race.respawnImmunitySeconds,
  }
}

async function readEdgeGuideCue(page: Page): Promise<{
  readonly visible: boolean
  readonly cssPoint: { readonly x: number; readonly y: number } | null
}> {
  return page.evaluate(() => {
    const guide = document.querySelector<HTMLElement>('[data-gate-guide="true"]')
    if (
      guide === null ||
      guide.hidden ||
      guide.getAttribute('hidden') !== null
    ) {
      return { visible: false, cssPoint: null }
    }

    const style = window.getComputedStyle(guide)
    const rect = guide.getBoundingClientRect()
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number.parseFloat(style.opacity || '1') > 0.05 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight

    return visible
      ? {
          visible: true,
          cssPoint: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          },
        }
      : { visible: false, cssPoint: null }
  })
}

async function readHudOcclusion(
  page: Page,
  cueCssPoint: { readonly x: number; readonly y: number },
): Promise<{
  readonly occluded: boolean
  readonly overlappingSelectors: readonly string[]
}> {
  return page.evaluate((point) => {
    const selectors = [
      '.race-hud__metric',
      '[data-mission-tracker]',
      '[data-hazard-warning="true"]',
      '.boost-gauge',
      '[data-touch-role]',
    ]
    const overlaps = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap(
        (element, index) => {
          if (
            element.hidden ||
            element.getAttribute('hidden') !== null
          ) {
            return []
          }
          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          const contains =
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom
          const opaqueEnough =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number.parseFloat(style.opacity || '1') >= 0.45 &&
            rect.width > 0 &&
            rect.height > 0
          return contains && opaqueEnough ? [`${selector}[${index}]`] : []
        },
      ),
    )

    return {
      occluded: overlaps.length > 0,
      overlappingSelectors: overlaps,
    }
  }, cueCssPoint)
}

function createTouchPilot(page: Page): Pilot {
  let clientPromise: Promise<CDPSession> | null = null
  let center: { readonly x: number; readonly y: number } | null = null
  let radius = 0
  let active = false
  let current = { yaw: 0, pitch: 0 }

  const ensureBounds = async (): Promise<void> => {
    if (center !== null && radius > 0) return
    const joystick = page.locator('[data-touch-role="joystick"]')
    await expect(joystick).toBeVisible()
    const joystickBox = await joystick.boundingBox()
    expect(joystickBox).not.toBeNull()
    if (joystickBox === null) {
      throw new Error('Missing joystick bounds for touch pilot')
    }
    center = {
      x: joystickBox.x + joystickBox.width / 2,
      y: joystickBox.y + joystickBox.height / 2,
    }
    radius = Math.min(joystickBox.width, joystickBox.height) * 0.32
  }

  return {
    async start() {
      if (active) return
      await ensureBounds()
      const session =
        clientPromise ??= page.context().newCDPSession(page)
      if (center === null) {
        throw new Error('Missing touch pilot center')
      }
      await dispatchTouch(await session, 'touchStart', {
        id: TOUCH_POINTER_ID,
        x: center.x,
        y: center.y,
      })
      active = true
    },
    async apply(command) {
      if (!active) return
      const session =
        clientPromise ??= page.context().newCDPSession(page)
      if (center === null) {
        throw new Error('Missing touch pilot center')
      }
      current = smoothCommand(current, command, 0.45)
      await dispatchTouch(await session, 'touchMove', {
        id: TOUCH_POINTER_ID,
        x: center.x + current.yaw * radius,
        y: center.y - current.pitch * radius,
      })
    },
    async stop() {
      if (!active) return
      active = false
      current = { yaw: 0, pitch: 0 }
      if (clientPromise !== null) {
        await dispatchTouch(await clientPromise, 'touchEnd')
      }
    },
  }
}

function createKeyboardPilot(page: Page): Pilot {
  const held = {
    up: false,
    down: false,
    left: false,
    right: false,
  }
  let current = { yaw: 0, pitch: 0 }

  const syncKey = async (
    name: keyof typeof held,
    key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
    next: boolean,
  ): Promise<void> => {
    if (held[name] === next) return
    held[name] = next
    if (next) {
      await page.keyboard.down(key)
      return
    }
    await page.keyboard.up(key)
  }

  return {
    async start() {
      return
    },
    async apply(command, tickIndex) {
      current = smoothCommand(current, command, 0.5)
      const cycleStep = tickIndex % KEYBOARD_DUTY_STEPS
      const up =
        current.pitch > 0 &&
        dutyStepActive(current.pitch, cycleStep)
      const down =
        current.pitch < 0 &&
        dutyStepActive(-current.pitch, cycleStep)
      const right =
        current.yaw > 0 &&
        dutyStepActive(current.yaw, cycleStep)
      const left =
        current.yaw < 0 &&
        dutyStepActive(-current.yaw, cycleStep)

      await syncKey('up', 'ArrowUp', up)
      await syncKey('down', 'ArrowDown', down)
      await syncKey('left', 'ArrowLeft', left)
      await syncKey('right', 'ArrowRight', right)
    },
    async stop() {
      await syncKey('up', 'ArrowUp', false)
      await syncKey('down', 'ArrowDown', false)
      await syncKey('left', 'ArrowLeft', false)
      await syncKey('right', 'ArrowRight', false)
    },
  }
}

async function dispatchTouch(
  client: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  point?: TouchPoint,
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints:
      point === undefined
        ? []
        : [
            {
              id: point.id,
              x: point.x,
              y: point.y,
              radiusX: 1,
              radiusY: 1,
              force: 1,
            },
          ],
  })
}

function dutyStepActive(magnitude: number, cycleStep: number): boolean {
  if (magnitude < 0.12) {
    return false
  }
  const activeSteps = Math.max(
    1,
    Math.round(clamp(magnitude, 0, 1) * KEYBOARD_DUTY_STEPS),
  )
  return cycleStep < activeSteps
}

function smoothCommand(
  current: PilotCommand,
  next: PilotCommand,
  alpha: number,
): PilotCommand {
  return {
    yaw: current.yaw + (next.yaw - current.yaw) * alpha,
    pitch: current.pitch + (next.pitch - current.pitch) * alpha,
  }
}

function toCssPoint(
  ndc: FlightDebugSnapshot['camera']['gateNdc'],
  viewport: { readonly width: number; readonly height: number } | null,
): { readonly x: number; readonly y: number } | null {
  if (viewport === null) {
    return null
  }

  return {
    x: (ndc.x * 0.5 + 0.5) * viewport.width,
    y: (-ndc.y * 0.5 + 0.5) * viewport.height,
  }
}

function isNormalMissionTrackerText(
  text: string,
  checkpointCount: number,
): boolean {
  return new RegExp(
    `^(?:.+\\s)?관문 \\d+\\/${checkpointCount} · \\d+:\\d{2}\\.\\d{3}$`,
  ).test(text)
}

function normalizeAngle(radians: number): number {
  let normalized = radians
  while (normalized > Math.PI) normalized -= Math.PI * 2
  while (normalized < -Math.PI) normalized += Math.PI * 2
  return normalized
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function add(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  }
}

function scale(vector: Vec3, factor: number): Vec3 {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
    z: vector.z * factor,
  }
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  if (length <= Number.EPSILON) {
    return { x: 0, y: 0, z: 0 }
  }
  return scale(vector, 1 / length)
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function distance(left: Vec3, right: Vec3): number {
  return Math.hypot(
    left.x - right.x,
    left.y - right.y,
    left.z - right.z,
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
