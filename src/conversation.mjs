import { id, stable, text, ensure, isStop } from './util.mjs';
import {
  normalizeField,
  validateBudget,
  known,
  mayAutomate,
  mayBook,
  maySendAccess,
  scoreLead
} from './rules.mts';
import { validateExtraction, validateReply } from './providers/llm.mjs';
import { BOOKABLE_CATEGORIES } from './domain.mts';
import { score } from './qualification.mjs';
import {
  cancelPending,
  handoff,
  firstContact,
  emailPayload,
  reply,
  beginWait,
  remindIfBookable
} from './lifecycle.mjs';

// Opt-out covers every enquiry of the contact.
export function stop(ctx, contactId, source = 'chat') {
  return ctx.store.tx(() => {
    ctx.store.run('UPDATE contacts SET opt_out=1,opt_out_at=? WHERE id=?', ctx.clock(), contactId);
    for (const leadId of ctx.leads.idsForContact(contactId)) {
      ctx.leads.bump(leadId);
      cancelPending(ctx, leadId, 'opt_out');
      ctx.audit.add(leadId, 'opt_out', { source }, { actor: 'visitor' });
    }
    return { unsubscribed: true };
  });
}

// Rescores, then asks the next open question or explains the next step.
export function askNext(ctx, leadId, markFirst = false, prefix = '') {
  let l = ctx.leads.get(leadId);
  if (!mayAutomate(l)) return;
  const s = ctx.workspace.settings();
  l = score(ctx, leadId);
  remindIfBookable(ctx, l);
  let question = null;
  if (l.category === 'Unqualified') {
    // Name what we do cover and keep listening, so a corrected answer requalifies the lead.
    const { serviceFit } = scoreLead(l.fields, ctx.workspace.rules(l.rule_id).data),
      field = serviceFit === false ? 'service_type' : 'location';
    ctx.messages.add(
      leadId,
      'AI',
      `${prefix}${reply(ctx, field === 'service_type' ? 'service_unsupported' : 'area_unsupported')} ${coverage(ctx, l, field)} ${reply(ctx, 'out_of_scope')}`
    );
    ctx.leads.update(leadId, { current_field: field });
  } else if (l.qualification === 'complete') {
    if (BOOKABLE_CATEGORIES.includes(l.category) && !l.email) {
      question = {
        field: 'email',
        text: reply(ctx, 'email_question')
      };
    } else {
      ctx.messages.add(
        leadId,
        'AI',
        `${prefix}${reply(
          ctx,
          BOOKABLE_CATEGORIES.includes(l.category) ? 'ready_to_book' : 'details_saved'
        )}`
      );
      ctx.leads.update(leadId, { current_field: null });
    }
  } else
    question = s.questions.find((q) => !known(l.fields, q.field) && !l.skipped.includes(q.field));
  if (question) {
    const asked = { ...l.asked, [question.field]: (l.asked[question.field] || 0) + 1 };
    // A repeated question admits the miss; service and city questions name the options.
    const parts = [
      l.current_field === question.field ? reply(ctx, 'not_understood') : '',
      question.text,
      coverage(ctx, l, question.field)
    ].filter(Boolean);
    ctx.messages.add(leadId, 'AI', `${prefix}${parts.join(' ')}`);
    ctx.leads.update(leadId, { current_field: question.field, asked });
  }
  if (markFirst) firstContact(ctx, leadId, 'chat');
  if (question) beginWait(ctx, leadId, 'qualification_abandoned');
}

// What the company covers for a field, from the lead's own rules version.
function coverage(ctx, lead, field) {
  const rules = ctx.workspace.rules(lead.rule_id).data,
    list = (items) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items);
  if (field === 'service_type')
    return reply(ctx, 'service_options', { services: list(rules.services) });
  if (field === 'location') return reply(ctx, 'area_options', { areas: list(rules.areas) });
  return '';
}

// The first invitation starts outreach; later ones only restore access to the chat.
export function invite(ctx, leadId, key = `invite:${leadId}`, first = true) {
  const l = ctx.leads.get(leadId);
  if (!l.email || !(first ? mayAutomate(l) : maySendAccess(l))) return;
  if (ctx.operations.byKey(key)) return;
  const payload = {
    email: emailPayload(
      ctx,
      leadId,
      `Your enquiry with ${ctx.workspace.settings().company}`,
      first
        ? 'Thanks for your enquiry. Tell us a little about your project in your secure chat.'
        : 'Use the secure link below to return to your conversation.'
    ),
    first
  };
  const op = ctx.operations.create(first ? 'invitation' : 'access', leadId, key, payload);
  ctx.actions.enqueue('email', leadId, `send:${key}`, {}, ctx.clock(), op.id);
}

export function postMessage(ctx, leadId, body, key) {
  text(body, 4000);
  text(key, 128);
  return ctx.store.tx(() => {
    const l = ctx.leads.get(leadId),
      old = ctx.messages.byClientKey(l.conversation_id, key);
    if (old) {
      ensure(
        old.body === body && old.author === 'lead',
        'idempotency_conflict',
        'Message key reused with different content',
        409
      );
      return { id: old.id, repeated: true };
    }
    const mid = ctx.messages.add(leadId, 'lead', body, key);
    cancelPending(ctx, leadId, 'lead_replied');
    const current = ctx.leads.bump(leadId, { last_lead_at: ctx.clock() });
    if (isStop(body)) {
      stop(ctx, l.contact_id);
      return { id: mid, stopped: true };
    }
    if (mayAutomate(current))
      ctx.actions.enqueue('turn', leadId, `turn:${leadId}:${current.revision}`, {
        revision: current.revision
      });
    return { id: mid };
  });
}

export function manualMessage(ctx, leadId, body, key, actor) {
  text(body, 4000);
  text(key, 128);
  return ctx.store.tx(() => {
    const l = ctx.leads.get(leadId);
    ensure(!l.opt_out, 'opt_out', 'Contact has opted out. Do not bypass the refusal.', 409);
    const previous = ctx.messages.byClientKey(l.conversation_id, key);
    if (previous) {
      ensure(
        previous.body === body && previous.author === 'manager',
        'idempotency_conflict',
        undefined,
        409
      );
      return { id: previous.id };
    }
    ctx.leads.bump(leadId, { owner: 'HUMAN', owner_id: actor.id, open_question: null });
    cancelPending(ctx, leadId, 'manual_reply');
    const mid = ctx.messages.add(leadId, 'manager', body, key);
    ctx.audit.add(leadId, 'manual_reply', { messageId: mid }, { actor: actor.id });
    return { id: mid };
  });
}

// One AI turn: extract fields from unprocessed lead messages outside any transaction,
// then apply them only if nothing changed the lead in the meantime.
export async function turn(ctx, leadId) {
  const l = ctx.leads.get(leadId);
  if (!mayAutomate(l)) return { cancelled: true };
  const messages = ctx.store.all(
    "SELECT * FROM messages WHERE conversation_id=? AND author='lead' AND seq>? ORDER BY seq",
    l.conversation_id,
    l.processed_seq
  );
  if (!messages.length) return { empty: true };
  const body = messages.map((m) => m.body).join('\n'),
    input = {
      body,
      settings: ctx.workspace.settings(),
      fields: l.fields,
      currentField: l.current_field
    };
  let result;
  try {
    result = validateExtraction(await ctx.llm.extract(input), input);
  } catch (error) {
    return ctx.store.tx(() => {
      const latest = ctx.leads.get(leadId);
      if (latest.revision === l.revision && mayAutomate(latest))
        handoff(ctx, leadId, error.code || 'llm_failure');
      return { handoff: true };
    });
  }
  // Replies from this turn stay hidden until composeReplies has phrased and published them.
  const drafting = { ...ctx, messages: ctx.messages.drafts() };
  const applied = ctx.store.tx(() =>
    applyExtraction(drafting, leadId, l.revision, messages, result)
  );
  await composeReplies(ctx, leadId);
  return applied;
}

// Lets the model phrase this turn's replies in the customer's language and the brand voice.
// After two failed or invalid attempts the planned text is published instead.
async function composeReplies(ctx, leadId) {
  const l = ctx.leads.get(leadId),
    { services, areas } = ctx.workspace.rules(l.rule_id).data;
  for (const draft of ctx.messages.pending(l.conversation_id)) {
    let body = draft.body;
    if (ctx.llm.compose) {
      const input = {
        planned: draft.body,
        keep: areas.filter((a) => draft.body.includes(a)),
        facts: { services, areas },
        history: ctx.messages
          .history(l.conversation_id)
          .slice(-12)
          .map(({ author, body }) => ({ author, body })),
        settings: ctx.workspace.settings()
      };
      for (let attempt = 0; attempt < 2; attempt++)
        try {
          body = validateReply(await ctx.llm.compose(input), input);
          break;
        } catch (error) {
          if (attempt)
            ctx.audit.add(leadId, 'reply_template_used', { code: error.code || 'compose_failed' });
        }
    }
    ctx.messages.publish(draft.id, body);
  }
}

function applyExtraction(ctx, leadId, snapshot, messages, result) {
  const latest = ctx.leads.get(leadId);
  if (latest.revision !== snapshot || !mayAutomate(latest)) {
    ctx.audit.add(leadId, 'stale_ai_discarded', {});
    return { stale: true };
  }
  const processed = { processed_seq: messages.at(-1).seq };
  if (result.handoff && result.handoff !== 'outside_faq') {
    ctx.leads.update(leadId, processed);
    handoff(ctx, leadId, result.handoff);
    return { handoff: true };
  }
  let merged;
  try {
    merged = mergeUpdates(ctx, latest, messages, result.updates);
  } catch (error) {
    ctx.leads.update(leadId, processed);
    handoff(ctx, leadId, error.code || 'invalid_extraction');
    return { handoff: true };
  }
  const { fields, meta, skipped } = merged;
  let conflict = merged.conflict;
  for (const unknown of result.unknown) {
    const q = ctx.workspace.settings().questions.find((q) => q.field === unknown.field);
    if (q && !q.required && !known(fields, q.field)) {
      skipped.add(q.field);
      clearField(fields, q.field);
    }
  }
  // Changing an active service cannot silently collide with another active deal.
  if (
    fields.service_type &&
    ctx.workspace.settings().deduplication === 'one_active_per_contact_service' &&
    ctx.leads.serviceTaken(latest.contact_id, fields.service_type, leadId)
  )
    conflict = true;
  // A question the FAQ cannot answer waits for staff while qualification continues.
  const question = result.handoff === 'outside_faq';
  ctx.leads.update(leadId, {
    fields,
    meta,
    skipped: [...skipped],
    ...processed,
    service_key: fields.service_type || latest.service_key,
    ...(question && {
      open_question: [latest.open_question, ...messages.map((m) => m.body)]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000)
    })
  });
  if (question) ctx.audit.add(leadId, 'question_for_team', {}, { actor: 'AI' });
  if (conflict) {
    remindIfBookable(ctx, score(ctx, leadId));
    handoff(ctx, leadId, 'locked_field_conflict');
    return { handoff: true };
  }
  return continueQualification(ctx, latest, fields, skipped, result);
}

// Applies extracted values with their evidence. Locked fields become proposals for staff;
// a different or already used email is a conflict. Throws on invalid values.
function mergeUpdates(ctx, latest, messages, updates) {
  const leadId = latest.id,
    fields = { ...latest.fields },
    meta = { ...latest.meta },
    skipped = new Set(latest.skipped);
  let conflict = false;
  for (const update of updates) {
    const value = normalizeField(update.field, update.value),
      message = messages.find((m) => m.body.toLowerCase().includes(update.evidence.toLowerCase()));
    ensure(message, 'llm_evidence');
    if (update.field === 'email') {
      if (latest.email && latest.email !== value) {
        conflict = true;
        continue;
      }
      if (value && !latest.email) {
        const other = ctx.store.get(
          'SELECT id FROM contacts WHERE email=? AND id<>?',
          value,
          latest.contact_id
        );
        if (other) {
          conflict = true;
          continue;
        }
        ctx.store.run(
          'UPDATE contacts SET email=?,verified_email=0 WHERE id=?',
          value,
          latest.contact_id
        );
      }
      continue;
    }
    if (stable(fields[update.field] ?? null) === stable(value)) continue;
    const locked = !!meta[update.field]?.locked;
    ctx.store.run(
      'INSERT INTO field_revisions(id,lead_id,field,old_value,new_value,actor,message_id,locked,proposed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id(),
      leadId,
      update.field,
      JSON.stringify(fields[update.field] ?? null),
      JSON.stringify(value),
      'AI',
      message.id,
      locked ? 1 : 0,
      locked ? 1 : 0,
      ctx.clock()
    );
    if (locked) {
      conflict = true;
      continue;
    }
    fields[update.field] = value;
    meta[update.field] = { source: 'lead', messageId: message.id, at: ctx.clock(), locked: false };
    skipped.delete(update.field.startsWith('budget') ? 'budget' : update.field);
  }
  validateBudget(fields);
  return { fields, meta, skipped, conflict };
}

// After three unanswered attempts a required question goes to staff; an optional one is skipped.
function continueQualification(ctx, latest, fields, skipped, result) {
  const leadId = latest.id;
  const q =
    latest.current_field === 'email'
      ? { field: 'email', required: true }
      : ctx.workspace.settings().questions.find((q) => q.field === latest.current_field);
  const answered =
    q &&
    (q.field === 'email'
      ? !!ctx.leads.get(leadId).email
      : known(fields, q.field) || skipped.has(q.field));
  const faq = result.faq_id
      ? ctx.workspace.settings().faq.find((f) => f.id === result.faq_id)
      : null,
    answer = faq
      ? faq.answer
      : result.handoff === 'outside_faq'
        ? reply(ctx, 'question_for_team')
        : null;
  if (q && !answered && !answer && (latest.asked[q.field] || 0) >= 3) {
    if (q.required) {
      remindIfBookable(ctx, score(ctx, leadId));
      handoff(ctx, leadId, `required_${q.field}_unknown`);
      return { handoff: true };
    }
    skipped.add(q.field);
    clearField(fields, q.field);
    ctx.leads.update(leadId, { fields, skipped: [...skipped] });
  }
  ctx.leads.bump(leadId);
  remindIfBookable(ctx, score(ctx, leadId));
  // FAQ answers and questions for the team do not spend a clarification attempt or re-ask the current question.
  if (answer && q && !answered) {
    ctx.messages.add(leadId, 'AI', answer);
    beginWait(ctx, leadId, 'qualification_abandoned');
  } else askNext(ctx, leadId, false, answer ? `${answer} ` : '');
  ctx.audit.add(
    leadId,
    'qualification_updated',
    { fields: result.updates.map((x) => x.field) },
    { actor: 'AI' }
  );
  return { updated: true };
}

function clearField(fields, field) {
  if (field === 'budget') {
    fields.budget_min = null;
    fields.budget_max = null;
  } else fields[field] = null;
}

/** @returns {Omit<import('./types.ts').PublicChat, 'csrf'>} */
export function publicState(ctx, leadId) {
  const l = ctx.leads.get(leadId),
    s = ctx.workspace.settings(),
    appointment = ctx.store.get(
      "SELECT start_at,end_at,timezone,status FROM appointments WHERE lead_id=? AND status IN ('pending','unknown','confirmed') ORDER BY created_at DESC LIMIT 1",
      leadId
    ),
    booking = ctx.store.get(
      "SELECT id,state,error_code FROM operations WHERE lead_id=? AND kind='booking' ORDER BY created_at DESC,rowid DESC LIMIT 1",
      leadId
    ),
    messages = ctx.messages.history(l.conversation_id);
  return {
    company: s.company,
    name: l.name,
    timezone: s.timezone,
    owner: l.owner,
    paused: !!l.paused,
    stopped: !!l.opt_out,
    can_book: mayBook(l, s) && !appointment,
    appointment: appointment || null,
    booking_issue:
      !appointment && booking?.state === 'failed'
        ? {
            id: booking.id,
            message:
              booking.error_code === 'slot_taken'
                ? 'Sorry, that time was taken before we could confirm your booking. No appointment was created.'
                : ['stale_booking', 'outside_hours'].includes(booking.error_code)
                  ? 'That time is no longer available for this enquiry. No appointment was created.'
                  : 'We could not confirm your booking. No appointment was created.'
          }
        : null,
    messages,
    typing: mayAutomate(l) && messages.at(-1)?.author === 'lead',
    question_pending: !!l.open_question,
    demo: ctx.config.mode === 'demo',
    providers: { llm: ctx.llm.name, calendar: ctx.calendar.name, email: ctx.email.name }
  };
}
