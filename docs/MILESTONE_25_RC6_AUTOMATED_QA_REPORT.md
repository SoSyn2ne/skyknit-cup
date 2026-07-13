# Milestone 25 RC6 자동 QA 기록

> 상태: **RC6 / 하늘동전 기록 도전 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 검증일: 2026-07-13

## 결론

축제 중심섬, 바람 협곡, 구름 유적지에 각각 10개씩 총 30개의 순서형 하늘동전을 추가했다. 첫 동전부터 마지막 동전까지의 시간을 고정 스텝으로 측정하고 지역별 최고 기록을 로컬 저장한다. 기존 레이스, 미션 6종, 키보드·터치, 착륙, 지도, 지역 GLB 스트리밍과 거리 LOD는 보존됐다. 실기기와 사람 플레이 결과는 아직 없으므로 출시 완료를 선언하지 않는다.

## 구현 범위

- 세 지역 × 10개의 고유 동전 ID와 구조물을 활용한 3D 비행 동선
- 현재 순서의 동전만 유효한 선분 기반 고속 수집 판정
- 첫 동전에서 0ms로 시작하고 마지막 동전에서 고정되는 지역별 타이머
- 일시정지, 지도, 착륙·이륙 전이 중 수집과 시간 정지
- 지역 이탈 시 활성 시도만 취소하고 기존 최고 기록 보존
- 완료 후 3초 결과 표시와 자동 재도전 준비
- 저장 포맷 v5, v1~v4 안전 마이그레이션, 손상 기록 정리
- 30개를 한 `InstancedMesh`로 관리하는 저드로우콜 3D 동전
- 비행 화면의 `동전 n/10`과 기록 시간, 지도 안의 지역별 최고 기록
- 개발 전용 결정적 수집 훅과 디버그 스냅샷

## 최종 자동 게이트

```text
npm test                         # 31 files, 298 tests passed
npm run typecheck                # passed
npm run lint                     # passed
npm run build                    # passed
5-project E2E matrix             # 108 passed, 61 device-specific skips
stale v4 assertion rerun         # 6 passed after v5 expectation update
RC6 coin matrix                  # 5 viewports plus 3-region persistence passed
canvas pixel matrix              # 5 passed, nonblank and changing
visual-verdict                   # 93/100 pass, iteration 3
npm run test:performance         # 1 passed, four 30-second samples
npm run test:production          # 5 passed
npm audit --audit-level=high     # 0 vulnerabilities
production QA-hook scan          # 0 matches
```

전체 E2E의 6개 실패는 실제 기능 문제가 아니라 저장 버전을 v4로 고정해 둔 기존 기대값이었다. 기대값을 v5로 갱신한 뒤 미션 5뷰포트와 품질 저장 사양을 모두 재실행해 6개가 통과했다. 브라우저 콘솔, page error, 처리되지 않은 rejection과 네트워크 실패는 없었다.

## 30초 성능

측정 파일: `artifacts/browser-qa/rc6/performance-30s.json`

| 지표 | race desktop/high | race mobile/low | explore desktop/high | explore mobile/low |
| --- | ---: | ---: | ---: | ---: |
| viewport | 1440x900 | 844x390 | 1440x900 | 844x390 |
| median | 60fps | 60fps | 60fps | 60fps |
| minimum bucket | 60fps | 60fps | 60fps | 60fps |
| fixed steps | 1,802 | 1,802 | 1,803 | 1,803 |
| max steps/frame | 6 | 6 | 6 | 6 |
| draw calls | 34 | 31 | 36 | 35 |
| triangles | 30,212 | 28,068 | 32,568 | 31,688 |
| geometries | 47 | 42 | 47 | 46 |
| textures | 1 | 1 | 1 | 1 |

탐험 장면은 RC5보다 동전 인스턴스 1드로콜과 약 2,880 triangles만 증가했다. 데스크톱 55/50fps, 모바일 30fps, high 120 draw-call 예산을 모두 통과했다.

## 시각·반응형 QA

- 증거: `artifacts/browser-qa/rc6/*-coins.png`
- 판정: `.omx/state/rc6/ralph-progress.json`, 93/100 pass
- 필수 뷰포트: 1440x900, 1280x720, 844x390, 390x844, 320x568
- 첫 반복에서 세로 화면의 착륙 버튼이 기록 HUD를 덮던 문제를 상단 3열 배치로 해결했다.
- 실제 다음 동전을 바라보는 QA 프레임으로 금빛 동전, 드래곤, 구조물, HUD의 동시 가독성을 확인했다.
- 다섯 뷰포트 모두 캔버스 명도 범위가 40을 넘고 500ms 뒤 픽셀 해시가 변했다.

## 저장과 호환성

- `skyknit-cup:settings`는 v5로 저장한다.
- 기존 레이스 최고 기록, 미션 최고 등급, 탐험 위치·발견·목적지를 유지한다.
- 지역별 기록은 `coinBestTimesMs`에 양의 유한 시간만 보존한다.
- 더 느린 기록, 0, 음수, NaN, 문자열, 알 수 없는 지역 ID는 기존 유효 기록을 덮지 않는다.
- 새 동전 런의 활성 상태는 저장하지 않아 재접속 시 중간 기록을 이어서 악용할 수 없다.

## 전송량과 배포 안전성

- 프로덕션 `dist` 11개 파일: raw 11,952,760 bytes
- 전체 gzip: 1,952,344 bytes, 약 1.86MiB
- 10MiB 예산의 약 19%를 사용한다.
- 프로덕션 JavaScript에 `__DRAGON_RACE_TEST__`, `qaCollectCoin`, 강제 실패 훅 문자열이 없다.
- Vite JavaScript 단일 청크 500kB 경고는 기존과 동일하게 남지만 gzip·프레임·로딩 검증은 통과했다.

## 변경 파일과 단순화

- `src/game/collectibles/coinCourses.ts`: 지역별 좌표와 수집 반경을 한 데이터 계약으로 관리한다.
- `src/game/collectibles/coinRun.ts`: 렌더러와 분리된 순수 수집·타이머·취소·재도전 상태다.
- `src/game/world/createCoinCourseVisual.ts`: 30개 동전을 한 인스턴스 메시로 렌더링한다.
- `src/game/persistence/records.ts`: v5 지역별 최고 기록과 이전 버전 마이그레이션을 담당한다.
- `src/game/ui/ExplorationHud.ts`: 비행 중 수집 수와 시간만 표시하고 지도에서 최고 기록을 확인한다.
- `src/game/createRenderer.ts`: 탐험 고정 스텝에서만 동전 상태를 연결하고 레이스 경로는 그대로 둔다.
- 새 외부 의존성, 백엔드, 경제·상점, NPC, 퀘스트 시스템을 추가하지 않았다.

## 남은 위험

- 실제 iOS/Android의 발열, 고DPR, 제조사별 throttling은 자동화로 대체할 수 없다.
- 각 지역 10개 동선의 길이, 회전 난이도, 첫 동전 발견성은 사람 플레이로 조정해야 한다.
- 금화 문양과 수집 효과음의 만족감은 취향 검증이 남는다.
- 구조물 가까이의 동전에서 카메라 클리핑이나 멀미가 생기는지 실기기 확인이 필요하다.
- 커밋, push, deploy는 수행하지 않았다.

> **RC6 / 하늘동전 기록 도전 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
