# Milestone 36 Progressive Missions PRD

## Objective

Make the existing six mission IDs feel like one understandable difficulty climb: finish, learn boost, fly without respawn, beat the clock, avoid every collision, then combine all skills.

## Progression order and Bronze unlock floor

| Step | Existing ID | Mission | Bronze success requirement |
| --- | --- | --- | --- |
| 1 | `first-skyknot` | 첫 하늘매듭 | Finish the ordered course. |
| 2 | `boost-mastery` | 돌풍 조율사 | Finish with at least 3 boost activations. |
| 3 | `no-respawn` | 끊기지 않는 매듭 | Step 2 requirements plus 0 respawns. |
| 4 | `time-trial` | 질풍 시간전 | Step 3 requirements plus elapsed time <= 210 seconds. |
| 5 | `clean-flight` | 구름 한 점 없이 | Step 4 requirements plus 0 collisions. |
| 6 | `golden-knot` | 황금 하늘매듭 | 0 collisions, 0 respawns, at least 5 boosts, elapsed time <= 180 seconds. |

Silver and Gold keep every Bronze requirement and tighten only time/boost thresholds. No mission can earn a grade by dropping an earlier skill.

## Unlock contract

- New saves unlock only Step 1.
- Any awarded grade (`bronze`, `silver`, `gold`) unlocks the immediate next step.
- Unlocks are monotonic because best grades never decrease.
- All six entries remain visible. Locked entries are disabled and say that Bronze on the preceding named mission is required.
- The highest valid historical mission achievement unlocks all earlier steps and the following step. This prevents a v8 player who completed a later mission under the old free-selection model from losing access.
- Unlock derivation never inserts grades, leaderboard rows, or ghosts.

## Interaction contract

- Ready and Escape pause use the same ordered catalog, enabled state, requirement copy, and selected-mission details.
- Selecting another unlocked mission from pause abandons only the current transient attempt, returns to ready, and preserves settings and all records.
- Locked options cannot be selected through pointer, keyboard, or runtime action dispatch.
- After success, `다음 미션` selects the next unlocked step and returns to ready. It does not auto-start the countdown.
- The final mission success uses an all-missions-complete message and shows no next action.
- Failure keeps retry and mission selection available and does not unlock anything.

## Save and competition compatibility

- Save key and version remain `skyknit-cup:settings` v8.
- Existing `missionGrades`, mission Top 10 entries, mission ghosts, race/coin records, exploration state, audio, and quality round-trip byte-for-meaning unchanged.
- Canonical mission-board results continue to strengthen the compatibility `missionGrades` summary before unlock derivation.
- Mission progression order changes display only; all persistence and ghost maps remain keyed by the six unchanged IDs.

## Boundaries

- Always: preserve the course, checkpoints, fixed-step flight, boost resource, collision/respawn behavior, camera, dragon, open world, BGM, Top 10 ranking, and ghosts.
- Never: new course geometry, tuning changes, synthetic legacy achievements, stored duplicate unlock state, new dependency, Unity migration, backend, or account.

## Success criteria

- Pure tests prove exact cumulative Bronze/Silver/Gold boundaries and unmet criteria.
- New, partial, sparse-later, and complete historical achievements derive the intended unlock set.
- Every selector shows six ordered entries with clear lock text; pause and ready agree.
- Success advances to the next mission in one action and the finale terminates progression cleanly.
- All automated gates and five viewports pass without physics/course snapshots changing.
