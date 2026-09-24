import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, HOT } from './helpers.mjs';
import { id, AppError, decrypt } from '../src/util.mjs';
async function booking(f) {
  const lid = await f.lead(),
    offers = await f.app.availability(lid);
  assert.equal(offers.slots.length, 5);
  const op = f.app.book(lid, offers.slots[0].id, 'book-key');
  return { lid, offers, op };
}
test('same booking request confirms exactly one calendar event', async () => {
  const f = fixture();
  try {
    const { lid, offers, op } = await booking(f);
    assert.equal(f.app.book(lid, offers.slots[0].id, 'book-key').id, op.id);
    await f.app.tick();
    assert.equal(f.app.lead(lid).stage, 'Booked');
    assert.equal(f.app.book(lid, offers.slots[0].id, 'book-key').state, 'confirmed');
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 1);
    assert.throws(
      () => f.app.book(lid, offers.slots[1].id, 'book-key'),
      (e) => e.code === 'idempotency_conflict'
    );
  } finally {
    f.close();
  }
});
test('two leads cannot reserve overlapping intervals', async () => {
  const f = fixture();
  try {
    const one = await f.lead(),
      two = await f.lead(),
      a = await f.app.availability(one),
      b = await f.app.availability(two);
    f.app.book(one, a.slots[0].id, id());
    assert.throws(
      () => f.app.book(two, b.slots[1].id, id()),
      (e) => e.code === 'slot_taken'
    );
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 1);
  } finally {
    f.close();
  }
});
test('external calendar conflict is checked again just before creation', async () => {
  const f = fixture();
  try {
    const { lid, offers, op } = await booking(f);
    const slot = offers.slots[0];
    await f.app.calendar.create({ key: 'external', leadId: lid, start: slot.start, end: slot.end });
    await f.app.tick();
    assert.equal(f.app.operationStatus(op.id).state, 'failed');
    assert.notEqual(f.app.lead(lid).stage, 'Booked');
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 1);
    const state = f.app.publicState(lid);
    assert.equal(state.appointment, null);
    assert.equal(state.can_book, true);
    assert.deepEqual(state.booking_issue, {
      id: op.id,
      message:
        'Sorry, that time was taken before we could confirm your booking. No appointment was created.'
    });
    assert.deepEqual(f.app.publicState(lid).booking_issue, state.booking_issue);
    const fresh = await f.app.availability(lid);
    assert.ok(fresh.slots.length);
    assert.ok(fresh.slots.every((offer) => offer.start >= slot.end + 15 * 60000));
    f.app.book(lid, fresh.slots[0].id, 'new-choice');
    assert.equal(f.app.publicState(lid).booking_issue, null);
    await f.app.tick();
    assert.equal(f.app.publicState(lid).appointment.status, 'confirmed');
    assert.equal(f.app.publicState(lid).booking_issue, null);
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 2);
  } finally {
    f.close();
  }
});
test('public booking failures hide provider diagnostics and belong only to their lead', async () => {
  const f = fixture();
  try {
    const { lid, op } = await booking(f);
    f.app.calendar.busy = async () => {
      throw new AppError('calendar_http_401', 'Private provider diagnostic', 502);
    };
    await f.app.tick();
    assert.deepEqual(f.app.publicState(lid).booking_issue, {
      id: op.id,
      message: 'We could not confirm your booking. No appointment was created.'
    });
    assert.equal(f.app.publicState(await f.lead()).booking_issue, null);
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 0);
  } finally {
    f.close();
  }
});
test('lost calendar response becomes unknown, then reconciles the same event', async () => {
  const f = fixture();
  try {
    const { lid, op } = await booking(f);
    f.app.calendar.failAfterCreate = true;
    await f.app.tick();
    assert.equal(f.app.operationStatus(op.id).state, 'unknown');
    assert.equal(f.app.lead(lid).owner, 'HUMAN');
    assert.equal(f.app.publicState(lid).booking_issue, null);
    assert.equal(f.app.publicState(lid).can_book, false);
    assert.equal(f.app.publicState(lid).appointment.status, 'unknown');
    const fixed = await f.app.reconcile(op.id);
    assert.equal(fixed.state, 'confirmed');
    assert.equal(f.app.lead(lid).stage, 'Booked');
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 1);
  } finally {
    f.close();
  }
});
test('STOP before dispatch cancels a pending booking without creating an event', async () => {
  const f = fixture();
  try {
    const { lid, op } = await booking(f);
    f.app.postMessage(lid, 'STOP', id());
    await f.app.tick();
    assert.equal(f.app.operationStatus(op.id).state, 'cancelled');
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 0);
  } finally {
    f.close();
  }
});
test('changed settings invalidate previously offered slots', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(),
      offers = await f.app.availability(lid);
    f.app.updateSettings({ ...f.app.settings(), buffer: 30 }, f.actor.id);
    assert.throws(
      () => f.app.book(lid, offers.slots[0].id, id()),
      (e) => e.code === 'stale_offer'
    );
  } finally {
    f.close();
  }
});
test('unqualified lead cannot get slots or forge a booking', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(
      'Roofing, located in Outside City. Budget $50000. I own the home. Start in 2 months.'
    );
    assert.equal(f.app.lead(lid).category, 'Unqualified');
    await assert.rejects(
      () => f.app.availability(lid),
      (e) => e.code === 'booking_not_allowed'
    );
    assert.throws(
      () => f.app.book(lid, id(), id()),
      (e) => e.code === 'booking_not_allowed'
    );
  } finally {
    f.close();
  }
});
test('unsupported location names the service area and a corrected city requalifies', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(
      'Roofing, located in Outside City. Budget $50000. I own the home. Start in 2 months.'
    );
    assert.equal(f.app.lead(lid).current_field, 'location');
    assert.match(f.app.publicState(lid).messages.at(-1).body, /Demo City A and Demo City B/);
    f.app.postMessage(lid, 'Demo City A', id());
    await f.app.tick();
    assert.notEqual(f.app.lead(lid).category, 'Unqualified');
    assert.equal(f.app.lead(lid).fields.location, 'Demo City A');
  } finally {
    f.close();
  }
});
test('email is required before automatic booking', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(HOT, { email: null, phone: '+14155550106' });
    assert.equal(f.app.lead(lid).current_field, 'email');
    await assert.rejects(() => f.app.availability(lid));
    f.app.postMessage(lid, 'My email is book@example.test', id());
    await f.app.tick();
    assert.ok((await f.app.availability(lid)).slots.length);
  } finally {
    f.close();
  }
});
test('cancellation retains old state until confirmed and does not restart follow-ups', async () => {
  const f = fixture();
  try {
    const { lid } = await booking(f);
    await f.app.tick();
    const a = f.store.get('SELECT * FROM appointments WHERE lead_id=?', lid);
    f.app.appointmentAction(a.id, 'cancel', { key: 'cancel' }, f.actor);
    assert.equal(
      f.store.get('SELECT status FROM appointments WHERE id=?', a.id).status,
      'confirmed'
    );
    await f.app.tick();
    assert.equal(
      f.store.get('SELECT status FROM appointments WHERE id=?', a.id).status,
      'cancelled'
    );
    assert.equal(f.app.lead(lid).stage, 'Qualified');
    assert.equal(f.app.lead(lid).followup_suppressed, 1);
  } finally {
    f.close();
  }
});
test('reschedule updates the existing external event instead of duplicating it', async () => {
  const f = fixture();
  try {
    const { lid } = await booking(f);
    await f.app.tick();
    const a = f.store.get('SELECT * FROM appointments WHERE lead_id=?', lid),
      offers = await f.app.availability(lid, true);
    const op = f.app.appointmentAction(
      a.id,
      'reschedule',
      { key: 'move', offerId: offers.slots[0].id },
      f.actor
    );
    assert.equal(
      f.store.get('SELECT start_at FROM appointments WHERE id=?', a.id).start_at,
      a.start_at
    );
    await f.app.tick();
    assert.equal(f.app.operationStatus(op.id).state, 'confirmed');
    assert.equal(
      f.store.get('SELECT external_id FROM appointments WHERE id=?', a.id).external_id,
      a.external_id
    );
    assert.equal(f.store.get('SELECT count(*) AS n FROM calendar_events').n, 1);
  } finally {
    f.close();
  }
});
test('nighttime follow-up waits until working hours, but initial invitation does not', async () => {
  const f = fixture();
  try {
    f.setTime(Date.parse('2026-09-10T23:00:00Z'));
    const r = f.app.intake({ event_key: id(), email: 'night@example.test' }, { web: false });
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
    assert.equal(f.app.lead(r.leadId).first_contact_channel, 'email');
    f.advance(3600001);
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
    f.setTime(Date.parse('2026-09-11T09:00:00Z'));
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 2);
  } finally {
    f.close();
  }
});
test('reply cancels the current follow-up run and STOP cancels all pending mail', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(null);
    const old = f.app.lead(lid).followup_run;
    f.app.postMessage(lid, 'Roofing', id());
    await f.app.tick();
    assert.notEqual(f.app.lead(lid).followup_run, old);
    assert.equal(
      f.store.get(
        "SELECT count(*) AS n FROM actions WHERE data LIKE ? AND state='pending'",
        `%${old}%`
      ).n,
      0
    );
    f.app.postMessage(lid, 'STOP', id());
    f.advance(8 * 86400000);
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 0);
  } finally {
    f.close();
  }
});
test('late follow-ups do not send a backlog as a batch', async () => {
  const f = fixture();
  try {
    await f.lead(null);
    f.advance(5 * 86400000);
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
    assert.equal(
      f.store.get("SELECT count(*) AS n FROM actions WHERE kind='followup' AND state='skipped'").n,
      2
    );
  } finally {
    f.close();
  }
});
test('unknown email result is reconciled without a second mock delivery', async () => {
  const f = fixture();
  try {
    f.app.email.failAfterSend = true;
    const r = f.app.intake({ event_key: id(), email: 'lost@example.test' }, { web: false });
    await f.app.tick();
    const op = f.store.get(
      "SELECT * FROM operations WHERE lead_id=? AND kind='invitation'",
      r.leadId
    );
    assert.equal(op.state, 'unknown');
    await f.app.reconcile(op.id);
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
    assert.equal(f.app.operationStatus(op.id).state, 'confirmed');
  } finally {
    f.close();
  }
});
test('all data and pending work survive a database reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'leadloom-test-')),
    path = join(directory, 'db.sqlite');
  let f = fixture({ path });
  try {
    const lid = await f.lead(null);
    f.app.postMessage(lid, HOT, id());
    f.close();
    f = fixture({ path });
    assert.ok(f.app.publicState(lid).messages.some((m) => m.body === HOT));
    await f.app.tick();
    assert.equal(f.app.lead(lid).category, 'Hot');
  } finally {
    f.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('completed qualification sends a follow-up without opening availability', async () => {
  for (const source of ['chat', 'manual']) {
    const f = fixture();
    try {
      const lid = await f.lead(source === 'chat' ? HOT : null);
      if (source === 'manual')
        f.app.editFields(
          lid,
          {
            fields: {
              service_type: 'roofing',
              location: 'Demo City A',
              budget_min: 20000,
              budget_max: 20000,
              timeline: 2,
              decision_maker: true
            }
          },
          f.actor
        );
      const lead = f.app.lead(lid);
      assert.equal(lead.followup_type, 'qualified_not_booked');
      assert.equal(f.store.get('SELECT count(*) AS n FROM slot_offers').n, 0);
      f.advance(f.app.settings().followup.qualified_not_booked[0] * 60000);
      await f.app.tick();
      assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
      assert.equal(
        f.store.get(
          "SELECT count(*) AS n FROM actions WHERE lead_id=? AND kind='followup' AND state='pending'",
          lid
        ).n,
        2
      );
      await f.app.availability(lid);
      assert.equal(f.app.lead(lid).followup_run, lead.followup_run);
      assert.equal(f.app.lead(lid).waiting_at, lead.waiting_at);
    } finally {
      f.close();
    }
  }
});

test('cancelling a queued reschedule frees only the new slot', async () => {
  for (const reason of ['pause', 'reply', 'stop']) {
    const f = fixture();
    try {
      const { lid } = await booking(f);
      await f.app.tick();
      const original = f.store.get('SELECT * FROM appointments WHERE lead_id=?', lid);
      const offers = await f.app.availability(lid, true),
        slot = offers.slots[0];
      const op = f.app.appointmentAction(
        original.id,
        'reschedule',
        { key: 'cancelled-move', offerId: slot.id },
        f.actor
      );
      if (reason === 'pause') f.app.control(lid, 'pause', {}, f.actor);
      else f.app.postMessage(lid, reason === 'stop' ? 'STOP' : 'Thank you', id());
      assert.equal(f.app.operationStatus(op.id).state, 'cancelled');
      const reservations = f.store.all(
        'SELECT operation_key,state FROM reservations WHERE appointment_id=?',
        original.id
      );
      assert.equal(
        reservations.find((r) => r.operation_key === original.operation_key).state,
        'confirmed'
      );
      assert.equal(
        reservations.find((r) => r.operation_key !== original.operation_key).state,
        'released'
      );
      await f.app.tick();
      assert.deepEqual(f.store.get('SELECT * FROM appointments WHERE id=?', original.id), original);
      assert.equal((await f.app.calendar.get(original.external_id)).start, original.start_at);
      const other = await f.lead(),
        available = await f.app.availability(other);
      assert.ok(available.slots.some((s) => s.start === slot.start));
    } finally {
      f.close();
    }
  }
});

test('verified visitors recover human-owned or paused chats without restarting outreach', async () => {
  for (const mode of ['human', 'paused']) {
    const f = fixture();
    try {
      const lid = await f.lead(null),
        lead = f.app.lead(lid);
      const previous = f.app.auth.exchange(f.app.auth.issue('chat', lid, lead.contact_id));
      f.app.auth.logout(previous.raw);
      if (mode === 'human') f.app.handoff(lid, 'human_requested');
      else f.app.control(lid, 'pause', {}, f.actor);
      f.app.requestAccess(lead.email);
      // Control changes after enqueue must not cancel an explicitly requested access link.
      if (mode === 'human') f.app.manualMessage(lid, 'Our team is here.', id(), f.actor);
      else f.app.control(lid, 'pause', {}, f.actor);
      const before = f.app.lead(lid);
      await f.app.tick();
      const mail = f.store.get('SELECT * FROM outbox WHERE lead_id=?', lid);
      assert.ok(mail);
      const payload = decrypt(mail.payload, f.app.c.key);
      const link = payload.text.match(/Continue your conversation: (\S+)/)[1];
      const raw = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
      const session = f.app.auth.exchange(raw);
      assert.equal(f.app.auth.visitor(session.raw).subject_id, lid);
      assert.throws(() => f.app.auth.exchange(raw));
      assert.deepEqual(f.app.lead(lid), before);
      assert.equal(
        f.store.get(
          "SELECT count(*) AS n FROM actions WHERE lead_id=? AND kind='followup' AND state='pending'",
          lid
        ).n,
        0
      );
    } finally {
      f.close();
    }
  }
});

test('access recovery keeps email verification and STOP restrictions', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(null),
      lead = f.app.lead(lid);
    const unverified = f.app.requestAccess(lead.email);
    assert.deepEqual(f.app.requestAccess('missing@example.test'), unverified);
    assert.equal(f.store.get("SELECT count(*) AS n FROM operations WHERE kind='access'").n, 0);
    f.app.auth.exchange(f.app.auth.issue('chat', lid, lead.contact_id));
    f.app.requestAccess(lead.email);
    const op = f.store.get("SELECT * FROM operations WHERE kind='access'");
    assert.ok(op);
    f.app.postMessage(lid, 'STOP', id());
    assert.equal(f.app.operationStatus(op.id).state, 'cancelled');
    assert.deepEqual(f.app.requestAccess(lead.email), unverified);
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 0);
    assert.equal(f.store.get("SELECT count(*) AS n FROM operations WHERE kind='access'").n, 1);
    assert.equal(f.app.lead(lid).opt_out, 1);
  } finally {
    f.close();
  }
});

test('audit events use the injected clock', async () => {
  const f = fixture();
  try {
    const { lid } = await booking(f);
    await f.app.tick();
    const a = f.store.get('SELECT * FROM appointments WHERE lead_id=?', lid),
      offers = await f.app.availability(lid, true);
    f.app.appointmentAction(
      a.id,
      'reschedule',
      { key: 'move', offerId: offers.slots[0].id },
      f.actor
    );
    await f.app.tick();
    f.app.addNote(lid, 'Clock check', f.actor);
    const unknown = f.app.operation('invitation', lid, 'clock-unknown', { email: {} });
    f.store.run("UPDATE operations SET state='unknown' WHERE id=?", unknown.id);
    await f.app.reconcile(unknown.id);
    const failing = await f.lead(null);
    f.app.turn = async () => {
      throw new Error('boom');
    };
    f.app.postMessage(failing, 'Hello', id());
    await f.app.tick();
    const action = f.store.get("SELECT id FROM actions WHERE state='failed'");
    f.app.retry(action.id, f.actor);
    const late = f.store.all('SELECT action FROM audit_events WHERE created_at>?', f.clock());
    assert.deepEqual(late, []);
  } finally {
    f.close();
  }
});
test('access delivery can retry and reconcile while automation stays paused', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(null),
      lead = f.app.lead(lid);
    f.app.auth.exchange(f.app.auth.issue('chat', lid, lead.contact_id));
    f.app.control(lid, 'pause', {}, f.actor);
    const before = f.app.lead(lid),
      send = f.app.email.send.bind(f.app.email);
    f.app.email.send = async () => {
      throw new AppError('email_http_429', 'Try later', 502);
    };
    f.app.requestAccess(lead.email);
    await f.app.tick();
    const action = f.store.get(
      "SELECT a.* FROM actions a JOIN operations o ON o.id=a.operation_id WHERE o.kind='access'"
    );
    assert.equal(action.state, 'failed');
    f.app.email.send = send;
    f.app.email.failAfterSend = true;
    f.app.retry(action.id, f.actor);
    await f.app.tick();
    assert.equal(f.app.operationStatus(action.operation_id).state, 'unknown');
    assert.deepEqual(f.app.lead(lid), before);
    // Exercise Resend's replay path using the idempotent mock sender, without network calls.
    f.app.email.name = 'resend';
    f.app.email.get = async () => null;
    await f.app.reconcile(action.operation_id);
    assert.equal(f.app.operationStatus(action.operation_id).state, 'confirmed');
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
    assert.deepEqual(f.app.lead(lid), before);
  } finally {
    f.close();
  }
});
test('the worker deletes expired sessions, links and offers', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(),
      lead = f.app.lead(lid);
    await f.app.availability(lid);
    f.app.auth.create('visitor', lid);
    f.app.auth.issue('unsubscribe', lid, lead.contact_id);
    f.advance(91 * 86400000);
    const live = f.app.auth.create('visitor', lid);
    await f.app.tick();
    // The same tick may send follow-ups that issue fresh links, so count only expired rows.
    const expired = (table, column = 'expires_at') =>
      f.store.get(`SELECT count(*) AS n FROM ${table} WHERE ${column}<=?`, f.clock()).n;
    assert.equal(expired('slot_offers'), 0);
    assert.equal(expired('access_tokens'), 0);
    assert.equal(f.store.get('SELECT count(*) AS n FROM sessions').n, 1);
    assert.ok(f.app.auth.get(live.raw, 'visitor'));
  } finally {
    f.close();
  }
});
