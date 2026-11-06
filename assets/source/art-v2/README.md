# Art V2 source set

- `dragon-v2.blend`: authored by `tools/blender/build_dragon_art_v2.py`.
- `hub-v2.blend`: authored by `tools/blender/build_hub_art_v2.py`.
- `reference/skyknit-rebuild-target.png`: AI-generated concept approved by the user; copied from this conversation's generated image. It is a visual target, not a Blender render, runtime texture, or evidence of in-game quality.

Geometry, materials and vertex colors are generated locally by this project's scripts. There are no downloaded third-party meshes or textures. The hub reuses local `build_adventure_hub.py` helpers; the dragon reuses local `build_dragon_blockout.py` scene helpers. Original production source/assets are not overwritten.

GLB exports, actual renders and validation reports go to `artifacts/art-v2/`. Rebuild with the commands in `docs/ART_V2_SPEC.md`; generated artifacts are intentionally not part of the production entry/package. Start Vite and open `/art-preview.html` to inspect after both exports exist. This page is a development preview, not a released game asset swap.
