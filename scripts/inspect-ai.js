// Read-only attestation inspection. No completion or paid inference is requested.
import { InferenceClient, createTdxQuoteVerifier } from '@nearai/inference-sdk/node';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const model = process.argv[2] || process.env.NEARAI_MODEL;
if (!model || !process.env.NEARAI_API_KEY) throw new Error('Supply an actual TEE model and configure NEARAI_API_KEY');
const strict = { policy: { acceptedTcbStatuses: ['UpToDate'] },
  ...(process.env.NEARAI_PCCS_URL ? { verifiers: { tdxQuote: createTdxQuoteVerifier({ pccsUrl: process.env.NEARAI_PCCS_URL }) } } : {}) };
const client = new InferenceClient({ apiKey: process.env.NEARAI_API_KEY, baseUrl: 'https://cloud-api.near.ai/v1',
  e2ee: true, gatewayVerification: strict, modelVerification: strict });
try {
  const evidence = await client.verify(model);
  fs.mkdirSync('validation-data', { recursive: true });
  fs.writeFileSync('validation-data/ai-attestation-inspection.json', JSON.stringify(evidence, null, 2), { mode: 0o600 });
  const summarize = (item) => ({ tcbStatus: item.tcbStatus, signer: item.signer,
    appComposeSha256: createHash('sha256').update(item.deployment.appCompose).digest('hex'),
    runtimeMeasurements: item.deployment.runtimeMeasurements });
  console.log(JSON.stringify({ model, gateway: summarize(evidence.gateway), models: evidence.models.map(summarize),
    note: 'Cryptographic hardware checks passed. Review deployment provenance independently before approving these hashes.' }, null, 2));
} catch (error) { console.error('Attestation inspection failed: ' + error.message); process.exitCode = 1; }
