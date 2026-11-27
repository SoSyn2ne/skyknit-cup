import type { ExplorationLandingPad } from '../exploration/explorationFlight'
import type { Vec3Value } from '../flight/flightModel'

export type AdventureRouteId = 'sheltered' | 'ridge'

export interface AdventureObjective {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly position: Vec3Value
  readonly interactionRadius: number
  readonly actionLabel: string
}

/** Ground origin of the authored hub; spawn at the pad's landed height, not here. */
export const ADVENTURE_HOME = {
  position: { x: -82, y: 6, z: 30 },
  headingRadians: Math.atan2(8, 2),
} as const

export const ADVENTURE_LANDING_PAD: ExplorationLandingPad = {
  id: 'adventure-nest-pad',
  position: ADVENTURE_HOME.position,
  radius: 14,
}

export const ADVENTURE_GARDEN_PAD: ExplorationLandingPad = {
  id: 'adventure-secret-garden-pad', position: { x: -22, y: 14, z: 70 }, radius: 10,
}

export const ADVENTURE_POINTS: Readonly<Record<string, AdventureObjective>> = {
  keeper: {
    id: 'keeper', label: '누리와 이야기하기',
    description: '풍차가 멈춘 둥지예요. 누리가 바람새 한 마리를 기다리고 있어요.',
    position: { x: -74, y: 7.2, z: 28 }, interactionRadius: 13, actionLabel: '이야기하기',
  },
  rescue: {
    id: 'rescue', label: '절벽 선반의 바람새 구조하기',
    description: '북쪽 절벽에 바람새가 남았어요. 가까이 다가가 함께 돌아와요.',
    position: { x: -135, y: 12, z: -120 }, interactionRadius: 16, actionLabel: '바람새 구조하기',
  },
  'bird-return': {
    id: 'bird-return', label: '바람새를 누리에게 데려가기',
    description: '바람새가 따라와요. 둥지의 누리에게 돌아가 첫 유대와 등불을 받아요.',
    position: { x: -74, y: 7.2, z: 28 }, interactionRadius: 13, actionLabel: '바람새 돌려보내기',
  },
  'choose-route': {
    id: 'choose-route', label: '풍차 심장을 찾을 항로 고르기',
    description: '누리 곁에서 낮고 넓은 피난길 또는 고도를 넘나드는 능선길을 골라요.',
    position: { x: -74, y: 7.2, z: 28 }, interactionRadius: 13, actionLabel: '항로 선택',
  },
  'sheltered-inlet': {
    id: 'sheltered-inlet', label: '피난길 · 바람받이 열기',
    description: '축제섬 북쪽 낮은 바위 아래에서 막힌 바람받이를 열어요.',
    position: { x: -150, y: 20, z: -300 }, interactionRadius: 17, actionLabel: '바람받이 열기',
  },
  'sheltered-bell': {
    id: 'sheltered-bell', label: '피난길 · 용암섬 바람종 울리기',
    description: '붉은 섬 서쪽의 안전한 선반에서 바람종으로 길을 확인해요.',
    position: { x: -400, y: 34, z: -720 }, interactionRadius: 17, actionLabel: '바람종 울리기',
  },
  'sheltered-sluice': {
    id: 'sheltered-sluice', label: '피난길 · 북쪽 바람수문 돌리기',
    description: '용암섬과 협곡 사이를 돌아 북쪽 수문의 손잡이를 맞춰요.',
    position: { x: 180, y: 32, z: -980 }, interactionRadius: 17, actionLabel: '바람수문 돌리기',
  },
  'sheltered-heart': {
    id: 'sheltered-heart', label: '피난길 · 풍차 심장 받기',
    description: '세 장치가 바람을 이었어요. 협곡 동쪽 받침대에서 심장을 가져와요.',
    position: { x: 635, y: 35, z: -625 }, interactionRadius: 17, actionLabel: '풍차 심장 받기',
  },
  'ridge-vane': {
    id: 'ridge-vane', label: '능선길 · 높은 풍향계 맞추기',
    description: '축제섬 동쪽 높은 바위로 올라가 풍향계를 맞춰요.',
    position: { x: 120, y: 70, z: -270 }, interactionRadius: 17, actionLabel: '풍향계 맞추기',
  },
  'ridge-sail': {
    id: 'ridge-sail', label: '능선길 · 하늘돛 펼치기',
    description: '협곡 남쪽 봉우리 꼭대기에 묶인 돛을 펼쳐요.',
    position: { x: 430, y: 132, z: -530 }, interactionRadius: 17, actionLabel: '하늘돛 펼치기',
  },
  'ridge-chime': {
    id: 'ridge-chime', label: '능선길 · 능선종 울리기',
    description: '북동쪽 봉우리로 내려가 마지막 바람의 높이를 찾아요.',
    position: { x: 600, y: 86, z: -820 }, interactionRadius: 17, actionLabel: '능선종 울리기',
  },
  'ridge-heart': {
    id: 'ridge-heart', label: '능선길 · 풍차 심장 받기',
    description: '협곡 동쪽 낮은 받침대로 내려가 이어진 바람의 심장을 받아요.',
    position: { x: 635, y: 35, z: -625 }, interactionRadius: 17, actionLabel: '풍차 심장 받기',
  },
  'search-canyon': {
    id: 'search-canyon', label: '유적 감지 · 협곡 끝의 메아리',
    description: '협곡 남동쪽 돌비석에 가까이 가 감지로 첫 메아리를 들어요.',
    position: { x: 760, y: 75, z: -350 }, interactionRadius: 24, actionLabel: '감지하기',
  },
  'search-cloud': {
    id: 'search-cloud', label: '유적 감지 · 구름 사이의 흔적',
    description: '남쪽 구름 유적의 높은 석판에서 이어지는 흔적을 찾아요.',
    position: { x: 580, y: 70, z: 0 }, interactionRadius: 24, actionLabel: '감지하기',
  },
  'search-garden': {
    id: 'search-garden', label: '유적 감지 · 숨은 정원의 문',
    description: '유적 남쪽 무너진 정원에서 감지하면 숨은 길이 드러나요.',
    position: { x: 380, y: 62, z: 300 }, interactionRadius: 24, actionLabel: '감지하기',
  },
  ruins: {
    id: 'ruins', label: '숨은 유적의 햇실 매듭 찾기',
    description: '감지로 찾은 작은 유적에 다가가 둥지를 밝힐 햇실을 가져와요.',
    position: { x: 275, y: 44, z: 365 }, interactionRadius: 15, actionLabel: '햇실 매듭 받기',
  },
  repair: {
    id: 'repair', label: '둥지의 풍차 복구하기',
    description: '둥지로 돌아와 풍차 심장과 햇실 매듭을 끼워 넣어요.',
    position: { x: -101, y: 9, z: 18 }, interactionRadius: 16, actionLabel: '풍차 복구하기',
  },
  'secret-garden': {
    id: 'secret-garden', label: '새로 열린 비밀 정원 발견하기',
    description: '풍차가 밝힌 석판길 끝에 작은 정원이 있어요. 가까이 가서 수호수와 이 장소를 기억해요.',
    position: { x: -22, y: 16, z: 70 }, interactionRadius: 10, actionLabel: '정원 기억하기',
  },
  complete: {
    id: 'complete', label: '돌아오는 바람 · 첫 챕터 완료',
    description: '둥지에 바람이 돌아왔어요. 보상을 꾸미고 새로 열린 길을 자유롭게 날아봐요.',
    position: { x: -82, y: 8, z: 30 }, interactionRadius: 16, actionLabel: '모험 완료',
  },
}

export const ADVENTURE_SEARCH_POINT_IDS = ['search-canyon', 'search-cloud', 'search-garden'] as const

export const ADVENTURE_ROUTES = {
  sheltered: {
    id: 'sheltered', label: '피난길', description: '낮고 넓게 · 네 장치로 바람 잇기',
    pointIds: ['sheltered-inlet', 'sheltered-bell', 'sheltered-sluice', 'sheltered-heart'],
  },
  ridge: {
    id: 'ridge', label: '능선길', description: '짧고 높게 · 네 장치로 바람 잇기',
    pointIds: ['ridge-vane', 'ridge-sail', 'ridge-chime', 'ridge-heart'],
  },
} as const

/** Straight segments only: this is a lower-bound travel estimate, not a first-play claim. */
export function getAdventureTravelEstimate(route: AdventureRouteId) {
  const pointIds = ['keeper', 'rescue', 'bird-return', ...ADVENTURE_ROUTES[route].pointIds,
    ...ADVENTURE_SEARCH_POINT_IDS, 'ruins', 'repair']
  let distance = 0
  let previous: Vec3Value = ADVENTURE_HOME.position
  for (const id of pointIds) {
    const position = ADVENTURE_POINTS[id].position
    distance += Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z)
    previous = position
  }
  return { distance, cruiseSeconds: distance / 18, continuousBoostSeconds: distance / 30 }
}
