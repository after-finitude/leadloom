import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHttp } from '../src/http.mjs';
import { fixture } from './helpers.mjs';
import { hash } from '../src/util.mjs';
import { config } from '../src/config.mjs';
async function webFixture(options = {}) {
  const f = fixture(options);
  const server = createHttp(f.app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  f.app.c.origin = base;
  return {
    ...f,
    server,
    base,
    async stop() {
      await new Promise((r) => server.close(r));
      f.close();
    },
    async request(path, { method = 'GET', body, cookie, csrf, origin = base, headers = {} } = {}) {
      return fetch(base + path, {
        method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }
  };
}
async function login(f, role = 'admin') {
  const r = await f.request('/api/auth/login', {
    method: 'POST',
    body: {
      email: role === 'admin' ? f.app.c.adminEmail : f.app.c.managerEmail,
      password: role === 'admin' ? f.app.c.adminPassword : f.app.c.managerPassword
    }
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  return { cookie: r.headers.get('set-cookie').split(';')[0], csrf: data.csrf };
}
test('HTTP form creates an HttpOnly visitor session and a private chat', async () => {
  const f = await webFixture();
  try {
    const r = await f.request('/api/public/intake', {
      method: 'POST',
      body: { event_key: 'api-one', email: 'api@example.test', name: 'API Visitor' }
    });
    assert.equal(r.status, 201);
    assert.match(r.headers.get('set-cookie'), /HttpOnly/);
    const cookie = r.headers.get('set-cookie').split(';')[0],
      chat = await f.request('/api/public/chat', { cookie }),
      body = await chat.json();
    assert.equal(chat.status, 200);
    assert.ok(body.messages.length);
    assert.equal(body.score, undefined);
    const admin = await f.request('/api/leads', { cookie });
    assert.equal(admin.status, 401);
  } finally {
    await f.stop();
  }
});
test('API rejects cross-origin writes, missing CSRF and forged public fields', async () => {
  const f = await webFixture();
  try {
    let r = await f.request('/api/public/intake', {
      method: 'POST',
      origin: 'https://attacker.invalid',
      body: { event_key: 'bad', email: 'bad@test.com' }
    });
    assert.equal(r.status, 403);
    r = await f.request('/api/public/intake', {
      method: 'POST',
      body: { event_key: 'good', email: 'good@test.com' }
    });
    const cookie = r.headers.get('set-cookie').split(';')[0],
      data = await r.json();
    r = await f.request('/api/public/chat/messages', {
      method: 'POST',
      cookie,
      body: { body: 'Hello', key: 'one' }
    });
    assert.equal(r.status, 403);
    r = await f.request('/api/public/chat/messages', {
      method: 'POST',
      cookie,
      csrf: data.csrf,
      body: { body: 'Hello', key: 'two', score: 100, lead_id: 'other' }
    });
    assert.equal(r.status, 400);
    assert.equal(f.store.get("SELECT count(*) AS n FROM messages WHERE author='lead'").n, 0);
  } finally {
    await f.stop();
  }
});
test('manager role cannot edit settings or restore contact consent', async () => {
  const f = await webFixture();
  try {
    const auth = await login(f, 'manager');
    let r = await f.request('/api/settings', { method: 'PUT', body: f.app.settings(), ...auth });
    assert.equal(r.status, 403);
    const lid = await f.lead();
    f.app.stop(f.app.lead(lid).contact_id);
    r = await f.request(`/api/leads/${lid}/restore-consent`, {
      method: 'POST',
      body: { reason: 'Not authorized', confirmed: true },
      ...auth
    });
    assert.equal(r.status, 403);
    assert.equal(f.app.lead(lid).opt_out, 1);
  } finally {
    await f.stop();
  }
});
test('staff login does not bypass CSRF and logout revokes the session', async () => {
  const f = await webFixture();
  try {
    const auth = await login(f);
    assert.equal((await f.request('/api/me', auth)).status, 200);
    assert.equal(
      (await f.request('/api/auth/logout', { method: 'POST', cookie: auth.cookie, body: {} }))
        .status,
      403
    );
    assert.equal(
      (await f.request('/api/auth/logout', { method: 'POST', ...auth, body: {} })).status,
      200
    );
    assert.equal((await f.request('/api/me', auth)).status, 401);
  } finally {
    await f.stop();
  }
});
test('webhook authenticates before accepting an intake event', async () => {
  const f = await webFixture();
  try {
    const p = { source: 'ad_source', event_key: 'external-key', email: 'webhook@example.test' };
    let r = await f.request('/api/leads/intake', { method: 'POST', body: p });
    assert.equal(r.status, 401);
    assert.equal(f.store.get('SELECT count(*) AS n FROM intake_events').n, 0);
    r = await f.request('/api/leads/intake', {
      method: 'POST',
      body: p,
      headers: { Authorization: `Bearer ${f.app.c.webhookSecret}` }
    });
    assert.equal(r.status, 200);
    await f.app.tick();
    assert.equal(f.store.get('SELECT count(*) AS n FROM outbox').n, 1);
  } finally {
    await f.stop();
  }
});
test('GET chat preview cannot consume an access token', async () => {
  const f = await webFixture();
  try {
    const lid = await f.lead(null),
      raw = f.app.auth.issue('chat', lid, f.app.lead(lid).contact_id);
    const r = await f.request('/chat');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.ok(f.app.auth.exchange(raw));
  } finally {
    await f.stop();
  }
});
test('server does not serve source files, database files or environment secrets', async () => {
  const f = await webFixture();
  try {
    for (const path of [
      '/.env',
      '/src/config.mjs',
      '/data/leadloom.sqlite',
      '/assets/../../../etc/passwd'
    ])
      assert.equal((await f.request(path)).status, 404);
    const health = await (await f.request('/api/health')).json();
    assert.equal(health.ok, true);
    assert.equal(health.key, undefined);
  } finally {
    await f.stop();
  }
});

test('lead pages and search cover more than 300 records with global counters', async () => {
  const f = await webFixture();
  try {
    const auth = await login(f),
      ids = [];
    for (let i = 0; i < 305; i++) {
      f.advance(1);
      ids.push(
        f.app.intake(
          {
            event_key: `page-${i}`,
            name: i === 0 ? "Older O'Hara%_" : `Lead ${i}`,
            email: `page-${i}@example.test`
          },
          { web: true }
        ).leadId
      );
    }
    const first = await (await f.request('/api/leads?pageSize=100', auth)).json();
    assert.equal(first.total, 305);
    assert.equal(first.items.length, 100);
    assert.deepEqual(first.stats, { total: 305, open: 305, ai: 305, attention: 0, booked: 0 });
    assert.ok(!first.items.some((l) => l.id === ids[0]));
    const pages = [first];
    for (let page = 2; page <= 4; page++)
      pages.push(await (await f.request(`/api/leads?pageSize=100&page=${page}`, auth)).json());
    assert.equal(pages[3].items.length, 5);
    assert.equal(new Set(pages.flatMap((p) => p.items.map((l) => l.id))).size, 305);
    const query = new URLSearchParams({ q: "o'HARA%_" });
    const found = await (await f.request('/api/conversations?' + query, auth)).json();
    assert.deepEqual(
      found.items.map((l) => l.id),
      [ids[0]]
    );
    f.app.handoff(ids[0], 'human_requested');
    f.app.control(ids[304], 'stage', { stage: 'Won' }, f.actor);
    const filtered = await (await f.request('/api/leads?filter=attention&page=999', auth)).json();
    assert.equal(filtered.page, 1);
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].id, ids[0]);
    assert.deepEqual(filtered.stats, { total: 305, open: 304, ai: 303, attention: 1, booked: 0 });
    const empty = await (await f.request('/api/leads?q=no-such-name', auth)).json();
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.items, []);
    assert.deepEqual(empty.stats, filtered.stats);
  } finally {
    await f.stop();
  }
});

test('lead list rejects invalid pagination and unknown filters', async () => {
  const f = await webFixture();
  try {
    const auth = await login(f);
    for (const query of [
      'page=0',
      'page=1.5',
      'page=no',
      'pageSize=0',
      'pageSize=101',
      'filter=constructor',
      'unexpected=1',
      'q=' + 'x'.repeat(201)
    ]) {
      assert.equal((await f.request('/api/leads?' + query, auth)).status, 400, query);
    }
  } finally {
    await f.stop();
  }
});

test('untrusted sockets cannot change login limits using forwarded headers', async () => {
  const f = await webFixture({ config: { trustedProxies: [] } });
  try {
    f.store.run(
      'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,10,?)',
      `login:${hash('127.0.0.1')}`,
      f.clock() + 60000
    );
    for (const ip of ['203.0.113.5', '203.0.113.6', 'not-an-ip']) {
      const response = await f.request('/api/auth/login', {
        method: 'POST',
        body: { email: f.app.c.adminEmail, password: 'wrong' },
        headers: { 'X-Forwarded-For': ip }
      });
      assert.equal(response.status, 429);
    }
  } finally {
    await f.stop();
  }
});

test('trusted proxies use the first untrusted hop and canonical client addresses', async () => {
  const f = await webFixture({ config: { trustedProxies: ['::ffff:127.0.0.1', '10.0.0.2'] } });
  try {
    for (const ip of ['203.0.113.5', '2001:db8::1'])
      f.store.run(
        'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,10,?)',
        `login:${hash(ip)}`,
        f.clock() + 60000
      );
    for (const [forwarded, status] of [
      ['198.51.100.1, 203.0.113.5, 10.0.0.2', 429],
      ['forged-prefix, 203.0.113.5, 10.0.0.2', 429],
      ['198.51.100.1, 203.0.113.6, 10.0.0.2', 401],
      ['2001:0DB8:0:0:0:0:0:1, 10.0.0.2', 429],
      ['::ffff:cb00:7105, 10.0.0.2', 429],
      ['not-an-ip', 400]
    ]) {
      const response = await f.request('/api/auth/login', {
        method: 'POST',
        body: { email: f.app.c.adminEmail, password: 'wrong' },
        headers: { 'X-Forwarded-For': forwarded }
      });
      assert.equal(response.status, status, forwarded);
    }
    assert.throws(() => config({ trustedProxies: ['127.0.0.1/8'] }), /TRUSTED_PROXIES/);
  } finally {
    await f.stop();
  }
});

test('chat limits are per lead while unauthenticated routes retain IP limits', async () => {
  const f = await webFixture({ config: { trustedProxies: [] } });
  try {
    const one = await f.lead(null),
      two = await f.lead(null);
    const first = f.app.auth.create('visitor', one),
      second = f.app.auth.create('visitor', two),
      another = f.app.auth.create('visitor', one);
    f.store.run(
      'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,180,?)',
      `public:lead:${one}`,
      Date.now() + 60000
    );
    assert.equal(
      (await f.request('/api/public/chat', { cookie: `ll_visitor=${first.raw}` })).status,
      429
    );
    assert.equal(
      (await f.request('/api/public/chat', { cookie: `ll_visitor=${second.raw}` })).status,
      200
    );
    assert.equal(
      (await f.request('/api/public/chat', { cookie: `ll_visitor=${another.raw}` })).status,
      429
    );
    f.store.run(
      'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,180,?)',
      `public:ip:${hash('127.0.0.1')}`,
      Date.now() + 60000
    );
    assert.equal(
      (await f.request('/api/public/chat', { cookie: `ll_visitor=${second.raw}` })).status,
      200
    );
    assert.equal(
      (await f.request('/api/public/chat', { cookie: 'll_visitor=forged' })).status,
      429
    );
    assert.equal(
      (
        await f.request('/api/public/chat/request-access', {
          method: 'POST',
          cookie: `ll_visitor=${second.raw}`,
          body: { email: f.app.lead(two).email }
        })
      ).status,
      429
    );
  } finally {
    await f.stop();
  }
});
