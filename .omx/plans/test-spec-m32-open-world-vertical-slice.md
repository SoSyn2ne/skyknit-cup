# Milestone 32 오픈월드 수직 슬라이스 테스트 명세

## 데이터와 GLB 계약

- 축제 중심섬은 정확히 다섯 개의 고유 랜드마크 ID, 세 개의 상승기류 ID와 세 개의 착륙장 ID를 가진다.
- 모든 위치·반경·바람 벡터는 유한하며 랜드마크, 비콘, 동전과 착륙장의 필수 여유 거리를 지킨다.
- high/low GLB 모두 기존 필수 노드와 `WindLoom`, `SecretGrotto`, `TowerLandingPad`, `GrottoLandingPad`를 가진다.
- high/low는 12 primitives, 8 materials 이하이고 low triangles/bytes가 high보다 작다.
- world inspector 결과는 `DRAGON_QA_SCOPE=m32` 전용 경로에 6개 GLB를 모두 기록한다.

## 순수 탐험 규칙

- 이전/현재 위치 선분이 발견 반경을 고속 통과해도 랜드마크와 상승기류를 놓치지 않는다.
- 이미 발견한 ID는 중복되지 않고 손상·알 수 없는 ID는 저장에서 제거된다.
- 세 상승기류는 중심에서 가장 강하며 경계 밖에서는 0이고, 합성 벡터는 정의된 상한을 넘지 않는다.
- 바람은 airborne에서만 위치에 영향을 주고 landing/landed/taking-off에서는 기존 경로를 바꾸지 않는다.
- 구조물 충돌은 선분 기반으로 고속 관통을 막고 속도를 감쇠하며 cooldown 중 중복 처리하지 않는다.
- 충돌 프록시는 동전 수집 반경과 세 착륙장 접근 반경을 침범하지 않는다.

## 저장 v7

- v6 문서는 BGM, 음소거, 품질, 레이스 기록, 미션 등급, 동전 기록, 지역 위치/발견/목적지를 그대로 유지하며 빈 랜드마크/상승기류 기록으로 v7이 된다.
- v1~v5와 손상 문서도 기존 마이그레이션 결과를 잃지 않는다.
- 유효한 랜드마크/상승기류 ID만 round-trip하고 중복·알 수 없는 값을 제거한다.
- context recovery가 진행 중 동전 상태, 탐험 위치와 새 발견 기록을 보존한다.

## 오디오

- 사용자 동작 전에는 BGM과 환경음 AudioContext를 시작하지 않는다.
- 탐험 진입 후 낮은 바람 환경음이 시작되고 레이스 전환에서 환경음만 fade out하며 BGM은 계속된다.
- 랜드마크 발견과 상승기류 첫 진입은 mute가 아닐 때 한 번씩 큐를 낸다.
- mute, 0% master state, hidden, recovery와 dispose에서 활성 소스를 안전하게 중단·복구한다.
- 오디오 실패는 게임과 저장 진행을 막지 않는다.

## UI와 E2E

- 지도는 랜드마크 발견 수, 상승기류 수, 비밀 장소, 축제 동전 최고 기록과 선택 레이스 미션 안내를 표시한다.
- 비행 HUD는 현재 한 가지 다음 목표만 보여 주고 동전 HUD·목적지·터치 조작과 겹치지 않는다.
- 키보드와 touch-minimum에서 탐험 진입 → 랜드마크/상승기류/비밀 발견 → 동전 10개 → 착륙/재이륙 → 비콘 레이스 진입을 수행한다.
- reload와 WebGL context recovery 뒤 발견·기록·BGM 상태가 유지된다.
- 5개 뷰포트에서 scroll/overflow/44px/safe-area 계약을 지킨다.

## 시각·성능·프로덕션

- 5개 뷰포트의 축제 중심섬 canvas는 휘도차가 40보다 크고 500ms 전후 픽셀 해시가 다르다.
- RC7 기준선보다 다섯 랜드마크의 실루엣과 깊이 계층이 분명하며 `visual-verdict >= 90`이다.
- console warning/error, pageerror, unhandled rejection과 필수 network failure는 0이다.
- desktop race/explore median 55fps·minimum 50fps, mobile race/explore median/minimum 30fps를 만족한다.
- 모든 프로필 draw calls <=120, gzip-9 합계 <10MiB, production QA 훅 0건이다.
- 10분 탐험 soak 뒤 renderer geometry/texture 수가 기준보다 증가하지 않고 BGM/환경음 play failure가 0이다.

## Final evidence

- `artifacts/browser-qa/m32/`
- `artifacts/world-m32/world-glb-report.json`
- `.omx/state/m32/ralph-progress.json`
- `docs/MILESTONE_32_OPEN_WORLD_VERTICAL_SLICE_REPORT.md`
- `docs/M32_OPEN_WORLD_PLAYTEST_HANDOFF.md`
