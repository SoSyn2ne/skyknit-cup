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
  [
    playwrightCli,
    'test',
    'tests/e2e/performance.spec.ts',
    '--project=desktop',
    '--workers=1',
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, M6_PERFORMANCE: '1' },
    stdio: 'inherit',
  },
)

process.exit(result.status ?? 1)
