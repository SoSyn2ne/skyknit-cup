import { defineConfig, devices } from '@playwright/test'

const productionRun = process.env.M6_PRODUCTION === '1'
const PORT = productionRun ? 4_177 : 4_176
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: [
    ...(process.env.M6_PERFORMANCE === '1'
      ? []
      : ['**/performance.spec.ts']),
    ...(productionRun ? [] : ['**/production.spec.ts']),
  ],
  fullyParallel: false,
  // WebGL contexts share the same software renderer in CI; serialize them so
  // countdown timing measures the game instead of GPU contention.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    launchOptions: {
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: productionRun
      ? `npm run preview -- --host 127.0.0.1 --port ${PORT}`
      : `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1_440, height: 900 },
      },
    },
    {
      name: 'desktop-compact',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1_280, height: 720 },
      },
    },
    {
      name: 'touch-landscape',
      use: {
        browserName: 'chromium',
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'touch-portrait',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'touch-minimum',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
})
