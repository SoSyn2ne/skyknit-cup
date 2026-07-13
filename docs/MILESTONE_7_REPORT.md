# Milestone 7 3D 품질 리마스터 기록

> 상태: **완료 검증됨**
>
> 검증일: 2026-07-11

## 결론

RC1의 1,600-triangle/93-mesh 드래곤 블록아웃을 17,660-triangle/9-mesh vertex-color 모델로 교체했다. 기존 주홍 실루엣과 `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5` 계약을 유지하면서 드래곤 렌더 메시를 약 90% 줄였다.

섬 외곽선 변주, 가까운 섬의 유적/깃발/룬, 원경/하부 구름 레이어, 관문 금빛 코어/halo를 추가했다. 다음 관문과 두 가닥 바람실은 모든 필수 뷰포트에서 계속 우선해 읽힌다.

## 드래곤 v2

- Blender 원본: `assets/source/dragon/skyknit-dragon-v02.blend`
- 생성기: `tools/blender/build_dragon_blockout.py`
- exporter: `tools/blender/export_dragon_glb.py`
- 검사기: `tools/blender/inspect_dragon_glb.py`
- 런타임: `public/assets/models/skyknit-dragon.glb`
- 프로젝트 제작 vertex color, 런타임 재질 2개, 외부 이미지 텍스처 0개

형상 변경:

- 몸통/복부/골반/머리/어깨의 주요 덩어리 면 밀도를 높였다.
- 눈을 키우고 주둥이를 길고 가늘게 조정했다.
- 뿔, 볼가시, 목, 다리, 발톱, 꼬리의 방사 단면 수를 늘렸다.
- 날개막을 넓히고 외곽/후연 비율을 조정했으며 날개뼈의 단면 수를 높였다.
- 기존 날갯짓, 어깨 선행 뱅크, 몸통/꼬리 지연, 상승/부스트 자세는 런타임 피벗으로 그대로 동작한다.

### 정적 에셋 게이트

```text
triangles:            17,660 (목표 15,000~25,000)
render meshes:             9 (목표 <=10)
GLTF primitives:          12 (목표 <=14)
materials:                 2
vertex-color meshes:     9/9
required runtime nodes:  9/9
GLB raw:            2,385,716 bytes
GLB gzip:             446,393 bytes
```

Blender importer로 내보낸 GLB를 다시 열어 삼각형, 메시, primitive, 재질, vertex color, 필수 노드를 검사했다.

## 세계 리마스터

- 18개 섬의 충돌 중심/반경은 바꾸지 않고 폭·깊이·회전 변주와 9각 3단 암반을 적용했다.
- 첫 12개 섬에 기둥/상인방/깃발/룬 인스턴스를 추가했다.
- 기존 구름 위에 high 원경 wisps와 하부 cloud deck을 추가했다.
- low는 wisps를 줄이고 cloud deck을 제거한다.
- 활성 관문은 불투명 금빛 코어와 얇은 additive halo를 사용한다.
- 장식은 청록/중성 석재로 제한해 금빛 다음 관문과 경쟁하지 않게 했다.

## RC1 대비 예산

| 지표 | RC1 | M7 | 변화 |
| --- | ---: | ---: | ---: |
| 드래곤 triangles | 1,600 | 17,660 | +16,060 / 약 11.0배 |
| 드래곤 render meshes | 93 | 9 | -84 / 약 90.3% |
| high 장면 draw calls | 102 | 30 | -72 / 약 70.6% |
| high 장면 triangles | 8,188 | 29,884 | +21,696 |
| low 장면 draw calls | 102 | 28 | -74 |
| low 장면 triangles | 6,268 | 26,220 | +19,952 |
| 전체 raw | 863,954 bytes | 3,056,292 bytes | +2,192,338 bytes |
| 전체 gzip | 196,535 bytes | 620,228 bytes | +423,693 bytes |

high draw calls 30은 공식 120 제한의 25%다. 전체 gzip은 10MiB 제한의 약 5.9%다.

## 30초 성능

측정 파일: `artifacts/browser-qa/m7-final/performance-30s.json`

| 지표 | desktop/high | mobile/low |
| --- | ---: | ---: |
| 뷰포트 | `1440x900` | `844x390` |
| median | 60fps | 60fps |
| minimum bucket | 60fps | 60fps |
| host frames | 1,802 | 1,802 |
| fixed steps | 1,802 | 1,802 |
| draw calls | 30 | 28 |
| triangles | 29,884 | 26,220 |
| geometries | 43 | 38 |
| textures | 1 | 1 |

desktop median 55/minimum 50과 mobile median 30 기준을 모두 통과했다.

## 브라우저와 시각 검증

- 5개 필수 뷰포트에서 드래곤 GLB, 금빛 관문, 바람실 2개 동시 가시.
- 각 canvas 휘도 범위 40 초과, 500ms 프레임 hash 변화.
- document scroll 0, touch target/접근성/복구/reduced-motion 회귀 통과.
- 시각 iteration 1~4를 거쳐 최종 `95/100`, `pass`.
- 최신 판정: `.omx/state/m7/ralph-progress.json`.
- 최종 화면: `artifacts/browser-qa/m7/final4/`.

## 최종 게이트

```text
npm test                         # 22 files, 185 tests passed
npm run test:e2e                # 77 passed, 43 device-specific skips
npm run test:performance        # 1 passed, desktop/high + mobile/low 30s
npm run test:production         # 5 passed
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
Blender GLB inspection          # passed
```

두 WebGL 프로젝트를 병렬 실행하면 software renderer 경쟁으로 3초 카운트다운의 4초 제품 게이트가 흔들렸다. 제품 시간을 늘리지 않고 일반 Playwright WebGL 회귀를 worker 1개로 직렬화했다. 직렬 전체 회귀는 실패 0으로 통과했다. 프로덕션 5뷰포트 검사는 별도 프로세스에서 2 workers로도 통과했다.

## 변경 파일

- 범위/계획: `docs/PRODUCT_GOAL.md`, `docs/IMPLEMENTATION_PLAN.md`, `.omx/plans/prd-rc2-m7-m9.md`, `.omx/plans/test-spec-rc2-m7-m9.md`
- 드래곤: `tools/blender/build_dragon_blockout.py`, `tools/blender/export_dragon_glb.py`, `tools/blender/inspect_dragon_glb.py`, `assets/source/dragon/skyknit-dragon-v02.blend`, `public/assets/models/skyknit-dragon.glb`
- 세계: `src/game/world/createWorld.ts`, `src/game/world/createFlightSandbox.ts`
- QA: `tests/e2e/final-visual.spec.ts`, `tests/e2e/performance.spec.ts`, `playwright.config.ts`, `.omx/state/m7/ralph-progress.json`

## 단순화와 남은 위험

- 93개 편집용 부품은 Blender 원본에 유지하되 exporter에서 피벗 경계 9개 메시로 병합해 편집성과 런타임 예산을 동시에 지켰다.
- 5개 색 재질을 vertex color + 기본/발광 2개 런타임 재질로 줄였다.
- 유적, 깃발, 룬, 구름은 6개 추가 인스턴스 draw로 묶고 물리/충돌 데이터는 건드리지 않았다.
- 후처리, 물리 엔진, 새 런타임/개발 의존성을 추가하지 않았다.
- Chromium software WebGL/DPR 1 성능은 실제 고DPR 모바일 GPU와 열 throttling을 대체하지 못한다.
- 근거리 모델 품질과 미션 난이도는 사람 플레이테스트 대기 상태이며 결과를 추정하지 않는다.
