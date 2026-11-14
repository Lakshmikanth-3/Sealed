import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Offline browser checks: an unconfigured server, no keys, no chain writes.
const dataDir = mkdtempSync(path.join(tmpdir(), 'sealed-offline-'));
export default defineConfig({
  testDir: './tests/browser', testMatch: 'offline.spec.js', workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: 'http://localhost:18987', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/build-client.js && node server/index.js', url: 'http://localhost:18987/api/config', reuseExistingServer: false,
    env: { NEAR_NETWORK: 'testnet', PORT: '18987', DATA_DIR: dataDir, SEAL_CONTRACT: '', SEAL_OPS_ACCOUNT: '', SEAL_OPS_PRIVATE_KEY: '', SEAL_ESCROW_SECRET: '' } },
});
