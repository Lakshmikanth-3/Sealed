// Vercel needs a static output directory. Appeal serves every route through the API
// function (so CSP and security headers always apply), so the static output stays empty.
import fs from 'node:fs';
fs.mkdirSync('.vercel-static', { recursive: true });
fs.writeFileSync('.vercel-static/.keep', '');
