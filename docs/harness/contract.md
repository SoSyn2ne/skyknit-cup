# Game Harness Contract

A round is accepted only when all applicable gates pass.

1. The worker read the current project rules, goal, contract, and latest feedback before editing.
2. The diff is one cohesive slice with explicit non-goals.
3. No new gameplay rule, dependency, asset, or unrelated product direction is smuggled into the round.
4. Tests cover changed deterministic behavior.
5. `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.
6. Visible changes have browser/render evidence when the environment permits.
7. The visual scorecard has no zeroes; a build-only pass is insufficient.
8. Handoff and feedback contain exact commands, paths, and honest limitations.
9. The parent evaluator reads back the diff and evidence before committing.
10. Push, deployment, store submission, and human playtest claims require explicit authorization/evidence.

A missing artifact or unsupported success claim is a FAIL, not a warning.
