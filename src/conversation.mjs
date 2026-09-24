import { id, stable, text, ensure, isStop, escapeHtml } from './util.mjs';
import {
  normalizeField,
  validateBudget,
  known,
  mayAutomate,
  mayBook,
  maySendAccess,
  scoreLead
} from './rules.mts';
import { validateExtraction } from './providers/llm.mjs';
import { BOOKABLE_CATEGORIES } from './domain.mts';
import { score, summary } from './qualification.mjs';
import { beginWait, remindIfBookable } from './followups.mjs';
import { cancelPending } from './operations.mjs';

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
  ctx.messages.add(
    leadId,
    'system',
    'Your conversation has been passed to our team. A team member will continue here during working hours.'
  );
  ctx.audit.add(leadId, 'handoff', { reason });
}

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
    const rules = ctx.workspace.rules(l.rule_id).data,
      { serviceFit } = scoreLead(l.fields, rules),
      list = (items) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items),
      field = serviceFit === false ? 'service_type' : 'location';
    ctx.messages.add(
      leadId,
      'AI',
      `${prefix}${
        field === 'service_type'
          ? `Sorry, that is not a service we offer. We can help with ${list(rules.services)}.`
          : `Sorry, that location is outside our service area. We currently work in ${list(rules.areas)}.`
      } If your project fits, just tell me and we will continue. Otherwise your enquiry is saved for our team.`
    );
    ctx.leads.update(leadId, { current_field: field });
  } else if (l.qualification === 'complete') {
    if (BOOKABLE_CATEGORIES.includes(l.category) && !l.email) {
      question = {
        field: 'email',
        text: 'What email address should we use for your consultation details?'
      };
    } else {
      ctx.messages.add(
        leadId,
        'AI',
        `${prefix}${
          BOOKABLE_CATEGORIES.includes(l.category)
            ? 'Thanks — I have the project details. Use “Choose a consultation time” below to see current availability.'
            : 'Thank you — your project details are saved. Our team can review the next steps with you.'
        }`
      );
      ctx.leads.update(leadId, { current_field: null });
    }
  } else
    question = s.questions.find((q) => !known(l.fields, q.field) && !l.skipped.includes(q.field));
  if (question) {
    const asked = { ...l.asked, [question.field]: (l.asked[question.field] || 0) + 1 };
    ctx.messages.add(leadId, 'AI', `${prefix}${question.text}`);
    ctx.leads.update(leadId, { current_field: question.field, asked });
  }
  if (markFirst) firstContact(ctx, leadId, 'chat');
  if (question) beginWait(ctx, leadId, 'qualification_abandoned');
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
    ctx.leads.bump(leadId, { owner: 'HUMAN', owner_id: actor.id });
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
  return ctx.store.tx(() => applyExtraction(ctx, leadId, l.revision, messages, result));
}

function applyExtraction(ctx, leadId, snapshot, messages, result) {
  const latest = ctx.leads.get(leadId);
  if (latest.revision !== snapshot || !mayAutomate(latest)) {
    ctx.audit.add(leadId, 'stale_ai_discarded', {});
    return { stale: true };
  }
  const processed = { processed_seq: messages.at(-1).seq };
  if (result.handoff) {
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
  ctx.leads.update(leadId, {
    fields,
    meta,
    skipped: [...skipped],
    ...processed,
    service_key: fields.service_type || latest.service_key
  });
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
  if (q && !answered && !result.faq_id && (latest.asked[q.field] || 0) >= 3) {
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
  const faq = result.faq_id
    ? ctx.workspace.settings().faq.find((f) => f.id === result.faq_id)
    : null;
  // FAQ answers do not spend a clarification attempt or re-ask the current question.
  if (faq && q && !answered) {
    ctx.messages.add(leadId, 'AI', faq.answer);
    beginWait(ctx, leadId, 'qualification_abandoned');
  } else askNext(ctx, leadId, false, faq ? `${faq.answer} ` : '');
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
    );
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
    messages: ctx.messages.history(l.conversation_id),
    demo: ctx.config.mode === 'demo',
    providers: { llm: ctx.llm.name, calendar: ctx.calendar.name, email: ctx.email.name }
  };
}
