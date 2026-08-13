# SKYKNOT CUP Runbook

## Install

```bash
npm ci
```

## Deterministic verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Preview

Use a fresh strict port so another app cannot masquerade as this project:

```bash
npm run preview -- --host 0.0.0.0 --port 4251 --strictPort
```

Then verify the page title/marker, canvas, interaction, network assets, and console with the browser tools. Use a cache-busting query for repeated captures.

## Cleanup

Stop only the preview process started for this repo. Do not kill unrelated projects or the shared Codex app-server.
