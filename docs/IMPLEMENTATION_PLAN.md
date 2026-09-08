# 하늘매듭배 구현 계획

> 상태: **Milestone 46 / 비전투 탐험 RPG 첫 챕터 구현 중**
>
> 선행 문서: `docs/PRODUCT_GOAL.md`
>
> 2026-08-11 사용자 지시에 따라 첫 하늘매듭은 8관문·1.5~2.5분 목표로 축소하며, 이를 재사용하는 미션 시간 기준도 함께 조정한다.
>
> 2026-08-11 사용자 지시에 따라 기존 조작·규칙·에셋 계약을 보존하는 게임감 그래픽 패스를 Milestone 42로 진행한다.
>
> 2026-08-27 실제 입력 완주·재도전 증거와 첫 플레이 안내·가독성·복귀 개선을 Milestone 43으로 진행한다. 이번 목표에서 커밋·푸시·배포하지 않는다.
>
> 2026-08-30 첫 하늘매듭을 기존 앞 6관문에서 완주하는 스피드 패스로 줄이고, 미션 시간·돌풍 기준과 실제 입력 검증을 함께 조정한다. 기존 저장은 삭제하지 않는다.
>
> 2026-08-30 `돌풍 조율사`를 신규 미션 선택·진행선에서 제외하고 첫 완주 다음에 무리스폰 미션을 연다. 기존 조율사 저장 데이터는 호환용으로 보존한다.

## 기술 방향

- **런타임:** 브라우저, 클라이언트 전용
- **언어:** TypeScript strict mode
- **렌더링:** Three.js `WebGLRenderer`
- **개발 서버/빌드:** Vite vanilla TypeScript
- **단위 테스트:** Vitest
- **브라우저 검증:** Milestone 0~3은 Codex 인앱 브라우저, Milestone 4부터 Playwright 반복 시나리오 추가
- **에셋:** 자체 제작 Three.js 지오메트리, 절차 생성 배치, 라이선스가 명확한 파일만 허용
- **상태 저장:** 방어적으로 감싼 `localStorage`

### 도구 체인 계약

- 기준 런타임: Node.js `22.20.x`, npm `10.9.x`
- `package.json` engines: `node >=22.20 <23`
- 런타임 의존성: `three`만 허용
- Milestone 0 개발 의존성: `vite`, `typescript`, `vitest`, `eslint`, `@eslint/js`, `typescript-eslint`, `globals`
- Milestone 4 개발 의존성: 반복 브라우저 흐름이 필요할 때 `@playwright/test` 추가
- 구현 시작 시 각 패키지의 최신 안정 호환 버전을 공식 문서로 확인하고 `package-lock.json`으로 고정
- React, 전역 상태 라이브러리, CSS 프레임워크, 물리 엔진은 첫 릴리스에 도입하지 않음

`package.json`의 스크립트 이름과 명령은 다음으로 고정한다.

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "preview": "vite preview",
    "test:e2e": "playwright test",
    "test:performance": "node tools/run-playwright-performance.mjs",
    "test:production": "node tools/run-playwright-production.mjs"
  }
}
```

`test:e2e`는 Milestone 4에서 `@playwright/test`를 추가할 때 활성화한다. 그 전까지 브라우저 검증은 인앱 브라우저로 수행하고 실행 결과를 마일스톤 기록에 남긴다.

ESLint는 루트 `eslint.config.js` flat config를 사용한다. `@eslint/js` recommended와 `typescript-eslint` recommended를 적용하고 `globals.browser`를 등록하며 `dist`, `coverage`, `playwright-report`를 무시한다. 미사용 변수는 오류로 처리하되 `_`로 시작하는 의도적 미사용 인수만 허용한다. 구현 시점의 공식 flat-config 문법을 확인하되 이 규칙 수준을 낮추지 않는다.

### 캐릭터 에셋 파이프라인

- 제작 도구: Blender `4.5.10 LTS`
- 실행 파일: `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`
- 기준 드래곤 원본: `assets/source/dragon/skyknit-dragon-v08.blend` (v07 원본도 보존)
- 신규 수호수 원본: `assets/source/characters/{ember-phoenix,storm-white-tiger}.blend`
- 게임 출력: `public/assets/models/characters/{skyknit-dragon,skyknit-phoenix,skyknit-white-tiger}.glb`
- 생성: `tools/blender/build_character_assets.py`
- 내보내기: `tools/blender/export_character_asset.py`
- 구조·예산 검사: `tools/blender/inspect_character_assets.py`
- 스튜디오 미리보기: `tools/blender/render_character_preview.py`
- 프로젝트 제작 Blender 원본이 자산의 단일 소유권 근거이며, 런타임 GLB와 QA 미리보기는 원본을 덮어쓰지 않고 다시 만들 수 있어야 한다.
- 텍스처 파일을 추가하지 않고 삼각형 메시, 세 역할 재질과 vertex color를 사용한다.
- 선회 뱅크와 몸통·머리·꼬리 지연은 게임 입력에 맞춰 Three.js에서 시각적으로 보정하며 비행 상태와 충돌을 바꾸지 않는다.

Milestone 38의 세 수호수는 같은 런타임 계약을 사용한다.

- 캐릭터 ID: `sunrise-dragon`, `ember-phoenix`, `storm-white-tiger`
- 공통 동작 노드: `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`, `JawRig`, `EyeRig_L/R`
- 공통 장식 소켓: `AccessorySocket_Head`, `AccessorySocket_Back`, `AccessorySocket_Tail`
- 공통 재질: `M_Dragon_Scale`, `M_Dragon_Membrane`, `M_Dragon_Glow`
- 봉황 목표: 22,000~28,000 triangles; 백호 목표: 24,000~30,000 triangles
- 공통 목표: 14 meshes 이하, 18 primitives 이하, 정확히 3 materials, gzip-9 600KiB 이하
- 장식: `wind-goggles.glb`, `festival-ribbon.glb`; 각각 3,000 triangles 이하, 2 primitives 이하, gzip-9 100KiB 이하
- 런타임은 선택된 플레이어 GLB 하나와 필요한 고스트 하나만 로드하며, 교체 성공 뒤 이전 자원을 해제한다.

콘셉트 시트로 실루엣을 확정한 뒤 Blender 원본과 GLB를 만든다. 초기 콘셉트 이미지는 참고 자료이며 런타임에 직접 포함하지 않는다. 목표 예산, 결정적 내보내기와 시각 품질은 inspector·미리보기·실브라우저 게이트가 통과해야 완료로 기록한다.

## 런타임 구조

아래 경로는 계획된 구조이며 아직 생성하지 않는다.

```text
src/
  main.ts                    # 부트스트랩, 오류 경계, DOM 연결
  styles.css                 # 전체 화면 장면, HUD, 터치 UI
  game/
    DragonRaceGame.ts        # 장면과 시스템의 수명주기 조정
    config.ts                # 제목, 튜닝, 품질 예산
    race/
      raceState.ts           # 순수 레이스 상태 전이
      checkpoint.ts          # 구간-관문 교차와 순서 판정
    flight/
      flightModel.ts         # 순수 고정 스텝 비행/부스트 계산
      FlightController.ts    # Three.js 오브젝트에 결과 적용
    world/
      createWorld.ts         # 조명, 안개, 섬, 구름, 바람실
      createCourse.ts        # 관문 데이터와 렌더 오브젝트
      createDragon.ts        # 드래곤 리그와 애니메이션 핸들
    input/
      InputController.ts     # 키보드, 포인터, 장치 우선순위
    ui/
      HudController.ts       # 준비/카운트다운/HUD/완주 상태
    persistence/
      records.ts             # 검증된 로컬 기록 읽기/쓰기
```

모듈은 실제 복잡도가 생길 때만 분리한다. 한 파일이 단일 책임을 명확히 수행한다면 계획보다 더 적은 파일을 사용하는 편이 낫다.

## 핵심 설계

### 시뮬레이션

- 렌더 루프는 `renderer.setAnimationLoop`를 사용한다.
- 비행과 레이스 규칙은 60Hz 고정 스텝으로 갱신한다.
- 프레임 델타는 최대 100ms로 제한해 복귀 시 폭주를 막는다.
- 렌더링은 최신 시뮬레이션 상태를 사용하며 시각 보간은 필요할 때만 추가한다.
- 비행은 강체 시뮬레이션이 아닌 결정적인 아케이드 운동 모델로 구현한다.

좌표 계약은 Three.js 기준 `+Y`가 위, 드래곤 로컬 `-Z`가 전방, `+X`가 오른쪽이다.

### 비행 모델

- 입력은 `pitchInput`, `yawInput` 각각 `[-1, 1]`로 정규화한다.
- 목표 피치는 `pitchInput * 22도`이며 `1 - exp(-8 * dt)` 계수로 추종한다.
- yaw는 `yawInput * 1.4 rad/s`로 적분한다.
- 시각 뱅크는 `-yawInput * 30도`를 `1 - exp(-10 * dt)`로 추종한다.
- 전진 속도는 순항 `24 units/s`이며 상승 피치에서 최대 15% 감소, 하강 피치에서 최대 20% 증가한다.
- 부스트는 최종 전진 속도에 `1.6`을 곱한다. 잔량과 회복 규칙은 게임 계약을 따른다.
- 위치는 yaw/pitch로 만든 정규화 전방 벡터에 최종 속도와 고정 `dt`를 곱해 적분한다.
- 물리 롤은 사용하지 않으며 뱅크는 순수 시각 표현이다. 이동 방향과 yaw 계산에는 영향을 주지 않는다.

카메라 위치 목표는 드래곤 로컬 `(0, 3.6, 9.5)`, 시선 목표는 전방 8 units와 상방 1 unit이다. 위치는 고유 진동수 `7.5 rad/s`, 감쇠비 `1.0`의 임계 감쇠 스프링으로, 시선은 `9 rad/s`, 감쇠비 `1.0`으로 추종한다. FOV는 일반 55도와 부스트 63도 사이를 `1 - exp(-8 * dt)`로 보간한다.

### 관문 판정

- 이전 위치와 현재 위치의 선분이 관문 평면을 통과했는지 확인한다.
- 교차점이 관문 유효 반경 안에 있고 현재 목표 인덱스와 일치할 때만 통과 처리한다.
- 관문 안에 머무르거나 역방향으로 재진입해도 한 번만 집계한다.
- 리스폰은 마지막 통과 관문의 진행 상태를 유지한다.

### 규칙 테스트 소유권

| 마일스톤 | 먼저 고정할 테스트 |
| --- | --- |
| M0 | 게임 계약의 event/state 표 전체, 선분이 관문 중심을 통과함, 반경 밖/평행/역방향 교차 거부 |
| M1 | 30/60/120fps와 지터 cadence에서 고정 입력 10초 결과 일치, 부스트 소비/회복, 입력 해제 |
| M2 | 관문 건너뛰기, 고속 통과, 관문 안 머무름, 역방향 재통과, 리스폰 직후, 최종 관문, 일시정지 통합, 자동 이탈, 기록 저장 |
| M3 | 장애물 충돌 감속, 충돌 cooldown, 리스폰 면역, 진행 상태 보존 |
| M4 | 키보드/터치 완주 흐름, blur/hidden 자동 일시정지, 접근성/반응형 브라우저 검증 |
| M7 | 드래곤 런타임 피벗/변형 보존, GLB triangle/mesh/material 예산, 장면 draw-call 예산 |
| M8 | 미션 평가, 시도 통계, 일시정지/재시도/복구, v3 저장과 v2 마이그레이션 |
| M9 | 5개 뷰포트의 미션 선택/진행/성공/실패/재시도, 픽셀/성능/프로덕션 훅 제거 |

M0의 관문 테스트는 기하 함수 계약만 고정한다. 체크포인트 순서와 완주 의미는 M2에서 레이스 상태와 통합해 확장한다.

### 오류 재현 계약

- 개발 모드에서만 `?forceWebglFailure=1` 쿼리를 허용해 렌더러 팩토리가 의도적으로 실패하도록 한다.
- 개발 모드에서만 `window.__DRAGON_RACE_TEST__.loseContext()`를 노출해 `WEBGL_lose_context` 또는 합성 `webglcontextlost` 이벤트를 실행한다.
- 두 훅은 프로덕션 빌드에서 제거되며 Milestone 0/5 브라우저 검증에만 사용한다.
- 실패 화면은 한국어 원인 요약과 `다시 시도` 버튼을 보여 주고, 재시도는 정상 파라미터로 다시 초기화한다.

### 카메라와 드래곤

- 카메라는 드래곤 후방 스프링 추적을 사용하고 롤은 드래곤보다 완만하게 반영한다.
- 기본 FOV는 약 55도, 부스트에서 최대 63도까지 짧게 변화한다.
- 드래곤 리그는 어깨, 몸통, 좌우 날개, 목/머리, 꼬리 세그먼트로 구성한다.
- 몸통과 꼬리는 입력을 지연 추종해 생물의 관성을 표현한다.

### 성능

- DPR은 데스크톱 최대 1.75, 모바일 최대 1.25로 제한한다.
- 반복 구름과 풍경은 `InstancedMesh`를 우선 사용한다.
- 실시간 그림자는 한 개의 주요 광원과 제한된 오브젝트에만 사용한다.
- 후처리 없이 색, 안개, 조명, 입자 밀도로 분위기를 만든다.
- 저품질 모드는 그림자, 입자, 구름 레이어를 줄이되 코스 가독성은 바꾸지 않는다.

## 구현 마일스톤

### Milestone 0: 프로젝트 골격과 규칙 테스트

**결과물**
- Vite + TypeScript + Three.js 프로젝트
- 도구 체인 계약에 적힌 의존성과 `dev`, `build`, `typecheck`, `test`, `test:watch`, `lint`, `preview` 스크립트
- M0 소유권 표에 적힌 레이스 상태 전이와 관문 기하의 실패하는 단위 테스트
- 전체 화면 캔버스와 WebGL 오류 안내

**완료 조건**
- 테스트가 구현 전 실패하는 것을 확인한 뒤 최소 구현으로 통과시킨다.
- 빈 장면이라도 캔버스가 데스크톱/모바일에서 정확한 크기로 렌더링된다.
- `?forceWebglFailure=1`에서 빈 화면 대신 한국어 오류와 다시 시도가 보인다.
- 정상 경로와 강제 실패 경로 모두에서 처리되지 않은 오류가 없다.
- 빌드, 타입 검사, 린트, 테스트가 모두 성공한다.

### Milestone 1: 비행 샌드박스

**결과물**
- 자동 전진, 상승/하강, 선회, 부스트, 카메라 추적
- 임시 드래곤 실루엣과 기준 관문 1개
- 고정 스텝 비행 모델 단위 테스트

**완료 조건**
- 고정 입력 시나리오를 30/60/120fps와 지터 cadence로 10초 실행했을 때 60fps 기준 대비 이동 거리와 부스트 잔량 오차가 2% 이내, 최종 방향 차이가 1도 이내다.
- 키보드로 30초 이상 비행해도 카메라가 뒤집히거나 입력이 고착되지 않는다.
- 드래곤의 피치/뱅크가 입력 방향과 일치한다.

고정 입력 시나리오는 `0~2초 중립`, `2~4초 yaw +0.75`, `4~6초 pitch +0.5`, `6~8초 boost`, `8~10초 yaw -0.5 + pitch -0.5`다. cadence는 `1/30`, `1/60`, `1/120`, 반복 지터 `[1/20, 1/120, 1/45, 1/90]`를 사용하며 모두 동일한 60Hz 시뮬레이션 스텝을 소비한다.

### Milestone 2: 완주 가능한 레이스

**결과물**
- 6개 관문 데이터
- 준비, 3초 카운트다운, 레이스, 일시정지, 완주, 재시도
- 타이머, 순서 판정, 수동/자동 리스폰, 최고 기록

**완료 조건**
- 정상 순서 완주만 기록을 저장한다.
- 건너뛰기, 역주행, 고속 관통, 리스폰 직후 재집계를 단위 테스트로 막는다.
- 고도 `-12` 미만 또는 현재 코스 구간에서 65 units 초과 상태가 1.5초 지속되면 마지막 안전 앵커로 자동 리스폰한다.
- 수동/자동 리스폰은 타이머와 체크포인트를 보존하고 1초간 충돌 면역을 적용한다.
- 첫 플레이 기준 1.0~1.75분 안에 완주할 수 있다.

### Milestone 3: 세계와 드래곤 정체성

**결과물**
- 주홍 드래곤 리그와 날갯짓/선회/부스트 애니메이션
- 해뜰녘 군도, 구름, 바람실, 관문 룬
- 관문 통과 파동과 부스트 공기 고리
- 섬/장애물 충돌 프록시, 감속, 드래곤 움찔과 짧은 산호색 피드백

**완료 조건**
- 첫 스크린샷에 주홍 드래곤, 두 가닥 바람실, 금빛 관문이 모두 보인다.
- 다음 관문 투영 크기가 48 CSS px 아래로 내려갈 때 화면 가장자리 방향 표시가 나타난다.
- 자동차나 지상 트랙 문법이 남아 있지 않다.
- 충돌 시 속도 배율이 0.45로 내려가 1.25초 동안 1.0으로 회복하며 0.75초 cooldown 동안 중복 충돌이 발생하지 않는다.
- 충돌은 체크포인트와 타이머를 바꾸지 않고, reduced-motion에서는 카메라 흔들림 없이 색/자세 피드백만 사용한다.

### Milestone 4: HUD, 터치, 접근성

**결과물**
- 한국어 준비/튜토리얼/HUD/일시정지/완주 UI
- 가상 스틱, 돌풍 버튼, 터치 일시정지
- 포커스, 접근 가능한 이름, reduced-motion 대응
- `@playwright/test`와 반복 가능한 키보드/터치/포커스 검증 시나리오

**완료 조건**
- 키보드와 터치 각각 시작부터 재시도까지 완전한 흐름을 수행한다.
- 세로/가로 모바일에서 페이지 스크롤이나 확대가 발생하지 않는다.
- 지정 뷰포트에서 UI 겹침과 잘림이 없다.
- 준비 화면의 유효 입력 후 100ms 안에 카운트다운이 시작되고 4초 안에 비행 상태에 진입한다.
- 모든 `[data-touch-control]`의 실제 경계가 44x44 CSS px 이상이고 safe-area 안에 있다.
- 모든 아이콘 버튼은 비어 있지 않은 accessible name을 가지며 키보드 포커스와 `:focus-visible`이 확인된다.
- reduced-motion에서 카메라 흔들림, FOV 펄스, 강한 속도선이 비활성화되는 것을 자동 검증한다.
- `window.blur`와 hidden `visibilitychange` 모두 countdown/racing을 pause로 바꾸고 이동, 타이머, 부스트, 관문 처리를 정지한다.
- 최소 1명의 처음 보는 플레이어가 추가 설명 없이 30초 안에 상승/하강, 선회, 부스트를 모두 수행한다. 최종 M6에서는 3명으로 확장한다.

### Milestone 5: 품질, 오디오, 복구

**결과물**
- 자동/수동 품질 정책과 저장
- 자체 생성 WebAudio 관문/부스트/완주 효과와 음소거
- WebGL 컨텍스트 손실 및 리소스 오류 복구 UI

**완료 조건**
- 품질 변경 후 진행 상태와 관문 가독성이 유지된다.
- 음소거 상태가 저장되고 오디오 실패가 게임을 막지 않는다.
- 컨텍스트 손실을 모의했을 때 안내와 재시도 경로가 보인다.

### Milestone 6: 실제 브라우저 QA와 튜닝

**결과물**
- 데스크톱/모바일 스크린샷 및 캔버스 픽셀 검사
- 콘솔/네트워크 오류 점검
- 성능 측정과 병목 수정
- 최종 조작/난이도 튜닝

**완료 조건**
- 모든 자동 검증과 실제 브라우저 시나리오가 통과한다.
- 30초 측정에서 성능 예산을 만족한다.
- 검은 화면, 정지 캔버스, 오버랩, 잘린 텍스트가 없다.
- 처음 보는 플레이어 3명 중 3명이 30초 안에 기본 조작을 수행하고, 2명 이상이 도움 없이 첫 레이스를 완주한다.

### Milestone 7: 3D 품질 리마스터

**결과물**
- 15,000~25,000 triangles 범위의 주홍 드래곤 v2 GLB와 Blender 원본/재생성 스크립트
- 기존 런타임 이름 `WingRig_L`, `WingRig_R`, `HeadRig`, `TailRig_1..5`를 유지한 저드로우콜 리그
- 개선된 섬 실루엣, 유적, 깃발, 룬, 구름 레이어, 관문 재질
- `docs/MILESTONE_7_REPORT.md`

**완료 조건**
- 머리/눈/뿔/목/몸통/다리/발톱/날개막/꼬리가 근·중거리에서 구분되고 기존 주홍 실루엣이 유지된다.
- 날갯짓, 어깨 선행 뱅크, 몸통/꼬리 지연, 상승/부스트 자세가 기존 런타임 계약으로 계속 동작한다.
- vertex color 또는 1024px 텍스처 1장만 사용하며, 출처 불명 에셋과 새 런타임 의존성을 추가하지 않는다.
- high 장면은 120 draw calls 이하이고 다음 금빛 관문과 두 가닥 바람실이 모든 필수 뷰포트에서 읽힌다.
- 시각 수직 슬라이스마다 실제 브라우저 스크린샷, nonblank/시간 변화 픽셀 검사, `visual-verdict`를 통과한다.
- 데스크톱 high 중앙값 55fps/최저 50fps, 모바일 low 중앙값 30fps, gzip 합계 10MiB 미만을 유지한다.

### Milestone 8: 로컬 챌린지 미션 6종

**결과물**
- 첫 완주, 제한 시간, 무충돌, 무리스폰, 부스트 운용, 복합 골드의 6개 미션
- Three.js와 분리된 순수 TypeScript 미션 규칙/시도 통계/등급 평가
- 준비 화면 미션 선택, 비행 중 목표 HUD, 완주 성공/실패/최고 등급
- mission grade를 포함하는 v3 저장 포맷과 v2 마이그레이션
- `docs/MILESTONE_8_REPORT.md`

**완료 조건**
- 충돌/리스폰/부스트 활성화/경과 시간/체크포인트를 실제 레이스 이벤트에서 정확히 누적한다.
- 일시정지는 통계를 바꾸지 않고, 재시도는 새 시도를 시작하며, 컨텍스트 복구는 진행 중 시도와 선택 미션을 보존한다.
- 키보드와 터치 각각 미션 선택부터 시작, 진행, 결과 확인, 같은 미션 재시도까지 수행한다.
- v2 정상값과 손상값이 v3로 안전하게 읽히고 기존 최고 기록/음소거/품질을 잃지 않는다.
- 규칙/저장/통합 동작은 실패 테스트를 먼저 확인한 뒤 구현하며 전체 품질 게이트가 통과한다.

### Milestone 9: RC2 브라우저 QA와 인계

**결과물**
- 다섯 필수 뷰포트의 미션 선택/진행/성공/실패/재시도 자동 증거
- M6 대비 드래곤 triangles, 장면 draw calls, gzip 전송량, 성능 전후 비교
- `docs/MILESTONE_9_AUTOMATED_QA_REPORT.md`와 `docs/RC2_PLAYTEST_HANDOFF.md`

**완료 조건**
- 단위, E2E, 성능, 프로덕션, 타입 검사, 린트, 빌드, 보안 감사가 모두 통과한다.
- canvas가 nonblank이고 시간에 따라 변하며 console/page/unhandled/network 오류가 0이다.
- 개발 전용 QA/실패 훅이 프로덕션 출력에서 제거된다.
- 각 필수 뷰포트에서 미션 UI가 코스와 터치 조작을 가리지 않고 44x44 CSS px/safe-area 규칙을 지킨다.
- 사람 플레이테스트 결과를 만들지 않으며 최종 문서 상태를 `RC2 / 자동 검증 완료 / 3D·미션 플레이테스트 대기`로 둔다.

### Milestone 10: RC3 캐릭터 디자인 계약

**결과물**
- `docs/DRAGON_CHARACTER_BIBLE.md`
- RC2 모델/런타임 기준선과 RC3 실루엣·해부학·표정·가독성 명세

**완료 조건**
- 캐릭터의 색, 비율, 얼굴, 날개, 다리, 발, 꼬리와 금지 요소가 구현 가능한 수준으로 고정된다.
- 근거리 준비 화면과 레이스 카메라에서 각각 유지할 디테일 우선순위가 구분된다.

### Milestone 11: Dragon v3 자동화 에셋

**결과물**
- Blender 재생성 스크립트, v3 `.blend`, 런타임 GLB, 정면/측면/후면/3/4 증거
- 기존 필수 피벗과 선택 `JawRig`, `EyeRig_L/R` 피벗

**완료 조건**
- 18,000~22,000 triangles, 14 render meshes, 18 primitives, 3 materials 이하를 자동 검사한다.
- 얼굴·날개·관절·발·꼬리의 큰 형태가 v2보다 명확하고 전체 gzip 10MiB 예산을 유지한다.

### Milestone 12: 캐릭터 표현과 카메라 통합

**결과물**
- 호흡, 결정적 눈 깜빡임, 날갯짓, 선회 지연, 상승, 부스트, 충돌 표정
- 준비 화면 영웅 구도와 레이스 카메라 복귀

**완료 조건**
- 선택 피벗이 없는 모델도 기존 동작으로 안전하게 fallback한다.
- pause 중 표현 시간이 진행되지 않고 context recovery가 레이스/미션 상태를 보존한다.
- 모든 필수 뷰포트에서 드래곤, 바람실, 다음 금빛 관문이 함께 읽힌다.

### Milestone 13: RC3 자동 QA와 인계

**결과물**
- 5뷰포트 시각/픽셀/콘솔/E2E/성능/프로덕션 증거
- `docs/MILESTONE_13_RC3_AUTOMATED_QA_REPORT.md`와 `docs/RC3_CHARACTER_PLAYTEST_HANDOFF.md`

**완료 조건**
- test, typecheck, lint, build, E2E, performance, production, GLB 검사와 보안 감사가 통과한다.
- desktop/high 중앙값 55fps·최저 50fps, mobile/low 중앙값 30fps, high 120 draw calls 이하를 유지한다.
- 최종 상태를 `RC3 / 캐릭터 리마스터 자동 검증 완료 / 실기기·사람 플레이테스트 대기`로 둔다.

### Milestone 14: RC4 탐험 비행 계약

**결과물**
- 레이스와 분리된 순수 탐험 비행/착륙 상태
- 키보드·터치 감속, 호버, 착륙, 재이륙 입력

**완료 조건**
- 기존 레이스 자동 전진 수치와 테스트가 변하지 않는다.
- 탐험은 감속 유지 시 속도 0.1 이하로 정지하고 해제 시 순항을 회복한다.
- 착륙 반경/고도 밖 요청은 거부하며 유효 요청은 `landing -> landed -> taking-off -> airborne`으로 전이한다.
- pause와 숨김 상태에서는 위치, 속도, 착륙 진행이 바뀌지 않는다.

### Milestone 15: 3개 지역과 스트리밍

**결과물**
- 축제 중심섬, 바람 협곡, 구름 유적지의 고유 실루엣/색/랜드마크
- 거리 기반 생성/해제와 지역 발견 규칙

**완료 조건**
- 420 units 로드, 500 units 언로드 히스테리시스를 순수 테스트한다.
- 시작 시 축제 지역만 로드되고 이동에 따라 인접 지역이 생성되며 먼 지역 geometry/material이 해제된다.
- high 120 draw calls, 전체 gzip 10MiB와 기존 FPS 기준을 유지한다.

### Milestone 16: 도전 지점, 저장과 탐험 UI

**결과물**
- 축제 레이스 비콘에서 기존 선택 미션/코스 시작
- v4 저장의 탐험 위치, 발견 지역, 목적지
- 현재 지역 이름, 간단 지도, 목적지 방향, 상황별 동작

**완료 조건**
- v3 정상/손상 저장을 v4로 안전하게 읽고 기존 기록/등급/설정을 잃지 않는다.
- 레이스 비콘 밖에서는 도전을 시작하지 않고 안에서는 기존 3초 카운트다운으로 전환한다.
- UI는 키보드·터치·스크린리더 이름과 44x44 CSS px/safe-area 계약을 지킨다.

### Milestone 17: RC4 통합 QA와 인계

**결과물**
- 5뷰포트 탐험/착륙/재이륙/지역 이동/레이스 도전 자동 증거
- `docs/MILESTONE_17_RC4_AUTOMATED_QA_REPORT.md`와 `docs/RC4_OPEN_WORLD_PLAYTEST_HANDOFF.md`

**완료 조건**
- test, typecheck, lint, build, E2E, performance, production과 보안 감사가 통과한다.
- Dragon v3, 레이스 6개 미션, 복구와 접근성 회귀가 없다.
- 최종 상태를 `RC4 / 소형 오픈월드 프로토타입 자동 검증 완료 / 실기기·사람 플레이테스트 대기`로 둔다.

### Milestone 18: RC5 월드 아트 계약과 Blender 원본

**결과물**
- `.omx/plans/prd-rc5-world-art.md`, `.omx/plans/test-spec-rc5-world-art.md`
- `assets/source/world/skyknit-world-rc5.blend`
- 재현 가능한 `tools/blender/build_world_art.py`

**완료 조건**
- 세 지역의 구조물 목록, 이름, 원점, 재질과 high/low LOD 계약이 고정된다.
- 외부 에셋·텍스처 없이 프로젝트 자체 geometry와 vertex color/PBR 재질만 사용한다.
- Blender 4.5.10 LTS background 실행으로 원본과 모든 GLB를 재생성할 수 있다.

### Milestone 19: 지역별 high/low GLB

**결과물**
- `festival-hub-high/low.glb`, `wind-canyon-high/low.glb`, `cloud-ruins-high/low.glb`
- `tools/blender/inspect_world_glb.py`와 예산 리포트

**완료 조건**
- 모든 LOD가 `RegionRoot`, `LandingPad`와 지역별 필수 구조 노드를 가진다.
- high는 12,000~60,000 triangles, low는 3,000~25,000 triangles다.
- 각 파일은 12 primitives, 8 materials 이하이며 low triangles는 high보다 적다.
- 축제/협곡/유적의 큰 실루엣과 랜드마크가 서로 중복되지 않는다.

### Milestone 20: Three.js GLB 스트리밍과 LOD

**결과물**
- `GLTFLoader` 기반 비동기 지역 자산 로딩, 품질·거리 LOD 선택과 실패 fallback
- 기존 420/500 지역 스트리밍과 geometry/material 해제 보존

**완료 조건**
- low 품질은 low GLB만 요청하고, high 품질은 220 units 안에서 high로 승격하고 260 units 밖에서 low로 강등한다.
- 품질 변경은 로드된 지역을 새 LOD로 교체하고 탐험 위치/발견/목적지/미션 진행을 보존한다.
- 지역 언로드 또는 LOD 교체 시 GLB geometry/material을 dispose한다.
- 자산 실패 시 착륙과 레이스 도전이 가능한 최소 fallback을 보여 주고 콘솔 미처리 오류가 없다.

### Milestone 21: RC5 시각·성능 QA와 인계

**상태: 완료 — 2026-07-13**

**결과물**
- 세 지역 × 필수 5뷰포트 스크린샷/픽셀/콘솔 증거
- `docs/MILESTONE_21_RC5_AUTOMATED_QA_REPORT.md`, `docs/RC5_WORLD_ART_PLAYTEST_HANDOFF.md`

**완료 조건**
- visual-verdict 90점 이상이며 드래곤과 지역 랜드마크가 UI에 가려지지 않는다.
- test, typecheck, lint, build, E2E, performance, production, GLB 검사와 보안 감사가 통과한다.
- high 120 draw calls, desktop 55/50fps, mobile low 30fps, 전체 gzip 10MiB 미만을 유지한다.
- 최종 상태를 `RC5 / 3D 월드 아트 패스 자동 검증 완료 / 실기기·사람 플레이테스트 대기`로 둔다.

### Milestone 22: RC6 하늘동전 코스 계약

**결과물**
- `.omx/plans/prd-rc6-coin-runs.md`, `.omx/plans/test-spec-rc6-coin-runs.md`
- 세 지역 × 10개 동전 좌표와 구조물 통과 동선

**완료 조건**
- 각 지역에 정확히 10개의 고유 ID와 유효한 3D 좌표가 있다.
- 축제 아치, 협곡 터널/다리, 유적 계단/기둥을 활용하되 착륙장과 레이스 비콘을 막지 않는다.
- 첫 동전 시작, 순서 수집, 지역 이탈 취소, 3초 후 재도전 계약이 고정된다.

### Milestone 23: 수집 규칙과 v5 기록 저장

**결과물**
- 선분 기반 동전 수집, 고정 스텝 타이머, 완료/재도전 순수 상태
- 지역별 최고 기록과 v4→v5 저장 마이그레이션

**완료 조건**
- 잘못된 순서, 고속 관통, pause/map/landing, 지역 이탈, 재도전을 단위 테스트한다.
- 더 빠른 유효 완주만 지역별 기록을 갱신하고 손상 기록은 안전하게 제거한다.
- 기존 레이스 최고 기록, 미션 등급, 탐험 위치/발견/목적지를 잃지 않는다.

### Milestone 24: 3D 동전과 탐험 HUD 통합

**결과물**
- 총 30개를 한 번에 관리하는 저드로우콜 `InstancedMesh` 동전 시각
- 탐험 HUD의 수집 수, 시간, 짧은 완주/신기록 상태
- 개발 전용 지역별 코스 완주 QA 훅

**완료 조건**
- 활성 비행 중 현재 지역·현재 순서의 수집 가능한 동전 하나만 표시해 보이는 동전과 실제 판정 대상을 일치시키고, 화면 밖·카메라 뒤 동전은 좌우가 반전되지 않는 방향 표식으로 안내한다.
- 축제 허브의 비수집 랜턴은 붉은 재질로 분리해 금색 코스 동전과 즉시 구분된다.
- HUD는 수집 수와 시간만 간결하게 표시하고 5개 필수 뷰포트의 기존 조작을 가리지 않는다.
- 레이스 모드에서는 동전과 동전 HUD가 보이지 않으며 기존 레이스/미션 상태를 바꾸지 않는다.

### Milestone 25: RC6 통합 QA와 인계

**상태: 완료 — 2026-07-13**

**결과물**
- 세 지역 × 5뷰포트 수집/기록/저장/재도전 증거
- `docs/MILESTONE_25_RC6_AUTOMATED_QA_REPORT.md`, `docs/RC6_COIN_RUN_PLAYTEST_HANDOFF.md`

**완료 조건**
- test, typecheck, lint, build, E2E, performance, production과 보안 감사가 통과한다.
- canvas nonblank/시간 변화, console/page/unhandled/network 오류 0, visual-verdict 90점 이상이다.
- desktop high 55/50fps, mobile low 30fps, high 120 draw calls, gzip 10MiB 미만을 유지한다.
- 최종 상태를 `RC6 / 하늘동전 기록 도전 자동 검증 완료 / 실기기·사람 플레이테스트 대기`로 둔다.

### Milestone 26: RC7 계약과 기준선

**상태: 완료 (2026-07-13)**

**결과물**
- `.omx/plans/prd-rc7-visual-audio-remaster.md`
- `.omx/plans/test-spec-rc7-visual-audio-remaster.md`
- RC6 스크린샷, GLB 검사, BGM 메타데이터와 30초 성능 기준선
- `docs/MILESTONE_26_RC7_BASELINE.md`

**완료 조건**
- BGM 코덱·길이·크기·루프 경계와 프로젝트 사용 출처가 기록된다.
- unit, typecheck, lint, build와 기존 성능 검증이 수정 전 통과한다.
- 대표 RC6 5뷰포트와 세 지역 화면을 RC7 전후 비교 기준으로 고정한다.

### Milestone 27: 탐험 BGM과 오디오 설정

**상태: 완료 — 2026-07-14**

**결과물**
- 배포용 탐험 BGM과 출처 문서
- BGM 반복, 탐험/레이스/가시성/복구 수명주기와 실패 fallback
- 기존 효과음과 공유하는 음소거·BGM 전용 볼륨
- v6 저장 마이그레이션과 접근 가능한 볼륨 UI

**완료 조건**
- 사용자 동작 전에는 재생하지 않고 탐험에서만 시작·재개한다.
- 레이스, 탭 숨김, 복구와 dispose에서 멈추며 지도·착륙·동전 중에는 유지한다.
- 재생·디코딩 실패가 게임을 막지 않고 관련 unit/E2E가 통과한다.
- v5 이하 저장의 기존 기록을 보존하고 기본 `musicVolume=0.35`로 v6에 마이그레이션한다.

### Milestone 28: RC7 Blender 에셋 리마스터

**상태: 완료 — 2026-07-14**

**결과물**
- RC7 드래곤 GLB와 재현 가능한 Blender 원본/스크립트
- 축제 중심섬, 바람 협곡, 구름 유적지 high/low GLB 6개
- 갱신된 GLB 검사 리포트

**완료 조건**
- 기존 드래곤/지역 필수 노드와 좌표 원점을 보존한다.
- 얼굴·날개·다리·꼬리와 지역별 랜드마크의 큰 형태가 게임 카메라에서 구분된다.
- project-authored 재질, vertex color, 유효 normal과 변환을 가지며 모든 GLB 예산 검사가 통과한다.
- low는 paired high보다 작고 지역당 high 60k/low 25k triangles, 12 primitives, 8 materials 이하를 지킨다.

### Milestone 29: Three.js 조명·대기·VFX와 성능

**상태: 완료 — 2026-07-14**

**결과물**
- 해뜰녘 주광, 하늘/안개 색, 구름 깊이, 제한된 그림자
- 탐험 속도와 랜드마크 깊이를 강화하는 저비용 VFX
- 기존 품질 tier와 220/260 거리 LOD에 맞춘 high/low 시각 차등

**완료 조건**
- high는 시각 깊이를 늘리고 low는 코스 가독성을 유지하면서 불필요한 비용을 제거한다.
- active gate, 두 바람실과 current coin이 새 구조물·안개·VFX에 가려지지 않는다.
- reduced-motion과 context recovery가 유지되고 자원 교체·해제 후 메모리 카운터가 증가하지 않는다.
- desktop/high 55/50fps, mobile/low 30fps, high 120 draw calls와 gzip 10MiB 예산을 지킨다.

### Milestone 30: RC7 통합 QA와 인계

**상태: 완료 — 2026-07-14**

**결과물**
- 세 지역 × 필수 5뷰포트 비주얼·오디오·회귀 증거
- `docs/MILESTONE_30_RC7_AUTOMATED_QA_REPORT.md`
- `docs/RC7_VISUAL_AUDIO_PLAYTEST_HANDOFF.md`

**완료 조건**
- test, typecheck, lint, build, E2E, performance, production, GLB 검사와 보안 감사가 통과한다.
- canvas nonblank/시간 변화, console/page/unhandled/network 오류 0, `visual-verdict` 90점 이상이다.
- 탐험 BGM, mute, volume, reload, 레이스 전환과 실패 fallback을 키보드·터치에서 확인한다.
- 최종 상태를 `RC7 / 비주얼·오디오 리마스터 자동 검증 완료 / 실기기·사람 플레이테스트 대기`로 둔다.

### Milestone 31: RC7.1 비행 오디오 감각 보정

**상태: 완료 — 2026-07-14**

**결과물**
- `Sovereign of the Sunrise Skies`가 첫 비행 시작 뒤 레이스와 탐험 사이에서 끊기지 않는 BGM 수명주기
- 실제 날개 하강 박자에 동기화된 저비용 펄럭임 효과음
- 짧고 귀여운 발진음을 대체하는 필터드 노이즈 기반 돌풍 `슈우웅` 효과음
- `docs/MILESTONE_31_RC7_1_AUDIO_POLISH_REPORT.md`

**완료 조건**
- 자동재생 제한을 지키면서 `비행 시작`과 `하늘 탐험` 모두 BGM을 시작하고 모드 전환, 음소거, 볼륨, 탭 숨김, dispose 계약을 단위/E2E 테스트한다.
- 날갯짓은 활성 비행 중 한 하강 박자당 한 번만 울리고 준비·일시정지·음소거 중에는 울리지 않는다.
- 돌풍은 상승 에지당 한 번만 울리며 고음 단일 발진음 없이 0.5초 이상의 공기성 노이즈 감쇠를 가진다.
- test, typecheck, lint, build와 실제 브라우저 오디오 디버그 스냅샷에서 오류 0을 확인한다.

### Milestone 32: 축제 중심섬 오픈월드 수직 슬라이스

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-07-14**

**결과물**
- `.omx/plans/prd-m32-open-world-vertical-slice.md`, `.omx/plans/test-spec-m32-open-world-vertical-slice.md`
- 다섯 project-authored 랜드마크와 세 착륙장을 가진 축제 중심섬 high/low GLB
- 세 상승기류, 탐험 충돌, 비밀 장소와 v7 발견 기록
- 기존 동전 기록전·레이스 미션을 연결하는 탐험 HUD/지도 여정
- BGM을 보존하는 저비용 탐험 환경음
- `docs/MILESTONE_32_OPEN_WORLD_VERTICAL_SLICE_REPORT.md`, `docs/M32_OPEN_WORLD_PLAYTEST_HANDOFF.md`

**완료 조건**
- GLB 필수 노드, 12 primitives, 8 materials, high 60k/low 25k triangle와 LOD/dispose 계약을 자동 검사한다.
- 고속 충돌·발견, 상승기류 힘, 다중 착륙, 동전 접근선, v7 마이그레이션과 오디오 수명주기를 실패 테스트부터 구현한다.
- 키보드와 터치가 탐험 진입부터 랜드마크·상승기류·비밀 장소·동전·착륙·비콘 미션까지 진행한다.
- 다섯 뷰포트 nonblank/시간 변화, console/page/network 오류 0, `visual-verdict >= 90`을 증명한다.
- 30초 네 성능 프로필, 10분 탐험 soak, 120 draw calls와 전체 gzip 10MiB 예산을 통과한다.

### Milestone 33: Sky League 오프라인 기록 경쟁

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-07-14**

**결과물**
- `.omx/plans/prd-m33-sky-league.md`, `.omx/plans/test-spec-m33-sky-league.md`
- 레이스 1개, 지역별 동전 3개, 미션별 6개의 로컬 Top 10과 순위·메달 순수 규칙
- 각 기록판 1위 비행의 결정적 캡처·검증·보간·진행 매칭과 비충돌 고스트 드래곤
- 레이스/동전 실시간 시간 차이 HUD, 기록판 패널과 재시도 중심 결과 화면
- 기존 전체 상태를 보존하는 v8 저장과 v7 이하 마이그레이션
- `docs/MILESTONE_33_SKY_LEAGUE_REPORT.md`, `docs/M33_SKY_LEAGUE_PLAYTEST_HANDOFF.md`

**완료 조건**
- 레이스·동전은 오름차순 시간, 미션은 등급 내림차순 뒤 시간 오름차순으로 안정 정렬하고 정확히 10개로 제한한다.
- v7의 레이스/동전 최고 기록을 기록판에 승계하고 미션 등급, 탐험 발견/위치, 오디오, 품질과 M32 진행을 손실 없이 v8로 마이그레이션한다.
- 60Hz 고정 스텝 캡처는 100ms 간격, 최대 10분의 유효·유한 샘플만 저장하며 각 기록판 1위가 바뀔 때만 고스트를 교체한다.
- 고스트 재생은 샘플 사이를 보간하고 동일 관문/동전 진행 구간에서 기준 도달 시각을 찾아 실시간 시간 차이를 계산한다.
- 레이스/미션 결과와 탐험 동전 결과에서 순위·텍스트 메달·Top 10·재시도를 확인하며 키보드와 터치로 기록판을 탐색한다.
- 짧은 모바일 가로 화면에서도 재시도 동작이 viewport 안에 있고 모든 기록판 동작이 44x44 CSS px, safe-area, 키보드 포커스를 지킨다.
- 단위, 타입, 린트, 빌드, 전체 E2E, 프로덕션, 성능, 보안, gzip, visual-verdict 90 이상과 10분 soak를 통과한다.

### Milestone 36: 누적 미션 진행과 영구 해금

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-07-15**

**결과물**
- `.omx/plans/prd-m36-progressive-missions.md`, `.omx/plans/test-spec-m36-progressive-missions.md`
- 기존 6개 ID를 잇는 순수 진행 순서, 해금 파생, 다음 미션과 잠금 사유 규칙
- 완주 → 돌풍 → 무리스폰 → 시간 → 무충돌 → 종합으로 누적되는 평가 규칙
- 준비/`Esc` 선택기의 잠금 상태와 성공 결과의 `다음 미션` 동작
- v8 등급·Top 10·고스트를 그대로 사용하는 무필드 마이그레이션
- `docs/MILESTONE_36_PROGRESSIVE_MISSIONS_REPORT.md`, `docs/M36_PROGRESSIVE_MISSIONS_PLAYTEST_HANDOFF.md`

**완료 조건**
- 비어 있는 저장은 첫 미션만 열고, 브론즈 이상은 정확히 다음 미션을 열며, 후반 기록이 있는 기존 저장은 접근권을 잃지 않는다.
- 모든 잠긴 미션은 보이지만 선택할 수 없고 앞 미션 브론즈 요구를 한국어로 표시한다.
- 누적 조건의 경계와 모든 실패 원인을 순수 단위 테스트로 고정하고 비행/코스 파일은 변경하지 않는다.
- 성공 직후 다음 미션을 선택할 수 있고 최종 성공은 진행 종료를 명확히 알린다.
- test, typecheck, lint, build와 다섯 뷰포트 Playwright/시각 검증이 통과하며 v8의 모든 기존 데이터를 보존한다.

### Milestone 37: 비행 생명체 작업실

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-07-15**

**결과물**
- `.omx/plans/prd-m37-character-workshop.md`, `.omx/plans/test-spec-m37-character-workshop.md`
- 드래곤·그리핀·하늘가오리 캐릭터 카탈로그와 공통 Rig Blender/GLB 자산
- 해뜰녘·폭풍·달빛 팔레트, 없음·바람 고글·축제 리본 장식 조합
- 준비/일시정지에서 여는 별도 `캐릭터 공방`, 실시간 초안 미리보기, 적용·되돌리기와 포커스 복귀
- 기존 전체 데이터를 보존하는 v9 저장과 WebGL context recovery
- `docs/MILESTONE_37_CHARACTER_WORKSHOP_QA_REPORT.md`, `docs/RC11_CHARACTER_WORKSHOP_PLAYTEST_HANDOFF.md`

**완료 조건**
- 세 형태는 게임 카메라에서 실루엣만으로 구분되고 동일한 비행·충돌·기록 규칙을 사용한다.
- 세 팔레트는 몸·날개막·발광 역할을 일관되게 바꾸며 배경·관문 색을 바꾸지 않는다.
- 고글과 리본은 모든 종족에서 머리·꼬리에 안정적으로 붙고 날갯짓·선회·부스트 중 분리되지 않는다.
- 공방의 초안 변경은 저장하지 않고 3D 미리보기만 바꾸며, 적용은 v9에 저장하고 돌아가기·Esc는 원래 외형을 복구한다.
- 공방은 ready와 paused에서만 열리고 일시정지 시간·미션 시도·기록·고스트를 바꾸지 않는다.
- v8 이하는 기본 외형으로 v9가 되며 기존 필드가 손실되지 않고, 손상·미래 버전은 안전한 기본값으로 복구한다.
- 5개 필수 뷰포트에서 dialog 이름, label, Tab containment, 44px 조작, Apply/Back 노출, 스크롤·겹침 없음과 `visual-verdict >= 90`을 증명한다.
- 전체 단위, 타입, 린트, 빌드, Playwright, 프로덕션·gzip과 캐릭터별 성능 예산을 통과한다.

### Milestone 38: 수호수 아트 리빌드와 첫 하늘매듭 서막

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-07-16**

**결과물**
- `.omx/plans/prd-m38-guardian-creature-rebuild.md`, `.omx/plans/test-spec-m38-guardian-creature-rebuild.md`
- `docs/concepts/m38-ember-phoenix-concept.png`, `docs/concepts/m38-storm-white-tiger-concept.png`
- `해뜰녘 드래곤`, `잿불 봉황`, `폭풍 백호` 카탈로그와 종족별 시각 포즈
- 프로젝트 제작 봉황·백호 Blender 원본, 런타임 GLB와 재현 가능한 생성·내보내기·검사·미리보기 도구
- 선택 중인 수호수 설명과 준비/일시정지에서 여는 접근 가능한 `첫 하늘매듭` 서막
- 하늘동전·관문·미션·고스트를 하나로 설명하는 `docs/WORLD_STORY_BIBLE.md`
- 구 v9 종족 ID를 새 종족으로 이전하고 모든 진행을 보존하는 v10 저장

**완료 조건**
- 카탈로그는 `sunrise-dragon`, `ember-phoenix`, `storm-white-tiger`의 형태 3 × 팔레트 3 × 장식 3, 총 27개 조합만 제공한다.
- v9 `storm-griffin`은 `ember-phoenix`, `cloud-manta`는 `storm-white-tiger`로 일대일 이전되고 미션, 동전, Top 10, 고스트, 탐험, BGM과 품질 설정은 그대로 v10에 저장된다.
- 세 수호수는 같은 비행 물리, 속도, 충돌 반경, 카메라, 미션과 기록 조건을 사용하며 차이는 모델·재질·시각 포즈에만 있다.
- 봉황은 부리·왕관·세 겹 깃털·발톱·세 갈래 꼬리, 백호는 고양잇과 얼굴·네 다리·줄무늬·견갑 날개로 게임 카메라에서 즉시 구분된다.
- 신규 GLB는 공통 노드·표정·소켓·세 재질 계약, 삼각형·메시·프리미티브·gzip 예산과 착륙 최저점 게이트를 통과한다.
- 서막과 공방 설명은 ready/paused 상태와 저장을 바꾸지 않고 마우스·키보드·다섯 필수 뷰포트에서 접근 가능하다.
- 기존 미션 ID·해금·등급·판정 조건은 유지하고, 고스트는 적이 아닌 `비행의 메아리`로 설명한다.
- test, typecheck, lint, build, 전체 E2E, production, performance, audit, 결정적 export와 `visual-verdict >= 90`을 모두 통과한 뒤에만 완료 상태로 바꾼다.

### Milestone 39: 태양의 심장 · 용암 군도

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-07-20**

**결과물**
- `.omx/plans/prd-m39-volcanic-archipelago.md`, `.omx/plans/test-spec-m39-volcanic-archipelago.md`, `.omx/plans/implementation-m39-volcanic-archipelago.md`
- `volcanic-archipelago` high/low Blender GLB, 흑요석·냉각 유적·다리·분화구 의미 노드와 애니메이션 용암
- 순수 결정적 열기류·낙석·용암 파도·화산재 규칙과 품질/reduced-motion 대응 VFX
- 청록 냉각 수정 10개, 숨은 비행로, 지역 Top 10과 1위 고스트
- `heart-of-sun` 단일 미션 안의 냉각 봉인 3개→분화 탈출 4단계 코스와 Bronze/Silver/Gold 평가
- 코스별 기록·고스트·결과 분리, v11 저장과 기존 pause/workshop/story/recovery 호환
- 용암 앰비언스·위험 예고·봉인·탈출 음향과 봉황·백호의 시각 전용 환경 반응
- `docs/MILESTONE_39_VOLCANIC_ARCHIPELAGO_QA_REPORT.md`, `docs/M39_VOLCANIC_ARCHIPELAGO_PLAYTEST_HANDOFF.md`

**완료 조건**
- 네 번째 지역은 기존 420/500 스트리밍과 220/260 LOD 계약, GLB 의미 노드·삼각형·재질·primitive·gzip 예산을 통과한다.
- 냉각 수정은 정확히 10개이고 선분 판정·pause/map/landing/region unload 규칙과 지역 기록판·고스트를 기존 동전과 동일하게 사용한다.
- `heart-of-sun`은 `golden-knot` 브론즈 뒤에 열리고 봉인 세 개와 탈출을 순서대로 완료해야 하며 75/60/45초와 추가 통계 조건으로 등급을 평가한다.
- 용암 완주는 전체 첫 하늘매듭 best/Top 10/고스트와 축제 여정을 바꾸지 않고 해당 미션 기록과 고스트만 갱신한다.
- 위험은 최소 예고 시간 뒤에만 충돌하며 60Hz 고정 스텝과 고정 seed로 재현되고 세 수호수에 같은 비행·충돌·기록 조건을 적용한다.
- v10 전체 fixture가 v11로 무손실 이전되고 알 수 없는 지역·미션·위치와 손상 데이터는 안전하게 정규화되며 가짜 용암 진행을 만들지 않는다.
- ready/paused의 미션 선택·작업실·스토리, context recovery와 5개 뷰포트 접근성·safe area·reduced motion을 유지한다.
- 전체 단위·타입·린트·빌드·E2E·production·asset audit·결정적 export·10분 soak와 visual-verdict를 통과한다.
- 화산 탐험과 미션 모두 desktop/high 중앙값 55fps·하한 50fps, mobile/low 30fps, high 120 draw calls, gzip 10MiB를 지킨다.

### Milestone 41: 수호수 3D 모션 고도화

**상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-08-10**

**결과물**
- 세 수호수가 공유하는 순수 포즈 상태와 종족별 시각 모션 프로필
- 활공·순항·상승·하강·돌풍의 날개 상태 전이, 어깨·몸통·머리·꼬리 지연, 충돌 recoil의 결정적 규칙
- 기존 공통 Rig에만 적용되는 Three.js 런타임 변형과 카메라 가독성 회귀 검증
- `docs/MILESTONE_41_GUARDIAN_MOTION_QA_REPORT.md`

**검증 상태**
- 포즈·Rig·공정성 회귀, 전체 E2E, production, 5개 뷰포트, 10분 soak와 세 수호수의 비행 스크린샷 증거를 통과했다.
- `heart-of-sun`을 고를 때 이전 축제 시작점에서 요청되던 GLB를 막고, volcanic 스트리밍 컨테이너가 등록된 ready/countdown에 한 번 투명 draw로 VFX를 예열했다. 게임 규칙·물리·위험 타이밍은 바꾸지 않았으며 `npm run test:performance`의 화산 desktop/high은 60/56fps, mobile/low는 60/60fps(중앙값/최저 버킷)로 전역 하한을 통과했다.

**완료 조건**
- 동일한 `DragonPoseInput`과 60Hz step 시퀀스는 항상 동일한 포즈를 만들며, 30/60/120fps와 지터 host cadence가 동일한 simulation input을 전달할 때 결과가 일치한다.
- 활공·순항·상승·하강·부스트·충돌 상태는 순수 단위 테스트로 구분되고, 부스트의 강한 하강 날갯짓과 접힘은 한 번의 의도된 전이로만 발생한다.
- 동일 입력에서 세 프로필의 wing, body, head, tail 값이 구분되지만 모든 수호수의 `FlightState`, 카메라 목표, 관문·충돌·미션·기록 결과는 같다는 회귀 검증을 둔다.
- 런타임은 공통 Rig가 없는 fallback과 선택 피벗 누락을 안전하게 처리하고, 기존 GLB·재질·draw call·저장·고스트 수명주기를 바꾸지 않는다.
- 카메라는 다음 관문·두 바람실을 계속 읽히게 하며, reduced-motion에서 흔들림과 강한 FOV 변화를 새로 만들지 않는다.
- test, typecheck, lint, build, 전체 E2E, production, 5 viewport canvas/console/a11y 확인, 수호수 3종 시각 증거, 성능·gzip·10분 soak를 M39 예산 안에서 통과한다.

### Milestone 42: 게임감 그래픽 패스

**상태: 자동·실브라우저 검증 완료 / 실기기·사람 플레이테스트 대기 — 2026-08-11**

**플레이어 결과**
- 정적인 하늘 섬 디오라마가 아니라, 고도·속도·목표 접근·통과 보상이 연결된 공중 레이스 세계로 읽힌다.
- 다음 관문과 두 바람실은 항상 먼저 보이되, 관문 직전에는 빛·펄스·공기 흐름으로 도착 순간이 분명해진다.
- 탐험 수집물은 기존 규칙을 바꾸지 않고도 가까이 갈 이유가 있는 작은 보상 신호를 가진다.

**수정 소유권**
- `src/game/world/createWorld.ts`: 기존 스카이·안개·키/림 조명과 구름 리듬의 대비 계층.
- `src/game/world/createFlightSandbox.ts`: 활성 관문 접근/통과 피드백, 바람실·부스트 streak 리듬.
- `src/game/world/createCoinCourseVisual.ts`: 인스턴싱을 보존하는 동전·냉각 수정 부유·발광 리듬.
- `src/game/world/createDragon.ts`: 플레이어와 겹칠 때도 수호수 실루엣을 가리지 않는 경량 고스트의 투명도·면 처리.
- `src/game/ui/RaceHud.ts`와 `src/styles.css`: 짧은 가로 화면에서 활성 관문 축을 비켜나는 미션 요약 배치.
- 필요한 범위의 해당 단위 테스트와 브라우저 시각 QA만 함께 수정한다.

**제약과 완료 조건**
- 새 GLB·텍스처·외부 의존성·포스트프로세싱·입력·코스·저장 필드는 추가하지 않는다.
- race/mission/coin 규칙, 수호수 물리와 고스트·기록 계약은 바꾸지 않는다.
- low/reduced-motion은 강한 펄스·입자량을 줄이고, desktop/high 55/50fps, mobile/low 30fps, high 120 draw calls, gzip 10MiB를 지킨다.
- `test`, `typecheck`, `lint`, `build`, 관련 E2E, 5개 뷰포트 실브라우저 canvas/console 확인과 `visual-verdict >= 90`을 통과한다.

**검증 상태**
- `npm test` 53 파일·620 테스트, `npm run typecheck`, `npm run lint`, `npm run build`를 통과했다.
- 1440×900, 1280×720, 844×390, 390×844, 320×568 실브라우저 캡처에서 console 오류 없이 `visual-verdict 92/90`을 기록했고, 가로 844×390의 미션 요약은 중앙 관문 축 밖에 배치된다.
- 탐험 4개 지역 스트리밍·동전 4개 지역 최고기록·화산 4단계 도전 E2E는 12 통과/8 의도된 프로젝트 조건 skip을 기록했다.
- `npm run test:performance`는 7.2분에 2 통과했다. 일반·탐험·화산 desktop/high와 mobile/low가 모두 60fps였고, 가장 무거운 화산 desktop 미션은 63 draw calls·80,316 triangles였다.

### Milestone 43: 첫 3분 플레이 경험 완성

**상태: 자동·실브라우저 검증 완료 / 사람·실기기 플레이테스트 미실시 — 2026-08-28**

**기준선과 작업 순서**
- 시작 커밋은 `016b400`이며 M41 모션·M42 그래픽은 보존한다. 수정 전 단위 테스트는 53 파일·620개 통과했다.
- 기존 키보드·터치 흐름 테스트의 관문 통과 훅과 순수 모델의 자동 조향 테스트는 실제 전체 입력 경로의 증거와 구분한다. 기존 빠른 계약 테스트는 유지한다.
- 일반 준비 화면에서 시작해 8개 실제 관문을 키보드 또는 터치 입력으로 통과하는 브라우저 기준선을 먼저 기록한다. 테스트 제어기는 읽기 전용 상태와 실제 입력 이벤트만 사용한다.
- 기준선에서 확인한 안내·목표 가림·충돌/복귀·결과 화면 문제를 재현 테스트로 고정한 뒤 영향이 큰 것부터 수정한다.
- 수정 후 같은 경로와 5개 뷰포트를 다시 확인하고 단위·정적·브라우저·성능 결과를 `docs/M43_FIRST_PLAY_QA_REPORT.md`에 기록한다.

**수정 소유권**
- `tests/e2e/first-play.spec.ts`: 빠른 상태 전이 테스트와 구분되는 실제 입력 완주·재도전, 화면·경로·오류 증거.
- `src/game/ui/RaceHud.ts`, `src/game/ui/gateIndicator.ts`, `src/styles.css`: 재현된 안내·가림·결과 동작 문제와 대응 테스트.
- `src/game/createRenderer.ts`, `src/game/world/createFlightSandbox.ts`: 필요할 때 기존 렌더/복귀 피드백 연결만 조정한다. 물리·진행 규칙은 변경하지 않는다.
- 제품 목표·본 계획·QA 보고서 이외의 무관한 문서와 기존 로컬 설정은 변경하지 않는다.

**완료 조건**
- 키보드와 터치 각각 0→8 순차 통과, 결과 기록, 한 번의 재도전 동작과 정상 카운트다운 복귀를 실제 입력으로 증명한다.
- 완주 증거에는 `qaPassCheckpoint`, `qaCourse`, 순간이동, 직접 상태 변경, 가짜 시간, 비활성화한 충돌을 사용하지 않는다.
- 1440×900, 1280×720, 844×390, 390×844, 320×568에서 목표와 조작 UI가 가려지지 않는다. canvas nonblank/시간 변화와 console/page 오류 0을 확인한다.
- test, typecheck, lint, build와 관련 E2E를 통과하고 30초 desktop 중앙값 55fps·최저 50fps, mobile/low 30fps를 유지한다.
- 수정 전후 증거, 발견/수정한 문제, 남은 위험을 보고하며 자동 입력과 사람·실기기 플레이테스트 결과를 혼동하지 않는다.

**추가 재현 사항**
- 실제 가로 터치 비행에서 progress 4 직후 관문 중심이 우상단 진행 카운터 뒤에 놓이는 것을 재현했다. 기존 방향표가 화면 밖·작은 관문만 처리하던 조건을 HUD 가림에도 적용하고, UI 레이아웃 경계는 캐시해 매 프레임 DOM 측정 비용을 피한다.
- 동전 안내의 기존 동작은 유지하고 레이스 안내만 보완한다. 변경 후 실입력·화면·성능 검증을 다시 실행한다.

**검증 결과**
- 실제 키보드/CDP 터치의 5개 화면 × 완주·양수 진행 복귀·실제 충돌 15개 경로를 모두 통과했다. 관문 통과 훅·직접 위치 변경·가짜 시간은 완주 증거에 사용하지 않았다.
- 전체 단위 53 파일·629개, typecheck·lint·build, 관련 E2E 47개를 통과했다. 기존 기기별 조건 33개만 skip이며 새 실제 입력 테스트에는 skip이 없다.
- 12개 30초 성능 프로필은 모두 중앙값 60fps, 데스크톱 최저 60fps·모바일 최저 59fps, 최대 67 draw calls로 예산을 만족했다.
- 캔버스 픽셀·시간 변화, 오류 0, 가림 전후 화면과 보고서를 `docs/M43_FIRST_PLAY_QA_REPORT.md`에 남겼다. 커밋·푸시·배포는 별도 요청 전 수행하지 않는다.

### Milestone 44: 첫 하늘매듭 6관문 스피드 패스

**상태: 구현·자동·실브라우저 검증 완료 / 전역 성능 단일버킷 변동 기록 / 실기기 미실시 — 2026-08-30**

**플레이어 결과**
- 첫 하늘매듭은 기존 앞 6개 관문에서 끝나며, 첫 실행부터 결과 화면까지 60~105초 안에 도달하는 빠른 한 판으로 전개된다.
- 속도나 조향을 공격적으로 바꾸지 않아 기존 수호수의 비행 감각과 모바일 조작 여유는 유지한다.
- 선택 흐름은 `첫 하늘매듭 → 끊기지 않는 매듭 → 질풍 시간전 → 구름 한 점 없이 → 황금 하늘매듭 → 태양의 심장`으로 단순화한다.

**수정 소유권**
- `docs/PRODUCT_GOAL.md`, `docs/IMPLEMENTATION_PLAN.md`: 6관문·60~105초 목표, 미션 재조정과 레거시 기록 정책.
- `src/game/world/course.ts`와 코스 테스트: `gate-01..06`만 활성화하고 거리·완주 시간 계약을 고정한다.
- `src/game/missions/missionRules.ts`, `src/game/ui/RaceHud.ts`와 해당 테스트: 100/85/75초 및 2~6회 돌풍 기준과 표시 문구를 일치시킨다.
- 같은 파일에서 활성 미션 목록을 저장 호환용 전체 ID와 분리해 `돌풍 조율사`를 선택기·해금·다음 미션에서 제외한다.
- 관련 Playwright 시나리오: 하드코딩된 8회 반복을 실제 코스 길이 또는 6회로 바꾸고 실제 입력 완주 경로를 재검증한다.

**기록 호환 정책**
- `bestTimeMs`, 레이스·미션 Top 10, 미션 등급과 고스트를 초기화하지 않고 v11 형식을 유지한다.
- 기존 고스트의 진행 0~6은 새 코스와 동일한 좌표·순서를 사용하므로 실시간 구간 비교에 계속 유효하다.
- 예전 8관문 최종 시간은 새 6관문 기록에 불리한 레거시 값으로만 남으며 새 기록이 쌓일수록 자연스럽게 밀려난다. 값을 줄여 쓰거나 가짜 6관문 기록으로 변환하지 않는다.
- `boost-mastery`는 알려진 레거시 ID로 유지해 기존 등급·미션 Top 10·고스트를 파싱·저장한다. 신규 선택 목록에는 노출하지 않고 레거시 브론즈 이상은 `no-respawn` 해금을 계속 보장한다.

**완료 조건**
- 첫 하늘매듭이 정확히 6개 관문이고 직접 비행 거리가 약 1,466 units, 무부스트 자동 조향 완주가 60~105초 범위임을 단위 테스트로 고정한다.
- 미션 기준은 첫 완주 100/90초, 돌풍 2/4/5회, 무리스폰 2회·100/4·90/5, 시간전·무충돌 100/2·85/4·75/5, 황금 매듭 90/4·85/5·75/6으로 평가·표시가 일치한다.
- 미션 선택기는 정확히 6개 활성 항목(첫 하늘매듭 5개와 태양의 심장)을 표시하고 `boost-mastery` 옵션을 만들지 않는다. 첫 완주 결과의 다음 미션은 `no-respawn`이다.
- 태양의 심장 4단계와 75/60/45초, 비행 물리·충돌·리스폰·저장 형식·M41~M43 결과는 바뀌지 않는다.
- 키보드와 터치 각각 실제 입력으로 0→6 완주·결과·재도전을 통과하고 다섯 필수 뷰포트에서 `관문 n/6`, 목표·조작 UI, canvas nonblank/시간 변화, console/page 오류 0을 확인한다.
- test, typecheck, lint, build, 관련 E2E와 성능 측정이 기존 desktop/high 55/50fps, mobile/low 30fps, high 120 draw calls 예산을 유지한다.

**검증 결과**
- 전체 단위 53파일·630개, typecheck, lint, build를 통과했다.
- QA 관문 훅 기반 키보드·터치·오디오·미션·접근성 E2E는 45 통과/장치별 35 의도된 skip, 캔버스·반응형·최종 시각 E2E는 30개 전부 통과했다.
- 실제 키보드/CDP 터치 5개 뷰포트는 모두 0→6 완주·결과·재도전을 통과했다. 기록은 61.68~62.95초, console/page/response 오류는 모두 0이었다.
- 첫 하늘매듭 단독 재측정은 desktop/high 60fps 중앙값·60fps 최저 1초·63 draw calls, mobile/low 60/60fps·38 draw calls로 예산을 통과했다.
- 전역 `test:performance`는 두 번의 측정에서 한 개의 1초 버킷이 서로 다른 장면에서 49fps와 46fps로 흔들렸다. 각 2초 최저는 52.5fps였고 첫 하늘매듭 저하는 재현되지 않았으므로 M44 회귀와 분리해 `docs/M44_SKYKNOT_SPEED_PASS_QA_REPORT.md`에 남긴다.
- 활성 미션 간소화 E2E는 5개 뷰포트에서 19 통과/입력 장치별 11 의도된 skip이었다. 선택기는 6개 활성 항목만 표시하고 첫 완주 뒤 `no-respawn`을 선택했으며 `boost-mastery` 옵션은 생성하지 않았다.
- v11 왕복 단위 테스트에서 레거시 `boost-mastery` 등급·미션 Top 10·고스트가 그대로 보존됨을 확인했다.

### Milestone 45: 수호수·군도 그래픽 고도화

**상태: 구현·자동·브라우저·성능 검증 완료 — 2026-09-07 / 사람·실기기 미실시**

- 드래곤 생성 스크립트와 원본/GLB, 봉황·백호 생성 스크립트와 원본/GLB, 네 지역 생성 스크립트와 high/low GLB를 소유권별로 분담한다.
- 레이스 월드 `createWorld.ts`의 섬·구름·스카이 색을 개선하고 기존 인스턴싱·품질 정책을 따른다.
- 먼저 현재 브라우저 화면과 원본/GLB를 보관하고 기존 검사 도구로 구조·예산을 확인한다.
- 각 산출물은 기존 제작 도구를 통해 재생성하고 공통 Rig·semantic origins·착륙 및 수집 경로를 검사한다.
- 적용 뒤 단위·typecheck·lint·build, 5뷰포트 visual/canvas/health, 수호수 교체·지역 진입과 성능을 검증하고 전후 비교를 보고한다.
- 커밋·푸시·배포는 이번 작업에 포함하지 않는다.

검증 결과: 3수호수·4지역 high/low GLB 11개 기존 검사 통과. 단위 631개·typecheck·lint·build, 5뷰포트 통합 브라우저 60개·production 5개 통과. 실제 키보드/터치 완주는 61.93/61.65초, 6관문과 재도전이 정상이다. 12개 30초 성능 프로필 모두 중앙값/최저 60fps, 최대 67 draw calls. `docs/M45_GRAPHICS_QA_REPORT.md`에 원본·예산·검증과 남은 실기기 확인을 기록했다.

### Milestone 46: 비전투 탐험 RPG 첫 챕터

- 순수 의뢰/성장/보상 규칙과 공간 데이터, v12 저장, 새 AdventureHud, Blender 둥지/풍차/의뢰인 자산을 소유권별로 병렬 제작한다.
- 루트가 createRenderer에 기본 탐험 진입, 공간 상호작용, 감지, 영구 시각 상태, 기존 경쟁 모드 분리를 통합한다.
- 먼저 의뢰와 중복 보상 방지의 실패 단위 테스트를 고정하고 실제 플레이 가능한 구조→항로→복구 순으로 통합한다.
- 기존 원본과 M43~M45 변경을 보존하고 새 자산은 별도 생성기/원본/GLB로 만든다. 현재 gzip 9.73MiB 기준에서 전체 10MiB 예산을 다시 확인한다.
- 실제 입력 E2E는 기본 진입부터 3의뢰·보상 적용·재접속을 완주한다. 빠른 QA 훅 검증과 별도 증거를 남긴다.
- 검증은 `docs/M46_RPG_SPEC.md`의 요구사항별 표와 5뷰포트 화면, GLB 검사, 단위·정적·production·성능 결과로 감사한다.
- 커밋·푸시·배포하지 않는다.

## 테스트 매트릭스

| 레벨 | 검증 대상 | 핵심 시나리오 |
| --- | --- | --- |
| 단위 | 순수 레이스/비행/저장 로직 | 관문 순서, 선분 교차, 부스트, 일시정지, 손상 저장값 |
| 통합 | 게임 상태와 입력/UI 연결 | 카운트다운, 리스폰, 완주, 재시도, 탭 비활성화 |
| 브라우저 | 실제 WebGL과 반응형 UI | 렌더 비어 있지 않음, 키보드/터치, 리사이즈, 콘솔 오류 |
| 시각 | 화면 구성과 움직임 | 드래곤/바람실/관문 노출, HUD 겹침, 시간에 따른 픽셀 변화 |
| 성능 | 30초 플레이 샘플 | fps 중앙값, DPR, 드로우콜/인스턴싱, 전송량 |
| 미션 | 순수 규칙과 레이스 이벤트 연결 | 성공/실패/등급, 통계, 일시정지/재시도/복구, v3 마이그레이션 |
| 탐험 | 순수 비행/착륙/지역/저장 | 호버, 착륙 전이, 스트리밍 히스테리시스, 발견, v4 마이그레이션 |
| 오디오 | 순수 수명주기/저장/실브라우저 | unlock, 레이스/탐험 공통 BGM, 날갯짓, 돌풍, mute, volume, 가시성, v6 마이그레이션 |
| RC7 시각 | Blender GLB/Three.js/5뷰포트 | 노드·예산, 실루엣, 재질, 조명, LOD, 픽셀 변화, visual-verdict |
| Sky League | 순위/저장/고스트/UI/장시간 | Top 10 정렬·v8 마이그레이션·결정성·델타·재시도·자원 안정성 |
| 누적 미션 | 해금/평가/저장 호환/UI | 브론즈 해금·누적 조건·후반 기록 승계·Esc 선택·다음 미션 |
| 캐릭터 공방 | 카탈로그/GLB/저장/UI/복구 | 3종 실루엣·팔레트·장식·초안 취소·v9·5뷰포트·context recovery |
| M38 수호수 | 카탈로그/Blender GLB/v10/서막/세계관 | 구 ID 일대일 이전·공통 Rig/재질/소켓·해부 실루엣·공정한 물리·5뷰포트 |
| M39 용암 군도 | 지역/코스/위험/수집/저장/오디오/성능 | 4지역·40수집물·3봉인+탈출·코스별 기록·v11·예고 위험·5뷰포트·10분 soak |

## 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 멋은 있지만 조작이 답답함 | Milestone 1에서 회색 상자 수준으로 먼저 조작 테스트 |
| 고속에서 관문을 건너뜀 | 위치 점 검사가 아닌 선분-평면 교차와 단위 테스트 사용 |
| 모바일 GPU 과부하 | DPR 상한, 인스턴싱, 제한된 그림자, 저품질 모드 |
| UI가 3D 장면을 가림 | 관문을 중심에 두고 HUD를 가장자리에 고정, 지정 뷰포트 시각 QA |
| 월드 범위가 무제한으로 커짐 | Milestone 39를 승인된 4개 지역, 2개 코스, 수호수 3종으로 고정 |
| 참고 사이트 복제처럼 보임 | 고유한 바람실, 군도, 드래곤 동작과 팔레트를 제품 기준으로 사용 |
| 고품질 드래곤이 드로우콜을 폭증시킴 | 런타임 피벗별로 필요한 메시만 유지하고 정적 부품을 병합, high 120 draw-call 게이트 고정 |
| 미션 조건과 실제 플레이 상태가 어긋남 | 렌더 상태를 읽지 않고 레이스 이벤트로 순수 시도 통계를 갱신해 테스트 |
| 미션 HUD가 관문/터치 입력을 가림 | 준비/비행/결과 정보 밀도를 분리하고 5뷰포트 시각 QA 반복 |
| 탐험이 기존 레이스를 깨뜨림 | 비행 모델과 HUD를 모드별로 분리하고 비콘 진입에서만 기존 레이스 상태로 전환 |
| 지역 경계에서 로드가 떨림 | 420/500 units 로드/언로드 히스테리시스와 순수 선택 테스트 |
| AAC 반복 경계에서 공백이나 클릭이 들림 | 원본에서 tail/head crossfade 스트리밍 마스터를 재현하고 자동 상태 테스트와 실제 청취 인계로 검증 |
| 시각 리마스터가 모바일 GPU를 초과함 | RC6 기준선을 먼저 기록하고 high/low GLB·그림자·VFX를 각 수직 슬라이스마다 다시 측정 |
| BGM 자동재생 정책으로 오류가 남음 | 사용자 동작 이후 unlock하고 모든 play/decode rejection을 비차단 처리 |
| Top 10 렌더가 매 프레임 DOM을 재생성함 | 기록 서명 변경 때만 목록을 갱신하고 실시간 델타는 고정 텍스트 노드만 변경 |
| 고스트 저장이 localStorage 한도를 압박함 | 100ms 양자화 샘플, 10분 상한, 기록판별 1위 하나만 저장하고 실패를 비차단 처리 |
| 고스트 매칭이 잘못된 지름길에 붙음 | 동일 관문/동전 진행 구간과 단조 증가 힌트 안에서만 최근접 선분을 선택하고 거리 상한 밖에서는 델타를 숨김 |
| 짧은 가로 화면에서 Top 10이 재시도를 밀어냄 | 결과 요약/고정 동작과 별도 스크롤 기록판을 분리하고 실제 viewport 노출을 E2E로 고정 |
| 기존 후반 미션 기록이 새 순서에서 잠김 | 가장 뒤의 유효 등급/기록 위치까지 앞 단계와 다음 단계 해금을 파생하되 가짜 기록은 생성하지 않음 |
| 준비와 Esc 선택기의 잠금 상태가 어긋남 | 한 개의 순수 해금 결과와 잠금 사유 포맷을 두 선택 흐름이 공유하고 5뷰포트 E2E로 비교 |
| 세 캐릭터를 동시에 올려 메모리와 draw call이 증가함 | 선택된 플레이어와 활성 고스트만 transactional swap하고 이전 GLB를 즉시 dispose |
| 외형마다 조작·충돌 이점이 생김 | 시각 루트만 교체하고 기존 고정 충돌 반경·비행 상태·카메라 목표를 공유 |
| 짧은 화면에서 공방이 기존 pause 패널을 밀어냄 | 기존 패널에 행을 추가하지 않고 별도 dialog/bottom sheet와 고정 적용 동작 사용 |
| 빠른 초안 변경에서 늦은 GLB 응답이 최신 선택을 덮음 | 요청 세대 번호를 사용하고 최신 로드 성공만 원자적으로 교체 |
| 구 v9 종족 ID를 제거하면서 플레이어 선택이나 기록이 손실됨 | 엄격 타입 가드와 별도로 구 ID 일대일 정규화를 두고 전체 v9 fixture로 모든 필드 보존을 검증 |
| 삼각형 수만 늘고 봉황·백호가 조립된 기본 도형처럼 보임 | 콘셉트 실루엣, 연속 해부 구조와 종족별 필수 특징을 inspector와 독립 시각 판정에 함께 고정 |
| 세계관이 전용 능력이나 전투 요구로 범위를 넓힘 | 이야기를 기존 코인·관문·미션·고스트의 설명층으로 제한하고 모든 수호수의 물리·기록 계약을 공유 |
| 짧은 용암 코스가 기존 전체 기록을 덮음 | `RaceCourseId`로 기록 소유권을 분리하고 첫 하늘매듭 코스만 legacy best/Top 10을 갱신 |
| 다른 코스의 고스트가 fallback으로 나타남 | 용암 미션은 해당 미션 1위 고스트만 사용하고 전체 레이스 fallback을 금지 |
| 낙석·용암 파도가 보이지 않은 채 충돌함 | 상태 전이에 최소 1.5/2초 telegraph 구간을 두고 색 외 형태·음향 신호와 순수 시간 테스트를 고정 |
| 화산 VFX가 모바일 성능과 가독성을 무너뜨림 | InstancedMesh/Points와 한 개 lava shader를 사용하고 low/reduced-motion 수량·속도를 낮춰 전용 성능 프로필로 측정 |
| v11 확장에서 기존 동적 키 데이터가 사라짐 | 완전한 v10 fixture로 모든 기록·고스트·탐험·오디오 필드 보존과 용암 데이터 미합성을 검증 |

## 구현 시작 시 첫 작업

1. `docs/PRODUCT_GOAL.md`의 상태를 승인됨으로 바꾼다.
2. Milestone 0의 프로젝트 패키지와 검증 스크립트를 만든다.
3. Milestone 0 소유권 표의 레이스 전이와 관문 기하 테스트만 먼저 작성하고 통과시킨다.
4. Milestone 0 빌드와 정상/강제 WebGL 실패 브라우저 검증을 끝낸다.
5. 그 다음 Milestone 1에서 비행/부스트 테스트와 단색 비행 샌드박스를 시작한다.
6. 조작이 통과한 뒤에만 Milestone 2 이후의 레이스와 시각 효과를 확장한다.
