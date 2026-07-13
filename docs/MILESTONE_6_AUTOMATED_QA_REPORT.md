# Milestone 6 자동 QA 기록

> 상태: **RC1 / 자동 검증 완료 / 플레이테스트 대기**
>
> 검증일: 2026-07-11

## 결론

M4의 키보드/터치/접근성, M5의 설정/품질/WebAudio/복구를 포함한 자동 회귀와 프로덕션 브라우저 검증을 완료했다. 다섯 필수 뷰포트, WebGL 픽셀, 오류/네트워크, 30초 성능, 압축 전송량, 프로덕션 QA 훅 제거가 모두 기준을 통과했다.

측정 실패가 없어서 장면 수나 모델 품질을 추가로 낮추는 성능 튜닝은 하지 않았다. M6에서 수행한 유일한 제품 시각 수정은 실제 캡처에서 발견한 터치 캔버스 기본 focus frame을 마지막 활성 키보드 장치에만 표시하도록 범위를 좁힌 것이다.

외부 플레이테스터 결과는 없으며 최종 출시 완료를 선언하지 않는다.

## 최종 자동 게이트

```text
npm test                         # 22 files, 185 tests passed
npm run test:e2e                # 77 passed, 43 device-specific skips
npm run test:performance        # 1 passed, desktop/high + mobile/low 30s each
npm run test:production         # 5 passed, one per required viewport
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
```

일반 E2E는 성능 표본과 프로덕션 표본을 의도적으로 제외한다. 두 표본은 다른 WebGL context와 경쟁하지 않도록 각각 `test:performance`, `test:production` 전용 명령에서 검증한다.

## 다섯 뷰포트

| 프로젝트 | 뷰포트 | 입력 | auto tier | 개발 E2E | 프로덕션 E2E |
| --- | --- | --- | --- | --- | --- |
| desktop | `1440x900` | keyboard | high | 통과 | 통과 |
| desktop-compact | `1280x720` | keyboard | high | 통과 | 통과 |
| touch-landscape | `844x390` | touch | low | 통과 | 통과 |
| touch-portrait | `390x844` | touch | low | 통과 | 통과 |
| touch-minimum | `320x568` | touch | low | 통과 | 통과 |

각 뷰포트에서 다음을 자동 확인했다.

- viewport/document 크기 일치, 가로·세로 scroll 0
- 모든 보이는 touch control 44x44 CSS px 이상, viewport 안
- active gold gate, GLB dragon, wind thread 2개 동시 가시
- timer 너비 변화 1px 이하
- normal GLB source, canvas 1개
- console error 0, page error 0, unhandled rejection 0
- failed request 0, HTTP 4xx/5xx 0
- 프로덕션 forced QA/failure query 무효

최종 개발 스크린샷은 `artifacts/browser-qa/m6/{project}-racing.png`, 프로덕션 스크린샷은 `artifacts/browser-qa/m6/production-{project}.png`에 생성되며 커밋 대상에서 제외된다.

## WebGL 픽셀

WebGL2 drawing buffer를 다음 animation frame에서 직접 읽었다. 각 화면은 휘도 범위가 40보다 크고 500ms 간격 표본 hash가 달라 nonblank/시간 변화 기준을 통과했다.

| 뷰포트 | 표본 수 | 휘도 | 첫 hash | 두 번째 hash |
| --- | ---: | --- | ---: | ---: |
| `1440x900` | 51,840 | `0~218` | 1,065,479,769 | 3,150,868,095 |
| `1280x720` | 51,200 | `0~218` | 3,111,752,741 | 1,715,845,895 |
| `844x390` | 54,860 | `0~218` | 15,191,298 | 1,906,434,741 |
| `390x844` | 54,860 | `0~219` | 3,560,934,769 | 3,725,738,990 |
| `320x568` | 60,587 | `0~221` | 781,573,003 | 822,719,890 |

프로덕션 전용 5개 테스트도 각 drawing buffer의 nonblank 범위와 시간 hash 변화를 별도로 통과했다.

## 30초 성능

측정 파일: `artifacts/browser-qa/m6/performance-30s.json`

| 지표 | desktop/high | mobile/low |
| --- | ---: | ---: |
| 뷰포트 | `1440x900` | `844x390` |
| 측정 DPR | 1 | 1 |
| canvas bitmap | `1440x900` | `844x390` |
| 1초 bucket median | 60fps | 60fps |
| 1초 bucket mean | 60fps | 60fps |
| 1초 bucket minimum | 60fps | 60fps |
| 측정 구간 host frames | 1,802 | 1,802 |
| 고정 steps | 1,802 | 1,802 |
| max steps/frame | 6 | 6 |
| draw calls | 102 | 102 |
| triangles | 8,188 | 6,268 |
| geometries | 112 | 112 |
| textures | 1 | 1 |

통과 기준과 결과:

- desktop/high median >=55fps: **60fps 통과**
- desktop/high minimum >=50fps: **60fps 통과**
- mobile/low median >=30fps: **60fps 통과**
- 30초 fixed step 약 1,800회: **1,802회 통과**

Playwright의 Chromium software WebGL 환경에서 다른 테스트와 분리해 순차 측정했다. 측정 장치 DPR이 1이므로 high/low 장면 예산 차이는 구름/부스트 효과와 triangle 수에 반영됐지만 최대 DPR 비용은 포함하지 않는다. 실제 고DPR 휴대폰 GPU와 열 throttling은 사람/실기기 인계 위험으로 남긴다.

## 빌드와 전송량

최종 `dist`:

| 파일 | raw bytes | gzip bytes |
| --- | ---: | ---: |
| JavaScript | 655,696 | 169,799 |
| CSS | 11,545 | 2,672 |
| GLB | 195,756 | 23,444 |
| HTML | 404 | 263 |
| model README | 553 | 357 |
| 합계 | 863,954 | 196,535 |

- 보수적 전체 gzip 합계: 196,535 bytes, 약 0.187MiB
- 초기 압축 전송량 10MiB 예산 대비 약 1.9%
- 실제 초기 로드에 사용되지 않는 model README까지 포함한 보수적 값이다.
- Vite의 500KB JavaScript chunk 경고는 Three.js 단일 청크 때문이며 전송 예산은 통과한다.

## 프로덕션 제거 검사

최종 `dist` 전체에서 다음 문자열을 검색했고 0개였다.

```text
qaCourse
qaCollision
qaBoost
qaWave
qaGateIndicator
qaReducedMotion
forceWebglFailure
forceDragonFailure
__DRAGON_RACE_TEST__
```

프로덕션 Playwright는 위 쿼리를 모두 URL에 전달한 상태로 다섯 프로젝트를 실행했다.

- renderer-ready
- canvas 1개
- QA control 0개
- test hook 없음
- debug mirror 없음
- forced fallback notice 없음
- console/page/unhandled/network error 0

인앱 브라우저 교차 확인도 같은 상태와 브라우저 로그 0개를 반환했다.

## 시각 판정

- M6 iteration 1: touch 시작 뒤 전체 캔버스 기본 focus frame 발견, `88/100`, revise
- M6 iteration 2: touch frame 제거와 device-scoped keyboard focus 확인, `95/100`, pass
- M6 iteration 3: 프로덕션 `320x568` 기준, `96/100`, pass

최신 판정은 `.omx/state/m6/ralph-progress.json`에 있다. 터치는 full-bleed/unframed를 유지하고, 키보드는 비행 캔버스 포커스가 있을 때 접근 가능한 focus indicator를 유지한다.

## 변경 파일

- 성능: `tests/e2e/performance.spec.ts`, `tools/run-playwright-performance.mjs`, `package.json`
- 최종 브라우저 QA: `tests/e2e/final-visual.spec.ts`, `runtime-health.spec.ts`, `canvas-pixels.spec.ts`
- 프로덕션: `tests/e2e/production.spec.ts`, `tools/run-playwright-production.mjs`, `playwright.config.ts`
- 검증 도구 lint 범위: `eslint.config.js`
- focus 시각 수정: `src/game/createRenderer.ts`, `src/styles.css`
- 증거: `.omx/state/m6/ralph-progress.json`, `artifacts/browser-qa/m6/`, 이 보고서

## 단순화와 남은 위험

- 제품에 성능 계측 라이브러리나 영구 프레임 로그를 추가하지 않고 Playwright page-side rAF 표본만 사용했다.
- 성능 기준을 이미 통과해 장면/모델 품질을 낮추는 불필요한 튜닝을 하지 않았다.
- 프로덕션 검증은 같은 Playwright 5프로젝트 행렬을 재사용해 별도 장치 설정 중복을 피했다.
- software WebGL, DPR 1, Chromium 에뮬레이션은 실제 iOS/Android GPU, notch, 열 throttling, 스피커 음량, 손가락 피로를 완전히 대체하지 못한다.
- 자동화된 관문 완주는 규칙 검증용 개발 훅으로 가속했다. 실제 사람이 코스를 읽고 2~4분 안에 완주하는 난이도 증거는 남아 있다.
- 사람 3명의 30초 조작 발견과 첫 레이스 완주 결과는 비어 있으며 임의로 채우지 않았다.

다음 문서는 `docs/PLAYTEST_HANDOFF.md`다. 외부 결과가 들어오기 전 상태는 **RC1 / 자동 검증 완료 / 플레이테스트 대기**다.
