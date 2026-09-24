import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The store is a Svelte module; plain objects stand in for runes and browser globals.
globalThis.$state = (value) => value;
globalThis.location = { pathname: '/', search: '', hash: '', assign: mock.fn() };
globalThis.history = { state: null, pushState() {}, replaceState() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { hidden: false };
globalThis.innerWidth = 1200;
const { ui, loadLeads, start } = await import('../web/lib/workspace.svelte.ts');

const list = {
  items: [{ id: 'kept' }],
  total: 1,
  page: 1,
  pageSize: 50,
  stats: { total: 1, open: 1, ai: 1, attention: 0, booked: 0 }
};
function serve(routes) {
  globalThis.fetch = async (url) => {
    const path = String(url)
      .replace(/^\/api/, '')
      .split('?')[0];
    const [status, body] = routes(path);
    return { ok: status < 400, status, json: async () => body };
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a missing selected lead keeps the list and clears the selection', async () => {
  serve((path) =>
    path === '/leads' ? [200, list] : [404, { error: 'lead_not_found', message: 'Lead not found' }]
  );
  Object.assign(ui, { route: '/', leadId: 'gone', profile: null });
  await loadLeads();
  assert.deepEqual(
    ui.leads.map((lead) => lead.id),
    ['kept']
  );
  assert.equal(ui.leadId, '');
  assert.equal(ui.profile, null);
});

test('a late response for an older list request is discarded', async () => {
  const pending = [];
  globalThis.fetch = (url) =>
    new Promise((resolve) => {
      const q = new URL(String(url), 'http://x').searchParams.get('q');
      pending.push(() =>
        resolve({
          ok: true,
          status: 200,
          json: async () => ({ ...list, items: [{ id: q }] })
        })
      );
    });
  Object.assign(ui, { route: '/leads', leadId: '', search: '' });
  const older = loadLeads({ search: 'older' }),
    newer = loadLeads({ search: 'newer' });
  pending[1]();
  await newer;
  pending[0]();
  await older;
  assert.equal(ui.search, 'newer');
  assert.deepEqual(
    ui.leads.map((lead) => lead.id),
    ['newer']
  );
  assert.equal(ui.loading, false);
});

test('a failed list request keeps the current page, filter and search', async () => {
  serve(() => [500, { error: 'internal_error', message: 'Server failed' }]);
  Object.assign(ui, { route: '/leads', page: 2, filter: 'ai', search: 'kept' });
  await assert.rejects(loadLeads({ page: 3, filter: 'human', search: 'lost' }), /Server failed/);
  assert.equal(ui.page, 2);
  assert.equal(ui.filter, 'ai');
  assert.equal(ui.search, 'kept');
  assert.equal(ui.loading, false);
});

test('polling sends staff to sign in when the session expires', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const user = { id: 'u', email: 'a@example.test', name: 'A', role: 'admin' };
  serve((path) =>
    path === '/meta'
      ? [200, { demo: true, services: [], providers: {} }]
      : path === '/me'
        ? [200, { user, csrf: 'c' }]
        : path === '/leads'
          ? [200, { ...list, items: [] }]
          : [404, { error: 'not_found' }]
  );
  Object.assign(ui, { leadId: '', ready: false });
  const stop = start();
  try {
    while (!ui.ready) await settle();
    serve(() => [401, { error: 'unauthorized', message: 'Please sign in' }]);
    mock.timers.tick(3000);
    for (let i = 0; i < 10; i++) await settle();
    assert.deepEqual(globalThis.location.assign.mock.calls.at(-1)?.arguments, ['/login']);
  } finally {
    stop();
    mock.timers.reset();
  }
});
