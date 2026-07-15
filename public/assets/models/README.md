# Runtime 3D Assets

## Milestone 38 guardian character pipeline

Milestone 38의 현재 캐릭터 카탈로그는 다음 프로젝트 제작 자산을 사용한다.

| 수호수 | Blender 원본 | 런타임 GLB |
| --- | --- | --- |
| 해뜰녘 드래곤 | `assets/source/dragon/skyknit-dragon-v07.blend` | `public/assets/models/characters/skyknit-dragon.glb` |
| 잿불 봉황 | `assets/source/characters/ember-phoenix.blend` | `public/assets/models/characters/skyknit-phoenix.glb` |
| 폭풍 백호 | `assets/source/characters/storm-white-tiger.blend` | `public/assets/models/characters/skyknit-white-tiger.glb` |

Blender `.blend` 파일과 이를 재현하는 `tools/blender/build_character_assets.py`가 신규 수호수 형상의 소유 원본이다. 런타임 GLB, inspector 보고서와 스튜디오 미리보기는 파생 산출물이며 원본을 덮어쓰지 않는다. 캐릭터는 외부 게임·에셋 사이트에서 복사하지 않은 `project-authored` 자산이고, 별도 텍스처 파일 대신 프로젝트 제작 메시와 vertex color를 사용한다.

파이프라인 역할은 다음과 같이 분리한다.

- 생성: `tools/blender/build_character_assets.py`
- 런타임 내보내기: `tools/blender/export_character_asset.py`
- 구조·메타데이터·예산 검사: `tools/blender/inspect_character_assets.py`
- 비파괴 QA 미리보기: `tools/blender/render_character_preview.py`

예시 명령:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python tools/blender/build_character_assets.py -- --asset ember-phoenix
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python tools/blender/export_character_asset.py -- --input assets/source/characters/ember-phoenix.blend --output public/assets/models/characters/skyknit-phoenix.glb
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python tools/blender/inspect_character_assets.py -- --input public/assets/models/characters/skyknit-phoenix.glb --input public/assets/models/characters/skyknit-white-tiger.glb
```

M38 런타임 계약은 세 수호수에 `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`, `JawRig`, `EyeRig_L/R`, `AccessorySocket_Head/Back/Tail`과 `M_Dragon_Scale`, `M_Dragon_Membrane`, `M_Dragon_Glow`를 요구한다. `DragonRoot`와 `M_Dragon_*`는 호환성을 위한 레거시 이름이며 종족이나 재질 표현을 제한하지 않는다. 최종 inspector가 이 계약을 모두 확인해야 M38 자산을 완료로 기록한다.

M38 목표 게이트는 봉황 22,000~28,000 triangles, 백호 24,000~30,000 triangles, 각 14 meshes·18 primitives 이하, 정확히 3 materials, gzip-9 600KiB 이하이다. 이 수치는 목표이며 최종 SHA-256, 결정적 이중 내보내기와 시각 품질 통과 여부는 M38 검사 보고서가 만들어진 뒤 기록한다.

## RC7 Dragon Runtime Asset

- Source: `assets/source/dragon/skyknit-dragon-v07.blend`
- Reference: `assets/source/dragon/reference/skyknit-dragon-turnaround-v01.png`
- Generator: `tools/blender/build_dragon_blockout.py`
- Exporter: `tools/blender/export_dragon_glb.py`
- Inspector: `tools/blender/inspect_dragon_glb.py`
- Output: `public/assets/models/skyknit-dragon.glb`
- License: project-authored; not copied from an external game or reference site
- Blender source: 3,478,805 bytes; 104 meshes; 8,990 vertices; 17,564 triangles
- Runtime: 12 render meshes, 18 primitives, 19,628 triangles, 3 materials
- Materials: scale vertex palette, sunrise-gradient membrane, teal glow
- Anatomy: faceted continuous loft surfaces for torso/neck, wing arms, hips, legs, and feet, with a planar wedge cranium and tapered muzzle
- Runtime pivots: `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`, `JawRig`, `EyeRig_L/R`
- GLB size: 1,574,828 raw bytes / 389,429 gzip-9 bytes
- SHA-256: `F98A9A82927E64475C9DB19A741ABEC478CE5B4752DE8F541E6368FB94F39BD5`
- Deterministic double export: identical SHA-256 hashes
- Independent visual verdict: 91/100, pass

The generator rebuilds the project-authored source deterministically. The
exporter adds the runtime pivot hierarchy in memory and does not overwrite the
source `.blend` file.

## RC7 World Art Assets

- Source: `assets/source/world/skyknit-world-rc7.blend`
- Generator: `tools/blender/build_world_art.py`
- Inspector: `tools/blender/inspect_world_glb.py`
- Outputs: `public/assets/models/world/{festival-hub,wind-canyon,cloud-ruins}-{high,low}.glb`
- License: project-authored; no external model, texture, paid asset, or copied game art
- Runtime nodes: one `RegionRoot`, one `LandingPad`, and named landmark meshes per region
- Runtime policy: 420-unit load, 500-unit unload, low LOD outside 260 units, high LOD inside 220 units on desktop high quality
- Asset total: 5,028,788 raw bytes; 1,344,763 gzip bytes

The world generator stores varied vertex colors in every render mesh and uses
only project-authored PBR materials. High assets contain 15,724–16,848
triangles; low assets contain 4,620–4,988 triangles. Every LOD remains within
10–12 primitives and 4–6 materials. Blender source saving uses an atomic
staging file so a failed save cannot replace the last valid source file.

The complete RC7 runtime GLB set (dragon plus six world LODs) is 6,603,616 raw
bytes and 1,734,192 gzip-9 bytes.
