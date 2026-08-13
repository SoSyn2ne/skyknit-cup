# SKYKNOT CUP Codex GO · Round 1 narrow continuation

Work only in `/home/sy/.openclaw/workspace/projects/skyknit-cup`.

The previous broad run made no source diff after extended exploration and was stopped. This is a bounded continuation: do not research, do not inspect unrelated docs, do not use MCP, subagents, OMX, or remote-branch cherry-picks.

Read only these files first:

- `AGENTS.md`
- `VERIFY.md`
- `src/game/world/dragonPose.ts`
- `src/game/world/dragonPose.test.ts`
- `src/game/world/createDragon.ts`
- `src/game/world/createDragon.test.ts`
- `src/game/customization/characterCatalog.ts`

Implement one pure visual-pose slice in these files only, plus `docs/harness/handoff/round-1-gen.md`:

1. Extend pose state so existing rig updates can express `glide`, `cruise`, `climb`, `dive`, and `boost`.
2. Add delayed body/head/tail response and wing spread/fold/flap signals while preserving existing fields and behavior contracts.
3. Use the existing catalog motion profiles (`dragon`, `avian`, `feline`) to make rhythm distinct; do not change flight physics, collision, checkpoints, missions, records, storage, or asset paths.
4. Wire the new pose fields into the existing named rig in `createDragon.ts` only where the rig already exists. Keep fallback safe.
5. Add focused tests for mode selection, delayed follow, profile distinction, boost launch, and paused dt behavior. Do not rewrite unrelated tests.

Do not add dependencies, assets, new gameplay, or broad docs. Do not update product milestone docs. Do not commit or push.

Run exactly:

```bash
npm test -- src/game/world/dragonPose.test.ts src/game/world/createDragon.test.ts
npm run typecheck
npm run lint
npm run build
```

Then write `docs/harness/handoff/round-1-gen.md` with the changed files, exact command outcomes, and limitations. If any command fails, fix only this slice and rerun it. Stop after the handoff. Do not claim browser or human validation unless you actually ran it.
