/// <reference types="vite/client" />

import type { FlightDebugSnapshot } from './game/createRenderer'
import type { OpenWorldRegionId } from './game/world/openWorldRegions'

declare global {
  interface Window {
    __DRAGON_RACE_TEST__?: {
      loseContext: () => void
      qaPassCheckpoint: () => void
      qaExploreRegion: (regionId: OpenWorldRegionId) => void
      qaExploreChallenge: () => void
      qaCollectCoin: (regionId: OpenWorldRegionId, index: number) => void
      snapshot: () => FlightDebugSnapshot | null
    }
  }
}

export {}
