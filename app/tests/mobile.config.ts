import { defineConfig } from '@playwright/test'
const baseURL = process.env.BUBL_TEST_URL || 'http://127.0.0.1:5174'

export default defineConfig({
  testDir: '.',
  testMatch: 'mobile-ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL,
    channel: 'msedge',
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:ui',
    url: baseURL,
    reuseExistingServer: true,
  },
})
