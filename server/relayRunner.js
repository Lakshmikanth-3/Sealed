import { randomUUID } from 'node:crypto';
import { prepareSignedAnchor } from './workerAuthorization.js';
import { intentHash } from './relayStore.js';

export class RelayRunner {
  constructor(store, transport, policy) {
    this.store = store; this.transport = transport; this.policy = policy;
    this.owner = randomUUID(); this.busy = false; this.stopped = false; this.healthy = true;
  }
  start() {
    if (!this.store.acquire(this.owner)) throw new Error('Another relay process holds the database lease');
    this.heartbeat = setInterval(() => {
      if (!this.healthy || this.stopped) return;
      try { if (!this.store.acquire(this.owner)) this.healthy = false; }
      catch { this.healthy = false; }
    }, 5000);
    this.timer = setInterval(() => { void this.tick().catch(() => { this.healthy = false; }); }, 3000);
    this.heartbeat.unref(); this.timer.unref();
  }
  async stop() {
    this.stopped = true; clearInterval(this.timer); clearInterval(this.heartbeat);
    // Do not release the lease while an asynchronous side effect can still run.
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 10));
    this.store.release(this.owner);
  }
  active(job, states) {
    return this.store.locked(this.owner, () => {
      const current = this.store.get(job.id);
      return !this.stopped && states.includes(current.state) && this.store.approved(job.worker);
    });
  }
  change(job, state, code, fields) {
    this.store.locked(this.owner, () => this.store.transition(job.id, state, code, fields));
  }
  async tick() {
    if (this.busy || this.stopped || !this.healthy) return;
    this.busy = true;
    try {
      this.store.assertLease(this.owner);
      let job = this.store.next();
      if (!job) return;
      if (['submitted', 'unknown'].includes(job.state)) return await this.reconcile(job);
      if (!this.active(job, ['queued', 'validating', 'prepared'])) return;
      if (job.state === 'prepared') {
        try { await this.transport.validate(prepareSignedAnchor(JSON.parse(job.authorization), this.policy)); }
        catch (error) {
          if (this.active(job, ['prepared'])) this.change(job, error.code === 'DELEGATE_EXPIRED' ? 'expired' : 'failed',
            error.code === 'DELEGATE_EXPIRED' ? 'DELEGATE_EXPIRED' : 'PREFLIGHT_REJECTED');
          return;
        }
      }
      if (job.state !== 'prepared') {
        this.change(job, 'validating');
        let prepared;
        try {
          prepared = prepareSignedAnchor(JSON.parse(job.authorization), this.policy);
          await this.transport.validate(prepared);
        } catch (error) {
          if (this.active(job, ['validating'])) this.change(job, error.code === 'DELEGATE_EXPIRED' ? 'expired' : 'failed',
            error.code === 'DELEGATE_EXPIRED' ? 'DELEGATE_EXPIRED' : 'PREFLIGHT_REJECTED');
          return;
        }
        if (!this.active(job, ['validating'])) return;
        // A crash during signing has no broadcast side effect. A crash after
        // this commit recovers ONLY the stored signature, never a replacement.
        const signed = await this.transport.prepare(prepared);
        this.store.locked(this.owner, () => {
          if (this.stopped || this.store.get(job.id).state !== 'validating' || !this.store.approved(job.worker)) return;
          this.store.transition(job.id, 'prepared', null, { signed_bytes: signed.bytes, tx_hash: signed.hash });
        });
        job = this.store.get(job.id);
      }
      if (!this.active(job, ['prepared'])) return;
      this.change(job, 'submitted', null, { attempts: job.attempts + 1 });
      // 'submitted' means broadcast may have happened, even if a crash occurs
      // on the following line. No automatic expiry or nonce replacement.
      this.store.assertLease(this.owner);
      try { await this.transport.broadcast(job.signed_bytes); } catch { /* ambiguous; reconcile */ }
      await this.reconcile(this.store.get(job.id), false);
    } finally { this.busy = false; }
  }
  async reconcile(job, retransmit = true) {
    try {
      const found = await this.transport.reconcile(job);
      const prepared = prepareSignedAnchor(JSON.parse(job.authorization), this.policy);
      if (intentHash({ worker: found.workerAccount, args: found.args }, this.policy) !== job.intent
        || found.txHash !== job.tx_hash || found.protocol !== 2 || found.finality !== 'FINAL'
        || found.workerAuthorization !== 'nep366' || !found.receiptId
        || found.signer !== this.policy.relayer || found.receiver !== this.policy.contract) throw new Error('Result mismatch');
      if (prepared.worker !== found.workerAccount) throw new Error('Worker mismatch');
      this.change(job, 'confirmed', null, { reference: JSON.stringify({ network: this.policy.network,
        txHash: job.tx_hash, sender: this.policy.relayer, contract: this.policy.contract,
        receiptId: found.receiptId, timestamp: found.timestamp }) });
    } catch (error) {
      if (error.code === 'FINAL_EXECUTION_FAILED') {
        this.change(job, 'failed', 'FINAL_EXECUTION_FAILED');
        return;
      }
      this.change(job, 'unknown', 'RECONCILIATION_PENDING');
      // Retransmission cannot change transaction identity, nonce or fee count.
      // Keep revoked workers on reconciliation-only, without retransmission.
      // Bound retries; after that, retain UNKNOWN and keep polling indefinitely.
      if (retransmit && job.attempts < 3 && this.store.approved(job.worker) && !this.stopped) {
        this.store.assertLease(this.owner);
        this.change(job, 'unknown', 'RECONCILIATION_PENDING', { attempts: job.attempts + 1 });
        try { await this.transport.broadcast(job.signed_bytes); } catch { /* still uncertain */ }
      }
    }
  }
}
