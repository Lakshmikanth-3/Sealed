import { relayConfig } from './relayConfig.js';
import { prepareSignedAnchor } from './workerAuthorization.js';
import { RelayError } from './relayStore.js';

export async function createRelayService(env, dataDir, dependencies = {}) {
  const policy = relayConfig(env);
  if (!policy.enabled) return {
    readiness: () => ({ enabled: false, accepting: false }), close: async () => {},
    async handle(req, res, pathname, send) {
      if (!pathname.startsWith('/api/relay/')) return false;
      send(res, 503, { error: 'RELAY_DISABLED' }); return true;
    },
  };
  const { RelayStore } = await import('./relayStore.js');
  const { RelayRunner } = await import('./relayRunner.js');
  const { createRelayTransport } = await import('./relayTransport.js');
  const store = dependencies.store || new RelayStore(dataDir, policy);
  let runner;
  try {
    runner = dependencies.runner || new RelayRunner(store, dependencies.transport || createRelayTransport(policy), policy);
    runner.start();
  } catch { store.close(); throw new Error('Relay startup failed; check configuration and database lease locally'); }
  let windowStart = Date.now(), requests = 0;
  return {
    readiness: () => ({ enabled: true, accepting: runner.healthy && !runner.stopped,
      workerApprovalRequired: true, protocol: 2 }),
    async close() { await runner.stop(); store.close(); },
    async handle(req, res, pathname, send) {
      if (!pathname.startsWith('/api/relay/')) return false;
      try {
        if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
        if (++requests > policy.requestsPerMinute) throw new RelayError('RATE_LIMITED', 429);
        if (!runner.healthy || runner.stopped) throw new RelayError('RELAY_UNAVAILABLE', 503);
        if (pathname === '/api/relay/anchors' && req.method === 'POST') {
          const body = await readAuthorization(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)
            || !Object.hasOwn(body, 'authorization') || Object.keys(body).some((key) => !['authorization', 'retryOf'].includes(key))
            || (Object.hasOwn(body, 'retryOf') && !/^[A-Za-z0-9_-]{32}$/.test(body.retryOf))) throw new RelayError('INVALID_REQUEST', 400);
          let prepared;
          try { prepared = prepareSignedAnchor(body.authorization, policy); }
          catch { throw new RelayError('INVALID_AUTHORIZATION', 400); }
          const job = store.enqueue(body.authorization, prepared, policy, body.retryOf);
          send(res, 202, job); return true;
        }
        const match = pathname.match(/^\/api\/relay\/jobs\/([A-Za-z0-9_-]{32})$/);
        if (match && req.method === 'GET') { send(res, 200, store.publicJob(match[1])); return true; }
        throw new RelayError('NOT_FOUND', 404);
      } catch (error) {
        // Never reflect SDK/SQLite errors, submitted authorization, RPC credentials
        // or signed transaction bytes into a public response or access log.
        send(res, error instanceof RelayError ? error.status : 503,
          { error: error instanceof RelayError ? error.code : 'RELAY_UNAVAILABLE' });
        return true;
      }
    },
  };
}

async function readAuthorization(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new RelayError('JSON_REQUIRED', 415);
  const limit = 16384;
  if (Number(req.headers['content-length']) > limit) { req.resume(); throw new RelayError('BODY_TOO_LARGE', 413); }
  return new Promise((resolve, reject) => {
    let size = 0, rejected = false; const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { rejected = true; chunks.length = 0; reject(new RelayError('BODY_TOO_LARGE', 413)); }
      else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new RelayError('INVALID_JSON', 400)); }
    });
    req.on('error', () => reject(new RelayError('INVALID_REQUEST', 400)));
    req.on('aborted', () => reject(new RelayError('INVALID_REQUEST', 400)));
  });
}
