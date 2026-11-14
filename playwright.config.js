import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Browser checks use an unconfigured live-only server; never load developer secrets.
const dataDir = mkdtempSync(path.join(tmpdir(), 'appeal-browser-'));
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'live-workspace.spec.js',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:18987', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true,
    viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/build-client.js && node server/index.js', url: 'http://localhost:18987/api/config',
    reuseExistingServer: false,
    env: { NEAR_NETWORK: 'testnet', RELAY_ENABLED: 'false', PORT: '18987', DATA_DIR: dataDir } },
});
