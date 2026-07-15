# M39 테스트 명세 — 태양의 심장 · 용암 군도

## 1. 테스트 원칙

- 행동 변경 전 실패하는 회귀/계약 테스트를 먼저 작성한다.
- 시간·위험·비행·수집·미션 판정은 DOM/Three.js와 분리한 순수 60Hz 테스트로 고정한다.
- 기존 여섯 미션, 세 지역, 첫 하늘매듭 기록의 의미를 바꾸지 않는다.
- 실제 브라우저 검증은 화면 픽셀, UI, 콘솔, 네트워크, 성능과 자원 수명을 함께 확인한다.

## 2. 단위 계약

### U1 지역 카탈로그와 스트리밍

- 네 ID와 네 theme가 정확히 한 번씩 존재한다.
- `volcanic-archipelago` 중심·착륙장·표시명이 유효하다.
- 420 안에서 로드, 500 밖에서 언로드, 경계 사이에서 이전 상태 유지.
- high 220 진입 / 260 이탈, low 품질 high 미사용.
- 늦은 high/low load가 unload 뒤 scene에 붙지 않고 자원을 해제한다.

### U2 냉각 수정

- 네 지역 모두 정확히 10개 좌표를 가진다. 전체 40개다.
- 용암 지역 visual kind는 `cooling-crystal`, 기존 세 지역은 `sun-thread`다.
- 현재 순서만 수집하고 고속 선분 교차를 놓치지 않는다.
- 첫 수정 전 elapsed=0, 10번째에서 시간이 고정된다.
- pause/map/landed는 진행 정지, region unload는 기록 손상 없이 attempt만 취소한다.
- crystal mesh와 gold mesh 중 활성 kind 하나만 보이고 draw-call 계약을 유지한다.

### U3 코스 카탈로그

- `skyknot` 기존 12 checkpoint 좌표·순서·spawn을 의미상 그대로 보존한다.
- `volcanic-archipelago`는 정확히 4 checkpoint이며 kind가 seal, seal, seal, escape다.
- `getCourseSegment`와 `getRespawnAnchor`가 전달받은 코스만 사용한다.
- 코스 전환 후 stale gate, wind thread와 collider가 남지 않는다.

### U4 미션 진행과 등급

- 기존 여섯 ID·순서·threshold가 유지되고 `heart-of-sun`이 마지막이다.
- 빈 저장은 첫 미션만 열리고 `golden-knot` Bronze 전에는 용암 미션이 잠긴다.
- `golden-knot` Bronze 이상이면 용암 미션이 영구 해금된다.
- 봉인 1→2→3→escape 전에는 finish가 발생하지 않는다.
- 75,000ms 경계는 Bronze, 75,001ms는 실패다.
- 60,000ms/충돌2/리스폰1은 Silver, 각 조건 +1은 Bronze 이하로 강등된다.
- 45,000ms/충돌0/리스폰0/boost2는 Gold, boost1 또는 45,001ms는 Silver 이하로 강등된다.
- 세 loadout에 같은 입력/event를 주면 FlightState와 grade가 정확히 같다.

### U5 기록 소유권

- `skyknot` 성공은 legacy best, race Top 10, mission board를 기존대로 갱신한다.
- 용암 성공은 legacy best/race Top 10/race ghost를 변경하지 않는다.
- 용암 성공은 `missionTop10.heart-of-sun`과 해당 mission ghost만 갱신한다.
- 미션 실패는 mission board·grade·ghost를 갱신하지 않는다.
- 용암 ghost 선택은 mission ghost가 없으면 null이며 global race ghost로 fallback하지 않는다.
- mission Top 10은 Gold→Silver→Bronze, 동급은 빠른 시간순, 최대 10개다.
- 축제 여정의 race completion은 용암 기록으로 충족되지 않는다.

### U6 결정적 위험

- 같은 seed·tick에서 낙석/용암 파도/재/열기류 snapshot이 동일하다.
- 낙석은 telegraph 1.5초 전 collision inactive, 이후 active다.
- 용암 파도는 telegraph 2초 전 collision inactive, 이후 active다.
- pause tick에는 phase와 elapsed가 변하지 않는다.
- swept collision이 빠른 이동 중 active hazard를 놓치지 않는다.
- 한 위험이 한 active window에서 충돌 통계를 중복 올리지 않는다.
- low/reduced-motion은 시각 수량만 낮추고 hazard timing/radius를 바꾸지 않는다.

### U7 저장 v11

- 완전한 v10 fixture가 v11로 읽힌 뒤 모든 기존 값을 동일하게 보존한다.
- v10 legacy species alias 이전 결과도 보존한다.
- 새 지역/미션 키가 정상 round-trip한다.
- 마이그레이션이 용암 grade/record/ghost/discovery를 합성하지 않는다.
- 알 수 없는 region/mission/course ID, NaN/Infinity/범위 밖 좌표와 손상 ghost는 안전하게 제거/기본화된다.
- future version과 localStorage read/write failure가 부팅을 막지 않는다.

### U8 오디오·수호수 반응

- volcanic intensity 0..1 clamp, mute/hidden/disposed에서 새 source를 만들지 않는다.
- 위험 경고는 같은 hazard phase에서 한 번, seal cue는 새 seal마다 한 번 재생된다.
- BGM은 지역 전환에 끊기지 않고 volume 설정을 유지한다.
- 환경 반응 API가 flight tuning, collision radius와 mission threshold에 접근하지 않는다.

## 3. 자산 검사

- high/low 두 GLB가 존재하고 parse된다.
- 공통 필수 의미 노드와 로컬 원점/앵커가 일치한다.
- high 30k~40k 목표 및 <=60k, low 8k~12k 목표 및 <=25k, low < high.
- 각각 <=12 primitives, <=8 materials, PBR/vertex color, 외부 texture 0.
- `LavaSurface`, `CoolingSeal_1..3`, `EscapeGate`가 inspector에서 확인된다.
- 같은 source를 두 번 export한 GLB의 검사 snapshot/hash가 결정적이다.

## 4. 통합·브라우저 시나리오

### B1 탐험

- 새 저장으로 탐험 진입, 지도에서 네 지역과 용암 목적지를 선택한다.
- QA 이동으로 접근 시 low→high가 로드되고 canvas가 nonblank이며 픽셀이 시간에 따라 변한다.
- 착륙/재이륙, 열기류, 구조물 충돌, 지역 발견, reload 후 위치/목적지가 정상이다.
- 10개 냉각 수정 완주 후 기록·Top 10·ghost가 reload에서 유지된다.

### B2 미션 선택과 플레이

- ready와 Esc 선택기에 7개 미션이 같은 순서/잠금 상태로 보인다.
- 잠긴 용암 미션은 선택되지 않고 요구 문구를 읽을 수 있다.
- 해금 fixture에서 미션을 시작하면 용암 spawn과 4단계 HUD가 나타난다.
- checkpoint 강제 통과/실제 비행으로 seal copy가 1/3→2/3→3/3→escape로 바뀐다.
- 완주 결과는 mission best/grade/rank를 보여 주고 retry/mission change/workshop이 작동한다.

### B3 pause·recovery·오류

- 레이스 중 Esc에서 타이머·위험·lava time이 멈추고 미션 변경과 작업실이 가능하다.
- context loss/restore 후 같은 mission/course/checkpoint/attempt stats와 correct ghost source로 복구한다.
- 지역 GLB/BGM decode 실패는 fallback/무음으로 계속 플레이되고 처리되지 않은 오류가 없다.

### B4 반응형·접근성

- 다섯 필수 viewport에서 HUD, pause, mission selector, workshop, map, touch controls가 겹치지 않는다.
- 모든 조작은 44x44 이상, dialog 이름·label·focus containment·Esc 복귀가 유효하다.
- 위험은 색 외 형태/텍스트/음향 신호를 갖고 reduced motion에서도 telegraph가 읽힌다.

## 5. 성능·안정성

- desktop/high 화산 탐험과 미션 각 30초 median >=55fps, minimum >=50fps.
- mobile/low 화산 탐험과 미션 각 30초 median >=30fps.
- high draw calls <=120, 용암 환경 추가 draw calls <=6.
- 전체 gzip <10MiB.
- 10분 soak: 지역 왕복 10회, LOD 전환, 미션 재시도, pause/resume, guardian swap 후 scene object/resource/listener가 기준 허용폭 밖으로 증가하지 않는다.
- console error, page error, unhandled rejection, failed required network request는 0이다.

## 6. 회귀 게이트

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- 전체 Playwright E2E
- production 검사
- asset inspector와 결정적 export
- 화산 탐험/미션 performance profile
- 다섯 viewport screenshot + canvas pixel probe + `visual-verdict >= 90`

실패하는 게이트가 하나라도 있으면 Milestone 39를 완료로 표시하지 않는다.
