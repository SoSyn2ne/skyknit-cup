# Mission progression pre-context snapshot

## Task

Implement a permanent six-step mission progression in `C:\ProjectsSY\dragon-race` without changing the course or flight physics.

## Desired outcome

- Only `first-skyknot` is unlocked for a new player.
- Bronze or better permanently unlocks the next mission.
- Progression order is `first-skyknot` -> `boost-mastery` -> `no-respawn` -> `time-trial` -> `clean-flight` -> `golden-knot`.
- Requirements accumulate in the order finish -> boost -> no respawn -> time -> no collision -> stricter combined finale.
- Every mission selector, including the Escape pause flow, keeps all six missions visible and explains locked requirements.
- A successful result offers a direct next-mission action.
- Existing v8 grades, mission Top 10 boards, ghosts, race/coin records, exploration, audio, and quality settings survive unchanged.

## Confirmed repository facts

- Mission IDs and pure evaluation live in `src/game/missions/missionRules.ts`.
- Mission attempt state lives in `src/game/missions/missionState.ts`.
- Race completion merges grades and mission boards in `src/game/race/raceState.ts`.
- v8 persistence canonicalizes mission grades from both the compatibility summary and mission boards in `src/game/persistence/records.ts`.
- The ready selector and Escape/result actions are rendered by `src/game/ui/RaceHud.ts`.
- Runtime actions and HUD view adaptation live in `src/game/createRenderer.ts`.
- No new dependency or save-version field is required; unlocks can be derived from preserved achievements.

## Constraints

- Documentation and test specification precede production changes.
- Use strict RED -> GREEN -> REFACTOR.
- Preserve the one course, all existing IDs and records, flight model, fixed-step simulation, and Three.js runtime.
- Verify unit, typecheck, lint, build, and Playwright at 1440x900, 1280x720, 844x390, 390x844, and 320x568.
- Commit with Lore trailers; do not push.

## Migration decision

Unlock state is derived, not separately stored. The highest progression position with a valid saved grade or canonical mission-board result unlocks every earlier mission plus the next mission. This preserves access for saves created when every mission was selectable, while never inventing grades or board entries.

## Open implementation checks

- Keep locked options visible and disabled while ensuring the selected mission always remains unlocked after normalization.
- Fit the pause selector, lock explanation, and result next action at the two shortest viewports.
- Keep mission leaderboard and ghost lookup keyed by unchanged mission IDs after catalog reordering.
