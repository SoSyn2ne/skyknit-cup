# Milestone 8 로컬 챌린지 미션 기록

> 상태: **완료 검증됨**
>
> 검증일: 2026-07-11

## 결론

기존 1랩 코스와 비행 규칙을 그대로 재사용하는 로컬 싱글 플레이 미션 6종을 추가했다. 미션 규칙, 시도 통계, 등급 평가는 Three.js/DOM과 분리된 순수 TypeScript이며 준비 화면 선택부터 키보드/터치 시작, 진행 HUD, 성공/실패 결과, 같은 미션 재도전, 미션 선택 복귀까지 완결된다.

기존 v2 설정은 최고 기록/음소거/화질을 보존해 v3로 마이그레이션하고, v3는 미션별 최고 등급을 추가한다.

## 미션 6종

| 미션 | Bronze | Silver | Gold |
| --- | --- | --- | --- |
| 첫 하늘매듭 | 완주 | 210초 이내 | 180초 이내 |
| 질풍 시간전 | 180초 이내 | 165초 이내 | 150초 이내 |
| 구름 한 점 없이 | 무충돌 완주 | 무충돌 + 210초 | 무충돌 + 180초 |
| 끊기지 않는 매듭 | 무리스폰 완주 | 무리스폰 + 210초 | 무리스폰 + 180초 |
| 돌풍 조율사 | 부스트 3회 | 5회 | 7회 |
| 황금 하늘매듭 | 210초/충돌≤1/리스폰≤1/부스트≥3 | 195초/무충돌/리스폰≤1/부스트≥4 | 180초/무충돌/무리스폰/부스트≥5 |

미완주와 Bronze 조건 미달은 `failed`다. 최고 등급은 `bronze < silver < gold` 순서로만 올라가며 낮은 결과가 기존 기록을 덮지 않는다.

## 순수 규칙과 상태

- `missionRules.ts`: 카탈로그, 임계값, 등급 평가, 실패 기준, 최고 등급 병합, ID/등급 검증.
- `missionState.ts`: 선택, 시작, 시간, 체크포인트, 충돌, 리스폰, 부스트, 완료, 재시도, 복구 복사.
- `RaceState`가 `MissionSessionState`를 합성해 레이스와 미션의 pause/retry/finish/recovery 의미를 한 스냅샷에서 관리한다.
- 별도 mission phase를 만들지 않고 기존 `ready → countdown → racing → finished`를 유지한다.

### 통계 경계

- 충돌: `applyObstacleCollision(...).triggered === true`일 때만 1회. cooldown/리스폰 면역으로 거절된 접촉은 제외.
- 리스폰: 수동 `R`, 자동 이탈, 일시정지 메뉴의 실제 리스폰만 집계.
- QA 관문 이동용 위치 재설정과 초기화/재시도/복구는 리스폰에서 제외.
- 부스트: 실제 `flightState.isBoosting`의 `false → true` 에지만 집계. 키 반복/누른 채 유지 제외.
- 체크포인트: 현재 목표의 순차 전진만 반영.
- 일시정지: 시간과 모든 통계 정지.
- 재시도: 선택 미션 유지, 통계/결과 초기화.
- 완주: 한 번만 평가하고 최고 등급을 병합/저장.

## v3 저장

```json
{
  "version": 3,
  "bestTimeMs": 123456,
  "muted": false,
  "quality": "auto",
  "missionGrades": {
    "first-skyknot": "gold",
    "clean-flight": "bronze"
  }
}
```

- v2는 세 기존 필드를 그대로 유지하고 빈 `missionGrades`로 v3 저장.
- v1 별도 최고 기록도 기존처럼 읽어 v3로 저장.
- 알 수 없는 미션 ID, `failed`, 미지원 등급은 해당 항목만 제거.
- 손상 JSON/비정상 값/storage read-write 오류는 기본값으로 계속 진행.
- 활성 시도는 localStorage가 아니라 WebGL recovery snapshot에만 보존.

## UI와 입력

- 준비: 네이티브 미션 select, 한 줄 목표, 로컬 최고 등급, 48px `비행 시작` 버튼.
- 비행: 미션 이름과 해당 목표에 필요한 통계만 한 줄 표시.
- 결과: 성공/실패, 이번/최고 등급, 기록, 같은 미션 재도전, 미션 선택 복귀.
- 완료 설정 행은 420px 이하 결과 화면에서만 숨기고, 데스크톱/일시정지 설정 기능은 유지.
- form control에 포커스가 있을 때 전역 비행 키가 방향키/Space를 가로채거나 레이스를 시작하지 않는다.
- 기존 비행 키/조이스틱 즉시 시작도 보존한다.

## 복구 검증

실제 WebGL context loss 전 다음 상태를 만들었다.

- `golden-knot` 선택
- 체크포인트 2
- 충돌 1
- 리스폰 1
- 부스트 활성화 1

복구 후 paused 상태에서 선택 미션과 네 통계가 동일했고, 경과 시간은 손실 처리 직전 최대 100ms 범위 안에서 보존된 뒤 정지했다. 재개 후 racing으로 정상 복귀했다.

## 테스트 우선 증거

1. `missionRules.test.ts`는 모듈 부재 RED 후 6개 미션/경계±1/복합 조건/비정상 통계/등급 병합을 구현해 46개 GREEN.
2. `missionState.test.ts`는 모듈 부재 RED 후 선택/시작/통계/중복 방지/완료/재시도/복구 복사를 구현해 9개 GREEN.
3. `records.test.ts`는 v3 기대 실패를 확인한 뒤 v2/v1 마이그레이션과 항목별 방어 파싱을 구현해 18개 GREEN.
4. `raceState.test.ts`는 미션 합성, phase guard, 마지막 관문 평가, 등급 저장, 선택 복귀의 6개 실패를 확인한 뒤 GREEN.
5. `recoveryState.test.ts`는 중첩 missionGrades 참조가 공유되는 실패를 확인한 뒤 완전한 detached snapshot으로 GREEN.
6. keyboard/HUD formatter RED 후 form control 입력 보호와 미션 진행 포맷을 GREEN.

최종 단위 결과는 24개 파일, 258개 테스트 통과다.

## 5뷰포트 브라우저 증거

각 필수 뷰포트에서 다음 두 실제 흐름을 수행했다.

1. 무충돌 미션 선택 → 시작 → 진행 HUD → QA 충돌 → 완주 실패 → 최고 등급 없음 → 같은 미션 재시도/통계 0.
2. 첫 하늘매듭 선택 → 시작 → 완주 성공/Gold → v3 local 저장 → 미션 선택 복귀/최고 Gold.

결과:

- 5뷰포트 미션 흐름 10개 passed.
- 5뷰포트 canvas nonblank/시간 변화 passed.
- touch target 44px 이상, viewport scroll 0, 기존 키보드/터치 완주 회귀 passed.
- 최종 시각 판정 `94/100`, `pass`.
- 최신 판정 `.omx/state/m8/ralph-progress.json`.
- 증거 캡처 `artifacts/browser-qa/m8/iteration2/`.

## 최종 게이트

```text
npm test                         # 24 files, 258 tests passed
npm run test:e2e                # 87 passed, 43 device-specific skips
npm run test:production         # 5 passed
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
```

## 변경 파일

- 규칙: `src/game/missions/missionRules.ts`, `missionRules.test.ts`, `missionState.ts`, `missionState.test.ts`
- 레이스/복구: `src/game/race/raceState.ts`, `raceState.test.ts`, `src/game/recovery/recoveryState.ts`, `recoveryState.test.ts`
- 저장: `src/game/persistence/records.ts`, `records.test.ts`
- 런타임: `src/game/createRenderer.ts`
- UI/입력: `src/game/ui/RaceHud.ts`, `RaceHud.test.ts`, `src/game/input/KeyboardInput.ts`, `KeyboardInput.test.ts`, `src/styles.css`
- 브라우저: `tests/e2e/missions.spec.ts`, `recovery.spec.ts`, `quality.spec.ts`
- 증거: `.omx/state/m8/ralph-progress.json`, 이 보고서

## 단순화와 남은 위험

- 렌더러/UI는 임계값을 소유하지 않고 검증된 이벤트 전달과 순수 상태 표시만 담당한다.
- 기존 phase를 유지해 비행/일시정지/복구 경로를 이중화하지 않았다.
- 미션별 별도 맵/에셋/상태 머신/백엔드를 추가하지 않았다.
- 시간/횟수 임계값은 제품 목표 2~4분을 기준으로 한 초기값이며 사람 플레이테스트에서 난이도 튜닝이 필요하다.
- 자동 QA 완주는 규칙 통합 증거이며 실제 사람이 6개 미션을 재미있고 공정하게 느끼는지는 대기 상태다.
