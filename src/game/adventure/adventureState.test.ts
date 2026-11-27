import { describe, expect, it } from 'vitest'

import {
  ADVENTURE_REWARD_IDS,
  EMPTY_ADVENTURE_PROGRESS,
  advanceAdventureTime,
  canUseAdventureSense,
  cloneAdventureProgress,
  getAdventureBondLevel,
  getAdventureObjective,
  getAdventureDevice,
  rotateAdventureDevice,
  interactAdventure,
  isCanonicalAdventureProgress,
  normalizeAdventureProgress,
  setAdventureCharm,
  setAdventureDecoration,
  startAdventure,
  useAdventureSense,
  type AdventureContext,
  type AdventureProgress,
} from './adventureState'
import { ADVENTURE_HOME, ADVENTURE_POINTS, ADVENTURE_ROUTES } from './adventureWorld'
import { getWindPuzzle } from './windPuzzle'

const activeContext: AdventureContext = {
  position: ADVENTURE_HOME.position,
  gameMode: 'explore',
  coinRunActive: false,
  paused: false,
  mapOpen: false,
}

function atObjective(state: AdventureProgress): AdventureContext {
  return { ...activeContext, position: getAdventureObjective(state).position }
}

function finishRescue(): AdventureProgress {
  let state = startAdventure(EMPTY_ADVENTURE_PROGRESS)
  for (let step = 0; step < 3; step += 1) state = interactAdventure(state, atObjective(state))
  return state
}

function reachSearch(route: 'sheltered' | 'ridge' = 'sheltered'): AdventureProgress {
  let state = finishRescue()
  state = interactAdventure(state, atObjective(state), route)
  for (const _point of ADVENTURE_ROUTES[route].pointIds) {
    state = solveDevice(state)
    state = interactAdventure(state, atObjective(state))
  }
  return state
}

function solveDevice(state: AdventureProgress): AdventureProgress {
  const puzzle = getWindPuzzle(getAdventureObjective(state).id)!
  for (let index = 0; index < puzzle.pieces.length; index++) {
    for (let n = 0; n < (4 - puzzle.initialRotations[index]) % 4; n++) state = rotateAdventureDevice(state, atObjective(state), index)
  }
  return state
}

function completeChapter(): AdventureProgress {
  let state = reachSearch()
  for (let attempts = 0; attempts < 12 && state.stage === 'search-ruins'; attempts += 1) {
    state = useAdventureSense(state, atObjective(state))
    state = interactAdventure(state, atObjective(state))
  }
  return interactAdventure(state, atObjective(state))
}

describe('M46 wind device interaction guards', () => {
  function selectRoute(): AdventureProgress {
    const rescued = finishRescue()
    return interactAdventure(rescued, atObjective(rescued), 'ridge')
  }

  it.each([-1, 9, Number.NaN, Infinity, -Infinity, 0.5])('rejects invalid tile index %s without creating a draft', (index) => {
    const state = selectRoute()
    expect(rotateAdventureDevice(state, atObjective(state), index)).toBe(state)
    expect(state.device).toBeNull()
  })

  it('does not rotate a stone tile', () => {
    const state = selectRoute()
    const stoneIndex = getWindPuzzle(getAdventureObjective(state).id)!.pieces.indexOf(0)
    expect(stoneIndex).toBeGreaterThanOrEqual(0)
    expect(rotateAdventureDevice(state, atObjective(state), stoneIndex)).toBe(state)
  })

  it.each([
    { gameMode: 'race' as const },
    { coinRunActive: true },
    { paused: true },
    { mapOpen: true },
  ])('preserves the existing draft in restricted context %j', (restricted) => {
    const selected = selectRoute()
    const state = rotateAdventureDevice(selected, atObjective(selected), 3)
    expect(rotateAdventureDevice(state, { ...atObjective(state), ...restricted }, 3)).toBe(state)
  })

  it.each(['x', 'y', 'z'] as const)('rejects remote and non-finite %s positions', (axis) => {
    const selected = selectRoute()
    const state = rotateAdventureDevice(selected, atObjective(selected), 3)
    const near = atObjective(state)
    const radius = getAdventureObjective(state).interactionRadius
    for (const coordinate of [near.position[axis] + radius + 1, Number.NaN, Infinity]) {
      const context = { ...near, position: { ...near.position, [axis]: coordinate } }
      expect(rotateAdventureDevice(state, context, 3)).toBe(state)
    }
  })

  it('does not open devices before a route, after the route, or before starting', () => {
    let state = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    const earlySteps = [EMPTY_ADVENTURE_PROGRESS, state]
    for (let step = 0; step < 3; step++) {
      state = interactAdventure(state, atObjective(state))
      earlySteps.push(state)
    }
    const searching = reachSearch()
    let restoring = searching
    for (let step = 0; step < 3; step++) restoring = useAdventureSense(restoring, atObjective(restoring))
    restoring = interactAdventure(restoring, atObjective(restoring))
    const repaired = interactAdventure(restoring, atObjective(restoring))
    for (const progress of [...earlySteps, searching, restoring, repaired]) {
      expect(getAdventureDevice(progress)).toBeNull()
      expect(rotateAdventureDevice(progress, atObjective(progress), 3)).toBe(progress)
    }
    const unstarted = { ...selectRoute(), started: false }
    expect(rotateAdventureDevice(unstarted, atObjective(unstarted), 3)).toBe(unstarted)
  })

  it('rotates only the selected tile without mutating a previous draft or the puzzle template', () => {
    const selected = selectRoute()
    const puzzle = getWindPuzzle(getAdventureObjective(selected).id)!
    const originalRotations = [...puzzle.initialRotations]
    const first = rotateAdventureDevice(selected, atObjective(selected), 3)
    const previousRotations = [...first.device!.rotations]
    Object.freeze(first.device!.rotations)
    Object.freeze(first.device)
    Object.freeze(first)

    const next = rotateAdventureDevice(first, atObjective(first), 3)
    expect(next.device?.rotations[3]).toBe((previousRotations[3] + 1) % 4)
    expect(next.device?.rotations.filter((_, index) => index !== 3)).toEqual(previousRotations.filter((_, index) => index !== 3))
    expect(next.device).not.toBe(first.device)
    expect(next.device?.rotations).not.toBe(first.device?.rotations)
    expect(first.device?.rotations).toEqual(previousRotations)
    expect(selected.device).toBeNull()
    expect(puzzle.initialRotations).toEqual(originalRotations)
    expect(next.visitedPointIds).toEqual(selected.visitedPointIds)
    expect(next.claimedRewardIds).toEqual(selected.claimedRewardIds)
    expect(next.materials).toEqual(selected.materials)
  })
})

describe('M46 adventure progression', () => {
  it('requires a solved wind circuit and preserves the unfinished draft through reload', () => {
    const selected = interactAdventure(finishRescue(), atObjective(finishRescue()), 'ridge')
    expect(interactAdventure(selected, atObjective(selected))).toBe(selected)
    expect(rotateAdventureDevice(selected, atObjective(selected), -1)).toBe(selected)
    const changed = rotateAdventureDevice(selected, atObjective(selected), 3)
    expect(normalizeAdventureProgress(JSON.parse(JSON.stringify(changed)))).toEqual(changed)
    const solved = solveDevice(selected)
    expect(getAdventureDevice(solved)?.connected).toBe(true)
    expect(interactAdventure(solved, atObjective(solved)).visitedPointIds).toContain('ridge-vane')
  })

  it('makes the repaired secret garden a real one-time discovery', () => {
    const repaired = completeChapter()
    expect(getAdventureObjective(repaired).id).toBe('secret-garden')
    expect(interactAdventure(repaired, { ...activeContext, position: ADVENTURE_HOME.position })).toBe(repaired)
    const discovered = interactAdventure(repaired, atObjective(repaired))
    expect(discovered.visitedPointIds).toContain('secret-garden')
    expect(discovered.bondXp).toBe(repaired.bondXp + 0.25)
    expect(getAdventureObjective(discovered).id).toBe('complete')
    expect(interactAdventure(discovered, atObjective(discovered))).toBe(discovered)
  })
  it('awards persistent bond progress for each distinct ruin discovery without duplicate gain', () => {
    const searching = reachSearch()
    const firstContext = atObjective(searching)
    const discovered = useAdventureSense(searching, firstContext)
    expect(discovered.bondXp).toBe(searching.bondXp + 0.25)
    expect(useAdventureSense(discovered, firstContext)).toBe(discovered)
    expect(normalizeAdventureProgress(JSON.parse(JSON.stringify(discovered))).bondXp).toBe(discovered.bondXp)
  })
  it('starts once without claiming any reward and leaves the empty state immutable', () => {
    const state = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    expect(state.started).toBe(true)
    expect(state.stage).toBe('meet-keeper')
    expect(state.claimedRewardIds).toEqual([])
    expect(startAdventure(state)).toBe(state)
    expect(EMPTY_ADVENTURE_PROGRESS.started).toBe(false)
  })

  it('requires starting and actual proximity in all three dimensions', () => {
    expect(interactAdventure(EMPTY_ADVENTURE_PROGRESS, atObjective(EMPTY_ADVENTURE_PROGRESS))).toBe(EMPTY_ADVENTURE_PROGRESS)
    const state = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    expect(interactAdventure(state, { ...activeContext, position: { x: 9999, y: 8, z: 9999 } })).toBe(state)
    const near = atObjective(state)
    expect(interactAdventure(state, { ...near, position: { ...near.position, y: near.position.y + 100 } })).toBe(state)
    expect(interactAdventure(state, { ...near, position: { ...near.position, x: Number.NaN } })).toBe(state)
  })

  it('rescues and returns the bird before awarding bond and lanterns exactly once', () => {
    let state = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    state = interactAdventure(state, atObjective(state))
    expect(state.stage).toBe('rescue-bird')
    state = interactAdventure(state, atObjective(state))
    expect(state.stage).toBe('return-bird')
    expect(state.claimedRewardIds).toEqual([])
    state = interactAdventure(state, atObjective(state))
    expect(state.stage).toBe('choose-route')
    expect(getAdventureBondLevel(state)).toBe(1)
    expect(state.claimedRewardIds).toEqual([ADVENTURE_REWARD_IDS.rescue])
    expect(interactAdventure(state, atObjective(state))).toBe(state)
    expect(setAdventureDecoration(state, 'lanterns', true).placedDecorations).toEqual(['lanterns'])
    expect(setAdventureDecoration(state, 'pennants', true)).toBe(state)
  })

  it.each(['sheltered', 'ridge'] as const)('requires every ordered %s route device and grants one core', (route) => {
    let state = finishRescue()
    expect(interactAdventure(state, { ...activeContext, position: ADVENTURE_POINTS.rescue.position }, route)).toBe(state)
    state = interactAdventure(state, atObjective(state), route)
    expect(state.stage).toBe('route-flight')
    const points = ADVENTURE_ROUTES[route].pointIds
    const finalPoint = ADVENTURE_POINTS[points[points.length - 1]]
    expect(interactAdventure(state, { ...activeContext, position: finalPoint.position })).toBe(state)
    for (const pointId of points) {
      expect(getAdventureObjective(state).id).toBe(pointId)
      state = solveDevice(state)
      state = interactAdventure(state, atObjective(state))
    }
    expect(state.stage).toBe('search-ruins')
    expect(state.materials.windCore).toBe(1)
    expect(getAdventureBondLevel(state)).toBe(2)
    expect(setAdventureDecoration(state, 'pennants', true).placedDecorations).toEqual(['pennants'])
  })

  it('requires local sense action before hidden ruins can yield the sun thread', () => {
    let state = reachSearch()
    expect(interactAdventure(state, { ...activeContext, position: ADVENTURE_POINTS.ruins.position })).toBe(state)
    expect(useAdventureSense(state, { ...activeContext, position: ADVENTURE_HOME.position })).toBe(state)
    for (let step = 0; step < 3; step += 1) {
      expect(state.ruinsRevealed).toBe(false)
      expect(canUseAdventureSense(state, atObjective(state))).toBe(true)
      state = useAdventureSense(state, atObjective(state))
    }
    expect(state.ruinsRevealed).toBe(true)
    expect(state.materials.sunThread).toBe(0)
    state = interactAdventure(state, atObjective(state))
    expect(state.stage).toBe('restore-nest')
    expect(state.materials.sunThread).toBe(1)
  })

  it('repairs once, consumes each material once, and unlocks reversible cosmetic choices', () => {
    const complete = completeChapter()
    expect(complete.stage).toBe('complete')
    expect(complete.windmillRepaired).toBe(true)
    expect(complete.ruinsRevealed).toBe(true)
    expect(complete.materials).toEqual({ windCore: 0, sunThread: 0 })
    expect(getAdventureBondLevel(complete)).toBe(3)
    expect(interactAdventure(complete, { ...activeContext, position: ADVENTURE_POINTS.repair.position })).toBe(complete)
    expect(setAdventureCharm(EMPTY_ADVENTURE_PROGRESS, true)).toBe(EMPTY_ADVENTURE_PROGRESS)
    const equipped = setAdventureCharm(complete, true)
    expect(equipped.equippedCharm).toBe(true)
    expect(setAdventureCharm(equipped, true)).toBe(equipped)
    expect(setAdventureCharm(equipped, false).equippedCharm).toBe(false)
    const decorated = setAdventureDecoration(setAdventureDecoration(complete, 'lanterns', true), 'pennants', true)
    expect(decorated.placedDecorations).toEqual(['lanterns', 'pennants'])
    expect(setAdventureDecoration(decorated, 'lanterns', true)).toBe(decorated)
    expect(setAdventureDecoration(decorated, 'lanterns', false).placedDecorations).toEqual(['pennants'])
  })

  it.each([
    { gameMode: 'race' as const },
    { coinRunActive: true },
    { paused: true },
    { mapOpen: true },
  ])('blocks progression and sense for restricted context %j', (restricted) => {
    const active = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    expect(interactAdventure(active, { ...atObjective(active), ...restricted })).toBe(active)
    const searching = reachSearch()
    const context = { ...atObjective(searching), ...restricted }
    expect(canUseAdventureSense(searching, context)).toBe(false)
    expect(useAdventureSense(searching, context)).toBe(searching)
  })

  it('counts only valid allowed active play without introducing time gates', () => {
    const state = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    expect(advanceAdventureTime(state, 15, true).elapsedPlaySeconds).toBe(15)
    for (const dt of [-1, 0, Number.NaN, Infinity]) expect(advanceAdventureTime(state, dt, true)).toBe(state)
    expect(advanceAdventureTime(state, 15, false)).toBe(state)
    expect(advanceAdventureTime(EMPTY_ADVENTURE_PROGRESS, 15, true)).toBe(EMPTY_ADVENTURE_PROGRESS)
    const repaired = completeChapter()
    const done = interactAdventure(repaired, atObjective(repaired))
    expect(advanceAdventureTime(done, 15, true)).toBe(done)
    expect(done.elapsedPlaySeconds).toBe(0)
  })
})

describe('M46 save canonicalization', () => {
  it('copies a current device draft during normalization and recovery cloning', () => {
    const rescued = finishRescue()
    const selected = interactAdventure(rescued, atObjective(rescued), 'ridge')
    const changed = rotateAdventureDevice(selected, atObjective(selected), 3)
    const raw = { ...changed, device: { pointId: changed.device!.pointId, rotations: [...changed.device!.rotations] } }
    const normalized = normalizeAdventureProgress(raw)
    const cloned = cloneAdventureProgress(normalized)
    expect(isCanonicalAdventureProgress(normalized)).toBe(true)
    expect(normalized).toEqual(changed)
    expect(normalized.device).not.toBe(raw.device)
    expect(normalized.device?.rotations).not.toBe(raw.device.rotations)
    expect(cloned).toEqual(normalized)
    expect(cloned.device).not.toBe(normalized.device)
    expect(cloned.device?.rotations).not.toBe(normalized.device?.rotations)
    raw.device.rotations[3] = (raw.device.rotations[3] + 1) % 4
    ;(cloned.device!.rotations as number[])[3] = (cloned.device!.rotations[3] + 2) % 4
    expect(normalized.device).toEqual(changed.device)
  })

  it.each(['missing-device', 'sheltered-inlet', 'ridge-sail'])('discards a draft for %s without changing the current route or earned reward', (pointId) => {
    const rescued = finishRescue()
    const selected = interactAdventure(rescued, atObjective(rescued), 'ridge')
    const malformed = { ...selected, device: { pointId, rotations: Array(9).fill(0) } }
    expect(normalizeAdventureProgress(malformed)).toEqual(selected)
    expect(isCanonicalAdventureProgress(malformed)).toBe(false)
  })

  it('discards malformed current drafts without clearing completed route devices', () => {
    const rescued = finishRescue()
    const selected = interactAdventure(rescued, atObjective(rescued), 'ridge')
    const next = interactAdventure(solveDevice(selected), atObjective(selected))
    const malformed = { ...next, device: { pointId: 'ridge-sail', rotations: [0] } }
    expect(normalizeAdventureProgress(malformed)).toEqual(next)
    expect(getAdventureObjective(next).id).toBe('ridge-sail')
    expect(next.visitedPointIds).toContain('ridge-vane')
    expect(isCanonicalAdventureProgress(malformed)).toBe(false)
  })

  it('preserves an already restored chapter and earned cosmetics when a legacy save has no device draft', () => {
    const complete = setAdventureDecoration(setAdventureDecoration(setAdventureCharm(completeChapter(), true), 'lanterns', true), 'pennants', true)
    const legacy = { ...complete }
    delete legacy.device
    const restored = normalizeAdventureProgress(legacy)
    expect(restored).toEqual(complete)
    expect(restored.stage).toBe('complete')
    expect(restored.device).toBeNull()
    expect(restored.claimedRewardIds).toEqual([ADVENTURE_REWARD_IDS.rescue, ADVENTURE_REWARD_IDS.route, ADVENTURE_REWARD_IDS.restoration])
    expect(restored.materials).toEqual({ windCore: 0, sunThread: 0 })
    expect(restored.equippedCharm).toBe(true)
    expect(restored.placedDecorations).toEqual(['lanterns', 'pennants'])
    expect(isCanonicalAdventureProgress(legacy)).toBe(true)
    expect(interactAdventure(restored, { ...activeContext, position: ADVENTURE_POINTS.repair.position })).toBe(restored)
  })

  it('round trips every reachable step and copies all mutable containers', () => {
    let step = startAdventure(EMPTY_ADVENTURE_PROGRESS)
    for (let index = 0; index < 16 && step.stage !== 'complete'; index += 1) {
      expect(isCanonicalAdventureProgress(step)).toBe(true)
      expect(normalizeAdventureProgress(JSON.parse(JSON.stringify(step)))).toEqual(step)
      if (canUseAdventureSense(step, atObjective(step))) {
        step = useAdventureSense(step, atObjective(step))
      } else {
        if (step.stage === 'route-flight') step = solveDevice(step)
        step = interactAdventure(step, atObjective(step), step.stage === 'choose-route' ? 'ridge' : undefined)
      }
    }
    expect(step.stage).toBe('complete')
    const original = setAdventureDecoration(setAdventureCharm(completeChapter(), true), 'lanterns', true)
    expect(normalizeAdventureProgress(JSON.parse(JSON.stringify(original)))).toEqual(original)
    expect(isCanonicalAdventureProgress(original)).toBe(true)
    const cloned = cloneAdventureProgress(original)
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.materials).not.toBe(original.materials)
    expect(cloned.visitedPointIds).not.toBe(original.visitedPointIds)
    expect(cloned.claimedRewardIds).not.toBe(original.claimedRewardIds)
    expect(cloned.placedDecorations).not.toBe(original.placedDecorations)
  })

  it.each([undefined, null, [], false, 5, 'complete'])('normalizes malformed root %j to empty', (input) => {
    expect(normalizeAdventureProgress(input)).toEqual(EMPTY_ADVENTURE_PROGRESS)
    expect(isCanonicalAdventureProgress(input)).toBe(false)
  })

  it('does not grant rewards or repair from forged stage, xp, materials, or cosmetic fields', () => {
    const recovered = normalizeAdventureProgress({
      ...EMPTY_ADVENTURE_PROGRESS,
      started: true,
      stage: 'complete',
      bondXp: 999,
      materials: { windCore: 999, sunThread: 999 },
      ruinsRevealed: true,
      windmillRepaired: true,
      equippedCharm: true,
      placedDecorations: ['lanterns', 'pennants', 'unknown'],
      elapsedPlaySeconds: Infinity,
    })
    expect(recovered.stage).toBe('meet-keeper')
    expect(recovered.claimedRewardIds).toEqual([])
    expect(recovered.bondXp).toBe(0)
    expect(recovered.materials).toEqual({ windCore: 0, sunThread: 0 })
    expect(recovered.windmillRepaired).toBe(false)
    expect(recovered.ruinsRevealed).toBe(false)
    expect(recovered.equippedCharm).toBe(false)
    expect(recovered.placedDecorations).toEqual([])
    expect(isCanonicalAdventureProgress({ ...recovered, materials: { windCore: 999, sunThread: 999 } })).toBe(false)
  })

  it('recovers progress from ordered known visits without duplicating rewards or consuming twice', () => {
    const original = completeChapter()
    const recovered = normalizeAdventureProgress({
      ...original,
      claimedRewardIds: [...original.claimedRewardIds, ...original.claimedRewardIds, 'fake'],
      visitedPointIds: [...original.visitedPointIds, ...original.visitedPointIds, 'fake'],
      placedDecorations: ['lanterns', 'lanterns'],
      bondXp: -500,
      materials: { windCore: 17, sunThread: -6 },
    })
    expect(recovered.stage).toBe('complete')
    expect(recovered.materials).toEqual({ windCore: 0, sunThread: 0 })
    expect(recovered.claimedRewardIds).toEqual(original.claimedRewardIds)
    expect(recovered.visitedPointIds).toEqual(original.visitedPointIds)
    expect(recovered.placedDecorations).toEqual(['lanterns'])
    expect(normalizeAdventureProgress(recovered)).toEqual(recovered)
    expect(interactAdventure(recovered, { ...activeContext, position: ADVENTURE_POINTS.repair.position })).toBe(recovered)
  })

  it('rejects sparse future visits and the unchosen branch instead of skipping prerequisite actions', () => {
    const state = normalizeAdventureProgress({
      ...finishRescue(),
      route: 'ridge',
      visitedPointIds: ['keeper', 'rescue', 'bird-return', 'sheltered-inlet', 'ridge-sail', 'search-garden', 'repair'],
    })
    expect(state.stage).toBe('route-flight')
    expect(state.visitedPointIds).toEqual(['keeper', 'rescue', 'bird-return'])
    expect(state.materials.windCore).toBe(0)
    expect(state.ruinsRevealed).toBe(false)
    expect(getAdventureObjective(state).id).toBe('ridge-vane')
  })

  it('normalization cannot share input arrays or materials with persisted progress', () => {
    const raw = { ...finishRescue(), visitedPointIds: ['keeper', 'rescue', 'bird-return'], placedDecorations: ['lanterns'] }
    const normalized = normalizeAdventureProgress(raw)
    raw.visitedPointIds.push('repair')
    raw.placedDecorations.push('pennants')
    expect(normalized.visitedPointIds).toEqual(['keeper', 'rescue', 'bird-return'])
    expect(normalized.placedDecorations).toEqual(['lanterns'])
    expect(normalized.materials).not.toBe(raw.materials)
  })
})
