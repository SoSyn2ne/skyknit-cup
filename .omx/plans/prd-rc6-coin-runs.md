# RC6 하늘동전 기록 도전 PRD

## Objective

세 지역의 기존 3D 구조물을 통과하는 짧은 하늘동전 코스를 추가해 탐험에 반복 가능한 기록 도전을 만든다. 플레이어는 지역별 첫 동전에서 출발해 10개를 순서대로 모으고, 마지막 동전에서 고정된 시간을 지역별 최고 기록과 비교한다.

## Approved assumptions

1. 각 지역 코스는 10개이며 순서가 고정된다.
2. 1번 동전을 얻은 순간을 0ms로 삼고 10번 동전에서 완주한다.
3. 완주 후 3초 동안 결과를 보여 준 뒤 1번 동전부터 재도전한다.
4. pause, 지도, landing/landed/taking-off 중에는 수집과 시간이 멈춘다.
5. 진행 중 지역 중심에서 500 units 밖으로 나가면 시도만 취소한다.
6. 활성 시도는 저장하지 않고 지역별 최고 기록만 저장한다.
7. 상점, 소비 재화, 보상 경제, 백엔드, 새 미션 유형은 추가하지 않는다.

## Commands

- Unit: `npm test`
- Type: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- E2E: `node node_modules/@playwright/test/cli.js test`
- Performance: `npm run test:performance`
- Production: `npm run test:production`
- Security: `npm audit --audit-level=high`

## Project structure

- `src/game/collectibles/coinCourses.ts`: 30개 좌표, 순서, 수집 반경
- `src/game/collectibles/coinRun.ts`: 순수 수집/타이머/완료/취소 규칙
- `src/game/world/createCoinCourseVisual.ts`: 단일 instanced 3D 동전 시각
- `src/game/persistence/records.ts`: v5 지역별 최고 기록
- `src/game/ui/ExplorationHud.ts`: 수집 수와 시간 표시
- `src/game/createRenderer.ts`: 고정 스텝 통합, 저장, QA 훅
- `tests/e2e/coin-runs.spec.ts`: 실제 브라우저 수집/기록/재도전

## Code style

```ts
const result = stepCoinRun(state, previousPosition, currentPosition, dtMs)
if (result.completedTimeMs !== null) {
  saveCoinBest(result.regionId, result.completedTimeMs)
}
```

순수 규칙은 Three.js 객체를 참조하지 않고 readonly 값과 새 상태를 반환한다. 렌더 시각은 규칙 상태를 읽기만 한다.

## Testing strategy

- Vitest: 30개 좌표 계약, 순서, 선분 수집, 타이머, pause equivalent인 `dt=0`, 지역 이탈, 재도전, 저장 마이그레이션
- Browser: 세 지역 QA 완주, HUD, 로컬 기록 reload, 키보드/터치, 레이스 비노출
- Visual: 5개 뷰포트 스크린샷, canvas 픽셀, visual-verdict
- Performance: RC5 30초 4시나리오와 draw-call/gzip 예산 유지

## Boundaries

- Always: 기존 RC5 레이스·미션·탐험 저장과 60Hz 고정 스텝 유지
- Ask first: 코인 수, 코스 수, 저장 의미, 보상 경제를 변경하는 범위 확장
- Never: 상점, 과금, 서버 기록, NPC, 전투, 새 엔진/의존성 추가

## Success criteria

- 세 지역에 정확히 10개씩 총 30개가 표시된다.
- 순서형 10개 수집, 시간 측정, 3초 재도전, 지역 이탈 취소가 동작한다.
- 지역별 최고 기록이 v5 저장에서 안전하게 유지된다.
- 비행 HUD는 수집 수와 시간만 표시하며 5개 뷰포트에서 조작을 가리지 않는다.
- RC5 전체 회귀, 성능, 프로덕션, 시각 품질 예산을 통과한다.

## Open questions

없음. 사용자 승인 목표와 위 가정으로 구현한다.
