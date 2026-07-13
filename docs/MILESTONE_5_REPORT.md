# Milestone 5 검증 기록

> 상태: **자동 완료 검증됨 / 외부 플레이테스트 대기**
>
> 검증일: 2026-07-11

## 결과

- 최고 기록, 음소거, 품질 선호를 `skyknit-cup:settings` 버전 2 문서 하나로 저장한다.
- 기존 `skyknit-cup:best-time` 버전 1 기록은 최고 기록을 보존한 채 v2 설정으로 best-effort 마이그레이션한다.
- 손상 JSON, 잘못된 버전/숫자/boolean/enum, 읽기·쓰기 예외는 안전 기본값으로 격리한다.
- 품질 선호는 `auto`, `low`, `high`이며 자동 정책은 coarse pointer, 화면 폭, device memory, hardware concurrency 신호로 실제 low/high tier를 결정한다.
- low는 DPR 1.25, 구름 24개, 부스트 링 1개이고 high는 데스크톱 DPR 1.75, 구름 48개, 부스트 링 3개다. 모바일 DPR은 high 선택에서도 1.25를 넘지 않는다.
- 설정은 ready 화면을 가리지 않고 paused/finished 패널 안에서 음소거 버튼과 native select로 변경한다.
- 품질 변경은 현재 phase, elapsed, 체크포인트, 비행 진행을 초기화하지 않고 렌더 예산만 즉시 갱신한다.
- 외부 오디오 파일 없이 WebAudio oscillator/gain으로 관문, 부스트, 완주 큐를 생성한다.
- WebGL 컨텍스트 손실은 레이스를 paused snapshot으로 전환한 뒤 렌더러를 재생성하고, GLB 실패는 기본 드래곤과 비차단 상태 안내로 계속 플레이한다.

## 테스트 우선 증거

1. `records.test.ts`에서 v2 round-trip, v1 마이그레이션, 부분/손상값, 저장 예외를 먼저 실패시킨 뒤 설정 저장소를 교체했다.
2. `qualityPolicy.test.ts`에서 auto/low/high, 데스크톱/모바일 DPR, 구름/효과 예산을 먼저 고정했다.
3. `raceState.test.ts`에서 mute/quality 변경이 모든 phase의 run과 final time을 보존해야 한다는 계약을 먼저 실패시켰다.
4. `GameAudio.test.ts`에서 제스처 전 context 미생성, 부스트 상승 에지, mute, factory/resume/create/start 실패, dispose를 먼저 고정했다.
5. `recoveryState.test.ts`에서 countdown/racing을 paused snapshot으로 만들고 중첩 값을 분리하는 계약을 먼저 실패시켰다.
6. Playwright 품질·오디오·복구 시나리오는 UI, debug audio, 복구 snapshot, fallback 안내가 없는 상태에서 각각 RED를 확인했다.

최종 단위 결과는 22개 테스트 파일, 185개 테스트 통과다.

## 버전 2 설정과 품질 정책

저장 문서는 다음 형태다.

```json
{
  "version": 2,
  "bestTimeMs": 51234,
  "muted": false,
  "quality": "auto"
}
```

- v2가 있으면 legacy보다 우선한다.
- v2 필드가 빠지거나 잘못되면 필드별로 `null`, `false`, `auto`를 사용한다.
- v2가 없고 유효한 v1 최고 기록이 있으면 다른 필드는 기본값으로 채워 v2에 저장한다.
- 마이그레이션 쓰기가 실패해도 읽은 최고 기록은 현재 세션에서 보존한다.
- 품질과 음소거 변경 직후 v2 전체 문서를 다시 저장해 서로의 값을 지우지 않는다.
- 새로고침 뒤 low/muted가 복원되고, 음소거 상태에서도 AudioContext는 사용자 제스처 전 생성되지 않는 것을 확인했다.

| tier | DPR cap | 구름 | 부스트 링 | 핵심 신호 |
| --- | --- | --- | --- | --- |
| low | `1.25` | 24 | 1 | 드래곤, 다음 관문, 바람실 유지 |
| high | desktop `1.75`, mobile `1.25` | 48 | 3 | 드래곤, 다음 관문, 바람실 유지 |

Playwright 다섯 프로젝트에서 auto 결과를 확인했다. 데스크톱 두 뷰포트는 high, 터치 세 뷰포트는 low이며 설정 변경 전후 체크포인트와 타이머가 동일하다.

## WebAudio

- `createGameAudio()`는 생성만으로 AudioContext를 만들지 않는다.
- 첫 keyboard/touch interaction이 `unlock()`을 호출하고 suspended context를 resume한다.
- 관문 통과마다 triangle cue 1회, 부스트 false→true 에지마다 sawtooth cue 1회, 완주 시 3음 triangle cue 1회를 만든다.
- held 부스트는 반복 큐를 만들지 않는다.
- mute는 활성 oscillator를 중지하고 이후 노드 생성을 막는다.
- context factory, resume, oscillator/gain 생성, start, close 실패는 모두 레이스 바깥에서 흡수한다.
- 실제 Chromium 시나리오에서 첫 입력 전 context 0, 부스트 에지 2회, 관문 12회, 완주 1회, mute 뒤 추가 부스트 0회를 확인했다.

## 복구

### WebGL 컨텍스트 손실

- 손실 직전 racing/countdown은 paused로 변환하고 `pausedFrom`, elapsed, checkpoint, best/mute/quality, flight state를 snapshot으로 보존한다.
- 오류 안내는 `role=alert`, 이름이 있는 제목, 자동 포커스된 `다시 시도`를 제공한다.
- 재시도는 새 renderer/canvas/listener를 한 세트만 만들고 paused 화면으로 복귀한다.
- Playwright에서 checkpoint 2와 elapsed를 보존했고, 손실 이벤트까지의 최대 100ms 허용 범위 안에서만 시간이 증가한 뒤 paused 상태에서 완전히 동결됐다.

### GLB 리소스 실패

- 기본 주홍 몸체와 금색 날개 fallback은 GLB 요청 전부터 준비돼 있다.
- 로드/리그 검증 실패 시 fallback을 유지하고 `정밀 모델을 불러오지 못해 기본 드래곤으로 비행합니다.` 상태를 표시한다.
- 안내는 modal이 아니며 키보드 시작과 racing 진입을 막지 않는다.
- fallback에서도 다음 금빛 관문과 두 바람실이 유지된다.

## 실제 브라우저와 시각 판정

- 전체 `npm run test:e2e`: 110개 수집, 64개 통과, 프로젝트에 맞지 않는 시나리오 46개 의도적 스킵
- 정상 smoke의 console error/page error: 0개
- 품질 자동 예산: 다섯 프로젝트 통과
- 설정 변경/저장/새로고침: desktop 통과
- 최소 `320x568` paused 설정/행동 panel: viewport 안, 44px 이상, 잘림 0
- WebAudio gesture/edge/mute: desktop 통과
- context loss progress recovery: desktop 통과
- forced GLB fallback playable flow: desktop 통과
- latest visual-verdict: fallback 상태 `90/100`, `pass`

프로덕션 preview를 `http://127.0.0.1:4177`에서 인앱 브라우저로 교차 확인했다. 모든 QA/failure 쿼리를 붙여도 renderer-ready, canvas 1개, QA control 0개, `window.__DRAGON_RACE_TEST__` 없음, debug mirror 없음, fallback notice 없음, 브라우저 로그 0개였다.

## 품질 명령

```text
npm test                         # 22 files, 185 tests passed
npm run test:e2e                # 64 passed, 46 skipped
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
```

프로덕션 빌드 결과:

- HTML `0.40KB`, gzip `0.26KB`
- CSS `11.45KB`, gzip `2.63KB`
- JavaScript `655.62KB`, gzip `171.13KB`
- 금지 문자열 `qaCourse`, `qaCollision`, `qaBoost`, `qaWave`, `qaGateIndicator`, `qaReducedMotion`, `forceWebglFailure`, `forceDragonFailure`, `__DRAGON_RACE_TEST__`: 0개

Three.js 단일 청크의 Vite 500KB 경고는 유지한다. 압축 전송량과 30초 성능은 M6에서 수치화한다.

## 변경 파일

- 설정: `src/game/persistence/records.ts`, `records.test.ts`
- 품질: `src/game/quality/qualityPolicy.ts`, `qualityPolicy.test.ts`, `src/game/world/createWorld.ts`, `createFlightSandbox.ts`, `src/game/createRenderer.ts`
- 오디오: `src/game/audio/GameAudio.ts`, `GameAudio.test.ts`
- 복구: `src/game/recovery/recoveryState.ts`, `recoveryState.test.ts`, `src/main.ts`, `src/game/world/createDragon.ts`
- UI: `src/game/ui/RaceHud.ts`, `src/styles.css`, `src/game/race/raceState.ts`, `raceState.test.ts`
- 브라우저 검증: `tests/e2e/audio.spec.ts`, `quality.spec.ts`, `recovery.spec.ts`
- 증거: `.omx/state/m5/ralph-progress.json`, 이 보고서

## 단순화와 남은 위험

- 설정은 최고 기록/음소거/품질별 키를 만들지 않고 버전 문서 하나로 통합했다.
- 품질 결정은 Three.js 객체와 분리된 순수 함수이며 런타임은 예산 결과만 적용한다.
- low/high 전환은 scene 재생성 대신 기존 `InstancedMesh.count`와 고정 부스트 링 가시성만 바꾼다.
- 오디오는 파일, fetch, decode, 타이머 큐 없이 짧은 oscillator node만 생성한다.
- 복구는 손실된 WebGL context 자체를 재사용하지 않고 renderer를 한 번 깨끗하게 재생성한다.
- fallback 드래곤은 의도적으로 단순해 GLB보다 근거리 품질이 낮다. 실제 자원 실패 시 플레이 가능성과 상태 설명을 우선한다.
- WebAudio 음색/볼륨, iOS Safari unlock 동작, 실제 notch safe-area, 컨텍스트 손실 체감은 실기기 사람 플레이테스트가 남아 있다.
- 사람 플레이 결과를 작성하지 않았으며 최종 상태는 계속 `플레이테스트 대기`다.

M5 자동 게이트는 닫혔으며 다음 순서는 Milestone 6의 30초 성능, 다섯 뷰포트 최종 픽셀/오류/네트워크, 프로덕션 RC1 검증이다.
