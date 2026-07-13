import type { QualityPreference } from '../persistence/records'

export type RenderQualityTier = 'low' | 'high'

export interface QualitySignals {
  readonly preference: QualityPreference
  readonly coarsePointer: boolean
  readonly viewportWidth: number
  readonly devicePixelRatio: number
  readonly deviceMemoryGb?: number
  readonly hardwareConcurrency?: number
}

export interface RenderQualityBudget {
  readonly tier: RenderQualityTier
  readonly dprCap: number
  readonly pixelRatio: number
  readonly cloudCount: number
  readonly boostRingCount: number
  readonly shadows: boolean
  readonly shadowMapSize: number
  readonly cloudWispCount: number
  readonly cloudDeckCount: number
  readonly speedStreakCount: number
}

const LOW_BUDGET = {
  dprCap: 1.25,
  cloudCount: 24,
  boostRingCount: 1,
  shadows: false,
  shadowMapSize: 0,
  cloudWispCount: 12,
  cloudDeckCount: 0,
  speedStreakCount: 0,
} as const

const HIGH_BUDGET = {
  dprCap: 1.75,
  cloudCount: 32,
  boostRingCount: 3,
  shadows: true,
  shadowMapSize: 1_024,
  cloudWispCount: 16,
  cloudDeckCount: 8,
  speedStreakCount: 18,
} as const

function autoTier(signals: QualitySignals): RenderQualityTier {
  if (
    signals.coarsePointer ||
    signals.viewportWidth <= 844 ||
    (signals.deviceMemoryGb !== undefined && signals.deviceMemoryGb <= 4) ||
    (signals.hardwareConcurrency !== undefined &&
      signals.hardwareConcurrency <= 4)
  ) {
    return 'low'
  }

  return 'high'
}

export function resolveRenderQuality(
  signals: QualitySignals,
): RenderQualityBudget {
  const tier =
    signals.preference === 'auto'
      ? autoTier(signals)
      : signals.preference
  const budget = tier === 'low' ? LOW_BUDGET : HIGH_BUDGET
  const dprCap = signals.coarsePointer ? LOW_BUDGET.dprCap : budget.dprCap
  const devicePixelRatio =
    Number.isFinite(signals.devicePixelRatio) && signals.devicePixelRatio > 0
      ? signals.devicePixelRatio
      : 1

  return {
    tier,
    dprCap,
    pixelRatio: Math.min(devicePixelRatio, dprCap),
    cloudCount: budget.cloudCount,
    boostRingCount: budget.boostRingCount,
    shadows: budget.shadows,
    shadowMapSize: budget.shadowMapSize,
    cloudWispCount: budget.cloudWispCount,
    cloudDeckCount: budget.cloudDeckCount,
    speedStreakCount: budget.speedStreakCount,
  }
}
