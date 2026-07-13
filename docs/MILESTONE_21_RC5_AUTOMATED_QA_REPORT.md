# Milestone 21 RC5 자동 QA 기록

> 상태: **RC5 / 3D 월드 아트 패스 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 검증일: 2026-07-13

## 결론

Unity로 이전하지 않고 기존 Vite + Three.js 런타임에 Blender→GLB 월드 아트 파이프라인을 연결했다. 축제 중심섬, 바람 협곡, 구름 유적지의 절차형 기본 도형을 프로젝트 자체 제작 3D 구조물로 교체했고, high/low GLB 6개, 거리 LOD, 비동기 스트리밍, 실패 fallback, 자원 해제를 자동 검증했다. 실기기와 사람 플레이 결과는 아직 없으므로 출시 완료를 선언하지 않는다.

## 구현 범위

- 축제 중심섬: 비행장, 축제 탑, 깃발, 레이스 아치, 착륙장
- 바람 협곡: 자연 암벽, 풍화 터널, 바람 고리, 끊어진 다리, 착륙장
- 구름 유적지: 사원, 출입구, 계단, 룬 기둥, 부유 석판, 착륙장
- Blender 4.5.10 LTS background 빌드와 원자적 `.blend` 저장
- 지역별 high/low GLB 6개와 노드·재질·삼각형 검사기
- 420/500 지역 스트리밍과 220/260 high LOD 거리 히스테리시스
- GLB 실패 시 착륙장을 유지하는 최소 fallback
- 외부 모델, 텍스처, 유료 에셋, 새 엔진, 새 런타임 의존성 없음

## GLB 검사

검사 파일: `artifacts/world-rc5/world-glb-report.json`

| 에셋 | triangles | primitives | materials | raw bytes | gzip bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| festival high | 21,062 | 9 | 4 | 2,024,036 | 288,385 |
| festival low | 3,114 | 9 | 4 | 295,868 | 46,029 |
| canyon high | 16,836 | 8 | 4 | 1,708,644 | 287,196 |
| canyon low | 3,604 | 8 | 4 | 409,488 | 70,536 |
| ruins high | 34,736 | 8 | 4 | 3,719,464 | 567,076 |
| ruins low | 4,044 | 8 | 4 | 435,224 | 69,410 |
| 합계 | — | — | — | 8,592,724 | 1,328,632 |

모든 파일이 `RegionRoot`, `LandingPad`, 지역별 필수 구조물 노드, `asset_version=0.5`, `asset_license=project-authored`, vertex color를 가진다. low는 같은 지역 high보다 작고, 12 primitives·8 materials 제한을 지킨다.

## 최종 자동 게이트

```text
npm test                         # 28 files, 285 tests passed
5-project E2E matrix             # 108 passed, 57 device-specific skips
RC5 world-art matrix             # 5 viewports × 3 regions, GLB loaded
canvas pixel matrix              # 5 passed, nonblank and changing
visual-verdict                   # 93/100 pass, iteration 5
npm run test:performance         # 1 passed, four 30-second samples
npm run test:production          # 5 passed
npm run typecheck                # passed
npm run lint                     # passed
npm run build                    # passed
npm audit --audit-level=high     # 0 vulnerabilities
Blender GLB inspection           # 6 passed, 0 errors
```

전체 E2E는 WebGL 컨텍스트를 한 워커에서 직렬 실행했고 6.2분 동안 stderr와 브라우저 오류 없이 완료됐다.

## 30초 성능

측정 파일: `artifacts/browser-qa/rc5/performance-30s.json`

| 지표 | race desktop/high | race mobile/low | explore desktop/high | explore mobile/low |
| --- | ---: | ---: | ---: | ---: |
| viewport | 1440x900 | 844x390 | 1440x900 | 844x390 |
| median | 60fps | 60fps | 60fps | 60fps |
| minimum bucket | 60fps | 60fps | 59fps | 60fps |
| fixed steps | 1,805 | 1,803 | 1,803 | 1,803 |
| max steps/frame | 6 | 6 | 6 | 6 |
| draw calls | 34 | 31 | 35 | 34 |
| triangles | 30,212 | 28,068 | 29,688 | 28,808 |
| geometries | 47 | 42 | 46 | 45 |
| textures | 1 | 1 | 1 | 1 |

초기 구현은 420 units 거리의 지역도 high GLB로 그려 협곡 접근 시 최저 28fps까지 떨어졌다. 협곡 중첩 암석을 41% 경량화하고, 먼 지역 low/가까운 지역 high 거리 LOD를 도입하고, 로우폴리 화면에 불필요한 MSAA를 제거해 최종 기준을 통과했다.

## 시각 QA

- 증거: `artifacts/browser-qa/rc5/*.png`, 5개 뷰포트 × 3개 지역
- 판정: `.omx/state/rc5/ralph-progress.json`, 93/100 pass
- 첫 반복의 구름 사원 벽·지붕 시야 가림을 구조 재배치로 해결했다.
- 결합 구조물 전체 회전을 제거해 룬 기둥과 터널이 기울어지는 문제를 해결했다.
- 사원 정면을 양측 벽, 어두운 출입구, 인방, 계단으로 분리했다.
- 협곡 경량화와 MSAA 제거 후에도 데스크톱·320×568에서 랜드마크와 드래곤 윤곽이 유지됐다.

## 전송량

- 프로덕션 `dist` 11개 파일: raw 11,945,521 bytes
- 전체 gzip: 1,994,338 bytes, 약 1.90MiB
- 10MiB 예산의 약 19%를 사용한다.
- Vite JavaScript 단일 청크 500kB 경고는 남지만 gzip 예산과 런타임 검증은 통과했다.

## 변경 파일과 단순화

- `tools/blender/build_world_art.py`: 세 지역과 두 LOD를 한 소스에서 재생성한다.
- `tools/blender/inspect_world_glb.py`: Blender 재수입으로 노드, extras, 예산, vertex color를 검증한다.
- `assets/source/world/skyknit-world-rc5.blend`, `public/assets/models/world/*.glb`: 프로젝트 자체 제작 원본과 런타임 결과물이다.
- `src/game/world/createOpenWorld.ts`: 정상 경로의 RC4 구조물 생성 코드를 제거하고 GLB 로더, 거리 LOD, stale 결과 폐기, 최소 fallback만 유지했다.
- `src/game/createRenderer.ts`: 현재 품질과 디버그 자산 상태를 연결하고 저폴리 렌더러의 MSAA를 제거했다.
- `src/game/quality/qualityPolicy.ts`: high 구름을 32개로 조정해 모바일 low 24개와 구분하면서 성능 여유를 확보했다.
- 기존 레이스, 미션, 탐험 저장, 착륙, 지도, 터치 계약은 재작성하지 않았다.

## 남은 위험

- 실제 iOS/Android GPU 발열, 고DPR, 제조사별 throttling은 자동화로 대체할 수 없다.
- 220/260 units LOD 전환이 사람 눈에 얼마나 보이는지 실기기 이동 테스트가 필요하다.
- 구조물 가까이 비행할 때 카메라 클리핑과 멀미는 사람 플레이가 필요하다.
- 축제 탑의 화면 가장자리 잘림과 구름 사원 지붕의 크기는 취향 검증이 남는다.
- 새 구조물은 시각 랜드마크이며 NPC, 전투, 퀘스트, 대형 월드 콘텐츠를 추가한 것은 아니다.
- 커밋, push, deploy는 수행하지 않았다.

> **RC5 / 3D 월드 아트 패스 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
