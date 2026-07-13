# Milestone 30 RC7 자동 QA 기록

> 상태: **RC7 / 비주얼·오디오 리마스터 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 검증일: 2026-07-14
>
> 브랜치: `codex/rc7-visual-audio-remaster`
>
> 기준 커밋: `ba6467f`

## 결론

Unity로 이전하지 않고 기존 Vite + TypeScript + Three.js 게임에 RC7 비주얼·오디오 리마스터를 완료했다. 프로젝트 자체 제작 Blender 원본과 GLB로 드래곤과 세 지역을 교체하고, 해뜰녘 조명·안개·그림자·VFX·거리 LOD를 보강했다. 사용자 제공 BGM은 탐험 전용 스트리밍 루프로 통합했으며 음소거, 볼륨 저장, 모드·탭·복구 수명주기를 검증했다.

기존 레이스, 미션 6종, 세 지역 탐험, 착륙·재이륙, 지도, 하늘동전 기록, 키보드·터치와 저장 마이그레이션은 전체 회귀 매트릭스를 통과했다. 자동 게이트는 완료됐지만 실제 iOS/Android, Safari AAC, 사람의 루프 청취와 음원 권리 확인은 자동화로 대체할 수 없으므로 출시 완료를 선언하지 않는다.

## 최종 자동 게이트

| 게이트 | 최종 결과 |
| --- | --- |
| 단위 테스트 | 33 files, 317 tests passed |
| 타입 검사 | `npm run typecheck` passed |
| 린트 | `npm run lint` passed |
| 빌드 | passed; JS 703.78kB raw / 185.49kB gzip, CSS 21.51kB raw / 4.12kB gzip |
| 전체 E2E | 205 total: 123 passed, 82 intentional device-specific skips, 0 failed |
| 집중 시각·오디오 E2E | 21 passed, 9 intentional device-specific skips |
| 30초 성능 | 네 장면 모두 median 60fps; 모든 FPS·draw-call 예산 통과 |
| 프로덕션 | 5/5 viewports passed; console/page/unhandled/network errors 0; Ogg MIME 확인 |
| 독립 시각 판정 | race 92/100, world 91/100, dragon reference 91/100; 모두 pass |
| Blender 검사 | dragon 1개와 world high/low 6개 모두 `errors: []` |
| 보안 감사 | `npm audit --audit-level=high`: 0 vulnerabilities |
| 프로덕션 QA 훅 검사 | 0 matches |
| 배포 크기 | 14 files, 11,583,944 raw bytes, 6,078,221 gzip-9 bytes (5.797MiB) |

다섯 필수 뷰포트는 `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`이다. 모든 프로덕션 장면에서 캔버스가 비어 있지 않고 시간에 따라 변했으며 처리되지 않은 오류와 실패한 필수 네트워크 요청이 없었다.

## Blender·GLB 자산

### 드래곤

- 런타임 GLB: 19,628 triangles, 12 render meshes, 18 primitives, 3 materials
- 크기: 1,574,828 raw bytes / 389,429 gzip-9 bytes
- vertex color 12/12, smooth polygons 12,994, invalid normal/transform 0
- 필수 `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`와 선택 `JawRig`, `EyeRig_L/R` 피벗 보존
- 결정적 이중 export SHA-256: `F98A9A82927E64475C9DB19A741ABEC478CE5B4752DE8F541E6368FB94F39BD5`
- 8방향 턴테이블과 준비·레이스·부스트·충돌 상태 확인, 독립 판정 91/100 pass

### 세 지역

- 축제 중심섬, 바람 협곡, 구름 유적지의 high/low GLB 6개
- 합계 5,028,788 raw bytes / 1,344,763 gzip bytes
- 모든 파일에 동일 지역의 `RegionRoot`, `LandingPad`, 랜드마크 노드와 의미 원점 보존
- 모든 render mesh에 vertex color 포함, invalid normal/finite transform 오류 0
- high 60,000, low 25,000 triangles와 12 primitives, 8 materials 예산 통과
- 독립 오픈월드 판정 91/100 pass

세부 triangles, primitives, materials와 파일별 SHA-256은 `docs/MILESTONE_28_RC7_BLENDER_ASSET_REPORT.md`에 고정했다.

## 탐험 BGM

| 파일 | duration | bytes | SHA-256 |
| --- | ---: | ---: | --- |
| source M4A | 112.469333s | 1,433,660 | `BE57B9DAD42A425B98F9D0F0BDB27BEF5CECC55D2F391FF533C199BEABB42A1B` |
| loop Ogg | 108.469333s | 2,043,970 | `0CBE75CC1A785FE4A9C39E6C88F2B314D2A911E5C1F692591D67897A2C3468F7` |
| loop M4A | 108.469s | 2,207,091 | `FD8AD12A8A34AED2C4A6AAF16161DE5F8271A9C0D198F5E52264FFAF027D79E5` |

- 원본은 변경하지 않고 4초 equal-power tail/head crossfade 배포 마스터를 결정적으로 생성했다.
- Chromium은 Ogg를 우선 스트리밍하고 미지원 브라우저는 AAC/M4A를 선택한다.
- 첫 사용자 동작 전 자동재생하지 않으며 탐험에서 재생하고 레이스·숨김 탭·복구 화면·dispose에서 멈춘다.
- 탐험 복귀와 컨텍스트 복구는 기존 재생 위치를 보존한다.
- 마스터 음소거와 기본 35% BGM 볼륨을 접근 가능한 UI에 노출하고 저장 포맷 v6에 보존한다.
- 프로덕션 응답은 Ogg `audio/ogg`, M4A `audio/mp4` MIME을 반환했다.

## 독립 시각 QA

| 범위 | 판정 | 확인 내용 |
| --- | ---: | --- |
| 레이스 | 92/100 pass | 드래곤, 금빛 관문, 두 바람실, 속도 VFX, 준비·레이스·부스트·충돌 상태 |
| 오픈월드 | 91/100 pass | 세 지역 랜드마크, 구조 깊이, 착륙장, HUD, desktop/mobile 구도 |
| 드래곤 참고 일치 | 91/100 pass | 실루엣, 얼굴, 어깨·날개, 다리·발, 꼬리와 게임 카메라 가독성 |

high 품질은 1024 shadow map, 구름 wisps 16, deck 장식 8, boost streak 18을 사용한다. low 품질은 그림자와 비필수 장식을 제거하고 wisps를 12로 제한한다. `prefers-reduced-motion`에서는 속도선, 통과 파동, gate/rune pulse를 줄이거나 중단한다.

## 최종 30초 성능

| 장면 | 품질 | median/min fps | draw calls | triangles | geometries | textures | fixed steps | BGM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| race desktop | high | 60/60 | 61 | 67,616 | 45 | 3 | 1,803 | 중지 |
| race mobile | low | 60/60 | 36 | 36,716 | 44 | 1 | 1,802 | 중지 |
| explore desktop | high | 60/60 | 65 | 73,608 | 51 | 3 | 1,803 | 재생 |
| explore mobile | low | 60/59 | 40 | 40,068 | 50 | 1 | 1,802 | 재생 |

desktop/high 55fps 중앙값·50fps 하한, mobile/low 30fps, high 120 draw-call 예산을 모두 통과했다. 탐험 측정은 BGM을 실제 재생한 상태에서 수행했다.

## 프로덕션·보안·전송량

- 5개 필수 뷰포트의 프로덕션 서버 검증이 모두 통과했다.
- console error, page error, unhandled rejection과 필수 네트워크 실패는 각각 0이다.
- `npm audit --audit-level=high`는 취약점 0건을 보고했다.
- 프로덕션 출력에서 `__DRAGON_RACE_TEST__`, 수집·지역 전환·관문 강제 QA 훅 문자열은 0건이다.
- 최종 `dist`는 14개 파일, 11,583,944 raw bytes, 6,078,221 gzip-9 bytes(5.797MiB)로 10MiB 예산을 통과했다.
- Vite의 JavaScript raw 500kB 경고는 남지만 JS gzip은 185.49kB이며 프레임·draw-call·전체 전송 예산을 모두 통과했다.

## 수명주기 회귀

- 탐험 → 미션 → 탐험과 탐험 → 레이스 → 완주 → 준비 → 탐험에서 세 지역 메시를 복원한다.
- high → low → high, 지역 clear/re-entry 반복 뒤 renderer geometry/texture 수치가 plateau를 유지한다.
- 지역은 low를 먼저 표시하고 220 units 안에서 high, 260 units 밖에서 low로 전환해 경계 진동을 막는다.
- WebGL context loss/recovery 뒤 지역, 입력, 저장 상태와 BGM 재생 위치를 복원한다.
- 지역 교체·언로드에서는 GLB geometry/material을 해제하고 세션 종료에서만 재사용 불가능한 리소스를 dispose한다.
- 준비 화면은 아직 사용할 수 없는 비행 조작을 숨기고 명시적인 44px 이상 시작 버튼과 BGM 조작을 제공한다.

## 변경 영역과 단순화

- Blender 원본·생성·export·inspection 스크립트와 드래곤/지역 GLB를 한 재현 가능한 자산 파이프라인으로 정리했다.
- `GameAudio` 경계가 생성 SFX와 스트리밍 BGM의 unlock, pause/resume, mute, volume과 dispose를 함께 관리한다.
- 품질 정책 한 곳에서 그림자, 구름, 장식, VFX와 LOD 비용을 결정한다.
- 탐험 월드의 재사용 `clear()`와 영구 `dispose()`를 분리해 재진입 자원 오류를 제거했다.
- HTML media streaming을 사용해 전체 PCM을 Web Audio 메모리에 올리지 않는다.
- 기존 Three.js 엔진과 게임 모드를 유지했으며 Unity, 새 런타임 라이브러리, 백엔드, 외부 모델·텍스처를 추가하지 않았다.

## 사람만 확인할 수 있는 남은 항목

- 실제 iOS/Android에서 가로·세로 UI, GPU 발열, throttling과 10~15분 터치 피로 확인
- Safari에서 AAC/M4A 폴백의 실제 선택·재생·중단·재개 확인
- 헤드폰과 스피커 각각으로 두 번 이상의 루프 경계를 들어 클릭, 공백과 음량 균형 판단
- 사용자 제공 BGM의 소유권, 사용 범위와 배포 라이선스 감사

> **RC7 / 비주얼·오디오 리마스터 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
