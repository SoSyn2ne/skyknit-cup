# M39 → M40 48시간 계획 · 블록 A·B·C 실행 기록

> 상태: **블록 A·B·C 완료 / 블록 D(실기기·사람 플레이테스트) 대기**
>
> 실행일: 2026-07-29(UTC) · 기록일: 2026-07-30
>
> 계획 원본: [M39_TO_M40_48H_PLAN.md](M39_TO_M40_48H_PLAN.md)
>
> 공개 URL: **https://sosyn2ne.github.io/skyknit-cup/**

## 결론

계획의 블록 A(PR #1 머지)·B(CI 워크플로)·C(GitHub Pages 배포)를 한 번의 push로 닫았다. `main`은 RC6에서 M39까지 57커밋을 fast-forward로 따라잡았고, 열린 PR은 0개다. 게임은 이제 실제 공개 URL에서 콘솔 오류 없이 로드되며, RC7부터 쌓인 "폰에서 열 수 있는 URL이 없어 막혀 있던" 플레이테스트 빚의 선행 조건이 해소됐다.

계획이 블록 C의 최대 리스크로 지목한 base 경로 문제는 **실제로 존재하지 않았다.** 런타임 에셋 로딩이 이미 `import.meta.env.BASE_URL`을 경유하므로(`createDragon.ts`의 `resolveAssetUrl`, `createOpenWorld.ts`의 지역 GLB 경로, `GameAudio.ts`의 음악 경로), 빌드 시 base만 넘기면 하위 경로에서 그대로 동작한다. `/assets/...` 절대경로는 vitest 파일에만 남아 있고 그 환경의 BASE_URL은 `/`이므로 무해하다.

반면 계획이 리스크로 적은 "21MB 에셋으로 모바일 첫 로딩이 김"은 **실측 결과 사실이 아니다.** 첫 로딩 전송량은 0.57MB였다(아래 실측 참조).

## 블록별 완료 조건 대조

| 블록 | 완료 조건 | 결과 |
| --- | --- | --- |
| A | main HEAD가 `20735af`를 포함하고 열린 PR이 0개 | ✅ main = `b29f38e`(부모가 `20735af`), 열린 PR 0개, PR #1 `MERGED` |
| B | main에서 CI가 녹색 | ✅ CI run `30410028978` success, 30초 |
| C | 공개 URL에서 콘솔 오류 없이 로드되고 레이스 시작까지 도달 | ✅ 콘솔 오류 0건, 전 에셋 200, 시작 화면·미션 목록·서막 렌더 (실제 비행은 블록 D) |

## 추가한 워크플로

| 파일 | 트리거 | 내용 |
| --- | --- | --- |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | `main` push, 모든 PR | Node 22.20.0 · `npm ci` → `lint` → `typecheck` → `test` |
| [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) | `main` push, 수동 | `npm run build -- --base=/skyknit-cup/` → Pages artifact → 배포 |

- 계획대로 **E2E·성능·production·asset audit는 CI에 올리지 않았다.** 브라우저·GPU 의존 게이트를 CI에 올리면 flaky 실패가 신뢰를 깎으므로 로컬 게이트로 유지한다.
- base는 `vite.config` 파일 대신 **빌드 명령의 `--base` 플래그**로 넘긴다. config에 박으면 vitest가 같은 base를 물려받아 `/assets/...`를 기대하는 기존 테스트가 깨진다.
- Pages Source는 `gh api -X POST repos/SoSyn2ne/skyknit-cup/pages -f build_type=workflow`로 활성화했다(`build_type: workflow`).
- 배포 동시 실행은 `concurrency: { group: pages, cancel-in-progress: false }`로 막았다. 진행 중 배포를 취소하지 않는다.

## 첫 로딩 실측

배포 전 로컬 `vite preview --base=/skyknit-cup/`와 배포 후 공개 URL을 같은 방식(Navigation/Resource Timing)으로 측정했다.

| 항목 | 로컬 preview | **공개 URL** |
| --- | ---: | ---: |
| DOMContentLoaded | 233ms | **607ms** |
| load 이벤트 | 233ms | **607ms** |
| 첫 로딩 전송량 | 1.71MB | **0.57MB** |
| 첫 로딩 요청 수 | 3건 | 3건 |
| 렌더러 준비 | ✅ | ✅ |
| 콘솔 오류 | 0건 | 0건 |

첫 로딩 요청 3건의 내역과 공개 URL 전송 크기(gzip 적용 후 실측):

| 자산 | 디스크 | 전송 |
| --- | ---: | ---: |
| `assets/index-*.js` | 804.66kB | 213,724B |
| `assets/index-*.css` | 41.00kB | ~7kB |
| `assets/models/characters/skyknit-dragon.glb` | 1,538kB | 380,981B |

### 왜 22MB가 첫 로딩에 들어오지 않는가

배포 산출물은 22MB(모델 18MB, 오디오 4.1MB)지만 첫 로딩은 0.57MB다. 두 가지 이유를 실측으로 확인했다.

1. **지역 GLB 8개는 지연 로딩된다.** `createOpenWorld.ts`가 지역 진입 시점에 `{regionId}-{tier}.glb`를 로드하므로 시작 화면에서는 요청되지 않는다. 초기 요청은 JS·CSS·수호수 GLB 3건뿐이다.
2. **Pages가 gzip으로 전송한다.** 수호수 GLB는 디스크 1,538kB → 전송 380,981B, 가장 큰 지역인 `volcanic-archipelago-high.glb`도 2,574,668B → 전송 703,272B다.

따라서 계획의 리스크 표에 있는 "21MB 에셋으로 모바일 첫 로딩이 김"은 첫 진입에 관해서는 **기각한다.** 다만 아래 항목이 새로 생겼다.

## 블록 D로 넘기는 미검증 항목

계획의 인계 문서 [M39_VOLCANIC_ARCHIPELAGO_PLAYTEST_HANDOFF.md](M39_VOLCANIC_ARCHIPELAGO_PLAYTEST_HANDOFF.md)의 15분 동선과 질문지를 그대로 사용한다. 기기: PC(마우스+키보드) / Android(320px급 세로 포함) / iPhone 또는 iPad Safari(소리 unlock 포함).

| 항목 | 사유 |
| --- | --- |
| **10분 이상 비행 시 발열·프레임 저하** | M39의 유일한 자동화 불가 게이트. 최우선. |
| **지역 이동 시 GLB 스트리밍 끊김** | 이번 실측에서 새로 드러난 항목. 첫 로딩이 가벼운 대신 지역 GLB(전송 최대 703kB)를 진입 시점에 받으므로, 모바일 네트워크에서 진입 순간 끊김이 생기는지 확인이 필요하다. |
| 실제 비행·레이스 완주 | 자동 검증은 시작 화면·서막·에셋 로드까지만 도달했다. 표시되지 않은 브라우저 pane에서는 캔버스가 320x1로만 잡혀 비행 입력을 신뢰할 수 없다. |
| 체감 질문 | 용암 위험 예고(낙석 1.5초·파도 2초)의 공정성, 골드(45초·무충돌) 재도전 의욕, BGM·용암 앰비언스 균형, 세 수호수 선호. |

결과는 `docs/M39_PLAYTEST_RESULT.md`에 인계 문서의 "실패로 기록할 조건" 기준으로 기록한다(기기/방향/수호수/재현 순서/스크린샷 포함).

## 배포 이력

| 항목 | 값 |
| --- | --- |
| main HEAD | `b29f38e` |
| push 방식 | fast-forward (`ba6467f..b29f38e`, 57커밋), 머지 커밋 없음 |
| PR #1 | `MERGED` (2026-07-29T00:04:53Z) |
| CI run | `30410028978` success, 30초 |
| Deploy run | `30410028967` success, 45초 |
| base | `/skyknit-cup/` |
| index HTTP | 200, 0.35초 |
