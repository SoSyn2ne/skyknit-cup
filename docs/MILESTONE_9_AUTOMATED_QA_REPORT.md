# Milestone 9 RC2 자동 QA 기록

> 상태: **RC2 / 자동 검증 완료 / 3D·미션 플레이테스트 대기**
>
> 검증일: 2026-07-11

## 결론

M7 3D 리마스터와 M8 미션 6종을 포함한 RC2 자동 QA를 완료했다. 다섯 필수 뷰포트의 미션 선택/진행/성공/실패/재시도, WebGL 픽셀, 오류/네트워크, 30초 성능, 전송량, 프로덕션 QA 훅 제거가 모두 기준을 통과했다.

사람/실기기 결과는 없으며 출시 완료를 선언하지 않는다. 다음 단계는 `docs/RC2_PLAYTEST_HANDOFF.md`다.

## 최종 자동 게이트

```text
npm test                         # 24 files, 258 tests passed
npm run test:e2e                # 87 passed, 43 device-specific skips
M9 focused browser matrix        # 20 passed
npm run test:performance        # 1 passed, desktop/high + mobile/low 30s
npm run test:production         # 5 passed
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
Blender GLB inspection          # passed
production hook string scan     # 0 matches
```

일반 E2E의 device-specific skip은 동일 시나리오를 해당하지 않는 입력 장치/프로젝트에서 의도적으로 제외한 것이다. 성능과 프로덕션은 WebGL context 경쟁을 피하기 위해 전용 명령으로 분리했다.

## 5뷰포트 미션 행렬

| 프로젝트 | 뷰포트 | 입력 | 선택 | 진행 | 실패 | 재시도 | 성공 | 선택 복귀 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | `1440x900` | keyboard | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 |
| desktop-compact | `1280x720` | keyboard | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 |
| touch-landscape | `844x390` | touch | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 |
| touch-portrait | `390x844` | touch | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 |
| touch-minimum | `320x568` | touch | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 |

대표 실패 흐름은 무충돌 미션에서 검증된 충돌 이벤트 1회를 넣고 완주해 `failed`와 최고 등급 없음이 표시되는지 확인했다. 대표 성공 흐름은 첫 하늘매듭을 완주해 Gold를 받고 v3 local 설정에 저장한 뒤 선택 화면으로 돌아와 최고 Gold를 확인했다.

각 뷰포트에서 추가 확인:

- viewport/document 일치와 scroll 0
- 선택/시작/결과 행동 44x44 CSS px 이상
- form control 방향키가 레이스를 시작하거나 비행 입력으로 소비되지 않음
- 키보드/터치 각각 시작부터 재시도까지 완결
- pause/blur/hidden 시간/통계 정지
- context recovery의 미션 선택/체크포인트/충돌/리스폰/부스트 보존
- console error 0, page error 0, unhandled rejection 0
- failed request 0, HTTP 4xx/5xx 0

최종 증거는 `artifacts/browser-qa/m9/`에 있으며 커밋 대상에서 제외된다.

## WebGL 픽셀

| 뷰포트 | 표본 수 | 휘도 | 첫 hash | 두 번째 hash |
| --- | ---: | --- | ---: | ---: |
| `1440x900` | 51,840 | `0~225` | 3,023,587,024 | 731,678,791 |
| `1280x720` | 51,200 | `1~223` | 1,202,937,563 | 410,326,576 |
| `844x390` | 54,860 | `1~218` | 1,561,599,062 | 1,377,524,495 |
| `390x844` | 54,860 | `0~226` | 1,790,831,466 | 1,009,750,812 |
| `320x568` | 60,587 | `0~222` | 2,503,712,930 | 2,961,826,654 |

모든 화면이 휘도 범위 40 초과와 500ms 프레임 hash 변화를 만족했다. 프로덕션 5개 테스트도 nonblank/시간 변화를 별도로 통과했다.

## 30초 성능

측정 파일: `artifacts/browser-qa/m9/performance-30s.json`

| 지표 | desktop/high | mobile/low |
| --- | ---: | ---: |
| 뷰포트 | `1440x900` | `844x390` |
| DPR | 1 | 1 |
| median | 60fps | 60fps |
| minimum bucket | 59fps | 60fps |
| host frames | 1,803 | 1,802 |
| fixed steps | 1,803 | 1,802 |
| max steps/frame | 6 | 6 |
| draw calls | 30 | 28 |
| triangles | 29,884 | 26,220 |
| geometries | 43 | 38 |
| textures | 1 | 1 |

통과 기준:

- desktop/high median >=55fps: **60 통과**
- desktop/high minimum >=50fps: **59 통과**
- mobile/low median >=30fps: **60 통과**
- high draw calls <=120: **30 통과**

## RC1 → RC2 비교

| 지표 | RC1 / M6 | RC2 / M9 | 변화 |
| --- | ---: | ---: | ---: |
| 드래곤 triangles | 1,600 | 17,660 | +16,060 / 약 11.0배 |
| 드래곤 render meshes | 93 | 9 | -84 / 약 90.3% |
| high draw calls | 102 | 30 | -72 / 약 70.6% |
| high triangles | 8,188 | 29,884 | +21,696 |
| low draw calls | 102 | 28 | -74 |
| low triangles | 6,268 | 26,220 | +19,952 |
| 전체 raw | 863,954 bytes | 3,066,638 bytes | +2,202,684 bytes |
| 전체 gzip | 196,535 bytes | 623,073 bytes | +426,538 bytes |

드래곤의 실제 형상 밀도와 환경 레이어를 늘렸지만 피벗별 메시 병합으로 draw calls를 크게 줄였다. 전체 gzip은 10MiB 예산의 약 5.9%다.

## 최종 빌드 전송량

| 파일 | raw bytes | gzip bytes |
| --- | ---: | ---: |
| JavaScript | 666,436 | 173,087 |
| CSS | 13,529 | 2,972 |
| GLB | 2,385,716 | 446,393 |
| HTML | 404 | 264 |
| model README | 553 | 357 |
| 합계 | 3,066,638 | 623,073 |

## 프로덕션 제거와 오류

최종 `dist`의 JS/CSS/HTML에서 다음 문자열 검색 결과는 0건이다.

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
data-flight-debug
```

프로덕션 5뷰포트는 위 QA/failure query를 모두 URL에 넣고 다음을 확인했다.

- renderer-ready, canvas 1개
- 미션 select/시작 버튼 가시
- racing에서 compact mission tracker 가시
- QA control 0, resource fallback notice 0
- test hook/debug mirror 없음
- console/page/unhandled/network 오류 0
- document scroll 0
- canvas nonblank/시간 변화

## 시각 판정

- M7 dragon slice: `93/100`, pass
- M7 island/ruins slice: `91/100`, pass
- M7 cloud/gate slice: `94/100`, pass
- M7 anatomy/final slice: `95/100`, pass
- M8 mission UI iteration 1: `86/100`, revise
- M8 mission UI iteration 2: `94/100`, pass
- M9 RC2 final: `96/100`, pass

최신 판정은 `.omx/state/m9/ralph-progress.json`에 있다.

## 변경 범위 요약

- 계획/명세: 제품 목표, M7~M9 계획, RC2 PRD/테스트 명세
- M7: Blender v2/GLB 검사/피벗별 병합, 세계/구름/유적/깃발/룬/관문
- M8: 순수 미션 규칙/상태, RaceState 합성, v3 저장, recovery, UI/입력, 브라우저 미션 흐름
- M9: 5뷰포트 미션 증거, production 미션 요소/범위 캡처, 성능/전송/훅 감사, 보고서/인계

## 단순화와 남은 위험

- 새 런타임 의존성, 후처리, 백엔드, 새 코스, 새 드래곤을 추가하지 않았다.
- 미션 규칙은 렌더러/UI에서 분리했고 기존 race phase를 재사용했다.
- 드래곤은 스키닝 전환 대신 검증된 rigid pivot 9개 메시를 사용해 런타임 위험을 낮췄다.
- software WebGL/DPR 1/Chromium 에뮬레이션은 실제 iOS/Android GPU, 고DPR, notch, 열 throttling을 대체하지 못한다.
- 미션 임계값의 재미/공정성, 3D 근거리 인상, 실제 손가락 피로/멀미는 사람 플레이테스트가 필요하다.
- 커밋, push, deploy는 수행하지 않았다.

> **RC2 / 자동 검증 완료 / 3D·미션 플레이테스트 대기**
