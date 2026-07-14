# Autopilot implementation plan: progressive mission path

## Slice 1 - contracts and tests

- Add Milestone 36 product/implementation documentation, PRD, and test specification.
- Add failing tests for stable progression order, cumulative evaluation, derived unlocks, legacy later-record access, and next-mission lookup.
- Commit the documentation separately with Lore trailers.

## Slice 2 - pure rules and compatibility

- Extend `missionRules.ts` with one canonical progression order and pure unlock/next/lock-reason helpers.
- Rework mission Bronze/Silver/Gold evaluation so each step retains all earlier constraints.
- Reuse v8 canonical grade synchronization; do not add a stored unlock field or fabricate historical results.
- Prove race grades, boards, and ghost keys remain unchanged by ID.

## Slice 3 - ready, pause, and result UI

- Feed derived unlock state into `RaceHud` from the existing persistent snapshot.
- Keep every option visible; disable locked ones and render an explicit requirement/status line.
- Make the selector available in the Escape pause dialog and abandon the current attempt safely when choosing another unlocked mission.
- Add a successful-result `다음 미션` action that selects the newly unlocked mission and returns to ready; give the finale a completion message.
- Preserve retry and mission-selection actions.

## Slice 4 - verification and delivery

- Run targeted Vitest after each RED/GREEN slice.
- Run all unit tests, typecheck, lint, and build.
- Run mission Playwright and then the full suite across 1440x900, 1280x720, 844x390, 390x844, 320x568.
- Capture visual evidence, run visual verdict, inspect console/page/request errors, and update the Milestone 36 report/state.
- Run independent code/requirements reviews, fix findings, create Lore commits, confirm no push and clean worktree.
