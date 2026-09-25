/** @import { Contact, Lead, LeadFields, LeadList, OutboxMessage, Runs, User } from './types.ts' */
import { id, parse, decrypt, text, ensure, allowKeys } from './util.mjs';
import { FIELDS, normalizeField, validateBudget, mayAutomate } from './rules.mts';
import { STAGES, CLOSED_STAGES, NO_AUTOMATION_STAGES, sqlList } from './domain.mts';
import { LEAD_SELECT, LEAD_FROM, parseLead } from './repos.mjs';
import { score } from './qualification.mjs';
import { cancelPending, remindIfBookable } from './lifecycle.mjs';

/** @returns {LeadList} */
export function list(ctx, options = {}) {
  allowKeys(options, ['q', 'filter', 'page', 'pageSize']);
  const q = options.q ?? '',
    filter = options.filter ?? 'all',
    pageSize = Number(options.pageSize ?? 50),
    requestedPage = Number(options.page ?? 1);
  ensure(
    typeof q === 'string' && q.length <= 200,
    'invalid_search',
    'Search must be at most 200 characters'
  );
  ensure(
    Number.isSafeInteger(requestedPage) &&
      requestedPage >= 1 &&
      Number.isInteger(pageSize) &&
      pageSize >= 1 &&
      pageSize <= 100,
    'invalid_pagination',
    'Use page >= 1 and pageSize between 1 and 100'
  );
  const filters = {
    all: '1',
    attention:
      "((l.review_reason IS NOT NULL AND l.review_reason<>'') OR l.open_question IS NOT NULL) AND c.opt_out=0",
    ai: `l.owner='AI' AND l.paused=0 AND c.opt_out=0 AND (l.review_reason IS NULL OR l.review_reason='') AND l.stage NOT IN (${sqlList(['Booked', ...NO_AUTOMATION_STAGES])})`,
    human: "l.owner='HUMAN'",
    booked: "l.stage='Booked'",
    waiting: 'l.waiting_at IS NOT NULL'
  };
  ensure(
    typeof filter === 'string' && Object.hasOwn(filters, filter),
    'invalid_filter',
    'Unknown lead filter'
  );
  const from = 'FROM leads l JOIN contacts c ON c.id=l.contact_id';
  const where = `WHERE (${filters[filter]}) AND instr(lower(c.name||' '||coalesce(c.email,'')||' '||coalesce(c.phone,'')||' '||coalesce(json_extract(l.fields,'$.service_type'),'')),lower(?))>0`;
  const total = ctx.store.get(`SELECT count(*) AS n ${from} ${where}`, q.trim()).n;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const stats = ctx.store.get(`SELECT count(*) AS total,
      coalesce(sum(l.stage NOT IN (${sqlList(CLOSED_STAGES)})),0) AS open,
      coalesce(sum(${filters.ai}),0) AS ai,
      coalesce(sum(${filters.attention}),0) AS attention,
      coalesce(sum(${filters.booked}),0) AS booked ${from}`);
  const items = ctx.store
    .all(
      `${LEAD_SELECT},m.body AS last_body,m.author AS last_author ${LEAD_FROM} LEFT JOIN messages m ON m.seq=(SELECT max(seq) FROM messages WHERE conversation_id=v.id AND pending=0) ${where} ORDER BY l.updated_at DESC,l.id DESC LIMIT ? OFFSET ?`,
      q.trim(),
      pageSize,
      (page - 1) * pageSize
    )
    .map(({ last_body, last_author, ...row }) => ({
      ...parseLead(row),
      last_message: last_author ? { body: last_body, author: last_author } : null
    }));
  return { items, total, page, pageSize, stats };
}

/** @returns {User[]} */
export function users(ctx) {
  return ctx.store.all('SELECT id,name,email,role FROM users WHERE active=1');
}

/** @returns {Contact[]} */
export function contacts(ctx) {
  return ctx.store.all(
    'SELECT id,name,email,phone FROM contacts ORDER BY created_at DESC LIMIT 300'
  );
}

/** @returns {Lead} */
export function profile(ctx, leadId) {
  const l = ctx.leads.get(leadId),
    rules = ctx.workspace.rules(l.rule_id);
  return {
    ...l,
    currency: rules.data.currency,
    rule_version: rules.version,
    messages: ctx.messages.history(l.conversation_id),
    appointments: ctx.store.all(
      'SELECT * FROM appointments WHERE lead_id=? ORDER BY created_at DESC',
      leadId
    ),
    revisions: ctx.store.all(
      'SELECT * FROM field_revisions WHERE lead_id=? ORDER BY created_at DESC',
      leadId
    ),
    evaluations: ctx.store
      .all(
        'SELECT * FROM score_evaluations WHERE lead_id=? ORDER BY created_at DESC LIMIT 30',
        leadId
      )
      .map((r) => ({ ...r, reasons: parse(r.reasons, []) })),
    timeline: ctx.store
      .all('SELECT * FROM audit_events WHERE lead_id=? ORDER BY seq DESC LIMIT 150', leadId)
      .map((r) => ({ ...r, details: parse(r.details) })),
    notes: ctx.store.all('SELECT * FROM notes WHERE lead_id=? ORDER BY created_at DESC', leadId),
    handoffs: ctx.store.all(
      'SELECT * FROM handoffs WHERE lead_id=? ORDER BY created_at DESC',
      leadId
    ),
    next_action:
      ctx.store.get(
        "SELECT kind,due_at FROM actions WHERE lead_id=? AND state='pending' ORDER BY due_at LIMIT 1",
        leadId
      ) || null
  };
}

// Staff commands. Each except `answered` runs after pending automation for the lead is cancelled.
const commands = {
  takeover(ctx, l, body, actor) {
    ctx.leads.bump(l.id, { owner: 'HUMAN', owner_id: actor.id });
  },
  'return-to-ai'(ctx, l, body) {
    ensure(
      !l.review_reason || (typeof body.reason === 'string' && body.reason.trim().length >= 3),
      'resolution_required',
      'Enter a reason resolving the review'
    );
    ctx.leads.bump(l.id, { owner: 'AI', owner_id: null, review_reason: null });
  },
  pause(ctx, l) {
    ctx.leads.bump(l.id, { paused: 1 });
  },
  resume(ctx, l) {
    ctx.leads.bump(l.id, { paused: 0 });
  },
  // No revision bump: a reply the assistant is preparing stays valid.
  answered(ctx, l) {
    ensure(l.open_question, 'no_open_question', 'No question is waiting for the team', 409);
    ctx.leads.update(l.id, { open_question: null });
  },
  'restore-consent'(ctx, l, body, actor) {
    ensure(actor.role === 'admin', 'forbidden', 'Administrator required', 403);
    text(body.reason, 1000);
    ensure(body.confirmed === true, 'consent_confirmation_required');
    ctx.store.run('UPDATE contacts SET opt_out=0,opt_out_at=NULL WHERE id=?', l.contact_id);
    for (const leadId of ctx.leads.idsForContact(l.contact_id)) ctx.leads.bump(leadId);
  },
  stage(ctx, l, body) {
    ensure(STAGES.includes(body.stage), 'invalid_stage');
    if (body.stage === 'Lost') text(body.reason, 1000);
    if (body.stage === 'Booked')
      ensure(
        ctx.store.get("SELECT id FROM appointments WHERE lead_id=? AND status='confirmed'", l.id),
        'no_confirmed_appointment',
        'Booked requires a confirmed calendar event',
        409
      );
    ctx.leads.bump(l.id, {
      stage: body.stage,
      lost_reason: body.stage === 'Lost' ? body.reason : null
    });
  },
  assign(ctx, l, body) {
    ensure(
      ctx.store.get('SELECT id FROM users WHERE id=? AND active=1', body.userId),
      'user_not_found'
    );
    ctx.leads.bump(l.id, { owner_id: body.userId });
  },
  recalculate(ctx, l, body) {
    ctx.leads.bump(l.id, {
      rule_id: body.ruleId ? ctx.workspace.rules(body.ruleId).id : ctx.workspace.rules().id
    });
    remindIfBookable(ctx, score(ctx, l.id));
  }
};

export function control(ctx, leadId, command, body, actor) {
  ensure(Object.hasOwn(commands, command), 'invalid_command', 'Unknown action', 404);
  return ctx.store.tx(() => {
    const l = ctx.leads.get(leadId);
    // Marking a question answered leaves the conversation to the assistant.
    if (command !== 'answered') cancelPending(ctx, leadId, `staff_${command}`);
    commands[command](ctx, l, body, actor);
    ctx.audit.add(
      leadId,
      `staff_${command}`,
      { reason: body.reason || null, stage: body.stage || null },
      { actor: actor.id }
    );
    // Handing the lead back to automation answers any messages that arrived meanwhile.
    if (['return-to-ai', 'resume'].includes(command)) {
      const updated = ctx.leads.get(leadId);
      if (mayAutomate(updated))
        ctx.actions.enqueue('turn', leadId, `turn:${leadId}:${updated.revision}`, {
          revision: updated.revision
        });
    }
    return profile(ctx, leadId);
  });
}

// Manual values are locked by default, so later AI extractions become proposals.
export function editFields(ctx, leadId, body, actor) {
  allowKeys(body, ['fields', 'locked', 'unlock']);
  ensure(
    body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields),
    'invalid_fields'
  );
  return ctx.store.tx(() => {
    const l = ctx.leads.get(leadId),
      fields = { ...l.fields },
      meta = { ...l.meta };
    for (const [field, value] of Object.entries(body.fields)) {
      const v = normalizeField(/** @type {keyof LeadFields} */ (field), value);
      ensure(
        field !== 'email',
        'contact_change_requires_verification',
        'Contact email cannot be changed through qualification fields'
      );
      fields[field] = v;
      meta[field] = {
        source: 'manager',
        userId: actor.id,
        locked: body.locked !== false,
        at: ctx.clock()
      };
      ctx.store.run(
        'INSERT INTO field_revisions(id,lead_id,field,old_value,new_value,actor,locked,created_at) VALUES(?,?,?,?,?,?,?,?)',
        id(),
        leadId,
        field,
        JSON.stringify(l.fields[field] ?? null),
        JSON.stringify(v),
        actor.id,
        body.locked !== false ? 1 : 0,
        ctx.clock()
      );
    }
    for (const field of body.unlock || []) {
      ensure(FIELDS.includes(field), 'invalid_field');
      meta[field] = { ...meta[field], locked: false };
    }
    validateBudget(fields);
    if (
      fields.service_type &&
      ctx.workspace.settings().deduplication === 'one_active_per_contact_service'
    )
      ensure(
        !ctx.leads.serviceTaken(l.contact_id, fields.service_type, leadId),
        'active_deal_conflict',
        undefined,
        409
      );
    ctx.leads.bump(leadId, { fields, meta, service_key: fields.service_type || l.service_key });
    cancelPending(ctx, leadId, 'manual_data_change');
    remindIfBookable(ctx, score(ctx, leadId));
    ctx.audit.add(
      leadId,
      'manual_fields',
      { fields: Object.keys(body.fields), unlocked: body.unlock || [] },
      { actor: actor.id }
    );
    return profile(ctx, leadId);
  });
}

export function addNote(ctx, leadId, body, actor) {
  ctx.leads.get(leadId);
  text(body, 4000);
  const nid = id();
  ctx.store.run(
    'INSERT INTO notes(id,lead_id,user_id,body,created_at) VALUES(?,?,?,?,?)',
    nid,
    leadId,
    actor.id,
    body,
    ctx.clock()
  );
  ctx.audit.add(leadId, 'note_added', { noteId: nid }, { actor: actor.id });
  return { id: nid };
}

/** @returns {Runs} */
export function runs(ctx) {
  return {
    actions: ctx.store.all(
      'SELECT a.id,a.kind,a.lead_id,a.operation_id,a.state,a.attempts,a.due_at,a.created_at,a.updated_at,a.error_code,o.external_id,o.state AS operation_state FROM actions a LEFT JOIN operations o ON o.id=a.operation_id ORDER BY a.created_at DESC LIMIT 250'
    ),
    intake: ctx.store.all(
      'SELECT id,source,status,reason,lead_id,correlation_id,created_at FROM intake_events ORDER BY created_at DESC LIMIT 100'
    ),
    audit: ctx.store
      .all('SELECT * FROM audit_events ORDER BY seq DESC LIMIT 100')
      .map((r) => ({ ...r, details: parse(r.details) }))
  };
}

/** @returns {OutboxMessage[]} */
export function demoOutbox(ctx) {
  ensure(
    ctx.config.mode === 'demo',
    'not_available',
    'Mock outbox is available only in demo mode',
    403
  );
  return ctx.store
    .all('SELECT * FROM outbox ORDER BY created_at DESC LIMIT 100')
    .map((r) => ({ ...r, payload: decrypt(r.payload, ctx.config.key) }));
}
