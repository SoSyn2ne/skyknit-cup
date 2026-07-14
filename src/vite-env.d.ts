/// <reference types="vite/client" />

import type { FlightDebugSnapshot } from './game/createRenderer'
import type {
  FestivalHubLandmarkId,
  FestivalHubWindZoneId,
} from './game/world/festivalHubActivities'
import type { OpenWorldRegionId } from './game/world/openWorldRegions'

declare global {
  interface Window {
    __DRAGON_RACE_TEST__?: {
      loseContext: () => void
      qaPassCheckpoint: () => void
      qaExploreRegion: (regionId: OpenWorldRegionId) => void
      qaExploreChallenge: () => void
      qaExploreLandmark: (landmarkId: FestivalHubLandmarkId) => void
      qaExploreWindZone: (windZoneId: FestivalHubWindZoneId) => void
      qaExploreCollision: () => void
      qaCollectCoin: (regionId: OpenWorldRegionId, index: number) => void
      snapshot: () => FlightDebugSnapshot | null
    }
  }
}

export {}
