import { id, AppError } from './util.mjs';
import { failOperation } from './operations.mjs';

// Runs due actions from the durable queue. Each action is claimed with a lease; an expired
// lease after an external call becomes `unknown` rather than being sent again.
export class Worker {
  // handlers: { turn(leadId), followup(action), operation(operationId) }
  constructor(ctx, handlers) {
    this.ctx = ctx;
    this.handlers = handlers;
    this.ticking = false;
    this.cleanedAt = -Infinity;
  }
  async tick(max = 25) {
    if (this.ticking) return 0;
    this.ticking = true;
    const workerId = id();
    let processed = 0;
    try {
      this.cleanup();
      this.recoverLeases();
      this.ctx.messages.publishStale(this.ctx.clock() - 120000);
      while (processed < max) {
        const action = this.claim(workerId);
        if (!action) break;
        processed++;
        await this.run(action);
      }
    } finally {
      this.ticking = false;
    }
    return processed;
  }
  // Expired rows are already ignored by their readers; this only keeps the tables small.
  cleanup() {
    const { store, clock } = this.ctx,
      now = clock();
    if (now - this.cleanedAt < 10 * 60000) return;
    this.cleanedAt = now;
    store.tx(() => {
      store.run('DELETE FROM sessions WHERE expires_at<=?', now);
      store.run('DELETE FROM access_tokens WHERE expires_at<=?', now);
      store.run('DELETE FROM slot_offers WHERE expires_at<=?', now);
    });
  }
  recoverLeases() {
    const ctx = this.ctx,
      { store, clock } = ctx;
    const expired = store.all(
      "SELECT * FROM actions WHERE state='running' AND lease_until<?",
      clock()
    );
    for (const a of expired)
      store.tx(() => {
        const op = a.operation_id ? ctx.operations.get(a.operation_id) : null;
        if (op && op.state === 'running') {
          failOperation(
            ctx,
            op,
            new AppError('worker_interrupted', 'Worker stopped after dispatch'),
            true
          );
          store.run(
            "UPDATE actions SET state='unknown',error_code='worker_interrupted',updated_at=? WHERE id=?",
            clock(),
            a.id
          );
        } else if (op && op.state === 'confirmed')
          store.run("UPDATE actions SET state='done',updated_at=? WHERE id=?", clock(), a.id);
        else
          store.run(
            "UPDATE actions SET state='pending',lease_until=NULL,updated_at=? WHERE id=?",
            clock(),
            a.id
          );
      });
  }
  claim(workerId) {
    const { store, clock } = this.ctx;
    return store.tx(() => {
      const row = store.get(
        "SELECT * FROM actions WHERE state='pending' AND due_at<=? ORDER BY due_at,created_at LIMIT 1",
        clock()
      );
      if (!row) return null;
      store.run(
        "UPDATE actions SET state='running',attempts=attempts+1,lease_until=?,lease_owner=?,updated_at=? WHERE id=?",
        clock() + 90000,
        workerId,
        clock(),
        row.id
      );
      return row;
    });
  }
  async run(action) {
    const ctx = this.ctx,
      { store, clock } = ctx;
    try {
      if (action.kind === 'turn') await this.handlers.turn(action.lead_id);
      else if (action.kind === 'followup') await this.handlers.followup(action);
      else await this.handlers.operation(action.operation_id);
      // A handler may already have settled the action; otherwise it mirrors its operation.
      store.tx(() => {
        const current = ctx.actions.get(action.id);
        if (current.state === 'running') {
          const op = current.operation_id
            ? store.get('SELECT state,error_code FROM operations WHERE id=?', current.operation_id)
            : null;
          store.run(
            'UPDATE actions SET state=?,error_code=?,lease_until=NULL,updated_at=? WHERE id=?',
            op && ['unknown', 'failed', 'cancelled'].includes(op.state) ? op.state : 'done',
            op?.error_code || null,
            clock(),
            action.id
          );
        }
      });
    } catch (error) {
      store.run(
        "UPDATE actions SET state='failed',error_code=?,lease_until=NULL,updated_at=? WHERE id=?",
        error.code || 'action_failed',
        clock(),
        action.id
      );
      ctx.audit.add(action.lead_id, 'action_failed', {
        actionId: action.id,
        code: error.code || 'action_failed'
      });
    }
  }
}
