import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import type { FlightDebugSnapshot } from '../../src/game/createRenderer'
import { getWindPuzzle } from '../../src/game/adventure/windPuzzle'

const OUT = 'artifacts/browser-qa/m46-adventure'
const snapshot = (page: Page) => page.evaluate(() => window.__DRAGON_RACE_TEST__?.snapshot() ?? null)
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const clamp = (value: number) => Math.max(-1, Math.min(1, value))

async function canvasSample(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const gl = document.querySelector<HTMLCanvasElement>('canvas')?.getContext('webgl2')
    if (!gl) return null
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let min = 255, max = 0, hash = 2166136261
    const stride = Math.max(4, Math.floor(pixels.length / 60000 / 4) * 4)
    for (let i = 0; i < pixels.length; i += stride) {
      const luma = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      min = Math.min(min, luma); max = Math.max(max, luma)
      hash = Math.imul(hash ^ pixels[i], 16777619) >>> 0
    }
    return { min, max, hash }
  })
}

test('M46 default entry shows the authored nest and a usable first objective', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  await expect.poll(async () => (await snapshot(page))?.exploration.adventure.world.assetStatus).toBe('loaded')
  await expect.poll(async () => (await snapshot(page))?.gameMode).toBe('explore')
  const start = page.locator('[data-adventure-start]')
  await expect(start).toBeVisible()
  await expect(start).toBeInViewport()
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `${OUT}/${info.project.name}-intro.png` })
  await start.click()
  await expect(page.locator('[data-adventure-objective]')).toHaveText('누리와 이야기하기')
  await expect(page.locator('[data-adventure-interact]')).toBeVisible()
  await page.locator('[data-adventure-interact]').click()
  await expect.poll(async () => (await snapshot(page))?.exploration.adventure.progress.stage).toBe('rescue-bird')
  const tracker = await page.locator('[data-adventure-tracker]').boundingBox()
  const coins = await page.locator('[data-coin-run]').boundingBox()
  expect(tracker).not.toBeNull()
  expect(coins).not.toBeNull()
  expect(tracker!.y).toBeGreaterThanOrEqual(coins!.y + coins!.height + 8)
  await page.screenshot({ path: `${OUT}/${info.project.name}-first-quest.png` })
  const first = await canvasSample(page)
  await page.waitForTimeout(1100)
  const second = await canvasSample(page)
  expect(first!.max - first!.min).toBeGreaterThan(40)
  expect(first!.hash).not.toBe(second!.hash)
  const layout = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }))
  expect(layout.w).toBe(layout.vw); expect(layout.h).toBe(layout.vh)
  expect(errors).toEqual([])
})

function makePilot(page: Page, touch: boolean) {
  let client: CDPSession | null = null
  let joystick: { x: number; y: number; radius: number } | null = null
  let brakePoint: { x: number; y: number } | null = null
  let touching = false
  const keys = new Set<string>()
  let tick = 0
  async function keyboard(next: Set<string>) {
    for (const key of keys) if (!next.has(key)) await page.keyboard.up(key)
    for (const key of next) if (!keys.has(key)) await page.keyboard.down(key)
    keys.clear(); for (const key of next) keys.add(key)
  }
  return {
    async apply(state: FlightDebugSnapshot, target: { x: number; y: number; z: number }, stop: boolean) {
      const position = state.flight.position
      const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z
      const horizontal = Math.hypot(dx, dz)
      const yaw = clamp(wrap(Math.atan2(dx, -dz) - state.flight.headingRadians) * 2.2)
      const pitch = clamp(Math.atan2(dy, horizontal) / (22 * Math.PI / 180))
      tick += 1
      if (!touch) {
        const next = new Set<string>()
        const duty = tick % 8 / 8
        if (Math.abs(yaw) > duty + 0.02) next.add(yaw > 0 ? 'ArrowRight' : 'ArrowLeft')
        if (Math.abs(pitch) > duty + 0.02) next.add(pitch > 0 ? 'ArrowUp' : 'ArrowDown')
        if (stop) next.add('KeyC')
        await keyboard(next)
        return
      }
      client ??= await page.context().newCDPSession(page)
      if (!joystick) {
        const box = await page.locator('[data-touch-role="joystick"]').boundingBox()
        const brake = await page.locator('[data-touch-role="brake"]').boundingBox()
        if (!box || !brake) throw new Error('Missing real touch controls')
        joystick = { x: box.x + box.width / 2, y: box.y + box.height / 2, radius: Math.min(box.width, box.height) * 0.34 }
        brakePoint = { x: brake.x + brake.width / 2, y: brake.y + brake.height / 2 }
      }
      const points = [{ id: 11, x: joystick.x + yaw * joystick.radius, y: joystick.y - pitch * joystick.radius }]
      if (stop && brakePoint) points.push({ id: 12, ...brakePoint })
      await client.send('Input.dispatchTouchEvent', { type: touching ? 'touchMove' : 'touchStart', touchPoints: points })
      touching = true
    },
    async stop() {
      await keyboard(new Set())
      if (client && touching) await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      touching = false
    },
  }
}

test('M46 can begin after choosing a race before the first adventure', async ({ page }, info) => {
  test.skip(!['desktop', 'touch-landscape'].includes(info.project.name), 'Mode roundtrip on keyboard and touch')
  const activate = (control: ReturnType<Page['locator']>) => info.project.name.startsWith('touch') ? control.tap() : control.click()
  await page.goto('/')
  await activate(page.locator('[data-adventure-race]'))
  await expect(page.locator('[data-mission-select]')).toBeVisible()
  await activate(page.getByRole('button', { name: '하늘 탐험' }))
  await expect(page.locator('[data-adventure-start]')).toBeVisible()
  await activate(page.locator('[data-adventure-start]'))
  await expect.poll(async () => (await snapshot(page))?.exploration.adventure.progress.started).toBe(true)
  await expect(page.locator('[data-adventure-interact]')).toBeVisible()
})

test('M46 real input completes three quests, equips every reward and restores on reload', async ({ page }, info) => {
  test.skip(!['desktop', 'touch-landscape'].includes(info.project.name), 'Full real-input routes use keyboard and landscape touch; all five entry viewports are tested above')
  test.setTimeout(20 * 60_000)
  const touch = info.project.name.startsWith('touch')
  const pilot = makePilot(page, touch)
  const errors: string[] = []
  const telemetry: { wallMs: number; stage: string; objective: string; position: unknown; elapsedPlaySeconds: number }[] = []
  const startedAt = Date.now()
  let firstRewardMs: number | null = null
  let lastObjective = ''
  let lastProgressAt = Date.now()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await mkdir(OUT, { recursive: true })
  try {
    await page.goto('/')
    await expect.poll(async () => (await snapshot(page))?.exploration.adventure.world.assetStatus).toBe('loaded')
    await page.locator('[data-adventure-start]').click()
    await page.locator('canvas').focus()
    while (Date.now() - startedAt < 17 * 60_000) {
      const state = await snapshot(page)
      if (!state) throw new Error('Snapshot missing')
      const adventure = state.exploration.adventure
      const progress = adventure.progress
      if (progress.claimedRewardIds.length > 0 && firstRewardMs === null) firstRewardMs = Date.now() - startedAt
      if (progress.stage === 'complete' && progress.visitedPointIds.includes('secret-garden')) break
      if (adventure.deviceOpen) {
        await pilot.stop()
        const puzzle = getWindPuzzle(adventure.objective.id)!
        const turns = progress.device?.rotations ?? puzzle.initialRotations
        for (let index = 0; index < puzzle.pieces.length; index++) {
          if (!puzzle.pieces[index]) continue
          for (let n = 0; n < (4 - turns[index]) % 4; n++) {
            const tile = page.locator(`[data-adventure-device-tile="${index}"]`)
            if (touch) await tile.tap()
            else await tile.click()
          }
        }
        await expect(page.locator('[data-adventure-device-activate]')).toBeEnabled()
        await page.screenshot({ path: `${OUT}/${info.project.name}-${adventure.objective.id}-circuit.png` })
        await page.locator('[data-adventure-device-activate]').click()
        continue
      }
      if (adventure.objective.id !== lastObjective) {
        telemetry.push({ wallMs: Date.now() - startedAt, stage: progress.stage, objective: adventure.objective.id, position: state.flight.position, elapsedPlaySeconds: progress.elapsedPlaySeconds })
        lastObjective = adventure.objective.id; lastProgressAt = Date.now()
        await page.screenshot({ path: `${OUT}/${info.project.name}-${lastObjective}.png` })
      }
      if (Date.now() - lastProgressAt > 160_000) throw new Error(`Real input stalled at ${lastObjective}`)
      if (state.exploration.paused) throw new Error('Unexpected pause during real input')
      const target = adventure.objective.position
      const distance = Math.hypot(target.x - state.flight.position.x, target.y - state.flight.position.y, target.z - state.flight.position.z)
      if (adventure.canInteract) {
        await pilot.stop()
        if (progress.stage === 'choose-route') {
          await page.locator(`[data-adventure-route="${touch ? 'ridge' : 'sheltered'}"]`).click()
        } else {
          if (progress.stage === 'restore-nest') await page.screenshot({ path: `${OUT}/${info.project.name}-before-restoration.png` })
          if (touch) await page.locator('[data-adventure-interact]').tap()
          else { await page.locator('canvas').focus(); await page.keyboard.press('KeyE') }
          if (progress.stage === 'restore-nest') await page.screenshot({ path: `${OUT}/${info.project.name}-after-restoration.png` })
        }
        await page.waitForTimeout(150)
      } else if (state.exploration.movement === 'landed') {
        await pilot.stop()
        if (touch) await page.locator('[data-explore-context]').tap()
        else { await page.locator('canvas').focus(); await page.keyboard.press('KeyE') }
        await page.waitForTimeout(800)
      } else {
        await pilot.apply(state, target, distance < adventure.objective.interactionRadius * 0.8)
        await page.waitForTimeout(80)
      }
    }
    await pilot.stop()
    const complete = await snapshot(page)
    expect(complete?.exploration.adventure.progress.stage).toBe('complete')
    expect(complete?.exploration.adventure.progress.visitedPointIds).toContain('secret-garden')
    expect(firstRewardMs).not.toBeNull()
    expect(firstRewardMs!).toBeLessThan(180_000)
    await page.locator('[data-adventure-rewards-toggle]').click()
    for (const id of ['lanterns', 'pennants', 'charm']) await page.locator(`[data-adventure-reward="${id}"]`).click()
    await expect.poll(async () => (await snapshot(page))?.exploration.adventure.world).toMatchObject({ lanternsVisible: true, pennantsVisible: true, secretPathVisible: true, charmVisible: true })
    const saved = (await snapshot(page))!.exploration.adventure.progress
    await page.reload()
    await expect.poll(async () => (await snapshot(page))?.exploration.adventure.world.assetStatus).toBe('loaded')
    await page.locator('[data-adventure-start]').click()
    expect((await snapshot(page))?.exploration.adventure.progress).toEqual(saved)
    await page.screenshot({ path: `${OUT}/${info.project.name}-reloaded-rewards.png` })
    expect(errors).toEqual([])
  } finally {
    await pilot.stop()
    await writeFile(`${OUT}/${info.project.name}-real-input.json`, JSON.stringify({ firstRewardMs, errors, telemetry, final: (await snapshot(page))?.exploration.adventure }, null, 2))
  }
})
