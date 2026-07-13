# RC4 소형 오픈월드 PRD

## Objective

기존 하늘매듭배 레이스와 6개 미션을 보존하면서 Dragon v3로 세 개의 군도를 자유롭게 탐험하고, 축제 중심섬의 도전 비콘에서 레이스를 시작할 수 있는 브라우저 오픈월드 프로토타입을 만든다.

## Player flow

1. 준비 화면에서 `하늘 탐험`을 선택한다.
2. 축제 중심섬 상공에서 자유 비행을 시작한다.
3. 지도에서 바람 협곡 또는 구름 유적지를 목적지로 선택한다.
4. 감속해 호버하고 지역 착륙 지점에 착륙·재이륙한다.
5. 지역을 발견하면 로컬 진행에 저장된다.
6. 축제 중심섬 비콘에서 현재 선택 미션으로 기존 레이스를 시작한다.

## Exploration controls

- pitch/yaw: 기존 W/S/A/D, 방향키, 터치 조이스틱
- boost: Shift/Space, 터치 돌풍
- brake/hover: C/Ctrl 유지, 터치 감속 유지
- land/takeoff: E 또는 상황 동작 버튼
- challenge: Enter 또는 상황 동작 버튼
- map: M 또는 지도 버튼
- pause: Esc 또는 기존 일시정지 버튼

## Regions

| id | 이름 | 중심 | 정체성 |
| --- | --- | --- | --- |
| festival-hub | 축제 중심섬 | `(0, 8, -40)` | 금빛 깃발, 레이스 비콘, 넓은 착륙장 |
| wind-canyon | 바람 협곡 | `(500, 24, -680)` | 좁은 암봉, 청록 바람 아치, 수직 비행선 |
| cloud-ruins | 구름 유적지 | `(430, 28, 190)` | 밝은 석조 유적, 부유 룬, 낮은 구름층 |

## Flight contract

- 탐험 순항 18 units/s, 돌풍 30 units/s, 감속률 24 units/s²
- 감속 유지 시 0.1 이하를 0으로 고정하며 후진하지 않는다.
- 착륙은 pad 반경 18, pad 상공 8 units 이하에서만 요청 가능하다.
- landing은 0.9초 동안 pad 상공 1.2 units로 보간하고 landed에서 이동을 멈춘다.
- 재이륙은 pad 상공 10 units, 속도 8로 전환한 뒤 순항을 회복한다.

## Streaming and discovery

- 중심 거리 420 이하 지역을 로드한다.
- 로드된 지역은 500을 초과할 때 언로드한다.
- region 중심 140 이내 진입 시 발견한다.
- 지역 visual은 필요할 때 생성하고 언로드 시 geometry/material을 dispose한다.

## Persistence v4

- 기존 best time, mute, quality, mission grades 보존
- exploration position/heading/movement state 저장
- discovered region ids와 destination id 저장
- 비정상 수치, 범위 밖 위치, 알 수 없는 id는 기본값으로 복구

## UI

- full-bleed 3D 유지
- 현재 지역 이름은 짧은 상단 라벨
- 지도는 3개 지역과 플레이어/목적지만 표현하는 작은 오버레이
- 목적지 방향은 화면 가장자리 화살표와 거리로 표현
- 착륙/재이륙/도전은 하나의 상황별 동작 버튼으로 제공

## Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run test:performance`
- `npm run test:production`
- `npm audit --audit-level=high`

## Boundaries

- Always: 레이스/미션/Dragon v3/복구/접근성 보존, 테스트 우선, 실브라우저 캡처
- Ask first: 유료/외부 에셋, 새 의존성, 네트워크 서비스
- Never: 전투, NPC 대화, 멀티플레이, 백엔드, 새 드래곤/코스, 커밋/push/deploy

## Success criteria

- 세 지역 탐험, 호버, 착륙, 재이륙, 발견/저장, 목적지 선택, 비콘 레이스 시작이 키보드와 터치에서 동작한다.
- 현재 로드 지역이 거리/히스테리시스 계약과 일치한다.
- 5뷰포트와 전체 자동 품질 게이트가 통과한다.

## Open questions

없음. 사용자가 48시간 자율 골모드로 위 범위를 승인했다.
