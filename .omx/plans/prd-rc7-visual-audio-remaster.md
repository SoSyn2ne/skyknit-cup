# RC7 비주얼·오디오 리마스터 PRD

## Objective

RC6의 레이스, 미션, 탐험, 하늘동전 규칙을 그대로 보존하면서 화면을 임시 로우폴리 프로토타입이 아니라 완성도 있는 해뜰녘 공중 축제로 보이게 한다. 기존 Blender→GLB→Three.js 파이프라인을 이용해 드래곤과 세 지역의 실루엣, 구조 밀도, PBR 재질, 조명, 대기와 비행 VFX를 개선하고, 사용자 제공 음악 `Sovereign of the Sunrise Skies.m4a`를 탐험 전용 BGM으로 통합한다.

## Player-facing result

- 준비 화면과 비행 카메라에서 주홍 드래곤의 얼굴, 어깨, 날개막, 다리와 꼬리 리듬이 작은 화면에서도 구분된다.
- 축제 중심섬, 바람 협곡, 구름 유적지는 회색 기본 도형이 아니라 서로 다른 재질, 수직 리듬, 가장자리 디테일과 랜드마크로 즉시 구분된다.
- 하늘에는 태양 방향, 색온도, 안개, 구름 층과 원거리 대비 감쇠가 생겨 구조물의 깊이와 비행 속도가 읽힌다.
- 탐험을 시작하면 사용자 동작 이후 BGM이 이어 재생되고, 레이스·탭 숨김·오류 상태에서는 멈추며 다시 탐험하면 같은 위치에서 이어진다.
- 플레이어는 기존 마스터 음소거로 BGM과 효과음을 함께 끄고, 0~100% BGM 전용 볼륨을 별도로 조절할 수 있다.

## Approved assumptions

1. Vite, vanilla TypeScript, Three.js와 기존 Blender 4.5.10 LTS 파이프라인을 유지한다. Unity나 새 런타임 의존성을 도입하지 않는다.
2. 드래곤 1종, 세 지역, 레이스 1개, 미션 6종, 지역별 동전 10개와 모든 좌표·상태 계약을 바꾸지 않는다.
3. 사용자 제공 AAC/M4A 파일은 프로젝트 사용 권한이 있는 원본으로 간주하고 출처를 `user-provided/project-authorized`로 기록한다.
4. BGM은 탐험 모드에서만 재생한다. 지도, 착륙과 하늘동전 도전은 탐험의 일부이므로 음악을 유지한다.
5. 레이스 진입, 탭 숨김, WebGL 복구 화면과 dispose에서는 BGM을 pause하고 탐험 복귀 시 현재 재생 위치에서 재개한다.
6. 기존 음소거는 효과음과 BGM 전체의 마스터 스위치로 유지한다. `musicVolume`은 BGM에만 적용하고 기본값은 35%이며, 음소거 해제 시 저장된 값을 복원한다.
7. 오디오 재생·디코딩·자동재생 거부는 게임 진행을 막지 않으며 한국어 UI에 기술 오류를 노출하지 않는다.
8. 유료·외부 모델과 텍스처를 추가하지 않는다. geometry, vertex color, 프로젝트 제작 재질과 기존 자체 에셋만 사용한다.
9. 사람 플레이테스트 결과를 자동화가 대신했다고 기록하지 않는다.

## Commands

- Blender world build: `"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python tools/blender/build_world_art.py`
- Blender dragon build: `"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python tools/blender/export_dragon_glb.py`
- GLB inspection: existing world and dragon inspection scripts
- Unit: `npm test`
- Type: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- E2E: `npm run test:e2e`
- Performance: `npm run test:performance`
- Production: `npm run test:production`
- Security: `npm audit --audit-level=high`

## Project structure

- `assets/source/audio/sovereign-of-the-sunrise-skies.m4a`: 변경하지 않는 사용자 제공 원본
- `tools/audio/build-bgm.mjs`: 원본의 4초 tail/head crossfade 루프 마스터 재생성
- `public/assets/audio/sovereign-of-the-sunrise-skies-loop.ogg`: Chromium 우선 스트리밍 BGM
- `public/assets/audio/sovereign-of-the-sunrise-skies-loop.m4a`: AAC fallback 스트리밍 BGM
- `public/assets/audio/README.md`: 오디오 출처, 코덱, 길이와 사용 계약
- `src/game/audio/GameAudio.ts`: 효과음, BGM 수명주기, 음소거와 BGM 전용 볼륨
- `src/game/persistence/records.ts`: v6 오디오 볼륨 저장과 v5 마이그레이션
- `src/game/ui/RaceHud.ts`: 준비/일시정지 음소거와 볼륨 UI
- `src/game/createRenderer.ts`: 게임 모드·가시성·복구 상태와 오디오 연결
- `tools/blender/build_world_art.py`: 세 지역 high/low RC7 재생성
- `tools/blender/export_dragon_glb.py`: 드래곤 RC7 실루엣·재질 출력
- `src/game/world/createWorld.ts`: 하늘, 조명, 안개, 구름과 비행 VFX
- `src/game/world/createOpenWorld.ts`: 기존 스트리밍/LOD를 보존한 RC7 GLB 로딩
- `tests/e2e/audio.spec.ts`: 실제 브라우저 오디오 제어와 저장
- `tests/e2e/final-visual.spec.ts`: 다섯 뷰포트 시각·픽셀·콘솔 검증

## Code style

```ts
audio.setExplorationActive(mode === 'exploration' && pageVisible)
audio.setMusicVolume(settings.musicVolume)
audio.setMuted(settings.muted)
```

오디오 상태 판단은 DOM과 Three.js 객체를 읽지 않는 명시적 메서드로 전달한다. GLB 좌표와 게임 규칙은 계속 TypeScript 데이터가 권위자이며 시각 에셋은 이를 변경하지 않는다.

## Milestone slices

1. M26: RC7 계약, 현재 스크린샷·GLB·오디오·성능 기준선
2. M27: BGM 자산, GameAudio 수명주기, v6 저장, 음소거/볼륨 UI와 E2E
3. M28: 드래곤과 세 지역 Blender high/low GLB 리마스터
4. M29: Three.js 조명, 대기, 그림자, VFX, LOD와 성능 튜닝
5. M30: 다섯 뷰포트 통합 QA, 프로덕션 검증과 사람 플레이테스트 인계

## Boundaries

- Always: 기존 게임 규칙/좌표/저장 데이터 보존, 사용자 동작 후 오디오 시작, 각 시각 반복의 실제 브라우저 증거와 성능 측정
- Ask first: 유료·외부 에셋, 새 의존성, 코스/지역/드래곤 수 변경, 10MiB 예산 변경
- Never: Unity 이전, 백엔드·계정·멀티플레이·전투·NPC·퀘스트, 저작권 불명 에셋, 프로덕션 QA 훅

## Success criteria

- 기존 RC6 298개 단위 테스트와 전체 E2E 흐름이 회귀 없이 통과한다.
- 탐험 BGM이 사용자 동작 후 loop되고 모드·가시성·mute·volume·dispose 계약을 지킨다.
- v5 저장은 기록·미션·탐험·동전 데이터를 잃지 않고 v6의 `musicVolume=0.35`로 마이그레이션한다.
- 세 지역과 드래곤 GLB가 필수 노드, high/low, material/triangle/primitive 예산과 프로젝트 출처 메타데이터를 통과한다.
- 모든 필수 뷰포트에서 드래곤과 다음 목표, 지역 랜드마크, HUD가 동시에 읽히고 `visual-verdict` 90점 이상이다.
- canvas nonblank/시간 변화, console/page/unhandled/network 오류 0을 유지한다.
- desktop/high 중앙값 55fps·최저 50fps, mobile/low 30fps, high 120 draw calls 이하, 전체 gzip 10MiB 미만이다.
- 최종 상태는 실기기·사람 플레이테스트 대기로 남긴다.

## Open questions

없음. 사용자의 72시간 Goal Mode 승인과 위 가정으로 자율 구현한다.
