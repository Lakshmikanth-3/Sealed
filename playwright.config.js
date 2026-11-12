import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Synthetic tests use a separate mock ledger; never load the developer's .env.
const dataDir = mkdtempSync(path.join(tmpdir(), 'appeal-browser-'));
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:18987', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true,
    viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node server/index.js', url: 'http://localhost:18987/api/config',
    reuseExistingServer: false,
    env: { NEAR_NETWORK: 'mock', RELAY_ENABLED: 'false', PORT: '18987', DATA_DIR: dataDir } },
});
