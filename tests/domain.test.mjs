import test from 'node:test';
import assert from 'node:assert/strict';
import { email, phone, isStop, id, encrypt, decrypt } from '../src/util.mjs';
import { scoreLead, validateRules, validateSettings, mayReschedule } from '../src/rules.mts';
import { DEFAULT_SETTINGS, newRules } from '../src/defaults.mts';
import { availableSlots, working, nextWorking, overlaps, localParts } from '../src/time.mts';
import { fixture, HOT } from './helpers.mjs';
const rules = newRules(DEFAULT_SETTINGS),
  hot = {
    service_type: 'roofing',
    location: 'Demo City A',
    budget_min: 20000,
    budget_max: 20000,
    timeline: 2,
    decision_maker: true
  };
test('contact normalization preserves distinct plus and dotted addresses', () => {
  assert.equal(email('Test.Name+work@EXAMPLE.test'), 'test.name+work@example.test');
  assert.notEqual(email('a.b@test.com'), email('ab@test.com'));
  assert.equal(phone('+1 (415) 555-0100'), '+14155550100');
  assert.throws(() => phone('4155550100'));
});
test('STOP recognizes explicit refusal, not a substring in a project description', () => {
  assert.ok(isStop('STOP!'));
  assert.ok(isStop("Don't contact me again"));
  assert.ok(!isStop('Please stop the roof leak'));
  assert.ok(!isStop('nonstop work'));
});
test('scoring is deterministic and explains all five factors', () => {
  const s = scoreLead(hot, rules);
  assert.equal(s.score, 100);
  assert.equal(s.category, 'Hot');
  assert.equal(s.reasons.length, 5);
  assert.equal(
    s.reasons.reduce((n, r) => n + r.points, 0),
    100
  );
});
test('unknown and explicitly negative authority are distinct reasons', () => {
  const a = scoreLead({ ...hot, decision_maker: null }, rules),
    b = scoreLead({ ...hot, decision_maker: false }, rules);
  assert.equal(a.score, b.score);
  assert.notEqual(a.reasons[4].reason, b.reasons[4].reason);
});
test('unknown budget can produce Warm, not invented budget', () => {
  const s = scoreLead({ ...hot, budget_min: null, budget_max: null }, rules);
  assert.equal(s.score, 75);
  assert.equal(s.category, 'Warm');
  assert.equal(s.reasons[2].value, null);
});
test('hard reject defeats a high score', () => {
  const s = scoreLead({ ...hot, location: 'Outside City' }, rules);
  assert.equal(s.score, 75);
  assert.equal(s.category, 'Unqualified');
});
test('budget intervals use conservative lower bound', () => {
  assert.equal(
    scoreLead({ ...hot, budget_min: 5000, budget_max: 15000 }, rules).reasons[2].points,
    10
  );
  assert.equal(
    scoreLead({ ...hot, budget_min: 20000, budget_max: null }, rules).reasons[2].points,
    25
  );
});
test('overlapping buffers are not summed', () => {
  assert.ok(!overlaps({ start: 0, end: 30 }, { start: 45, end: 75 }, 15));
  assert.ok(overlaps({ start: 0, end: 30 }, { start: 44, end: 74 }, 15));
});
test('business hours and weekend deferral', () => {
  const s = DEFAULT_SETTINGS;
  assert.equal(working(Date.parse('2026-09-11T18:00:00Z'), s), false);
  assert.equal(
    new Date(nextWorking(Date.parse('2026-09-11T19:00:00Z'), s)).toISOString(),
    '2026-09-14T09:00:00.000Z'
  );
});
test('slot generation fits the whole appointment into working hours', () => {
  const s = { ...DEFAULT_SETTINGS, minimumNotice: 0 };
  const slots = availableSlots(Date.parse('2026-09-10T17:45:00Z'), s, [], 3);
  assert.ok(slots.length === 3);
  assert.equal(new Date(slots[0].start).toISOString(), '2026-09-11T09:00:00.000Z');
});
test('DST fall-back does not duplicate UTC instants and preserves offsets', () => {
  const s = {
    ...DEFAULT_SETTINGS,
    timezone: 'America/New_York',
    minimumNotice: 0,
    hours: { days: [0], start: '01:00', end: '03:00' }
  };
  const slots = availableSlots(Date.parse('2026-11-01T04:00:00Z'), s, [], 12);
  assert.equal(new Set(slots.map((x) => x.start)).size, slots.length);
  assert.ok(slots.every((x) => working(x.start, s, 1800000)));
  assert.equal(localParts(Date.parse('2026-11-01T05:00:00Z'), s.timezone).minute, 60);
  assert.equal(localParts(Date.parse('2026-11-01T06:00:00Z'), s.timezone).minute, 60);
});
test('invalid configuration and scoring weights are rejected', () => {
  assert.throws(() => validateRules({ ...rules, weights: { ...rules.weights, service: 100 } }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, timezone: 'Not/AZone' }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, questions: [] }));
});
test('encrypted payload is authenticated and not plaintext', () => {
  const key = 'a'.repeat(64),
    cipher = encrypt({ token: 'secret-value' }, key);
  assert.ok(!cipher.includes('secret-value'));
  assert.deepEqual(decrypt(cipher, key), { token: 'secret-value' });
  assert.throws(() => decrypt(cipher, 'b'.repeat(64)));
});
test('three identical intake deliveries create one lead, contact and first message', () => {
  const f = fixture();
  try {
    const p = { event_key: 'same', name: 'A', email: 'a@test.com' },
      a = f.app.intake(p, { web: false }),
      b = f.app.intake(p, { web: false }),
      c = f.app.intake(p, { web: false });
    assert.equal(a.leadId, b.leadId);
    assert.equal(b.leadId, c.leadId);
    assert.equal(f.store.get('SELECT count(*) AS n FROM leads').n, 1);
    assert.equal(f.store.get('SELECT count(*) AS n FROM contacts').n, 1);
    assert.equal(f.store.get("SELECT count(*) AS n FROM operations WHERE kind='invitation'").n, 1);
    assert.throws(
      () => f.app.intake({ ...p, name: 'B' }, { web: false }),
      (e) => e.code === 'idempotency_conflict'
    );
  } finally {
    f.close();
  }
});
test('invalid authorized intake remains rejected without creating a contact', () => {
  const f = fixture();
  try {
    const r = f.app.intake({ event_key: 'invalid', email: 'bad' }, { web: false });
    assert.equal(r.status, 'rejected');
    assert.equal(f.store.get('SELECT count(*) AS n FROM contacts').n, 0);
    assert.equal(f.app.intake(null, { web: false }).status, 'rejected');
  } finally {
    f.close();
  }
});
test('phone-only webhook goes to a human, with no fictitious first response', () => {
  const f = fixture();
  try {
    const r = f.app.intake({ event_key: 'phone', phone: '+14155550100' }, { web: false }),
      l = f.app.lead(r.leadId);
    assert.equal(l.owner, 'HUMAN');
    assert.equal(l.review_reason, 'no_automated_channel');
    assert.equal(l.first_contact_status, 'not_applicable');
    assert.equal(l.first_contact_at, null);
  } finally {
    f.close();
  }
});
test('deduplication does not authorize a new browser to old history', () => {
  const f = fixture();
  try {
    const a = f.app.intake({ event_key: 'first', email: 'private@test.com' }, { web: true });
    assert.ok(a.session);
    const b = f.app.intake({ event_key: 'second', email: 'private@test.com' }, { web: true });
    assert.equal(b.status, 'access_required');
    assert.equal(b.session, undefined);
    assert.equal(b.leadId, undefined);
  } finally {
    f.close();
  }
});
test('conflicting email and phone are not silently merged', () => {
  const f = fixture();
  try {
    f.app.intake({ event_key: 'a', email: 'a@test.com', phone: '+14155550101' }, { web: false });
    f.app.intake({ event_key: 'b', email: 'b@test.com', phone: '+14155550102' }, { web: false });
    const r = f.app.intake(
      { event_key: 'c', email: 'a@test.com', phone: '+14155550102' },
      { web: false }
    );
    assert.equal(r.status, 'needs_resolution');
    assert.equal(f.store.get('SELECT count(*) AS n FROM contacts').n, 2);
  } finally {
    f.close();
  }
});
test('new enquiry after closing a deal preserves the Contact', async () => {
  const f = fixture();
  try {
    const first = await f.lead(null, { email: 'repeat@test.com' });
    f.app.control(first, 'stage', { stage: 'Lost', reason: 'Synthetic test' }, f.actor);
    const r = f.app.intake({ event_key: 'repeat', email: 'repeat@test.com' }, { web: false });
    assert.notEqual(r.leadId, first);
    assert.equal(f.app.lead(r.leadId).contact_id, f.app.lead(first).contact_id);
  } finally {
    f.close();
  }
});
test('service-specific policy allows different services for one contact', () => {
  const f = fixture();
  try {
    f.app.updateSettings(
      { ...f.app.settings(), deduplication: 'one_active_per_contact_service' },
      f.actor.id
    );
    const a = f.app.intake(
        { event_key: 'one', email: 'many@test.com', service_type: 'roofing' },
        { web: false }
      ),
      b = f.app.intake(
        { event_key: 'two', email: 'many@test.com', service_type: 'extensions' },
        { web: false }
      );
    assert.notEqual(a.leadId, b.leadId);
    const c = f.app.intake({ event_key: 'three', email: 'many@test.com' }, { web: false });
    assert.equal(c.status, 'needs_resolution');
  } finally {
    f.close();
  }
});
test('multi-field answer becomes a complete qualified lead with one reply', async () => {
  const f = fixture();
  try {
    const lid = await f.lead();
    const l = f.app.lead(lid);
    assert.equal(l.category, 'Hot');
    assert.equal(l.qualification, 'complete');
    assert.equal(l.fields.budget_min, 20000);
    assert.equal(l.score, 100);
    assert.equal(l.stage, 'Qualified');
    assert.equal(f.app.publicState(lid).can_book, true);
  } finally {
    f.close();
  }
});
test('unknown critical field hands off after exactly two clarifications', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(null);
    for (let i = 0; i < 3; i++) {
      f.app.postMessage(lid, "I don't know", `m${i}`);
      await f.app.tick();
    }
    assert.equal(f.app.lead(lid).owner, 'HUMAN');
    assert.equal(f.app.lead(lid).asked.service_type, 3);
    assert.equal(f.app.lead(lid).review_reason, 'required_service_type_unknown');
  } finally {
    f.close();
  }
});
test('optional explicit unknown budget remains null and qualification proceeds', async () => {
  const f = fixture();
  try {
    const lid = await f.lead('Roofing in Demo City A.');
    f.app.postMessage(lid, "I don't know", id());
    await f.app.tick();
    const l = f.app.lead(lid);
    assert.equal(l.fields.budget_min, null);
    assert.equal(l.fields.budget_max, null);
    assert.ok(l.skipped.includes('budget'));
    assert.equal(l.current_field, 'timeline');
  } finally {
    f.close();
  }
});
test('manual field lock keeps value and records a conflicting proposal', async () => {
  const f = fixture();
  try {
    const lid = await f.lead();
    f.app.editFields(
      lid,
      { fields: { budget_min: 50000, budget_max: 50000 }, locked: true },
      f.actor
    );
    f.app.postMessage(lid, 'Correction, budget $10000.', id());
    await f.app.tick();
    assert.equal(f.app.lead(lid).fields.budget_min, 50000);
    assert.equal(f.app.lead(lid).owner, 'HUMAN');
    assert.ok(f.store.get('SELECT count(*) AS n FROM field_revisions WHERE proposed=1').n >= 1);
  } finally {
    f.close();
  }
});
test('later correction updates an unlocked field and preserves history', async () => {
  const f = fixture();
  try {
    const lid = await f.lead();
    f.app.postMessage(lid, 'Correction, budget $30000.', id());
    await f.app.tick();
    assert.equal(f.app.lead(lid).fields.budget_min, 30000);
    assert.ok(
      f.store.get("SELECT count(*) AS n FROM field_revisions WHERE field='budget_min'").n >= 2
    );
  } finally {
    f.close();
  }
});
test('STOP is contact-wide and neither Resume nor new intake restores it', async () => {
  const f = fixture();
  try {
    const lid = await f.lead();
    f.app.postMessage(lid, 'STOP', id());
    f.app.control(lid, 'resume', {}, f.actor);
    const l = f.app.lead(lid);
    assert.equal(l.opt_out, 1);
    f.app.intake({ event_key: 'again', email: l.email }, { web: false });
    assert.equal(f.app.lead(lid).opt_out, 1);
    assert.equal(f.store.get("SELECT count(*) AS n FROM actions WHERE state='pending'").n, 0);
    assert.throws(
      () => f.app.manualMessage(lid, 'Bypass', id(), f.actor),
      (e) => e.code === 'opt_out'
    );
  } finally {
    f.close();
  }
});
test('human takeover wins against an in-flight LLM response', async () => {
  let release;
  const f = fixture({
    providers: {
      llm: {
        name: 'mock',
        extract: () =>
          new Promise((r) => {
            release = r;
          })
      }
    }
  });
  try {
    const lid = await f.lead(null);
    f.app.postMessage(lid, 'roofing', id());
    const turn = f.app.turn(lid);
    await new Promise((r) => setImmediate(r));
    f.app.control(lid, 'takeover', {}, f.actor);
    release({
      updates: [{ field: 'service_type', value: 'roofing', evidence: 'roofing' }],
      unknown: [],
      handoff: null,
      faq_id: null
    });
    await turn;
    assert.equal(f.app.lead(lid).owner, 'HUMAN');
    assert.equal(f.app.lead(lid).fields.service_type, undefined);
    assert.equal(f.store.get("SELECT count(*) AS n FROM messages WHERE author='AI'").n, 1);
  } finally {
    f.close();
  }
});
test('reply after handoff never returns ownership to AI', async () => {
  const f = fixture();
  try {
    const lid = await f.lead('Please get a human.');
    f.app.postMessage(lid, HOT, id());
    await f.app.tick();
    assert.equal(f.app.lead(lid).owner, 'HUMAN');
    assert.equal(f.app.lead(lid).score, 0);
  } finally {
    f.close();
  }
});
test('new rules do not retroactively change a pinned lead', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(),
      before = f.app.lead(lid).rule_id;
    f.app.publishRules(
      { ...f.app.rules().data, hot: 100, warm: 90, threshold: 100000 },
      f.actor.id
    );
    f.app.postMessage(lid, 'Budget $25000.', id());
    await f.app.tick();
    assert.equal(f.app.lead(lid).rule_id, before);
    assert.equal(f.app.lead(lid).score, 100);
    f.app.control(lid, 'recalculate', {}, f.actor);
    assert.notEqual(f.app.lead(lid).rule_id, before);
    assert.equal(f.app.lead(lid).category, 'Nurture');
  } finally {
    f.close();
  }
});
test('audit events and rule versions cannot be updated or deleted', () => {
  const f = fixture();
  try {
    assert.throws(() => f.store.run("UPDATE audit_events SET action='tampered'"));
    assert.throws(() => f.store.run('DELETE FROM audit_events'));
    assert.throws(() => f.store.run("UPDATE rule_versions SET data='{}'"));
  } finally {
    f.close();
  }
});
test('visitor response excludes score, contact identifiers and internal notes', async () => {
  const f = fixture();
  try {
    const lid = await f.lead();
    f.app.addNote(lid, 'Private secret note', f.actor);
    const pub = f.app.publicState(lid),
      raw = JSON.stringify(pub);
    for (const key of ['score', 'reasons', 'contact_id', 'review_reason', 'fields', 'notes'])
      assert.equal(pub[key], undefined);
    assert.ok(!raw.includes('Private secret note'));
  } finally {
    f.close();
  }
});
test('chat link is scoped, single-use and separate from unsubscribe', async () => {
  const f = fixture();
  try {
    const lid = await f.lead(),
      contact = f.app.lead(lid).contact_id;
    const access = f.app.auth.issue('chat', lid, contact),
      unsub = f.app.auth.issue('unsubscribe', lid, contact);
    assert.throws(() => f.app.auth.exchange(unsub));
    const session = f.app.auth.exchange(access);
    assert.equal(session.leadId, lid);
    assert.throws(() => f.app.auth.exchange(access));
    assert.throws(() => f.app.auth.unsubscribeToken(access));
    assert.equal(f.app.auth.unsubscribeToken(unsub).contact_id, contact);
    const expired = f.app.auth.issue('chat', lid, contact);
    f.advance(86400001);
    assert.throws(() => f.app.auth.exchange(expired));
  } finally {
    f.close();
  }
});
test('staff reschedule needs a fitting Hot or Warm lead, not AI ownership', () => {
  const booked = { category: 'Hot', fields: { ...hot, location: ' demo city a ' } };
  assert.equal(mayReschedule(booked, DEFAULT_SETTINGS), true);
  assert.equal(mayReschedule({ ...booked, category: 'Nurture' }, DEFAULT_SETTINGS), false);
  assert.equal(
    mayReschedule({ ...booked, fields: { ...hot, location: 'Elsewhere' } }, DEFAULT_SETTINGS),
    false
  );
  assert.equal(
    mayReschedule({ ...booked, fields: { ...hot, service_type: 'pools' } }, DEFAULT_SETTINGS),
    false
  );
});
