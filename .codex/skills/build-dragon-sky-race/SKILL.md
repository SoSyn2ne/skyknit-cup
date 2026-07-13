---
name: build-dragon-sky-race
description: Plan, implement, debug, review, or visually verify the Dragon Sky Race project. Use for work in this repository involving Three.js flight, the dragon rig, sky-course checkpoints, race state, touch controls, HUD, performance budgets, browser QA, or the Korean game concept 하늘매듭배.
---

# Build Dragon Sky Race

Keep the project moving one verified milestone at a time while preserving the agreed dragon-flight identity and first-release scope.

## Load Project Context

Read these files before deciding or editing:

1. [`AGENTS.md`](../../../AGENTS.md)
2. [`docs/PRODUCT_GOAL.md`](../../../docs/PRODUCT_GOAL.md)
3. [`docs/IMPLEMENTATION_PLAN.md`](../../../docs/IMPLEMENTATION_PLAN.md)
4. [`references/game-contract.md`](references/game-contract.md) when tuning gameplay, visuals, input, or QA

Treat the latest user instruction as authoritative. Update the product goal and plan before code when a request changes first-release scope.

## Check The Planning Gate

Inspect the status at the top of `docs/PRODUCT_GOAL.md`.

- If the gate is closed, only refine goals, plans, rules, tests specs, or the skill. Do not create runtime code, install dependencies, or add game assets.
- If the user approves the plan, change the status to `승인됨 / 구현 게이트 열림`, then begin Milestone 0.
- If the gate is open, work only on the current milestone unless the user explicitly reprioritizes it.

## Select The Work Mode

### Plan

1. Restate the player-facing outcome.
2. Identify the current milestone and its measurable exit criteria.
3. List planned file changes and dependencies.
4. Record scope changes in the product goal or implementation plan.
5. Stop before runtime edits while the planning gate is closed.

### Implement

1. Read the current milestone completely.
2. Write failing tests first for pure game rules.
3. Implement the smallest playable vertical slice.
4. Run unit tests, typecheck, lint, and build.
5. Start the dev server and verify the slice in a real browser.
6. Capture a real-browser screenshot and inspect canvas pixels for every visual iteration.
7. Fix failures before expanding the slice.

### Debug

1. Reproduce the problem in the smallest reliable scenario.
2. Decide whether the defect belongs to game rules, input, rendering, UI, persistence, or performance.
3. Add a regression test when the defect is deterministic outside WebGL.
4. Inspect browser console and canvas state for rendering defects.
5. Fix the root cause, then rerun the complete milestone verification.

### Review

1. Lead with functional regressions, race-rule violations, browser failures, and missing tests.
2. Check the product invariants in `AGENTS.md` before style concerns.
3. Verify claims against actual files and fresh test output.
4. Report no issues explicitly when the change passes, plus any residual browser or performance risk.

## Implement In This Order

1. Milestone 0: race transition primitives, checkpoint geometry, toolchain, and renderer failure state
2. Milestone 1: flight model, boost, input, and follow camera
3. Milestone 2: checkpoint sequence, pause/resume, respawn, timer, and persistence
4. Milestone 3: dragon rig, wind-thread course, world, and obstacle collision
5. Milestone 4: HUD, touch controls, accessibility, and responsive browser scenarios
6. Milestones 5-6: quality policy, generated audio, recovery states, performance tuning, and final QA

Do not spend time polishing the world before the flight sandbox is enjoyable and testable.

## Preserve The Game Identity

- Keep auto-forward arcade flight for the first release.
- Animate wings, shoulder-led banking, delayed body/tail follow, and boost posture.
- Use the scarlet dragon, paired wind threads, and gold gate as the first-viewport signature.
- Keep the Three.js scene full-bleed.
- Keep the next checkpoint readable at all times.
- Avoid car dashboards, exhaust effects, wheels, ground-track logic, and copied reference-site composition.

## Verify Browser Work

At minimum, verify `1440x900`, `1280x720`, `844x390`, `390x844`, and `320x568`.

For 3D work, prove all of the following:

- The canvas contains varied non-black pixels.
- Two screenshots at least one second apart differ in world or animation pixels.
- The dragon, paired wind threads, and active gate are framed together.
- Keyboard and touch can each complete the tested flow.
- HUD text and controls do not overlap or leave the safe area.
- Console errors and unhandled rejections are zero.
- The quality tier preserves course readability.

## Finish A Milestone

Report:

- changed files
- player-visible behavior
- tests, typecheck, lint, build, and browser checks run
- simplifications made
- remaining risks or untested devices

Do not claim a milestone complete without fresh evidence for every applicable exit criterion.
