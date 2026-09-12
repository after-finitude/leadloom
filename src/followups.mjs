import { id, hash, stable, parse } from './util.mjs';
import { mayAutomate, mayBook } from './rules.mjs';
import { working, nextWorking } from './time.mjs';

const CLOSED = ['Proposal', 'Won', 'Lost'];

export function beginWait(app, leadId, type) {
  const l = app.lead(leadId);
  if (
    !mayAutomate(l) ||
    !l.email ||
    l.followup_suppressed ||
    l.stage === 'Booked' ||
    (['Nurture', 'Unqualified'].includes(l.category) && l.qualification === 'complete')
  )
    return;
  if (type === 'qualified_not_booked' && !mayBook(l, app.settings())) return;
  const counts = app.s
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
  app.s.run(
    "UPDATE actions SET state='cancelled',error_code='new_wait',updated_at=? WHERE lead_id=? AND kind='followup' AND state='pending'",
    app.clock(),
    leadId
  );
  const now = app.clock(),
    run = id(),
    followup = app.settings().followup;
  app.save(leadId, { waiting_at: now, followup_run: run, followup_type: type });
  for (let step = counts; step < 3; step++)
    app.enqueue(
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

export async function followup(app, action) {
  const d = parse(action.data),
    l = app.lead(action.lead_id),
    s = app.settings(),
    now = app.clock();
  const invalid =
    !mayAutomate(l) ||
    !l.email ||
    l.followup_suppressed ||
    l.followup_run !== d.run ||
    l.waiting_at !== d.waitingAt ||
    l.last_lead_at !== d.lastLeadAt ||
    l.stage === 'Booked' ||
    CLOSED.includes(l.stage) ||
    !!app.s.get(
      "SELECT id FROM appointments WHERE lead_id=? AND status IN ('pending','confirmed','unknown')",
      l.id
    ) ||
    (d.sequence === 'qualification_abandoned' && l.qualification === 'complete') ||
    (d.sequence === 'qualified_not_booked' && !mayBook(l, s));
  if (invalid) {
    app.s.run(
      "UPDATE actions SET state='cancelled',error_code='conditions_changed',updated_at=? WHERE id=?",
      now,
      action.id
    );
    return;
  }
  if (!working(now, s)) {
    app.s.run(
      "UPDATE actions SET state='pending',due_at=?,lease_until=NULL,updated_at=? WHERE id=?",
      nextWorking(now, s),
      now,
      action.id
    );
    return;
  }
  const newer = app.s
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
    app.s.run(
      "UPDATE actions SET state='skipped',error_code='outdated_touch',updated_at=? WHERE id=?",
      now,
      action.id
    );
    return;
  }
  const count = app.s
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
    app.s.run(
      "UPDATE actions SET state='cancelled',error_code='touch_limit',updated_at=? WHERE id=?",
      now,
      action.id
    );
    return;
  }
  let op;
  app.s.tx(() => {
    const key = `followup:${action.id}`;
    op =
      app.s.get('SELECT * FROM operations WHERE op_key=?', key) ||
      app.operation('followup', l.id, key, {
        email: app.emailPayload(l.id, d.subject, d.text),
        sequence: d.sequence
      });
    app.s.run('UPDATE actions SET operation_id=? WHERE id=?', op.id, action.id);
  });
  await app.executeOperation(op.id);
}
