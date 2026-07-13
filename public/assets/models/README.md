# RC7 Dragon Runtime Asset

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
