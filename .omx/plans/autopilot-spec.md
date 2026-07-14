# Autopilot specification: progressive mission path

## Objective

Turn the existing six independent race missions into a permanent, cumulative progression while preserving all existing save and competition data.

## Player contract

1. A clean save exposes all six mission names but enables only `first-skyknot`.
2. A successful Bronze, Silver, or Gold result unlocks the immediate next mission permanently.
3. The stable progression order is:
   - `first-skyknot`: finish.
   - `boost-mastery`: finish and activate boost at least 3 times.
   - `no-respawn`: previous requirements and zero respawns.
   - `time-trial`: previous requirements and finish within 210 seconds.
   - `clean-flight`: previous requirements and zero collisions.
   - `golden-knot`: all requirements with a stricter 180-second / 5-boost Bronze floor.
4. Silver and Gold tighten time and/or boost thresholds without removing any earlier requirement.
5. Locked choices remain visible, disabled, and carry a Korean prerequisite naming the preceding mission and Bronze grade.
6. The ready selector and Escape pause selector expose identical lock state and explanations.
7. Successful results expose `다음 미션` when another mission exists; the final mission instead communicates full completion.

## Persistence contract

- Keep save version 8 and all existing fields.
- Derive unlocked missions from canonical `missionGrades`, which already folds valid mission Top 10 entries into the strongest saved grade.
- A legacy save with an achievement on a later progression mission unlocks all preceding missions and the following mission, but creates no synthetic grade, leaderboard row, or ghost.
- Unknown/corrupt grades and boards remain subject to existing normalization.
- Failure never unlocks a mission or enters a mission board.

## Non-goals

- No flight physics, checkpoint, course, camera, collision, respawn, boost resource, audio, world, ranking, or ghost format changes.
- No backend, account, network leaderboard, save reset, dependency, or engine migration.

## Acceptance gates

- Documentation and test spec landed first.
- Pure progression/evaluation/migration tests demonstrate RED then GREEN.
- HUD tests and Playwright cover ready, pause, result-next, final completion, keyboard focus, and five required viewports.
- Unit suite, typecheck, lint, build, targeted Playwright, full Playwright, console/runtime checks, and visual verdict pass.
- Lore commits are local only and the final worktree is clean.
