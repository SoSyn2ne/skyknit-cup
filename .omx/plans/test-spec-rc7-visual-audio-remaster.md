# RC7 비주얼·오디오 리마스터 테스트 명세

## M26 기준선

- RC6의 unit, typecheck, lint, build, E2E, performance, production 결과를 새 작업 전 기록한다.
- BGM은 AAC stereo 48kHz, 약 112.47초, 약 1.43MB이며 배포 후 HTTP 200과 올바른 MIME을 확인한다.
- RC6 대표 5뷰포트 스크린샷을 RC7 전후 비교 기준으로 보존한다.
- 현재 GLB 노드, triangles, primitives, materials, raw/gzip byte를 검사기로 기록한다.

## M27 오디오 RED/GREEN 계약

- unlock 전에는 AudioContext와 media playback을 시작하지 않는다.
- 탐험 활성 요청 후 unlock하면 선택된 스트리밍 루프 마스터를 한 번 재생하고 반복 경계에서 tail/head crossfade가 유지된다.
- 레이스 전환, 탭 숨김, 복구 화면과 dispose는 BGM을 pause한다.
- 탐험 복귀와 탭 표시 복귀는 mute가 아닐 때 기존 위치에서 재개한다.
- 지도, landing, landed, taking-off, 하늘동전 running/completed는 BGM을 중단하지 않는다.
- mute는 SFX와 BGM을 모두 막고 해제 시 현재 BGM 볼륨으로 복원한다.
- `musicVolume`은 손상값을 무시하고 `[0, 1]`로 clamp하며 BGM에만 반영한다. 기존 SFX gain은 변경하지 않는다.
- media `play()` rejection, decode/load 오류와 AudioContext 실패는 throw하지 않고 게임을 계속한다.
- dispose는 oscillator와 media를 모두 정리하고 이후 재생을 막는다.

## 저장 v6

- v6는 기존 필드와 `musicVolume`의 유한 `[0,1]` 값을 round-trip한다.
- v5 정상 저장은 모든 기존 데이터 보존 + `musicVolume=0.35`로 v6에 마이그레이션한다.
- v1~v4 경로도 기존 최종 데이터 보존 후 v6 문서를 쓴다.
- 문자열, NaN, 무한, 음수와 1 초과 볼륨은 기본값 또는 clamp 규칙으로 복구한다.
- mute 토글과 volume 변경은 저장 실패가 있어도 UI와 게임을 막지 않는다.

## 오디오 브라우저/E2E

- 준비 화면의 첫 유효 동작 전에는 BGM 재생 시도가 없다.
- 탐험 시작 후 media가 loop/playing 상태가 되고 레이스 진입에서 paused가 된다.
- 음소거 버튼과 볼륨 슬라이더는 키보드/터치로 조작 가능하고 reload 후 유지된다.
- 컨트롤은 accessible name, 현재 값, 44x44 CSS px 터치 영역과 safe-area를 만족한다.
- production에서 BGM 요청은 200이고 console/pageerror/unhandled rejection이 없다.
- 원본은 변경 없이 보존되고 빌드 스크립트를 다시 실행해 Ogg/AAC loop master와 동일한 메타데이터를 재현한다.

## M28 Blender/GLB

- 드래곤은 `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`와 선택 표정 피벗을 유지한다.
- 세 지역 high/low는 RC5 필수 노드와 동일한 local origin·LandingPad 계약을 유지한다.
- 모든 에셋은 `asset_version=0.7`, `asset_license=project-authored` 또는 승인된 사용자 오디오 메타데이터를 가진다.
- low는 paired high보다 triangles와 raw bytes가 작다.
- 지역당 high 60,000 triangles, low 25,000 triangles, 12 primitives, 8 materials 이하를 유지한다.
- bevel/normal/vertex color/PBR material이 실제 GLB import 후 존재하고 NaN transform이나 빈 mesh가 없다.

## M29 런타임 시각·LOD·성능

- low 품질은 low GLB만 요청하고 high는 기존 220/260 거리 히스테리시스로 교체한다.
- LOD/품질 변경은 위치, 발견, 목적지, 동전 시도, 레이스와 미션 상태를 바꾸지 않는다.
- unload/stale result/dispose에서 geometry와 material 수가 계속 증가하지 않는다.
- high만 제한된 주광 그림자와 고밀도 대기/VFX를 사용하고 low는 코스 가독성만 보존한다.
- active gate, wind threads와 current coin은 새 구조물·안개·VFX에 가려지지 않는다.
- reduced-motion은 카메라 흔들림, 강한 속도선과 과한 광량 펄스를 제거한다.

## M30 시각·반응형·프로덕션

- `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`에서 대표 레이스와 세 지역 탐험을 캡처한다.
- 각 캡처는 nonblank이고 500ms 이상 간격의 픽셀 해시가 달라야 한다.
- 드래곤, 다음 관문/동전, 바람실, 지역 랜드마크와 HUD가 겹치지 않는다.
- RC6 기준 화면보다 재질 분리, 깊이, 실루엣과 색 계층이 명확하며 `visual-verdict` 90점 이상이다.
- desktop/high 중앙값 55fps·최저 50fps, mobile/low 30fps를 유지한다.
- active high 120 draw calls 이하, 전체 gzip 10MiB 미만, 고심각도 audit 0이다.
- production JS에 개발 QA 훅과 강제 실패 문자열이 없다.

## Required final evidence

- `docs/MILESTONE_30_RC7_AUTOMATED_QA_REPORT.md`
- `docs/RC7_VISUAL_AUDIO_PLAYTEST_HANDOFF.md`
- `.omx/state/rc7/ralph-progress.json`
- RC7 성능 JSON, 5뷰포트/3지역 스크린샷, GLB 검사 JSON
