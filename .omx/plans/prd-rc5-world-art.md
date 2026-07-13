# RC5 3D 월드 아트 PRD

## Objective

RC4의 기능과 좌표 계약을 보존하면서 런타임 기본 도형 구조물을 프로젝트 자체 제작 Blender GLB 환경으로 교체한다. 브라우저와 모바일에서 세 지역의 정체성이 비행 중 즉시 읽혀야 한다.

## Player-facing result

- 축제 중심섬은 원형 비행장, 다층 축제탑, 깃발 군집과 금빛 레이스 아치로 읽힌다.
- 바람 협곡은 비대칭 자연 암벽, 풍식 터널과 끊어진 현수교로 읽힌다.
- 구름 유적지는 계단식 신전, 룬 기둥, 계단과 부유 석판으로 읽힌다.
- 탐험·착륙·저장·지도·비콘 레이스 진입은 RC4와 동일하게 동작한다.

## Tech stack and asset pipeline

- Blender 4.5.10 LTS background Python
- project-authored geometry, vertex colors and Principled BSDF materials
- six runtime GLBs under `public/assets/models/world/`
- Three.js `GLTFLoader`; no new runtime dependency
- high/low LOD selected from existing render quality tier

## Asset contract

| region | required nodes |
| --- | --- |
| festival-hub | `RegionRoot`, `LandingPad`, `FestivalAirfield`, `FestivalTower`, `FestivalFlags`, `RaceArch` |
| wind-canyon | `RegionRoot`, `LandingPad`, `CanyonCliffs`, `WindTunnel`, `BrokenBridge` |
| cloud-ruins | `RegionRoot`, `LandingPad`, `CloudTemple`, `RunePillars`, `TempleSteps`, `FloatingSlabs` |

- GLB local origin is the region center; RC4 world coordinates remain in TypeScript.
- LandingPad and challenge interaction coordinates remain authoritative in `openWorldRegions.ts`.
- Repeated static parts are joined by semantic/material group to limit draw calls.
- Normal runtime path contains no RC4 procedural building/cliff/pillar meshes.

## Budgets

| budget | high | low |
| --- | ---: | ---: |
| triangles per region | 12,000~60,000 | 3,000~25,000 |
| primitives | <=12 | <=12 |
| materials | <=8 | <=8 |
| active scene draw calls | <=120 | <=120 |

Total gzip remains below 10MiB. Low LOD must have fewer triangles than its paired high LOD.

## Runtime behavior

1. Region selection remains 420 load / 500 unload.
2. Low quality requests low GLBs; high quality uses low beyond 260 units and high inside 220 units.
3. A stale async result is disposed instead of entering the scene after unload/LOD switch.
4. Changing quality replaces loaded regions without changing game state.
5. Failed assets use a minimal project-authored fallback containing a landing pad and region marker.

## Commands

```text
Blender build: "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python tools/blender/build_world_art.py
GLB inspect:   "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python tools/blender/inspect_world_glb.py -- --root public/assets/models/world
Unit:          npm test
Typecheck:     npm run typecheck
Lint:          npm run lint
Build:         npm run build
E2E:           npm run test:e2e
Performance:   npm run test:performance
Production:    npm run test:production
Security:      npm audit --audit-level=high
```

## Boundaries

- Always: preserve RC4 state/coordinates, verify GLBs, browser screenshots and pixels, dispose unloaded assets.
- Ask first: paid/external assets, new dependencies, texture downloads, engine change.
- Never: Unity migration, NPC/combat/backend, new dragon/course, commit/push/deploy.

## Success criteria

- All twelve named structures are present in imported GLBs and visually readable.
- Three regions use distinct silhouette, vertical rhythm and accent color.
- LOD, streaming, fallback and disposal contracts are covered by tests.
- Five viewports and complete automatic quality gates pass.

## Open questions

None. The user explicitly approved the RC5 goal and boundaries.
