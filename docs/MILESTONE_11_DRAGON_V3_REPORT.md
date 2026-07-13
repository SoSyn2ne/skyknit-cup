# Milestone 11 Dragon v3 기록

> 상태: **완료 / 런타임 GLB 검사 통과**

## 결과물

- Blender 원본: `assets/source/dragon/skyknit-dragon-v03.blend`
- 생성기: `tools/blender/build_dragon_blockout.py`
- exporter: `tools/blender/export_dragon_glb.py`
- 검사기: `tools/blender/inspect_dragon_glb.py`
- 런타임: `public/assets/models/skyknit-dragon.glb`
- 턴테이블: `artifacts/dragon-v03/turntable/`

## v2 → v3

| 지표 | v2 | v3 |
| --- | ---: | ---: |
| triangles | 17,660 | 19,748 |
| render meshes | 9 | 12 |
| primitives | 12 | 16 |
| materials | 2 | 2 |
| GLB bytes | 2,385,716 | 2,648,668 |

v3는 최종 목표 18,000~22,000 triangles, 14 meshes 이하, 18 primitives 이하, 3 materials 이하를 모두 만족한다. 12개 모든 런타임 메시가 vertex color를 가진다.

초기 v3는 35,108 triangles였으나 실제 desktop/high 성능이 55fps 기준을 통과하지 못했다. 얼굴·날개 손가락·발가락·꼬리와 표정 피벗은 그대로 두고 날개 어깨, 골반, 복부 구의 비실루엣 세분화만 줄였다. 최종 모델은 RC2보다 2,088 triangles 많고 새 형상/표정 구조를 보존한다.

## 캐릭터 개선

- 홍채, 세로 동공, 하이라이트, 눈 소켓과 비스듬한 눈썹 능선
- 분리된 턱, 콧구멍, 입선과 제한적인 이빨
- 4개 날개 손가락과 더 분명한 막 분할
- 발가락 마디와 발톱 분리
- 일정하게 가늘어지는 꼬리와 다이아몬드 지느러미
- 좁아진 가슴/골반으로 경주용 실루엣 강화

## 런타임 계약

기존 필수 노드 9개를 보존하고 `JawRig`, `EyeRig_L/R`를 추가했다. 표정 노드를 피벗별로 병합해 세부 형상을 늘리면서도 render mesh를 12개로 제한했다.

## 시각 판정

- iteration 1: 82/100, 얼굴과 몸통 비율 revise
- iteration 2: 91/100, pass
- performance optimization final: 95/100, pass

형상 판정은 `.omx/state/m11/ralph-progress.json`, 게임/성능 최종 판정은 `.omx/state/m13/ralph-progress.json`에 있다.
