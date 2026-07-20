# Milestone 39 태양의 심장 · 용암 군도 자동 QA 기록

> 상태: **M39 / 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 게이트 실행일: 2026-07-16 · 재검증·기록일: 2026-07-20
>
> 브랜치: `codex/m39-volcanic-archipelago`

## 결론

기존 세 지역 오픈월드에 네 번째 지역 `태양의 심장 · 용암 군도`(`volcanic-archipelago`)와 두 번째 기록 코스를 추가했다. 플레이어는 화산 분화구, 흑요석 부유섬, 냉각 유적과 끊어진 다리 사이에서 청록 냉각 수정 10개(전체 수집물 40개)를 모으고, `황금 하늘매듭` 브론즈 뒤에 열리는 미션 `태양의 심장`(`heart-of-sun`)에서 냉각 봉인 1→2→3을 순서대로 깨운 뒤 분화 경고 속에서 탈출한다.

용암 파도·낙석·화산재·열기류는 60Hz 고정 스텝과 고정 seed로 결정적으로 계산되고, 낙석은 최소 1.5초·용암 파도는 최소 2초 전에 색·형태·음향으로 예고된 뒤에만 충돌한다. `heart-of-sun` 완주는 해당 미션 기록판·고스트·등급만 갱신하며 legacy `bestTimeMs`, 전체 레이스 Top 10, 전체 레이스 고스트와 축제 여정은 `skyknot` 코스만 소유한다. v10 저장 전체는 v11로 무손실 이전되고 알 수 없는 ID·범위 밖 값은 방어적 기본값으로 정규화되며 가짜 용암 진행을 합성하지 않는다.

## 최종 자동 게이트

| 게이트 | 결과 |
| --- | --- |
| 단위 테스트 | 53 files, 609 tests passed (2026-07-20 재실행) |
| 타입 검사 | `npm run typecheck` passed (2026-07-20 재실행) |
| 린트 | `npm run lint` passed (2026-07-20 재실행) |
| 빌드 | passed; JS 804.60kB raw / 214.18kB gzip, CSS 41.00kB raw / 6.55kB gzip |
| 개발 E2E | 179 passed, 0 failed (2026-07-16) |
| 프로덕션 5뷰포트 | 5 passed, console/page/network 오류 0 |
| M39 soak | 60 cycles / 12.2분, 수호수 3종·품질 티어 순환에서 geometry·listener·기록 단조 증가 없음 |
| 30초 성능 | 기본 4개 프로필과 화산 4개 프로필 모두 예산 통과 |
| Blender 검사 | high/low 모두 `errors: []`, asset_version 0.9, 의미 노드 19종 확인 |
| 독립 시각 판정 | 93/100 pass (기준 90) |
| 보안 감사 | `npm audit --audit-level=high`: 0 vulnerabilities (2026-07-20 재실행) |
| 배포 크기 | 23 files, 22,972,404 raw bytes / 9,122,415 gzip-9 bytes (8.700MiB < 10MiB) |
| 프로덕션 QA 훅 | M39 geometry-ledger 훅은 opt-in이며 일반 프로덕션 번들에서 tree-shake됨 |

빌드의 500kB raw JavaScript 경고는 남지만 gzip JavaScript는 214.18kB이고 전체 전송·FPS·draw-call 예산을 모두 통과했다.

## 지역 자산

| 자산 | triangles | 목표 | render meshes | primitives | materials | bytes |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| volcanic-archipelago-high.glb | 33,548 | 30k~40k | 11 | 11 | 6 | 2,574,668 |
| volcanic-archipelago-low.glb | 10,596 | 8k~12k | — | — | — | 833,040 |

- 두 LOD 모두 프로젝트 제작 Blender 4.5.10 LTS 원본에서 `tools/blender/build_volcanic_archipelago.py`로 결정적으로 생성했고 `project-authored` 라이선스 메타데이터를 가진다.
- 외부 텍스처 없이 vertex color 재질 6종(`M_Volcanic_Basalt/Cooling/Ember/Lava/Obsidian/Ruin`)을 사용한다.
- high/low 공통 의미 노드: `RegionRoot`, `LandingPad`, `VolcanoCaldera`, `ObsidianIslands`, `CoolingRuins`, `BrokenBridge`, `LavaSurface`, `ExpeditionBeacon`, `CoolingSeal_1..3`, `EscapeGate`, `Thermal_1..3`, `RockSpawner_1..3`, `LavaWaveOrigin`.
- `LavaSurface`는 시간 uniform 하나를 가진 텍스처 없는 `ShaderMaterial`로 흐르고, 용암 파도는 pooled plane 세그먼트로 활성 화산 VFX draw call 예산 안에서 렌더된다.
- 기존 세 지역 GLB(asset_version 0.7)는 변경하지 않았다.

검사 원본은 `artifacts/world-m39-hotspot/world-glb-report-volcanic-archipelago.json`에 있다.

## 코스·기록 계약

- `heart-of-sun`은 기존 여섯 미션 뒤에 추가되고 `golden-knot` 브론즈로 해금된다. 체크포인트는 `CoolingSeal_1→2→3→EscapeGate` 순서만 인정하며 건너뛰기·역통과·중복 통과로 진행되지 않는다.
- 등급은 누적 조건이다. Bronze `75초 이내 완주`, Silver `+60초·충돌 2회 이하·리스폰 1회 이하`, Gold `+45초·무충돌·무리스폰·돌풍 2회 이상`. 세 수호수는 같은 비행 물리·충돌 반경·등급 조건을 사용한다.
- 용암 코스는 전체 레이스 고스트 fallback을 쓰지 않고 `missionTop10.heart-of-sun`의 1위 고스트만 사용한다. 별도 course Top 10을 중복 저장하지 않는다.
- 지역 냉각 수정 10개는 기존 순서형 선분 수집, 첫 수집 타이머, pause/map/landing 정지, 지역 이탈 취소 규칙을 재사용하고 지역 best·Top 10·1위 고스트를 기존 동전 계약으로 기록한다.

## 저장 v11

- v10의 legacy best, mute, BGM volume, quality, 수호수 loadout, 모든 미션 등급, 세 지역 coin best, 전체/coin/mission Top 10, race/coin/mission 고스트와 탐험 상태 전체가 무손실 이전된다.
- 마이그레이션은 용암 등급·기록·고스트·발견을 합성하지 않으며 알 수 없는 지역·미션·위치와 손상 데이터는 기존 방어적 기본값으로 정규화된다.
- ready/paused의 미션 선택·작업실·스토리, WebGL context recovery와 기존 pause 흐름이 v11에서 그대로 동작한다.

## 시각·반응형 결과

필수 뷰포트는 `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`이다. 다섯 화면 모두에서 필수 조작이 viewport 안에 있고 문서 overflow가 없으며, 캔버스는 비어 있지 않고 시간에 따라 변했다. 최소 `320x568`에서는 긴 지역 이름만 의도적으로 말줄임된다.

활성 미션 캡처는 용암 파도 경고, pooled plane 세그먼트 40개, 미션 목표 HUD, 냉각 봉인 카운터와 부스트 UI가 겹침 없이 함께 렌더되는 것을 확인했다. `visual-verdict` 최종 결과는 93/100 pass다. 근거 상태는 `.omx/state/m39-volcanic-archipelago/ralph-progress.json`, 스크린샷은 `artifacts/browser-qa/m39-latest/`에 있다.

## 최종 30초 성능

| 프로필 | median/min fps | draw calls | triangles | fixed steps |
| --- | ---: | ---: | ---: | ---: |
| 기본 레이스 desktop/high | 60/60 | 62 | 68,640 | 1,803 |
| 기본 레이스 mobile/low | 60/60 | 37 | 36,956 | 1,803 |
| 기본 탐험 desktop/high | 60/60 | 67 | 87,180 | 1,802 |
| 기본 탐험 mobile/low | 60/60 | 32 | 34,996 | 1,802 |
| 화산 탐험 desktop/high | 60/60 | 45 | 55,492 | 1,803 |
| 화산 탐험 mobile/low | 60/60 | 27 | 26,080 | 1,802 |
| 화산 미션 desktop/high | 60/51 | 62 | 79,856 | 1,804 |
| 화산 미션 mobile/low | 60/60 | 39 | 38,612 | 1,803 |

desktop/high 중앙값 55fps·1초 하한 50fps, mobile/low 중앙값 30fps와 high 120 draw-call 예산을 모두 통과했다. 원본 측정은 `artifacts/browser-qa/m39-perf-repro/performance-30s.json`에 있다.

## 변경 영역과 단순화

- 위험 상태는 렌더와 분리된 순수 규칙으로 미션 경과 시간과 고정 seed에서만 파생되고 pause·탭 숨김·context recovery 중 진행하지 않는다.
- 환경 힘은 기존 `windVelocity` seam에 합성하며 수호수 종류를 입력으로 받지 않는다. 봉황·백호·드래곤의 화산 반응은 재질·입자·pose·음향만 바꾼다.
- 용암 앰비언스·위험 예고·봉인·탈출 음향은 기존 unlock·mute·BGM volume·visibility·dispose 수명주기 계약을 따르고 실패를 비차단 처리한다.
- 스트리밍은 기존 420/500 units 로드/언로드와 220/260 units high LOD 히스테리시스를 재사용하고, 화산 게임플레이는 지역이 로드된 동안에만 활성화된다.
- M39 soak의 geometry-ledger 훅은 opt-in QA 전용이며 일반 프로덕션 번들에 포함되지 않는다.
- 새 라이브러리, Unity, 별도 퀘스트 엔진, 전투, 서버 순위를 추가하지 않았다.

## 사람만 확인할 수 있는 남은 항목

- 실제 iOS/Android 브라우저에서 10분 soak, 발열과 프레임 저하 확인
- 낙석 1.5초·용암 파도 2초 예고가 실제 플레이 감각에서 공정하게 느껴지는지 판단
- 골드 조건(45초·무충돌·무리스폰·돌풍 2회)의 난이도 체감과 재도전 의욕 확인
- 용암 앰비언스·경고음이 기존 BGM과 자연스럽게 섞이는지 실제 청취 확인
- 세 수호수의 화산 환경 반응(온기 발광, 청록 깃, 비늘 shimmer)이 구분되고 매력적인지 선호도 확인

> **M39 / 태양의 심장 · 용암 군도 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
