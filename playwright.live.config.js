import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Live end-to-end test on NEAR testnet. Uses the deployed contract and operator from .env,
// spends a little testnet NEAR, and takes about 3 minutes (it waits for real unlock times).
// Fixed path so the test can tamper with the stored encrypted file.
export const dataDir = path.join(tmpdir(), 'sealed-paper-e2e'); mkdirSync(dataDir, { recursive: true });
export default defineConfig({
  testDir: './tests/browser', testMatch: 'sealed-e2e.spec.js', workers: 1, retries: 0, reporter: 'list', timeout: 600_000,
  use: { baseURL: 'http://localhost:18988', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, acceptDownloads: true, screenshot: 'only-on-failure' },
  webServer: { command: 'node --env-file=.env server/index.js', url: 'http://localhost:18988/api/config', reuseExistingServer: false,
    env: { PORT: '18988', DATA_DIR: dataDir, GEOIP_PROVIDER: 'mock' } },
});
