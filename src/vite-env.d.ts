/// <reference types="vite/client" />

import type {
  FestivalHubLandingPadId,
  FlightDebugSnapshot,
} from './game/createRenderer'
import type {
  FestivalHubLandmarkId,
  FestivalHubWindZoneId,
} from './game/world/festivalHubActivities'
import type { OpenWorldRegionId } from './game/world/openWorldRegions'
import type { GeometryResourceLedgerSnapshot } from './game/qa/geometryResourceLedger'

declare global {
  interface ImportMetaEnv {
    readonly VITE_QA?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    __DRAGON_RACE_TEST__?: {
      loseContext: () => void
      qaPassCheckpoint: () => void
      qaExploreRegion: (regionId: OpenWorldRegionId) => void
      qaExploreChallenge: () => void
      qaExploreVolcanicChallenge: () => void
      qaExploreLandmark: (landmarkId: FestivalHubLandmarkId) => void
      qaExploreLandmarkView: (landmarkId: FestivalHubLandmarkId) => void
      qaExploreOverview: () => void
      qaExploreLandingPad: (landingPadId: FestivalHubLandingPadId) => void
      qaExploreWindZone: (windZoneId: FestivalHubWindZoneId) => void
      qaExploreCollision: () => void
      qaCollectCoin: (regionId: OpenWorldRegionId, index: number) => void
      qaGeometryLedger: () => GeometryResourceLedgerSnapshot | null
      snapshot: () => FlightDebugSnapshot | null
    }
  }
}

export {}
