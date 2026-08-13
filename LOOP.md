# SKYKNOT CUP GO Loop

Each `/go` round follows:

1. Reconcile branch, worktree, processes, and current harness state.
2. Read the project contract, current goal, and latest evaluator feedback.
3. Select one cohesive product slice with explicit non-goals.
4. Implement the smallest useful change; write tests before or with behavior changes.
5. Run deterministic gates: test, typecheck, lint, build.
6. Run browser/play verification when the slice is visible. Capture rendered evidence, not only DOM state.
7. Write generator handoff and evaluator feedback with exact evidence.
8. Parent/evaluator inspects the diff and only then commits the verified slice.
9. Advance `docs/harness/state.md` to the next round or a truthful human-approval stop.

A verified committed slice with no implied next slice is a stop condition. A completed worker is not, by itself, a completed `/go` loop.
