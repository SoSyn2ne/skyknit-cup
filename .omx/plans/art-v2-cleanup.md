# Art V2 changed-files-only cleanup

Run only after fresh browser/static evidence and architect approval. Regression locks:782 unit tests, art-preview E2E (five sizes, async/error/navigation/save preservation) and both actual GLB reload audits.

Scope: art-preview.html; src/artPreview.ts/.css; tests/e2e/art-preview.spec.ts; tests/e2e/art-preview-performance.spec.ts; tools/blender/build_dragon_art_v2.py; tools/blender/build_hub_art_v2.py; docs/ART_V2_SPEC.md; docs/ART_V2_QA_REPORT.md; ArtV2 additions to docs/PRODUCT_GOAL.md and docs/IMPLEMENTATION_PLAN.md; assets/source/art-v2/README.md. Never touch older dirty shader/tests, other plans or original assets.

1. Dead code: remove only verified unused imports/values, abandoned geometry experiments, debug-only ad-hoc output. Keep intentional read-only test hook and asset reports.
2. Duplication/boundaries: check async release ownership, model layout load/resize sharing and no game/storage coupling. Avoid generic new abstraction; no numerical geometry/material changes during cleanup.
3. Naming/error handling: clarify only misleading names/comments, keep expected async-load failure handling and scoped retry.
4. Tests: retain all existing coverage; no deleting assertions to pass. Improve weak assertions only if a concrete gap is observed.

If no actionable smell remains, record inspected categories and no changes; do not manufacture refactoring. Any code edit needs targeted tests and renewed visual verdict if appearance changes. After the pass run all unit tests/typecheck/lint/build and art-preview E2E again. Report warnings and untested real-device/game integration explicitly.
