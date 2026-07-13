# Milestone 4 검증 기록

> 상태: **자동 완료 검증됨 / 외부 플레이테스트 대기**
>
> 검증일: 2026-07-11

## 결과

- 키보드와 터치를 더하지 않고 마지막 활성 장치 하나만 선택하는 `InputController`를 연결했다.
- Pointer Events, pointer capture, pointer ID 소유권을 사용하는 가상 스틱과 돌풍 부스트, 일시정지 버튼을 추가했다.
- 키보드와 터치 각각 시작, 비행, 선회, 부스트, 일시정지/재개, 완주, 재시도를 실제 Chromium 입력으로 반복 검증했다.
- 터치 조작은 가로, 세로, 최소 `320x568` 화면에서 safe-area 기준 안쪽에 배치되며 모든 보이는 대상이 44 CSS px 이상이다.
- 준비 안내는 마지막 활성 장치에 맞춰 바뀌고, 일시정지/완주 패널은 이름이 있는 dialog로 노출된다.
- 일시정지 시 `계속 날기`, 완주 시 `다시 달리기`로 포커스가 이동하며 재개/재시도 후에는 포커스가 비행 캔버스로 돌아온다.
- `window.blur`와 hidden `visibilitychange`에서 입력을 비우고 레이스를 자동 일시정지한다.
- `prefers-reduced-motion`에서는 부스트 FOV가 55도로 고정되고 공기고리와 충돌 카메라 흔들림이 0이 된다.
- `@playwright/test` 1.61.1을 계획에서 승인한 유일한 새 개발 의존성으로 추가했다.

## 테스트 우선 증거

1. `InputController.test.ts`에서 마지막 활성 장치 선택과 입력/행동 비합산 계약을 먼저 실패시킨 뒤 구현했다.
2. `touchJoystick.test.ts`에서 방향 부호, 단위 원 clamp, dead zone, 비정상 반경, pointer 소유권과 cancel을 먼저 고정했다.
3. `TouchInput.test.ts`에서 held/quick-tap 부스트, 시작/일시정지 one-shot, clear/cancel을 먼저 고정했다.
4. `KeyboardInput.test.ts`에서 처리된 키만 장치 활성 신호가 되는 계약을 추가했다.
5. Playwright 포커스 시나리오는 dialog와 포커스 이동이 없어서 실패하는 것을 확인한 뒤 HUD 역할, 레이블, 포커스 복귀를 구현했다.

최종 단위 결과는 19개 테스트 파일, 147개 테스트 통과다.

## 입력과 접근성 계약

- 키보드와 터치 상태는 동시에 존재할 수 있지만 렌더러는 `InputController`가 선택한 한 장치만 소비한다.
- 가상 스틱은 활성 pointer 하나만 소유하고 `pointerup`, `pointercancel`, `lostpointercapture`에서 중립으로 돌아온다.
- 빠른 돌풍 탭은 pointer 해제 뒤에도 한 프레임의 동작으로 보존된다.
- 준비/카운트다운/레이싱에만 비행 컨트롤을 보이고 paused/finished에서는 숨긴다.
- 조이스틱은 `비행 방향 조이스틱`, 버튼은 `돌풍 부스트`와 `일시정지`라는 접근 가능한 이름을 갖는다.
- 버튼 tooltip, 3px `:focus-visible`, 최소 48px 패널 행동 버튼, 포커스 진입/복귀를 Playwright로 확인했다.
- 터치 준비 화면은 `스틱을 움직이거나 돌풍을 눌러 출발`, 키보드는 `WASD 또는 방향키를 눌러 출발 준비`를 표시한다.

## 실제 브라우저 시나리오

Playwright Chromium을 소프트웨어 WebGL로 실행했다. 이 머신에서 WebGL 컨텍스트 10개를 동시에 실행하면 고정 3초 카운트다운이 벽시계 4초를 넘는 자원 경합이 재현되어, 제품의 4초 기준은 유지하고 테스트 worker만 2개로 제한했다.

- 키보드 full flow: `1440x900`, `1280x720` 통과
- 터치 full flow: `844x390`, `390x844`, `320x568` 통과
- 마지막 활성 장치 중재: keyboard → touch → keyboard 전환과 비합산 통과
- lifecycle: 다섯 프로젝트 모두 blur/hidden pause와 입력/진행 동결 통과
- 접근성: dialog 이름, tooltip, accessible name, 포커스 이동/복귀 통과
- 감소 모션: FOV 55, boost rings false, collision shake 0 통과
- console error와 page error: 다섯 smoke 프로젝트 모두 0개

전체 `npm run test:e2e` 결과는 80개 수집, 54개 통과, 장치에 맞지 않는 시나리오 26개 의도적 스킵이다.

## 뷰포트와 픽셀

| 뷰포트 | 입력 | 오버플로/잘림 | 터치 대상 | 타이머 너비 |
| --- | --- | --- | --- | --- |
| `1440x900` | keyboard | 통과 | 해당 없음 | 변화 <= 1px |
| `1280x720` | keyboard | 통과 | 해당 없음 | 변화 <= 1px |
| `844x390` | touch | 통과 | >= 44px, viewport 안 | 변화 <= 1px |
| `390x844` | touch | 통과 | >= 44px, viewport 안 | 변화 <= 1px |
| `320x568` | touch | 통과 | >= 44px, viewport 안 | 변화 <= 1px |

WebGL 프레임버퍼를 직접 읽어 화면 캡처만으로 판정하지 않았다.

- 데스크톱: `1440x900`, 51,840개 픽셀 표본, 휘도 `0~218`, 500ms 간격 hash `1675848483 -> 3150868095`
- 최소 터치: `320x568`, 60,587개 픽셀 표본, 휘도 `0~221`, 500ms 간격 hash `3930836052 -> 942539417`

두 화면 모두 휘도 범위가 40을 넘고 시간 간격 hash가 달라 nonblank/시간 변화 검사를 통과했다. 준비, 일시정지, 완주, 최소 뷰포트 스크린샷은 `artifacts/browser-qa/m4/`에 생성되며 커밋 대상에서 제외된다. 최신 visual-verdict는 최소 뷰포트 `91/100`, `pass`다.

## 품질 명령

```text
npm test                         # 19 files, 147 tests passed
npm run test:e2e                # 54 passed, 26 skipped
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
```

프로덕션 빌드는 CSS 9.90KB와 JavaScript 649.35KB를 만들었다. Three.js 단일 청크에 대한 Vite 500KB 경고는 오류가 아니며 M6 전송량/성능 측정에서 다시 기록한다.

## 변경 파일

- 실행 기반: `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`
- 입력: `src/game/input/InputController.ts`, `KeyboardInput.ts`, `TouchInput.ts`, `touchJoystick.ts`와 각 테스트
- UI/통합: `src/game/ui/TouchControls.ts`, `RaceHud.ts`, `src/game/createRenderer.ts`, `src/main.ts`, `src/vite-env.d.ts`, `src/styles.css`
- 브라우저 검증: `tests/e2e/accessibility.spec.ts`, `canvas-pixels.spec.ts`, `keyboard-flow.spec.ts`, `lifecycle.spec.ts`, `reduced-motion.spec.ts`, `responsive.spec.ts`, `smoke.spec.ts`, `touch-controls.spec.ts`, `touch-flow.spec.ts`
- 증거: `.omx/state/m4/ralph-progress.json`, 이 보고서

## 단순화와 남은 위험

- 키보드/터치를 하나의 거대한 입력 클래스로 합치지 않고, 작은 장치 구현과 한 개의 선택 경계만 추가했다.
- 조이스틱 계산과 pointer 수명은 DOM 밖의 순수 함수/상태로 분리해 브라우저 없이 경계값을 검증한다.
- 터치 UI는 기존 레이스 상태를 복제하지 않고 `RacePhase`에 따라 가시성만 결정한다.
- 접근성 검증은 새 axe 의존성 없이 브라우저 native role/name/focus assertion으로 수행했다.
- 자동 검증은 Chromium 소프트웨어 WebGL과 에뮬레이션 터치 기준이다. 실제 iOS Safari/Android Chrome의 notch safe-area, 지연, 손가락 피로는 사람/실기기 플레이테스트가 남아 있다.
- 처음 보는 플레이어가 30초 안에 조작을 발견하는 인간 증거는 작성하지 않았다. 최종 상태는 RC1 자동 검증 뒤에도 `플레이테스트 대기`로 유지한다.

M4 자동 게이트는 닫혔으며 다음 순서는 Milestone 5의 버전된 설정 저장, 품질 tier, WebAudio, 복구 흐름이다.
