import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const playwrightCli = path.join(
  projectRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
)
const result = spawnSync(
  process.execPath,
  [playwrightCli, 'test', 'tests/e2e/production.spec.ts', '--workers=2'],
  {
    cwd: projectRoot,
    env: { ...process.env, M6_PRODUCTION: '1' },
    stdio: 'inherit',
  },
)

process.exit(result.status ?? 1)
