# 하늘매듭배 24시간 골모드 PRD — M4~M6 RC1

> 계획일: 2026-07-11
>
> 기준 상태: Milestone 3 완료, 16개 테스트 파일 / 126개 테스트 통과
>
> 실행 방식: 단일 골모드, 테스트 우선, 마일스톤 순차 게이트

## 1. 목표

하늘매듭배를 현재 M3 상태에서 다음 수준의 **RC1(Release Candidate 1)** 로 끌어올린다.

1. M4: 키보드와 터치 각각으로 시작, 비행, 부스트, 일시정지, 완주, 재시도가 가능하다.
2. M4: 접근성, safe-area, 감소 모션, lifecycle pause를 Playwright로 반복 검증한다.
3. M5: 자동/수동 품질 정책, 설정 저장, 자체 생성 WebAudio, WebGL/리소스 복구 흐름을 완료한다.
4. M6 자동 범위: 다섯 뷰포트, 픽셀 변화, 콘솔/네트워크, 30초 성능, 프로덕션 출력 검증을 통과한다.
5. 외부 플레이테스트를 위한 실행 절차와 기록 양식을 준비한다.

### 골모드 시작용 목표문

```text
하늘매듭배를 M3 완료 상태에서 RC1으로 만든다. M4의 통합 키보드/터치 입력, 가상 스틱·돌풍·일시정지 UI, 접근성·safe-area·lifecycle pause와 Playwright 반복 시나리오를 완료한다. 이어 M5의 품질 정책·설정 저장·자체 생성 WebAudio·WebGL 및 리소스 복구를 완료하고, M6의 자동화 가능한 다섯 뷰포트·픽셀 변화·콘솔/네트워크·프로덕션·30초 성능 검증과 튜닝까지 수행한다. 테스트 우선과 실제 브라우저 증거를 지키며, 외부 플레이테스터 증거 없이는 최종 출시 완료로 보고하지 않는다.
```

`create_goal`에는 시간 제한 필드가 없으므로 토큰 예산 없이 위 목표문으로 시작한다. 24시간은 종료 조건이 아니라 최대 실행 시간표다. 목표가 먼저 달성되면 즉시 완료하고, 시간이 끝나도 조건이 미달이면 완료로 표시하지 않는다.

## 2. 24시간 종료 상태

### 완료로 인정하는 상태

- `docs/MILESTONE_4_REPORT.md`와 `docs/MILESTONE_5_REPORT.md`가 최신 증거로 작성돼 있다.
- M4와 M5의 모든 자동 완료 조건이 통과한다.
- M6 자동 QA 보고서가 작성돼 있다.
- `test`, `test:e2e`, `typecheck`, `lint`, `build`, `audit`가 통과한다.
- 프로덕션 빌드에 개발 QA 훅이 남지 않는다.
- 알려진 콘솔 오류와 처리되지 않은 Promise rejection이 0개다.
- 외부 플레이테스트만 남았다면 `docs/PLAYTEST_HANDOFF.md`에 정확히 기록돼 있다.

### 완료로 인정하지 않는 상태

- 터치 완주 흐름을 QA 버튼으로만 통과하고 실제 조이스틱/버튼 입력 검증이 없다.
- 모바일 뷰포트 중 하나라도 잘림, 스크롤, 확대, 44px 미만 대상이 있다.
- 품질 변경이 레이스 진행을 초기화하거나 관문 가독성을 훼손한다.
- 오디오 권한/실패가 레이스를 막는다.
- 컨텍스트 손실이나 모델 로드 실패가 검은 화면으로 남는다.
- 24시간이 지났다는 이유만으로 실패 테스트나 미검증 기능을 완료 처리한다.

## 3. 범위

### 계획 시점 도구 확인

- 로컬 Node.js: `v22.20.0`
- 로컬 npm: `10.9.3`
- npm registry의 `@playwright/test`: `1.61.1`, 요구 Node.js `>=18`
- 실제 설치 직전 공식 배포 상태를 다시 확인하고 `package-lock.json`으로 고정한다.

### 포함

- 마지막 활성 입력 장치 우선의 통합 입력 경계
- Pointer Events + pointer capture 가상 스틱
- 돌풍 버튼, 터치 일시정지 버튼, 터치 시작
- 포커스, 이름, 툴팁, safe-area, 44x44 CSS px
- Playwright 데스크톱/모바일/감소 모션/lifecycle 시나리오
- 품질 자동 선택, 수동 low/high, DPR/구름/효과 예산
- best time + mute + quality의 버전된 설정 저장
- WebAudio로 생성하는 관문/부스트/완주 효과와 음소거
- WebGL 컨텍스트 손실과 필수/대체 리소스 실패 복구
- 다섯 뷰포트 시각 QA, 캔버스 픽셀 검사, 성능 측정
- M4/M5/M6 자동 QA 보고서와 플레이테스트 인계서

### 제외

- 멀티플레이, 계정, 서버 순위표, 백엔드
- 새 드래곤/코스, 전투, 퀘스트, 커스터마이징
- 외부 오디오 파일, 새 UI 프레임워크, 물리 엔진
- 드래곤 고해상도 리모델링
- 에이전트가 사람 플레이테스트 결과를 추정하거나 생성하는 행위
- 사용자 요청 없는 commit/push/배포

## 4. 아키텍처 결정

1. `InputController`가 키보드와 터치를 합산하지 않고 마지막 활성 장치의 스냅샷만 제공한다.
2. 터치 조이스틱의 축 계산과 pointer lifecycle은 순수 상태로 먼저 테스트한다.
3. 터치 DOM은 `RaceHud`와 분리된 작은 컨트롤 surface로 두고 렌더러는 입력 인터페이스만 본다.
4. 설정은 기존 best-time 전용 저장을 버전 2 설정 문서로 확장하되 v1 기록을 마이그레이션한다.
5. 품질 정책은 순수 함수로 결정하고 Three.js 객체에는 결과만 적용한다.
6. 오디오는 레이스 이벤트를 구독하는 선택적 서비스로 두며 초기화/재생 실패를 삼킨다.
7. 복구 UI는 `main.ts`의 기존 오류 경계를 확장하고 게임 규칙과 분리한다.
8. Playwright는 제품 테스트 훅보다 실제 Pointer/Keyboard/Focus 입력을 우선한다. 관문 완주 가속 훅은 레이스 규칙이 별도 단위 테스트로 잠긴 경우에만 사용한다.
9. 시각 변경마다 `visual-verdict`를 실행하고 `.omx/state/m4`, `m5`, `m6`에 판정을 저장한다.

## 5. 의존성 그래프

```text
Playwright 기반 ─────────────┬───────────────┐
                            │               │
입력 장치 중재 -> 터치 상태 -> 터치 DOM -> M4 E2E
                            │               │
HUD 접근성/lifecycle -------┘               │
                                            v
설정 저장 -> 품질 정책 -> 렌더 적용 ------> M5 E2E
         └-> 오디오/mute -----------------> M5 E2E
리소스 상태 -> 복구 UI -------------------> M5 E2E
                                            │
                                            v
                         다섯 뷰포트 + 30초 성능 + RC1 보고서
```

M4 게이트가 닫히기 전 M5를 시작하지 않는다. M5 게이트가 닫히기 전 최종 M6 튜닝을 시작하지 않는다.

## 6. 24시간 실행 시간표

| 시간 | 단계 | 산출물/게이트 |
| --- | --- | --- |
| `00:00~00:45` | 기준선 재검증, 상태 파일 시작 | 126 tests, build, 브라우저 기준 캡처 |
| `00:45~02:00` | Playwright 기반 | config, webServer, desktop/mobile fixture, `test:e2e` |
| `02:00~04:00` | 입력 장치 중재 | 순수 테스트, keyboard/touch last-active 계약 |
| `04:00~06:00` | 가상 스틱/부스트 입력 | pointer capture, cancel/clear, 터치 축 테스트 |
| `06:00~08:00` | 터치 HUD/일시정지/접근성 | 44px, safe-area, aria-label, focus-visible |
| `08:00~10:15` | M4 E2E/반응형/lifecycle | keyboard/touch flow, blur/hidden, reduced motion |
| `10:15~10:45` | M4 전체 게이트 | M4 보고서, 전체 품질 명령 |
| `10:45~12:15` | 설정 저장/마이그레이션 | best/mute/quality v2와 손상값 테스트 |
| `12:15~13:45` | 품질 정책/렌더 예산 | auto/low/high, DPR, 구름/효과 축소 |
| `13:45~15:15` | WebAudio | 관문/부스트/완주, mute, 실패 격리 |
| `15:15~16:45` | 복구 흐름 | context loss, GLB 실패, 대체/재시도 UI |
| `16:45~17:15` | M5 전체 게이트 | M5 보고서, 프로덕션 훅 제거 확인 |
| `17:15~19:15` | M6 30초 성능 | desktop/high, mobile/low, DPR/메모리/전송량 |
| `19:15~21:00` | 다섯 뷰포트/픽셀/네트워크 | 스크린샷, nonblank, time-change, 오류 0 |
| `21:00~22:30` | 병목/조작/가독성 수정 | 측정 근거가 있는 최소 튜닝 |
| `22:30~23:15` | 전체 회귀/프로덕션 | unit/e2e/type/lint/build/audit/preview |
| `23:15~24:00` | 문서/인계/완충 | 자동 QA 보고서, 플레이테스트 인계, 남은 위험 |

한 단계가 빨리 끝나면 다음 단계로 이동한다. 2시간 이상 지연되면 저위험 시각 polish를 먼저 제거하고 M4/M5 기능 및 자동 검증을 보존한다.

## 7. 작업 목록

### Task 1 — Playwright 실행 기반

**설명:** 계획에 승인된 유일한 새 개발 의존성 `@playwright/test`를 공식 안정 버전으로 고정하고 재사용 가능한 로컬 서버/프로젝트 구성을 만든다.

**완료 조건**
- `npm run test:e2e`가 Chromium에서 최소 smoke test를 통과한다.
- 실패 시 trace/screenshot을 남기고 성공 시 임시 산출물을 커밋 대상에서 제외한다.
- 데스크톱과 모바일 에뮬레이션 프로젝트를 구분한다.

**예상 파일:** `package.json`, `package-lock.json`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `.gitignore`

**검증:** `npm run test:e2e -- --project=desktop`

**의존성:** 없음

### Task 2 — 마지막 활성 장치 입력 중재

**설명:** 키보드/터치 입력을 더하지 않고 마지막으로 활성화된 장치 하나만 선택하는 순수 경계를 만든다.

**완료 조건**
- 동일 프레임에 두 장치 값이 있어도 하나만 출력한다.
- pause, blur, hidden, pointer cancel에서 모든 held state가 지워진다.
- 기존 키보드 동작과 60Hz 결정성이 유지된다.

**예상 파일:** `src/game/input/InputController.ts`, `InputController.test.ts`, `KeyboardInput.ts`, `KeyboardInput.test.ts`

**검증:** 입력 단위 테스트 + 기존 비행 테스트

**의존성:** Task 1과 독립

### Task 3 — 터치 조이스틱 순수 상태

**설명:** 중심/반경/포인터 좌표를 `[-1, 1]` pitch/yaw로 정규화하고 dead zone과 pointer lifecycle을 테스트한다.

**완료 조건**
- 원 밖 입력은 단위 원으로 clamp된다.
- pointerup/cancel/lost capture에서 중립으로 돌아온다.
- pitch 방향이 키보드 계약과 일치한다.

**예상 파일:** `src/game/input/touchJoystick.ts`, `touchJoystick.test.ts`

**검증:** Vitest 경계값 테스트

**의존성:** Task 2

### Task 4 — 터치 컨트롤 surface

**설명:** 가상 스틱, 돌풍 버튼, 일시정지 버튼을 Pointer Events와 pointer capture로 구현한다.

**완료 조건**
- 모든 요소에 `data-touch-control`, 접근 가능한 이름, 44x44px 이상이 있다.
- joystick 영역만 pan/zoom을 막고 문서 자체는 스크롤되지 않는다.
- 세로/가로 safe-area 안에 배치된다.

**예상 파일:** `src/game/ui/TouchControls.ts`, `src/game/input/TouchInput.ts`, `src/styles.css`, `src/vite-env.d.ts`

**검증:** Playwright pointer/cancel/bounds 검사

**의존성:** Task 3

### Task 5 — 렌더러 입력 통합

**설명:** `createRenderer`가 통합 입력만 소비하도록 연결하고 터치 시작/부스트/일시정지를 레이스 전이에 연결한다.

**완료 조건**
- 유효 터치 후 100ms 안에 countdown, 4초 안에 racing이 된다.
- keyboard/touch 전환 시 stuck input이 없다.
- pause/respawn/retry가 기존 레이스 진행 보존 계약을 지킨다.

**예상 파일:** `src/game/createRenderer.ts`, `src/game/input/InputController.ts`, `src/game/ui/TouchControls.ts`, 관련 테스트

**검증:** unit + Playwright 양 장치 흐름

**의존성:** Tasks 2, 4

### Task 6 — HUD 접근성/포커스/감소 모션

**설명:** 준비 안내를 활성 장치에 맞추고 아이콘 버튼, 툴팁, 포커스 이동, 감소 모션 신호를 완성한다.

**완료 조건**
- 모든 아이콘 버튼에 non-empty accessible name과 tooltip이 있다.
- ready/paused/finished 전환 시 포커스가 예측 가능한 주요 동작으로 이동한다.
- 감소 모션에서 흔들림/FOV/공기고리가 자동 비활성화된다.

**예상 파일:** `src/game/ui/RaceHud.ts`, `src/styles.css`, `src/game/world/createFlightSandbox.ts`, 관련 테스트

**검증:** axe가 아닌 Playwright native role/name/focus assertions

**의존성:** Task 5

### Task 7 — M4 Playwright 전체 흐름

**설명:** 키보드와 터치의 시작~재시도, lifecycle pause, 반응형, 접근성 시나리오를 고정한다.

**완료 조건**
- keyboard/touch 각각 start, steer, boost, pause/resume, finish, retry를 거친다.
- blur/hidden 동안 위치·타이머·부스트·관문이 동결된다.
- 다섯 뷰포트에서 scroll 0, 잘림 0, touch target 통과다.

**예상 파일:** `tests/e2e/input-flow.spec.ts`, `lifecycle.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts`, test fixture

**검증:** 전체 `test:e2e`

**의존성:** Tasks 1, 5, 6

### Checkpoint M4

- 전체 unit/type/lint/build/e2e 통과
- 실제 브라우저 keyboard/touch 캡처와 픽셀 변화 통과
- `docs/MILESTONE_4_REPORT.md` 작성
- 실패가 남으면 M5 진입 금지

### Task 8 — 버전 2 설정 저장

**설명:** best time, mute, quality를 한 설정 문서로 안전하게 읽고 기존 v1 best-time을 마이그레이션한다.

**완료 조건**
- 손상값/예외/부분 누락이 게임을 막지 않는다.
- v1 best time이 보존된다.
- restart/retry에서 설정은 유지된다.

**예상 파일:** `src/game/persistence/records.ts`, `records.test.ts`, `src/game/race/raceState.ts`, 관련 테스트

**검증:** Vitest 저장/마이그레이션 표

**의존성:** Checkpoint M4

### Task 9 — 품질 정책과 런타임 적용

**설명:** 장치/DPR/측정 신호로 초기 품질을 정하고 수동 low/high를 적용한다.

**완료 조건**
- low는 DPR 1.25 이하, 구름/효과/그림자 예산을 줄인다.
- high/low 모두 다음 관문과 바람실 가독성이 유지된다.
- 품질 변경이 레이스 상태나 타이머를 초기화하지 않는다.

**예상 파일:** `src/game/quality/qualityPolicy.ts`, 테스트, `createRenderer.ts`, `createWorld.ts`, `createFlightSandbox.ts`

**검증:** 순수 정책 테스트 + 브라우저 draw-call/DPR 비교

**의존성:** Task 8

### Task 10 — 자체 생성 WebAudio

**설명:** 파일 다운로드 없이 oscillator/gain으로 관문, 부스트, 완주 효과를 만들고 mute를 연결한다.

**완료 조건**
- 첫 사용자 gesture 전 AudioContext를 강제 시작하지 않는다.
- mute 상태가 저장되고 모든 cue를 즉시 막는다.
- AudioContext 생성/재생 실패가 게임을 막지 않는다.

**예상 파일:** `src/game/audio/GameAudio.ts`, 테스트, `createRenderer.ts`, `RaceHud.ts`

**검증:** mock AudioContext unit + 브라우저 gesture/mute

**의존성:** Task 8

### Task 11 — WebGL/리소스 복구

**설명:** 기존 컨텍스트 손실 UI를 진행 상태 보존 가능한 재초기화 경로로 확장하고 GLB 실패를 명시적 degraded 상태로 처리한다.

**완료 조건**
- context loss에서 한국어 안내와 포커스된 재시도 동작이 있다.
- 재시도 후 캔버스/입력/오디오 listener가 중복되지 않는다.
- GLB 실패 시 fallback 드래곤과 비차단 안내로 레이스가 가능하다.

**예상 파일:** `src/main.ts`, `createRenderer.ts`, `createDragon.ts`, `RaceHud.ts`, e2e recovery spec

**검증:** force failure/context loss/resource failure Playwright

**의존성:** Tasks 9, 10

### Checkpoint M5

- 설정/품질/오디오/복구 unit 및 e2e 통과
- 프로덕션 빌드에서 모든 force/QA 훅 제거 확인
- `docs/MILESTONE_5_REPORT.md` 작성
- 실패가 남으면 M6 최종 튜닝 금지

### Task 12 — 성능 측정기와 30초 표본

**설명:** host frame, fixed step, draw call, triangle, DPR, 메모리, 전송량을 기록하고 desktop/high와 mobile/low를 30초 측정한다.

**완료 조건**
- desktop 중앙값 55fps 이상, 하한 50fps 이상이다.
- mobile low 중앙값 30fps 이상이다.
- 초기 압축 전송량이 10MB 미만이다.

**예상 파일:** `tests/e2e/performance.spec.ts`, `src/game/createRenderer.ts`, `scripts/report-performance.mjs`, QA artifact

**검증:** 30초 표본 JSON + 요약 보고서

**의존성:** Checkpoint M5

### Task 13 — 다섯 뷰포트 최종 QA

**설명:** keyboard/touch, 시각, 픽셀, 포커스, 네트워크를 프로덕션 미리보기에서 반복 검증한다.

**완료 조건**
- 다섯 뷰포트에서 겹침/잘림/스크롤/확대가 없다.
- nonblank canvas와 1초 간격 픽셀 변화가 있다.
- console error, unhandled rejection, 실패 네트워크 요청이 0개다.

**예상 파일:** `tests/e2e/visual.spec.ts`, `network.spec.ts`, `scripts` QA helper, `.omx/state/m6/*`

**검증:** Playwright + 인앱 브라우저 교차 확인

**의존성:** Task 12

### Task 14 — 측정 기반 튜닝

**설명:** 실패한 예산/가독성/조작만 한 번에 한 원인씩 최소 수정한다.

**완료 조건**
- 변경 전후 측정값이 기록된다.
- 한 반복에서 최대 5개 파일만 수정한다.
- 수정마다 관련 테스트와 visual-verdict를 다시 통과한다.

**예상 파일:** 측정 결과에서 실패한 한 subsystem의 기존 파일 최대 5개

**검증:** 전후 성능/시각 지표 + 관련 unit/e2e

**의존성:** Task 13

### Task 15 — RC1 증거와 플레이테스트 인계

**설명:** 전체 자동 회귀를 닫고 자동 QA 결과와 사람이 수행할 플레이테스트를 분리해 기록한다.

**완료 조건**
- 모든 자동 품질 명령과 프로덕션 preview smoke가 통과한다.
- 자동 완료/미완료 인간 증거/남은 위험이 구분된다.
- 최종 상태가 `RC1 / 자동 검증 완료 / 플레이테스트 대기`로 기록된다.

**예상 파일:** `docs/MILESTONE_6_AUTOMATED_QA_REPORT.md`, `docs/PLAYTEST_HANDOFF.md`, `.omx/state/m6/*`

**검증:** 보고서의 각 수치와 실제 artifact/명령 결과 교차 확인

**의존성:** Task 14

### Checkpoint RC1

- unit/e2e/typecheck/lint/build/audit 통과
- 개발/프로덕션 console error와 unhandled rejection 0
- 다섯 뷰포트와 30초 성능 증거 존재
- 프로덕션 QA 훅 0
- 외부 플레이테스트가 미완료라면 최종 출시가 아닌 RC1로 보고

## 8. 진행/복구 규칙

- 매 Task 종료 시 관련 테스트를 실행하고, 2~3 Task마다 전체 품질 명령을 실행한다.
- 시각 실패는 다음 수정 전에 `visual-verdict` JSON을 기록한다.
- 같은 실패 원인이 세 번 반복되면 원인/시도/최소 재현을 기록하고 다른 안전 경로를 시도한다.
- 장시간 명령은 60초 이내로 상태를 갱신하고 백그라운드 또는 짧은 wait로 추적한다.
- 새 의존성은 계획에 승인된 `@playwright/test` 하나만 허용한다.
- 기존 사용자 변경을 덮어쓰지 않으며 commit/push는 하지 않는다.
- 문서와 실제 코드가 어긋나면 제품 범위를 넓히지 않는 선에서 문서를 먼저 고친다.
- 시간이 부족하면 순서대로 제거한다: 추가 polish -> 오디오 음색 변형 -> 자동 품질 고급 휴리스틱. 터치 완주, 접근성, 복구, 테스트, 성능 증거는 제거하지 않는다.

## 9. 인간 게이트

자동 골모드가 준비할 것:

- 처음 보는 플레이어용 30초 조작 관찰표
- 1회 레이스 완주 관찰표
- 장치/브라우저/화면 방향 기록칸
- 상승/하강, 선회, 부스트 발견 시간
- 도움 없이 완주 여부와 막힌 관문

사람이 제공해야 할 것:

- M4 최소 1명, M6 총 3명의 실제 플레이 기록
- 3명 모두 30초 안에 기본 조작 수행
- 2명 이상 도움 없이 첫 레이스 완주

이 증거가 없으면 상태는 `RC1 / 자동 검증 완료 / 플레이테스트 대기`이며 `최종 출시 완료`가 아니다.
