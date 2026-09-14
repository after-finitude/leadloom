import { id, hash, stable, encrypt, decrypt, text, ensure } from './util.mjs';
import { mayAutomate, mayBook, maySendAccess } from './rules.mts';
import { availableSlots, working, overlaps, timeLabel } from './time.mts';
import { eventId } from './providers/calendar.mjs';

export function operation(app, kind, leadId, key, payload) {
  const old = app.s.get('SELECT * FROM operations WHERE op_key=?', key),
    digest = hash(stable(payload));
  if (old) {
    ensure(
      old.input_hash === digest && old.kind === kind && old.lead_id === leadId,
      'idempotency_conflict',
      'Operation key was reused for different input',
      409
    );
    return old;
  }
  const oid = id();
  app.s.run(
    'INSERT INTO operations(id,op_key,kind,lead_id,input_hash,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    oid,
    key,
    kind,
    leadId,
    digest,
    encrypt(payload, app.c.key),
    app.clock(),
    app.clock()
  );
  return app.s.get('SELECT * FROM operations WHERE id=?', oid);
}

export async function availability(app, leadId, reschedule = false) {
  const l = app.lead(leadId),
    s = app.settings();
  if (!reschedule) {
    ensure(
      mayBook(l, s),
      'booking_not_allowed',
      'Complete qualification and resolve any automation restrictions before booking',
      409
    );
    ensure(
      !app.s.get(
        "SELECT id FROM appointments WHERE lead_id=? AND status IN ('pending','unknown','confirmed')",
        leadId
      ),
      'appointment_exists',
      undefined,
      409
    );
  }
  const busy = await app.calendar.busy(app.clock(), app.clock() + s.horizon * 86400000);
  const local = app.s.all(
    "SELECT start_at AS start,end_at AS end,buffer_ms AS buffer FROM reservations WHERE state IN ('reserved','confirmed','unknown')"
  );
  const slots = availableSlots(app.clock(), s, [...busy, ...local]);
  return app.s.tx(() => {
    ensure(
      app.lead(leadId).revision === l.revision && app.settings().revision === s.revision,
      'stale_availability',
      'Lead state changed; refresh availability',
      409
    );
    if (!slots.length) {
      if (!reschedule) app.handoff(leadId, 'no_available_slots');
      return { slots: [], timezone: s.timezone };
    }
    const offers = slots.map((slot) => {
      const oid = id();
      app.s.run(
        'INSERT INTO slot_offers(id,lead_id,revision,settings_revision,start_at,end_at,expires_at) VALUES(?,?,?,?,?,?,?)',
        oid,
        leadId,
        l.revision,
        s.revision,
        slot.start,
        slot.end,
        app.clock() + 10 * 60000
      );
      return {
        id: oid,
        start: slot.start,
        end: slot.end,
        label: timeLabel(slot.start, s.timezone)
      };
    });
    if (!reschedule && l.followup_type !== 'qualified_not_booked')
      app.beginWait(leadId, 'qualified_not_booked');
    return { slots: offers, timezone: s.timezone, provider: app.calendar.name };
  });
}

export function reserve(app, leadId, key, start, end, appointmentId = null) {
  const buffer = app.settings().buffer * 60000,
    existing = app.s.all(
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
  app.s.run(
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

export function book(app, leadId, offerId, clientKey) {
  text(clientKey, 128);
  text(offerId, 128);
  const key = `booking:${leadId}:${clientKey}`;
  return app.s.tx(() => {
    const old = app.s.get('SELECT * FROM operations WHERE op_key=?', key);
    if (old) {
      ensure(
        decrypt(old.payload, app.c.key).offerId === offerId,
        'idempotency_conflict',
        undefined,
        409
      );
      return app.operationStatus(old.id);
    }
    const l = app.lead(leadId),
      s = app.settings();
    ensure(mayBook(l, s), 'booking_not_allowed', 'Booking is not currently allowed', 409);
    ensure(
      !app.s.get(
        "SELECT id FROM appointments WHERE lead_id=? AND status IN ('pending','unknown','confirmed')",
        leadId
      ),
      'appointment_exists',
      'An appointment or unresolved booking already exists',
      409
    );
    const offer = app.s.get('SELECT * FROM slot_offers WHERE id=? AND lead_id=?', offerId, leadId);
    ensure(
      offer &&
        offer.expires_at > app.clock() &&
        offer.start_at > app.clock() &&
        offer.revision === l.revision &&
        offer.settings_revision === s.revision,
      'stale_offer',
      'Please refresh the available times',
      409
    );
    app.reserve(leadId, key, offer.start_at, offer.end_at);
    app.cancelPending(leadId, 'booking_started');
    const appointmentId = id();
    app.s.run(
      "INSERT INTO appointments(id,lead_id,operation_key,start_at,end_at,timezone,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)",
      appointmentId,
      leadId,
      key,
      offer.start_at,
      offer.end_at,
      s.timezone,
      app.clock(),
      app.clock()
    );
    app.s.run('UPDATE reservations SET appointment_id=? WHERE operation_key=?', appointmentId, key);
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
      summary: app.summary(leadId)
    };
    const op = app.operation('booking', leadId, key, payload);
    app.enqueue('operation', leadId, `operation:${key}`, {}, app.clock(), op.id);
    app.s.audit(leadId, 'booking_requested', { operationId: op.id }, 'visitor');
    return app.operationStatus(op.id);
  });
}

export function appointmentAction(app, appointmentId, kind, body, actor) {
  ensure(['cancel', 'reschedule'].includes(kind), 'invalid_action');
  text(body.key, 128);
  return app.s.tx(() => {
    const a = app.s.get('SELECT * FROM appointments WHERE id=?', appointmentId);
    ensure(a, 'appointment_not_found', undefined, 404);
    const key = `${kind}:${appointmentId}:${body.key}`,
      old = app.s.get('SELECT * FROM operations WHERE op_key=?', key);
    if (old) {
      if (kind === 'reschedule')
        ensure(
          decrypt(old.payload, app.c.key).offerId === body.offerId,
          'idempotency_conflict',
          undefined,
          409
        );
      return app.operationStatus(old.id);
    }
    ensure(a.status === 'confirmed', 'appointment_not_confirmed', undefined, 409);
    ensure(
      !app.s.get(
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
      const l = app.lead(a.lead_id),
        s = app.settings();
      ensure(
        ['Hot', 'Warm'].includes(l.category) &&
          s.services.includes(l.fields.service_type) &&
          s.areas.some((x) => x.toLowerCase() === String(l.fields.location).toLowerCase()),
        'booking_not_allowed',
        'Resolve qualification before moving this appointment',
        409
      );
      const offer = app.s.get(
        'SELECT * FROM slot_offers WHERE id=? AND lead_id=?',
        body.offerId,
        a.lead_id
      );
      ensure(
        offer &&
          offer.expires_at > app.clock() &&
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
      app.reserve(a.lead_id, key, offer.start_at, offer.end_at, appointmentId);
    }
    const op = app.operation(kind, a.lead_id, key, payload);
    app.enqueue('operation', a.lead_id, `operation:${key}`, {}, app.clock(), op.id);
    app.s.audit(a.lead_id, `${kind}_requested`, { appointmentId }, actor.id);
    return app.operationStatus(op.id);
  });
}

export function operationStatus(app, operationId) {
  const op = app.s.get(
    'SELECT id,kind,state,error_code,external_id FROM operations WHERE id=?',
    operationId
  );
  ensure(op, 'operation_not_found', undefined, 404);
  return op;
}

export function finishOperation(app, op, result) {
  const p = decrypt(op.payload, app.c.key);
  app.s.run(
    "UPDATE operations SET state='confirmed',external_id=?,error_code=NULL,updated_at=? WHERE id=?",
    result?.id || p.externalId || null,
    app.clock(),
    op.id
  );
  if (['booking', 'reschedule'].includes(op.kind)) {
    ensure(
      result && result.start === p.start && result.end === p.end,
      'calendar_result_mismatch',
      'Calendar event differs from requested time',
      502
    );
    app.s.run(
      "UPDATE appointments SET external_id=?,external_url=?,start_at=?,end_at=?,timezone=?,status='confirmed',updated_at=? WHERE id=?",
      result.id,
      result.url || null,
      p.start,
      p.end,
      p.timezone,
      app.clock(),
      p.appointmentId
    );
    app.s.run(
      "UPDATE reservations SET state='released' WHERE appointment_id=? AND operation_key<>?",
      p.appointmentId,
      op.op_key
    );
    app.s.run("UPDATE reservations SET state='confirmed' WHERE operation_key=?", op.op_key);
    const l = app.lead(op.lead_id);
    app.bump(op.lead_id, { stage: 'Booked' });
    app.cancelPending(op.lead_id, 'booked');
    if (mayAutomate(l))
      app.message(
        op.lead_id,
        'system',
        `Your consultation is confirmed for ${timeLabel(p.start, p.timezone)} (${p.timezone}).`
      );
    app.s.run(
      'INSERT INTO notes(id,lead_id,body,created_at) VALUES(?,?,?,?)',
      id(),
      op.lead_id,
      app.summary(op.lead_id),
      app.clock()
    );
  } else if (op.kind === 'cancel') {
    app.s.run(
      "UPDATE appointments SET status='cancelled',updated_at=? WHERE id=?",
      app.clock(),
      p.appointmentId
    );
    app.s.run("UPDATE reservations SET state='released' WHERE appointment_id=?", p.appointmentId);
    const l = app.lead(op.lead_id);
    app.bump(op.lead_id, {
      stage:
        l.qualification === 'complete' && ['Hot', 'Warm'].includes(l.category)
          ? 'Qualified'
          : 'Contacted',
      followup_suppressed: 1
    });
    app.cancelPending(op.lead_id, 'appointment_cancelled');
  } else if (op.kind === 'invitation') {
    if (p.first) app.firstContact(op.lead_id, 'email');
    app.beginWait(op.lead_id, 'qualification_abandoned');
  }
  app.s.audit(
    op.lead_id,
    `${op.kind}_confirmed`,
    { operationId: op.id, externalId: result?.id || p.externalId || null },
    'system',
    undefined,
    app.clock()
  );
}

export function failOperation(app, op, error, unknown) {
  const state = unknown ? 'unknown' : 'failed',
    code = error.code || `${op.kind}_error`;
  app.s.run(
    'UPDATE operations SET state=?,error_code=?,updated_at=? WHERE id=?',
    state,
    code,
    app.clock(),
    op.id
  );
  if (op.kind === 'booking')
    app.s.run(
      'UPDATE appointments SET status=?,updated_at=? WHERE operation_key=?',
      unknown ? 'unknown' : 'failed',
      app.clock(),
      op.op_key
    );
  if (['booking', 'reschedule'].includes(op.kind))
    app.s.run(
      'UPDATE reservations SET state=? WHERE operation_key=?',
      unknown ? 'unknown' : 'released',
      op.op_key
    );
  app.s.audit(
    op.lead_id,
    `${op.kind}_${state}`,
    { operationId: op.id, code },
    'system',
    undefined,
    app.clock()
  );
  if (unknown && op.kind !== 'access') {
    app.handoff(op.lead_id, `${op.kind}_unknown`);
  } else if (op.kind === 'invitation') {
    app.save(op.lead_id, { first_contact_status: 'error' });
    app.handoff(op.lead_id, code);
  }
}

export async function executeOperation(app, operationId) {
  let op = app.s.get('SELECT * FROM operations WHERE id=?', operationId);
  if (!op || ['confirmed', 'cancelled'].includes(op.state)) return;
  if (op.state === 'unknown' || op.state === 'running') return app.reconcile(operationId);
  const p = decrypt(op.payload, app.c.key),
    gate = () => {
      const l = app.lead(op.lead_id);
      ensure(
        op.kind === 'access' ? maySendAccess(l) : mayAutomate(l),
        'automation_stopped',
        'Operation is no longer allowed',
        409
      );
      if (op.kind === 'booking')
        ensure(
          mayBook(l, app.settings()) &&
            l.revision === p.revision &&
            app.settings().revision === p.settingsRevision &&
            p.expiresAt > app.clock(),
          'stale_booking',
          'Booking eligibility changed',
          409
        );
    };
  let dispatched = false;
  try {
    if (['booking', 'invitation', 'followup', 'access'].includes(op.kind)) gate();
    if (['booking', 'reschedule'].includes(op.kind)) {
      const s = app.settings();
      ensure(
        working(p.start, s, s.duration * 60000) && p.start > app.clock(),
        'outside_hours',
        'Requested time is no longer valid',
        409
      );
      const busy = await app.calendar.busy(p.start - s.buffer * 60000, p.end + s.buffer * 60000);
      ensure(
        !busy.some((b) => overlaps({ start: p.start, end: p.end }, b, s.buffer * 60000)),
        'slot_taken',
        'The calendar slot is no longer free',
        409
      );
    }
    if (['booking', 'invitation', 'followup', 'access'].includes(op.kind)) gate();
    app.s.tx(() => {
      app.s.run(
        "UPDATE operations SET state='running',attempts=attempts+1,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?",
        app.clock(),
        app.clock(),
        op.id
      );
      app.s.audit(op.lead_id, `${op.kind}_started`, { operationId: op.id });
    });
    let result;
    dispatched = true;
    if (op.kind === 'booking') result = await app.calendar.create(p, gate);
    else if (op.kind === 'cancel') result = await app.calendar.cancel(p);
    else if (op.kind === 'reschedule') result = await app.calendar.reschedule(p);
    else result = await app.email.send(p.email, op.op_key, op.lead_id, gate);
    app.s.tx(() => app.finishOperation(op, result));
  } catch (error) {
    const knownRejection =
      [
        'automation_stopped',
        'stale_booking',
        'slot_taken',
        'outside_hours',
        'recipient_not_allowed'
      ].includes(error.code) || /_http_4\d\d$/.test(error.code || '');
    app.s.tx(() => app.failOperation(op, error, dispatched && !knownRejection));
  }
  return app.operationStatus(op.id);
}

export async function reconcile(app, operationId) {
  const op = app.s.get('SELECT * FROM operations WHERE id=?', operationId);
  ensure(op, 'operation_not_found', undefined, 404);
  if (op.state === 'confirmed') return app.operationStatus(op.id);
  ensure(
    ['unknown', 'running'].includes(op.state),
    'not_unknown',
    'Only an uncertain operation can be reconciled',
    409
  );
  const p = decrypt(op.payload, app.c.key);
  let result = null;
  if (['booking', 'reschedule', 'cancel'].includes(op.kind)) {
    const found = await app.calendar.get(op.kind === 'booking' ? eventId(op.op_key) : p.externalId);
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
    result = await app.email.get(op.external_id, op.op_key);
    // Resend retains idempotency keys for 24 h. Replay only while still permitted,
    // with byte-identical persisted payload, and within a conservative 23 h window.
    const canSend = () => {
      const l = app.lead(op.lead_id);
      return op.kind === 'access' ? maySendAccess(l) : mayAutomate(l);
    };
    if (
      !result &&
      app.email.name === 'resend' &&
      app.clock() - op.created_at < 23 * 3600000 &&
      canSend()
    ) {
      result = await app.email.send(p.email, op.op_key, op.lead_id, () =>
        ensure(canSend(), 'automation_stopped')
      );
    }
  }
  if (result)
    app.s.tx(() => {
      app.finishOperation(op, result);
      app.s.run(
        "UPDATE actions SET state='done',updated_at=? WHERE operation_id=?",
        app.clock(),
        op.id
      );
    });
  else app.s.audit(op.lead_id, 'reconciliation_unresolved', { operationId: op.id });
  return app.operationStatus(op.id);
}

export function retry(app, actionId, actor) {
  return app.s.tx(() => {
    const a = app.s.get('SELECT * FROM actions WHERE id=?', actionId);
    ensure(
      a && a.state === 'failed',
      'unsafe_retry',
      'Only a known failed action can be retried',
      409
    );
    const op = a.operation_id
      ? app.s.get('SELECT * FROM operations WHERE id=?', a.operation_id)
      : null;
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
    const l = app.lead(a.lead_id);
    ensure(
      op?.kind === 'access' ? maySendAccess(l) : mayAutomate(l),
      'automation_stopped',
      'Resolve delivery restrictions before retrying',
      409
    );
    if (op)
      app.s.run(
        "UPDATE operations SET state='pending',updated_at=? WHERE id=?",
        app.clock(),
        op.id
      );
    app.s.run(
      "UPDATE actions SET state='pending',due_at=?,updated_at=? WHERE id=?",
      app.clock(),
      app.clock(),
      a.id
    );
    app.s.audit(a.lead_id, 'action_retry', { actionId }, actor.id);
    return { queued: true };
  });
}
