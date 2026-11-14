// Vercel serverless entry: every route goes through the same handler as the local server,
// so CSP, same-origin checks and rate limits apply everywhere.
export { handler as default } from '../server/index.js';
