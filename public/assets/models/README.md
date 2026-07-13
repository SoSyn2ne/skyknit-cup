# Skyknot Dragon Runtime Asset

- Source: `assets/source/dragon/skyknit-dragon-v03.blend`
- Reference: `assets/source/dragon/reference/skyknit-dragon-turnaround-v01.png`
- Generator: `tools/blender/export_dragon_glb.py`
- Output: `public/assets/models/skyknit-dragon.glb`
- License: project-authored; not copied from an external game or reference site
- Runtime: 12 render meshes, 16 primitives, 19,748 triangles, 2 materials
- Runtime pivots: `DragonRoot`, `WingRig_L/R`, `HeadRig`, `TailRig_1..5`, `JawRig`, `EyeRig_L/R`
- GLB size: 2,648,668 bytes

The generator rebuilds the project-authored source deterministically. The
exporter adds the runtime pivot hierarchy in memory and does not overwrite the
source `.blend` file.

## RC5 World Art Assets

- Source: `assets/source/world/skyknit-world-rc5.blend`
- Generator: `tools/blender/build_world_art.py`
- Inspector: `tools/blender/inspect_world_glb.py`
- Outputs: `public/assets/models/world/{festival-hub,wind-canyon,cloud-ruins}-{high,low}.glb`
- License: project-authored; no external model, texture, paid asset, or copied game art
- Runtime nodes: one `RegionRoot`, one `LandingPad`, and named landmark meshes per region
- Runtime policy: 420-unit load, 500-unit unload, low LOD outside 260 units, high LOD inside 220 units on desktop high quality
- Asset total: 8,592,724 raw bytes; 1,328,632 gzip bytes

The world generator stores vertex colors in each GLB and uses only project-authored
PBR materials. High assets contain 16,836–34,736 triangles; low assets contain
3,114–4,044 triangles. Blender source saving uses an atomic staging file so a
failed save cannot replace the last valid source file.
