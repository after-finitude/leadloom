import { id } from './util.mjs';
import { scoreLead, known } from './rules.mts';

// Scores the lead with its own rules version and moves it between Contacted and Qualified.
// Callers decide whether a newly bookable lead starts follow-ups (see followups.remindIfBookable).
export function score(ctx, leadId) {
  const l = ctx.leads.get(leadId),
    rules = ctx.workspace.rules(l.rule_id).data,
    result = scoreLead(l.fields, rules),
    s = ctx.workspace.settings();
  const complete =
    result.category === 'Unqualified' ||
    s.questions.every(
      (q) => known(l.fields, q.field) || (!q.required && l.skipped.includes(q.field))
    );
  const stage =
    complete &&
    result.score >= rules.warm &&
    result.serviceFit &&
    result.locationFit &&
    !l.review_reason &&
    ['New', 'Contacted', 'Qualified'].includes(l.stage)
      ? 'Qualified'
      : l.stage === 'Qualified' &&
          (!complete || !result.serviceFit || !result.locationFit || result.category === 'Nurture')
        ? 'Contacted'
        : l.stage;
  ctx.leads.update(leadId, {
    score: result.score,
    category: result.category,
    reasons: result.reasons,
    qualification: complete ? 'complete' : 'collecting',
    stage
  });
  ctx.store.run(
    'INSERT INTO score_evaluations(id,lead_id,rule_id,inputs,score,category,reasons,created_at) VALUES(?,?,?,?,?,?,?,?)',
    id(),
    leadId,
    l.rule_id,
    JSON.stringify(l.fields),
    result.score,
    result.category,
    JSON.stringify(result.reasons),
    ctx.clock()
  );
  return ctx.leads.get(leadId);
}

export function summary(ctx, leadId) {
  const l = ctx.leads.get(leadId),
    rules = ctx.workspace.rules(l.rule_id);
  return `${l.name} · ${l.fields.service_type ?? 'service unknown'} · ${
    l.fields.location ?? 'location unknown'
  }\nBudget: ${l.fields.budget_min ?? '?'}–${l.fields.budget_max ?? '?'} ${
    rules.data.currency
  }\nTimeline: ${l.fields.timeline ?? '?'} months; authority: ${
    l.fields.decision_maker ?? 'unknown'
  }\n${l.category} (${l.score}/100), rules v${rules.version}\nReview: ${l.review_reason || 'none'}`;
}
