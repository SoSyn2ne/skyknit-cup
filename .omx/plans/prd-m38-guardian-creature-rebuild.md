# PRD: Milestone 38 수호수 아트 리빌드와 첫 하늘매듭 서막

> 승인: 2026-07-15 사용자 지시 `그리핀이랑 가오리 ... 그래픽이 용만큼은 나와야지`, `스토리도 만들어볼까?`, `한번해봐`
>
> 상태: 구현 진행 중

## 전제

1. 기존 `해뜰녘 드래곤`은 품질 기준으로 유지한다.
2. `폭풍 그리핀`과 `구름 하늘가오리`는 각각 `잿불 봉황`, `폭풍 백호`로 교체한다.
3. v9의 구 종족 선택은 v10에서 새 종족으로 일대일 이전하며 기록·고스트·미션·설정은 잃지 않는다.
4. 세 수호수의 비행 물리, 충돌 반경, 미션 판정과 기록 조건은 동일하다. 차이는 모델·재질·시각 포즈뿐이다.
5. 스토리는 현재 코인·관문·미션·고스트를 설명하는 로어 레이어다. 전투, NPC, 대화 엔진, 백엔드는 추가하지 않는다.
6. 새 런타임 의존성, Unity와 외부 출처 에셋은 추가하지 않는다.

## 목표

저품질 비드래곤 실루엣을 프로젝트 제작 Blender 원본과 GLB로 전면 교체하고, 플레이어가 준비 화면에서 세 수호수와 `첫 하늘매듭`의 서막을 이해한 뒤 선택할 수 있게 한다. 봉황은 새의 해부 구조·세 겹 깃털·불꽃 왕관·세 갈래 꼬리로, 백호는 네 다리 고양잇과 해부 구조·둥근 귀·줄무늬·등에서 돋은 거대 깃털 날개로 드래곤과 즉시 구분되어야 한다.

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

## 프로젝트 구조

- `docs/concepts/`: 봉황·백호 승인 기준 콘셉트 시트
- `assets/source/characters/`: 프로젝트 제작 Blender 원본
- `public/assets/models/characters/`: 브라우저가 선택 로드하는 GLB
- `tools/blender/build_character_assets.py`: 수호수·장식 생성
- `tools/blender/inspect_character_assets.py`: 구조·품질·예산 release gate
- `src/game/customization/characterCatalog.ts`: 닫힌 종족 ID, 설명, 모델과 시각 포즈 계약
- `src/game/persistence/records.ts`: v2~v10 읽기와 v9 종족 이전, v10 쓰기
- `src/game/world/createDragon.ts`: 공통 Rig 로드, 팔레트·장식·종족별 시각 포즈
- `src/game/ui/CharacterWorkshop.ts`: 선택 중인 수호수 설명
- `src/game/ui/StoryPrologue.ts`: 저장을 만들지 않는 접근 가능한 서막 dialog
- `src/game/ui/RaceHud.ts`: ready/paused 진입점과 비행의 메아리 문구
- `src/game/missions/missionRules.ts`: 기존 조건을 유지한 세계관 목표 문구
- `docs/WORLD_STORY_BIBLE.md`: 첫 하늘매듭 세계관의 단일 기준

## 코드 스타일

```ts
const LEGACY_CHARACTER_IDS = Object.freeze({
  'storm-griffin': 'ember-phoenix',
  'cloud-manta': 'storm-white-tiger',
} as const)

export function normalizeCharacterLoadout(value: unknown): CharacterLoadout {
  // 각 축을 독립적으로 복구하고 구 종족만 새 종족으로 명시 이전한다.
}
```

닫힌 문자열 유니언과 순수 정규화를 유지한다. UI는 native `button`·`select`와 `role="dialog"` 의미를 사용한다. Blender mesh 이름과 세 재질 역할은 런타임 계약으로 취급한다.

## 이야기와 상호작용

- `첫 하늘매듭`은 세 군도의 바람길과 새벽을 묶던 매듭이며 잿빛 폭풍에 의해 끊어졌다.
- 하늘동전은 흩어진 `햇실` 조각, 관문은 길을 고정하는 매듭점, 순차 완주는 실을 다시 잇는 의식이다.
- 반투명 고스트는 적이 아니라 앞선 비행이 햇실에 남긴 `비행의 메아리`다.
- 준비 화면과 일시정지에는 `서막 보기`가 있고, dialog는 세 문단 서막과 세 수호수 역할을 제공한다.
- 공방은 선택한 종족의 설명을 실시간으로 바꾸며 취소·적용 계약은 유지한다.
- 미션 ID·잠금·판정 수치는 유지하고 목표 문구만 매듭 복원 단계로 다시 쓴다.

## 테스트 전략

- 카탈로그와 v9→v10 이전은 Vitest RED부터 작성한다.
- 구 ID가 엄격 타입 가드에는 실패하지만 정규화에는 새 ID로 이전되는 경계를 검증한다.
- Blender inspector는 공통 Rig, 액세서리 소켓, 유한 transform/normal, vertex color, 해부 실루엣 메타데이터, 결정적 export와 전송 예산을 검사한다.
- 공방 설명, 서막 dialog의 포커스 트랩·Escape·opener 복귀를 DOM 테스트한다.
- 세 종족 선택·적용·reload·context recovery·고스트를 Playwright 다섯 뷰포트에서 검증한다.
- 시각 반복마다 콘셉트와 실제 스크린샷을 비교하고 `.omx/state/m38-guardian-creatures/ralph-progress.json`에 `visual-verdict >= 90`을 기록한다.

## 경계

- 항상: 기존 기록, 미션 등급, Top 10, 코인 기록, 고스트, 탐험 위치, BGM과 품질 설정을 보존한다.
- 항상: 발·발톱의 최저점은 착륙면 위에 두고 날개·꼬리는 미리보기 카메라에서 잘리지 않게 한다.
- 항상: 얼굴, 몸통 관절과 깃털 층에 topology를 배분하고 단순 구체 조립이나 완전 평면 날개를 최종 자산으로 사용하지 않는다.
- 먼저 문서화: 능력치 차이, 네 번째 수호수, 텍스처 파일·새 의존성, 저장 스키마 추가 확장.
- 금지: 구 ID를 기본 드래곤으로 조용히 떨어뜨리기, 기록 삭제, 외부 에셋 복사, 전투·과금·랜덤 외형.

## 성공 기준

1. 카탈로그는 `sunrise-dragon`, `ember-phoenix`, `storm-white-tiger`와 정확히 27개 조합을 제공한다.
2. v9의 `storm-griffin`은 봉황, `cloud-manta`는 백호로 이전되고 v10으로 다시 저장되며 다른 모든 진행은 동일하다.
3. 봉황은 부리·왕관·깃털 3층·발톱·세 꼬리 깃, 백호는 고양잇과 얼굴·네 다리·줄무늬·등 날개로 화면에서 즉시 읽힌다.
4. 봉황 GLB는 22,000~28,000, 백호 GLB는 24,000~30,000 triangles, 14 meshes 이하, 18 primitives 이하, 3 materials, gzip-9 600KiB 이하이며 공통 Rig·표정·소켓을 모두 가진다.
5. landing 기준 최저점은 `-0.02..0.08`, 세 형태의 미리보기 bounds는 다섯 뷰포트에서 control sheet와 겹치지 않는다.
6. 서막과 종족 설명은 마우스·키보드로 접근 가능하고 저장·레이스 단계·경과 시간을 바꾸지 않는다.
7. active+ghost는 desktop/high 100k, mobile/low 70k triangles 이내이며 기존 fps·120 draw-call 성능 gate를 통과한다.
8. test, typecheck, lint, build, 전체 E2E, production, performance, audit, 결정적 export와 시각 판정을 통과한다.

## 작업

- [x] 콘셉트 시트와 현재 품질 실패 원인 고정
- [ ] v10 카탈로그·구 ID 이전 RED→GREEN
- [ ] 잿불 봉황 Blender/GLB와 종족별 시각 포즈
- [ ] 폭풍 백호 Blender/GLB와 종족별 시각 포즈
- [ ] 서막·공방 설명·미션/고스트 문구
- [ ] 5뷰포트 시각·성능·전체 회귀와 보고서

## 열린 질문

없음. 첫 구현은 세 수호수와 짧은 서막에 제한하고 이후 지역별 챕터·추가 수호수는 플레이테스트 결과로 결정한다.
