# 하늘매듭배 24시간 골모드 테스트 명세 — M4~M6 RC1

> PRD: `.omx/plans/prd-24h-m4-m6-rc1.md`

## 1. 품질 게이트 명령

```text
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

각 마일스톤 종료와 RC1 종료 전에 모두 실행한다. `test:e2e`는 M4 Task 1에서 추가한다.

## 2. M4 단위/통합 테스트

### 입력 장치 중재

- keyboard만 활성: keyboard 값 사용
- touch만 활성: touch 값 사용
- keyboard 후 touch: touch만 사용
- touch 후 keyboard: keyboard만 사용
- 장치 전환 중 값을 합산하지 않음
- pause/blur/hidden: held input과 one-shot action 초기화
- pointercancel/lost capture: joystick과 boost 중립화

### 터치 조이스틱

- 중심점은 pitch/yaw 0
- 상/하/좌/우 끝은 계약된 부호의 1 또는 -1
- 대각선은 단위 원 안으로 clamp
- dead zone 안은 0
- pointer ID가 다른 이벤트는 무시
- dispose 뒤 listener/capture 잔존 없음

### 레이스 통합

- touch start 후 100ms 안에 countdown
- countdown 3초 보존, 4초 안에 racing
- touch pause가 pausedFrom을 보존
- touch resume/restart/respawn/retry가 기존 계약 유지
- blur/hidden 중 위치, elapsed, boost, checkpoint 변화 없음

## 3. M4 Playwright 시나리오

| 시나리오 | 입력 | 핵심 assertion |
| --- | --- | --- |
| Desktop full flow | Keyboard | start, steer, boost, pause/resume, finish, retry |
| Touch landscape | Pointer | stick 축, boost, pause, no scroll, safe-area |
| Touch portrait | Pointer | gate visibility, controls no overlap, full flow |
| Minimum viewport | Pointer | `320x568`, Korean text no clipping, targets >=44px |
| Device arbitration | Mixed | last active wins, no summed input/stuck state |
| Lifecycle blur | Keyboard/Touch | pause and complete simulation freeze |
| Lifecycle hidden | Keyboard/Touch | pause and complete simulation freeze |
| Reduced motion | Keyboard/Touch | FOV 55, rings hidden, shake 0, coral posture remains |
| Focus | Keyboard | icon names, tab order, visible focus, modal focus restore |

### 공통 DOM assertion

- `document.scrollingElement.scrollTop === 0`
- `scrollWidth === clientWidth`, `scrollHeight === clientHeight`
- 모든 `[data-touch-control]` width/height >= 44
- 모든 touch control bounding box가 viewport/safe-area 안
- 아이콘 버튼 accessible name이 빈 문자열이 아님
- timer width가 0초/99초에서 변하지 않음

## 4. M5 단위/통합 테스트

### 설정 저장

- v2 round-trip: bestTime, muted, quality
- v1 best-time 마이그레이션
- invalid JSON, version, number, enum은 안전 기본값
- getItem/setItem throw를 무시
- restart/retry에서 설정 보존

### 품질 정책

- coarse pointer/small viewport/낮은 성능 신호 -> low
- 명시적 사용자 high/low가 auto보다 우선
- desktop DPR <=1.75, mobile DPR <=1.25
- low에서 구름/효과/그림자 예산 감소
- active gate, wind threads, HUD는 두 tier 동일

### WebAudio

- user gesture 전 context 생성/재개 없음
- gate pass 1회당 cue 1회
- boost 시작 edge에서만 cue, held 상태 반복 없음
- finish cue 1회
- muted에서 node 생성/재생 없음
- context create/resume/start throw가 게임 흐름에 영향 없음
- dispose에서 timer/node/context 정리

### 복구

- forced renderer failure -> alert + focused retry
- context loss -> animation stop + 안내
- retry -> canvas 1개, listener 1세트, 정상 입력
- GLB failure -> fallback dragon + degraded notice + racing 가능
- 재시도 후 best/settings 보존

## 5. M6 브라우저 행렬

| 뷰포트 | 장치 | 품질 | 최소 확인 |
| --- | --- | --- | --- |
| `1440x900` | keyboard | high | full flow, 30초 desktop 성능 |
| `1280x720` | keyboard | high | HUD density, timer width |
| `844x390` | touch | low | landscape safe-area, 30fps |
| `390x844` | touch | low | portrait gate/dragon/controls |
| `320x568` | touch | low | long Korean text, 44px targets |

각 뷰포트에서:

- canvas CSS/bitmap size와 DPR cap 기록
- nonblank pixel 범위 확인
- 1초 이상 간격 두 프레임의 변경 픽셀 확인
- 주홍 드래곤 + 두 바람실 + 금빛 관문 동시 노출
- console error 0
- unhandled rejection 0
- 실패 네트워크 요청 0
- page scroll/zoom 0
- HUD/controls clipping 0

## 6. 30초 성능 명세

### 기록 값

- frame timestamp 배열과 1초 bucket
- median/mean/min fps
- fixed-step count와 max steps/frame
- draw calls, triangles, geometries, textures
- DPR, canvas bitmap size
- JS heap가 가능하면 시작/종료 값
- 초기 네트워크 전송량과 gzip 파일 크기

### 통과 기준

- desktop/high median >=55fps
- desktop/high 1초 bucket min >=50fps
- mobile/low median >=30fps
- fixed-step 누락/폭주 없음
- 압축 전송량 <10MB
- 30초 동안 console/unhandled error 0

브라우저 자동화 자체가 frame pacing을 방해하면 측정 간 DOM polling을 최소화하고 시작/종료 스냅샷과 페이지 내부 timestamp buffer를 사용한다. 환경 제약은 보고서에 기록하되 실패 값을 숨기지 않는다.

## 7. 시각 판정 명세

시각 변경마다 다음을 저장한다.

```json
{
  "iteration": 1,
  "generated_screenshot": "artifacts/browser-qa/m4/example.png",
  "score": 0,
  "threshold": 90,
  "threshold_passed": false,
  "verdict": "revise",
  "differences": [],
  "suggestions": [],
  "reasoning": "",
  "next_actions": []
}
```

- M4: 터치 조작 가독성, safe-area, HUD 겹침
- M5: 품질 tier 가독성, mute/quality UI, 복구 상태
- M6: 최종 다섯 뷰포트와 프로덕션 화면
- 통과 임계값: 90/100

## 8. 프로덕션 제거 검사

`dist`에서 다음 문자열이 없어야 한다.

```text
qaCourse
qaCollision
qaBoost
qaWave
qaGateIndicator
qaReducedMotion
forceWebglFailure
__DRAGON_RACE_TEST__
```

Playwright/QA 전용 훅이 추가되면 이 목록에 포함한다. 프로덕션 preview에 QA query를 전달해도 컨트롤/디버그 미러가 없어야 한다.

## 9. 인간 플레이테스트 인계

자동화는 다음 파일까지만 준비한다.

- `docs/PLAYTEST_HANDOFF.md`
- 플레이어 A/B/C 장치와 브라우저
- 30초 안 기본 조작 발견 여부/시간
- 첫 레이스 완주 여부/시간
- 도움 요청 지점
- 방향을 잃은 관문
- 터치 피로/오입력
- 멀미 또는 감소 모션 필요 여부

자동화는 이 칸을 임의로 채우지 않는다. 실제 증거 전 M6 최종 완료를 선언하지 않는다.

## 10. RC1 증거 목록

- M4/M5 보고서
- M6 자동 QA 보고서
- 전체 품질 명령 로그 요약
- 다섯 뷰포트 최종 스크린샷
- 캔버스 픽셀 변화 수치
- 30초 성능 JSON
- 프로덕션 bundle/전송량
- 개발/프로덕션 console/network 오류 수
- 최신 visual-verdict JSON
- 미완료 인간 플레이테스트 인계서
