export async function contractReadiness(chain, worker) {
  if (!chain.contract) throw new Error('Deploy the Appeal contract and set ANCHOR_CONTRACT');
  const call = async (method, params) => {
    const response = await fetch(chain.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'readiness', method, params }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('NEAR RPC unavailable');
    const body = await response.json();
    if (body.error || !body.result) throw new Error('NEAR contract query failed');
    return body.result;
  };
  const status = await call('status', []);
  if (status.chain_id !== chain.network) throw new Error('RPC network mismatch');
  const view = async (method_name, args) => {
    const result = await call('query', { request_type: 'call_function', finality: 'final', account_id: chain.contract,
      method_name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
    return JSON.parse(Buffer.from(result.result).toString('utf8'));
  };
  const config = await view('get_config', {});
  if (config.protocol !== 2 || config.network !== chain.network) throw new Error('Contract protocol or network mismatch');
  if (worker && !await view('is_registered', { worker })) throw new Error('Contract owner must register this worker before anchoring');
  return { ready: true, network: chain.network, contract: chain.contract, protocol: 2 };
}
