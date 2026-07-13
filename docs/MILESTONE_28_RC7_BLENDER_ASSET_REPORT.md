# Milestone 28 RC7 Blender 에셋 보고서

> 상태: **드래곤·세 지역 자동 자산 게이트 및 시각 게이트 통과**
>
> 검증일: 2026-07-14

## 결론

기존 게임 좌표, 런타임 피벗, 지역 의미 노드와 거리 LOD 계약을 바꾸지 않고 드래곤과 세 지역을 Blender 생성 GLB로 다시 만들었다. 구조물은 지역마다 다른 건축 실루엣과 면 명암을 가지며, 드래곤은 캡슐을 이어 붙인 인상 대신 목·몸통·어깨·골반·다리가 연결된 비행 선수형 표면을 가진다. 새 외부 모델, 텍스처와 유료 에셋은 사용하지 않았다.

## 드래곤

- 소스: `assets/source/dragon/skyknit-dragon-v07.blend` (3,478,805 bytes)
- 런타임: `public/assets/models/skyknit-dragon.glb`
- 소스 보고서: 104 meshes, 8,990 vertices, 17,564 triangles
- 런타임: 19,628 triangles, 12 render meshes, 18 primitives, 3 materials
- 1,574,828 raw bytes / 389,429 gzip-9 bytes
- vertex color 12/12, smooth polygons 12,994
- invalid normal/transform 0
- SHA-256: `F98A9A82927E64475C9DB19A741ABEC478CE5B4752DE8F541E6368FB94F39BD5`
- 결정적 이중 export: 동일 해시 확인
- 필수 피벗: `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`
- 표정 피벗: `JawRig`, `EyeRig_L/R`

최종 패스는 torso/neck, wing arms, hips, legs, feet를 연속 loft 표면으로 만들고 좁은 발과 버텍스 컬러 AO를 적용했다. 소스는 104개 mesh로 정리했다. 8방향 턴테이블과 실제 준비·비행·부스트·충돌 상태를 확인했으며 독립적인 엄격 시각 판정은 91/100 pass다.

## 월드 GLB

소스: `assets/source/world/skyknit-world-rc7.blend` (4,589,965 bytes)

| 지역/LOD | triangles | primitives | materials | raw bytes | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| festival high | 15,828 | 12 | 6 | 1,377,564 | `66ade2357bdbb5e4316d80639acefbaabcd6e4cb10cf8c944b3daf348a1bd7ce` |
| festival low | 4,620 | 12 | 6 | 391,888 | `7ec5e792c7bb80b0f4af12822a0f7d1c7d6ed69c103d403f5290cbfe823a97f8` |
| canyon high | 16,848 | 10 | 5 | 1,279,128 | `af3c242a7c9be8295303270bee2b81e66482e6b6e861042e277586f7f74de9d0` |
| canyon low | 4,632 | 10 | 5 | 362,752 | `4adeebf547eb4d93414d6d5611c9b4d1aebc5ff4387eb6a7108e7d7a53ffafbb` |
| ruins high | 15,724 | 11 | 4 | 1,228,452 | `9a3a4c2c87f79fc2fd5888af1adff780d6c1f859ae16a509e04e98d7116d269a` |
| ruins low | 4,988 | 11 | 4 | 389,004 | `ecf22a9b6d448a21699664806c58aad516c64953ef084583a635e4a189b1d427` |

각 high/low 쌍은 같은 `RegionRoot`, `LandingPad`, 랜드마크 노드와 의미 원점을 가진다. 모든 render mesh는 서로 다른 값을 가진 vertex color를 포함하고 invalid normal/finite transform 오류는 0이다. high는 60k, low는 25k triangles, 12 primitives, 8 materials 예산 안에 있다.

## 전송량

- 월드 GLB 6개: 5,028,788 raw / 1,344,763 gzip bytes
- 드래곤 포함 7개: 6,603,616 raw / 1,734,192 gzip-9 bytes
- 기존 RC6 드래곤 GLB는 2,648,668 bytes에서 1,574,828 bytes로 감소했다.

## 자동 검증

```text
Blender dragon inspector        # errors 0
Blender world inspector         # six reports, errors 0
double export hashes            # identical
npm test                         # 33 files, 317 tests passed
dragon pose unit                # 6/6 passed
dragon desktop visual states    # 4/4 passed
desktop three-region capture    # 1/1 passed
typecheck, lint, build           # passed
dragon visual-verdict            # 91/100 pass
world visual-verdict             # 91/100 pass
```

증거:

- `artifacts/dragon-v07/turntable/*.png`
- `artifacts/browser-qa/rc7/desktop-{festival-hub,wind-canyon,cloud-ruins}.png`
- `.omx/state/rc7/ralph-progress.json`

## 변경 파일과 단순화

- `tools/blender/build_dragon_blockout.py`: 연속 해부학 loft와 project-authored 재질을 생성한다.
- `tools/blender/export_dragon_glb.py`: 기존 런타임 피벗 계약을 내보낸다.
- `tools/blender/inspect_dragon_glb.py`: 해부학 메타데이터, 표정 피벗과 예산을 검사한다.
- `tools/blender/build_world_art.py`: 세 지역 high/low 실루엣과 vertex-color 면 분리를 생성한다.
- `tools/blender/inspect_world_glb.py`: 의미 노드·원점·LOD·normal·transform·예산을 한 번에 검사한다.
- 추적하던 RC5 월드 BLEND는 RC7 원본으로 교체하고 런타임 파일명은 호환성을 위해 유지했다.

## 남은 위험

- 드래곤은 18 primitives 상한을 모두 사용하므로 새 표현 부품을 추가하려면 기존 메시 병합이 먼저 필요하다.
- 머리 면 분할, 꼬리 관절 이음새와 발톱은 근접 턴테이블에서 더 다듬을 여지가 있지만 게임 카메라 게이트는 통과했다.
- 자동 자산 검사와 소프트웨어 WebGL은 실제 모바일 GPU 드라이버의 shading 차이를 대체하지 못한다.
