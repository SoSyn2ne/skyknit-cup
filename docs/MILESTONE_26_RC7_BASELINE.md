# Milestone 26 RC7 기준선

> 상태: **완료 / RC7 구현 전 기준선 고정**
>
> 검증일: 2026-07-13
>
> 기준 커밋: `ba6467fb4a47e15d44d650c5d9d2479e3332d5f0`

## 결론

RC6의 게임 규칙과 성능은 안정적이지만, 현재 화면은 회색 기본 도형, 단순한 실루엣, 약한 접지감과 평면적인 하늘 때문에 RC7 비주얼 목표에 미달한다. RC7은 Three.js와 모든 게임 좌표를 유지하면서 Blender GLB, 조명, 대기, VFX와 탐험 BGM만 수직 슬라이스로 개선한다.

## 자동 검증 기준선

| 게이트 | 결과 |
| --- | --- |
| `npm test` | 31 files, 298 tests passed |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm run build` | passed; JS 690.91kB raw / 181.56kB gzip |
| `npm run test:performance` | four 30-second samples passed |

기존 JavaScript 500kB 경고는 기준선에도 존재한다. 이번 작업은 새 런타임 의존성을 추가하지 않으며 최종 gzip 10MiB 예산을 유지한다.

## 30초 성능 기준선

측정 파일: `artifacts/browser-qa/rc6/performance-30s.json`

| 장면 | median/min fps | draw calls | triangles |
| --- | ---: | ---: | ---: |
| race desktop/high | 60 / 60 | 34 | 30,212 |
| race mobile/low | 60 / 60 | 31 | 28,068 |
| explore desktop/high | 60 / 60 | 36 | 32,568 |
| explore mobile/low | 60 / 60 | 35 | 31,688 |

## GLB 기준선

### 드래곤

- 19,748 triangles, 12 meshes, 16 primitives, 2 materials, 2,648,668 bytes
- `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`, jaw/eye pivots 통과
- asset version 0.3, `project-authored`

### 세 지역

| 지역 | high tris / bytes | low tris / bytes | primitives | materials |
| --- | ---: | ---: | ---: | ---: |
| 축제 중심섬 | 21,062 / 2,024,036 | 3,114 / 295,868 | 9 | 4 |
| 바람 협곡 | 16,836 / 1,708,644 | 3,604 / 409,488 | 8 | 4 |
| 구름 유적지 | 34,736 / 3,719,464 | 4,044 / 435,224 | 8 | 4 |

모든 지역은 asset version 0.5, `project-authored`, 필수 노드와 LandingPad 검사에서 오류 0이다.

## BGM 원본 기준선

- 원본: `Sovereign of the Sunrise Skies.m4a`
- AAC LC, stereo, 48kHz, 약 102kbps
- 길이 112.469333초, 크기 1,433,660 bytes
- 평균 -17.3dB, peak -1.9dB
- encoder delay 약 42.7ms, 끝 무음 약 190.9ms
- 단순 `<audio loop>` 대신 원본을 보존하고 4초 tail/head crossfade Ogg/AAC 스트리밍 루프 마스터를 재현 가능하게 생성한다.

자동 검사는 코덱, 길이, 레벨, HTTP와 수명주기를 증명한다. 실제 루프의 음악적 이음새는 최종 사람 청취 항목으로 남긴다.

## 고정 시각 비교군

필수 다섯 뷰포트 RC6 화면:

- `artifacts/browser-qa/rc6/desktop-coins.png` — 1440x900
- `artifacts/browser-qa/rc6/desktop-compact-coins.png` — 1280x720
- `artifacts/browser-qa/rc6/touch-landscape-coins.png` — 844x390
- `artifacts/browser-qa/rc6/touch-portrait-coins.png` — 390x844
- `artifacts/browser-qa/rc6/touch-minimum-coins.png` — 320x568

지역별 비교군은 기준 커밋 `ba6467f`의 RC6 런타임을 별도 worktree에서 재생성해 사용한다:

- `artifacts/browser-qa/rc7-baseline/desktop-festival-hub.png`
- `artifacts/browser-qa/rc7-baseline/desktop-wind-canyon.png`
- `artifacts/browser-qa/rc7-baseline/desktop-cloud-ruins.png`

기준 판정은 `.omx/state/rc6/ralph-progress.json`의 93/100 pass다. 이 점수는 회귀 기준일 뿐 RC7 품질 완료 판정으로 재사용하지 않는다. 관찰된 핵심 결함은 기본 도형이 드러나는 구조물, 평면적인 섬과 하늘, 약한 contact shadow, 단조로운 재질, 장난감 같은 드래곤 관절이다.

## RC7 변경 불가 계약

- 레이스 1개, 미션 6종, 세 지역, 동전 30개와 모든 게임 좌표를 유지한다.
- 레이스 관문, 바람실, 다음 동전과 HUD의 가독성이 장식보다 우선한다.
- high/low LOD와 모바일 저품질 경로를 유지한다.
- 사람 플레이와 실기기 청취 결과를 자동화가 대신했다고 기록하지 않는다.
