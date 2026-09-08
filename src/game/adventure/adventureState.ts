import {
  ADVENTURE_POINTS,
  ADVENTURE_ROUTES,
  ADVENTURE_SEARCH_POINT_IDS,
  type AdventureObjective,
  type AdventureRouteId,
} from './adventureWorld'
import type { Vec3Value } from '../flight/flightModel'
import { getWindPuzzle, getWindPuzzleView, normalizeWindDraft, type WindPuzzleDraft } from './windPuzzle'

export type { AdventureObjective, AdventureRouteId } from './adventureWorld'
export type AdventureDecoration = 'lanterns' | 'pennants'
export type AdventureStage = 'meet-keeper' | 'rescue-bird' | 'return-bird' | 'choose-route'
  | 'route-flight' | 'search-ruins' | 'restore-nest' | 'complete'

export interface AdventureProgress {
  readonly started: boolean
  readonly stage: AdventureStage
  readonly route: AdventureRouteId | null
  readonly visitedPointIds: readonly string[]
  readonly claimedRewardIds: readonly string[]
  readonly bondXp: number
  readonly materials: { readonly windCore: number; readonly sunThread: number }
  readonly ruinsRevealed: boolean
  readonly windmillRepaired: boolean
  readonly equippedCharm: boolean
  readonly placedDecorations: readonly AdventureDecoration[]
  readonly elapsedPlaySeconds: number
  readonly device?: WindPuzzleDraft | null
}

export interface AdventureContext {
  readonly position: Vec3Value
  readonly gameMode: 'race' | 'explore'
  readonly coinRunActive: boolean
  readonly paused: boolean
  readonly mapOpen: boolean
}

export const ADVENTURE_REWARD_IDS = {
  rescue: 'rescue-bird',
  route: 'wind-route',
  restoration: 'restore-nest',
} as const

export const EMPTY_ADVENTURE_PROGRESS: AdventureProgress = Object.freeze({
  started: false,
  stage: 'meet-keeper',
  route: null,
  visitedPointIds: Object.freeze([]),
  claimedRewardIds: Object.freeze([]),
  bondXp: 0,
  materials: Object.freeze({ windCore: 0, sunThread: 0 }),
  ruinsRevealed: false,
  windmillRepaired: false,
  equippedCharm: false,
  placedDecorations: Object.freeze([]),
  elapsedPlaySeconds: 0,
  device: null,
})

export function cloneAdventureProgress(progress: AdventureProgress): AdventureProgress {
  return {
    ...progress,
    visitedPointIds: [...progress.visitedPointIds],
    claimedRewardIds: [...progress.claimedRewardIds],
    materials: { ...progress.materials },
    placedDecorations: [...progress.placedDecorations],
    device: progress.device ? { pointId: progress.device.pointId, rotations: [...progress.device.rotations] } : null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasString(value: unknown, item: string): boolean {
  return Array.isArray(value) && value.includes(item)
}

/** Visits are the durable source of truth; derived fields cannot mint extra items on reload. */
export function normalizeAdventureProgress(value: unknown): AdventureProgress {
  if (!isRecord(value) || value.started !== true) return cloneAdventureProgress(EMPTY_ADVENTURE_PROGRESS)
  const visits: string[] = []
  for (const id of ['keeper', 'rescue', 'bird-return']) {
    if (!hasString(value.visitedPointIds, id)) break
    visits.push(id)
  }
  const rescued = visits.length === 3
  const route = rescued && (value.route === 'sheltered' || value.route === 'ridge') ? value.route : null
  const routePoints = route === null ? [] : ADVENTURE_ROUTES[route].pointIds
  for (const id of routePoints) {
    if (!hasString(value.visitedPointIds, id)) break
    visits.push(id)
  }
  const routeFinished = route !== null && routePoints.every((id) => visits.includes(id))
  if (routeFinished) {
    for (const id of [...ADVENTURE_SEARCH_POINT_IDS, 'ruins', 'repair', 'secret-garden']) {
      if (!hasString(value.visitedPointIds, id)) break
      visits.push(id)
    }
  }
  const ruinsRevealed = visits.includes(ADVENTURE_SEARCH_POINT_IDS[2])
  const threadFound = visits.includes('ruins')
  const repaired = visits.includes('repair')
  const claimedRewardIds = [
    ...(rescued ? [ADVENTURE_REWARD_IDS.rescue] : []),
    ...(routeFinished ? [ADVENTURE_REWARD_IDS.route] : []),
    ...(repaired ? [ADVENTURE_REWARD_IDS.restoration] : []),
  ]
  const stage: AdventureStage = repaired ? 'complete'
    : threadFound ? 'restore-nest'
      : routeFinished ? 'search-ruins'
        : route !== null ? 'route-flight'
          : rescued ? 'choose-route'
            : visits.includes('rescue') ? 'return-bird'
              : visits.includes('keeper') ? 'rescue-bird' : 'meet-keeper'
  return {
    started: true,
    stage,
    route,
    visitedPointIds: visits,
    claimedRewardIds,
    bondXp: claimedRewardIds.length + [...ADVENTURE_SEARCH_POINT_IDS, 'secret-garden'].filter(id => visits.includes(id)).length * 0.25,
    materials: { windCore: routeFinished && !repaired ? 1 : 0, sunThread: threadFound && !repaired ? 1 : 0 },
    ruinsRevealed,
    windmillRepaired: repaired,
    device: stage === 'route-flight' ? normalizeWindDraft(value.device, routePoints.find(id => !visits.includes(id)) ?? '') : null,
    equippedCharm: repaired && value.equippedCharm === true,
    placedDecorations: [
      ...(rescued && hasString(value.placedDecorations, 'lanterns') ? ['lanterns' as const] : []),
      ...(routeFinished && hasString(value.placedDecorations, 'pennants') ? ['pennants' as const] : []),
    ],
    elapsedPlaySeconds: typeof value.elapsedPlaySeconds === 'number'
      && Number.isFinite(value.elapsedPlaySeconds) && value.elapsedPlaySeconds >= 0
      ? Math.min(Number.MAX_SAFE_INTEGER, value.elapsedPlaySeconds) : 0,
  }
}

function sameList(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && value.every((item, index) => item === expected[index])
}

export function isCanonicalAdventureProgress(value: unknown): value is AdventureProgress {
  if (!isRecord(value) || !isRecord(value.materials)) return false
  const canonical = normalizeAdventureProgress(value)
  return value.started === canonical.started && value.stage === canonical.stage
    && value.route === canonical.route && value.bondXp === canonical.bondXp
    && value.ruinsRevealed === canonical.ruinsRevealed && value.windmillRepaired === canonical.windmillRepaired
    && value.equippedCharm === canonical.equippedCharm && value.elapsedPlaySeconds === canonical.elapsedPlaySeconds
    && value.materials.windCore === canonical.materials.windCore && value.materials.sunThread === canonical.materials.sunThread
    && sameList(value.visitedPointIds, canonical.visitedPointIds)
    && sameList(value.claimedRewardIds, canonical.claimedRewardIds)
    && sameList(value.placedDecorations, canonical.placedDecorations)
    && JSON.stringify(value.device ?? null) === JSON.stringify(canonical.device ?? null)
}

export function startAdventure(progress: AdventureProgress): AdventureProgress {
  return progress.started ? progress : { ...cloneAdventureProgress(progress), started: true }
}

export function advanceAdventureTime(progress: AdventureProgress, deltaSeconds: number, allowed: boolean): AdventureProgress {
  if (!progress.started || progress.visitedPointIds.includes('secret-garden') || allowed !== true
    || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return progress
  return { ...progress, elapsedPlaySeconds: Math.min(Number.MAX_SAFE_INTEGER, progress.elapsedPlaySeconds + deltaSeconds) }
}

export function getAdventureBondLevel(progress: AdventureProgress): number {
  return Math.min(3, Math.max(0, Math.floor(progress.bondXp)))
}

export function getAdventureObjective(progress: AdventureProgress): AdventureObjective {
  switch (progress.stage) {
    case 'meet-keeper': return ADVENTURE_POINTS.keeper
    case 'rescue-bird': return ADVENTURE_POINTS.rescue
    case 'return-bird': return ADVENTURE_POINTS['bird-return']
    case 'choose-route': return ADVENTURE_POINTS['choose-route']
    case 'route-flight': {
      const ids = ADVENTURE_ROUTES[progress.route ?? 'sheltered'].pointIds
      return ADVENTURE_POINTS[ids.find((id) => !progress.visitedPointIds.includes(id)) ?? ids[ids.length - 1]]
    }
    case 'search-ruins': {
      const id = ADVENTURE_SEARCH_POINT_IDS.find((candidate) => !progress.visitedPointIds.includes(candidate))
      return ADVENTURE_POINTS[id ?? 'ruins']
    }
    case 'restore-nest': return ADVENTURE_POINTS.repair
    case 'complete': return progress.windmillRepaired && !progress.visitedPointIds.includes('secret-garden') ? ADVENTURE_POINTS['secret-garden'] : ADVENTURE_POINTS.complete
  }
}

function canInteract(progress: AdventureProgress, context: AdventureContext): boolean {
  if (!progress.started || context.gameMode !== 'explore' || context.coinRunActive
    || context.paused || context.mapOpen) return false
  const target = getAdventureObjective(progress)
  const { x, y, z } = context.position
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    && Math.hypot(x - target.position.x, y - target.position.y, z - target.position.z) <= target.interactionRadius
}

export function canUseAdventureSense(progress: AdventureProgress, context: AdventureContext): boolean {
  return progress.stage === 'search-ruins' && !progress.ruinsRevealed
    && progress.claimedRewardIds.includes(ADVENTURE_REWARD_IDS.rescue) && canInteract(progress, context)
}

function visitObjective(progress: AdventureProgress): AdventureProgress {
  const id = getAdventureObjective(progress).id
  if (progress.visitedPointIds.includes(id)) return progress
  return normalizeAdventureProgress({ ...progress, visitedPointIds: [...progress.visitedPointIds, id] })
}

export function useAdventureSense(progress: AdventureProgress, context: AdventureContext): AdventureProgress {
  return canUseAdventureSense(progress, context) ? visitObjective(progress) : progress
}

export function interactAdventure(progress: AdventureProgress, context: AdventureContext, choice?: AdventureRouteId): AdventureProgress {
  if (!canInteract(progress, context) || getAdventureObjective(progress).id === 'complete') return progress
  if (progress.stage === 'choose-route') {
    return choice === 'sheltered' || choice === 'ridge' ? { ...progress, route: choice, stage: 'route-flight' } : progress
  }
  if (progress.stage === 'search-ruins' && !progress.ruinsRevealed) return progress
  if (progress.stage === 'route-flight' && !getAdventureDevice(progress)?.connected) return progress
  if (progress.stage === 'restore-nest' && (progress.materials.windCore !== 1 || progress.materials.sunThread !== 1)) return progress
  return visitObjective(progress)
}

export function getAdventureDevice(progress: AdventureProgress) {
  if (progress.stage !== 'route-flight') return null
  const pointId = getAdventureObjective(progress).id
  return getWindPuzzleView(pointId, progress.device?.pointId === pointId ? progress.device.rotations : undefined)
}

export function rotateAdventureDevice(progress: AdventureProgress, context: AdventureContext, index: number): AdventureProgress {
  if (progress.stage !== 'route-flight' || !canInteract(progress, context)) return progress
  const pointId = getAdventureObjective(progress).id
  const puzzle = getWindPuzzle(pointId)
  if (!puzzle || !Number.isInteger(index) || index < 0 || index >= puzzle.pieces.length || puzzle.pieces[index] === 0) return progress
  const rotations = [...(progress.device?.pointId === pointId ? progress.device.rotations : puzzle.initialRotations)]
  rotations[index] = (rotations[index] + 1) % 4
  return { ...progress, device: { pointId, rotations } }
}

export function setAdventureDecoration(progress: AdventureProgress, decoration: AdventureDecoration, enabled: boolean): AdventureProgress {
  const rewardId = decoration === 'lanterns' ? ADVENTURE_REWARD_IDS.rescue
    : decoration === 'pennants' ? ADVENTURE_REWARD_IDS.route : null
  if (rewardId === null || !progress.claimedRewardIds.includes(rewardId)
    || progress.placedDecorations.includes(decoration) === enabled) return progress
  return {
    ...progress,
    placedDecorations: enabled
      ? (['lanterns', 'pennants'] as const).filter((id) => id === decoration || progress.placedDecorations.includes(id))
      : progress.placedDecorations.filter((id) => id !== decoration),
  }
}

export function setAdventureCharm(progress: AdventureProgress, enabled: boolean): AdventureProgress {
  if (!progress.claimedRewardIds.includes(ADVENTURE_REWARD_IDS.restoration) || progress.equippedCharm === enabled) return progress
  return { ...progress, equippedCharm: enabled }
}
