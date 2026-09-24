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
