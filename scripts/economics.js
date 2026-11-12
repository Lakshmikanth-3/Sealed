import fs from 'node:fs';
import { assessEconomics } from '../lib/economics.js';
const [file, ...extra] = process.argv.slice(2);
if (!file || extra.length) {
  console.error('Usage: npm run economics -- <private-local-cost-scenario.json>'); process.exitCode = 1;
} else {
  try {
    if (fs.statSync(file).size > 1024 * 1024) throw new Error('Scenario file is too large');
    console.log(JSON.stringify(assessEconomics(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2));
  } catch (error) { console.error('Cost scenario refused: ' + error.message); process.exitCode = 1; }
}
