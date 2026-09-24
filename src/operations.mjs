import { id, text, ensure } from './util.mjs';
import { mayAutomate, mayBook, maySendAccess, mayReschedule } from './rules.mts';
import { availableSlots, working, overlaps, timeLabel } from './time.mts';
import { eventId } from './providers/calendar.mjs';
import { BOOKABLE_CATEGORIES } from './domain.mts';
import { handoff, firstContact } from './conversation.mjs';
import { summary } from './qualification.mjs';
import { beginWait } from './followups.mjs';

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

/** @returns {Promise<import('./types.ts').Availability>} */
export async function availability(ctx, leadId, reschedule = false) {
  const l = ctx.leads.get(leadId),
    s = ctx.workspace.settings();
  if (!reschedule) {
    ensure(
      mayBook(l, s),
      'booking_not_allowed',
      'Complete qualification and resolve any automation restrictions before booking',
      409
    );
    ensure(
      !ctx.store.get(
        "SELECT id FROM appointments WHERE lead_id=? AND status IN ('pending','unknown','confirmed')",
        leadId
      ),
      'appointment_exists',
      undefined,
      409
    );
  }
  const busy = await ctx.calendar.busy(ctx.clock(), ctx.clock() + s.horizon * 86400000);
  const local = ctx.store.all(
    "SELECT start_at AS start,end_at AS end,buffer_ms AS buffer FROM reservations WHERE state IN ('reserved','confirmed','unknown')"
  );
  const slots = availableSlots(ctx.clock(), s, [...busy, ...local]);
  return ctx.store.tx(() => {
    ensure(
      ctx.leads.get(leadId).revision === l.revision &&
        ctx.workspace.settings().revision === s.revision,
      'stale_availability',
      'Lead state changed; refresh availability',
      409
    );
    if (!slots.length) {
      if (!reschedule) handoff(ctx, leadId, 'no_available_slots');
      return { slots: [], timezone: s.timezone };
    }
    const offers = slots.map((slot) => {
      const oid = id();
      ctx.store.run(
        'INSERT INTO slot_offers(id,lead_id,revision,settings_revision,start_at,end_at,expires_at) VALUES(?,?,?,?,?,?,?)',
        oid,
        leadId,
        l.revision,
        s.revision,
        slot.start,
        slot.end,
        ctx.clock() + 10 * 60000
      );
      return {
        id: oid,
        start: slot.start,
        end: slot.end,
        label: timeLabel(slot.start, s.timezone)
      };
    });
    if (!reschedule && l.followup_type !== 'qualified_not_booked')
      beginWait(ctx, leadId, 'qualified_not_booked');
    return { slots: offers, timezone: s.timezone, provider: ctx.calendar.name };
  });
}

export async function appointmentAvailability(ctx, appointmentId) {
  const a = ctx.store.get('SELECT lead_id FROM appointments WHERE id=?', appointmentId);
  ensure(a, 'appointment_not_found', undefined, 404);
  return availability(ctx, a.lead_id, true);
}

export function reserve(ctx, leadId, key, start, end, appointmentId = null) {
  const buffer = ctx.workspace.settings().buffer * 60000,
    existing = ctx.store.all(
      "SELECT * FROM reservations WHERE state IN ('reserved','confirmed','unknown')"
    );
  ensure(
    !existing.some(
      (r) =>
        r.appointment_id !== appointmentId &&
        overlaps(
          { start, end },
          { start: r.start_at, end: r.end_at },
          Math.max(buffer, r.buffer_ms)
        )
    ),
    'slot_taken',
    'That slot was just taken. Refresh availability.',
    409
  );
  ctx.store.run(
    "INSERT INTO reservations(id,operation_key,lead_id,appointment_id,start_at,end_at,buffer_ms,state) VALUES(?,?,?,?,?,?,?,'reserved')",
    id(),
    key,
    leadId,
    appointmentId,
    start,
    end,
    buffer
  );
}

export function book(ctx, leadId, offerId, clientKey) {
  text(clientKey, 128);
  text(offerId, 128);
  const key = `booking:${leadId}:${clientKey}`;
  return ctx.store.tx(() => {
    const old = ctx.operations.byKey(key);
    if (old) {
      ensure(
        ctx.operations.payload(old).offerId === offerId,
        'idempotency_conflict',
        undefined,
        409
      );
      return ctx.operations.status(old.id);
    }
    const l = ctx.leads.get(leadId),
      s = ctx.workspace.settings();
    ensure(mayBook(l, s), 'booking_not_allowed', 'Booking is not currently allowed', 409);
    ensure(
      !ctx.store.get(
        "SELECT id FROM appointments WHERE lead_id=? AND status IN ('pending','unknown','confirmed')",
        leadId
      ),
      'appointment_exists',
      'An appointment or unresolved booking already exists',
      409
    );
    const offer = ctx.store.get(
      'SELECT * FROM slot_offers WHERE id=? AND lead_id=?',
      offerId,
      leadId
    );
    ensure(
      offer &&
        offer.expires_at > ctx.clock() &&
        offer.start_at > ctx.clock() &&
        offer.revision === l.revision &&
        offer.settings_revision === s.revision,
      'stale_offer',
      'Please refresh the available times',
      409
    );
    reserve(ctx, leadId, key, offer.start_at, offer.end_at);
    cancelPending(ctx, leadId, 'booking_started');
    const appointmentId = id();
    ctx.store.run(
      "INSERT INTO appointments(id,lead_id,operation_key,start_at,end_at,timezone,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)",
      appointmentId,
      leadId,
      key,
      offer.start_at,
      offer.end_at,
      s.timezone,
      ctx.clock(),
      ctx.clock()
    );
    ctx.store.run(
      'UPDATE reservations SET appointment_id=? WHERE operation_key=?',
      appointmentId,
      key
    );
    const payload = {
      key,
      offerId,
      appointmentId,
      leadId,
      start: offer.start_at,
      end: offer.end_at,
      timezone: s.timezone,
      revision: l.revision,
      settingsRevision: s.revision,
      expiresAt: offer.expires_at,
      name: l.name,
      summary: summary(ctx, leadId)
    };
    const op = ctx.operations.create('booking', leadId, key, payload);
    ctx.actions.enqueue('operation', leadId, `operation:${key}`, {}, ctx.clock(), op.id);
    ctx.audit.add(leadId, 'booking_requested', { operationId: op.id }, { actor: 'visitor' });
    return ctx.operations.status(op.id);
  });
}

export function appointmentAction(ctx, appointmentId, kind, body, actor) {
  ensure(['cancel', 'reschedule'].includes(kind), 'invalid_action');
  text(body.key, 128);
  return ctx.store.tx(() => {
    const a = ctx.store.get('SELECT * FROM appointments WHERE id=?', appointmentId);
    ensure(a, 'appointment_not_found', undefined, 404);
    const key = `${kind}:${appointmentId}:${body.key}`,
      old = ctx.operations.byKey(key);
    if (old) {
      if (kind === 'reschedule')
        ensure(
          ctx.operations.payload(old).offerId === body.offerId,
          'idempotency_conflict',
          undefined,
          409
        );
      return ctx.operations.status(old.id);
    }
    ensure(a.status === 'confirmed', 'appointment_not_confirmed', undefined, 409);
    ensure(
      !ctx.store.get(
        "SELECT id FROM operations WHERE lead_id=? AND kind IN ('cancel','reschedule') AND state IN ('pending','running','unknown')",
        a.lead_id
      ),
      'operation_in_progress',
      undefined,
      409
    );
    const payload = {
      key,
      appointmentId,
      externalId: a.external_id,
      leadId: a.lead_id,
      start: a.start_at,
      end: a.end_at,
      timezone: a.timezone
    };
    if (kind === 'reschedule') {
      const l = ctx.leads.get(a.lead_id),
        s = ctx.workspace.settings();
      ensure(
        mayReschedule(l, s),
        'booking_not_allowed',
        'Resolve qualification before moving this appointment',
        409
      );
      const offer = ctx.store.get(
        'SELECT * FROM slot_offers WHERE id=? AND lead_id=?',
        body.offerId,
        a.lead_id
      );
      ensure(
        offer &&
          offer.expires_at > ctx.clock() &&
          offer.revision === l.revision &&
          offer.settings_revision === s.revision,
        'stale_offer',
        undefined,
        409
      );
      Object.assign(payload, {
        offerId: body.offerId,
        start: offer.start_at,
        end: offer.end_at,
        timezone: s.timezone,
        settingsRevision: s.revision
      });
      reserve(ctx, a.lead_id, key, offer.start_at, offer.end_at, appointmentId);
    }
    const op = ctx.operations.create(kind, a.lead_id, key, payload);
    ctx.actions.enqueue('operation', a.lead_id, `operation:${key}`, {}, ctx.clock(), op.id);
    ctx.audit.add(a.lead_id, `${kind}_requested`, { appointmentId }, { actor: actor.id });
    return ctx.operations.status(op.id);
  });
}

export function finishOperation(ctx, op, result) {
  const p = ctx.operations.payload(op);
  ctx.store.run(
    "UPDATE operations SET state='confirmed',external_id=?,error_code=NULL,updated_at=? WHERE id=?",
    result?.id || p.externalId || null,
    ctx.clock(),
    op.id
  );
  if (['booking', 'reschedule'].includes(op.kind)) {
    ensure(
      result && result.start === p.start && result.end === p.end,
      'calendar_result_mismatch',
      'Calendar event differs from requested time',
      502
    );
    ctx.store.run(
      "UPDATE appointments SET external_id=?,external_url=?,start_at=?,end_at=?,timezone=?,status='confirmed',updated_at=? WHERE id=?",
      result.id,
      result.url || null,
      p.start,
      p.end,
      p.timezone,
      ctx.clock(),
      p.appointmentId
    );
    ctx.store.run(
      "UPDATE reservations SET state='released' WHERE appointment_id=? AND operation_key<>?",
      p.appointmentId,
      op.op_key
    );
    ctx.store.run("UPDATE reservations SET state='confirmed' WHERE operation_key=?", op.op_key);
    const l = ctx.leads.get(op.lead_id);
    ctx.leads.bump(op.lead_id, { stage: 'Booked' });
    cancelPending(ctx, op.lead_id, 'booked');
    if (mayAutomate(l))
      ctx.messages.add(
        op.lead_id,
        'system',
        `Your consultation is confirmed for ${timeLabel(p.start, p.timezone)} (${p.timezone}).`
      );
    ctx.store.run(
      'INSERT INTO notes(id,lead_id,body,created_at) VALUES(?,?,?,?)',
      id(),
      op.lead_id,
      summary(ctx, op.lead_id),
      ctx.clock()
    );
  } else if (op.kind === 'cancel') {
    ctx.store.run(
      "UPDATE appointments SET status='cancelled',updated_at=? WHERE id=?",
      ctx.clock(),
      p.appointmentId
    );
    ctx.store.run(
      "UPDATE reservations SET state='released' WHERE appointment_id=?",
      p.appointmentId
    );
    const l = ctx.leads.get(op.lead_id);
    ctx.leads.bump(op.lead_id, {
      stage:
        l.qualification === 'complete' && BOOKABLE_CATEGORIES.includes(l.category)
          ? 'Qualified'
          : 'Contacted',
      followup_suppressed: 1
    });
    cancelPending(ctx, op.lead_id, 'appointment_cancelled');
  } else if (op.kind === 'invitation') {
    if (p.first) firstContact(ctx, op.lead_id, 'email');
    beginWait(ctx, op.lead_id, 'qualification_abandoned');
  }
  ctx.audit.add(op.lead_id, `${op.kind}_confirmed`, {
    operationId: op.id,
    externalId: result?.id || p.externalId || null
  });
}

export function failOperation(ctx, op, error, unknown) {
  const state = unknown ? 'unknown' : 'failed',
    code = error.code || `${op.kind}_error`;
  ctx.store.run(
    'UPDATE operations SET state=?,error_code=?,updated_at=? WHERE id=?',
    state,
    code,
    ctx.clock(),
    op.id
  );
  if (op.kind === 'booking')
    ctx.store.run(
      'UPDATE appointments SET status=?,updated_at=? WHERE operation_key=?',
      unknown ? 'unknown' : 'failed',
      ctx.clock(),
      op.op_key
    );
  if (['booking', 'reschedule'].includes(op.kind))
    ctx.store.run(
      'UPDATE reservations SET state=? WHERE operation_key=?',
      unknown ? 'unknown' : 'released',
      op.op_key
    );
  ctx.audit.add(op.lead_id, `${op.kind}_${state}`, { operationId: op.id, code });
  if (unknown && op.kind !== 'access') {
    handoff(ctx, op.lead_id, `${op.kind}_unknown`);
  } else if (op.kind === 'invitation') {
    ctx.leads.update(op.lead_id, { first_contact_status: 'error' });
    handoff(ctx, op.lead_id, code);
  }
}

export async function executeOperation(ctx, operationId) {
  let op = ctx.operations.get(operationId);
  if (!op || ['confirmed', 'cancelled'].includes(op.state)) return;
  if (op.state === 'unknown' || op.state === 'running') return reconcile(ctx, operationId);
  const p = ctx.operations.payload(op),
    gate = () => {
      const l = ctx.leads.get(op.lead_id);
      ensure(
        op.kind === 'access' ? maySendAccess(l) : mayAutomate(l),
        'automation_stopped',
        'Operation is no longer allowed',
        409
      );
      if (op.kind === 'booking')
        ensure(
          mayBook(l, ctx.workspace.settings()) &&
            l.revision === p.revision &&
            ctx.workspace.settings().revision === p.settingsRevision &&
            p.expiresAt > ctx.clock(),
          'stale_booking',
          'Booking eligibility changed',
          409
        );
    };
  let dispatched = false;
  try {
    if (['booking', 'invitation', 'followup', 'access'].includes(op.kind)) gate();
    if (['booking', 'reschedule'].includes(op.kind)) {
      const s = ctx.workspace.settings();
      ensure(
        working(p.start, s, s.duration * 60000) && p.start > ctx.clock(),
        'outside_hours',
        'Requested time is no longer valid',
        409
      );
      const busy = await ctx.calendar.busy(p.start - s.buffer * 60000, p.end + s.buffer * 60000);
      ensure(
        !busy.some((b) => overlaps({ start: p.start, end: p.end }, b, s.buffer * 60000)),
        'slot_taken',
        'The calendar slot is no longer free',
        409
      );
    }
    if (['booking', 'invitation', 'followup', 'access'].includes(op.kind)) gate();
    ctx.store.tx(() => {
      ctx.store.run(
        "UPDATE operations SET state='running',attempts=attempts+1,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?",
        ctx.clock(),
        ctx.clock(),
        op.id
      );
      ctx.audit.add(op.lead_id, `${op.kind}_started`, { operationId: op.id });
    });
    let result;
    dispatched = true;
    if (op.kind === 'booking') result = await ctx.calendar.create(p, gate);
    else if (op.kind === 'cancel') result = await ctx.calendar.cancel(p);
    else if (op.kind === 'reschedule') result = await ctx.calendar.reschedule(p);
    else result = await ctx.email.send(p.email, op.op_key, op.lead_id, gate);
    ctx.store.tx(() => finishOperation(ctx, op, result));
  } catch (error) {
    const knownRejection =
      [
        'automation_stopped',
        'stale_booking',
        'slot_taken',
        'outside_hours',
        'recipient_not_allowed'
      ].includes(error.code) || /_http_4\d\d$/.test(error.code || '');
    ctx.store.tx(() => failOperation(ctx, op, error, dispatched && !knownRejection));
  }
  return ctx.operations.status(op.id);
}

export async function reconcile(ctx, operationId) {
  const op = ctx.operations.get(operationId);
  ensure(op, 'operation_not_found', undefined, 404);
  if (op.state === 'confirmed') return ctx.operations.status(op.id);
  ensure(
    ['unknown', 'running'].includes(op.state),
    'not_unknown',
    'Only an uncertain operation can be reconciled',
    409
  );
  const p = ctx.operations.payload(op);
  let result = null;
  if (['booking', 'reschedule', 'cancel'].includes(op.kind)) {
    const found = await ctx.calendar.get(op.kind === 'booking' ? eventId(op.op_key) : p.externalId);
    if (op.kind === 'cancel') {
      if (!found) result = { cancelled: true };
    } else if (
      found &&
      found.operationKey === op.op_key &&
      found.start === p.start &&
      found.end === p.end
    )
      result = found;
  } else {
    result = await ctx.email.get(op.external_id, op.op_key);
    // Resend retains idempotency keys for 24 h. Replay only while still permitted,
    // with byte-identical persisted payload, and within a conservative 23 h window.
    const canSend = () => {
      const l = ctx.leads.get(op.lead_id);
      return op.kind === 'access' ? maySendAccess(l) : mayAutomate(l);
    };
    if (
      !result &&
      ctx.email.name === 'resend' &&
      ctx.clock() - op.created_at < 23 * 3600000 &&
      canSend()
    ) {
      result = await ctx.email.send(p.email, op.op_key, op.lead_id, () =>
        ensure(canSend(), 'automation_stopped')
      );
    }
  }
  if (result)
    ctx.store.tx(() => {
      finishOperation(ctx, op, result);
      ctx.store.run(
        "UPDATE actions SET state='done',updated_at=? WHERE operation_id=?",
        ctx.clock(),
        op.id
      );
    });
  else ctx.audit.add(op.lead_id, 'reconciliation_unresolved', { operationId: op.id });
  return ctx.operations.status(op.id);
}

export function retry(ctx, actionId, actor) {
  return ctx.store.tx(() => {
    const a = ctx.store.get('SELECT * FROM actions WHERE id=?', actionId);
    ensure(
      a && a.state === 'failed',
      'unsafe_retry',
      'Only a known failed action can be retried',
      409
    );
    const op = a.operation_id ? ctx.operations.get(a.operation_id) : null;
    ensure(
      !op || op.state === 'failed',
      'unsafe_retry',
      'Reconcile uncertain external results instead',
      409
    );
    ensure(
      !op || !['booking', 'reschedule', 'cancel'].includes(op.kind),
      'refresh_offer',
      'Create a new calendar operation with a fresh offer',
      409
    );
    const l = ctx.leads.get(a.lead_id);
    ensure(
      op?.kind === 'access' ? maySendAccess(l) : mayAutomate(l),
      'automation_stopped',
      'Resolve delivery restrictions before retrying',
      409
    );
    if (op)
      ctx.store.run(
        "UPDATE operations SET state='pending',updated_at=? WHERE id=?",
        ctx.clock(),
        op.id
      );
    ctx.store.run(
      "UPDATE actions SET state='pending',due_at=?,updated_at=? WHERE id=?",
      ctx.clock(),
      ctx.clock(),
      a.id
    );
    ctx.audit.add(a.lead_id, 'action_retry', { actionId }, { actor: actor.id });
    return { queued: true };
  });
}
