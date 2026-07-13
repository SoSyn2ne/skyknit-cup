# RC5 3D 월드 아트 테스트 명세

## Blender/GLB inspection

- six expected GLBs exist and import without warnings/errors
- every file contains `RegionRoot`, `LandingPad` and its region-specific required nodes
- asset extras identify `asset_version=0.5`, region id, LOD and `asset_license=project-authored`
- high/low triangle, primitive, material and byte budgets pass
- each low GLB has fewer triangles than its high pair

## Unit/integration

- low quality requests low art, while high quality switches between low/high art with 220/260-unit distance hysteresis
- the same loaded region is retained inside the 500-unit unload radius
- quality change replaces a loaded region with the other LOD
- unloading before async completion disposes the stale loaded group
- loader rejection installs the minimal fallback without rejecting the render loop
- dispose removes groups and releases owned geometry/material resources

## Browser

- every required viewport renders nonblank/changing WebGL pixels with zero console/page errors
- development hooks can visit all three regions and report `assetStatus=ready` and the expected LOD
- each region screenshot contains the dragon and its required landmark silhouettes without HUD/control overlap
- landing, takeoff, destination persistence and challenge-to-race tests still pass

## Performance and production

- desktop high median >=55fps, minimum bucket >=50fps
- mobile low median >=30fps
- active high scene draw calls <=120
- total gzip <10MiB
- production build contains world GLBs but no development QA hook strings

## Final evidence

- `.omx/state/rc5/ralph-progress.json` visual-verdict >=90
- `docs/MILESTONE_21_RC5_AUTOMATED_QA_REPORT.md`
- `docs/RC5_WORLD_ART_PLAYTEST_HANDOFF.md`
