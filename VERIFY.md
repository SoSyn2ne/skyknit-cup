# SKYKNOT CUP Verification Contract

## Deterministic gates

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Do not weaken, skip, or replace a failing gate with a self-authored success marker.

## Browser/play gates

For visible game changes, use a fresh strict-port preview and verify:

- the intended SKYKNOT CUP HTML and bundle load;
- a non-zero WebGL canvas with changing pixels over time;
- start → countdown → race is reachable;
- keyboard and at least one touch viewport remain usable;
- one real input changes flight position or race state;
- the next gold gate and two wind threads remain readable;
- console errors and unhandled rejections are zero;
- no fixed-width starter layout or HUD overlap appears at `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`.

## M41 motion scorecard

Score 0/1/2 from actual rendered frames. Any zero fails the round.

| Criterion | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Dragon reads as a living flying creature | static/vehicle-like | motion exists but weak | wings, body, head and tail feel connected |
| Three guardians feel distinct | indistinguishable | small rhythm difference | dragon/avian/feline motion profiles are legible |
| Boost reads immediately | no visible change | subtle | launch stroke/fold and route feedback are clear |
| Gate and wind-thread hierarchy survives | obscured | partial | next gate remains dominant and readable |
| Ghost remains a comparison aid | overlaps/confuses | visible but noisy | readable, subordinate, and spatially clear |
| Reduced-motion remains comfortable | ignored | partially reduced | camera/VFX reduction preserves route readability |

## Evidence rules

- A worker summary is not evidence until commands/files/browser state are read back independently.
- Human device playtesting remains pending unless the user supplies results.
- Do not commit `dist`, `node_modules`, screenshots, logs, or local agent state.
