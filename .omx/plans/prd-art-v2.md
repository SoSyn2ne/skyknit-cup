# Art V2: actual model comparison slice

## RALPLAN-DR
Principles: preserve playable game; authored geometry over cosmetic recolor; measurable model budgets; full-bleed inspectable preview; evidence before completion.
Drivers: user wants visibly richer Blender models, source files already exist, unfinished game performance work must remain isolated.
Options: (A) replace production assets now: immediate gameplay visibility but unvalidated rigs/performance and package risk. (B) separate comparison preview: safe detailed inspection with explicit later integration gap. Choose B. (C) renders alone: lowest implementation cost but cannot validate runtime or interaction; reject as incomplete evidence.

## Scope and acceptance
Implement docs/ART_V2_SPEC.md as one vertical slice. Preserve original assets and all unrelated edits. Improve dragon belly continuity and readable tail/wing camera; improve hub landing paving and natural cliff/vegetation arrangement. Keep Blender source and runtime GLB reproducible under 60k triangles/24 primitives each. Reopen actual GLBs and report finite geometry, normal/semantic-node checks and byte counts. Produce at least three actual model renders.

Independent dev page art-preview.html with src/artPreview.ts and src/artPreview.css: new/current versions; scene/dragon/hub views; drag/zoom, reset, motion pause/play, wireframe; loading/error/retry. No localStorage writes or game imports. Lazy current models and cache at most four roots. New GLBs stay in artifacts/art-v2 and are not bundled by production entry. Fit the visible bounds, cap DPR, support reduced motion and 44px keyboard-accessible controls. Styling uses semantic tokens and prioritizes the model, not introductory cards.

## Sequence and ownership
1. Planner (leader) grounds this PRD/test spec; architect then critic read-only review, sequentially.
2. Executor lanes: dragon generator/output; hub generator/output; preview/tests. Owners may only edit their lane and must preserve others. Model rendering is scheduled to avoid overlapping GPU/browser verification.
3. Leader: inspect real renders, persist visual verdict before next edits; correct docs section placement; run all checks and browser QA. Review score is against attainable stylized geometry target, not a false claim of photoreal reference equivalence.
4. Architect: fresh read-only sign-off; changed-files-only cleaner; reverify. Finish only when criteria met, otherwise record specific unverified gaps and persist continuation state.

Available roles: inherited default agents with executor/architect/critic installed prompts; no tmux team or new user-owned thread. Standard/high review reasoning inherited from current session. Subagents do not recursively orchestrate.

## ADR
Decision: isolated dev comparison before game replacement.
Drivers: unchanged physics/saves and existing production byte/performance budget.
Alternatives: direct replacement and render-only delivery above.
Consequences: preview can validate authored assets without claiming final gameplay readiness; assets require a separate integration/performance milestone.
Follow-up: user art approval, runtime rig mapping, game camera/readability/performance and real-device validation after this slice.
