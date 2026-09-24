import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDraft, writeDraft } from '../web/lib/drafts.ts';
import { listPath, readListState } from '../web/lib/list-state.ts';
import { messageDay, sameMessageGroup } from '../web/lib/format.ts';
import { diffLeadFields } from '../web/lib/lead-fields.ts';
import { readSettingsTab, readScoring, changed } from '../web/lib/settings-form.ts';

test('drafts survive navigation, isolate users and conversations, and tolerate blocked storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const saved = new Map([['leadloom-draft:staff:one:restored', 'Before reload']]);
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key)
    }
  });
  try {
    assert.equal(readDraft('staff:one:restored'), 'Before reload');
    assert.equal(writeDraft('staff:one:lead-a', 'Unsent reply'), true);
    assert.equal(readDraft('staff:one:lead-a'), 'Unsent reply');
    assert.equal(saved.get('leadloom-draft:staff:one:lead-a'), 'Unsent reply');
    assert.equal(readDraft('staff:one:lead-b'), '');
    assert.equal(readDraft('staff:two:lead-a'), '');
    writeDraft('staff:one:lead-a', '');
    assert.equal(readDraft('staff:one:lead-a'), '');
    assert.equal(saved.has('leadloom-draft:staff:one:lead-a'), false);
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked');
      }
    });
    assert.equal(readDraft('staff:one:blocked'), '');
    assert.equal(writeDraft('staff:one:blocked', 'Keep while navigating'), false);
    assert.equal(readDraft('staff:one:blocked'), 'Keep while navigating');
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});

test('list URLs restore selection and filters, encoding search and rejecting invalid parameters', () => {
  const state = { search: 'John & Jane + 東京', filter: 'attention', page: 3, leadId: 'lead-123' };
  const path = listPath('/', state);
  assert.deepEqual(readListState(path.slice(1)), state);
  assert.deepEqual(readListState('?filter=unknown&page=-1&lead=../admin'), {
    search: '',
    filter: 'all',
    page: 1,
    leadId: ''
  });
  assert.equal(readListState('?page=Infinity').page, 1);
  assert.equal(readListState('?q=' + 'a'.repeat(201)).search.length, 200);
  assert.equal(listPath('/leads', readListState('')), '/leads');
});

test('message groups break at midnight, author changes, system events and long pauses', () => {
  const now = new Date(2026, 8, 14, 0, 2).getTime();
  assert.equal(messageDay(now, now), 'Today');
  assert.equal(messageDay(new Date(2026, 8, 13, 23, 59).getTime(), now), 'Yesterday');
  assert.equal(messageDay(new Date(2026, 8, 12, 12).getTime(), now), '12 September 2026');
  const message = { id: 'a', author: 'AI', body: 'Hello', created_at: now };
  assert.equal(sameMessageGroup(message, { ...message, id: 'b', created_at: now + 60_000 }), true);
  assert.equal(sameMessageGroup(message, { ...message, author: 'manager' }), false);
  assert.equal(sameMessageGroup(message, { ...message, created_at: now + 300_001 }), false);
  assert.equal(sameMessageGroup({ ...message, created_at: now - 180_000 }, message), false);
  assert.equal(
    sameMessageGroup({ ...message, author: 'system' }, { ...message, author: 'system' }),
    false
  );
  assert.equal(sameMessageGroup(undefined, message), false);
});

test('the fields form sends only changed values, typed, with blanks as unknown', () => {
  const form = (values) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };
  const current = {
    service_type: 'roofing',
    location: 'Leeds',
    budget_min: 5000,
    budget_max: null,
    timeline: 3,
    decision_maker: true
  };
  const { fields, unlock } = diffLeadFields(
    current,
    form({
      service_type: 'roofing',
      location: '',
      budget_min: '5000',
      budget_max: '12000',
      timeline: '3',
      decision_maker: 'false',
      preferred_contact: '',
      unlock_budget_min: 'on'
    })
  );
  assert.deepEqual(fields, { location: null, budget_max: 12000, decision_maker: false });
  assert.deepEqual(unlock, ['budget_min']);
});

test('a settings tab reads only its own settings and reports real changes', () => {
  const saved = {
    services: ['roofing'],
    areas: ['Leeds'],
    questions: [
      { field: 'service_type', required: true, text: 'What service?' },
      { field: 'budget', required: false, text: 'Budget?' }
    ]
  };
  const data = new FormData();
  data.set('question_0', 'What service?');
  data.set('question_1', 'Your budget?');
  data.set('required_1', 'on');
  const draft = readSettingsTab('questions', data, saved);
  assert.deepEqual(Object.keys(draft), ['questions']);
  assert.deepEqual(draft.questions[1], { field: 'budget', required: true, text: 'Your budget?' });
  assert.equal(changed(draft, saved), true);
  const same = new FormData();
  same.set('question_0', 'What service?');
  same.set('question_1', 'Budget?');
  assert.equal(changed(readSettingsTab('questions', same, saved), saved), false);
});

test('scoring edits copy the published rules instead of changing them', () => {
  const base = {
    weights: { service: 30, location: 20, budget: 20, urgency: 15, authority: 15 },
    threshold: 10000,
    hot: 80,
    warm: 50
  };
  const data = new FormData();
  for (const [key, value] of Object.entries({
    ...base.weights,
    threshold: 5000,
    hot: 85,
    warm: 50
  }))
    data.set(key, String(value));
  const next = readScoring(data, base);
  assert.equal(next.threshold, 5000);
  assert.equal(next.hot, 85);
  assert.equal(base.threshold, 10000);
});
