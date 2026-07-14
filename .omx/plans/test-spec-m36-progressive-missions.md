# Milestone 36 Progressive Missions Test Specification

## Pure catalog and unlock rules

- The progression order is exactly `first-skyknot`, `boost-mastery`, `no-respawn`, `time-trial`, `clean-flight`, `golden-knot` and contains each existing ID once.
- Empty grades unlock only Step 1.
- Bronze/Silver/Gold on a step unlocks the next step; failed/missing/unknown input does not.
- Sparse historical achievement at any later step unlocks every prior step plus one following step.
- Final achievement unlocks all six and returns no next mission.
- Lock reasons name the immediately preceding mission and Bronze requirement.

## Cumulative evaluation boundaries

- All missions fail unfinished or invalid attempts.
- Step 1 grades by 180/210-second Gold/Silver thresholds with unrestricted Bronze finish.
- Step 2 requires 3/5/7 boost activations for Bronze/Silver/Gold.
- Step 3 also requires zero respawns; Silver requires 5 boosts and <=210 seconds, Gold 7 boosts and <=180 seconds.
- Step 4 also requires <=210 seconds; Silver requires <=165 seconds and 5 boosts, Gold <=150 seconds and 7 boosts.
- Step 5 also requires zero collisions while retaining zero respawns, time, and boost floors; Silver/Gold use the Step 4 tightened thresholds.
- Step 6 Bronze requires <=180 seconds, zero collisions, zero respawns, and 5 boosts; Silver requires <=165 seconds and 6 boosts; Gold <=150 seconds and 7 boosts.
- Each failed combination reports every applicable unmet criterion.

## Save and record compatibility

- Existing v8 documents round-trip with unchanged grades, mission Top 10 entries, mission ghosts, race/coin boards, exploration, audio, and quality.
- A mission Top 10 grade missing from the compatibility summary is synchronized before unlock derivation.
- A later historical grade unlocks earlier display steps without writing synthetic earlier grades or new board/ghost entries.
- Corrupt/unknown IDs remain removed by the existing v8 canonicalizer.

## State and runtime guards

- Starting/selecting a locked mission is rejected without changing state.
- A successful finish updates the best grade first, making the next action available in the same result frame.
- Pause selection of an unlocked different mission performs the documented transient-abandon transition; locked requests are no-ops.
- Retry keeps the current mission and reset semantics.
- Context recovery preserves the selected mission, current attempt, and derived unlock state.

## HUD and browser

- Ready and pause selectors each expose six ordered options, identical disabled states, and visible Korean requirements.
- Keyboard cannot land on/select disabled missions; pointer/touch cannot start one.
- Pause mission change returns to ready with the new unlocked mission selected and focus in the selector.
- Successful non-final result exposes `다음 미션`; activation selects the next mission without starting it.
- Final success announces all missions complete and omits the next action.
- Failure exposes retry/selection but no next action.
- At 1440x900, 1280x720, 844x390, 390x844, and 320x568, the selector status and primary actions remain inside the viewport, touch targets are >=44px, document overflow is zero, and focus is visible.
- Canvas is nonblank and time-changing; console, page, unhandled rejection, WebGL, and required network errors are zero.

## Regression gates

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- targeted mission Playwright followed by the full five-project Playwright matrix
- visual verdict state at `.omx/state/m36-progressive-missions/ralph-progress.json`
- no changes to flight/course source unless a test-only import is required (expected: none)
