import { parse } from './util.mjs';
import { mayAutomate, mayBook } from './rules.mts';
import { working, nextWorking } from './time.mts';
import { NO_AUTOMATION_STAGES } from './domain.mts';
import { emailPayload } from './lifecycle.mjs';
import { executeOperation } from './operations.mjs';

export async function followup(ctx, action) {
  const d = parse(action.data),
    l = ctx.leads.get(action.lead_id),
    s = ctx.workspace.settings(),
    now = ctx.clock();
  const invalid =
    !mayAutomate(l) ||
    !l.email ||
    l.followup_suppressed ||
    l.followup_run !== d.run ||
    l.waiting_at !== d.waitingAt ||
    l.last_lead_at !== d.lastLeadAt ||
    l.stage === 'Booked' ||
    NO_AUTOMATION_STAGES.includes(l.stage) ||
    !!ctx.store.get(
      "SELECT id FROM appointments WHERE lead_id=? AND status IN ('pending','confirmed','unknown')",
      l.id
    ) ||
    (d.sequence === 'qualification_abandoned' && l.qualification === 'complete') ||
    (d.sequence === 'qualified_not_booked' && !mayBook(l, s));
  if (invalid) {
    ctx.store.run(
      "UPDATE actions SET state='cancelled',error_code='conditions_changed',updated_at=? WHERE id=?",
      now,
      action.id
    );
    return;
  }
  if (!working(now, s)) {
    ctx.store.run(
      "UPDATE actions SET state='pending',due_at=?,lease_until=NULL,updated_at=? WHERE id=?",
      nextWorking(now, s),
      now,
      action.id
    );
    return;
  }
  const newer = ctx.store
    .all(
      "SELECT id,data FROM actions WHERE lead_id=? AND kind='followup' AND state='pending' AND due_at<=?",
      l.id,
      now
    )
    .some((a) => {
      const x = parse(a.data);
      return x.run === d.run && x.step > d.step;
    });
  if (newer) {
    ctx.store.run(
      "UPDATE actions SET state='skipped',error_code='outdated_touch',updated_at=? WHERE id=?",
      now,
      action.id
    );
    return;
  }
  const count = ctx.store
    .all(
      "SELECT a.data,o.state FROM actions a JOIN operations o ON o.id=a.operation_id WHERE a.lead_id=? AND a.kind='followup'",
      l.id
    )
    .filter(
      (a) =>
        parse(a.data).sequence === d.sequence &&
        ['confirmed', 'running', 'unknown'].includes(a.state)
    ).length;
  if (count >= 3) {
    ctx.store.run(
      "UPDATE actions SET state='cancelled',error_code='touch_limit',updated_at=? WHERE id=?",
      now,
      action.id
    );
    return;
  }
  const op = ctx.store.tx(() => {
    const key = `followup:${action.id}`;
    const op =
      ctx.operations.byKey(key) ||
      ctx.operations.create('followup', l.id, key, {
        email: emailPayload(ctx, l.id, d.subject, d.text),
        sequence: d.sequence
      });
    ctx.store.run('UPDATE actions SET operation_id=? WHERE id=?', op.id, action.id);
    return op;
  });
  await executeOperation(ctx, op.id);
}
