# Milestone 32 오픈월드 수직 슬라이스 PRD

## Assumptions

1. 기존 Three.js, 드래곤 1종, 레이스 코스 1개와 6개 로컬 미션을 그대로 유지한다.
2. 이번 수직 슬라이스는 `festival-hub` 한 지역만 완성도 있게 확장하고 다른 두 지역의 좌표와 기능은 바꾸지 않는다.
3. “미션”은 기존 레이스 미션 6종을 의미한다. NPC, 대화, 스토리 퀘스트 엔진은 추가하지 않는다.
4. 첫 탐험 세션은 랜드마크 발견, 상승기류 순회, 비밀 장소, 동전 기록전, 선택 레이스 미션을 합쳐 10~15분을 목표로 한다.
5. 외부 에셋·텍스처·새 런타임 의존성 없이 Blender 4.5.10 LTS와 기존 project-authored PBR/vertex-color 파이프라인을 사용한다.

## Objective

축제 중심섬을 조잡한 기본 도형 배경이 아니라 실제로 탐색하고 기록을 갱신할 수 있는 오픈월드 첫 지역으로 완성한다. 기존 레이스와 오디오는 보존하면서, 다섯 랜드마크와 환경 상호작용이 하나의 명확한 플레이 여정으로 이어져야 한다.

## Player-facing result

- `Dawnwing Airfield`, `Sunweave Spire`, `Crown Race Arch`, `Wind Loom`, `Whispering Grotto`의 다섯 장소가 서로 다른 실루엣으로 읽힌다.
- 중심 비행장, 탑 전망대, 비밀 동굴 선반의 세 착륙 지점을 이용할 수 있다.
- 세 상승기류가 실제 비행 위치에 힘을 더하고 시각·음향 피드백을 낸다.
- 구조물은 단순 충돌 프록시로 관통을 막되 착륙장과 동전 비행선을 막지 않는다.
- 다섯 장소와 세 상승기류 발견이 로컬 저장되며 지도에서 진행을 확인한다.
- 기존 10개 동전 기록전, 2~4분 레이스와 6개 선택 미션은 축제 아치에서 그대로 이어진다.
- `Sovereign of the Sunrise Skies` BGM 위에 낮은 바람층, 상승기류와 발견 큐를 얹되 자동재생·음소거 계약을 유지한다.

## Tech stack and commands

- Runtime: Vite vanilla TypeScript, Three.js `0.185.1`, 60Hz fixed step
- Asset pipeline: Blender `4.5.10 LTS` background Python → GLB high/low → `GLTFLoader`
- Test: Vitest + Playwright Chromium

```text
Blender build: "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python tools/blender/build_world_art.py
World inspect: "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python tools/blender/inspect_world_glb.py
Unit: npm test
Typecheck: npm run typecheck
Lint: npm run lint
Build: npm run build
E2E: npm run test:e2e
Performance: npm run test:performance
Production: npm run test:production
Security: npm audit --audit-level=high
```

## Project structure

- `tools/blender/build_world_art.py`: 다섯 랜드마크, 세 착륙장과 high/low 지오메트리
- `tools/blender/inspect_world_glb.py`: 의미 노드, 원점, 재질, LOD와 예산 검사
- `src/game/world/festivalHubActivities.ts`: 랜드마크·상승기류·착륙·비콘·충돌 데이터와 순수 판정
- `src/game/exploration/explorationFlight.ts`: 선택적 바람 속도 적용
- `src/game/world/createOpenWorldActivities.ts`: 저드로우콜 상승기류 시각
- `src/game/persistence/records.ts`: v7 랜드마크/상승기류 발견 저장
- `src/game/audio/GameAudio.ts`: 탐험 환경음과 발견/상승기류 큐
- `src/game/ui/ExplorationHud.ts`: 한 줄 여정 목표와 지도 진행
- `src/game/createRenderer.ts`: fixed-step 통합, 충돌·저장·오디오·QA 훅

## Code style

```ts
const activityStep = stepFestivalDiscovery(
  progress,
  previousPosition,
  nextPosition,
)
const wind = sampleFestivalWind(nextPosition)
```

순수 월드 규칙은 Three.js 객체를 참조하지 않고 readonly 입력과 새 상태를 반환한다. 렌더러는 그 결과를 시각·오디오·저장에 연결하기만 한다.

## Asset and performance contract

- 기존 `RegionRoot`, `LandingPad`, `FestivalAirfield`, `FestivalTower`, `FestivalFlags`, `RaceArch` 노드를 보존한다.
- 신규 `WindLoom`, `SecretGrotto`, `TowerLandingPad`, `GrottoLandingPad` 의미 노드를 high/low 모두 제공한다.
- 독립 장식 메시를 줄이고 의미 그룹으로 병합해 LOD당 12 primitives, 8 materials 이하를 유지한다.
- festival high 60,000 triangles, low 25,000 triangles, 활성 high 장면 120 draw calls 이하.
- desktop/high 55/50fps, mobile/low 30fps, 전체 gzip 10MiB 이하.

## Testing strategy

- Unit: 데이터 계약, 선분 발견, 상승기류 벡터, 바람 비행, 충돌, v7 저장, 오디오 수명주기
- Blender: 모든 6개 GLB와 축제 신규 의미 노드/LOD/재질/normal 검사
- Browser: 키보드와 최소 터치 한 종류의 축제 여정, reload/recovery, 다중 착륙, 비콘 레이스 진입
- Visual: RC7 축제 스크린샷을 기준선으로 5뷰포트 비교, nonblank/time-changing canvas, `visual-verdict >= 90`
- Performance: race/explore × desktop/mobile 30초, draw-call·triangle·gzip 기록
- Soak: 10분 탐험 세션 동안 오류·메모리 증가·오디오 실패 0

## Boundaries

- Always: 기존 레이스/미션/동전/BGM/저장 기록을 보존하고 모든 변경을 TDD와 실제 브라우저로 검증한다.
- Ask first: 외부·유료 에셋, 새 의존성, 엔진 이전, 기존 코스/드래곤 교체.
- Never: Unity 이전, 백엔드, 계정, NPC/대화, 전투, 상점, 외부 저작물 복제.

## Success criteria

- 다섯 랜드마크와 세 착륙장이 high/low GLB 및 게임 카메라에서 구분된다.
- 세 상승기류가 비행에 측정 가능한 영향을 주고 한 번씩 발견 기록을 남긴다.
- 탐험 중 구조물 관통을 막고, 동전 10개와 모든 착륙장에는 안전한 접근선이 남는다.
- 비밀 동굴 발견, 랜드마크/상승기류 진행, 동전 기록과 기존 미션/레이스 기록이 reload와 context recovery 뒤 유지된다.
- BGM은 끊기지 않고 환경음은 mute/hidden/dispose와 자동재생 정책을 따른다.
- 다섯 뷰포트, 전체 자동 게이트, 30초 성능과 10분 soak가 통과한다.

## Open questions

없음. 사용자가 Milestone 32 Goal Mode와 Three.js 유지 경계를 명시적으로 승인했다.
