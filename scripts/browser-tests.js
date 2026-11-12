// Portable browser testing: uses Playwright's pinned Chromium download rather
// than a system Chrome install. Does not load .env or contact public NEAR RPC.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: true, env: { ...process.env, PLAYWRIGHT_CHANNEL: 'chromium' } });
if (result.error) { console.error('Could not launch Playwright'); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
