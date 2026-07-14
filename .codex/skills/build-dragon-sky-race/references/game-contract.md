# Dragon Sky Race Contract

Read this reference when implementing or tuning gameplay, visuals, controls, or browser QA. The product goal remains authoritative.

## Race State

```text
loading -> ready -> countdown -> racing -> finished
                           |          |
                           +-> paused <-+
```

Use this exact transition table for the Milestone 0 state tests:

| Current | Event | Guard | Next | Required effect |
| --- | --- | --- | --- | --- |
| `loading` | `ASSETS_READY` | required assets valid | `ready` | expose start input; timer remains zero |
| `ready` | `START` | valid keyboard/touch start input | `countdown` | reset transient race state; set countdown to 3 seconds |
| `countdown` | `COUNTDOWN_DONE` | remaining time is zero | `racing` | start elapsed timer at zero and unlock movement |
| `countdown` | `PAUSE` | none | `paused` | set `pausedFrom=countdown`; preserve remaining countdown |
| `racing` | `PAUSE` | none | `paused` | set `pausedFrom=racing`; preserve elapsed time and race state |
| `paused` | `RESUME` | `pausedFrom` exists | `pausedFrom` | continue the exact remaining countdown or race state; never restart it |
| `paused` | `RETURN_TO_READY` | none | `ready` | abandon the current run; reset transient race and mission attempt state; preserve mission choice, settings, grades, and records |
| `racing` | `FINISH` | all checkpoints passed in order | `finished` | freeze final elapsed time; update best only when valid |
| `paused` | `RESTART` | none | `countdown` | reset transient race state and start a fresh 3-second countdown |
| `finished` | `RETRY` | none | `countdown` | reset transient race state and start a fresh 3-second countdown |

Reject every event/state pair not listed above without changing state or data. During countdown, input may animate the dragon but cannot move it or start the timer. Preserve settings, mute, quality, and best time across `RESTART` and `RETRY`; reset elapsed time, checkpoint index, boost, position, velocity, and temporary effects.

Clear held input on `window.blur` and hidden `visibilitychange`. Dispatch `PAUSE` on either event while countdown or racing is active. In ready, paused, or finished state, only clear input.

## Initial Course Bounds

- Checkpoints: 10 to 12
- First-play target time: 2 to 4 minutes
- Active gate projected size: at least 48 CSS px, otherwise show an edge direction marker
- Respawn immunity: 1 second
- Respawn position: before the last passed gate, aligned toward the next gate
- Completion: ordered passage through the final gate, never a separate finish trigger alone
- Automatic out-of-bounds: altitude below `-12` or distance from the active course segment above `65` units for `1.5s`
- Manual respawn: immediate on `R` or the pause-menu command
- Respawn collision immunity: `1s`; preserve elapsed time and checkpoint progress

## Obstacle Collision

- Author simple sphere or capsule proxies for islands and solid obstacles; do not add a rigid-body engine.
- On collision, set the movement speed multiplier to `0.45` and recover it to `1.0` over `1.25s`.
- Ignore repeated collision triggers for `0.75s` and ignore all obstacle collisions during respawn immunity.
- Preserve timer, boost, and checkpoint progress.
- Show a `250ms` coral-color feedback and dragon recoil. Under reduced motion, omit camera shake and keep color/posture feedback.
- Unit-test speed recovery, cooldown, respawn immunity, and unchanged race progress in Milestone 3.

## Initial Flight Tuning

These are starting values, not immutable balance constants. Change them only with a before/after playtest note.

| Parameter | Initial value |
| --- | --- |
| Cruise speed | 24 world units/s |
| Boost speed multiplier | 1.6x |
| Boost capacity | 100 |
| Boost drain | 40/s |
| Boost recharge delay | 0.5s |
| Boost recharge | 20/s |
| Maximum visual bank | 30 degrees |
| Maximum movement pitch | 22 degrees |
| Maximum visual pitch | 18 degrees |
| Yaw rate | 1.4 rad/s at full input |
| Pitch follow | `1 - exp(-8 * dt)` |
| Bank follow | `1 - exp(-10 * dt)` |
| Maximum climb speed penalty | 15% |
| Maximum dive speed bonus | 20% |
| Simulation step | 1/60s |
| Maximum accumulated frame delta | 0.1s |
| Default camera FOV | 55 degrees |
| Boost camera FOV | 63 degrees |
| Camera position spring | 7.5 rad/s, damping ratio 1.0 |
| Camera look spring | 9 rad/s, damping ratio 1.0 |

Prefer forgiving steering and wide gates during Milestone 1. Increase course difficulty through line choice and vertical rhythm before tightening input response.

Use Three.js axes `+Y` up, local `-Z` forward, and local `+X` right. Build movement direction from yaw and pitch, then integrate `position += forward * speed * fixedDt`. Keep bank purely visual; it never changes yaw or movement direction.

## Determinism Scenario

Run the same 10-second simulation input against host-frame cadences `30fps`, `60fps`, `120fps`, and repeating jitter `[1/20, 1/120, 1/45, 1/90]`:

| Time | Input |
| --- | --- |
| 0-2s | neutral |
| 2-4s | yaw `+0.75` |
| 4-6s | pitch `+0.5` |
| 6-8s | boost held |
| 8-10s | yaw `-0.5`, pitch `-0.5` |

Compare every run with the 60fps baseline. Require movement distance and boost remaining within 2%, and final heading within 1 degree. Assert that each run consumes the same number of 60Hz simulation steps.

## Checkpoint Semantics

1. Store the dragon position from the previous simulation step.
2. Intersect the previous-to-current segment with the active gate plane.
3. Reject parallel, wrong-direction, or out-of-segment intersections.
4. Transform the intersection into gate-local space.
5. Accept only points inside the gate radius with a small forgiving margin.
6. Increment the active checkpoint once, emit one feedback event, and update the respawn anchor.
7. Never process inactive gates as progress.

Test high-speed crossing, dwelling inside a gate, reverse crossing, skipped gates, respawn near a gate, and the final gate.

## Input Contract

| Action | Keyboard | Touch |
| --- | --- | --- |
| Pitch | `W/S`, arrow up/down | Joystick vertical axis |
| Yaw/bank | `A/D`, arrow left/right | Joystick horizontal axis |
| Boost | `Shift` or `Space` | Boost button |
| Pause | `Escape` | Pause button |
| Respawn | `R` | Pause-menu command |

- Use Pointer Events and pointer capture for the joystick.
- Prevent page pan/zoom only on the game surface and controls.
- Clear held input on blur, visibility loss, pause, and pointer cancellation. Auto-pause active countdown/racing on both blur and visibility loss.
- Use the most recently active input device; do not sum keyboard and touch vectors.

## Visual Language

```css
--sky-zenith: #3c8991;
--sky-haze: #b8e3de;
--cloud: #f4efe2;
--ink: #102a2e;
--rock: #33474a;
--dragon-ember: #b94732;
--wing-gold: #e9ad3f;
--gate-rune: #39c99a;
--active: #f2c14e;
--danger: #e4543f;
```

- Use `--active` as the single primary interaction accent.
- Keep sky, dragon, gate, and landscape visually distinct rather than monochromatic.
- Use shallow HUD scrims only where contrast requires them; do not frame the entire interface.
- Use tabular numerals and fixed dimensions for the timer and checkpoint counter.
- Disable camera shake, FOV pulse, and strong speed lines under reduced motion.

## Performance Budget

- Desktop median: 55fps or better; minimum acceptance: 50fps
- Mobile low quality median: 30fps or better
- Desktop DPR cap: 1.75
- Mobile DPR cap: 1.25
- Initial compressed transfer target: under 10MB
- Use one primary shadow-casting light and a deliberately small shadow map budget.
- Prefer instancing for clouds, rocks, particles, and other repeated geometry.
- Avoid post-processing until measured headroom proves it is affordable.

## Browser QA Matrix

| Viewport | Input | Required checks |
| --- | --- | --- |
| 1440x900 | Keyboard | Full flow, framing, desktop performance |
| 1280x720 | Keyboard | HUD density, stable timer width |
| 844x390 | Touch | Landscape controls, safe area, no scroll |
| 390x844 | Touch | Portrait camera, gate visibility, no overlap |
| 320x568 | Touch | Long Korean text, minimum hit targets |

Inspect console errors, WebGL context state, nonblank canvas pixels, animation pixel changes, focus behavior, resize behavior, and retry state at every browser QA pass.

For Milestone 4, add Playwright assertions that every `[data-touch-control]` is at least 44x44 CSS px and remains inside the viewport after safe-area padding. Assert non-empty accessible names for icon buttons, keyboard focus visibility, no document scrolling during joystick use, and reduced-motion removal of shake, FOV pulse, and strong speed lines.
