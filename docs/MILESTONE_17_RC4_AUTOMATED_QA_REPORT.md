# Milestone 17 RC4 자동 QA 기록

> 상태: **RC4 / 소형 오픈월드 프로토타입 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 검증일: 2026-07-12

## 결론

기존 Dragon v3 레이스와 6개 미션을 보존하면서 축제 중심섬, 바람 협곡, 구름 유적지를 탐험하는 RC4 수직 슬라이스를 완성했다. 자유 감속/호버, 착륙/재이륙, 거리 기반 지역 스트리밍, 발견/위치/목적지 저장, 지도와 상황 동작, 축제 비콘의 기존 레이스 진입을 자동 검증했다. 실기기 또는 사람 플레이 결과는 없으므로 출시 완료를 선언하지 않는다.

## 구현 범위

- 레이스 수치를 바꾸지 않는 별도 탐험 비행 상태와 키보드/터치 입력
- 420 units 로드, 500 units 언로드 히스테리시스와 geometry/material 해제
- 금빛 축제, 청록 바람 협곡, 밝은 석조 유적의 절차적 랜드마크
- v4 저장: 위치, 방향, 착륙 상태, 발견 지역, 목적지와 기존 기록/등급 보존
- 현재 지역, 목적지 화살표/거리, 3지역 지도, 착륙/이륙/도전 상황 버튼
- 개발 전용 지역/비콘 QA 이동 훅과 프로덕션 제거 검증

## 최종 자동 게이트

```text
npm test                         # 28 files, 281 tests passed
5-project E2E matrix             # 108 passed, 57 device-specific skips
RC4 open-world matrix            # 5 required viewports, 11 contracts passed
canvas pixel matrix              # 5 passed, nonblank and changing
visual-verdict                   # 94/100 pass
npm run test:performance         # 1 passed, race + explore, desktop + mobile
npm run test:production          # 5 passed
npm run typecheck                # passed
npm run lint                     # passed
npm run build                    # passed
npm audit --audit-level=high     # 0 vulnerabilities
production QA hook scan          # 0 matches through production suite
```

단일 전체 E2E 명령은 도구의 6분 실행 제한에 도달해, 같은 Playwright 매트릭스를 5개 프로젝트별로 완결 실행했다. v4 기대값과 새 감속 컨트롤 개수로 바뀐 두 회귀 테스트는 수정 후 관련 프로젝트에서 재통과했다.

## 30초 성능

측정 파일: `artifacts/browser-qa/rc4/performance-30s.json`

| 지표 | race desktop/high | race mobile/low | explore desktop/high | explore mobile/low |
| --- | ---: | ---: | ---: | ---: |
| viewport | 1440x900 | 844x390 | 1440x900 | 844x390 |
| median | 60fps | 60fps | 60fps | 60fps |
| minimum bucket | 53fps | 60fps | 58fps | 60fps |
| fixed steps | 1,802 | 1,803 | 1,804 | 1,802 |
| max steps/frame | 6 | 6 | 6 | 6 |
| draw calls | 33 | 31 | 39 | 38 |
| triangles | 30,948 | 28,068 | 28,900 | 26,260 |
| geometries | 43 | 42 | 50 | 49 |
| textures | 1 | 1 | 1 | 1 |

탐험 최고 부하 샘플은 구름 유적지에서 측정했다. high 120 draw-call 제한과 데스크톱/모바일 FPS 기준을 모두 만족했다.

## 5뷰포트 WebGL 픽셀

| viewport | luma | first hash | second hash |
| --- | --- | ---: | ---: |
| 1440x900 | 1~229 | 458,132,785 | 1,102,766,298 |
| 1280x720 | 1~229 | 1,843,928,095 | 2,813,871,820 |
| 844x390 | 1~219 | 1,165,511,732 | 3,268,038,578 |
| 390x844 | 0~229 | 995,403,812 | 3,356,276,815 |
| 320x568 | 0~222 | 2,878,371,699 | 3,573,191,964 |

탐험 캡처는 `.omx/state/rc4/ralph-progress.json`의 시각 판정 루프로 검토했다. 구름 유적 착륙장이 상판 아래에 있던 첫 프레이밍 오류와 터치 상황 버튼의 드래곤 겹침을 수정한 뒤 94점으로 통과했다.

## 전송량

| 파일군 | raw | gzip |
| --- | ---: | ---: |
| HTML | 404 | 272 |
| CSS | 17,491 | 3,549 |
| JavaScript | 685,340 | 177,275 |
| model README | 727 | 437 |
| Dragon GLB | 2,648,668 | 479,493 |
| 합계 | 3,352,630 | 661,026 |

gzip 합계는 10MiB 예산의 약 6.3%다. Vite의 단일 JavaScript 청크 500kB 경고는 남지만 gzip과 전체 제품 예산은 충족하며 새 의존성은 없다.

## 변경 파일과 단순화

- `src/game/exploration/`: 레이스와 분리된 순수 탐험 상태만 추가했다.
- `src/game/world/openWorldRegions.ts`, `createOpenWorld.ts`: 지역 선택 규칙과 Three.js 생성을 분리했다.
- `src/game/persistence/records.ts`: v4 파서에서 위치 범위와 알려진 지역 id를 검증한다.
- `src/game/ui/ExplorationHud.ts`, `TouchControls.ts`, `styles.css`: 기존 full-bleed 화면과 토큰을 재사용했다.
- `src/game/createRenderer.ts`: 모드 전환과 저장/복구를 한 런타임에서 연결하고 기존 레이스 상태 머신은 재작성하지 않았다.
- 외부 에셋, 전투, NPC, 대화, 멀티플레이, 백엔드, 새 드래곤/코스/의존성을 추가하지 않았다.

## 남은 위험

- 실제 iOS/Android GPU, 고DPR, 열 throttling, 제조사별 safe-area는 자동화로 대체할 수 없다.
- 호버 감속률, 착륙 허용 높이, 지역 간 이동 시간이 재미있는지는 사람 플레이가 필요하다.
- 320px 화면의 엄지 오입력과 장시간 멀미/피로는 실기기 확인이 필요하다.
- 절차적 지역은 프로토타입 밀도이며 대형 오픈월드나 콘텐츠 확장을 의미하지 않는다.
- 커밋, push, deploy는 수행하지 않았다.

> **RC4 / 소형 오픈월드 프로토타입 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
