# Milestone 29 RC7 Three.js 런타임 비주얼 보고서

> 상태: **런타임·성능·시각 통합 게이트 통과**
>
> 검증일: 2026-07-14

## 결론

Unity로 이전하지 않고 기존 Three.js 게임 구조 안에서 해뜰녘 조명, 거리 안개, 구름 깊이, 제한된 그림자와 속도 VFX를 강화했다. high 품질은 새 Blender GLB와 그림자·대기 효과를 사용하고 low 품질은 코스 가독성을 유지하면서 그림자와 비필수 장식을 제거한다. 탐험과 레이스 상태, 지역 발견, 미션, 하늘동전 기록 및 입력 계약은 유지했다.

## 품질 정책

| 항목 | high | low |
| --- | ---: | ---: |
| 그림자 | 활성 | 비활성 |
| shadow map | 1024 | 없음 |
| 구름 wisps | 16 | 12 |
| deck 장식 | 8 | 0 |
| 부스트 streak | 18 | 0 |

- high 지역은 카메라에서 220 units 안으로 들어오면 high GLB로 승격한다.
- 260 units 밖으로 나가면 low GLB로 강등하여 경계 진동을 막는다.
- 새 지역은 먼저 low로 표시한 뒤 거리 조건을 만족할 때만 high로 교체한다.
- 품질 전환과 지역 clear/re-entry는 위치, 발견, 목적지, 미션과 하늘동전 상태를 초기화하지 않는다.

## 조명·대기·VFX

- 해뜰녘 색 계층을 가진 하늘 셰이더, 소프트 태양과 `FogExp2`를 적용했다.
- high에서는 림 조명, 제한된 실시간 그림자와 카메라를 따라 스냅되는 shadow volume을 사용한다.
- 부스트 중에는 high 전용 속도 streak를 표시한다.
- active gate, 두 가닥 바람실과 current coin은 안개와 효과보다 높은 가독성을 유지한다.
- `prefers-reduced-motion`에서는 속도 streak, 통과 파동, gate scale/halo와 rune 회전·pulse를 중단한다.
- deprecated shadow 방식과 새 런타임 시각 의존성은 추가하지 않았다.

## 수명주기와 복구

탐험을 떠날 때 재사용 가능한 월드 객체를 영구 dispose하던 결함을 회귀 테스트에서 발견했다. 모드 전환은 새 `clear()` 경계로 화면과 로드된 지역만 비우고, 세션 종료에서만 영구 dispose한다.

- 탐험 → 미션 → 탐험 재진입 후 세 지역 메시 복원
- 탐험 → 레이스 → 완주 → 준비 → 탐험 재진입 후 메시 복원
- high → low → high와 clear/re-entry 반복 후 renderer geometry/texture 카운터 plateau
- WebGL context loss/recovery 후 지역, 입력과 BGM 재생 위치 복원
- 지역 교체와 언로드 시 GLB geometry/material 해제

## 자동 검증

```text
npm test                                      # 33 files, 317 tests passed
npm run typecheck                             # passed
npm run lint                                  # passed
npm run build                                 # passed
full E2E matrix                               # 123 passed, 82 intentional device skips, 0 failed
focused visual/audio E2E                      # 21 passed, 9 intentional device skips
production viewport matrix                    # 5/5 passed
Blender dragon/world inspectors               # seven GLBs, errors 0
runtime code review                           # approved
git diff --check                              # passed
```

RC7 최종 자산을 고정한 뒤 네 장면을 각각 30초 동안 단독 측정했다.

| 장면 | 품질 | median/min fps | draw calls | triangles | geometries | textures | fixed steps | BGM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| race desktop | high | 60/60 | 61 | 67,616 | 45 | 3 | 1,803 | 중지 |
| race mobile | low | 60/60 | 36 | 36,716 | 44 | 1 | 1,802 | 중지 |
| explore desktop | high | 60/60 | 65 | 73,608 | 51 | 3 | 1,803 | 재생 |
| explore mobile | low | 60/59 | 40 | 40,068 | 50 | 1 | 1,802 | 재생 |

탐험 두 측정에서 스트리밍 BGM은 실제 재생 중이었고 레이스에서는 중지됐다. 모든 수치는 desktop/high 55/50fps, mobile/low 30fps와 high 120 draw-call 예산 안에 있다.

## 화면 구성 수정

320x568에서 착륙·이륙·도전 버튼이 드래곤과 터치 비행 영역을 가리는 문제를 시각 판정에서 발견했다. 420px 이하에서는 컨텍스트 버튼을 두 번째 행 왼쪽, 동전 기록을 중앙, 일시정지를 오른쪽에 배치한다.

- 컨텍스트 버튼, 동전, joystick, brake, boost 사이 교차 0
- 준비 화면에서는 아직 사용할 수 없는 비행 조작을 숨기고 BGM 조작을 노출
- 최소 터치 타깃 44px 유지
- 독립 레이스 시각 판정 92/100 pass
- 독립 오픈월드 시각 판정 91/100 pass

## 전송량

최종 production `dist`는 14개 파일, 11,583,944 raw bytes와 6,078,221 gzip-9 bytes다. 약 5.797MiB로 전체 10MiB gzip 예산 안에 있다. JavaScript raw bundle의 기존 500kB 경고는 남지만 gzip, 프레임과 draw-call 게이트는 통과한다.

## 변경 파일과 단순화

- `src/game/quality/qualityPolicy.ts`: 품질별 그림자·대기·장식·속도 효과 예산을 한 계약으로 관리한다.
- `src/game/world/createOpenWorld.ts`: low-first 지역 로드, 220/260 LOD 경계, 재사용 가능한 clear와 영구 dispose를 분리한다.
- `src/game/world/createWorld.ts`, `createFlightSandbox.ts`: 해뜰녘 하늘, 안개, 섬 깊이와 품질별 장식을 구성한다.
- `src/game/createRenderer.ts`: 모드·품질·reduced-motion·context recovery를 런타임 장면과 연결한다.
- `src/game/ui/TouchControls.ts`, `src/styles.css`: 준비 상태와 좁은 탐험 화면의 조작 영역을 분리한다.
- 런타임 엔진, 새 시각 라이브러리와 외부 에셋 의존성은 추가하지 않았다.

## 남은 위험

- 자동화는 현재 Chromium GPU 경로를 검증하며 실제 iOS/Android GPU 드라이버 차이는 플레이테스트 인계 항목으로 남는다.
- 그림자와 안개의 최종 색감은 디스플레이 밝기와 색 영역에 따라 달라질 수 있다.
- 10~15분 연속 모바일 플레이의 발열, throttling과 터치 피로는 실기기에서 확인해야 한다.
