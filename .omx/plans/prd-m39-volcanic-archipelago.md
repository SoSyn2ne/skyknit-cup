# M39 PRD — 태양의 심장 · 용암 군도

## 1. 제품 의도

첫 하늘매듭을 복원한 플레이어에게 기존 Three.js 오픈월드 안에서 시각적으로 강한 네 번째 지역과 45~75초의 집중 도전을 제공한다. 플레이어는 흑요석 군도를 탐험해 냉각 수정 10개를 모으고, 기록 미션에서 세 냉각 봉인을 순서대로 깨운 뒤 분화구를 탈출한다.

Milestone 39는 Unity 이전, 별도 퀘스트 엔진, 전투나 서버 순위를 도입하지 않는다. 기존 비행·미션·기록·고스트·작업실·pause·저장 구조를 코스 인식형으로 확장하는 하나의 수직 슬라이스다.

## 2. 플레이어 경험

1. 탐험 지도에서 `태양의 심장 · 용암 군도`를 목적지로 선택한다.
2. 지역에 접근하면 low→high LOD로 화산, 흑요석 섬, 냉각 유적, 끊어진 다리와 흐르는 용암이 나타난다.
3. 청록 냉각 수정 10개가 숨은 다리 아래·유적·분화구 가장자리로 이어지는 지역 기록 코스를 만든다.
4. `golden-knot` 브론즈를 달성한 뒤 지역 비콘 또는 기존 미션 선택기에서 `태양의 심장`을 시작한다.
5. 냉각 봉인 1→2→3을 통과하고 분화 경고 속에서 탈출 매듭점에 도달한다.
6. 결과에서 등급, 시간, 충돌·리스폰·돌풍 조건, 지역 미션 Top 10과 같은 코스의 비행의 메아리를 확인하고 재도전한다.

## 3. 승인된 식별자와 배치

- 지역 ID: `volcanic-archipelago`
- 지역 theme: `volcanic`
- 지역 중심: `(-240, 28, -820)`
- 미션 ID: `heart-of-sun`
- 코스 ID: `volcanic-archipelago`
- 기존 코스 ID: `skyknot`
- 지역당 수집물: 10개, 전체 40개
- 체크포인트: `CoolingSeal_1`, `CoolingSeal_2`, `CoolingSeal_3`, `EscapeGate`

지역 중심과 전체 플레이 좌표는 v11 탐험 위치 허용 범위 안에 둔다. GLB는 지역 로컬 원점을 사용하고 런타임 컨테이너가 절대 중심 좌표에 배치한다.

## 4. 핵심 기능 요구사항

### 4.1 스트리밍과 월드 아트

- 기존 420 units load / 500 units unload 히스테리시스를 유지한다.
- high LOD는 220 units 진입 / 260 units 이탈, low 품질은 항상 low다.
- 별도 프로젝트 제작 Blender 원본에서 아래 파일을 결정적으로 생성한다.
  - `public/assets/models/world/volcanic-archipelago-high.glb`
  - `public/assets/models/world/volcanic-archipelago-low.glb`
- high/low 공통 의미 노드:
  - `RegionRoot`, `LandingPad`, `VolcanoCaldera`, `ObsidianIslands`
  - `CoolingRuins`, `BrokenBridge`, `LavaSurface`, `ExpeditionBeacon`
  - `CoolingSeal_1..3`, `EscapeGate`
- 목표 예산: high 30k~40k triangles, low 8k~12k, 최대 12 primitives / 8 materials, low < high.
- 외부 텍스처와 새 런타임 의존성을 추가하지 않는다.

### 4.2 용암·환경·위험

- `LavaSurface`는 시간 uniform 하나를 가진 텍스처 없는 `ShaderMaterial`로 교체한다.
- 재는 `Points`, 낙석·경고 링·용암 파도는 풀링한 `InstancedMesh`, 열기류는 기존 활동 시각 패턴을 사용한다.
- 추가 환경 draw call 목표는 6 이하이고 매 프레임 scene traverse를 금지한다.
- 낙석은 충돌 가능 상태 최소 1.5초 전에, 용암 파도는 최소 2초 전에 색 외에도 형태와 음향으로 예고한다.
- 위험 상태는 60Hz 미션 경과 시간과 고정 seed로 결정적으로 계산한다. pause·탭 숨김·context recovery 중에는 진행하지 않는다.
- 피격은 즉사하지 않고 기존 감속·충돌 통계 경로를 사용한다.

### 4.3 열기류와 수호수 반응

- 탐험과 미션에 최소 3개 열기류를 배치한다.
- 환경 힘은 기존 `windVelocity` seam에 합성하고 캐릭터 종류를 입력으로 받지 않는다.
- 봉황은 온기/잿불 발광, 백호는 청록 깃 가장자리, 드래곤은 비늘 열기 shimmer로 반응할 수 있다.
- 반응은 재질·입자·pose·음향만 바꾸며 속도, 가속, 부스트, 충돌 반경, 체크포인트와 등급 조건을 바꾸지 않는다.

### 4.4 냉각 수정 수집

- 지역에 정확히 10개의 고유 좌표를 둔다.
- 기존 순서형 선분 수집, 첫 수집부터 타이머, pause/map/landed 정지, 지역 이탈 취소 규칙을 재사용한다.
- 금색 햇실과 구분되는 청록 결정 실루엣을 사용하되 활성 목표 하나만 표시한다.
- 지역 best, Top 10과 1위 고스트는 기존 지역 수집 기록 계약을 사용한다.

### 4.5 태양의 심장 미션

- `heart-of-sun`은 기존 여섯 미션 뒤에 추가하고 `golden-knot` 브론즈로 해금한다.
- 미션 선택 시 코스, 출발점, checkpoint count, respawn segment, sandbox gate visuals와 ghost source가 함께 전환된다.
- 순서는 봉인 1→2→3→탈출이며 건너뛰기·역통과·한 체크포인트 안 머무르기로 중복 진행하지 않는다.
- 등급:
  - Bronze: 완주, `elapsedMs <= 75_000`
  - Silver: Bronze + `elapsedMs <= 60_000`, `collisions <= 2`, `respawns <= 1`
  - Gold: Silver + `elapsedMs <= 45_000`, `collisions = 0`, `respawns = 0`, `boosts >= 2`
- 등급 조건은 누적되고 종족에 따라 달라지지 않는다.

### 4.6 기록과 고스트 소유권

- `skyknot` 완주만 legacy `bestTimeMs`, 전체 레이스 Top 10과 전체 레이스 고스트를 갱신한다.
- `heart-of-sun` 완주는 `missionTop10.heart-of-sun`, 해당 mission ghost와 mission grade만 갱신한다.
- 용암 코스는 전체 레이스 고스트 fallback을 사용하지 않는다.
- 용암 결과의 최고 기록은 해당 미션 보드 1위다.
- 축제 여정의 레이스 완료는 `skyknot` 기록만 본다.
- 별도 course Top 10을 중복 저장하지 않는다. 두 번째 코스는 한 미션만 소유하므로 mission board가 단일 권위다.

### 4.7 UI·오디오·호환성

- ready와 `Esc` pause의 미션 선택, 작업실, 스토리, 재시도 흐름을 유지한다.
- HUD는 `냉각 봉인 n/3`, `분화 탈출`, 남은 Bronze 제한 시간, 기록 차이를 표시한다.
- 목표와 위험은 색만으로 구분하지 않고 형태·아이콘·텍스트/음향을 병행한다.
- 기존 `Sovereign of the Sunrise Skies`를 유지하며 용암 ambience intensity, 위험 경고, 봉인 성공, 탈출 cue API를 추가한다.
- 오디오는 unlock·mute·BGM volume·visibility·dispose와 실패 비차단 계약을 따른다.

## 5. 저장 v11

v11은 새 지역/미션/코스 어휘를 수용한다. v10에서 다음을 손실 없이 보존한다.

- legacy best, mute, BGM volume, quality
- guardian form, palette, accessory
- 모든 기존 mission grade
- 세 지역 coin best와 전체/coin/mission Top 10
- race/coin/mission ghosts
- 탐험 위치·방향·착륙·발견 지역·목적지·랜드마크·상승기류

마이그레이션은 용암 등급·기록·고스트·발견을 합성하지 않는다. 알 수 없는 ID와 범위 밖 숫자는 기존 방어적 기본값으로 정규화한다.

## 6. 성능·접근성·안정성

- 뷰포트: `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`.
- desktop/high: 30초 median >=55fps, minimum gate >=50fps.
- mobile/low: 30초 median >=30fps.
- high draw calls <=120, 전체 gzip <10MiB.
- nonblank와 시간 변화 픽셀, console/page/unhandled/network error 0.
- `prefers-reduced-motion`에서 재·카메라 흔들림·용암 파동 애니메이션 강도를 줄이되 예고 판정은 동일하다.
- 10분 동안 지역 왕복·LOD 전환·미션 재시도·pause/resume에서 자원과 listener가 단조 증가하지 않는다.

## 7. 비목표

- Unity 이전, React, 물리 엔진, 새 의존성
- 전투, 체력, 보스, NPC, 대화 트리, 자유 순서 퀘스트
- 중간 봉인 상태 영구 저장
- 캐릭터별 능력치·위험 면역·전용 지름길
- 서버 순위, 계정, 네트워크 동기화
- 다섯 번째 지역이나 세 번째 코스

## 8. 완료 정의

기능, 자산, 오디오, 저장과 UI가 하나의 플레이 가능한 흐름으로 연결되고 단위·브라우저·프로덕션·성능·결정적 asset 검사·5뷰포트 시각 QA·10분 soak가 모두 통과한 뒤에만 M39를 완료로 표시한다.
