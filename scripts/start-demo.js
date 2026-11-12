// Deliberately isolated: no .env loading, live RPC, key use or shared ledger.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NEAR_NETWORK = 'mock';
process.env.RELAY_ENABLED = 'false';
process.env.PORT = '8790';
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'appeal-preview-'));
await import('../server/index.js');
