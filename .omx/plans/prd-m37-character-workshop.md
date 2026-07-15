# PRD: Milestone 37 비행 생명체 작업실

> 승인: 2026-07-15 사용자 지시 `꼭 용이 아니어도 여러가지로 커스텀`
>
> 상태: 구현 승인 / 코드 게이트 열림

## 전제

1. 첫 수직 슬라이스는 형태 3종, 팔레트 3종, 장식 3종으로 제한한다.
2. 형태는 색만 다른 복제본이 아니라 프로젝트 자체 제작 Blender GLB 세 개다.
3. 모든 조합은 외형 전용이며 비행·충돌·미션·기록 능력치는 동일하다.
4. 기존 고스트 저장에 캐릭터 데이터를 합성하지 않는다.
5. 새 의존성, Unity, 백엔드와 계정은 추가하지 않는다.

## 목표

플레이어가 비행 시작 전 또는 일시정지 중 `캐릭터 공방`을 열어 드래곤·그리핀·하늘가오리, 세 팔레트와 두 장식을 조합하고 실제 3D 장면에서 확인한 뒤 저장한다. 선택은 새로고침과 WebGL context recovery 뒤에도 유지되며 기존 v8 진행과 기록을 모두 보존한다.

## 기술 스택과 명령

- Vite vanilla TypeScript, Three.js, Vitest, Playwright, Blender 4.5.10 LTS
- 단위: `npm test`
- 타입: `npm run typecheck`
- 린트: `npm run lint`
- 빌드: `npm run build`
- 브라우저: `npm run test:e2e`
- 프로덕션: `npm run test:production`
- 성능: `npm run test:performance`
- Blender: `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe --background --python <script> -- <args>`

## 구조

- `src/game/customization/characterCatalog.ts`: 닫힌 ID, 표시명, 모델·팔레트·장식 계약과 정규화
- `src/game/persistence/records.ts`: v9 읽기·쓰기와 v8 이하 기본 보충
- `src/game/race/raceState.ts`: 적용된 외형을 영구 상태로 소유
- `src/game/world/createDragon.ts`: 레거시 이름을 유지하는 공통 creature GLB 로더·Rig·재질·장식
- `src/game/world/createFlightSandbox.ts`: 최신 요청만 반영하는 transactional visual swap
- `src/game/ui/CharacterWorkshop.ts`: 독립 dialog, 초안·적용·취소·포커스 트랩
- `src/game/ui/RaceHud.ts`: ready/paused의 공방 진입점만 제공
- `tools/blender/`: 캐릭터·장식 생성, export, 공통 inspector
- `public/assets/models/characters/`: 그리핀·가오리와 장식 GLB

## 코드 스타일

```ts
export interface CharacterLoadout {
  readonly characterId: CharacterId
  readonly paletteId: CharacterPaletteId
  readonly accessoryId: CharacterAccessoryId
}

export const DEFAULT_CHARACTER_LOADOUT: CharacterLoadout = Object.freeze({
  characterId: 'sunrise-dragon',
  paletteId: 'sunrise',
  accessoryId: 'none',
})
```

닫힌 문자열 유니언과 순수 정규화 함수를 사용한다. DOM은 native `button`·`select`·`dialog` 의미를 우선하고, 시각 교체는 새 자원이 완전히 준비된 뒤 기존 자원을 해제한다.

## 상호작용

- ready와 paused에서만 44px `꾸미기` 진입점을 보여 준다.
- 공방은 기존 HUD와 중첩된 modal을 만들지 않고 별도 `aria-modal` dialog로 연다.
- 형태·색상·장식 변경은 초안이며 3D 미리보기만 즉시 바꾼다.
- `적용`은 초안을 영구 상태와 v9 저장에 반영하고 닫는다.
- `돌아가기` 또는 공방 내부 `Esc`는 적용된 외형을 복구하고 닫는다.
- paused에서 열고 닫아도 elapsed와 시도 상태는 그대로 멈춰 있고 원래 pause로 복귀한다.
- 로드 실패는 기본 드래곤 fallback과 비차단 안내를 사용하며 게임을 막지 않는다.

## 테스트 전략

- 순수 카탈로그·정규화·저장·레이스 상태는 Vitest로 RED부터 고정한다.
- GLB Rig, 재질 역할, 장식 소켓, 예산과 결정적 export를 Blender inspector로 검증한다.
- HUD/dialog의 label, focus, draft/apply/cancel을 DOM 단위 테스트한다.
- 선택·미리보기·적용·reload·pause·context recovery를 Playwright 다섯 뷰포트로 검증한다.
- 모든 시각 반복은 실제 스크린샷, nonblank/시간 변화 픽셀과 `visual-verdict >= 90`을 요구한다.

## 경계

- 항상: 기존 60Hz 비행·고정 충돌 반경·코스·미션·기록을 보존하고 선택된 자원만 로드한다.
- 항상: 플레이어·고스트·장식 geometry/material/texture를 정확히 한 번 해제한다.
- 먼저 문서화: ID 삭제·이름 변경, 저장 스키마 추가 변경, 능력치 차이, 네 번째 형태 추가.
- 금지: 캐릭터별 속도/충돌 이점, 유료·랜덤 외형, 외부 출처 불명 에셋, Three.js 기본 도형을 최종 비드래곤 모델로 사용.

## 성공 기준

1. 세 형태가 기본/준비/비행 카메라에서 서로 다른 실루엣으로 읽힌다.
2. 27개 조합이 모두 유효하며 잘못된 저장 ID는 기본값으로 정규화된다.
3. 초안 취소는 저장과 영구 상태를 바꾸지 않고 적용만 v9에 남는다.
4. v1~v8의 모든 기존 상태를 보존하고 v10 이상은 안전하게 거부·복구한다.
5. 빠른 선택 전환과 GLB 실패에서도 빈 프레임, 오래된 응답 덮어쓰기와 자원 누수가 없다.
6. 다섯 뷰포트에서 공방, 44px, 포커스, safe area, 고정 적용 동작과 3D 미리보기가 통과한다.
7. test, typecheck, lint, build, 전체 E2E, production, performance, gzip와 시각 판정을 통과한다.

## 작업

- [ ] 카탈로그·v9·레이스 영구 상태 RED→GREEN
- [ ] Blender 그리핀·가오리·고글·리본 생성/export/inspect
- [ ] 공통 GLB tint/accessory/transactional swap RED→GREEN
- [ ] CharacterWorkshop와 ready/paused 진입점 RED→GREEN
- [ ] 5뷰포트 E2E·시각·성능·프로덕션 검증
- [ ] 독립 리뷰, 보고서, Lore 커밋과 실기기 인계

## 열린 질문

없음. 첫 수직 슬라이스 이후 추가 종족·세부 파츠·이름 짓기는 사람 플레이 결과로 별도 마일스톤에서 결정한다.
