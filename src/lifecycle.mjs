// Lead lifecycle steps shared by the conversation, intake, CRM, booking and follow-up modules.
// It imports no module with domain logic, so all of them can depend on it without import cycles.
import { id, hash, stable, parse, ensure, escapeHtml } from './util.mjs';
import { mayAutomate, mayBook } from './rules.mts';
import { summary } from './qualification.mjs';

// A configured chat message with its {placeholders} filled in.
export function reply(ctx, key, values = {}) {
  return ctx.workspace
    .settings()
    .replies[key].replace(/\{(\w+)\}/g, (token, name) => values[name] ?? token);
}

// Stops queued work for a lead. Access links survive everything except an opt-out.
export function cancelPending(ctx, leadId, reason) {
  const queued = ctx.store.all("SELECT * FROM actions WHERE lead_id=? AND state='pending'", leadId);
  for (const a of queued) {
    const op = a.operation_id ? ctx.operations.get(a.operation_id) : null;
    if (op?.kind === 'access' && reason !== 'opt_out') continue;
    ctx.store.run(
      "UPDATE actions SET state='cancelled',error_code=?,updated_at=? WHERE id=?",
      reason,
      ctx.clock(),
      a.id
    );
    if (op?.state === 'pending') {
      ctx.store.run(
        "UPDATE operations SET state='cancelled',error_code=?,updated_at=? WHERE id=?",
        reason,
        ctx.clock(),
        op.id
      );
      if (op.kind === 'booking')
        ctx.store.run(
          "UPDATE appointments SET status='cancelled',updated_at=? WHERE operation_key=?",
          ctx.clock(),
          op.op_key
        );
      if (['booking', 'reschedule'].includes(op.kind))
        ctx.store.run("UPDATE reservations SET state='released' WHERE operation_key=?", op.op_key);
    }
  }
  ctx.leads.update(leadId, { waiting_at: null, followup_run: null, followup_type: null });
}

export function handoff(ctx, leadId, reason) {
  ctx.leads.bump(leadId, { owner: 'HUMAN', review_reason: reason, current_field: null });
  cancelPending(ctx, leadId, reason);
  const note = summary(ctx, leadId);
  ctx.store.run(
    'INSERT INTO handoffs(id,lead_id,reason,summary,created_at) VALUES(?,?,?,?,?)',
    id(),
    leadId,
    reason,
    note,
    ctx.clock()
  );
  ctx.messages.add(leadId, 'system', reply(ctx, 'handoff'));
  ctx.audit.add(leadId, 'handoff', { reason });
}

export function firstContact(ctx, leadId, channel) {
  const l = ctx.leads.get(leadId);
  if (l.first_contact_at) return;
  ctx.leads.update(leadId, {
    first_contact_at: ctx.clock(),
    first_contact_channel: channel,
    first_contact_ms: ctx.clock() - l.created_at,
    first_contact_status: 'accepted',
    stage: l.stage === 'New' ? 'Contacted' : l.stage
  });
}

export function emailPayload(ctx, leadId, subject, body) {
  const l = ctx.leads.get(leadId);
  ensure(l.email, 'no_email');
  const access = ctx.auth.issue('chat', leadId, l.contact_id),
    unsubscribe = ctx.auth.issue('unsubscribe', leadId, l.contact_id);
  const link = `${ctx.config.origin}/chat#token=${access}`,
    optout = `${ctx.config.origin}/unsubscribe#token=${unsubscribe}`;
  return {
    from: ctx.config.emailFrom,
    to: l.email,
    reply_to: ctx.config.emailReplyTo,
    subject,
    text: `${body}\n\nContinue your conversation: ${link}\n\nUnsubscribe: ${optout}`,
    html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(
      link
    )}">Continue your conversation</a></p><p><a href="${escapeHtml(optout)}">Unsubscribe</a></p>`
  };
}

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
