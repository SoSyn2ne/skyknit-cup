# Milestone 33 Sky League 보고서

> 상태: **전체 자동 검증 완료 / 실기기·사람 플레이테스트 대기 / 출시 완료 아님**
>
> 기준일: 2026-07-14
>
> 브랜치: `codex/m33-sky-league`

## 결론

Milestone 32의 Three.js 오픈월드, 한 코스, 여섯 미션, 세 지역 하늘동전과 `Sovereign of the Sunrise Skies`를 유지하면서 오프라인 기록 경쟁인 Sky League를 추가했다. 레이스, 지역별 동전, 미션별 기록을 로컬 Top 10으로 남기고, 완주 직후 순위와 금·은·동 메달을 보여 준다. 다음 시도에서는 해당 기록판 1위의 반투명 드래곤과 같은 진행 지점 기준의 실시간 차이를 확인할 수 있다.

저장은 기존 `skyknit-cup:settings` 키를 유지한 v8로 확장했다. v7의 레이스·동전 최고 기록, 미션 등급, 탐험 위치와 발견, 오디오와 품질 설정은 보존한다. v7에 없던 미션 완주 시간은 만들지 않는다. 백엔드, 계정, 서버 순위표, Unity와 새 런타임 의존성은 추가하지 않았다.

413개 단위 테스트, 타입 검사, 린트, 빌드, 집중 Sky League E2E, 95점 시각 판정, 고스트 활성 30초 성능과 프로덕션 검증을 통과했다. 전체 E2E 최종 재실행도 300개 중 146개 통과, 프로젝트별 비대상 154개 skip, 실패 0개로 닫혔다. full-duration soak는 실제 측정 603.688초 동안 69개 측정 루프를 완료했고 기록판 상한, 1위 고스트와 WebGL 자원 안정성을 유지했다. 자동 검증은 완료했지만 실제 Android·iPhone, 사람의 경쟁 감각과 BGM 배포 권리는 별도 출시 조건으로 남는다.

## 플레이어 결과

| 종목 | 기록판 | 정렬 | 재도전 기준 고스트 |
| --- | --- | --- | --- |
| 전체 레이스 | 현재 단일 코스 Top 10 | 빠른 시간 우선 | 전체 레이스 1위 |
| 하늘동전 | 세 지역 각각 Top 10 | 빠른 시간 우선 | 현재 지역 1위 |
| 선택 미션 | 여섯 미션 각각 Top 10 | `gold > silver > bronze`, 같은 등급은 빠른 시간 우선 | 선택 미션 1위, 없으면 전체 레이스 1위 |

정확한 동률에서는 기존 기록이 먼저 남고 새 기록은 그 다음 실제 순위를 받는다. 모든 목록은 10개로 제한한다. 1~3위는 각각 금·은·동이며 4~10위는 숫자 순위만 표시한다. 순위와 메달은 저장하지 않고 정렬된 기록에서 파생한다.

결과 화면은 최종 시간, 이전 최고 대비, 전체 레이스 순위, 선택 미션 순위와 메달을 먼저 보여 준다. Top 10은 별도 펼침 영역에 두어 짧은 가로 화면과 320x568에서도 재시도 동작이 기록판 스크롤 아래로 밀리지 않게 했다. 동전 결과는 탐험 HUD에서 지역 순위와 메달을 알리고, 현재 지역 기록판은 시도 전·완료 뒤·지도 안에서도 확인할 수 있다.

## 고스트 캡처와 경쟁 규칙

- 고스트는 60Hz 고정 시뮬레이션의 실제 비행 상태를 100ms 간격으로 양자화한다.
- 샘플은 시간, 위치, heading, pitch, bank, boost와 관문·동전 진행 인덱스를 가진다.
- 시작과 완료 샘플을 포함하며 최대 10분, 6,001개로 제한한다.
- 레이스·미션·지역 동전 기록판마다 1위 고스트 하나만 저장한다.
- 새 1위만 해당 고스트를 교체한다. 2~10위, 실패와 손상 캡처는 기존 1위 고스트를 바꾸지 않는다.
- 비교할 고스트는 시도 시작 시 고정한다. 시도 중 기록판이 바뀌어도 비교 대상이 갑자기 교체되지 않는다.
- pause, 숨김 탭, 탐험 지도, 착륙과 완료 상태에서는 캡처·재생 시간을 진행시키지 않는다.
- WebGL context recovery는 진행 중 recorder와 고정된 비교 기록을 복구한다.

실시간 차이는 단순히 같은 재생 시각끼리 비교하지 않는다. 그 방식은 현재 시간에서 같은 시간을 빼므로 항상 0에 가까워진다. 현재와 같은 관문·동전 진행 구간에서 고스트가 그 위치에 도달한 기준 시각을 찾고 `현재 elapsed - 기준 elapsed`를 계산한다. 따라서 음수는 1위보다 빠름, 양수는 느림을 뜻한다. 유효 거리 안에서 같은 진행 구간을 찾지 못하면 `기준 없음`으로 표시한다.

## 고스트 시각 결정

영구 고스트를 저폴리 fallback 드래곤으로 두는 방안은 거절했다. 실시간 시각 판정에서 fallback은 추상적인 실루엣과 블렌딩 아티팩트가 두드러졌고, 플레이어가 추격하는 대상의 캐릭터성이 약했다. 반면 기존 상세 GLB의 18개 렌더 메시를 그대로 사용한 고스트는 성능 예산 안에서 머리, 날개와 꼬리를 읽을 수 있었다.

최종 고스트는 상세 드래곤을 청록·금색 반투명 normal blending으로 렌더한다. 그림자, 충돌, 관문·동전 판정, 오디오와 카메라 목표에는 참여하지 않는다. additive blending은 밝은 하늘에서 청록·금색 형태를 씻어내므로 사용하지 않았다. 동시에 보이는 고스트는 하나뿐이다.

## 저장 v8과 마이그레이션

v8은 기존 호환 요약을 유지하면서 다음 두 영역을 추가한다.

- `skyLeague`: 전체 레이스, 지역별 동전, 미션별 Top 10
- `ghosts`: 전체 레이스, 지역별 동전, 미션별 1위 고스트

v7 `bestTimeMs`는 전체 레이스 첫 기록으로, 각 `coinBestTimesMs`는 해당 지역 첫 기록으로 승계한다. 기존 `missionGrades`는 유지하지만 v7에는 완주 시간이 없으므로 미션 Top 10은 비워 둔다. 탐험 위치·방향·착륙, 발견 지역·랜드마크·상승기류, 목적지, mute, BGM 볼륨과 품질도 그대로 보존한다.

v1~v6은 기존 단계별 마이그레이션 뒤 v8 기본 league/ghost 상태를 받는다. v8의 잘못된 순서, 10개 초과 기록, 음수·비유한 시간, 알 수 없는 지역·미션과 손상 고스트는 유효한 부분만 정규화한다. v9 이상과 읽기·쓰기 예외는 플레이를 막지 않고 안전한 기본 상태로 복구한다.

## 모듈 경계와 단순화

- `src/game/competition/skyLeagueRecords.ts`: 정렬, 안정 삽입, Top 10 상한, 순위와 메달의 순수 규칙
- `src/game/competition/ghostRun.ts`: 결정적 캡처, 양자화, 검증, 보간, 진행 매칭과 차이 포맷
- `src/game/persistence/records.ts`: v8 파싱, 마이그레이션, 정규화와 동전 기록의 원자적 저장
- `src/game/race/raceState.ts`: 레이스·미션 완주의 단일 삽입과 결과 placement
- `src/game/createRenderer.ts`: recorder, 비교 고스트, 재생, 동전 통합, recovery와 HUD 어댑터
- `src/game/world/createDragon.ts`, `createFlightSandbox.ts`: 상세 반투명 고스트 한 개와 자원 수명주기
- `src/game/ui/RaceHud.ts`, `ExplorationHud.ts`: 고정 폭 delta, 캐시된 결과, 기록판과 모바일 레이아웃

Top 10과 고스트 규칙은 Three.js 객체가 없는 순수 모듈로 분리했다. 기존 scalar 최고 기록을 버리지 않고 호환 요약으로 유지해 M32 소비자를 깨지 않았다. 결과와 기록판 DOM은 매 프레임 재생성하지 않고 기록 서명이 바뀔 때만 갱신한다.

## 시각 검증

독립 `visual-verdict` 최종 점수는 **95/100, pass**다. 임계값 90을 통과했으며 다섯 결과 뷰포트에서 M32의 정보 계층을 유지하면서 순위, 메달, Top 10과 보이는 재시도 동작을 추가했다. 320x568 탐험 화면에서도 완료 동전 카드, 펼친 기록판, 여정, 상황 동작과 44px 터치 조작이 viewport 안에 남는다.

대표 증거는 다음 경로에 있다.

- `artifacts/browser-qa/m33/desktop-ghost-replay.png`
- `artifacts/browser-qa/m33/touch-minimum-coin-top10.png`
- `artifacts/browser-qa/m33-visual-4/`
- `.omx/state/m33/ralph-progress.json`

## 현재 자동 게이트

| 게이트 | 상태 |
| --- | --- |
| 단위 테스트 | 413 tests passed |
| 타입 검사 | `npm run typecheck` passed |
| 린트 | `npm run lint` passed |
| 빌드 | passed; JS 749.39kB raw / 197.39kB Vite gzip, CSS 28.12kB raw / 5.01kB Vite gzip |
| 집중 Sky League E2E | passed; v8 저장, 레이스·미션·동전, 고스트 재시도, context recovery, v7 migration 확인 |
| 독립 시각 판정 | 95/100 pass |
| 고스트 활성 30초 성능 | 4프로필 예산 통과; 모든 프로필에서 100ms canonical ghost와 `ghostVisible: true` 확인 |
| 프로덕션·보안·전송량 | 5/5 viewports; audit 0; QA hooks 0; 14 files, raw 12,009,756 bytes, gzip-9 6,209,651 bytes |
| 전체 E2E 재실행 | 300 total; 146 passed, 154 project-specific skipped, 0 failed; 10.5분 |
| full-duration 10분 Sky League soak | passed; 603.688초 측정, 69 measured cycles, 오류 0 |

최종 `dist` gzip-9은 약 5.92MiB로 10MiB 예산 안이다. soak 종료 시 race, 축제 중심섬 coin과 `first-skyknot` mission 기록판은 각각 정확히 10개였다. loaded geometry/texture는 `73/3 → 73/3`, ready geometry/texture는 `62/3 → 62/3`으로 증가하지 않았고 콘솔·페이지·요청 오류는 모두 0개였다. 증거는 `artifacts/browser-qa/m33-final/m33-soak-10m.json`에 남겼다.

### 고스트 활성 30초 성능

| 장면 | median/minimum FPS | draw calls | triangles | geometries |
| --- | ---: | ---: | ---: | ---: |
| desktop race high | 60/56 | 62 | 68,640 | 72 |
| mobile race low | 60/60 | 37 | 36,956 | 67 |
| desktop explore high | 60/59 | 68 | 92,844 | 76 |
| mobile explore low | 60/60 | 32 | 37,780 | 75 |

성능 fixture는 성긴 임의 keyframe이 아니라 실제 저장 계약과 같은 100ms canonical ghost를 주입하고, 비교 기록과 고스트 렌더링이 활성화된 steady-state 구간을 30초 측정한다. 초기 실패 측정은 Sky League 비용이 아니라 인접 지역 LOD가 겹치는 전환 구간을 표본으로 잡은 결과였다. 임계값을 낮추지 않고 측정 위치를 현재 동전 코스의 안정 상태로 고정해 기능 자체 비용을 재현 가능하게 비교했다.

이 선택은 지역 전환 비용이 없다는 뜻이 아니다. 지역 경계에서 급선회하면 스트리밍 히스테리시스 동안 인접 지역 메시가 잠시 함께 보이거나 로드될 수 있다. 반복 선회에서 순간 draw call·triangle 증가, stutter, 고스트 가독성과 자원 회수가 문제 없는지는 full-duration soak와 실제 기기 플레이에서 별도로 확인해야 한다.

## 남은 출시 위험과 사람 판정 조건

- 실제 지역 경계 급선회에서 일시적인 LOD 겹침, stutter와 고스트 가림을 판단해야 한다.
- 실제 Android·iPhone에서 짧은 가로·최소 세로 UI, safe area, 발열과 터치 피로를 확인해야 한다.
- 헤드폰·기기 스피커에서 BGM, 날갯짓, 돌풍과 고스트 추격 중 정보음 균형을 들어야 한다.
- 사용자 제공 BGM의 게임·저장소 배포 권리를 확인해야 한다.

전체 자동 게이트는 실제 결과로 닫혔다. 상태는 **자동 검증 완료 / 실기기·사람 플레이테스트 대기 / 출시 완료 아님**이며, 사람 판정과 BGM 권리 확인 없이 출시 완료로 바꾸지 않는다.
