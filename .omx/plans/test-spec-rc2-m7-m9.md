# 하늘매듭배 RC2 테스트 명세 — M7~M9

> 상태: **승인됨 / RED 테스트 작성 가능**
>
> 연계 PRD: `.omx/plans/prd-rc2-m7-m9.md`

## 1. M7 에셋 정적 게이트

- GLB 삼각형 수가 15,000~25,000 범위다.
- `DragonRoot`, `WingRig_L`, `WingRig_R`, `HeadRig`, `TailRig_1..5`가 모두 존재한다.
- 런타임 드래곤 렌더 메시 <=16, 텍스처 <=1, 재질/vertex-color 계약 통과.
- 기존 `createDragon` 로더가 fallback 없이 v2를 로드한다.
- high 장면 draw calls <=120.
- 프로젝트 외부/출처 불명 에셋이 없다.

## 2. M7 동작/시각 게이트

- 기존 포즈 단위 테스트가 날갯짓, 뱅크, 몸통/꼬리 지연, 상승/부스트를 회귀 없이 통과한다.
- 각 수직 슬라이스마다 5개 필수 뷰포트 중 영향을 받는 화면을 실제 브라우저로 캡처한다.
- 캔버스 휘도 범위 >40, 두 프레임 hash 변화.
- 첫 레이싱 화면에서 active gold gate, dragon GLB, wind thread 2개가 동시에 보인다.
- visual-verdict `pass`가 아니면 다음 시각 슬라이스로 넘어가지 않는다.
- 최신 판정은 `.omx/state/m7/ralph-progress.json`에 기록한다.

## 3. M8 단위 테스트 — 먼저 RED

### 미션 카탈로그

- ID 6개가 중복 없이 고정 순서로 존재한다.
- 각 미션에 한국어 이름, 목표 문구, 등급 평가기가 있다.
- 임계값은 UI가 아닌 규칙 모듈에서만 정의한다.

### 평가

- 각 미션의 경계값 직전/정확히/직후를 검사한다.
- 미완주는 모든 미션에서 `failed`다.
- `golden-knot`는 각 등급의 시간/충돌/리스폰/부스트 조건을 모두 만족해야 해당 등급을 받고, bronze 조건 하나라도 미달하면 `failed`다.
- 최고 등급 비교는 `failed < bronze < silver < gold`이며 하향 덮어쓰기가 없다.

### 시도 통계

- 카운트다운/일시정지 입력은 통계를 바꾸지 않는다.
- racing 중 충돌 이벤트만 collisionCount를 1회 올린다.
- 수동/자동 리스폰 모두 respawnCount를 올리되 한 이벤트당 1회다.
- 부스트는 비활성→활성 전이에만 1회 집계하고 키 반복/유지에는 중복 집계하지 않는다.
- 체크포인트는 순서 전진만 반영하고 역방향/중복은 무시한다.
- 완주 평가/저장은 한 번만 실행된다.
- 재시도는 미션 선택을 유지하고 시도 통계를 초기화한다.

### 저장 v3

- 정상 v3 round-trip.
- v2→v3 마이그레이션에서 기존 설정/기록 보존, 빈 missionGrades 생성.
- 알 수 없는 mission ID/grade 제거.
- 음수/비유한 bestTime 제거.
- 손상 JSON, storage read/write 예외에서 기본값과 게임 진행 유지.

### 복구

- 컨텍스트 복구 snapshot round-trip에서 선택 미션/시도 통계/경과 시간/체크포인트 유지.
- 복구 후 같은 충돌/리스폰/부스트 이벤트가 중복 적용되지 않는다.
- 복구 후 일시정지 상태라면 통계가 정지한다.

## 4. M8 통합/브라우저 테스트

- 키보드: 미션 선택→시작→진행 HUD→성공→최고 등급→같은 미션 재시도.
- 키보드: 실패 결과와 조건별 실패 이유.
- 터치 landscape/portrait/minimum에서 동일 흐름.
- 미션 선택/재시도 버튼 accessible name, keyboard focus, 44x44 CSS px.
- timer width 변화 <=1px, mission HUD가 gate indicator/터치 컨트롤과 겹치지 않음.
- pause/blur/hidden 동안 시간과 미션 통계 정지.
- 강제 context recovery 전후 선택/진행/통계 유지.
- 새 브라우저 context에서 최고 등급 저장/재로드 확인.

## 5. M9 5뷰포트 행렬

| 뷰포트 | 입력 | 필수 상태 |
| --- | --- | --- |
| `1440x900` | keyboard | select, progress, success, failure, retry |
| `1280x720` | keyboard | select, progress, success, failure, retry |
| `844x390` | touch | select, progress, success, failure, retry |
| `390x844` | touch | select, progress, success, failure, retry |
| `320x568` | touch | select, progress, success, failure, retry |

각 행에서 viewport/document 일치, scroll 0, touch target/safe-area, canvas 픽셀, console/page/unhandled/network 오류 0을 검사한다.

## 6. 성능/전송량 비교

- desktop/high 30초: median >=55fps, minimum >=50fps.
- mobile/low 30초: median >=30fps.
- high draw calls <=120.
- v2 dragon triangles 15,000~25,000.
- 전체 gzip <10MiB.
- M6 기준: draw calls 102, high triangles 8,188, mobile low triangles 6,268, gzip 196,535 bytes.
- M9 보고서에 M6→RC2 증감과 통과 여부를 기록한다.

## 7. 프로덕션 제거

- 기존 문자열과 RC2 미션/시각 QA 전용 문자열을 `dist`에서 검색해 0건이어야 한다.
- 프로덕션 URL에 모든 QA 쿼리를 넣어도 정상 제품 상태만 나타나야 한다.
- `window.__DRAGON_RACE_TEST__`와 debug mirror가 없다.

## 8. 전체 명령

```text
npm test
npm run test:e2e
npm run test:performance
npm run test:production
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

## 9. 완료 증거

- `docs/MILESTONE_7_REPORT.md`
- `docs/MILESTONE_8_REPORT.md`
- `docs/MILESTONE_9_AUTOMATED_QA_REPORT.md`
- `docs/RC2_PLAYTEST_HANDOFF.md`
- `.omx/state/m7/ralph-progress.json`
- `.omx/state/m8/ralph-progress.json`
- `.omx/state/m9/ralph-progress.json`
- 커밋 제외 실제 스크린샷/성능 JSON은 `artifacts/browser-qa/m7|m8|m9/`
