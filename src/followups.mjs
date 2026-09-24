import { id, hash, stable, parse } from './util.mjs';
import { mayAutomate, mayBook } from './rules.mts';
import { working, nextWorking } from './time.mts';
import { NO_AUTOMATION_STAGES } from './domain.mts';
import { emailPayload } from './conversation.mjs';
import { executeOperation } from './operations.mjs';

export function beginWait(ctx, leadId, type) {
  const l = ctx.leads.get(leadId);
  if (
    !mayAutomate(l) ||
    !l.email ||
    l.followup_suppressed ||
    l.stage === 'Booked' ||
    (['Nurture', 'Unqualified'].includes(l.category) && l.qualification === 'complete')
  )
    return;
  if (type === 'qualified_not_booked' && !mayBook(l, ctx.workspace.settings())) return;
  const counts = ctx.store
    .all(
      "SELECT a.data,o.state AS operation_state FROM actions a LEFT JOIN operations o ON a.operation_id=o.id WHERE a.lead_id=? AND a.kind='followup'",
      leadId
    )
    .filter(
      (a) =>
        parse(a.data).sequence === type &&
        ['confirmed', 'unknown', 'running'].includes(a.operation_state)
    ).length;
  if (counts >= 3) return;
  ctx.store.run(
    "UPDATE actions SET state='cancelled',error_code='new_wait',updated_at=? WHERE lead_id=? AND kind='followup' AND state='pending'",
    ctx.clock(),
    leadId
  );
  const now = ctx.clock(),
    run = id(),
    followup = ctx.workspace.settings().followup;
  ctx.leads.update(leadId, { waiting_at: now, followup_run: run, followup_type: type });
  for (let step = counts; step < 3; step++)
    ctx.actions.enqueue(
      'followup',
      leadId,
      `fu:${leadId}:${run}:${step}`,
      {
        sequence: type,
        run,
        step,
        waitingAt: now,
        lastLeadAt: l.last_lead_at,
        subject: followup.subject,
        text: followup.text,
        templateVersion: hash(stable(followup))
      },
      now + followup[type][step] * 60000
    );
}

// Starts booking reminders once a lead becomes bookable, unless that sequence already runs.
export function remindIfBookable(ctx, lead) {
  if (mayBook(lead, ctx.workspace.settings()) && lead.followup_type !== 'qualified_not_booked')
    beginWait(ctx, lead.id, 'qualified_not_booked');
}

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
  let op;
  ctx.store.tx(() => {
    const key = `followup:${action.id}`;
    op =
      ctx.operations.byKey(key) ||
      ctx.operations.create('followup', l.id, key, {
        email: emailPayload(ctx, l.id, d.subject, d.text),
        sequence: d.sequence
      });
    ctx.store.run('UPDATE actions SET operation_id=? WHERE id=?', op.id, action.id);
  });
  await executeOperation(ctx, op.id);
}
