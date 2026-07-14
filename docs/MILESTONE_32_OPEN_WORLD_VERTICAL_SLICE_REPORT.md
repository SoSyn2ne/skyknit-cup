# Milestone 32 오픈월드 수직 슬라이스 보고서

> 상태: **자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 기준일: 2026-07-14
>
> 브랜치: `codex/m32-open-world-vertical-slice`

## 결론

Unity로 이전하지 않고 기존 Vite + TypeScript + Three.js 게임 안에서 축제 중심섬을 하나의 완결된 오픈월드 수직 슬라이스로 확장했다. 조잡한 기본 도형 장식 대신 프로젝트 자체 제작 Blender 원본과 high/low GLB를 사용하고, 서로 다른 실루엣을 가진 다섯 랜드마크, 세 착륙장, 세 상승기류, 비밀 장소와 저비용 충돌을 한 지역에 연결했다.

기존 10개 하늘동전 기록전, 12개 관문의 레이스와 6개 선택 미션은 그대로 유지했다. 탐험 HUD와 지도는 이 기능들을 5단계 축제 여정으로 묶으며, 랜드마크·상승기류 발견은 기존 기록과 함께 v7 로컬 저장에 남는다. `Sovereign of the Sunrise Skies` BGM도 유지하고, 그 위에 탐험 바람층과 발견·상승기류 큐를 추가했다.

Blender 검사와 독립 시각 판정, 전체 E2E, 최종 30초 성능, 프로덕션 번들, 10분 soak를 모두 통과했다. 자동 게이트는 완료했으며 실제 10~15분 길찾기, 실기기 입력·발열과 사람 청취 판정은 별도 플레이테스트로 넘긴다.

## 플레이어 결과

| 장소 | 게임 내 이름 | 역할 | 주요 상호작용 |
| --- | --- | --- | --- |
| `Dawnwing Airfield` | 새벽날개 비행장 | 시작점과 중심 착륙장 | 이륙, 착륙, 첫 랜드마크 발견 |
| `Sunweave Spire` | 햇실 첨탑 | 수직 탐험과 전망대 | 첨탑 나선류, 탑 착륙장 |
| `Crown Race Arch` | 왕관 레이스 아치 | 기록 도전 진입점 | 아치 순풍, 선택 레이스 미션 시작 |
| `Wind Loom` | 바람 직조기 | 상승기류를 시각화하는 구조물 | 항구 상승류, 중앙 통과 비행선 |
| `Whispering Grotto` | 속삭임 동굴 | 지도 밖 비밀 목표 | 비밀 발견, 동굴 선반 착륙 |

세 착륙장은 `festival-hub-pad`, `festival-tower-pad`, `festival-grotto-pad`다. 세 바람 지점은 `harbor-lift`, `spire-spiral`, `arch-tailwind`이며 중심에 가까울수록 강하고 경계 밖에서는 힘이 0이 된다.

## 10~15분 반복 플레이 목표

이 시간은 첫 사람 플레이에서 확인해야 할 제품 목표이며, 자동 테스트의 실행 시간과 같다는 뜻은 아니다.

| 구간 | 목표 시간 | 플레이 목표 |
| --- | ---: | --- |
| 출발 | 0~1분 | 준비 화면에서 미션을 고르고 `하늘 탐험` 시작 |
| 장소 읽기 | 1~4분 | 공개 랜드마크 4곳과 상승기류 3곳 통과 |
| 탐색 확장 | 4~6분 | 속삭임 동굴 발견, 세 착륙장에서 착륙·재이륙 |
| 기록 만들기 | 6~10분 | 축제 중심섬 하늘동전 10개를 순서대로 수집해 첫 기록 저장 |
| 도전 마무리 | 10~15분 | 왕관 레이스 아치에서 선택 미션에 들어가 12개 관문 완주 |

완료한 기록을 초기화하지 않으므로 이후 세션에서는 동전 기록 단축, 다른 미션 등급, 더 빠른 레이스 기록을 목표로 같은 동선을 반복할 수 있다.

## 5단계 축제 여정

`src/game/world/festivalHubActivities.ts`의 순수 규칙은 다음 순서로 하나의 목표만 HUD에 표시한다.

1. 비밀 장소를 제외한 공개 랜드마크 4곳 발견
2. 상승기류 3곳 통과
3. 속삭임 동굴 발견
4. 축제 중심섬 하늘동전 최고 기록 생성
5. 왕관 레이스 아치에서 레이스 완주 기록 생성

지도는 랜드마크 `n/4`, 상승기류 `n/3`, 비밀 발견 여부, 동전 최고 기록, 선택 미션과 왕관 레이스 아치 도전 안내를 함께 보여 준다. 새 장소는 별도의 polite live region으로 잠시 알리고, 프레임마다 바뀌는 목표 문구를 스크린리더에 반복해서 읽히지 않는다.

## 월드 규칙과 런타임 통합

- 랜드마크와 상승기류 발견은 이전·현재 위치 선분을 사용해 고속 통과에서도 누락하지 않는다.
- 상승기류는 60Hz 탐험 비행에만 합성하고 중심 거리의 제곱 감쇠를 적용하며 합성 속도를 12로 제한한다.
- 구조물 충돌은 드래곤 반경 1.2의 swept-sphere 판정과 14개 저비용 구형 프록시를 사용한다.
- Wind Loom은 양쪽 기둥을 높이 12~35 구간에서 막되 중앙 비행 통로를 비워 둔다.
- 충돌은 레이스 기록을 바꾸지 않고 탐험 속도만 감쇠하며 cooldown 동안 중복 충돌을 만들지 않는다.
- 지도를 열면 비행·바람·충돌·발견·저장 타이머를 고정하고 보이지 않는 착륙·이륙 입력도 차단한다. BGM 위치는 그대로 이어진다.
- 착륙 상태 저장은 reload 뒤 세 착륙장 중 실제 위치의 패드를 다시 판정해 같은 x/z에서 재이륙한다.
- high 품질은 상승기류당 리본 4개, low 품질은 2개를 사용한다. 모든 리본은 하나의 `InstancedMesh`로 그려 활성 상태에서 draw call 1개만 추가한다.
- 지역 GLB 스트리밍, 220/260 units LOD 히스테리시스, 지역 `clear()`와 세션 `dispose()` 경계는 기존 계약을 유지한다.

## Blender·GLB 자산

재현 가능한 원본과 스크립트는 다음 경로에 있다.

- `assets/source/world/skyknit-world-rc7.blend`
- `tools/blender/build_world_art.py`
- `tools/blender/inspect_world_glb.py`
- `public/assets/models/world/festival-hub-high.glb`
- `public/assets/models/world/festival-hub-low.glb`

| LOD | bytes | triangles | render meshes | primitives | materials | inspector errors |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| high | 1,649,100 | 20,196 | 9 | 11 | 6 | 0 |
| low | 494,000 | 6,368 | 9 | 11 | 6 | 0 |

두 LOD 모두 `RegionRoot`, `LandingPad`, `FestivalAirfield`, `FestivalTower`, `FestivalFlags`, `RaceArch`, `WindLoom`, `SecretGrotto`, `TowerLandingPad`, `GrottoLandingPad`, `FestivalAccents`를 가진다. 모든 렌더 메시에는 vertex color가 있고 invalid normal과 non-finite transform은 없다.

금색 강조 재질은 roughness `0.34`, metallic `0.14`, emission peak `0.096`이고, 룬 재질은 roughness `0.30`, metallic `0.04`, emission peak `0.2432`다. 외부 텍스처나 외부 모델은 추가하지 않았다.

10개 동전 중심의 표면 여유는 high/low 모두 최소 3.04m 이상이며, 동전 사이 선분 경로는 high `2.0095m`, low `2.0759m` 이상이다. inspector의 요구 여유는 1.2m이며 두 LOD 모두 오류 없이 통과했다.

### 결정성 해시

| 파일 | SHA-256 |
| --- | --- |
| `skyknit-world-rc7.blend` | `4D5758CE506427E3D8C983F1A140BBF909EC92A4B70698F7E542FAB325711A0D` |
| `festival-hub-high.glb` | `887619664B4411C8AC04EEC8EE03F9E289E7C7C600E0F4332FEBF16AD29C7878` |
| `festival-hub-low.glb` | `DE660CE82E504C2DC3D142B7CEAB7E2DC7E30504B77F748C83F9EBD3DEAA8B87` |

## 저장 v7

저장 키는 `skyknit-cup:settings`이며 현재 문서는 `version: 7`이다. v7은 다음 상태를 함께 보존한다.

- 레이스 최고 기록과 6개 미션 최고 등급
- 세 지역 하늘동전 최고 기록
- 음소거, BGM 볼륨, 품질 설정
- 탐험 위치, 방향, 착륙 상태, 발견 지역과 목적지
- 축제 중심섬 랜드마크 발견 ID와 상승기류 통과 ID

v1 레거시 기록과 v2~v6 설정은 기존 값을 유지한 채 v7로 마이그레이션한다. 중복·알 수 없는 랜드마크와 상승기류 ID, 손상 위치와 유효하지 않은 기록은 안전하게 제거하거나 기본값으로 복구한다. 새 발견, 동전 기록과 레이스 기록은 reload와 WebGL context recovery 뒤에도 유지된다.

## 오디오

- `Sovereign of the Sunrise Skies` Ogg/AAC 스트리밍 루프와 BGM 재생 위치를 그대로 보존한다.
- 첫 사용자 동작 전에는 BGM과 AudioContext를 시작하지 않는다.
- 첫 비행 시작 뒤에는 레이스·탐험·미션 전환에서도 BGM 재생 위치가 이어진다.
- 탐험에서는 낮은 band-pass 바람층을 항상 깔고, 상승기류 강도에 따라 필터와 gain을 높인다.
- 랜드마크 첫 발견은 두 음의 짧은 큐, 상승기류 첫 진입은 필터드 노이즈 큐를 한 번 낸다.
- 레이스 전환에서는 환경 바람만 0으로 내리고 BGM은 유지한다.
- mute, 숨김 탭, context recovery와 dispose는 전체 오디오를 안전하게 멈추고 복구하며, 0% BGM 볼륨은 음악만 멈춘다.
- 날갯짓 에어 펄스와 0.78초 돌풍 `슈우웅`도 그대로 유지한다.

## 시각 검증

독립 `visual-verdict` 최종 점수는 **94/100, pass**다. 기준선 RC7의 91점을 넘었고 요구 임계값 90을 통과했다. 별도의 여정 HUD 검토도 다섯 필수 뷰포트에서 92/100, pass였다.

검증 뷰포트는 `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`이다. 대표 증거는 다음 경로에 있다.

- `artifacts/browser-qa/m32-landmarks-final/`
- `artifacts/browser-qa/m32-landmark-views-final/`
- `.omx/state/m32/ralph-progress.json`
- `artifacts/world-m32/world-glb-report.json`

남은 시각 관찰 항목은 결함 은폐 없이 사람 플레이테스트로 넘긴다.

- 아주 가까운 접근에서는 큰 전경 동전이 랜드마크 일부를 잠시 가릴 수 있다.
- 노란빛·녹색빛 원거리 대기 속에서 먼 섬의 명암 분리가 줄어든다.
- 가장 밝은 하늘에서는 바람 리본의 옅은 부분이 부드러워지지만 진행 방향은 읽힌다.

기존 10개 동전 좌표와 한 draw-call 바람 리본을 보존하기 위해 이번 마일스톤에서는 이 항목들을 위치 변경으로 해결하지 않았다.

## 현재 자동 게이트

| 게이트 | 상태 |
| --- | --- |
| 단위 테스트 | 36 files / 369 tests passed |
| 타입 검사 | `npm run typecheck` passed |
| 린트 | `npm run lint` passed |
| 빌드 | passed; JS 718.89kB raw / 189.94kB gzip, CSS 22.71kB raw / 4.30kB gzip |
| 집중 축제 여정 E2E | desktop + touch-minimum: 12 passed, 6 intentional device-specific skips |
| 전체 E2E | 260 total: 139 passed, 121 intentional device/opt-in skips, 0 failed |
| 30초 성능 4프로필 | 모두 median/minimum 60fps; 최대 65 draw calls |
| 프로덕션·보안·전송량 | 5/5 viewports; 오류 0; audit 0; QA 훅 0; gzip-9 5.914MiB |
| 10분 탐험 soak | measured 600,991ms / 73 cycles; geometry·texture 증가 0; 오류 0 |
| Blender/GLB | 6개 world GLB `errors: []`; 축제 high/low 예산 통과 |
| 독립 시각 판정 | 94/100 pass; HUD 92/100 pass |

Vite의 JavaScript raw 500kB 경고는 빌드 실패가 아니다. 최종 `dist`는 14개 파일, raw 11,973,896 bytes와 gzip-9 6,201,485 bytes(5.914MiB)다. 10MiB 예산의 약 59.1%이며 production QA 훅 문자열은 0건이다.

### 30초 성능 프로필

| 장면 | median/minimum FPS | draw calls | triangles | geometries/textures |
| --- | ---: | ---: | ---: | ---: |
| desktop race high | 60/60 | 61 | 67,616 | 45/3 |
| mobile race low | 60/60 | 36 | 36,716 | 44/1 |
| desktop explore high | 60/60 | 65 | 73,608 | 52/3 |
| mobile explore low | 60/60 | 40 | 40,068 | 51/1 |

### 10분 탐험 soak

`artifacts/browser-qa/m32-final/soak-10m.json`은 워밍업 11회 뒤 600,991ms 동안 73개 전체 반복 사이클을 수행한 결과다. 워밍업을 포함한 총 실행 시간은 696,150ms다.

- loaded 기준 geometry `98 -> 98`, texture `3 -> 3`
- ready 기준 geometry `87 -> 87`, texture `3 -> 3`
- 마지막 상태: 랜드마크 5/5, 상승기류 3/3, 동전 기록 9,000ms, region mesh 0
- BGM 재생 유지, 환경 바람은 레이스 준비 상태에서 정지
- console, page, request 오류 각각 0

## 변경 영역과 단순화

- 좌표, 발견, 바람, 충돌과 여정 계산을 Three.js 객체가 없는 `festivalHubActivities.ts` 순수 규칙으로 모았다.
- Blender 의미 노드와 런타임 활동 ID를 명시해 시각 메시와 게임 규칙을 분리했다.
- 상승기류 전체를 하나의 `InstancedMesh`로 그려 새 시각 효과를 draw call 1개로 제한했다.
- 기존 레이스, 미션, 동전, 스트리밍, 오디오와 저장 모듈을 확장했으며 새 런타임 의존성, Unity, 백엔드, NPC와 퀘스트 엔진을 추가하지 않았다.
- 개발 전용 QA 훅은 프로덕션 트리셰이킹 경계를 유지한다.

## 사람만 확인할 수 있는 남은 항목

- 실제 데스크톱·Android·iPhone에서 이 지역의 첫 5단계 여정이 10~15분 안에 자연스럽게 끝나는지 측정
- 자동 QA 위치 이동 없이 랜드마크, 상승기류, 비밀 동굴, 세 착륙장과 10개 동전 동선을 실제 조작으로 찾을 수 있는지 확인
- 장시간 모바일에서 발열, throttling, 터치 피로와 작은 화면 HUD 가독성 판단
- 헤드폰과 기기 스피커에서 BGM, 바람층, 발견·상승기류 큐, 날갯짓과 돌풍의 음량 균형 청취
- Safari AAC/M4A 폴백과 사용자 제공 BGM의 배포 권리 확인

자동 게이트는 모두 통과했다. 위 사람 판정 항목과 BGM 배포 권리를 확인하기 전에는 출시 완료를 선언하지 않는다.
