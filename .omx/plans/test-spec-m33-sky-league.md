# Milestone 33 Sky League 테스트 명세

## Top 10 순수 규칙

- 레이스·동전은 유효한 양수 유한 시간만 받아 오름차순으로 정렬한다.
- 미션은 성공한 `bronze|silver|gold`만 받아 등급 내림차순, 시간 오름차순으로 안정 정렬한다.
- 정확한 동률에서는 기존 항목이 먼저이고 새 항목의 실제 1-based 위치를 반환한다.
- 각 기록판은 10개를 넘지 않으며 11위 이하 추가는 기존 참조를 유지하는 no-op이다.
- 1/2/3위는 각각 gold/silver/bronze, 나머지는 null 메달을 반환한다.
- 서로 다른 지역·미션 기록판은 한쪽 삽입으로 변하지 않는다.

## 저장 v8과 마이그레이션

- 완전한 v8 문서는 모든 Top 10, 고스트, 기존 레이스/동전 최고, 미션 등급, 탐험, 오디오와 품질을 round-trip한다.
- v7 `bestTimeMs`와 지역별 `coinBestTimesMs`는 해당 Top 10 한 항목으로 승계된다.
- v7의 미션 등급은 유지되고 미션 Top 10은 비어 있다.
- v7의 랜드마크·상승기류 발견은 v8 쓰기와 다시 읽기 뒤 유지된다. v8 파서는 축제 발견을 `version >= 7`로 취급한다.
- v1~v6 정상/손상 문서가 기존 필드를 잃지 않고 v8 기본 league/ghost 상태를 받는다.
- v8의 잘못된 순서, 11개 초과, NaN/음수/알 수 없는 ID와 손상 고스트는 유효·정규화된 부분만 남긴다.
- v9는 지원하지 않고 기본값으로 복구한다. 읽기/쓰기 예외와 용량 실패는 false/default로 비차단 처리한다.
- `bestTimeMs`, `coinBestTimesMs`, `missionGrades` 호환 요약은 각 canonical 기록판/등급과 일치한다.

## 레이스·미션 통합

- 마지막 관문 유효 완주 한 번이 전체 레이스 Top 10에 정확히 한 번 들어간다.
- 성공한 선택 미션은 같은 완주의 시간·등급을 해당 미션 Top 10에 한 번 넣고 기존 최고 등급을 보존/승격한다.
- 실패 미션은 미션 Top 10에 들어가지 않지만 전체 레이스 Top 10에는 들어간다.
- 2~10위도 persistent 참조를 바꾸고 저장되며 11위는 목록을 바꾸지 않는다.
- retry/restart/pause/respawn/context recovery가 완료 기록을 중복 삽입하지 않는다.

## 동전 통합

- 지역 완주는 해당 지역 Top 10과 호환 최고 기록을 함께 갱신한다.
- 최고가 아닌 2~10위도 저장되고 11위는 제거된다.
- 지역 이탈, 잘못된 순서, pause/map/landing과 미완료 시도는 기록을 만들지 않는다.
- 세 지역 기록은 독립적이며 reload/recovery 뒤 정렬과 상한을 유지한다.

## 고스트 캡처와 재생

- 30/60/120fps와 지터 host cadence가 같은 60Hz 시뮬레이션 스텝을 소비하면 동일한 100ms 양자화 샘플을 만든다.
- 시작 샘플, 마지막 완료 샘플, progress index, position/heading/pitch/bank/boost가 유효 범위로 저장된다.
- pause/hidden/map/landing/finished에서는 샘플과 재생 시간이 늘지 않는다.
- 최대 10분/6,001샘플에서 캡처가 닫히며 더 긴 입력이 배열을 늘리지 않는다.
- 보간은 위치와 각도를 연속적으로 계산하고 ±π 경계에서 최단 회전한다.
- 진행 매칭은 같은 checkpoint/coin progress, 단조 증가 힌트와 거리 상한을 지킨다. 매칭 불가 시 delta는 null이다.
- 현재 elapsed에서 기준 도달 elapsed를 빼 signed delta를 만들고 포맷이 고정 폭 `±m:ss.mmm`다.
- 새 1위만 해당 보드 고스트를 교체하고 2~10위, 실패와 손상 캡처는 기존 고스트를 보존한다.

## 렌더링과 수명주기

- 고스트는 한 번에 하나만 보이고 반투명·무그림자·비충돌이며 카메라와 진행 규칙을 바꾸지 않는다.
- 선택 미션 고스트가 있으면 우선하고 없으면 전체 레이스 1위 고스트를 사용한다.
- 동전 시도 중에는 현재 지역 고스트만 사용하고 시도 밖/완료 뒤에는 숨긴다.
- retry는 고스트 재생/매칭을 0으로 재설정하고 mode switch/dispose는 숨김·자원 해제를 수행한다.
- WebGL context recovery는 저장 고스트와 진행 중 캡처를 복구하거나 안전하게 새 캡처로 재시작하며 기존 최고 고스트를 잃지 않는다.

## UI와 접근성

- 레이스 HUD는 타이머 안의 `data-race-delta`에서 signed delta를 표시하고 고스트가 없거나 매칭 불가면 `기준 없음`을 표시한다.
- 결과 요약은 최종 시간, 이전 최고 대비, 현재 순위, 텍스트 메달과 미션 결과를 보여 준다.
- 전체 레이스/선택 미션 기록판 버튼은 keyboard/touch로 전환되고 현재 선택을 접근성 상태로 노출한다.
- 기록판은 최대 10개 순위행을 올바른 순서로 렌더하고 기록 서명이 바뀔 때만 DOM을 갱신한다.
- 동전 완료 HUD와 지도는 현재 지역 순위·메달·Top 10과 재도전 가능 상태를 표시한다.
- 실시간 delta는 `aria-live`가 아니며 완료 결과만 polite/status로 한 번 안내한다.
- 결과 dialog, 기록판 스크롤, 고정 action 영역의 focus order가 논리적이고 retry focus가 실제 viewport 안에 있다.
- 모든 버튼은 accessible name, 44x44 CSS px, safe-area와 `:focus-visible`을 지킨다.

## E2E와 시각

- 빈 기록판, 1개, 10개, 11번째 trim과 race/coin/mission reload를 실제 브라우저에서 확인한다.
- 키보드와 touch-minimum이 완주 → 순위/메달 → 기록판 → 같은 종목 재시도를 수행한다.
- 고스트 재생 위치와 delta가 진행하고 pause/blur에서 고정되며 retry에서 초기화된다.
- 다섯 뷰포트에서 document overflow 0, 결과 요약·retry in viewport, 내부 기록판만 스크롤, 터치 대상 44px를 확인한다.
- 캔버스는 nonblank/time-changing이고 고스트와 플레이어 드래곤이 시각적으로 구분되며 다음 관문/동전을 가리지 않는다.
- M32 final race/result 스크린샷을 기준선으로 매 시각 반복 `visual-verdict`를 수행하고 `.omx/state/m33/ralph-progress.json`에 저장해 90 이상을 만든다.
- console warning/error, pageerror, unhandled rejection과 필수 network failure는 0이다.

## 성능·프로덕션·soak

- 저장된 유효 고스트를 주입하고 실제 재생 활성 상태에서 race/explore × desktop/mobile 30초 성능을 측정한다.
- desktop median 55fps/minimum 50fps, mobile median/minimum 30fps, draw calls 120 이하를 유지한다.
- gzip-9 합계 10MiB 미만, audit high 0, production QA 훅/디버그 문자열 0을 유지한다.
- 10분 soak는 10개 초과 삽입, 새 1위/비1위 고스트, race/mission/coin 전환과 retry를 반복한다.
- soak 종료 후 모든 목록은 정렬된 10개 이하, 고스트는 6,001샘플 이하이고 geometry/texture 증가와 console/page/request 오류가 0이다.

## Final evidence

- `artifacts/browser-qa/m33/`
- `artifacts/browser-qa/m33-final/`
- `.omx/state/m33/ralph-progress.json`
- `docs/MILESTONE_33_SKY_LEAGUE_REPORT.md`
- `docs/M33_SKY_LEAGUE_PLAYTEST_HANDOFF.md`
