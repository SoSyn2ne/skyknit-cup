# M39 구현 순서 — 태양의 심장 · 용암 군도

## 원칙

- 한 번에 하나의 검증 가능한 수직 슬라이스만 연다.
- 각 행동 변경은 실패 테스트→최소 구현→회귀 검증 순서로 진행한다.
- 기존 첫 하늘매듭 좌표·기록·물리와 v10 데이터를 먼저 보호한다.
- 새 의존성 없이 기존 Three.js, Vitest, Playwright와 Blender 파이프라인을 재사용한다.

## Slice 1 — 계약과 저장 경계

1. `OpenWorldRegionId`, theme, region catalog에 용암 군도를 추가한다.
2. `MissionId`, `MissionDefinition.courseId`, `RaceCourseId`와 코스 카탈로그를 도입한다.
3. 기존 `SKYKNOT_COURSE`를 `skyknot` 정의로 감싸고 좌표가 변하지 않는 테스트를 고정한다.
4. `heart-of-sun`과 4 checkpoint 회색상자 코스를 추가한다.
5. v11 migration을 추가하고 완전한 v10 fixture 보존 테스트를 통과한다.

검증: region/course/mission/records 단위 테스트, typecheck.

## Slice 2 — 코스 인식 레이스·기록·고스트

1. RaceState가 활성 course와 checkpoint count를 소유하게 한다.
2. segment/respawn/sandbox gate를 활성 코스로 전환한다.
3. 용암 미션 선택 시 spawn/course/gates/ghost를 원자적으로 교체한다.
4. `skyknot`만 legacy overall record를 갱신하도록 finish ownership을 분리한다.
5. 용암은 mission board/mission ghost만 사용하고 global fallback을 차단한다.
6. pause, retry, mission change, workshop와 context recovery에 course를 포함한다.

검증: raceState/mission/ghost/recovery 단위·통합 테스트와 회색상자 브라우저 완주.

## Slice 3 — 지역·수집·탐험 활동

1. 지역 중심·착륙장·비콘·열기류·collider·landmark 순수 데이터를 만든다.
2. 냉각 수정 10개 좌표와 `cooling-crystal` visual kind를 추가한다.
3. coin visual을 gold/crystal 인스턴스 풀로 확장한다.
4. 탐험 collision/wind/discovery를 region registry 기반으로 일반화한다.
5. 지도, destination, discovery, 지역 기록 UI와 QA 이동 훅을 연결한다.

검증: 순수 단위, region stream E2E, coin E2E, reload.

## Slice 4 — Blender high/low 자산

1. 별도 화산 builder와 source `.blend`를 만든다.
2. 의미 노드·high/low 공통 앵커를 생성한다.
3. inspector를 4지역 계약으로 확장한다.
4. GLB를 내보내고 triangle/material/primitive/gzip/결정성 검사를 통과한다.
5. runtime load, LOD swap, unload/dispose를 검증한다.

검증: asset scripts, loader tests, browser nonblank/pixel change.

## Slice 5 — 위험·VFX·오디오

1. 결정적 `volcanicHazards` 순수 state와 telegraph/collision sampling을 구현한다.
2. active hazard를 기존 collision feedback/stat path에 연결한다.
3. lava shader, ash Points, rock/warning/wave instancing과 thermal visuals를 추가한다.
4. quality/reduced-motion/loaded-region/visibility/dispose 상태를 연결한다.
5. volcanic ambience intensity, warning, seal, escape cues를 GameAudio에 추가한다.
6. guardian update loop에 시각 전용 환경 반응을 추가한다.

검증: hazard determinism/telegraph/audio lifecycle/fairness 단위 테스트, performance smoke.

## Slice 6 — 미션 UX와 스토리

1. 3 seals + escape 진행 문구, 제한 시간과 조건 상태를 RaceHud에 표시한다.
2. ready/Esc selector의 7번째 미션, 잠금 사유, 다음 미션/최종 챕터 copy를 연결한다.
3. ExplorationHud에 용암 beacon·지역 기록·냉각 수정 상태를 연결한다.
4. 태양의 심장 챕터 copy를 기존 스토리 dialog 흐름에 추가한다.
5. 5 viewport safe-area, focus, 44px, reduced-motion을 마감한다.

검증: HUD/UI 단위, accessibility/responsive E2E, screenshot canvas probe와 visual verdict.

## Slice 7 — 최종 게이트

1. 전체 unit/typecheck/lint/build.
2. 전체 E2E와 production 검사.
3. desktop/high 및 mobile/low 화산 탐험·미션 30초 성능 측정.
4. 10분 stream/LOD/retry/pause/guardian swap soak.
5. QA 보고서와 사람 플레이테스트 handoff 작성.
6. 상태 문서를 완료로 갱신하고 로컬 Lore 커밋을 만든다.

푸시와 원격 변경은 하지 않는다.
