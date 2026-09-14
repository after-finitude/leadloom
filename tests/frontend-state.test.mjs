import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDraft, writeDraft } from '../web/lib/drafts.ts';
import { listPath, readListState } from '../web/lib/list-state.ts';
import { messageDay, sameMessageGroup } from '../web/lib/format.ts';

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
